"""Compatibility wrappers for the old notebook-generated result.py import path."""

from __future__ import annotations

from typing import Any

from ecobi_recommender.models import ModelArtifacts, RecommendationRequest
from ecobi_recommender.pipeline import (
    calculate_lightfm_scores as _calculate_lightfm_scores,
    calculate_mmr_penalties,
    calculate_xgboost_probabilities,
    generate_meal_candidates as _generate_meal_candidates,
    process_recommendation_pipeline as _process_recommendation_pipeline,
)


def generate_meal_candidates(
    user_id: int,
    target_meal_calories_kcal: float,
    target_meal_budget_krw: int,
    all_dfs: dict[str, Any],
    meal_type: str = "lunch",
    meal_channel: str | None = None,
    limit: int = 5,
):
    request = RecommendationRequest(
        user_id=user_id,
        target_meal_calories_kcal=target_meal_calories_kcal,
        target_meal_budget_krw=target_meal_budget_krw,
        meal_type=meal_type,
        meal_channel=meal_channel,
        limit=limit,
    )
    return _generate_meal_candidates(request, all_dfs)


def calculate_lightfm_scores(user_id: int, meal_candidates: list[dict[str, Any]], lightfm_data: Any, meal_candidate_items=None):
    return _calculate_lightfm_scores(user_id, meal_candidates, meal_candidate_items or [], lightfm_data)


def process_recommendation_pipeline(
    run_id: int,
    all_dfs: dict[str, Any],
    xgb_model: Any | None = None,
    lightfm_data: Any | None = None,
    override_cals: float | None = None,
    override_budget: int | None = None,
):
    from ecobi_recommender.pipeline import get_meal_conditions

    request = get_meal_conditions(run_id, all_dfs)
    if request is None:
        return None
    if override_cals is not None or override_budget is not None:
        request = RecommendationRequest(
            run_id=request.run_id,
            user_id=request.user_id,
            meal_type=request.meal_type,
            meal_channel=request.meal_channel,
            target_meal_calories_kcal=override_cals or request.target_meal_calories_kcal,
            target_meal_budget_krw=override_budget or request.target_meal_budget_krw,
            target_meal_carbs_g=request.target_meal_carbs_g,
            target_meal_protein_g=request.target_meal_protein_g,
            target_meal_fat_g=request.target_meal_fat_g,
            remaining_carbs_g=request.remaining_carbs_g,
            remaining_protein_g=request.remaining_protein_g,
            remaining_fat_g=request.remaining_fat_g,
            limit=request.limit,
        )
    return _process_recommendation_pipeline(
        request,
        all_dfs,
        ModelArtifacts(lightfm_data=lightfm_data, xgboost_model=xgb_model),
    )
