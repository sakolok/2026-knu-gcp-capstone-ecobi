ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS daily_budget_krw INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_budget_nonnegative_check'
  ) THEN
    ALTER TABLE daily_logs
      ADD CONSTRAINT daily_logs_budget_nonnegative_check
      CHECK (daily_budget_krw IS NULL OR daily_budget_krw >= 0);
  END IF;
END $$;

ALTER TABLE recommendation_runs
  ADD COLUMN IF NOT EXISTS meal_sequence SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS target_meal_budget_krw INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_meal_calories_kcal DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS meal_budget_source TEXT NOT NULL DEFAULT 'user_input',
  ADD COLUMN IF NOT EXISTS context_today_budget_krw INTEGER,
  ADD COLUMN IF NOT EXISTS context_today_spent_krw INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS context_remaining_today_budget_krw INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_meal_sequence_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_meal_sequence_check
      CHECK (meal_sequence > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_target_meal_budget_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_target_meal_budget_check
      CHECK (target_meal_budget_krw >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_target_meal_calories_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_target_meal_calories_check
      CHECK (target_meal_calories_kcal > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_meal_budget_source_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_meal_budget_source_check
      CHECK (meal_budget_source IN ('user_input', 'weekly_plan', 'auto_split'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_today_budget_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_today_budget_check
      CHECK (context_today_budget_krw IS NULL OR context_today_budget_krw >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_today_spent_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_today_spent_check
      CHECK (context_today_spent_krw >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_food_entries (
  user_food_entry_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  meal_type TEXT CHECK (meal_type IS NULL OR meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  quantity_g DOUBLE PRECISION CHECK (quantity_g IS NULL OR quantity_g > 0),
  quantity_label TEXT,
  price_krw INTEGER NOT NULL DEFAULT 0 CHECK (price_krw >= 0),
  calories_kcal DOUBLE PRECISION NOT NULL CHECK (calories_kcal >= 0),
  protein_g DOUBLE PRECISION NOT NULL CHECK (protein_g >= 0),
  fat_g DOUBLE PRECISION NOT NULL CHECK (fat_g >= 0),
  carbs_g DOUBLE PRECISION NOT NULL CHECK (carbs_g >= 0),
  input_source TEXT NOT NULL DEFAULT 'manual' CHECK (input_source IN ('manual', 'ocr', 'ai_estimated', 'imported')),
  is_reusable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE food_logs
  ALTER COLUMN food_id DROP NOT NULL;

ALTER TABLE food_logs
  ADD COLUMN IF NOT EXISTS user_food_entry_id BIGINT REFERENCES user_food_entries(user_food_entry_id);

ALTER TABLE food_logs
  DROP CONSTRAINT IF EXISTS food_logs_source_type_check;

ALTER TABLE food_logs
  ADD CONSTRAINT food_logs_source_type_check
  CHECK (source_type IN ('recommendation', 'manual', 'manual_custom'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_logs_food_source_present_check'
  ) THEN
    ALTER TABLE food_logs
      ADD CONSTRAINT food_logs_food_source_present_check
      CHECK (
        (food_id IS NOT NULL AND user_food_entry_id IS NULL)
        OR (food_id IS NULL AND user_food_entry_id IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_logs_manual_source_check'
  ) THEN
    ALTER TABLE food_logs
      ADD CONSTRAINT food_logs_manual_source_check
      CHECK (source_type <> 'manual' OR food_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_logs_manual_custom_source_check'
  ) THEN
    ALTER TABLE food_logs
      ADD CONSTRAINT food_logs_manual_custom_source_check
      CHECK (source_type <> 'manual_custom' OR user_food_entry_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_logs_quantity_present_check'
  ) THEN
    ALTER TABLE food_logs
      ADD CONSTRAINT food_logs_quantity_present_check
      CHECK (source_type = 'manual_custom' OR quantity_g IS NOT NULL OR quantity_label IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS food_logs_user_food_entry_idx
  ON food_logs(user_food_entry_id);

CREATE INDEX IF NOT EXISTS user_food_entries_user_created_idx
  ON user_food_entries(user_id, created_at DESC);
