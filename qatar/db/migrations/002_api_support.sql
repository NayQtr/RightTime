-- =====================================================================================
-- 002_api_support.sql — tables and hardening needed by the Phase 4 API (v0.4 C14).
-- Apply after 001_init.sql:  psql -v ON_ERROR_STOP=1 -1 -f 002_api_support.sql
-- =====================================================================================
SET search_path = app, public;

-- Admin MFA (TOTP). The secret is generated server-side at enrolment and stored encrypted;
-- enrolment needs a one-time token (hash stored here) issued by an owner.
ALTER TABLE admin_users
  ADD COLUMN totp_secret_enc   bytea,
  ADD COLUMN enroll_token_hash char(64),
  ADD COLUMN enroll_expires_at timestamptz;

-- Rotating refresh tokens (v0.3 §3.1: opaque, rotating, 30 days, stored hashed; reuse revokes the family)
CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(5)  NOT NULL CHECK (subject_type IN ('user','admin')),
  subject_id   uuid        NOT NULL,
  family_id    uuid        NOT NULL,
  token_hash   char(64)    NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid REFERENCES refresh_tokens(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family ON refresh_tokens (family_id);

-- Idempotency-Key replay store (v0.3 §3.1: same key + same body => replay; different body => 409; kept 24 h)
CREATE TABLE idempotency_keys (
  principal     varchar(80)  NOT NULL,
  key           varchar(100) NOT NULL,
  method_path   varchar(200) NOT NULL,
  request_hash  char(64)     NOT NULL,
  status_code   smallint     NOT NULL,
  response      jsonb        NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (principal, key)
);
CREATE INDEX idempotency_keys_age ON idempotency_keys (created_at);

-- Server-generated keys, used only when the matching environment secret is not set (staging).
-- Production sets JWT_PRIVATE_JWK, DATA_KEY, PHONE_PEPPER and PSP_WEBHOOK_SECRET as secrets instead.
CREATE TABLE server_keys (
  name       varchar(40) PRIMARY KEY,
  value      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Maker-checker approvals for actions marked "A" in the v0.3 §4.0.1 permission matrix
CREATE TABLE admin_approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action      varchar(40) NOT NULL CHECK (action IN ('table_cancel_quorum','booking_move','refund_goodwill','case_ban','session_open_sale')),
  payload     jsonb       NOT NULL,
  proposed_by uuid        NOT NULL REFERENCES admin_users(id),
  approved_by uuid        REFERENCES admin_users(id),
  status      varchar(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','failed')),
  result      jsonb,
  error       text,
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_four_eyes CHECK (approved_by IS NULL OR approved_by <> proposed_by),
  CONSTRAINT approval_decided CHECK (status = 'pending' OR decided_at IS NOT NULL)
);
CREATE INDEX admin_approvals_pending ON admin_approvals (created_at) WHERE status = 'pending';

CREATE TRIGGER refresh_tokens_updated_at  BEFORE UPDATE ON refresh_tokens  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER admin_approvals_updated_at BEFORE UPDATE ON admin_approvals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Staging defaults for the API (production overrides: OTP_DEV_MODE=false, MOCK_PSP_ENABLED=false)
INSERT INTO app_config (key, value, description) VALUES
  ('OTP_DEV_MODE',         'true',  'true = OTP code returned in the otp:request response (no SMS provider yet). MUST be false in production.'),
  ('MOCK_PSP_ENABLED',     'true',  'true = test_psp mock hosted checkout and refunds are active. MUST be false in production.'),
  ('WEB_BASE_URL',         'http://localhost:8787', 'Origin of the user web app (checkout return URLs)'),
  ('CORS_ORIGINS',         '*',     'Comma-separated allowed origins, or * (bearer tokens only, no cookies)'),
  ('SEAT_HOLD_MINUTES',    '10',    'Seat hold while paying (v0.3 SEAT_HOLD_MINUTES)'),
  ('REBOOK_CHOICE_HOURS',  '48',    'Choice window after an organizer cancel (v0.3 REBOOK_CHOICE_HOURS)'),
  ('FEEDBACK_WINDOW_DAYS', '7',     'Days after the event during which feedback and connections are open'),
  ('ACCESS_TOKEN_TTL_SECONDS', '900', 'v0.3 §3.1: 15 min'),
  ('REFRESH_TOKEN_TTL_DAYS',   '30',  'v0.3 §3.1: 30 days');

-- Every function in `app` resolves names in `app` regardless of the caller's search_path
-- (the API calls app.hold_seat() etc. without changing search_path).
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'app' AND p.prokind = 'f' LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = app, pg_temp', f.sig);
  END LOOP;
END $$;

-- Defence in depth: RLS on every app table with no policies (only the owning role used by the API
-- bypasses it), and no access at all for Supabase client roles. The `app` schema is never exposed
-- through the Data API; the API connects server-side.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'app' LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', r);
    END IF;
  END LOOP;
END $$;
