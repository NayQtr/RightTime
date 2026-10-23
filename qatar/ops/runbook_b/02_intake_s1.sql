-- T+0: u01 submits a private report about u02 with immediate_danger = true (category threat_violence).
-- API: POST /v1/reports — reporter_user_id is taken from the JWT; reported_user_id is resolved server-side
-- from the tablemate seat the reporter picked (the client never sends a user_id).
-- Client: before and after submit, the "call 999" screen is shown (authorities first).
SET search_path = app, public;

INSERT INTO safety_reports (id, case_ref, reporter_user_id, reported_user_id, booking_id, table_id, category, timing,
                            immediate_danger, description_enc, severity, status, sla_due_at)
VALUES ('00000000-0000-0000-0000-0000000007c1', next_case_ref(),
        '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
        '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-0000000006b1',
        'threat_violence', 'during', true,
        '\x454e43525950544544'::bytea,           -- ciphertext produced by the app (KMS); never plaintext in SQL
        1, 'new', now() + interval '24 hours');

-- automatic interim measures (same transaction as intake)
INSERT INTO user_blocks (blocker_user_id, blocked_user_id, source, report_id)
VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102', 'safety_case',
        '00000000-0000-0000-0000-0000000007c1');                     -- read as mutual via blocked_pairs
INSERT INTO report_actions (report_id, action, actor_id) VALUES
  ('00000000-0000-0000-0000-0000000007c1', 'interim_block', NULL),
  ('00000000-0000-0000-0000-0000000007c1', 'temporary_suspension', NULL);
UPDATE users SET status = 'suspended' WHERE id = '00000000-0000-0000-0000-000000000102';
-- a mutual connection between the two, if any, is removed silently
DELETE FROM connection_consents
 WHERE (from_user_id, to_user_id) IN (('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000102'::uuid),
                                      ('00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000101'::uuid));

INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT id, 'push', 'REPORT_RECEIVED', locale,
       jsonb_build_object('case', (SELECT case_ref FROM safety_reports WHERE id = '00000000-0000-0000-0000-0000000007c1'))
FROM users WHERE id = '00000000-0000-0000-0000-000000000101';

INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code) VALUES
  (NULL, 'report_intake',          'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'S1_immediate_danger'),
  (NULL, 'user_block_auto',        'user_blocks',    '00000000-0000-0000-0000-0000000007c1', 'safety_case'),
  (NULL, 'user_suspend_interim',   'users',          '00000000-0000-0000-0000-000000000102', 'S1_pending_review'),
  (NULL, 'coordinator_paged',      'safety_reports', '00000000-0000-0000-0000-0000000007c1', 'push_and_sms');
