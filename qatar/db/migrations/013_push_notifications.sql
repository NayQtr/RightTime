-- 013: phone notifications (Web Push). push_subscriptions holds one row per member device (the browser's push
-- endpoint and its public keys; no phone number, no message content). The dispatcher (POST /api/internal/push:dispatch)
-- sends queued push-channel notifications; pg_cron calls it every minute through pg_net with the token in
-- push_dispatch_token, which only the database and the API read. Where pg_cron / pg_net or the dispatch URL are not
-- available (local PostgreSQL) the schedule is skipped. Re-running this file is safe.
SET search_path = app, pg_temp;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        varchar(1000) NOT NULL UNIQUE,
  p256dh          varchar(100) NOT NULL,
  auth            varchar(40) NOT NULL,
  failures        integer NOT NULL DEFAULT 0,
  last_error      varchar(200),
  last_success_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_fk_idx ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS push_dispatch_token (
  id    smallint PRIMARY KEY CHECK (id = 1),
  token text NOT NULL
);
-- two random UUIDs (v4, from a secure generator): 244 random bits
INSERT INTO push_dispatch_token (id, token)
VALUES (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_config (key, value, description) VALUES
  ('PUSH_DISPATCH_URL', '', 'Full URL of POST /api/internal/push:dispatch that pg_cron calls every minute; empty = no schedule')
ON CONFLICT (key) DO NOTHING;

-- same protection as every app table (002, 007): RLS with an explicit deny-all policy, no client-role privileges
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['push_subscriptions','push_dispatch_token'] LOOP
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

-- The call pg_cron makes: posts to the configured URL with the token. Runs as the table owner (SECURITY DEFINER) so the
-- token never has to be granted to anyone; not callable by client roles.
CREATE OR REPLACE FUNCTION push_dispatch_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_temp AS $$
DECLARE u text; t text;
BEGIN
  SELECT value INTO u FROM app.app_config WHERE key = 'PUSH_DISPATCH_URL';
  SELECT token INTO t FROM app.push_dispatch_token WHERE id = 1;
  IF coalesce(u, '') = '' OR t IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT net.http_post(url := $1, body := ''{}''::jsonb, headers := jsonb_build_object(''content-type'', ''application/json'', ''x-dispatch-token'', $2), timeout_milliseconds := 20000)'
    USING u, t;
END $$;
REVOKE ALL ON FUNCTION push_dispatch_tick() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('REVOKE ALL ON FUNCTION app.push_dispatch_tick() FROM %I', r); END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    RAISE NOTICE 'pg_cron or pg_net not available: push dispatch schedule skipped';
    RETURN;
  END IF;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron / pg_net could not be enabled here (%): push dispatch schedule skipped', SQLERRM;
    RETURN;
  END;
  EXECUTE $q$SELECT cron.schedule('app_push_dispatch', '* * * * *', 'SELECT app.push_dispatch_tick()')$q$;
END $$;
