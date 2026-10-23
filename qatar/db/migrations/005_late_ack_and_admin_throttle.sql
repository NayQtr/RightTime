-- 005 (audit remediation F1, F5):
--   F1  bookings made inside the full-refund window's cut-off need an explicit "no refund" acknowledgement
--       before checkout; the moment of acknowledgement is stored on the booking (dispute evidence).
--   F5  failed admin sign-in / enrolment attempts are recorded so the API can lock out brute force
--       per e-mail and per IP prefix (429 + Retry-After).
SET search_path = app, pg_temp;

ALTER TABLE app.bookings ADD COLUMN IF NOT EXISTS late_no_refund_ack_at timestamptz;
COMMENT ON COLUMN app.bookings.late_no_refund_ack_at IS
  'When the user acknowledged, before paying, that the organising fee is not refundable (booking made after the full-refund cut-off).';

CREATE TABLE IF NOT EXISTS app.admin_auth_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind         varchar(10) NOT NULL CHECK (kind IN ('login', 'enroll')),
  email_hash   char(64) NOT NULL,            -- sha256(lower(email)); raw addresses typed by strangers are not stored
  ip_trunc     inet,
  succeeded    boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_auth_attempts_email ON app.admin_auth_attempts (kind, email_hash, attempted_at DESC);
CREATE INDEX IF NOT EXISTS admin_auth_attempts_ip ON app.admin_auth_attempts (kind, ip_trunc, attempted_at DESC) WHERE NOT succeeded;
CREATE INDEX IF NOT EXISTS admin_auth_attempts_age ON app.admin_auth_attempts (attempted_at);
ALTER TABLE app.admin_auth_attempts ENABLE ROW LEVEL SECURITY;

INSERT INTO app.app_config (key, value, description) VALUES
  ('ADMIN_LOGIN_MAX_FAILS_PER_EMAIL', '5',  'Failed admin sign-ins per e-mail within ADMIN_LOGIN_WINDOW_MINUTES before a temporary lockout (429).'),
  ('ADMIN_LOGIN_MAX_FAILS_PER_IP',    '20', 'Failed admin sign-ins / enrolments per IP prefix within ADMIN_LOGIN_WINDOW_MINUTES before a temporary lockout (429).'),
  ('ADMIN_LOGIN_WINDOW_MINUTES',      '15', 'Sliding window (and lockout length) for admin sign-in throttling.')
ON CONFLICT (key) DO NOTHING;

-- client roles never touch these (same stance as 002)
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON app.admin_auth_attempts FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- daily purge of attempts older than 30 days (where pg_cron exists; see 004)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $q$SELECT cron.schedule('app_purge_admin_auth_attempts', '17 3 * * *',
      $j$DELETE FROM app.admin_auth_attempts WHERE attempted_at < now() - interval '30 days'$j$)$q$;
  END IF;
END $$;
