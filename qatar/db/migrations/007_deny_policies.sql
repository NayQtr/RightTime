-- 007: explicit deny-all RLS policy on every app table. Behaviour is unchanged: since 002 the tables have
-- RLS with no policies (deny-all), and only the API's owning role, which bypasses RLS, reads them.
-- The explicit RESTRICTIVE policy states that intent, keeps any later permissive policy from opening a table
-- to client roles by accident, and clears Supabase's "RLS enabled, no policy" advisor notices.
-- A new app table must get the same policy (re-running this file is safe).
SET search_path = app, pg_temp;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'app' AND c.relkind = 'r' AND c.relrowsecurity LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_all ON app.%I', t.relname);
    EXECUTE format('CREATE POLICY deny_all ON app.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)', t.relname);
  END LOOP;
END $$;
