ALTER TABLE recommendation_runs
  ADD COLUMN IF NOT EXISTS context_remaining_carbs_g DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS context_remaining_protein_g DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS context_remaining_fat_g DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS target_meal_carbs_g DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS target_meal_protein_g DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS target_meal_fat_g DOUBLE PRECISION;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_remaining_carbs_nonnegative_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_remaining_carbs_nonnegative_check
      CHECK (context_remaining_carbs_g IS NULL OR context_remaining_carbs_g >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_remaining_protein_nonnegative_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_remaining_protein_nonnegative_check
      CHECK (context_remaining_protein_g IS NULL OR context_remaining_protein_g >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_remaining_fat_nonnegative_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_remaining_fat_nonnegative_check
      CHECK (context_remaining_fat_g IS NULL OR context_remaining_fat_g >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_target_meal_carbs_nonnegative_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_target_meal_carbs_nonnegative_check
      CHECK (target_meal_carbs_g IS NULL OR target_meal_carbs_g >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_target_meal_protein_nonnegative_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_target_meal_protein_nonnegative_check
      CHECK (target_meal_protein_g IS NULL OR target_meal_protein_g >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_target_meal_fat_nonnegative_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_target_meal_fat_nonnegative_check
      CHECK (target_meal_fat_g IS NULL OR target_meal_fat_g >= 0);
  END IF;
END $$;
