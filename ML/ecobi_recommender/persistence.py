from __future__ import annotations

import json
from dataclasses import replace
from typing import Any

from .db import _require_module
from .models import CandidateScore, RecommendationResult


def _json_value(engine, placeholder: str) -> str:
    if engine.dialect.name == "postgresql":
        return f"CAST(:{placeholder} AS JSONB)"
    return f":{placeholder}"


def _bool_value(engine, value: bool) -> bool | int:
    return value if engine.dialect.name == "postgresql" else int(value)


def _fetch_candidate_id(conn, fingerprint: str) -> int | None:
    sqlalchemy = _require_module("sqlalchemy")
    row = conn.execute(
        sqlalchemy.text("SELECT candidate_id FROM meal_candidates WHERE candidate_fingerprint = :fingerprint"),
        {"fingerprint": fingerprint},
    ).fetchone()
    return int(row[0]) if row else None


def _insert_candidate(conn, candidate: dict[str, Any]) -> int:
    sqlalchemy = _require_module("sqlalchemy")
    row = conn.execute(
        sqlalchemy.text(
            """
            INSERT INTO meal_candidates (
              candidate_name, candidate_fingerprint, fingerprint_version, meal_type, meal_channel,
              total_price_krw, total_calories_kcal, total_protein_g, total_fat_g, total_carbs_g,
              generation_source, is_active
            )
            VALUES (
              :candidate_name, :candidate_fingerprint, :fingerprint_version, :meal_type, :meal_channel,
              :total_price_krw, :total_calories_kcal, :total_protein_g, :total_fat_g, :total_carbs_g,
              :generation_source, :is_active
            )
            RETURNING candidate_id
            """
        ),
        {
            **candidate,
            "is_active": True,
            "generation_source": candidate.get("generation_source") or "milp",
            "fingerprint_version": candidate.get("fingerprint_version") or "v1",
        },
    ).fetchone()
    if not row:
        raise RuntimeError("Failed to insert meal candidate.")
    return int(row[0])


def _insert_candidate_items(conn, old_candidate_id: int, new_candidate_id: int, candidate_items: list[dict[str, Any]]) -> None:
    sqlalchemy = _require_module("sqlalchemy")
    rows = [item for item in candidate_items if int(item["candidate_id"]) == old_candidate_id]
    for item in rows:
        conn.execute(
            sqlalchemy.text(
                """
                INSERT INTO meal_candidate_items (
                  candidate_id, food_id, quantity_g, quantity_label, quantity_bucket, item_order,
                  item_price_krw, item_calories_kcal, item_protein_g, item_fat_g, item_carbs_g
                )
                VALUES (
                  :candidate_id, :food_id, :quantity_g, :quantity_label, :quantity_bucket, :item_order,
                  :item_price_krw, :item_calories_kcal, :item_protein_g, :item_fat_g, :item_carbs_g
                )
                ON CONFLICT(candidate_id, item_order) DO NOTHING
                """
            ),
            {
                **item,
                "candidate_id": new_candidate_id,
                "quantity_bucket": item.get("quantity_bucket") or "milp",
                "item_order": item.get("item_order") or 1,
            },
        )


def _upsert_recommendation_candidate(conn, engine, run_id: int, score: CandidateScore, candidate: dict[str, Any]) -> None:
    sqlalchemy = _require_module("sqlalchemy")
    feature_snapshot_expr = _json_value(engine, "feature_snapshot")
    score_breakdown_expr = _json_value(engine, "score_breakdown")
    conn.execute(
        sqlalchemy.text(
            f"""
            INSERT INTO recommendation_candidates (
              run_id, candidate_id, milp_feasible, milp_rank, rule_score,
              lightfm_score, xgboost_probability, mmr_penalty, repeat_food_penalty,
              repeat_combo_penalty, final_score, final_rank, feature_snapshot, score_breakdown
            )
            VALUES (
              :run_id, :candidate_id, :milp_feasible, :milp_rank, :rule_score,
              :lightfm_score, :xgboost_probability, :mmr_penalty, :repeat_food_penalty,
              :repeat_combo_penalty, :final_score, :final_rank, {feature_snapshot_expr}, {score_breakdown_expr}
            )
            ON CONFLICT(run_id, candidate_id) DO UPDATE SET
              milp_feasible = excluded.milp_feasible,
              milp_rank = excluded.milp_rank,
              lightfm_score = excluded.lightfm_score,
              xgboost_probability = excluded.xgboost_probability,
              mmr_penalty = excluded.mmr_penalty,
              repeat_food_penalty = excluded.repeat_food_penalty,
              repeat_combo_penalty = excluded.repeat_combo_penalty,
              final_score = excluded.final_score,
              final_rank = excluded.final_rank,
              feature_snapshot = excluded.feature_snapshot,
              score_breakdown = excluded.score_breakdown
            """
        ),
        {
            "run_id": run_id,
            "candidate_id": score.candidate_id,
            "milp_feasible": _bool_value(engine, True),
            "milp_rank": score.final_rank,
            "rule_score": None,
            "lightfm_score": score.lightfm_score,
            "xgboost_probability": score.xgboost_probability,
            "mmr_penalty": score.mmr_penalty,
            "repeat_food_penalty": score.repeat_food_penalty,
            "repeat_combo_penalty": 0.0,
            "final_score": score.final_score,
            "final_rank": score.final_rank,
            "feature_snapshot": json.dumps(candidate, ensure_ascii=False, default=str),
            "score_breakdown": json.dumps(
                [
                    f"lightfm={score.lightfm_score:.4f}",
                    f"xgboost={score.xgboost_probability:.4f}",
                    f"intent={score.intent_bonus:.4f}",
                    f"macro_fit={score.macro_fit:.4f}",
                    f"mmr={score.mmr_penalty:.4f}",
                    f"repeat_food={score.repeat_food_penalty:.4f}",
                ],
                ensure_ascii=False,
            ),
        },
    )


def persist_recommendation_result(engine, run_id: int, result: RecommendationResult) -> RecommendationResult:
    id_map: dict[int, int] = {}
    persisted_candidates: list[dict[str, Any]] = []
    persisted_items: list[dict[str, Any]] = []

    with engine.begin() as conn:
        for candidate in result.candidates:
            old_candidate_id = int(candidate["candidate_id"])
            fingerprint = candidate["candidate_fingerprint"]
            new_candidate_id = _fetch_candidate_id(conn, fingerprint)
            if new_candidate_id is None:
                new_candidate_id = _insert_candidate(conn, candidate)
                _insert_candidate_items(conn, old_candidate_id, new_candidate_id, result.candidate_items)

            id_map[old_candidate_id] = new_candidate_id
            persisted_candidate = {**candidate, "candidate_id": new_candidate_id}
            persisted_candidates.append(persisted_candidate)
            for item in result.candidate_items:
                if int(item["candidate_id"]) == old_candidate_id:
                    persisted_items.append({**item, "candidate_id": new_candidate_id})

        remapped_scores: list[CandidateScore] = []
        candidate_by_id = {int(candidate["candidate_id"]): candidate for candidate in persisted_candidates}
        for score in result.scores:
            new_candidate_id = id_map[int(score.candidate_id)]
            remapped = replace(score, candidate_id=new_candidate_id)
            remapped_scores.append(remapped)
            _upsert_recommendation_candidate(conn, engine, run_id, remapped, candidate_by_id[new_candidate_id])

    return RecommendationResult(candidates=persisted_candidates, candidate_items=persisted_items, scores=remapped_scores)
