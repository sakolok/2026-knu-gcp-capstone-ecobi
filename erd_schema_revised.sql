-- Ecobi revised ERD schema draft
-- Generated from current product requirements on 2026-05-18.
-- Target database: PostgreSQL.

CREATE TABLE users (
  user_id bigserial PRIMARY KEY,
  email varchar(255) UNIQUE,
  display_name varchar(50),
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_profiles (
  profile_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  goal_type varchar(20) NOT NULL,
  sex varchar(20),
  birth_date date,
  age_years_snapshot int,
  height_cm numeric(6, 2),
  target_weight_kg numeric(6, 2),
  activity_level varchar(20),
  activity_factor double precision,
  energy_target_source varchar(20) NOT NULL,
  bmr_kcal numeric(8, 2),
  tdee_kcal numeric(8, 2),
  target_calories_kcal numeric(8, 2) NOT NULL,
  target_calorie_delta_kcal int,
  weekly_budget_krw int NOT NULL,
  available_meal_channels varchar(30)[] NOT NULL DEFAULT ARRAY[]::varchar[],
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_profiles_goal_type_check
    CHECK (goal_type IN ('maintain', 'cut', 'bulk')),
  CONSTRAINT user_profiles_sex_check
    CHECK (sex IS NULL OR sex IN ('male', 'female')),
  CONSTRAINT user_profiles_activity_level_check
    CHECK (activity_level IS NULL OR activity_level IN ('sedentary', 'light', 'moderate', 'active', 'athlete')),
  CONSTRAINT user_profiles_energy_target_source_check
    CHECK (energy_target_source IN ('calculated', 'manual')),
  CONSTRAINT user_profiles_calculated_energy_requires_inputs_check
    CHECK (
      energy_target_source = 'manual'
      OR (
        sex IS NOT NULL
        AND age_years_snapshot IS NOT NULL
        AND height_cm IS NOT NULL
        AND activity_level IS NOT NULL
        AND activity_factor IS NOT NULL
        AND bmr_kcal IS NOT NULL
        AND tdee_kcal IS NOT NULL
      )
    ),
  CONSTRAINT user_profiles_channels_check
    CHECK (
      available_meal_channels <@ ARRAY[
        'convenience_store',
        'cafeteria',
        'home_meal',
        'delivery'
      ]::varchar[]
    ),
  CONSTRAINT user_profiles_budget_positive_check
    CHECK (weekly_budget_krw > 0),
  CONSTRAINT user_profiles_target_calories_positive_check
    CHECK (target_calories_kcal > 0)
);

CREATE TABLE body_measurements (
  measurement_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  measured_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  weight_kg numeric(6, 2) NOT NULL,
  height_cm numeric(6, 2),
  body_fat_percent numeric(5, 2),
  skeletal_muscle_kg numeric(6, 2),
  source varchar(20) NOT NULL DEFAULT 'manual',
  note text,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT body_measurements_source_check
    CHECK (source IN ('manual', 'device', 'imported')),
  CONSTRAINT body_measurements_weight_positive_check
    CHECK (weight_kg > 0),
  CONSTRAINT body_measurements_unique_time UNIQUE (user_id, measured_at)
);

CREATE TABLE foods (
  food_id bigserial PRIMARY KEY,
  food_name varchar(100) NOT NULL,
  food_unit_type varchar(30) NOT NULL,
  meal_channel varchar(30) NOT NULL,
  category varchar(30),
  default_quantity_g numeric(8, 2),
  serving_size_g numeric(8, 2) NOT NULL DEFAULT 100,
  serving_unit_label varchar(30),
  price_krw int NOT NULL,
  calories_kcal numeric(10, 2) NOT NULL,
  protein_g numeric(10, 2) NOT NULL,
  fat_g numeric(10, 2) NOT NULL,
  carbs_g numeric(10, 2) NOT NULL,
  protein_per_price double precision GENERATED ALWAYS AS (
    protein_g::double precision / NULLIF(price_krw, 0)::double precision
  ) STORED,
  is_variable_amount boolean NOT NULL DEFAULT false,
  source_label varchar(100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT foods_unit_type_check
    CHECK (food_unit_type IN ('unit_item', 'serving_menu', 'ingredient_gram')),
  CONSTRAINT foods_meal_channel_check
    CHECK (meal_channel IN ('convenience_store', 'cafeteria', 'home_meal', 'delivery')),
  CONSTRAINT foods_price_nonnegative_check
    CHECK (price_krw >= 0),
  CONSTRAINT foods_nutrition_nonnegative_check
    CHECK (calories_kcal >= 0 AND protein_g >= 0 AND fat_g >= 0 AND carbs_g >= 0),
  CONSTRAINT foods_serving_positive_check
    CHECK (serving_size_g > 0)
);

CREATE TABLE allergens (
  allergen_id bigserial PRIMARY KEY,
  allergen_name varchar(80) NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE food_allergens (
  food_id bigint NOT NULL REFERENCES foods(food_id) ON DELETE CASCADE,
  allergen_id bigint NOT NULL REFERENCES allergens(allergen_id) ON DELETE CASCADE,
  PRIMARY KEY (food_id, allergen_id)
);

CREATE TABLE user_allergens (
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  allergen_id bigint NOT NULL REFERENCES allergens(allergen_id) ON DELETE CASCADE,
  severity varchar(20) NOT NULL DEFAULT 'exclude',
  note text,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, allergen_id),
  CONSTRAINT user_allergens_severity_check
    CHECK (severity IN ('exclude', 'warn'))
);

CREATE TABLE tags (
  tag_id bigserial PRIMARY KEY,
  tag_name varchar(80) NOT NULL UNIQUE,
  tag_type varchar(30) NOT NULL DEFAULT 'food_attribute',
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE food_tag_map (
  food_id bigint NOT NULL REFERENCES foods(food_id) ON DELETE CASCADE,
  tag_id bigint NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  PRIMARY KEY (food_id, tag_id)
);

CREATE TABLE user_preferences (
  preference_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  preference_type varchar(20) NOT NULL,
  target_type varchar(20) NOT NULL,
  food_id bigint REFERENCES foods(food_id) ON DELETE CASCADE,
  tag_id bigint REFERENCES tags(tag_id) ON DELETE CASCADE,
  target_value text,
  strength smallint NOT NULL DEFAULT 3,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_preferences_preference_type_check
    CHECK (preference_type IN ('prefer', 'dislike', 'avoid')),
  CONSTRAINT user_preferences_target_type_check
    CHECK (target_type IN ('food', 'tag', 'free_text')),
  CONSTRAINT user_preferences_strength_check
    CHECK (strength BETWEEN 1 AND 5),
  CONSTRAINT user_preferences_target_check
    CHECK (
      (target_type = 'food' AND food_id IS NOT NULL AND tag_id IS NULL AND target_value IS NULL)
      OR (target_type = 'tag' AND food_id IS NULL AND tag_id IS NOT NULL AND target_value IS NULL)
      OR (target_type = 'free_text' AND food_id IS NULL AND tag_id IS NULL AND target_value IS NOT NULL)
    )
);

CREATE TABLE meal_candidates (
  candidate_id bigserial PRIMARY KEY,
  candidate_name varchar(160),
  candidate_fingerprint varchar(255) NOT NULL UNIQUE,
  fingerprint_version varchar(20) NOT NULL DEFAULT 'v1',
  meal_type varchar(20) NOT NULL,
  meal_channel varchar(30) NOT NULL,
  total_price_krw int NOT NULL,
  total_calories_kcal numeric(10, 2) NOT NULL,
  total_protein_g numeric(10, 2) NOT NULL,
  total_fat_g numeric(10, 2) NOT NULL,
  total_carbs_g numeric(10, 2) NOT NULL,
  generation_source varchar(30) NOT NULL DEFAULT 'milp',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT meal_candidates_meal_type_check
    CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  CONSTRAINT meal_candidates_meal_channel_check
    CHECK (meal_channel IN ('convenience_store', 'cafeteria', 'home_meal', 'delivery')),
  CONSTRAINT meal_candidates_generation_source_check
    CHECK (generation_source IN ('milp', 'manual', 'seed')),
  CONSTRAINT meal_candidates_total_price_nonnegative_check
    CHECK (total_price_krw >= 0)
);

CREATE TABLE meal_candidate_items (
  meal_candidate_item_id bigserial PRIMARY KEY,
  candidate_id bigint NOT NULL REFERENCES meal_candidates(candidate_id) ON DELETE CASCADE,
  food_id bigint NOT NULL REFERENCES foods(food_id),
  quantity_g numeric(8, 2),
  quantity_label varchar(30),
  quantity_bucket varchar(30) NOT NULL,
  item_order smallint NOT NULL DEFAULT 1,
  item_price_krw int NOT NULL,
  item_calories_kcal numeric(10, 2) NOT NULL,
  item_protein_g numeric(10, 2) NOT NULL,
  item_fat_g numeric(10, 2) NOT NULL,
  item_carbs_g numeric(10, 2) NOT NULL,
  CONSTRAINT meal_candidate_items_order_unique UNIQUE (candidate_id, item_order),
  CONSTRAINT meal_candidate_items_quantity_present_check
    CHECK (quantity_g IS NOT NULL OR quantity_label IS NOT NULL),
  CONSTRAINT meal_candidate_items_price_nonnegative_check
    CHECK (item_price_krw >= 0)
);

CREATE TABLE weekly_plans (
  weekly_plan_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  profile_id bigint REFERENCES user_profiles(profile_id),
  plan_window_start date NOT NULL,
  plan_window_end date NOT NULL,
  weekly_budget_krw int NOT NULL,
  goal_type varchar(20) NOT NULL,
  target_calories_kcal numeric(8, 2) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  generated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT weekly_plans_goal_type_check
    CHECK (goal_type IN ('maintain', 'cut', 'bulk')),
  CONSTRAINT weekly_plans_status_check
    CHECK (status IN ('active', 'superseded', 'archived')),
  CONSTRAINT weekly_plans_window_check
    CHECK (plan_window_end >= plan_window_start)
);

CREATE TABLE weekly_plan_meals (
  weekly_plan_meal_id bigserial PRIMARY KEY,
  weekly_plan_id bigint NOT NULL REFERENCES weekly_plans(weekly_plan_id) ON DELETE CASCADE,
  day_index smallint NOT NULL,
  meal_type varchar(20) NOT NULL,
  candidate_id bigint NOT NULL REFERENCES meal_candidates(candidate_id),
  planned_price_krw int NOT NULL,
  planned_calories_kcal numeric(10, 2) NOT NULL,
  planned_protein_g numeric(10, 2) NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT weekly_plan_meals_day_index_check
    CHECK (day_index BETWEEN 0 AND 6),
  CONSTRAINT weekly_plan_meals_meal_type_check
    CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  CONSTRAINT weekly_plan_meals_unique_slot UNIQUE (weekly_plan_id, day_index, meal_type)
);

CREATE TABLE daily_logs (
  daily_log_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  weekly_plan_id bigint REFERENCES weekly_plans(weekly_plan_id),
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  calculated_bmr_kcal numeric(8, 2),
  calculated_tdee_kcal numeric(8, 2),
  target_calories_kcal numeric(8, 2),
  daily_budget_krw int,
  total_calories_in_kcal numeric(10, 2) NOT NULL DEFAULT 0,
  total_calories_out_kcal numeric(10, 2) NOT NULL DEFAULT 0,
  total_spent_krw int NOT NULL DEFAULT 0,
  remaining_weekly_budget_krw int,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT daily_logs_unique_user_date UNIQUE (user_id, log_date),
  CONSTRAINT daily_logs_budget_nonnegative_check
    CHECK (daily_budget_krw IS NULL OR daily_budget_krw >= 0)
);

CREATE TABLE training_jobs (
  training_job_id bigserial PRIMARY KEY,
  job_type varchar(30) NOT NULL,
  status varchar(20) NOT NULL,
  started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamp,
  dataset_start_date date,
  dataset_end_date date,
  training_config jsonb,
  error_message text,
  CONSTRAINT training_jobs_job_type_check
    CHECK (job_type IN ('lightfm', 'xgboost', 'full_pipeline')),
  CONSTRAINT training_jobs_status_check
    CHECK (status IN ('running', 'succeeded', 'failed')),
  CONSTRAINT training_jobs_dataset_window_check
    CHECK (dataset_end_date IS NULL OR dataset_start_date IS NULL OR dataset_end_date >= dataset_start_date)
);

CREATE TABLE model_versions (
  model_version_id bigserial PRIMARY KEY,
  training_job_id bigint REFERENCES training_jobs(training_job_id),
  model_type varchar(30) NOT NULL,
  version_name varchar(100) NOT NULL,
  artifact_uri text,
  code_version varchar(80),
  promotion_status varchar(20) NOT NULL DEFAULT 'candidate',
  auc double precision,
  precision_at_k double precision,
  map_at_k double precision,
  coverage double precision,
  diversity double precision,
  validation_loss double precision,
  promoted_at timestamp,
  rejected_reason text,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT model_versions_model_type_check
    CHECK (model_type IN ('milp', 'lightfm', 'xgboost', 'mmr')),
  CONSTRAINT model_versions_promotion_status_check
    CHECK (promotion_status IN ('candidate', 'active', 'rejected', 'archived')),
  CONSTRAINT model_versions_unique_name UNIQUE (model_type, version_name)
);

CREATE TABLE recommendation_runs (
  run_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  daily_log_id bigint REFERENCES daily_logs(daily_log_id),
  weekly_plan_id bigint REFERENCES weekly_plans(weekly_plan_id),
  requested_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  context_meal_type varchar(20) NOT NULL,
  context_time_of_day varchar(20),
  meal_sequence smallint NOT NULL,
  target_meal_budget_krw int NOT NULL,
  target_meal_calories_kcal numeric(8, 2) NOT NULL,
  meal_budget_source varchar(20) NOT NULL DEFAULT 'user_input',
  context_today_budget_krw int,
  context_today_spent_krw int NOT NULL DEFAULT 0,
  context_remaining_today_budget_krw int,
  context_remaining_budget_krw int,
  context_remaining_calories_kcal numeric(8, 2),
  context_week_start date,
  context_week_end date,
  context_lookback_days int NOT NULL DEFAULT 7,
  strategy_type varchar(20) NOT NULL,
  user_interaction_count int NOT NULL DEFAULT 0,
  profile_snapshot jsonb NOT NULL,
  milp_model_version_id bigint REFERENCES model_versions(model_version_id),
  lightfm_model_version_id bigint REFERENCES model_versions(model_version_id),
  xgboost_model_version_id bigint REFERENCES model_versions(model_version_id),
  mmr_model_version_id bigint REFERENCES model_versions(model_version_id),
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT recommendation_runs_meal_type_check
    CHECK (context_meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  CONSTRAINT recommendation_runs_meal_sequence_check
    CHECK (meal_sequence > 0),
  CONSTRAINT recommendation_runs_target_meal_budget_check
    CHECK (target_meal_budget_krw >= 0),
  CONSTRAINT recommendation_runs_target_meal_calories_check
    CHECK (target_meal_calories_kcal > 0),
  CONSTRAINT recommendation_runs_meal_budget_source_check
    CHECK (meal_budget_source IN ('user_input', 'weekly_plan', 'auto_split')),
  CONSTRAINT recommendation_runs_today_budget_check
    CHECK (context_today_budget_krw IS NULL OR context_today_budget_krw >= 0),
  CONSTRAINT recommendation_runs_today_spent_check
    CHECK (context_today_spent_krw >= 0),
  CONSTRAINT recommendation_runs_strategy_type_check
    CHECK (strategy_type IN ('cold_start', 'hybrid', 'personalized')),
  CONSTRAINT recommendation_runs_lookback_positive_check
    CHECK (context_lookback_days > 0)
);

CREATE TABLE recommendation_candidates (
  recommendation_candidate_id bigserial PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES recommendation_runs(run_id) ON DELETE CASCADE,
  candidate_id bigint NOT NULL REFERENCES meal_candidates(candidate_id),
  milp_feasible boolean NOT NULL DEFAULT true,
  milp_rank int,
  rule_score double precision,
  lightfm_score double precision,
  xgboost_probability double precision,
  mmr_penalty double precision NOT NULL DEFAULT 0,
  repeat_food_penalty double precision NOT NULL DEFAULT 0,
  repeat_combo_penalty double precision NOT NULL DEFAULT 0,
  final_score double precision,
  final_rank int,
  feature_snapshot jsonb,
  score_breakdown jsonb,
  was_selected boolean NOT NULL DEFAULT false,
  selected_at timestamp,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT recommendation_candidates_unique_candidate UNIQUE (run_id, candidate_id),
  CONSTRAINT recommendation_candidates_rank_positive_check
    CHECK (final_rank IS NULL OR final_rank > 0),
  CONSTRAINT recommendation_candidates_selected_at_check
    CHECK (was_selected = false OR selected_at IS NOT NULL),
  CONSTRAINT recommendation_candidates_probability_check
    CHECK (xgboost_probability IS NULL OR (xgboost_probability >= 0 AND xgboost_probability <= 1))
);

CREATE TABLE shock_events (
  shock_event_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  weekly_plan_id bigint NOT NULL REFERENCES weekly_plans(weekly_plan_id) ON DELETE CASCADE,
  event_type varchar(30) NOT NULL,
  expected_spend_krw int NOT NULL,
  event_day_index smallint NOT NULL,
  note text,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT shock_events_event_type_check
    CHECK (event_type IN ('company_dinner', 'delivery', 'eating_out', 'other')),
  CONSTRAINT shock_events_day_index_check
    CHECK (event_day_index BETWEEN 0 AND 6),
  CONSTRAINT shock_events_expected_spend_check
    CHECK (expected_spend_krw >= 0)
);

CREATE TABLE plan_revisions (
  plan_revision_id bigserial PRIMARY KEY,
  weekly_plan_id bigint NOT NULL REFERENCES weekly_plans(weekly_plan_id) ON DELETE CASCADE,
  shock_event_id bigint NOT NULL REFERENCES shock_events(shock_event_id) ON DELETE CASCADE,
  revision_status varchar(20) NOT NULL,
  blocked_constraint varchar(20),
  generated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at timestamp,
  CONSTRAINT plan_revisions_status_check
    CHECK (revision_status IN ('feasible', 'infeasible', 'accepted', 'rejected')),
  CONSTRAINT plan_revisions_blocked_constraint_check
    CHECK (blocked_constraint IS NULL OR blocked_constraint IN ('budget', 'protein', 'channel', 'calories'))
);

CREATE TABLE plan_revision_meals (
  plan_revision_meal_id bigserial PRIMARY KEY,
  plan_revision_id bigint NOT NULL REFERENCES plan_revisions(plan_revision_id) ON DELETE CASCADE,
  weekly_plan_meal_id bigint REFERENCES weekly_plan_meals(weekly_plan_meal_id),
  day_index smallint NOT NULL,
  meal_type varchar(20) NOT NULL,
  action varchar(20) NOT NULL,
  candidate_id bigint REFERENCES meal_candidates(candidate_id),
  revised_price_krw int,
  revised_calories_kcal numeric(10, 2),
  revised_protein_g numeric(10, 2),
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT plan_revision_meals_day_index_check
    CHECK (day_index BETWEEN 0 AND 6),
  CONSTRAINT plan_revision_meals_meal_type_check
    CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  CONSTRAINT plan_revision_meals_action_check
    CHECK (action IN ('replace', 'remove', 'add'))
);

CREATE TABLE recovery_outcomes (
  recovery_outcome_id bigserial PRIMARY KEY,
  weekly_plan_id bigint NOT NULL REFERENCES weekly_plans(weekly_plan_id) ON DELETE CASCADE,
  shock_event_id bigint NOT NULL REFERENCES shock_events(shock_event_id) ON DELETE CASCADE,
  plan_revision_id bigint NOT NULL UNIQUE REFERENCES plan_revisions(plan_revision_id) ON DELETE CASCADE,
  was_feasible boolean NOT NULL,
  was_accepted boolean NOT NULL,
  counted_as_success boolean NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_food_entries (
  user_food_entry_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  food_name varchar(120) NOT NULL,
  meal_type varchar(20),
  quantity_g numeric(8, 2),
  quantity_label varchar(30),
  price_krw int NOT NULL DEFAULT 0,
  calories_kcal numeric(10, 2) NOT NULL,
  protein_g numeric(10, 2) NOT NULL,
  fat_g numeric(10, 2) NOT NULL,
  carbs_g numeric(10, 2) NOT NULL,
  input_source varchar(20) NOT NULL DEFAULT 'manual',
  is_reusable boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_food_entries_meal_type_check
    CHECK (meal_type IS NULL OR meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  CONSTRAINT user_food_entries_input_source_check
    CHECK (input_source IN ('manual', 'ocr', 'ai_estimated', 'imported')),
  CONSTRAINT user_food_entries_price_nonnegative_check
    CHECK (price_krw >= 0),
  CONSTRAINT user_food_entries_quantity_positive_check
    CHECK (quantity_g IS NULL OR quantity_g > 0),
  CONSTRAINT user_food_entries_nutrition_nonnegative_check
    CHECK (calories_kcal >= 0 AND protein_g >= 0 AND fat_g >= 0 AND carbs_g >= 0)
);

CREATE TABLE food_logs (
  food_log_id bigserial PRIMARY KEY,
  daily_log_id bigint REFERENCES daily_logs(daily_log_id) ON DELETE SET NULL,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  food_id bigint REFERENCES foods(food_id),
  user_food_entry_id bigint REFERENCES user_food_entries(user_food_entry_id),
  recommendation_candidate_id bigint REFERENCES recommendation_candidates(recommendation_candidate_id),
  weekly_plan_meal_id bigint REFERENCES weekly_plan_meals(weekly_plan_meal_id),
  meal_type varchar(20) NOT NULL,
  quantity_g numeric(8, 2),
  quantity_label varchar(30),
  spent_money_krw int NOT NULL DEFAULT 0,
  consumed_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_type varchar(20) NOT NULL,
  deleted_at timestamp,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT food_logs_meal_type_check
    CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  CONSTRAINT food_logs_source_type_check
    CHECK (source_type IN ('recommendation', 'manual', 'manual_custom')),
  CONSTRAINT food_logs_food_source_present_check
    CHECK (
      (food_id IS NOT NULL AND user_food_entry_id IS NULL)
      OR (food_id IS NULL AND user_food_entry_id IS NOT NULL)
    ),
  CONSTRAINT food_logs_recommendation_source_check
    CHECK (source_type <> 'recommendation' OR (recommendation_candidate_id IS NOT NULL AND food_id IS NOT NULL)),
  CONSTRAINT food_logs_manual_source_check
    CHECK (source_type <> 'manual' OR food_id IS NOT NULL),
  CONSTRAINT food_logs_manual_custom_source_check
    CHECK (source_type <> 'manual_custom' OR user_food_entry_id IS NOT NULL),
  CONSTRAINT food_logs_quantity_present_check
    CHECK (source_type = 'manual_custom' OR quantity_g IS NOT NULL OR quantity_label IS NOT NULL),
  CONSTRAINT food_logs_spent_nonnegative_check
    CHECK (spent_money_krw >= 0)
);

CREATE TABLE user_item_interactions (
  interaction_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  food_id bigint REFERENCES foods(food_id) ON DELETE CASCADE,
  candidate_id bigint REFERENCES meal_candidates(candidate_id) ON DELETE CASCADE,
  recommendation_candidate_id bigint REFERENCES recommendation_candidates(recommendation_candidate_id) ON DELETE CASCADE,
  run_id bigint REFERENCES recommendation_runs(run_id) ON DELETE CASCADE,
  interaction_type varchar(20) NOT NULL,
  interaction_weight double precision NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_item_interactions_type_check
    CHECK (interaction_type IN (
      'impressed',
      'clicked',
      'accepted',
      'rejected',
      'skipped',
      'logged',
      'corrected',
      'deleted'
    )),
  CONSTRAINT user_item_interactions_target_present_check
    CHECK (
      food_id IS NOT NULL
      OR candidate_id IS NOT NULL
      OR recommendation_candidate_id IS NOT NULL
      OR run_id IS NOT NULL
    )
);

CREATE TABLE training_examples (
  training_example_id bigserial PRIMARY KEY,
  training_job_id bigint NOT NULL REFERENCES training_jobs(training_job_id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  candidate_id bigint REFERENCES meal_candidates(candidate_id),
  recommendation_candidate_id bigint REFERENCES recommendation_candidates(recommendation_candidate_id),
  model_type varchar(30) NOT NULL,
  feature_snapshot jsonb NOT NULL,
  label_value double precision,
  sample_weight double precision NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT training_examples_model_type_check
    CHECK (model_type IN ('lightfm', 'xgboost')),
  CONSTRAINT training_examples_target_present_check
    CHECK (candidate_id IS NOT NULL OR recommendation_candidate_id IS NOT NULL),
  CONSTRAINT training_examples_sample_weight_check
    CHECK (sample_weight >= 0)
);

CREATE TABLE exercises (
  exercise_id bigserial PRIMARY KEY,
  exercise_name varchar(80) NOT NULL,
  met_value double precision,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exercise_logs (
  exercise_log_id bigserial PRIMARY KEY,
  daily_log_id bigint REFERENCES daily_logs(daily_log_id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  exercise_id bigint REFERENCES exercises(exercise_id),
  recommendation_candidate_id bigint REFERENCES recommendation_candidates(recommendation_candidate_id),
  duration_minutes numeric(8, 2) NOT NULL,
  calories_burned_kcal numeric(10, 2),
  performed_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT exercise_logs_duration_positive_check
    CHECK (duration_minutes > 0)
);

CREATE UNIQUE INDEX weekly_plans_one_active_per_user_idx
  ON weekly_plans(user_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX model_versions_one_active_per_type_idx
  ON model_versions(model_type)
  WHERE promotion_status = 'active';

CREATE INDEX body_measurements_user_measured_at_idx
  ON body_measurements(user_id, measured_at DESC);

CREATE INDEX foods_channel_active_idx
  ON foods(meal_channel, is_active);

CREATE INDEX foods_category_idx
  ON foods(category);

CREATE INDEX meal_candidates_channel_type_active_idx
  ON meal_candidates(meal_channel, meal_type, is_active);

CREATE INDEX recommendation_runs_user_requested_at_idx
  ON recommendation_runs(user_id, requested_at DESC);

CREATE INDEX recommendation_candidates_run_rank_idx
  ON recommendation_candidates(run_id, final_rank);

CREATE UNIQUE INDEX recommendation_candidates_one_selected_per_run_idx
  ON recommendation_candidates(run_id)
  WHERE was_selected = true;

CREATE UNIQUE INDEX recommendation_candidates_unique_rank_per_run_idx
  ON recommendation_candidates(run_id, final_rank)
  WHERE final_rank IS NOT NULL;

CREATE INDEX food_logs_user_consumed_at_idx
  ON food_logs(user_id, consumed_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX food_logs_recommendation_candidate_idx
  ON food_logs(recommendation_candidate_id);

CREATE INDEX food_logs_user_food_entry_idx
  ON food_logs(user_food_entry_id);

CREATE INDEX user_food_entries_user_created_idx
  ON user_food_entries(user_id, created_at DESC);

CREATE INDEX user_item_interactions_user_created_idx
  ON user_item_interactions(user_id, created_at DESC);

CREATE INDEX user_item_interactions_type_created_idx
  ON user_item_interactions(interaction_type, created_at DESC);

CREATE INDEX training_examples_job_model_idx
  ON training_examples(training_job_id, model_type);
