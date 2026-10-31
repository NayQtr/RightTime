-- 012: promo codes (HerZone). Created by an owner in the admin dashboard: a percentage off, an optional expiry and an
-- optional usage limit. Subscriptions are display-only for now, so a member can only check a code and see the
-- discounted price; nothing is redeemed and `uses` stays 0 until purchases exist. Checks are rate-limited per member
-- (promo_code_checks) so codes cannot be guessed. Re-running this file is safe.
SET search_path = app, pg_temp;

CREATE TABLE IF NOT EXISTS promo_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar(24) NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{3,24}$'),
  percent_off smallint NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  expires_at  timestamptz,
  max_uses    integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses        integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES admin_users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_codes_created_by_fk_idx ON promo_codes (created_by);

CREATE TABLE IF NOT EXISTS promo_code_checks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id),
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_code_checks_user_at_idx ON promo_code_checks (user_id, at);

-- same protection as every app table (002, 007): RLS with an explicit deny-all policy, no client-role privileges
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['promo_codes','promo_code_checks'] LOOP
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
