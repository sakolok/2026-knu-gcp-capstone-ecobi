# Ecobi ERD Review

Date: 2026-05-18
Source ERD: `erd_schema_comment_fixed.sql`
Revised SQL: `erd_schema_revised.sql`

## Review Verdict

The original ERD is a useful nutrition-log draft, but it is not enough for Ecobi's confirmed recommendation architecture.

The main mismatch is recommendation granularity. The original schema stores recommendations as a JSON blob in `recommend_logs.recommended_items`, while the product now recommends a full meal combination. The revised ERD normalizes meal candidates, candidate items, recommendation runs, candidate scores, user interactions, model versions, and training examples.

## Confirmed Requirements

- Recommendation unit is one meal combination, not a single food item.
- Repetition control uses both combination-level repeat penalty and food-level overlap penalty.
- Meal candidates are stored as reusable masters.
- Per-request scores and ranks are stored separately from candidate masters.
- Model operation uses daily batch training plus real-time serving.
- Active model promotion requires offline metrics to pass thresholds.
- Training uses all historical data with higher weight for recent interactions.
- Cold start starts with rule-based scoring, then blends LightFM/XGBoost as interactions accumulate.
- XGBoost labels reflect selected, corrected, and deleted outcomes.
- Training examples store feature and label snapshots for reproducibility.
- Candidate fingerprint uses sorted `food_id + quantity_bucket`.
- User profiles store current settings only.
- Body weight trend is stored separately in `body_measurements`.
- Recommendation runs store `profile_snapshot` for replay/debugging.
- Food catalog supports real products, serving menus, and gram-based ingredients.
- Weekly budget is the primary budget unit.
- Shock recovery is included fully with base plan, revisions, revision meals, and outcomes.
- Recommendation-related interactions are logged: `impressed`, `clicked`, `accepted`, `rejected`, `skipped`, `logged`, `corrected`, `deleted`.
- Allergens are normalized. Preferences support food, tag, and free-text targets.
- Selecting a recommendation candidate means the user ate it.
- Selection creates `food_logs` from `meal_candidate_items`.
- Food logs allow soft delete and correction signals.

## What Changed From The Original ERD

| Original Area | Original Shape | Revised Shape | Reason |
|---|---|---|---|
| `users` | User identity plus `gender`, `birth_date` | Identity only; profile fields move to `user_profiles` | Profile can be manual or calculated and is used as recommendation context |
| `user_profiles` | Height, weight, target weight, activity, daily budget | Current settings: goal, energy target source, BMR/TDEE, target calories, weekly budget, meal channels | Matches onboarding and weekly-planning requirements |
| Body trend | Not present | New `body_measurements` | Weight changes are time-series data, not profile settings |
| `foods` | Food nutrients, price, loose tags/allergy text | Adds unit type, meal channel, serving labels, active state, structured tags/allergens | MILP and recommendation features need structured constraints |
| Allergies | `foods.allergy_info` text | `allergens`, `food_allergens`, `user_allergens` | Allergens are hard-exclude safety constraints |
| Preferences | Loose `target_type`, `target_value` | Preference type plus food/tag/free-text target with strength | Supports hard avoid, dislike, and prefer signals |
| Recommendation log | `recommend_logs` with JSONB `recommended_items` | `recommendation_runs` + `recommendation_candidates` | Candidate-level scores, ranks, labels, and feature snapshots are required |
| Meal candidates | Not present | `meal_candidates`, `meal_candidate_items` | Recommendation unit is a meal combination |
| Repetition control | Not present | Candidate fingerprint plus repeat penalties | Supports same-combo and overlapping-food penalties |
| Weekly plans | Not present | `weekly_plans`, `weekly_plan_meals` | Weekly budget and recovery require a base plan |
| Shock recovery | Not present | `shock_events`, `plan_revisions`, `plan_revision_meals`, `recovery_outcomes` | Base plan must not be overwritten by recovery revisions |
| Food logs | Food-only record with optional `recommend_id` | Food line items linked to recommendation candidate, source type, soft delete | Selection creates consumed food logs; corrections remain auditable |
| Interactions | Loose item interaction | Candidate/run-aware recommendation events | LightFM/XGBoost need exposure and outcome signals |
| Model operations | Not present | `training_jobs`, `model_versions`, `training_examples` | Batch training, active promotion, and reproducible training need first-class tables |
| IDs | `serial4` PKs with many `int8` FKs | `bigserial` PKs with `bigint` FKs | Removes type mismatch and future-proofs growth |
| Constraints | Many nullable FKs and unconstrained strings | CHECK constraints, uniqueness, partial indexes | Prevents invalid training/recommendation data |

## Revised Data Flow

```text
User setup
  users
    -> user_profiles
    -> body_measurements
    -> user_allergens / user_preferences

Food catalog
  foods
    -> food_allergens
    -> food_tag_map

Candidate generation
  foods
    -> meal_candidate_items
    -> meal_candidates

Weekly plan
  user_profiles + meal_candidates
    -> weekly_plans
    -> weekly_plan_meals

Recommendation request
  recommendation_runs
    -> recommendation_candidates
      -> user_item_interactions
      -> food_logs if selected

Training
  food_logs + user_item_interactions + recommendation_candidates
    -> training_jobs
    -> training_examples
    -> model_versions

Shock recovery
  weekly_plans
    -> shock_events
    -> plan_revisions
    -> plan_revision_meals
    -> recovery_outcomes
```

## Recommendation Pipeline Mapping

```text
MILP
  input: user profile snapshot, allergens, preferences, weekly budget, food catalog
  output: feasible meal candidates
  stored in: meal_candidates, meal_candidate_items, recommendation_candidates.milp_*

LightFM
  input: user_item_interactions, user profile features, meal candidate features
  output: retrieval score
  stored in: recommendation_candidates.lightfm_score

XGBoost
  input: user/context/candidate feature snapshot plus LightFM score
  output: selection probability
  stored in: recommendation_candidates.xgboost_probability

MMR / repeat control
  input: recent food_logs, candidate_fingerprint, candidate items
  output: repeat penalties and final rank
  stored in: recommendation_candidates.mmr_penalty,
             recommendation_candidates.repeat_food_penalty,
             recommendation_candidates.repeat_combo_penalty,
             recommendation_candidates.final_score,
             recommendation_candidates.final_rank
```

## Key Tables In The Revised Schema

### Profile And Measurement

- `user_profiles`: Current user settings. One row per user.
- `body_measurements`: Weight and body metric time series.
- `recommendation_runs.profile_snapshot`: Recommendation-time profile replay.

### Food And Preference

- `foods`: Food/product/menu/ingredient master.
- `allergens`, `food_allergens`, `user_allergens`: Hard safety constraints.
- `tags`, `food_tag_map`, `user_preferences`: Soft and hard preference features.

### Meal Candidate

- `meal_candidates`: Reusable meal combination master.
- `meal_candidate_items`: Foods inside a meal candidate.
- `candidate_fingerprint`: Dedupe and repeat control key.

### Recommendation

- `recommendation_runs`: One recommendation request.
- `recommendation_candidates`: Candidate-level score, rank, feature snapshot, and selection outcome.
- `user_item_interactions`: Recommendation event stream for model learning.

### Planning And Recovery

- `weekly_plans`: Weekly budget and base plan.
- `weekly_plan_meals`: Planned meal slots.
- `shock_events`: Budget shock events.
- `plan_revisions`: Recovery plan versions.
- `plan_revision_meals`: Meal-level diff from base plan.
- `recovery_outcomes`: Feasible/accepted/success facts.

### Model Operations

- `training_jobs`: Batch training execution.
- `model_versions`: Model artifacts, offline metrics, active promotion.
- `training_examples`: Feature/label snapshots used by a training job.

## Implementation Notes

- Treat `recommendation_candidates` row creation as an impression event boundary. If it is displayed to the user, also write `user_item_interactions.interaction_type = 'impressed'`.
- When `recommendation_candidates.was_selected = true`, create `food_logs` rows from `meal_candidate_items` and write `accepted` plus `logged` interactions.
- If a selected recommendation is later deleted, soft-delete the corresponding `food_logs` rows and write a `deleted` interaction.
- XGBoost labels should be built from impressed candidates only. Do not treat candidates that were never displayed as negative labels.
- `training_examples` should snapshot both labels and feature input at training time. Do not depend on mutable live tables to explain an old model.
- `model_versions` allows one active model per model type with a partial unique index.
- `weekly_plans` allows one active plan per user with a partial unique index.

## Remaining Product Decisions

These do not block the ERD draft, but should be finalized before backend implementation:

- Exact threshold for cold start, hybrid, and personalized strategy.
- Offline metric thresholds for model promotion.
- Exact recency weighting function and half-life.
- Quantity bucket rules for `candidate_fingerprint`.
- Whether meal candidates are global or can be user-specific in later versions.
- Whether exercise recommendations are in scope for the first backend implementation.
- Whether anonymous users need persisted profiles before login.

## Recommended Next Step

Use `erd_schema_revised.sql` as the backend schema draft, then implement in this order:

1. Core profile/catalog schema.
2. Meal candidate and recommendation run schema.
3. Food log and interaction write paths.
4. Weekly plan and shock recovery schema.
5. Training job/model version/training example pipeline.
6. MILP feasible candidate generation.
7. LightFM retrieval.
8. XGBoost rerank.
9. MMR/repeat penalty.
10. End-to-end recommendation QA and offline metric checks.
