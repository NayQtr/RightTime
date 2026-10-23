-- T-24h (lock_at): decision tree per v0.3 §4.4.1, executed by the on-call ops admin (a001).
SET search_path = app, public;

-- 3.1 Decision board: every forming table whose session reached lock_at
SELECT s.district_hint_en AS session, t.table_code, t.confirmed_count, t.capacity, t.status,
       CASE WHEN t.confirmed_count >= t.min_quorum THEN 'LOCK' ELSE 'BELOW_QUORUM' END AS decision
FROM event_tables t JOIN event_sessions s ON s.id = t.session_id
WHERE s.lock_at <= now() + interval '1 minute' AND t.status = 'forming' ORDER BY 1, 2;

-- 3.2 Lock every table at quorum (S1: T01, T02) and tell members (count only, no identities)
WITH locked AS (
  UPDATE event_tables t SET status = 'locked', locked_at = now(), venue_confirmed_at = now()
  FROM event_sessions s
  WHERE s.id = t.session_id AND s.lock_at <= now() + interval '1 minute'
    AND t.status = 'forming' AND t.confirmed_count >= t.min_quorum
  RETURNING t.id, s.reveal_at
), members AS (
  UPDATE bookings b SET status = 'group_locked'
  FROM table_assignments a, locked l
  WHERE a.booking_id = b.id AND a.is_current AND a.table_id = l.id AND b.status = 'paid_awaiting_group'
  RETURNING b.id, b.user_id, l.reveal_at
)
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT m.user_id, 'push', 'TABLE_LOCKED', u.locale, jsonb_build_object('booking_id', m.id, 'reveal_at', m.reveal_at)
FROM members m JOIN users u ON u.id = m.user_id;

INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
SELECT '00000000-0000-0000-0000-00000000a001', 'table_lock', 'event_tables', id, 'quorum_met'
FROM event_tables WHERE status = 'locked' AND locked_at > now() - interval '5 minutes';

-- 3.3 S1 leftover (the one paid member the matcher could not seat). Step 3 MOVE DOWN-TIER: any open seat in a table of the same session,
--     language, venue tier <= cap? (none: both tables are full, and they are locked)
SELECT b.booking_ref, 'no seat in a same-language table at or below cap' AS result
FROM bookings b
WHERE b.session_id = '00000000-0000-0000-0000-00000000f001' AND b.status = 'paid_awaiting_group'
  AND NOT EXISTS (SELECT 1 FROM table_assignments a WHERE a.booking_id = b.id AND a.is_current);

--     → organizer-cancel the leftover booking; QUORUM_FAIL_CHOICE lists its Q02 alternates first (S2, then S3)
WITH lo AS (
  UPDATE bookings b SET status = 'cancelled_by_organizer', cancelled_at = now(), cancel_actor = 'organizer',
         cancel_reason_code = 'no_table_formed'
  WHERE b.session_id = '00000000-0000-0000-0000-00000000f001' AND b.status = 'paid_awaiting_group'
    AND NOT EXISTS (SELECT 1 FROM table_assignments a WHERE a.booking_id = b.id AND a.is_current)
  RETURNING b.id, b.user_id, b.alternate_session_ids
), n AS (
  INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
  SELECT lo.user_id, 'push', 'QUORUM_FAIL_CHOICE', u.locale,
         jsonb_build_object('booking_id', lo.id, 'date', c.t, 'deadline', now() + interval '48 hours',
                            'rebook_options', to_jsonb(lo.alternate_session_ids || ARRAY['00000000-0000-0000-0000-00000000f003'::uuid]))
  FROM lo JOIN users u ON u.id = lo.user_id CROSS JOIN sim.clock c
)
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
SELECT '00000000-0000-0000-0000-00000000a001', 'booking_cancel_organizer', 'bookings', id, 'no_table_formed' FROM lo;

-- 3.4 S2 table below quorum (3 of 4).
--     Step 1 MERGE: another forming table in S2 with the same language and room? (none — S2 has one table)
SELECT count(*) AS merge_candidates FROM event_tables
WHERE session_id = '00000000-0000-0000-0000-00000000f002' AND status = 'forming' AND confirmed_count >= 1
  AND table_code <> 'T01';
--     Step 2 FILL by invitation: Q02-alternate holders for S2 are offered a seat individually (the S1 leftover above).
--     The invitation window is 30 min [CONFIG]; the lock decision may wait at most 60 min.
--     In this simulation nobody takes the seat within the window, so:
--     Step 4 CANCEL the table (atomic: table, bookings, notifications, audit; seats released by trigger)
SELECT cancel_table_quorum(t.id, '00000000-0000-0000-0000-00000000a001', 48) AS bookings_cancelled
FROM event_tables t WHERE t.session_id = '00000000-0000-0000-0000-00000000f002' AND t.status = 'forming';

-- the venue slot is released (call the day-of contact; logged)
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
SELECT '00000000-0000-0000-0000-00000000a001', 'venue_notified', 'event_tables', t.id, 'VENUE_TABLE_RELEASED'
FROM event_tables t WHERE t.session_id = '00000000-0000-0000-0000-00000000f002' AND t.status = 'cancelled_quorum';

-- 3.5 Session states: S1 locked (reveal follows), S2 cancelled (no table survived)
UPDATE event_sessions SET status = 'locked' WHERE id = '00000000-0000-0000-0000-00000000f001';
UPDATE event_sessions SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-00000000f002';

-- 3.6 Reveal (only locked tables): group_locked -> revealed, VENUE_REVEALED with venue, district, table code
WITH rv AS (
  UPDATE bookings b SET status = 'revealed'
  FROM table_assignments a JOIN event_tables t ON t.id = a.table_id AND t.status = 'locked'
  WHERE a.booking_id = b.id AND a.is_current AND b.status = 'group_locked'
  RETURNING b.id, b.user_id, t.table_code, t.venue_id
)
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT rv.user_id, 'push', 'VENUE_REVEALED', u.locale,
       jsonb_build_object('booking_id', rv.id, 'venue', v.name, 'district', v.district_ar, 'code', rv.table_code)
FROM rv JOIN users u ON u.id = rv.user_id JOIN venues v ON v.id = rv.venue_id;
