-- 011: personality matching (rule version r2-personality, spec docs/specs/2026-10-30-personality-matching-design.md).
-- * matching_runs accepts the algorithm personality_v1.
-- * event_tables.match_themes keeps the "what you share" line computed at publish ([{q, o, ar, en}]); it is cleared
--   when an admin moves a member, because it no longer describes the table.
-- * matching_input() also returns, per booking, every answer as {question_key: [option_key, ...]}, and the option
--   keys of the published questionnaire, which the engine checks before it runs.
-- Re-running this file is safe.
SET search_path = app, pg_temp;

ALTER TABLE matching_runs DROP CONSTRAINT IF EXISTS matching_runs_algorithm_check;
ALTER TABLE matching_runs ADD CONSTRAINT matching_runs_algorithm_check
  CHECK (algorithm IN ('baseline_random', 'interest_opt_v1', 'personality_v1'));

ALTER TABLE event_tables ADD COLUMN IF NOT EXISTS match_themes jsonb;
COMMENT ON COLUMN event_tables.match_themes IS 'Shared themes shown to members after reveal ([{q, o, ar, en}]); NULL = none or cleared after a manual move';

CREATE OR REPLACE FUNCTION matching_input(p_session uuid) RETURNS json LANGUAGE sql STABLE AS $$
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
    'venues', COALESCE((SELECT json_agg(json_build_object('venue_id', v.id, 'tier_rank', bt.rank,
                                 'capacity', LEAST(v.seats_per_table_max, 6), 'tables_available', v.total_bookable_tables)
                                 ORDER BY v.id)
                          FROM venues v JOIN budget_tiers bt ON bt.id = v.budget_tier_id
                         WHERE v.city_id = s.city_id AND v.is_active AND s.experience = ANY (v.supported_experiences)),
                       '[]'::json))
  FROM event_sessions s WHERE s.id = p_session;
$$;
-- CREATE OR REPLACE drops function settings; keep the pin from 002 (names resolve in app whatever the caller's path)
ALTER FUNCTION matching_input(uuid) SET search_path = app, pg_temp;
