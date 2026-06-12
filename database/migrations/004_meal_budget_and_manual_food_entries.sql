ALTER TABLE daily_logs
  ADD COLUMN daily_budget_krw INTEGER CHECK (daily_budget_krw IS NULL OR daily_budget_krw >= 0);

ALTER TABLE recommendation_runs
  ADD COLUMN meal_sequence INTEGER NOT NULL DEFAULT 1 CHECK (meal_sequence > 0);

ALTER TABLE recommendation_runs
  ADD COLUMN target_meal_budget_krw INTEGER NOT NULL DEFAULT 0 CHECK (target_meal_budget_krw >= 0);

ALTER TABLE recommendation_runs
  ADD COLUMN target_meal_calories_kcal REAL NOT NULL DEFAULT 1 CHECK (target_meal_calories_kcal > 0);

ALTER TABLE recommendation_runs
  ADD COLUMN meal_budget_source TEXT NOT NULL DEFAULT 'user_input' CHECK (meal_budget_source IN ('user_input', 'weekly_plan', 'auto_split'));

ALTER TABLE recommendation_runs
  ADD COLUMN context_today_budget_krw INTEGER CHECK (context_today_budget_krw IS NULL OR context_today_budget_krw >= 0);

ALTER TABLE recommendation_runs
  ADD COLUMN context_today_spent_krw INTEGER NOT NULL DEFAULT 0 CHECK (context_today_spent_krw >= 0);

ALTER TABLE recommendation_runs
  ADD COLUMN context_remaining_today_budget_krw INTEGER;

CREATE TABLE IF NOT EXISTS user_food_entries (
  user_food_entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  meal_type TEXT CHECK (meal_type IS NULL OR meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  quantity_g REAL CHECK (quantity_g IS NULL OR quantity_g > 0),
  quantity_label TEXT,
  price_krw INTEGER NOT NULL DEFAULT 0 CHECK (price_krw >= 0),
  calories_kcal REAL NOT NULL CHECK (calories_kcal >= 0),
  protein_g REAL NOT NULL CHECK (protein_g >= 0),
  fat_g REAL NOT NULL CHECK (fat_g >= 0),
  carbs_g REAL NOT NULL CHECK (carbs_g >= 0),
  input_source TEXT NOT NULL DEFAULT 'manual' CHECK (input_source IN ('manual', 'ocr', 'ai_estimated', 'imported')),
  is_reusable INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE food_logs_new (
  food_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_log_id INTEGER REFERENCES daily_logs(daily_log_id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  food_id INTEGER REFERENCES foods(food_id),
  user_food_entry_id INTEGER REFERENCES user_food_entries(user_food_entry_id),
  recommendation_candidate_id INTEGER REFERENCES recommendation_candidates(recommendation_candidate_id),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  quantity_g REAL,
  quantity_label TEXT,
  spent_money_krw INTEGER NOT NULL DEFAULT 0 CHECK (spent_money_krw >= 0),
  consumed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_type TEXT NOT NULL CHECK (source_type IN ('recommendation', 'manual', 'manual_custom')),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (food_id IS NOT NULL AND user_food_entry_id IS NULL)
    OR (food_id IS NULL AND user_food_entry_id IS NOT NULL)
  ),
  CHECK (source_type <> 'recommendation' OR (recommendation_candidate_id IS NOT NULL AND food_id IS NOT NULL)),
  CHECK (source_type <> 'manual' OR food_id IS NOT NULL),
  CHECK (source_type <> 'manual_custom' OR user_food_entry_id IS NOT NULL),
  CHECK (source_type = 'manual_custom' OR quantity_g IS NOT NULL OR quantity_label IS NOT NULL)
);

INSERT INTO food_logs_new (
  food_log_id,
  daily_log_id,
  user_id,
  food_id,
  user_food_entry_id,
  recommendation_candidate_id,
  meal_type,
  quantity_g,
  quantity_label,
  spent_money_krw,
  consumed_at,
  source_type,
  deleted_at,
  created_at,
  updated_at
)
SELECT
  food_log_id,
  daily_log_id,
  user_id,
  food_id,
  NULL,
  recommendation_candidate_id,
  meal_type,
  quantity_g,
  quantity_label,
  spent_money_krw,
  consumed_at,
  source_type,
  deleted_at,
  created_at,
  updated_at
FROM food_logs;

DROP TABLE food_logs;

ALTER TABLE food_logs_new RENAME TO food_logs;

CREATE INDEX IF NOT EXISTS food_logs_user_consumed_at_idx
  ON food_logs(user_id, consumed_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS food_logs_recommendation_candidate_idx
  ON food_logs(recommendation_candidate_id);

CREATE INDEX IF NOT EXISTS food_logs_user_food_entry_idx
  ON food_logs(user_food_entry_id);

CREATE INDEX IF NOT EXISTS user_food_entries_user_created_idx
  ON user_food_entries(user_id, created_at DESC);
