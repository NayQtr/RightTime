-- Runbook B seed: a live Arabic dinner (started 30 min ago) with one locked table of 5 (u01..u05),
-- all checked in. Test data only. Requires 001_init.sql + seed_common.sql.
SET search_path = app, public;

INSERT INTO event_sessions (id, city_id, experience, conversation_language, starts_at, ends_at, district_hint_ar, district_hint_en,
  price_plan_id, cancellation_policy_id, max_seats, seats_sold, booking_opens_at, booking_closes_at, lock_at, reveal_at,
  check_in_opens_at, status)
VALUES ('00000000-0000-0000-0000-00000000f004', 'doh', 'dinner', 'ar', now() - interval '30 minutes', now() + interval '90 minutes',
  'مشيرب', 'Msheireb', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 6, 5,
  now() - interval '10 days', now() - interval '2 hours', now() - interval '24 hours 30 minutes',
  now() - interval '24 hours 30 minutes', now() - interval '60 minutes', 'in_progress');

INSERT INTO bookings (id, booking_ref, user_id, session_id, conversation_language, budget_tier_id, questionnaire_response_id,
                      status, price_minor, cancellation_policy_version, checked_in_at)
SELECT ('00000000-0000-0000-0000-0000000004' || lpad(g::text, 2, '0'))::uuid, 'RT-LVXZ' || chr(64 + g) || 'Q',
       ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-0000-0000-00000000f004', 'ar',
       '00000000-0000-0000-0000-0000000000b2', ('00000000-0000-0000-0000-0000000002' || lpad(g::text, 2, '0'))::uuid,
       'checked_in', 5900, 'cxl-qa-1', now() - interval '35 minutes'
FROM generate_series(1, 5) g;

INSERT INTO matching_runs (id, session_id, mode, rule_version, questionnaire_version_id, algorithm, seed, inputs_hash,
                           result_summary, published_at)
VALUES ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-00000000f004', 'published', 'r1-interest',
        '00000000-0000-0000-0000-0000000000e1', 'interest_opt_v1', 20261023, repeat('0', 64), '{"tables":1}', now() - interval '2 days');
INSERT INTO event_tables (id, session_id, venue_id, table_code, status, venue_confirmed_at)
VALUES ('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000c2',
        'T01', 'forming', now() - interval '1 day');
INSERT INTO table_assignments (booking_id, table_id, matching_run_id)
SELECT ('00000000-0000-0000-0000-0000000004' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-0000-0000-0000000006b1',
       '00000000-0000-0000-0000-0000000005b1'
FROM generate_series(1, 5) g;
UPDATE event_tables SET status = 'locked', locked_at = now() - interval '24 hours 30 minutes'
 WHERE id = '00000000-0000-0000-0000-0000000006b1';

-- u02 also holds a future booking (S3 next week) that must be held by the suspension
SELECT sim.book_and_pay(2, '00000000-0000-0000-0000-00000000f003') IS NOT NULL AS future_booking_created;
