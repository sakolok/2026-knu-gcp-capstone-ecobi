from __future__ import annotations

import datetime as dt
import hashlib
import importlib
import json
import math
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable

from .models import CandidateScore, ModelArtifacts, RecommendationRequest, RecommendationResult


REQUIRED_TABLES = [
    "user_profiles",
    "foods",
    "meal_candidates",
    "meal_candidate_items",
    "food_logs",
    "recommendation_candidates",
    "recommendation_runs",
    "user_item_interactions",
    "user_allergens",
    "food_allergens",
    "user_food_entries",
]

XGBOOST_FEATURE_COLUMNS = [
    "age_years_snapshot",
    "activity_factor",
    "goal_type_enc",
    "sex_enc",
    "total_price_krw",
    "total_calories_kcal",
    "total_protein_g",
    "total_fat_g",
    "total_carbs_g",
    "count_low_fat",
    "count_high_protein",
]

MAX_RECOMMENDATION_ITEM_CALORIES_KCAL = 1100.0
MAX_RECOMMENDATION_ITEM_PROTEIN_G = 85.0
MAX_RECOMMENDATION_ITEM_FAT_G = 85.0
MAX_RECOMMENDATION_ITEM_CARBS_G = 180.0
MAX_RECOMMENDATION_CANDIDATE_PROTEIN_G = 95.0
MAX_RECOMMENDATION_CANDIDATE_FAT_G = 110.0
MAX_RECOMMENDATION_CANDIDATE_CARBS_G = 240.0


def _require_module(module_name: str, package_name: str | None = None):
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        install_name = package_name or module_name
        raise RuntimeError(f"Missing Python dependency '{install_name}'. Install ML/requirements.txt first.") from exc


def _warn(message: str):
    print(json.dumps({"warning": message}, ensure_ascii=False), file=sys.stderr)


@contextmanager
def _timed_stage(timings_ms: dict[str, float] | None, stage: str):
    started_at = time.perf_counter()
    try:
        yield
    finally:
        if timings_ms is not None:
            timings_ms[stage] = round((time.perf_counter() - started_at) * 1000, 2)


def _pd():
    return _require_module("pandas")


def _np():
    return _require_module("numpy")


def _as_dataframe(value: Any):
    pd = _pd()
    if value is None:
        return pd.DataFrame()
    if isinstance(value, pd.DataFrame):
        return value.copy()
    return pd.DataFrame(value)


def _records(value: Any) -> list[dict[str, Any]]:
    return _as_dataframe(value).to_dict("records")


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.lower() in {"true", "t", "1", "yes"}
    return False


def _safe_number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    return int(round(_safe_number(value, default)))


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return {}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _goal_family(goal_type: Any) -> str:
    value = str(goal_type or "maintain").lower()
    if value in {"cut", "diet", "다이어트", "감량"}:
        return "cut"
    if value in {"bulk", "lean_mass", "performance", "린메스업", "퍼포먼스", "증량"}:
        return "bulk"
    return "maintain"


def _intent_key(intent: Any) -> str:
    value = str(intent or "personal").lower()
    if value in {"budget", "protein", "recovery", "weekly_plan"}:
        return value
    return "personal"


def _sex_enc(value: Any) -> int:
    normalized = str(value or "").lower()
    if normalized in {"male", "m"}:
        return 0
    if normalized in {"female", "f"}:
        return 1
    return -1


def _goal_enc(value: Any) -> int:
    return {"cut": 0, "bulk": 1, "maintain": 2}.get(_goal_family(value), -1)


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _is_plausible_recommendation_food(food: dict[str, Any]) -> bool:
    """Reject package-level nutrition rows that are not realistic one-meal items."""

    return (
        _safe_number(food.get("calories_kcal")) <= MAX_RECOMMENDATION_ITEM_CALORIES_KCAL
        and _safe_number(food.get("protein_g")) <= MAX_RECOMMENDATION_ITEM_PROTEIN_G
        and _safe_number(food.get("fat_g")) <= MAX_RECOMMENDATION_ITEM_FAT_G
        and _safe_number(food.get("carbs_g")) <= MAX_RECOMMENDATION_ITEM_CARBS_G
    )


def _is_plausible_recommendation_candidate(candidate: dict[str, Any]) -> bool:
    """Reject cached meal candidates generated from package-level source rows."""

    return (
        _safe_number(candidate.get("total_protein_g")) <= MAX_RECOMMENDATION_CANDIDATE_PROTEIN_G
        and _safe_number(candidate.get("total_fat_g")) <= MAX_RECOMMENDATION_CANDIDATE_FAT_G
        and _safe_number(candidate.get("total_carbs_g")) <= MAX_RECOMMENDATION_CANDIDATE_CARBS_G
    )


def _now_str() -> str:
    return dt.datetime.now(dt.UTC).replace(tzinfo=None).isoformat(timespec="seconds")


def build_candidate_fingerprint(meal_type: str, meal_channel: str, food_ids: Iterable[int]) -> str:
    ids = ",".join(str(food_id) for food_id in sorted(int(food_id) for food_id in food_ids))
    digest = hashlib.sha1(ids.encode("utf-8")).hexdigest()[:16]
    return f"milp:v1:{meal_type}:{meal_channel}:{digest}"


def get_meal_conditions(run_id: int, all_dfs: dict[str, Any]) -> RecommendationRequest | None:
    runs = _as_dataframe(all_dfs.get("recommendation_runs"))
    if runs.empty:
        return None
    row_df = runs[runs["run_id"].astype(str) == str(run_id)]
    if row_df.empty:
        return None
    row = row_df.iloc[0]
    profile_snapshot = _json_object(row.get("profile_snapshot"))
    meal_channel = profile_snapshot.get("mealChannel")
    return RecommendationRequest(
        run_id=int(row["run_id"]),
        user_id=int(row["user_id"]),
        meal_type=str(row.get("context_meal_type") or "lunch"),
        meal_channel=str(meal_channel) if meal_channel else None,
        intent=str(profile_snapshot.get("recommendationIntent") or "personal"),
        target_meal_calories_kcal=_safe_number(row.get("target_meal_calories_kcal"), 1),
        target_meal_budget_krw=_safe_int(row.get("target_meal_budget_krw"), 0),
        target_meal_carbs_g=_safe_number(row.get("target_meal_carbs_g"), 0),
        target_meal_protein_g=_safe_number(row.get("target_meal_protein_g"), 0),
        target_meal_fat_g=_safe_number(row.get("target_meal_fat_g"), 0),
        remaining_carbs_g=_safe_number(row.get("context_remaining_carbs_g"), 0),
        remaining_protein_g=_safe_number(row.get("context_remaining_protein_g"), 0),
        remaining_fat_g=_safe_number(row.get("context_remaining_fat_g"), 0),
    )


def _calorie_bounds(goal_type: str, target_kcal: float, relaxation: float) -> tuple[float, float]:
    goal = _goal_family(goal_type)
    if goal == "cut":
        lower, upper = 0.75, 1.05
    elif goal == "bulk":
        lower, upper = 0.9, 1.2
    else:
        lower, upper = 0.85, 1.15
    return max(0, target_kcal * (lower - relaxation)), target_kcal * (upper + relaxation)


def _budget_floor(request: RecommendationRequest, relaxation: float) -> float:
    budget = float(max(request.target_meal_budget_krw or 0, 0))
    if budget <= 0:
        return 0.0

    intent = _intent_key(request.intent)
    if intent == "budget":
        return budget * 0.6

    base_ratio = {
        "personal": 0.75,
        "protein": 0.7,
        "weekly_plan": 0.75,
        "recovery": 0.45,
    }.get(intent, 0.75)
    return budget * max(0.0, base_ratio - relaxation)


def _budget_ceiling(request: RecommendationRequest) -> float:
    budget = float(max(request.target_meal_budget_krw or 0, 0))
    return budget if budget > 0 else float("inf")


def _macro_ratios(goal_type: str) -> dict[str, float]:
    goal = _goal_family(goal_type)
    if goal == "cut":
        return {"carbs": 0.4, "protein": 0.35, "fat": 0.25}
    if goal == "bulk":
        return {"carbs": 0.5, "protein": 0.3, "fat": 0.2}
    return {"carbs": 0.5, "protein": 0.25, "fat": 0.25}


def _request_macro_targets(request: RecommendationRequest) -> dict[str, float]:
    calorie_target = max(float(request.target_meal_calories_kcal or 0), 1.0)
    return {
        "carbs": _safe_number(request.target_meal_carbs_g)
        or ((calorie_target * 0.5) / 4.0),
        "protein": _safe_number(request.target_meal_protein_g)
        or ((calorie_target * 0.25) / 4.0),
        "fat": _safe_number(request.target_meal_fat_g)
        or ((calorie_target * 0.25) / 9.0),
    }


def _zero_target_fit(actual: float, tolerance: float) -> float:
    if actual <= 0:
        return 1.0
    return _clamp01(1.0 - (actual / max(tolerance, 1.0)))


def _carb_fit(actual: float, target: float) -> float:
    if target <= 0:
        return _zero_target_fit(actual, 45.0)
    return _clamp01(1.0 - (abs(actual - target) / max(target, 1.0)))


def _protein_macro_fit(actual: float, target: float) -> float:
    if target <= 0:
        return _zero_target_fit(actual, 35.0)
    if actual < target:
        return _clamp01(actual / max(target, 1.0))
    # Protein can exceed the target slightly without being as harmful as fat overshoot.
    excess = max(actual - (target * 1.35), 0.0)
    return _clamp01(1.0 - (excess / max(target * 1.5, 1.0)))


def _fat_fit(actual: float, target: float) -> float:
    if target <= 0:
        return _zero_target_fit(actual, 18.0)
    if actual <= target:
        return _clamp01(0.65 + 0.35 * (actual / max(target, 1.0)))
    return _clamp01(1.0 - ((actual - target) / max(target, 1.0)))


def _candidate_macro_fit(candidate: dict[str, Any], request: RecommendationRequest) -> float:
    targets = _request_macro_targets(request)
    carbs = max(_safe_number(candidate.get("total_carbs_g")), 0.0)
    protein = max(_safe_number(candidate.get("total_protein_g")), 0.0)
    fat = max(_safe_number(candidate.get("total_fat_g")), 0.0)
    return (
        _carb_fit(carbs, targets["carbs"]) * 0.4
        + _protein_macro_fit(protein, targets["protein"]) * 0.35
        + _fat_fit(fat, targets["fat"]) * 0.25
    )


def _candidate_macro_distance(candidate: dict[str, Any], request: RecommendationRequest) -> float:
    return 1.0 - _candidate_macro_fit(candidate, request)


def _is_supplement_food(food: dict[str, Any]) -> bool:
    category = _normalize_text(food.get("category"))
    if "보충제" in category or "supplement" in category:
        return True

    food_name = _normalize_text(food.get("food_name"))
    source_label = _normalize_text(food.get("source_label"))
    item_tags = _normalize_text(food.get("item_tags"))
    supplement_tokens = ("프로틴", "웨이", "wpc", "wpi", "hwpi", "protein")
    return any(token in food_name or token in source_label or token in item_tags for token in supplement_tokens)


def _supplement_food_ids(all_dfs: dict[str, Any]) -> set[int]:
    foods = _as_dataframe(all_dfs.get("foods"))
    if foods.empty or "food_id" not in foods:
        return set()
    return {int(food["food_id"]) for food in foods.to_dict("records") if _is_supplement_food(food)}


def _invalid_supplement_combo_candidate_ids(all_dfs: dict[str, Any]) -> set[int]:
    pd = _pd()
    items = _as_dataframe(all_dfs.get("meal_candidate_items"))
    supplement_ids = _supplement_food_ids(all_dfs)
    if items.empty or not supplement_ids or "candidate_id" not in items or "food_id" not in items:
        return set()

    supplement_items = items[items["food_id"].astype(int).isin(supplement_ids)]
    if supplement_items.empty:
        return set()

    counts = supplement_items.groupby("candidate_id").size().reset_index(name="supplement_count")
    invalid = counts[counts["supplement_count"] > 1]
    if invalid.empty:
        return set()
    return set(pd.to_numeric(invalid["candidate_id"], errors="coerce").dropna().astype(int).tolist())


def _forbidden_food_ids(user_id: int, all_dfs: dict[str, Any]) -> set[int]:
    user_allergens = _as_dataframe(all_dfs.get("user_allergens"))
    food_allergens = _as_dataframe(all_dfs.get("food_allergens"))
    if user_allergens.empty or food_allergens.empty:
        return set()
    allergen_ids = set(user_allergens[user_allergens["user_id"] == user_id]["allergen_id"].tolist())
    if not allergen_ids:
        return set()
    return set(food_allergens[food_allergens["allergen_id"].isin(allergen_ids)]["food_id"].astype(int).tolist())


def _select_cached_meal_candidates(
    request: RecommendationRequest,
    all_dfs: dict[str, Any],
    goal_type: str,
    desired_count: int,
    minimum_count: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    pd = _pd()
    candidates = _as_dataframe(all_dfs.get("meal_candidates"))
    items = _as_dataframe(all_dfs.get("meal_candidate_items"))
    if candidates.empty or items.empty:
        return [], []

    filtered = candidates[candidates["meal_type"].astype(str) == str(request.meal_type)].copy()
    if request.meal_channel and "meal_channel" in filtered:
        filtered = filtered[filtered["meal_channel"].astype(str) == str(request.meal_channel)]
    if "is_active" in filtered:
        filtered = filtered[filtered["is_active"].map(_to_bool)]
    filtered = filtered[filtered.apply(lambda row: _is_plausible_recommendation_candidate(row.to_dict()), axis=1)]
    invalid_supplement_combo_ids = _invalid_supplement_combo_candidate_ids(all_dfs)
    if invalid_supplement_combo_ids:
        filtered = filtered[~filtered["candidate_id"].astype(int).isin(invalid_supplement_combo_ids)]
    if filtered.empty:
        return [], []

    selected = pd.DataFrame()
    budget_ceiling = _budget_ceiling(request)
    for relaxation in (0.0, 0.15, 0.35, 0.75):
        budget_floor = _budget_floor(request, relaxation)
        min_cal, max_cal = _calorie_bounds(str(goal_type), request.target_meal_calories_kcal, min(relaxation, 0.45))
        candidate_pool = filtered[
            (filtered["total_price_krw"].map(_safe_number) <= budget_ceiling)
            & (filtered["total_price_krw"].map(_safe_number) >= budget_floor)
            & (filtered["total_calories_kcal"].map(_safe_number) >= min_cal)
            & (filtered["total_calories_kcal"].map(_safe_number) <= max_cal)
        ].copy()
        if len(candidate_pool) >= minimum_count or relaxation == 0.75:
            selected = candidate_pool
            break

    if selected.empty:
        return [], []

    intent = _intent_key(request.intent)
    target_budget = max(float(request.target_meal_budget_krw or 0), 1.0)
    target_calories = max(float(request.target_meal_calories_kcal or 0), 1.0)
    selected["_budget_distance"] = selected["total_price_krw"].map(lambda value: abs(_safe_number(value) - target_budget) / target_budget)
    selected["_calorie_distance"] = selected["total_calories_kcal"].map(lambda value: abs(_safe_number(value) - target_calories) / target_calories)
    selected["_protein_score"] = selected["total_protein_g"].map(lambda value: _safe_number(value))
    selected["_price_score"] = selected["total_price_krw"].map(lambda value: _safe_number(value))
    selected["_budget_value_ratio"] = selected["total_price_krw"].map(lambda value: _safe_number(value) / target_budget)
    selected["_budget_saving_distance"] = selected["_budget_value_ratio"].map(lambda value: abs(value - 0.75))
    selected["_macro_distance"] = selected.apply(lambda row: _candidate_macro_distance(row.to_dict(), request), axis=1)

    if intent == "budget":
        selected["_cache_rank"] = selected["_budget_saving_distance"] * 950 + selected["_calorie_distance"] * 650 + selected["_macro_distance"] * 900 - selected["_protein_score"] * 18
    elif intent == "recovery":
        selected["_cache_rank"] = selected["_calorie_distance"] * 850 + selected["_macro_distance"] * 1000 + selected["_budget_distance"] * 350 - selected["_protein_score"] * 8
    elif intent == "protein":
        selected["_cache_rank"] = selected["_budget_distance"] * 850 + selected["_calorie_distance"] * 600 + selected["_macro_distance"] * 950 - selected["_protein_score"] * 24
    else:
        selected["_cache_rank"] = selected["_budget_distance"] * 850 + selected["_calorie_distance"] * 750 + selected["_macro_distance"] * 1100 - selected["_protein_score"] * 10

    selected = selected.sort_values(["_cache_rank", "total_price_krw"], ascending=[True, False]).head(desired_count)
    candidate_ids = set(selected["candidate_id"].astype(int).tolist())
    selected_items = items[items["candidate_id"].astype(int).isin(candidate_ids)].copy()
    selected = selected.drop(columns=[column for column in selected.columns if column.startswith("_")], errors="ignore")
    return selected.to_dict("records"), selected_items.to_dict("records")


def generate_meal_candidates(request: RecommendationRequest, all_dfs: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    foods = _as_dataframe(all_dfs.get("foods"))
    profiles = _as_dataframe(all_dfs.get("user_profiles"))
    existing_candidates = _as_dataframe(all_dfs.get("meal_candidates"))
    existing_items = _as_dataframe(all_dfs.get("meal_candidate_items"))
    if foods.empty:
        return [], []

    profile_row = profiles[profiles["user_id"] == request.user_id].iloc[0] if not profiles.empty else {}
    goal_type = profile_row.get("goal_type", "maintain") if hasattr(profile_row, "get") else "maintain"
    forbidden = _forbidden_food_ids(request.user_id, all_dfs)
    desired_cached_count = min(max(request.limit * 6, 12), 60)
    minimum_cached_count = max(request.limit * 2, request.limit + 2)
    cached_candidates, cached_items = _select_cached_meal_candidates(
        request,
        all_dfs,
        str(goal_type),
        desired_cached_count,
        minimum_cached_count,
    )
    if len(cached_candidates) >= minimum_cached_count:
        return cached_candidates, cached_items

    pulp = _require_module("pulp")

    food_items = []
    for food in foods.to_dict("records"):
        if int(food["food_id"]) in forbidden:
            continue
        if request.meal_channel and food.get("meal_channel") != request.meal_channel:
            continue
        if "is_active" in food and not _to_bool(food.get("is_active")):
            continue
        if not _is_plausible_recommendation_food(food):
            continue
        if _safe_int(food.get("price_krw")) > request.target_meal_budget_krw:
            continue
        food_items.append(food)

    if not food_items:
        return cached_candidates, cached_items

    supplement_food_ids = {int(food["food_id"]) for food in food_items if _is_supplement_food(food)}

    next_temp_id = 1 if existing_candidates.empty else int(existing_candidates["candidate_id"].max()) + 1
    next_temp_item_id = 1 if existing_items.empty else int(existing_items["meal_candidate_item_id"].max()) + 1
    generated_candidates: list[dict[str, Any]] = []
    generated_items: list[dict[str, Any]] = []
    generated_target_count = max(request.limit * 2 - len(cached_candidates), request.limit)
    known_fingerprints = {str(candidate.get("candidate_fingerprint")) for candidate in cached_candidates if candidate.get("candidate_fingerprint")}
    now = _now_str()

    for relaxation in (0.0, 0.15, 0.35):
        prob = pulp.LpProblem("EcobiMealGeneration", pulp.LpMinimize)
        variables = pulp.LpVariable.dicts("food", [int(food["food_id"]) for food in food_items], 0, 1, pulp.LpBinary)
        price_expr = pulp.lpSum([_safe_int(food["price_krw"]) * variables[int(food["food_id"])] for food in food_items])
        calorie_expr = pulp.lpSum([_safe_number(food["calories_kcal"]) * variables[int(food["food_id"])] for food in food_items])
        protein_expr = pulp.lpSum([_safe_number(food["protein_g"]) * variables[int(food["food_id"])] for food in food_items])
        fat_expr = pulp.lpSum([_safe_number(food["fat_g"]) * variables[int(food["food_id"])] for food in food_items])
        carbs_expr = pulp.lpSum([_safe_number(food["carbs_g"]) * variables[int(food["food_id"])] for food in food_items])
        budget_gap = pulp.LpVariable("budget_gap", lowBound=0)
        calorie_gap = pulp.LpVariable("calorie_gap", lowBound=0)
        carb_gap = pulp.LpVariable("carb_gap", lowBound=0)
        protein_gap = pulp.LpVariable("protein_gap", lowBound=0)
        fat_gap = pulp.LpVariable("fat_gap", lowBound=0)
        macro_targets = _request_macro_targets(request)
        prob += budget_gap >= price_expr - request.target_meal_budget_krw
        prob += budget_gap >= request.target_meal_budget_krw - price_expr
        prob += calorie_gap >= calorie_expr - request.target_meal_calories_kcal
        prob += calorie_gap >= request.target_meal_calories_kcal - calorie_expr
        prob += carb_gap >= carbs_expr - macro_targets["carbs"]
        prob += carb_gap >= macro_targets["carbs"] - carbs_expr
        prob += protein_gap >= protein_expr - macro_targets["protein"]
        prob += protein_gap >= macro_targets["protein"] - protein_expr
        prob += fat_gap >= fat_expr - macro_targets["fat"]
        prob += fat_gap >= macro_targets["fat"] - fat_expr
        macro_gap = (carb_gap * 4) + (protein_gap * 5) + (fat_gap * 9)
        if _intent_key(request.intent) == "budget":
            prob += price_expr + calorie_gap * 1.5 + macro_gap * 1.2 - protein_expr * 8
        else:
            prob += budget_gap + calorie_gap * 1.5 + macro_gap * 1.3 - protein_expr * 10
        prob += pulp.lpSum([variables[int(food["food_id"])] for food in food_items]) >= 1
        prob += pulp.lpSum([variables[int(food["food_id"])] for food in food_items]) <= 3
        if supplement_food_ids:
            prob += pulp.lpSum([variables[food_id] for food_id in supplement_food_ids]) <= 1
        prob += price_expr <= request.target_meal_budget_krw
        budget_floor = _budget_floor(request, relaxation)
        if budget_floor > 0:
            prob += price_expr >= budget_floor

        min_cal, max_cal = _calorie_bounds(str(goal_type), request.target_meal_calories_kcal, relaxation)
        prob += calorie_expr >= min_cal
        prob += calorie_expr <= max_cal

        if relaxation < 0.35:
            for macro, target_g in macro_targets.items():
                if target_g <= 0:
                    continue
                column = f"{macro}_g"
                prob += pulp.lpSum([_safe_number(food[column]) * variables[int(food["food_id"])] for food in food_items]) >= target_g * 0.35
                prob += pulp.lpSum([_safe_number(food[column]) * variables[int(food["food_id"])] for food in food_items]) <= target_g * 2.0

        while len(generated_candidates) < generated_target_count:
            prob.solve(pulp.PULP_CBC_CMD(msg=0))
            if pulp.LpStatus[prob.status] != "Optimal":
                break
            selected = [food for food in food_items if variables[int(food["food_id"])].varValue == 1]
            if not selected:
                break
            selected_food_ids = [int(food["food_id"]) for food in selected]
            meal_channel = request.meal_channel or str(selected[0].get("meal_channel") or "home_meal")
            fingerprint = build_candidate_fingerprint(request.meal_type, meal_channel, selected_food_ids)
            if fingerprint in known_fingerprints or any(candidate["candidate_fingerprint"] == fingerprint for candidate in generated_candidates):
                prob += pulp.lpSum([variables[food_id] for food_id in selected_food_ids]) <= len(selected_food_ids) - 1
                continue
            known_fingerprints.add(fingerprint)

            candidate_id = next_temp_id
            next_temp_id += 1
            food_name_by_id = foods.set_index("food_id")["food_name"].to_dict()
            generated_candidates.append(
                {
                    "candidate_id": candidate_id,
                    "candidate_name": ", ".join(str(food_name_by_id[food_id]) for food_id in sorted(selected_food_ids)),
                    "candidate_fingerprint": fingerprint,
                    "fingerprint_version": "v1",
                    "meal_type": request.meal_type,
                    "meal_channel": meal_channel,
                    "total_price_krw": sum(_safe_int(food["price_krw"]) for food in selected),
                    "total_calories_kcal": sum(_safe_number(food["calories_kcal"]) for food in selected),
                    "total_protein_g": sum(_safe_number(food["protein_g"]) for food in selected),
                    "total_fat_g": sum(_safe_number(food["fat_g"]) for food in selected),
                    "total_carbs_g": sum(_safe_number(food["carbs_g"]) for food in selected),
                    "generation_source": "milp",
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                }
            )

            for item_order, food in enumerate(selected, start=1):
                generated_items.append(
                    {
                        "meal_candidate_item_id": next_temp_item_id,
                        "candidate_id": candidate_id,
                        "food_id": int(food["food_id"]),
                        "quantity_g": food.get("serving_size_g"),
                        "quantity_label": food.get("serving_unit_label") or "1 serving",
                        "quantity_bucket": "milp",
                        "item_order": item_order,
                        "item_price_krw": _safe_int(food["price_krw"]),
                        "item_calories_kcal": _safe_number(food["calories_kcal"]),
                        "item_protein_g": _safe_number(food["protein_g"]),
                        "item_fat_g": _safe_number(food["fat_g"]),
                        "item_carbs_g": _safe_number(food["carbs_g"]),
                    }
                )
                next_temp_item_id += 1

            prob += pulp.lpSum([variables[food_id] for food_id in selected_food_ids]) <= len(selected_food_ids) - 1

        if len(generated_candidates) >= generated_target_count:
            break

    combined_candidates = [*cached_candidates, *generated_candidates]
    combined_items = [*cached_items, *generated_items]
    return combined_candidates[: max(request.limit * 6, request.limit + 2)], combined_items


def calculate_lightfm_scores(user_id: int, meal_candidates: list[dict[str, Any]], meal_candidate_items: list[dict[str, Any]], lightfm_data: Any | None) -> dict[int, float]:
    if not lightfm_data:
        return {int(candidate["candidate_id"]): 0.5 for candidate in meal_candidates}

    np = _np()
    model = lightfm_data.get("model")
    dataset = lightfm_data.get("dataset")
    if model is None or dataset is None:
        return {int(candidate["candidate_id"]): 0.5 for candidate in meal_candidates}

    user_map, _, item_map, _ = dataset.mapping()
    if user_id not in user_map:
        return {int(candidate["candidate_id"]): 0.5 for candidate in meal_candidates}

    uid_mapped = user_map[user_id]
    scores: dict[int, float] = {}
    items_by_candidate = _as_dataframe(meal_candidate_items)
    for candidate in meal_candidates:
        candidate_id = int(candidate["candidate_id"])
        if candidate_id in item_map:
            raw_score = model.predict(np.array([uid_mapped]), np.array([item_map[candidate_id]]))[0]
            scores[candidate_id] = float(1 / (1 + np.exp(-raw_score)))
            continue

        item_rows = items_by_candidate[items_by_candidate["candidate_id"] == candidate_id]
        food_scores = []
        for food_id in item_rows.get("food_id", []):
            if food_id in item_map:
                raw_score = model.predict(np.array([uid_mapped]), np.array([item_map[food_id]]))[0]
                food_scores.append(float(1 / (1 + np.exp(-raw_score))))
        scores[candidate_id] = float(sum(food_scores) / len(food_scores)) if food_scores else 0.5
    return scores


def calculate_xgboost_probabilities(
    user_id: int,
    meal_candidates: list[dict[str, Any]],
    meal_candidate_items: list[dict[str, Any]],
    all_dfs: dict[str, Any],
    xgboost_model: Any | None,
) -> dict[int, float]:
    if xgboost_model is None or not meal_candidates:
        return {int(candidate["candidate_id"]): 0.5 for candidate in meal_candidates}

    pd = _pd()
    profiles = _as_dataframe(all_dfs.get("user_profiles"))
    foods = _as_dataframe(all_dfs.get("foods"))
    if profiles.empty:
        return {int(candidate["candidate_id"]): 0.5 for candidate in meal_candidates}

    user_profile = profiles[profiles["user_id"] == user_id].copy()
    if user_profile.empty:
        return {int(candidate["candidate_id"]): 0.5 for candidate in meal_candidates}

    user_profile["goal_type_enc"] = user_profile["goal_type"].apply(_goal_enc)
    user_profile["sex_enc"] = user_profile["sex"].apply(_sex_enc) if "sex" in user_profile else -1

    candidate_df = pd.DataFrame(meal_candidates)
    items_df = pd.DataFrame(meal_candidate_items)
    feature_df = candidate_df[
        ["candidate_id", "total_price_krw", "total_calories_kcal", "total_protein_g", "total_fat_g", "total_carbs_g"]
    ].copy()
    feature_df["user_id"] = user_id
    feature_df = feature_df.merge(
        user_profile[["user_id", "age_years_snapshot", "activity_factor", "goal_type_enc", "sex_enc"]],
        on="user_id",
        how="left",
    )

    optional_food_cols = ["food_id"]
    for col in ("is_low_fat", "is_high_protein"):
        if col in foods.columns:
            optional_food_cols.append(col)
        else:
            foods[col] = 0
            optional_food_cols.append(col)

    if items_df.empty:
        meal_stats = pd.DataFrame(columns=["candidate_id", "count_low_fat", "count_high_protein"])
    else:
        food_stats = items_df.merge(foods[optional_food_cols], on="food_id", how="left").fillna(0)
        meal_stats = food_stats.groupby("candidate_id").agg({"is_low_fat": "sum", "is_high_protein": "sum"}).reset_index()
        meal_stats.columns = ["candidate_id", "count_low_fat", "count_high_protein"]

    feature_df = feature_df.merge(meal_stats, on="candidate_id", how="left").fillna(0)
    try:
        probabilities = xgboost_model.predict_proba(feature_df[XGBOOST_FEATURE_COLUMNS])[:, 1]
    except Exception as exc:
        _warn(f"XGBoost scoring skipped: {exc}")
        return {int(candidate["candidate_id"]): 0.5 for candidate in meal_candidates}
    return dict(zip(feature_df["candidate_id"].astype(int), [float(value) for value in probabilities], strict=False))


def calculate_mmr_penalties(
    request: RecommendationRequest,
    meal_candidates: list[dict[str, Any]],
    meal_candidate_items: list[dict[str, Any]],
    all_dfs: dict[str, Any],
    current_date: Any | None = None,
) -> dict[int, tuple[float, float]]:
    pd = _pd()
    user_id = request.user_id
    food_logs = _as_dataframe(all_dfs.get("food_logs"))
    rec_candidates = _as_dataframe(all_dfs.get("recommendation_candidates"))
    rec_runs = _as_dataframe(all_dfs.get("recommendation_runs"))
    user_food_entries = _as_dataframe(all_dfs.get("user_food_entries"))
    foods = _as_dataframe(all_dfs.get("foods"))
    items_df = pd.DataFrame(meal_candidate_items)
    food_counts: dict[int, int] = {}
    candidate_counts: dict[int, int] = {}
    manual_name_counts: dict[str, int] = {}
    recent_logs = pd.DataFrame()

    if not food_logs.empty:
        user_logs = food_logs[(food_logs["user_id"] == user_id) & food_logs.get("deleted_at", pd.Series([None] * len(food_logs))).isna()].copy()
        if not user_logs.empty:
            user_logs["consumed_at"] = pd.to_datetime(user_logs["consumed_at"])
            anchor = pd.to_datetime(current_date) if current_date is not None else user_logs["consumed_at"].max()
            recent_logs = user_logs[user_logs["consumed_at"] >= anchor - dt.timedelta(days=7)]
            food_counts = recent_logs["food_id"].dropna().astype(int).value_counts().to_dict() if "food_id" in recent_logs else {}
            if not rec_candidates.empty and "recommendation_candidate_id" in recent_logs:
                merged = recent_logs.merge(rec_candidates[["recommendation_candidate_id", "candidate_id"]], on="recommendation_candidate_id", how="inner")
                candidate_counts = merged["candidate_id"].dropna().astype(int).value_counts().to_dict()

    if not user_food_entries.empty and "user_food_entry_id" in recent_logs:
        manual_logs = recent_logs.dropna(subset=["user_food_entry_id"]).merge(
            user_food_entries[["user_food_entry_id", "food_name"]],
            on="user_food_entry_id",
            how="inner",
        )
        manual_name_counts = manual_logs["food_name"].map(_normalize_text).value_counts().to_dict()

    food_name_by_id: dict[int, str] = {}
    if not foods.empty and {"food_id", "food_name"}.issubset(set(foods.columns)):
        food_name_by_id = {
            int(row["food_id"]): _normalize_text(row["food_name"])
            for row in foods[["food_id", "food_name"]].dropna().to_dict("records")
        }

    exposure_counts: dict[int, int] = {}
    if not rec_candidates.empty and not rec_runs.empty and {"run_id", "user_id"}.issubset(set(rec_runs.columns)) and {"run_id", "candidate_id"}.issubset(set(rec_candidates.columns)):
        user_runs = rec_runs[rec_runs["user_id"].astype(str) == str(user_id)].copy()
        if request.run_id is not None:
            user_runs = user_runs[pd.to_numeric(user_runs["run_id"], errors="coerce") < int(request.run_id)]
        if "context_meal_type" in user_runs:
            user_runs = user_runs[user_runs["context_meal_type"].astype(str) == str(request.meal_type)]
        recent_run_ids = (
            user_runs.assign(_run_id_num=pd.to_numeric(user_runs["run_id"], errors="coerce"))
            .dropna(subset=["_run_id_num"])
            .sort_values("_run_id_num", ascending=False)
            .head(4)["run_id"]
            .astype(str)
            .tolist()
        )
        if recent_run_ids:
            exposed = rec_candidates[rec_candidates["run_id"].astype(str).isin(recent_run_ids)]
            exposure_counts = exposed["candidate_id"].dropna().astype(int).value_counts().to_dict()

    penalties: dict[int, tuple[float, float]] = {}
    for candidate in meal_candidates:
        candidate_id = int(candidate["candidate_id"])
        candidate_penalty = candidate_counts.get(candidate_id, 0) * 0.15 + exposure_counts.get(candidate_id, 0) * 0.12
        food_penalty = 0.0
        if not items_df.empty:
            candidate_items = items_df[items_df["candidate_id"] == candidate_id]
            for food_id in candidate_items["food_id"].dropna().astype(int):
                food_penalty += food_counts.get(food_id, 0) * 0.05
                food_penalty += manual_name_counts.get(food_name_by_id.get(int(food_id), ""), 0) * 0.05
        penalties[candidate_id] = (float(candidate_penalty), float(food_penalty))
    return penalties


def _candidate_intent_bonus(candidate: dict[str, Any], request: RecommendationRequest) -> float:
    intent = _intent_key(request.intent)
    target_budget = max(float(request.target_meal_budget_krw or 0), 1.0)
    target_calories = max(float(request.target_meal_calories_kcal or 0), 1.0)
    price = max(_safe_number(candidate.get("total_price_krw")), 0.0)
    calories = max(_safe_number(candidate.get("total_calories_kcal")), 1.0)
    protein = max(_safe_number(candidate.get("total_protein_g")), 0.0)
    fat = max(_safe_number(candidate.get("total_fat_g")), 0.0)

    budget_saving = _clamp01(1.0 - (price / target_budget))
    budget_closeness = _clamp01(1.0 - (abs(price - target_budget) / target_budget))
    calorie_fit = _clamp01(1.0 - (abs(calories - target_calories) / target_calories))
    calorie_under = _clamp01(1.0 - (max(calories - target_calories, 0.0) / target_calories))
    protein_target = max((target_calories * 0.3) / 4.0, 1.0)
    protein_fit = _clamp01(protein / protein_target)
    protein_density = _clamp01((protein / calories) / 0.12)
    protein_per_1000krw = _clamp01(((protein / max(price, 1.0)) * 1000.0) / 12.0)
    low_fat = _clamp01(1.0 - (fat / max((target_calories * 0.3) / 9.0, 1.0)))
    macro_fit = _candidate_macro_fit(candidate, request)

    if intent == "budget":
        return (budget_saving * 0.45) + (protein_per_1000krw * 0.2) + (macro_fit * 0.2) + (calorie_fit * 0.15)
    if intent == "weekly_plan":
        return (budget_closeness * 0.4) + (macro_fit * 0.3) + (calorie_fit * 0.2) + (protein_fit * 0.1)
    if intent == "protein":
        return (protein_fit * 0.45) + (protein_density * 0.2) + (macro_fit * 0.2) + (calorie_fit * 0.15)
    if intent == "recovery":
        return (calorie_under * 0.35) + (low_fat * 0.25) + (macro_fit * 0.25) + (protein_fit * 0.15)
    return (macro_fit * 0.35) + (calorie_fit * 0.3) + (budget_saving * 0.2) + (protein_fit * 0.15)


def _run_diversity_bonus(request: RecommendationRequest, candidate_id: int) -> float:
    """Small deterministic jitter so repeated same-condition requests rotate close candidates."""

    if request.run_id is None:
        return 0.0
    digest = hashlib.sha1(f"{request.run_id}:{candidate_id}".encode("utf-8")).hexdigest()
    normalized = int(digest[:8], 16) / 0xFFFFFFFF
    amplitude = 0.025 if _intent_key(request.intent) == "weekly_plan" else 0.06
    return (normalized - 0.5) * amplitude


def rank_candidates(
    request: RecommendationRequest,
    meal_candidates: list[dict[str, Any]],
    lightfm_scores: dict[int, float],
    xgboost_probabilities: dict[int, float],
    mmr_penalties: dict[int, tuple[float, float]],
    limit: int,
) -> list[CandidateScore]:
    scored: list[CandidateScore] = []
    intent = _intent_key(request.intent)
    if intent == "personal":
        xgb_weight, lightfm_weight, intent_weight = 0.45, 0.25, 0.3
    else:
        xgb_weight, lightfm_weight, intent_weight = 0.35, 0.2, 0.45
    for candidate in meal_candidates:
        candidate_id = int(candidate["candidate_id"])
        lightfm_score = float(lightfm_scores.get(candidate_id, 0.5))
        xgboost_probability = float(xgboost_probabilities.get(candidate_id, 0.5))
        intent_bonus = _candidate_intent_bonus(candidate, request)
        macro_fit = _candidate_macro_fit(candidate, request)
        mmr_penalty, repeat_food_penalty = mmr_penalties.get(candidate_id, (0.0, 0.0))
        diversity_bonus = _run_diversity_bonus(request, candidate_id)
        final_score = (xgboost_probability * xgb_weight) + (lightfm_score * lightfm_weight) + (intent_bonus * intent_weight) + diversity_bonus - mmr_penalty - repeat_food_penalty
        scored.append(
            CandidateScore(
                candidate_id=candidate_id,
                lightfm_score=lightfm_score,
                xgboost_probability=xgboost_probability,
                intent_bonus=float(intent_bonus),
                macro_fit=float(macro_fit),
                mmr_penalty=float(mmr_penalty),
                repeat_food_penalty=float(repeat_food_penalty),
                final_score=float(final_score),
                final_rank=0,
            )
        )

    scored.sort(key=lambda item: item.final_score, reverse=True)
    return [
        CandidateScore(
            candidate_id=item.candidate_id,
            lightfm_score=item.lightfm_score,
            xgboost_probability=item.xgboost_probability,
            intent_bonus=item.intent_bonus,
            macro_fit=item.macro_fit,
            mmr_penalty=item.mmr_penalty,
            repeat_food_penalty=item.repeat_food_penalty,
            final_score=item.final_score,
            final_rank=index + 1,
        )
        for index, item in enumerate(scored[:limit])
    ]


def load_model_artifacts(model_dir: str | Path) -> ModelArtifacts:
    model_path = Path(model_dir)
    pickle = _require_module("pickle")
    xgb = _require_module("xgboost")

    lightfm_path = model_path / "lightfm_model.pkl"
    lightfm_data = None
    if lightfm_path.exists():
        try:
            with lightfm_path.open("rb") as file:
                lightfm_data = pickle.load(file)
        except Exception as exc:
            _warn(f"LightFM artifact skipped: {exc}")

    xgboost_path = model_path / "xgboost_model.json"
    xgboost_model = None
    if xgboost_path.exists():
        try:
            xgboost_model = xgb.XGBClassifier()
            xgboost_model.load_model(str(xgboost_path))
        except Exception as exc:
            _warn(f"XGBoost artifact skipped: {exc}")

    return ModelArtifacts(lightfm_data=lightfm_data, xgboost_model=xgboost_model)


def process_recommendation_pipeline(
    request: RecommendationRequest,
    all_dfs: dict[str, Any],
    artifacts: ModelArtifacts | None = None,
    timings_ms: dict[str, float] | None = None,
) -> RecommendationResult:
    artifacts = artifacts or ModelArtifacts(lightfm_data=None, xgboost_model=None)
    with _timed_stage(timings_ms, "candidate_generation_ms"):
        candidates, candidate_items = generate_meal_candidates(request, all_dfs)
    if not candidates:
        return RecommendationResult(candidates=[], candidate_items=[], scores=[], timings_ms=timings_ms or {})

    with _timed_stage(timings_ms, "lightfm_ms"):
        lightfm_scores = calculate_lightfm_scores(request.user_id, candidates, candidate_items, artifacts.lightfm_data)
    with _timed_stage(timings_ms, "xgboost_ms"):
        xgboost_probabilities = calculate_xgboost_probabilities(request.user_id, candidates, candidate_items, all_dfs, artifacts.xgboost_model)
    with _timed_stage(timings_ms, "mmr_ms"):
        mmr_penalties = calculate_mmr_penalties(request, candidates, candidate_items, all_dfs)
    with _timed_stage(timings_ms, "rank_ms"):
        scores = rank_candidates(request, candidates, lightfm_scores, xgboost_probabilities, mmr_penalties, request.limit)
    ranked_ids = {score.candidate_id for score in scores}
    return RecommendationResult(
        candidates=[candidate for candidate in candidates if int(candidate["candidate_id"]) in ranked_ids],
        candidate_items=[item for item in candidate_items if int(item["candidate_id"]) in ranked_ids],
        scores=scores,
        timings_ms=timings_ms or {},
    )


def result_to_jsonable(result: RecommendationResult) -> dict[str, Any]:
    return {
        "candidates": result.candidates,
        "candidateItems": result.candidate_items,
        "scores": [score.__dict__ for score in result.scores],
        "timingsMs": result.timings_ms,
    }


def dumps_result(result: RecommendationResult) -> str:
    return json.dumps(result_to_jsonable(result), ensure_ascii=False, default=str)
