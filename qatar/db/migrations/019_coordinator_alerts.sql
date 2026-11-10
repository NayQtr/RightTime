-- 019: coordinator alerts (plan T13, item 40) and the settings for SMS sign-in, visitors' numbers and the venue email
-- (items 37, 38, 14c). All provisional (owner, 10 Nov): the choices sit in app_config and environment variables so the
-- owner can change them without a new release.
--
-- coordinator_alerts: one row per safety report that must reach a coordinator at once (S1 or S2 "during the meetup",
-- and every "I am in danger now"). It holds no report content: only which report, the kind, when it was paged and how
-- many devices and numbers received it, who acknowledged it and when, and when it was escalated (sent again, once,
-- because nobody acknowledged it in time).
-- admin_push_subscriptions: the browsers where a coordinator (owner or ops) turned on alerts in the admin console. Kept
-- apart from members' push_subscriptions (013), which belong to app.users.
-- otp_challenges.country_code: the calling code a sign-in code was sent to, for the hourly cap per country.
-- Re-running this file is safe.
SET search_path = app, pg_temp;

ALTER TABLE app.otp_challenges ADD COLUMN IF NOT EXISTS country_code varchar(3);
CREATE INDEX IF NOT EXISTS otp_challenges_country ON app.otp_challenges (country_code, created_at DESC) WHERE country_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.admin_push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        uuid NOT NULL REFERENCES app.admin_users(id) ON DELETE CASCADE,
  endpoint        varchar(1000) NOT NULL UNIQUE,
  p256dh          varchar(100) NOT NULL,
  auth            varchar(40) NOT NULL,
  failures        integer NOT NULL DEFAULT 0,
  last_error      varchar(200),
  last_success_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_push_subscriptions_admin_id_fk_idx ON app.admin_push_subscriptions (admin_id);

CREATE TABLE IF NOT EXISTS app.coordinator_alerts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id                 uuid NOT NULL UNIQUE REFERENCES app.safety_reports(id) ON DELETE CASCADE,
  kind                      varchar(20) NOT NULL CHECK (kind IN ('immediate_danger','report_during')),
  severity                  smallint NOT NULL CHECK (severity BETWEEN 1 AND 2),
  created_at                timestamptz NOT NULL DEFAULT now(),
  paged_at                  timestamptz,                         -- the first page went out (NULL: not yet)
  push_devices              smallint NOT NULL DEFAULT 0,         -- first page: coordinator devices tried / reached
  push_delivered            smallint NOT NULL DEFAULT 0,
  sms_numbers               smallint NOT NULL DEFAULT 0,         -- first page: numbers tried / accepted by the provider
  sms_delivered             smallint NOT NULL DEFAULT 0,
  acknowledged_by           uuid REFERENCES app.admin_users(id),
  acknowledged_at           timestamptz,
  escalated_at              timestamptz,                         -- sent again because nobody acknowledged it in time
  escalation_push_delivered smallint NOT NULL DEFAULT 0,
  escalation_sms_delivered  smallint NOT NULL DEFAULT 0,
  CONSTRAINT coordinator_alerts_ack_pair CHECK ((acknowledged_by IS NULL) = (acknowledged_at IS NULL))
);
CREATE INDEX IF NOT EXISTS coordinator_alerts_open ON app.coordinator_alerts (created_at) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS coordinator_alerts_acknowledged_by_fk_idx ON app.coordinator_alerts (acknowledged_by);

-- same protection as every app table (002, 007): RLS with an explicit deny-all policy, no client-role privileges
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_push_subscriptions','coordinator_alerts'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS deny_all ON app.%I', t);
    EXECUTE format('CREATE POLICY deny_all ON app.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)', t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON app.%I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Provisional settings (an environment variable of the same name overrides each). Keys, tokens and phone numbers are
-- never stored here: they are Edge Function secrets (see src/lib/sms.js, src/lib/email.js, services/coordinator_alerts.js).
INSERT INTO app_config (key, value, description) VALUES
  ('SMS_PROVIDER', '', 'Sign-in codes and coordinator alerts by SMS: "twilio", or empty for none (no SMS is sent)'),
  ('EMAIL_PROVIDER', '', 'Venue sign-in codes by email: "resend", or empty for none'),
  ('PHONE_ALLOWED_COUNTRY_CODES', '974', 'Calling codes allowed to sign in, comma-separated (974 = Qatar only)'),
  ('OTP_COUNTRY_HOURLY_CAP', '20', 'Sign-in codes per hour for each allowed country other than Qatar (paid-SMS abuse limit)'),
  ('COORDINATOR_ESCALATE_MINUTES', '5', 'A coordinator alert nobody acknowledged is sent again, once, after this many minutes')
ON CONFLICT (key) DO NOTHING;

-- No new schedule: the escalation runs in POST /api/internal/push:dispatch, which pg_cron already calls every minute
-- (013, PUSH_DISPATCH_URL), and whenever the admin console checks its open alerts.
