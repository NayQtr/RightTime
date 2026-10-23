-- T+2 min: coordinator (ops a001) calls the venue day-of contact (masked dial-out), asks staff to assist,
-- offers the reporter a safe exit. Ops sees category + table only (no narrative):
SET search_path = app, public;
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'venue_contact_called', 'event_tables', '00000000-0000-0000-0000-0000000006b1', 'S1_assist'),
  ('00000000-0000-0000-0000-00000000a001', 'reporter_checkin',     'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'safe_exit_offered');

SELECT s.case_ref, s.category, s.severity, t.table_code, v.district_en, s.status   -- live board pin (ops view)
FROM safety_reports s JOIN event_tables t ON t.id = s.table_id JOIN venues v ON v.id = t.venue_id
WHERE s.status IN ('new','triaged','investigating');

-- T+10 min: T&S primary (a004) opens the case. Every P4 read is audited with a reason.
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
VALUES ('00000000-0000-0000-0000-00000000a004', 'read_p4', 'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'case_triage');
UPDATE safety_reports SET status = 'triaged', assigned_to = '00000000-0000-0000-0000-00000000a004'
 WHERE id = '00000000-0000-0000-0000-0000000007c1';

-- pattern check: earlier cases about the same reported user (count only)
SELECT count(*) AS earlier_cases FROM safety_reports
WHERE reported_user_id = '00000000-0000-0000-0000-000000000102' AND id <> '00000000-0000-0000-0000-0000000007c1';

-- the suspended user's future bookings are held: matching skips them (account_active = false)
SELECT b.booking_ref, b.status, (SELECT status FROM users WHERE id = b.user_id) AS account
FROM bookings b JOIN event_sessions s ON s.id = b.session_id
WHERE b.user_id = '00000000-0000-0000-0000-000000000102' AND s.starts_at > now();

UPDATE safety_reports SET status = 'investigating' WHERE id = '00000000-0000-0000-0000-0000000007c1';
-- Step 4 "hear the other side" is skipped for S1 (risk); recorded:
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
VALUES ('00000000-0000-0000-0000-00000000a004', 'reported_notice_deferred', 'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'S1_risk');
