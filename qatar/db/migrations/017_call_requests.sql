-- 017: call requests (owner's design of 5 Nov). "Request contact" in the app and website: she chooses a phone call or a WhatsApp
-- chat. For a phone call she can "Request contact" (a short note on the problem or request, the number to call, and when:
-- now, in 10 minutes, in an hour, tomorrow) or "Call us now" (dials the coordinator at once; nothing is stored).
-- A request goes to the admin console (owner and ops), who call her. At most one open request per member: sending again
-- updates it. The note and the number are encrypted like the other free text, and erased when her account is deleted.
-- Every table name is written app.<name>, so the file runs whatever the session's search_path is. Re-running is safe,
-- also on the first version of this table (which had no note, number or time).

CREATE TABLE IF NOT EXISTS app.call_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  booking_id        uuid REFERENCES app.bookings(id) ON DELETE SET NULL,   -- her next meetup, when she has one
  message_enc       bytea,                                                 -- what she wrote (the API requires it)
  contact_phone_enc bytea,                                                 -- the number to call when it is not the one she signed up with
  callback_when     varchar(8) NOT NULL DEFAULT 'now' CHECK (callback_when IN ('now', '10min', '1h', 'tomorrow')),
  status            varchar(10) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'called', 'closed')),
  submissions       smallint NOT NULL DEFAULT 1,                           -- sent again while open: updated, up to 10 times
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  handled_by        uuid REFERENCES app.admin_users(id),
  handled_at        timestamptz
);
ALTER TABLE app.call_requests ADD COLUMN IF NOT EXISTS message_enc bytea;
ALTER TABLE app.call_requests ADD COLUMN IF NOT EXISTS contact_phone_enc bytea;
ALTER TABLE app.call_requests ADD COLUMN IF NOT EXISTS callback_when varchar(8) NOT NULL DEFAULT 'now' CHECK (callback_when IN ('now', '10min', '1h', 'tomorrow'));
ALTER TABLE app.call_requests ADD COLUMN IF NOT EXISTS submissions smallint NOT NULL DEFAULT 1;
ALTER TABLE app.call_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- one open request per member (also stops a double tap from creating two)
CREATE UNIQUE INDEX IF NOT EXISTS call_requests_one_open ON app.call_requests (user_id) WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS call_requests_open_queue ON app.call_requests (created_at) WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS call_requests_user_created ON app.call_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_requests_booking_fk_idx ON app.call_requests (booking_id);
CREATE INDEX IF NOT EXISTS call_requests_handled_by_fk_idx ON app.call_requests (handled_by);

-- same protection as every other table: nobody reads it from outside the API
DO $$
DECLARE r text;
BEGIN
  ALTER TABLE app.call_requests ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS deny_all ON app.call_requests;
  CREATE POLICY deny_all ON app.call_requests AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON app.call_requests FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- account deletion (014, 015) also erases what she wrote to the coordinator and the number she gave
CREATE OR REPLACE FUNCTION app.finalize_account_deletions(grace interval DEFAULT interval '14 days') RETURNS integer
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE
  ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO ids FROM (
    SELECT id FROM users WHERE status = 'deletion_requested' AND deletion_requested_at <= now() - grace FOR UPDATE
  ) due;
  IF cardinality(ids) = 0 THEN RETURN 0; END IF;

  DELETE FROM answers WHERE response_id IN (SELECT id FROM questionnaire_responses WHERE user_id = ANY (ids));
  DELETE FROM push_subscriptions WHERE user_id = ANY (ids);
  DELETE FROM notifications_outbox WHERE user_id = ANY (ids);
  DELETE FROM call_requests WHERE user_id = ANY (ids);
  UPDATE payments SET cardholder_name_enc = NULL WHERE user_id = ANY (ids);
  UPDATE refresh_tokens SET revoked_at = now() WHERE subject_id = ANY (ids) AND revoked_at IS NULL;

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
