-- 010: contact requests after a meetup (HerZone). From the meetup's end and for 7 days, a member can ask a tablemate
-- to stay in touch; if the tablemate accepts, each gets a WhatsApp button to the other. A refusal or no answer is never
-- shown to the sender. A request to or from a blocked pair, or to a suspended / banned account, is stored with
-- delivered = false: the sender sees "sent", the other side never sees it. Replaces the silent mutual-consent picker
-- (connection_consents is kept for history). Re-running this file is safe.
SET search_path = app, pg_temp;

CREATE TABLE IF NOT EXISTS contact_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id     uuid NOT NULL REFERENCES event_tables(id),
  from_user_id uuid NOT NULL REFERENCES users(id),
  to_user_id   uuid NOT NULL REFERENCES users(id),
  status       varchar(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  delivered    boolean NOT NULL DEFAULT true,
  expires_at   timestamptz NOT NULL,
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, from_user_id, to_user_id),
  CONSTRAINT contact_request_not_self CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS contact_requests_from_user_id_fk_idx ON contact_requests (from_user_id);
CREATE INDEX IF NOT EXISTS contact_requests_to_user_id_fk_idx ON contact_requests (to_user_id);

-- same protection as every app table (002, 007): RLS with an explicit deny-all policy, no client-role privileges
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all ON contact_requests;
CREATE POLICY deny_all ON contact_requests AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON app.contact_requests FROM %I', r);
    END IF;
  END LOOP;
END $$;
