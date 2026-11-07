-- 018: celebration meetups (owner, 7 Nov 2026). A member can say at booking that the date is for an occasion
-- (her birthday or another one); the coordinator is told through a support case and arranges small preparations
-- with the venue. Matching seats a celebrant only with women whose answer to Q25 (questionnaire QA-2026-05) is
-- "I'd love to join in" or "I don't mind" (engine rule, matching/ and api/src/matching/).
-- * bookings.occasion: NULL = no occasion; 'birthday' or 'other'.
-- * support_case_type gains 'occasion_celebration' (the API opens one case per booking).
-- * matching_input() also returns each booking's occasion.
-- Every name is schema-qualified (as 016), so it runs whatever the session's search_path. Re-running is safe.
SET search_path = app, pg_temp;

ALTER TYPE app.support_case_type ADD VALUE IF NOT EXISTS 'occasion_celebration';

ALTER TABLE app.bookings ADD COLUMN IF NOT EXISTS occasion text;
ALTER TABLE app.bookings DROP CONSTRAINT IF EXISTS bookings_occasion_chk;
ALTER TABLE app.bookings ADD CONSTRAINT bookings_occasion_chk CHECK (occasion IS NULL OR occasion IN ('birthday', 'other'));
COMMENT ON COLUMN app.bookings.occasion IS 'Occasion she celebrates on this date (birthday | other); NULL = none';

-- Same as 016 (venues that confirmed, planned guest counts) plus each booking's occasion.
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
