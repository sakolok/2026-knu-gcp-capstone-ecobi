CREATE TABLE IF NOT EXISTS weekly_plan_meals (
  weekly_plan_meal_id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekly_plan_id INTEGER NOT NULL REFERENCES weekly_plans(weekly_plan_id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  candidate_id INTEGER NOT NULL REFERENCES meal_candidates(candidate_id),
  planned_price_krw INTEGER NOT NULL DEFAULT 0 CHECK (planned_price_krw >= 0),
  planned_calories_kcal REAL NOT NULL DEFAULT 0,
  planned_protein_g REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (weekly_plan_id, day_index, meal_type)
);

CREATE TABLE IF NOT EXISTS shock_events (
  shock_event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  weekly_plan_id INTEGER NOT NULL REFERENCES weekly_plans(weekly_plan_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('company_dinner', 'delivery', 'eating_out', 'other')),
  expected_spend_krw INTEGER NOT NULL CHECK (expected_spend_krw >= 0),
  event_day_index INTEGER NOT NULL CHECK (event_day_index BETWEEN 0 AND 6),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plan_revisions (
  plan_revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekly_plan_id INTEGER NOT NULL REFERENCES weekly_plans(weekly_plan_id) ON DELETE CASCADE,
  shock_event_id INTEGER NOT NULL REFERENCES shock_events(shock_event_id) ON DELETE CASCADE,
  revision_status TEXT NOT NULL CHECK (revision_status IN ('feasible', 'infeasible', 'accepted', 'rejected')),
  blocked_constraint TEXT CHECK (blocked_constraint IS NULL OR blocked_constraint IN ('budget', 'protein', 'channel', 'calories')),
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT
);

CREATE TABLE IF NOT EXISTS plan_revision_meals (
  plan_revision_meal_id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_revision_id INTEGER NOT NULL REFERENCES plan_revisions(plan_revision_id) ON DELETE CASCADE,
  weekly_plan_meal_id INTEGER REFERENCES weekly_plan_meals(weekly_plan_meal_id),
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  action TEXT NOT NULL CHECK (action IN ('replace', 'remove', 'add')),
  candidate_id INTEGER REFERENCES meal_candidates(candidate_id),
  revised_price_krw INTEGER,
  revised_calories_kcal REAL,
  revised_protein_g REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recovery_outcomes (
  recovery_outcome_id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekly_plan_id INTEGER NOT NULL REFERENCES weekly_plans(weekly_plan_id) ON DELETE CASCADE,
  shock_event_id INTEGER NOT NULL REFERENCES shock_events(shock_event_id) ON DELETE CASCADE,
  plan_revision_id INTEGER NOT NULL UNIQUE REFERENCES plan_revisions(plan_revision_id) ON DELETE CASCADE,
  was_feasible INTEGER NOT NULL,
  was_accepted INTEGER NOT NULL,
  counted_as_success INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS weekly_plan_meals_plan_day_idx
  ON weekly_plan_meals(weekly_plan_id, day_index);

CREATE INDEX IF NOT EXISTS shock_events_user_created_idx
  ON shock_events(user_id, created_at DESC);
