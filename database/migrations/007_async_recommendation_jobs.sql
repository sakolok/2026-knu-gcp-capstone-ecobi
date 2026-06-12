ALTER TABLE recommendation_runs
  ADD COLUMN job_status TEXT NOT NULL DEFAULT 'queued' CHECK (job_status IN ('queued', 'running', 'completed', 'failed'));

ALTER TABLE recommendation_runs
  ADD COLUMN requested_limit INTEGER NOT NULL DEFAULT 5 CHECK (requested_limit > 0);

ALTER TABLE recommendation_runs
  ADD COLUMN job_dispatcher TEXT;

ALTER TABLE recommendation_runs
  ADD COLUMN job_started_at TEXT;

ALTER TABLE recommendation_runs
  ADD COLUMN job_completed_at TEXT;

ALTER TABLE recommendation_runs
  ADD COLUMN job_error_message TEXT;

CREATE INDEX IF NOT EXISTS recommendation_runs_user_status_idx
  ON recommendation_runs(user_id, job_status, requested_at DESC);
