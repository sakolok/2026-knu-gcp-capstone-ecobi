from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .db import get_sql_connection, load_required_tables
from .models import ModelArtifacts, RecommendationRequest
from .persistence import persist_recommendation_result
from .pipeline import REQUIRED_TABLES, dumps_result, get_meal_conditions, load_model_artifacts, process_recommendation_pipeline


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Ecobi ML recommendation pipeline.")
    parser.add_argument("--run-id", type=int)
    parser.add_argument("--user-id", type=int)
    parser.add_argument("--meal-type", default="lunch")
    parser.add_argument("--meal-channel")
    parser.add_argument("--intent", default="personal", choices=["personal", "recovery", "protein", "budget"])
    parser.add_argument("--target-calories", type=float)
    parser.add_argument("--target-budget", type=int)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--model-dir", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--skip-models", action="store_true")
    parser.add_argument("--persist", action="store_true")
    return parser.parse_args(argv)


def build_request(args: argparse.Namespace, all_dfs: dict[str, object]) -> RecommendationRequest:
    if args.run_id:
        request = get_meal_conditions(args.run_id, all_dfs)
        if request is None:
            raise RuntimeError(f"recommendation_run not found: {args.run_id}")
        return RecommendationRequest(
            run_id=request.run_id,
            user_id=request.user_id,
            meal_type=request.meal_type,
            meal_channel=args.meal_channel or request.meal_channel,
            intent=args.intent if args.intent != "personal" else request.intent,
            target_meal_calories_kcal=args.target_calories or request.target_meal_calories_kcal,
            target_meal_budget_krw=args.target_budget or request.target_meal_budget_krw,
            target_meal_carbs_g=request.target_meal_carbs_g,
            target_meal_protein_g=request.target_meal_protein_g,
            target_meal_fat_g=request.target_meal_fat_g,
            remaining_carbs_g=request.remaining_carbs_g,
            remaining_protein_g=request.remaining_protein_g,
            remaining_fat_g=request.remaining_fat_g,
            limit=args.limit,
        )

    if args.user_id is None or args.target_calories is None or args.target_budget is None:
        raise RuntimeError("--user-id, --target-calories, and --target-budget are required without --run-id.")

    return RecommendationRequest(
        user_id=args.user_id,
        meal_type=args.meal_type,
        meal_channel=args.meal_channel,
        intent=args.intent,
        target_meal_calories_kcal=args.target_calories,
        target_meal_budget_krw=args.target_budget,
        limit=args.limit,
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        engine = get_sql_connection()
        all_dfs = load_required_tables(REQUIRED_TABLES, engine=engine)
        request = build_request(args, all_dfs)
        artifacts = ModelArtifacts(lightfm_data=None, xgboost_model=None) if args.skip_models else load_model_artifacts(args.model_dir)
        result = process_recommendation_pipeline(request, all_dfs, artifacts)
        if args.persist:
            if request.run_id is None:
                raise RuntimeError("--persist requires --run-id.")
            result = persist_recommendation_result(engine, request.run_id, result)
        print(dumps_result(result))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
