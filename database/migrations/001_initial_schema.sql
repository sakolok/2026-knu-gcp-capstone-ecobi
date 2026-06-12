CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('maintain', 'cut', 'bulk')),
  sex TEXT CHECK (sex IS NULL OR sex IN ('male', 'female')),
  birth_date TEXT,
  age_years_snapshot INTEGER,
  height_cm REAL,
  target_weight_kg REAL,
  activity_level TEXT CHECK (activity_level IS NULL OR activity_level IN ('sedentary', 'light', 'moderate', 'active', 'athlete')),
  activity_factor REAL,
  energy_target_source TEXT NOT NULL CHECK (energy_target_source IN ('calculated', 'manual')),
  bmr_kcal REAL,
  tdee_kcal REAL,
  target_calories_kcal REAL NOT NULL CHECK (target_calories_kcal > 0),
  target_calorie_delta_kcal INTEGER,
  weekly_budget_krw INTEGER NOT NULL CHECK (weekly_budget_krw > 0),
  available_meal_channels TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS body_measurements (
  measurement_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  measured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  weight_kg REAL NOT NULL CHECK (weight_kg > 0),
  height_cm REAL,
  body_fat_percent REAL,
  skeletal_muscle_kg REAL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'device', 'imported')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, measured_at)
);

CREATE TABLE IF NOT EXISTS foods (
  food_id INTEGER PRIMARY KEY AUTOINCREMENT,
  food_name TEXT NOT NULL,
  food_unit_type TEXT NOT NULL CHECK (food_unit_type IN ('unit_item', 'serving_menu', 'ingredient_gram')),
  meal_channel TEXT NOT NULL CHECK (meal_channel IN ('convenience_store', 'cafeteria', 'home_meal', 'delivery')),
  category TEXT,
  default_quantity_g REAL,
  serving_size_g REAL NOT NULL DEFAULT 100 CHECK (serving_size_g > 0),
  serving_unit_label TEXT,
  price_krw INTEGER NOT NULL CHECK (price_krw >= 0),
  calories_kcal REAL NOT NULL CHECK (calories_kcal >= 0),
  protein_g REAL NOT NULL CHECK (protein_g >= 0),
  fat_g REAL NOT NULL CHECK (fat_g >= 0),
  carbs_g REAL NOT NULL CHECK (carbs_g >= 0),
  is_variable_amount INTEGER NOT NULL DEFAULT 0,
  source_label TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS allergens (
  allergen_id INTEGER PRIMARY KEY AUTOINCREMENT,
  allergen_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS food_allergens (
  food_id INTEGER NOT NULL REFERENCES foods(food_id) ON DELETE CASCADE,
  allergen_id INTEGER NOT NULL REFERENCES allergens(allergen_id) ON DELETE CASCADE,
  PRIMARY KEY (food_id, allergen_id)
);

CREATE TABLE IF NOT EXISTS user_allergens (
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  allergen_id INTEGER NOT NULL REFERENCES allergens(allergen_id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'exclude' CHECK (severity IN ('exclude', 'warn')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, allergen_id)
);

CREATE TABLE IF NOT EXISTS tags (
  tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag_name TEXT NOT NULL UNIQUE,
  tag_type TEXT NOT NULL DEFAULT 'food_attribute',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS food_tag_map (
  food_id INTEGER NOT NULL REFERENCES foods(food_id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  PRIMARY KEY (food_id, tag_id)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  preference_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  preference_type TEXT NOT NULL CHECK (preference_type IN ('prefer', 'dislike', 'avoid')),
  target_type TEXT NOT NULL CHECK (target_type IN ('food', 'tag', 'free_text')),
  food_id INTEGER REFERENCES foods(food_id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(tag_id) ON DELETE CASCADE,
  target_value TEXT,
  strength INTEGER NOT NULL DEFAULT 3 CHECK (strength BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meal_candidates (
  candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_name TEXT,
  candidate_fingerprint TEXT NOT NULL UNIQUE,
  fingerprint_version TEXT NOT NULL DEFAULT 'v1',
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  meal_channel TEXT NOT NULL CHECK (meal_channel IN ('convenience_store', 'cafeteria', 'home_meal', 'delivery')),
  total_price_krw INTEGER NOT NULL CHECK (total_price_krw >= 0),
  total_calories_kcal REAL NOT NULL,
  total_protein_g REAL NOT NULL,
  total_fat_g REAL NOT NULL,
  total_carbs_g REAL NOT NULL,
  generation_source TEXT NOT NULL DEFAULT 'seed' CHECK (generation_source IN ('milp', 'manual', 'seed')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meal_candidate_items (
  meal_candidate_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES meal_candidates(candidate_id) ON DELETE CASCADE,
  food_id INTEGER NOT NULL REFERENCES foods(food_id),
  quantity_g REAL,
  quantity_label TEXT,
  quantity_bucket TEXT NOT NULL,
  item_order INTEGER NOT NULL DEFAULT 1,
  item_price_krw INTEGER NOT NULL CHECK (item_price_krw >= 0),
  item_calories_kcal REAL NOT NULL,
  item_protein_g REAL NOT NULL,
  item_fat_g REAL NOT NULL,
  item_carbs_g REAL NOT NULL,
  UNIQUE (candidate_id, item_order)
);

CREATE TABLE IF NOT EXISTS weekly_plans (
  weekly_plan_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES user_profiles(profile_id),
  plan_window_start TEXT NOT NULL,
  plan_window_end TEXT NOT NULL,
  weekly_budget_krw INTEGER NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('maintain', 'cut', 'bulk')),
  target_calories_kcal REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_logs (
  daily_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  weekly_plan_id INTEGER REFERENCES weekly_plans(weekly_plan_id),
  log_date TEXT NOT NULL DEFAULT CURRENT_DATE,
  calculated_bmr_kcal REAL,
  calculated_tdee_kcal REAL,
  target_calories_kcal REAL,
  total_calories_in_kcal REAL NOT NULL DEFAULT 0,
  total_calories_out_kcal REAL NOT NULL DEFAULT 0,
  total_spent_krw INTEGER NOT NULL DEFAULT 0,
  remaining_weekly_budget_krw INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, log_date)
);

CREATE TABLE IF NOT EXISTS recommendation_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  daily_log_id INTEGER REFERENCES daily_logs(daily_log_id),
  weekly_plan_id INTEGER REFERENCES weekly_plans(weekly_plan_id),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  context_meal_type TEXT NOT NULL CHECK (context_meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  context_time_of_day TEXT,
  context_remaining_budget_krw INTEGER,
  context_remaining_calories_kcal REAL,
  context_week_start TEXT,
  context_week_end TEXT,
  context_lookback_days INTEGER NOT NULL DEFAULT 7 CHECK (context_lookback_days > 0),
  strategy_type TEXT NOT NULL CHECK (strategy_type IN ('cold_start', 'hybrid', 'personalized')),
  user_interaction_count INTEGER NOT NULL DEFAULT 0,
  profile_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommendation_candidates (
  recommendation_candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES recommendation_runs(run_id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES meal_candidates(candidate_id),
  rule_score REAL,
  final_score REAL,
  final_rank INTEGER CHECK (final_rank IS NULL OR final_rank > 0),
  score_breakdown TEXT,
  was_selected INTEGER NOT NULL DEFAULT 0,
  selected_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (run_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS food_logs (
  food_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_log_id INTEGER REFERENCES daily_logs(daily_log_id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  food_id INTEGER NOT NULL REFERENCES foods(food_id),
  recommendation_candidate_id INTEGER REFERENCES recommendation_candidates(recommendation_candidate_id),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  quantity_g REAL,
  quantity_label TEXT,
  spent_money_krw INTEGER NOT NULL DEFAULT 0 CHECK (spent_money_krw >= 0),
  consumed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_type TEXT NOT NULL CHECK (source_type IN ('recommendation', 'manual')),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_item_interactions (
  interaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  food_id INTEGER REFERENCES foods(food_id) ON DELETE CASCADE,
  candidate_id INTEGER REFERENCES meal_candidates(candidate_id) ON DELETE CASCADE,
  recommendation_candidate_id INTEGER REFERENCES recommendation_candidates(recommendation_candidate_id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES recommendation_runs(run_id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('impressed', 'clicked', 'accepted', 'rejected', 'skipped', 'logged', 'corrected', 'deleted')),
  interaction_weight REAL NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS body_measurements_user_measured_at_idx
  ON body_measurements(user_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS foods_channel_active_idx
  ON foods(meal_channel, is_active);

CREATE INDEX IF NOT EXISTS meal_candidates_channel_type_active_idx
  ON meal_candidates(meal_channel, meal_type, is_active);

CREATE INDEX IF NOT EXISTS recommendation_runs_user_requested_at_idx
  ON recommendation_runs(user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS recommendation_candidates_run_rank_idx
  ON recommendation_candidates(run_id, final_rank);

CREATE INDEX IF NOT EXISTS food_logs_user_consumed_at_idx
  ON food_logs(user_id, consumed_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS user_item_interactions_user_created_idx
  ON user_item_interactions(user_id, created_at DESC);
