-- 014: finish account deletion, as the privacy notice promises: after a request there is a 14-day period in which the
-- member can change her mind (signing in again cancels the request), then her number, name and questionnaire answers
-- are removed. Bookings, payments, refunds and safety reports stay for the records the business must keep, linked
-- only to an anonymous account. The number is free to sign up again as a new member.
-- A daily pg_cron job runs it where pg_cron exists (see 004). Re-running this file is safe.
SET search_path = app, pg_temp;

ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

-- The request time follows the status, so the API needs no change to record it.
CREATE OR REPLACE FUNCTION app.track_deletion_request() RETURNS trigger
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
BEGIN
  IF NEW.status = 'deletion_requested' AND OLD.status IS DISTINCT FROM 'deletion_requested' THEN
    NEW.deletion_requested_at := now();
  ELSIF NEW.status <> 'deletion_requested' AND NEW.status <> 'deleted' THEN
    NEW.deletion_requested_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_track_deletion_request ON users;
CREATE TRIGGER users_track_deletion_request BEFORE UPDATE OF status ON users
  FOR EACH ROW EXECUTE FUNCTION app.track_deletion_request();

-- Requests made before this migration have no time: they start their 14 days now.
UPDATE users SET deletion_requested_at = now() WHERE status = 'deletion_requested' AND deletion_requested_at IS NULL;

-- Removes the personal data of every account whose request is older than the grace period. Returns how many.
CREATE OR REPLACE FUNCTION app.finalize_account_deletions(grace interval DEFAULT interval '14 days') RETURNS integer
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE
  ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO ids FROM (
    SELECT id FROM users WHERE status = 'deletion_requested' AND deletion_requested_at <= now() - grace FOR UPDATE
  ) due;
  IF cardinality(ids) = 0 THEN RETURN 0; END IF;

  -- questionnaire answers (the response rows stay, empty, because bookings point to them)
  DELETE FROM answers WHERE response_id IN (SELECT id FROM questionnaire_responses WHERE user_id = ANY (ids));
  DELETE FROM push_subscriptions WHERE user_id = ANY (ids);
  DELETE FROM notifications_outbox WHERE user_id = ANY (ids);
  UPDATE refresh_tokens SET revoked_at = now() WHERE subject_id = ANY (ids) AND revoked_at IS NULL;

  -- number and name gone; a random lookup value so the number can sign up again as someone new
  UPDATE users
     SET display_name = NULL,
         phone_e164_enc = '\x'::bytea,
         phone_lookup_hash = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
         status = 'deleted',
         deleted_at = now()
   WHERE id = ANY (ids);
  RETURN cardinality(ids);
END $$;

REVOKE ALL ON FUNCTION app.finalize_account_deletions(interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.track_deletion_request() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $q$SELECT cron.schedule('app_finalize_account_deletions', '41 2 * * *',
      $j$SELECT app.finalize_account_deletions()$j$)$q$;
  END IF;
END $$;
