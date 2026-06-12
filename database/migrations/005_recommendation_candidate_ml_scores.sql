ALTER TABLE recommendation_candidates
  ADD COLUMN milp_feasible INTEGER NOT NULL DEFAULT 1;

ALTER TABLE recommendation_candidates
  ADD COLUMN milp_rank INTEGER;

ALTER TABLE recommendation_candidates
  ADD COLUMN lightfm_score REAL;

ALTER TABLE recommendation_candidates
  ADD COLUMN xgboost_probability REAL;

ALTER TABLE recommendation_candidates
  ADD COLUMN mmr_penalty REAL NOT NULL DEFAULT 0;

ALTER TABLE recommendation_candidates
  ADD COLUMN repeat_food_penalty REAL NOT NULL DEFAULT 0;

ALTER TABLE recommendation_candidates
  ADD COLUMN repeat_combo_penalty REAL NOT NULL DEFAULT 0;

ALTER TABLE recommendation_candidates
  ADD COLUMN feature_snapshot TEXT;
