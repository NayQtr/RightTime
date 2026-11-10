-- 020: matching rules (owner's proposals, built provisionally on 10 Nov 2026; Notion fixes 1, 2, 5, 7, 8, 9, 13).
-- The rule values live in the engine (MATCHING_RULES in api/src/matching/engine.js and matching/matching_engine.py);
-- this file only supplies the facts they need and keeps the record.
-- * matching_input() also returns:
--   - 'history': every pair of women in this session's pool who shared a table in another session within the last
--     90 days, as [user_a, user_b, days, mutual]. "Shared a table": both had a current seat at a locked or completed
--     table and neither booking was cancelled or a no-show. days = Doha calendar days between the two sessions (the
--     closest one if they met more than once; a locked table in a later session counts too). mutual = both asked to
--     stay in touch (an accepted contact request, either way, or the earlier mutual connection consent).
--   - per booking 'unseated_days_ago': days since the latest earlier session (within 90 days) where she was left
--     without a table: organizer-cancelled for no table formed or below quorum, or still waiting with no seat after
--     that session's matching was published. NULL = none.
--   90 days is the look-back; the engine's windows (42 and 28 days today) must stay within it.
-- * matching_run_tables keeps every table's score and its components for every run, dry runs included, with the
--   low-match flag shown to coordinators; table_id links the table a published run created (for later tuning
--   against event_feedback).
-- Every name is schema-qualified (as 016), so it runs whatever the session's search_path. Re-running is safe.
SET search_path = app, pg_temp;

CREATE TABLE IF NOT EXISTS app.matching_run_tables (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matching_run_id uuid NOT NULL REFERENCES app.matching_runs(id),
  table_id        uuid REFERENCES app.event_tables(id),          -- published runs only
  table_code      varchar(10) NOT NULL,
  language        char(2) NOT NULL CHECK (language IN ('ar', 'en')),
  tier_rank       smallint NOT NULL,
  size            smallint NOT NULL CHECK (size BETWEEN 4 AND 6),
  score           numeric(5,4) CHECK (score IS NULL OR score BETWEEN 0 AND 1),   -- NULL = not computable
  components      jsonb NOT NULL,      -- interest, cohesion, energy_balance, repeat_penalty, priority_boost, size_penalty, objective
  low_match       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (matching_run_id, table_code)
);
CREATE INDEX IF NOT EXISTS matching_run_tables_table_id_fk_idx ON app.matching_run_tables (table_id);
-- a published table is created by exactly one run (the admin session view joins on it)
CREATE UNIQUE INDEX IF NOT EXISTS matching_run_tables_one_per_table ON app.matching_run_tables (table_id) WHERE table_id IS NOT NULL;
COMMENT ON TABLE app.matching_run_tables IS 'Score and components of every table of every matching run (020); low_match = below the engine threshold';

-- same protection as every app table (002, 007): RLS with an explicit deny-all policy, no client-role privileges
ALTER TABLE app.matching_run_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all ON app.matching_run_tables;
CREATE POLICY deny_all ON app.matching_run_tables AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON app.matching_run_tables FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Same as 018 (016's venue rules, each booking's occasion) plus 'unseated_days_ago' per booking and 'history'.
CREATE OR REPLACE FUNCTION app.matching_input(p_session uuid) RETURNS json LANGUAGE sql STABLE
SET search_path = app, pg_temp AS $$
  SELECT json_build_object(
    'session_id', s.id,
    'questionnaire_version_id', (SELECT id FROM questionnaire_versions WHERE status = 'published'),
    'questionnaire', COALESCE((
      SELECT json_object_agg(x.key, x.opts) FROM (
        SELECT q.key, json_agg(o.key ORDER BY o.key) AS opts
          FROM questions q JOIN question_options o ON o.question_id = q.id
         WHERE q.questionnaire_version_id = (SELECT id FROM questionnaire_versions WHERE status = 'published')
         GROUP BY q.key) x), '{}'::json),
    'bookings', COALESCE((
      SELECT json_agg(json_build_object(
        'booking_id', b.id, 'user_id', b.user_id, 'session_id', b.session_id, 'status', b.status,
        'conversation_language', b.conversation_language, 'budget_tier_rank', bt.rank,
        'occasion', b.occasion,
        'unseated_days_ago', (
          SELECT min((s.starts_at AT TIME ZONE 'Asia/Qatar')::date - (ps.starts_at AT TIME ZONE 'Asia/Qatar')::date)
            FROM bookings pb JOIN event_sessions ps ON ps.id = pb.session_id
           WHERE pb.user_id = b.user_id AND ps.id <> s.id AND ps.starts_at < s.starts_at
             AND (s.starts_at AT TIME ZONE 'Asia/Qatar')::date - (ps.starts_at AT TIME ZONE 'Asia/Qatar')::date <= 90
             AND ((pb.status = 'cancelled_by_organizer' AND pb.cancel_reason_code IN ('no_table_formed', 'below_quorum'))
                  OR (pb.status = 'paid_awaiting_group'
                      AND EXISTS (SELECT 1 FROM matching_runs mr WHERE mr.session_id = ps.id AND mr.mode = 'published')
                      AND NOT EXISTS (SELECT 1 FROM table_assignments ta WHERE ta.booking_id = pb.id AND ta.is_current)))),
        'q05_topics', (SELECT json_agg(o.key ORDER BY o.key) FROM answers a
                         JOIN questions q ON q.id = a.question_id AND q.key = 'Q05'
                         JOIN question_options o ON o.id = a.option_id
                        WHERE a.response_id = b.questionnaire_response_id),
        'answers', (SELECT json_object_agg(x.key, x.opts) FROM (
                      SELECT q.key, json_agg(o.key ORDER BY o.key) AS opts FROM answers a
                        JOIN questions q ON q.id = a.question_id
                        JOIN question_options o ON o.id = a.option_id
                       WHERE a.response_id = b.questionnaire_response_id
                       GROUP BY q.key) x),
        'consents_current', (SELECT count(*) = 3 FROM current_consents c
                              WHERE c.user_id = b.user_id AND c.granted
                                AND c.consent_type IN ('terms','conduct','privacy_notice')),
        'age_attested', u.age_eligibility_confirmed_at IS NOT NULL,
        'account_active', u.status = 'active') ORDER BY b.id)
      FROM bookings b JOIN users u ON u.id = b.user_id JOIN budget_tiers bt ON bt.id = b.budget_tier_id
      WHERE b.session_id = s.id AND b.status = 'paid_awaiting_group'), '[]'::json),
    'blocks', COALESCE((SELECT json_agg(json_build_array(ub.blocker_user_id, ub.blocked_user_id))
                          FROM user_blocks ub), '[]'::json),
    'history', COALESCE((
      SELECT json_agg(json_build_array(h.user_a, h.user_b, h.days,
               EXISTS (SELECT 1 FROM contact_requests cr
                        WHERE cr.status = 'accepted' AND cr.delivered
                          AND ((cr.from_user_id = h.user_a AND cr.to_user_id = h.user_b)
                               OR (cr.from_user_id = h.user_b AND cr.to_user_id = h.user_a)))
               OR EXISTS (SELECT 1 FROM mutual_connections mc
                           WHERE (mc.user_a = h.user_a AND mc.user_b = h.user_b)
                              OR (mc.user_a = h.user_b AND mc.user_b = h.user_a)))
             ORDER BY h.user_a, h.user_b)
        FROM (SELECT ba.user_id AS user_a, bb.user_id AS user_b,
                     min(abs((s.starts_at AT TIME ZONE 'Asia/Qatar')::date - (ps.starts_at AT TIME ZONE 'Asia/Qatar')::date)) AS days
                FROM event_tables et
                JOIN event_sessions ps ON ps.id = et.session_id
                JOIN table_assignments ta ON ta.table_id = et.id AND ta.is_current
                JOIN table_assignments tb ON tb.table_id = et.id AND tb.is_current
                JOIN bookings ba ON ba.id = ta.booking_id
                JOIN bookings bb ON bb.id = tb.booking_id
               WHERE et.status IN ('locked', 'completed') AND ps.id <> s.id AND ba.user_id < bb.user_id
                 AND ba.status IN ('group_locked', 'revealed', 'checked_in', 'completed') AND ba.no_show IS NOT TRUE
                 AND bb.status IN ('group_locked', 'revealed', 'checked_in', 'completed') AND bb.no_show IS NOT TRUE
                 AND ba.user_id IN (SELECT p.user_id FROM bookings p WHERE p.session_id = s.id AND p.status = 'paid_awaiting_group')
                 AND bb.user_id IN (SELECT p.user_id FROM bookings p WHERE p.session_id = s.id AND p.status = 'paid_awaiting_group')
                 AND abs((s.starts_at AT TIME ZONE 'Asia/Qatar')::date - (ps.starts_at AT TIME ZONE 'Asia/Qatar')::date) <= 90
               GROUP BY ba.user_id, bb.user_id) h), '[]'::json),
    'venues', COALESCE((SELECT json_agg(json_build_object('venue_id', v.id, 'tier_rank', bt.rank,
                                 'capacity', LEAST(v.seats_per_table_max, 6),
                                 'tables_available', CASE WHEN sv.venue_id IS NULL THEN v.total_bookable_tables
                                                          ELSE LEAST(v.total_bookable_tables, GREATEST(1, sv.planned_guests / 4)) END)
                                 ORDER BY v.id)
                          FROM venues v JOIN budget_tiers bt ON bt.id = v.budget_tier_id
                          LEFT JOIN session_venues sv ON sv.session_id = s.id AND sv.venue_id = v.id
                         WHERE v.city_id = s.city_id AND v.is_active AND s.experience = ANY (v.supported_experiences)
                           AND (NOT EXISTS (SELECT 1 FROM session_venues x WHERE x.session_id = s.id)
                                OR sv.status = 'confirmed')),
                       '[]'::json))
  FROM event_sessions s WHERE s.id = p_session;
$$;
ALTER FUNCTION app.matching_input(uuid) SET search_path = app, pg_temp;
