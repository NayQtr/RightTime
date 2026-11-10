-- 023: member engagement (provisional, owner's request of 10 Nov 2026: build the recommended option so it can be reviewed).
-- * session_alerts: "Notify me when a session is available" (v0.3 E-LANG-1, second half). One open alert per member,
--   independent of marketing consent. When a session in one of her Q01 languages is put on sale, the API sends her one
--   notification (inbox, and her phone if she turned notifications on) and closes the alert (notified_at).
-- * event_feedback.low_rating_reasons: reasons she picked when she rated the meetup 3 stars or less (the threshold is
--   LOW_RATING_REASONS_MAX in api/src/lib/config.js; the keys are checked by the API: table_fit, venue, food_service,
--   organisation, no_shows, other). Shown to coordinators in the admin console.
-- * promo_codes.user_id / feedback_id: a compensation code a coordinator issued to one member after a rating of 2 or
--   less (COMPENSATION_MAX_RATING). Only that member can check it; one code per rating. Nothing is issued without a
--   coordinator, and she enters the discount herself (no default figure).
-- Every name is schema-qualified (as 016), so it runs whatever the session's search_path. Re-running is safe.

CREATE TABLE IF NOT EXISTS app.session_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,                                               -- set when the notification was queued; the alert is then over
  session_id  uuid REFERENCES app.event_sessions(id) ON DELETE SET NULL  -- the session she was told about
);
-- one open alert per member (pressing the button twice keeps one)
CREATE UNIQUE INDEX IF NOT EXISTS session_alerts_one_open ON app.session_alerts (user_id) WHERE notified_at IS NULL;
CREATE INDEX IF NOT EXISTS session_alerts_session_fk_idx ON app.session_alerts (session_id);

ALTER TABLE app.event_feedback ADD COLUMN IF NOT EXISTS low_rating_reasons varchar(24)[];
ALTER TABLE app.event_feedback DROP CONSTRAINT IF EXISTS event_feedback_low_rating_reasons_chk;
ALTER TABLE app.event_feedback ADD CONSTRAINT event_feedback_low_rating_reasons_chk
  CHECK (low_rating_reasons IS NULL OR cardinality(low_rating_reasons) BETWEEN 1 AND 8);
COMMENT ON COLUMN app.event_feedback.low_rating_reasons IS 'Reasons picked with a low overall rating (LOW_RATING_REASONS_MAX, default 3; keys checked by the API); NULL = none';

ALTER TABLE app.promo_codes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES app.users(id) ON DELETE CASCADE;
ALTER TABLE app.promo_codes ADD COLUMN IF NOT EXISTS feedback_id uuid REFERENCES app.event_feedback(id);
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_one_per_feedback ON app.promo_codes (feedback_id) WHERE feedback_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS promo_codes_user_fk_idx ON app.promo_codes (user_id);
COMMENT ON COLUMN app.promo_codes.user_id IS 'Set for a compensation code: only this member can use it';
COMMENT ON COLUMN app.promo_codes.feedback_id IS 'The low rating this compensation code answers (one code per rating)';

-- same protection as every other table: nobody reads it from outside the API
DO $$
DECLARE r text;
BEGIN
  ALTER TABLE app.session_alerts ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS deny_all ON app.session_alerts;
  CREATE POLICY deny_all ON app.session_alerts AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON app.session_alerts FROM %I', r);
    END IF;
  END LOOP;
END $$;
