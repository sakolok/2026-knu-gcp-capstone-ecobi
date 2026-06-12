ALTER TABLE recommendation_candidates
  ADD COLUMN IF NOT EXISTS milp_feasible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS milp_rank INTEGER,
  ADD COLUMN IF NOT EXISTS lightfm_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS xgboost_probability DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mmr_penalty DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repeat_food_penalty DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repeat_combo_penalty DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feature_snapshot JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_candidates_probability_check'
  ) THEN
    ALTER TABLE recommendation_candidates
      ADD CONSTRAINT recommendation_candidates_probability_check
      CHECK (xgboost_probability IS NULL OR (xgboost_probability >= 0 AND xgboost_probability <= 1));
  END IF;
END $$;
