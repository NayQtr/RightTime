-- 017: call requests (owner's design of 5 Nov). "Request contact" in the app and website offers "Request Call": the member
-- asks to be called, her number is never shown to her, and the request goes to the admin console (owner and ops), who
-- call her. At most one open request per member (asking again returns it); the API also limits her to 3 a day.
-- Every table name is written app.<name>, so the file runs whatever the session's search_path is. Re-running is safe.

CREATE TABLE IF NOT EXISTS app.call_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  booking_id  uuid REFERENCES app.bookings(id) ON DELETE SET NULL,     -- the meetup she was looking at, when there was one
  status      varchar(10) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'called', 'closed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  handled_by  uuid REFERENCES app.admin_users(id),
  handled_at  timestamptz
);
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
