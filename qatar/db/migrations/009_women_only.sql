-- 009: HerZone is for women only. Each account records when the user confirmed she is a woman (self-declaration at
-- sign-up, next to the 18+ confirmation). Accounts registered before this change confirm from the home screen before
-- their next booking. Re-running this file is safe.
SET search_path = app, pg_temp;

ALTER TABLE users ADD COLUMN IF NOT EXISTS woman_confirmed_at timestamptz;
COMMENT ON COLUMN users.woman_confirmed_at IS 'When the user confirmed she is a woman (HerZone is women-only); NULL = not confirmed yet';
