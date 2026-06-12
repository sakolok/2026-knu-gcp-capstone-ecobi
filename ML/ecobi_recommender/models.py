from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


MealType = str
MealChannel = str


@dataclass(frozen=True)
class RecommendationRequest:
    user_id: int
    target_meal_calories_kcal: float
    target_meal_budget_krw: int
    meal_type: MealType
    meal_channel: MealChannel | None = None
    intent: str = "personal"
    run_id: int | None = None
    limit: int = 5
    target_meal_carbs_g: float = 0.0
    target_meal_protein_g: float = 0.0
    target_meal_fat_g: float = 0.0
    remaining_carbs_g: float = 0.0
    remaining_protein_g: float = 0.0
    remaining_fat_g: float = 0.0


@dataclass(frozen=True)
class ModelArtifacts:
    lightfm_data: Any | None
    xgboost_model: Any | None


@dataclass(frozen=True)
class CandidateScore:
    candidate_id: int
    lightfm_score: float
    xgboost_probability: float
    intent_bonus: float
    macro_fit: float
    mmr_penalty: float
    repeat_food_penalty: float
    final_score: float
    final_rank: int


@dataclass(frozen=True)
class RecommendationResult:
    candidates: list[dict[str, Any]]
    candidate_items: list[dict[str, Any]]
    scores: list[CandidateScore]
    timings_ms: dict[str, float] = field(default_factory=dict)
