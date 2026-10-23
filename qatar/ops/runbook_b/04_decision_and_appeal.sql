-- Within 24 h: decision. Confirmed S1 -> permanent ban (sanction ladder) with a second approver.
SET search_path = app, public;
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
VALUES ('00000000-0000-0000-0000-00000000a005', 'read_p4', 'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'second_approval');

INSERT INTO report_actions (report_id, action, actor_id, second_approver, rationale_enc)
VALUES ('00000000-0000-0000-0000-0000000007c1', 'ban', '00000000-0000-0000-0000-00000000a004',
        '00000000-0000-0000-0000-00000000a005', '\x454e43525950544544'::bytea);
UPDATE report_actions SET effective_to = now()
 WHERE report_id = '00000000-0000-0000-0000-0000000007c1' AND action = 'temporary_suspension';
UPDATE users SET status = 'banned' WHERE id = '00000000-0000-0000-0000-000000000102';
UPDATE safety_reports SET status = 'actioned' WHERE id = '00000000-0000-0000-0000-0000000007c1';

-- held future bookings are cancelled by the organizer with a full refund (the banned user is not penalised twice
-- financially; refund approved by policy)
WITH c AS (
  UPDATE bookings b SET status = 'cancelled_by_organizer', cancelled_at = now(), cancel_actor = 'organizer',
         cancel_reason_code = 'account_banned'
  FROM event_sessions s
  WHERE s.id = b.session_id AND s.starts_at > now() AND b.user_id = '00000000-0000-0000-0000-000000000102'
    AND b.status IN ('payment_pending','paid_awaiting_group','group_locked','revealed')
  RETURNING b.id
)
INSERT INTO refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
SELECT p.id, c.id, p.amount_minor, 'organizer_cancel', 'requested', 'ban-refund-' || c.id
FROM c JOIN payments p ON p.booking_id = c.id AND p.status = 'succeeded';

-- notices: reporter gets the generic outcome; the reported user gets the decision with category + appeal link,
-- never the reporter's identity
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT '00000000-0000-0000-0000-000000000101', 'push', 'REPORT_OUTCOME', 'ar',
       jsonb_build_object('case', case_ref) FROM safety_reports WHERE id = '00000000-0000-0000-0000-0000000007c1';
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT '00000000-0000-0000-0000-000000000102', 'email', 'CONDUCT_DECISION', 'ar',
       jsonb_build_object('case', s.case_ref, 'date', (SELECT starts_at FROM event_sessions WHERE id = '00000000-0000-0000-0000-00000000f004'),
                          'category', 'threat_violence', 'decision', 'ban', 'appeal_until', now() + interval '14 days')
FROM safety_reports s WHERE s.id = '00000000-0000-0000-0000-0000000007c1';
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code) VALUES
  ('00000000-0000-0000-0000-00000000a004', 'sanction_ban',  'users', '00000000-0000-0000-0000-000000000102', 'S1_confirmed'),
  ('00000000-0000-0000-0000-00000000a005', 'sanction_approve', 'report_actions', '00000000-0000-0000-0000-0000000007c1', 'second_approver');

-- Day +3: the reported user appeals (one appeal within 14 days)
UPDATE safety_reports SET status = 'appealed' WHERE id = '00000000-0000-0000-0000-0000000007c1';

-- the decider cannot review the appeal (guard raises APPEAL_REVIEWER_CONFLICT):
DO $$ BEGIN
  INSERT INTO app.report_actions (report_id, action, actor_id)
  VALUES ('00000000-0000-0000-0000-0000000007c1', 'appeal_rejected', '00000000-0000-0000-0000-00000000a004');
  RAISE EXCEPTION 'guard missing: decider reviewed own appeal';
EXCEPTION WHEN SQLSTATE 'P0051' THEN RAISE NOTICE 'appeal guard OK: decider refused';
END $$;

-- an independent reviewer (a006) decides; the decision is final
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
VALUES ('00000000-0000-0000-0000-00000000a006', 'read_p4', 'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'appeal_review');
INSERT INTO report_actions (report_id, action, actor_id, rationale_enc)
VALUES ('00000000-0000-0000-0000-0000000007c1', 'appeal_rejected', '00000000-0000-0000-0000-00000000a006', '\x454e43525950544544'::bytea);
UPDATE safety_reports SET status = 'closed' WHERE id = '00000000-0000-0000-0000-0000000007c1';
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
VALUES ('00000000-0000-0000-0000-000000000102', 'email', 'APPEAL_DECISION', 'ar',
        jsonb_build_object('decision', 'upheld_ban'));
