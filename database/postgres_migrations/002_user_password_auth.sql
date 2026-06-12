ALTER TABLE users ADD COLUMN IF NOT EXISTS login_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt TEXT;

UPDATE users
SET login_id = lower(split_part(email, '@', 1))
WHERE login_id IS NULL
  AND email IS NOT NULL
  AND position('@' in email) > 1;

UPDATE users
SET password_salt = 'ecobi-dev-salt',
    password_hash = '881368663fb8b1d29d4ef1be8361b7816aa30ccf564f3d5aa3e52abddcc77023'
WHERE password_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_unique_idx
  ON users(login_id)
  WHERE login_id IS NOT NULL;
