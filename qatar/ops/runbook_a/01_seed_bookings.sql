-- Runbook A seed: 13 paid bookings in Session 1 (S1), 5 paid bookings in Session 2 (S2).
-- Every S1 member saved S2 as a Q02 alternate; u14 saved S3. Test data only.
SET search_path = app, public;
SELECT count(sim.book_and_pay(g, '00000000-0000-0000-0000-00000000f001',
       ARRAY['00000000-0000-0000-0000-00000000f002'::uuid])) AS booked
FROM generate_series(1, 13) g;
SELECT count(sim.book_and_pay(g, '00000000-0000-0000-0000-00000000f002',
       CASE WHEN g = 14 THEN ARRAY['00000000-0000-0000-0000-00000000f003'::uuid] ELSE '{}' END)) AS booked
FROM generate_series(14, 18) g;
SELECT s.district_hint_en, s.seats_sold, count(b.*) FILTER (WHERE b.status = 'paid_awaiting_group') AS paid
FROM event_sessions s LEFT JOIN bookings b ON b.session_id = s.id GROUP BY 1, 2 ORDER BY 1;
