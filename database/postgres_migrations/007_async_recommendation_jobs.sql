ALTER TABLE recommendation_runs
  ADD COLUMN IF NOT EXISTS job_status TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS requested_limit INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS job_dispatcher TEXT,
  ADD COLUMN IF NOT EXISTS job_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS job_completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS job_error_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_job_status_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_job_status_check
      CHECK (job_status IN ('queued', 'running', 'completed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_runs_requested_limit_check'
  ) THEN
    ALTER TABLE recommendation_runs
      ADD CONSTRAINT recommendation_runs_requested_limit_check
      CHECK (requested_limit > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS recommendation_runs_user_status_idx
  ON recommendation_runs(user_id, job_status, requested_at DESC);
