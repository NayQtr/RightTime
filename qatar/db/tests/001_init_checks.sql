-- Behaviour checks for 001_init.sql. Run on a scratch DB after the migration:
--   psql -v ON_ERROR_STOP=1 -1 -f 001_init_checks.sql      (rolls back nothing; use a throwaway DB)
-- Every check raises if the guarded behaviour is missing; the script ends with 'ALL CHECKS PASSED'.
SET search_path = app, public;

-- minimal reference data
INSERT INTO cities (id, name_ar, name_en, is_active) VALUES ('doh', 'الدوحة', 'Doha', true);
INSERT INTO legal_documents (version, type, text_ar, text_en, published_at) VALUES ('terms-1', 'terms', 'نص', 'text', now());
INSERT INTO admin_users (id, email, name, role, mfa_enabled) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'ops@example.test',  'Ops One',  'ops', true),
  ('00000000-0000-0000-0000-00000000a002', 'fin@example.test',  'Fin One',  'finance', true),
  ('00000000-0000-0000-0000-00000000a003', 'own@example.test',  'Owner One','owner', true);
INSERT INTO budget_tiers (id, city_id, rank, max_spend_minor, label_ar, label_en, status) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'doh', 1, NULL, 'الفئة 1', 'Tier 1', 'published');
INSERT INTO price_plans (id, city_id, experience, service_fee_minor, valid_from) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'doh', 'dinner', 5900, now() - interval '1 day');
INSERT INTO cancellation_policies (id, version, full_refund_until_hours, late_cancel_refund_pct, text_ar, text_en) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'cxl-1', 48, 0, 'نص', 'text');
INSERT INTO questionnaire_versions (id, code, status) VALUES ('00000000-0000-0000-0000-0000000000e1', 'QV-TEST', 'draft');

-- users (no DOB column exists — asserted below)
INSERT INTO users (id, phone_e164_enc, phone_lookup_hash, display_name, age_eligibility_confirmed_at, registration_completed_at)
SELECT ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, '\x00'::bytea,
       encode(sha256(('phone' || g)::bytea), 'hex'), 'User ' || chr(64 + g), now(), now()
FROM generate_series(1, 8) g;

INSERT INTO questionnaire_responses (id, user_id, questionnaire_version_id, status, submitted_at)
SELECT ('00000000-0000-0000-0000-0000000002' || lpad(g::text, 2, '0'))::uuid,
       ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000000e1', 'submitted', now()
FROM generate_series(1, 8) g;

INSERT INTO event_sessions (id, city_id, experience, conversation_language, starts_at, ends_at, district_hint_ar, district_hint_en,
  price_plan_id, cancellation_policy_id, max_seats, booking_opens_at, booking_closes_at, lock_at, reveal_at, check_in_opens_at, status)
VALUES ('00000000-0000-0000-0000-0000000000f1', 'doh', 'dinner', 'ar', now() + interval '3 days', now() + interval '3 days 2 hours',
  'لوسيل', 'Lusail', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 6,
  now() - interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '2 days',
  now() + interval '3 days' - interval '30 minutes', 'on_sale');

DO $$
DECLARE b app.bookings; n int; ok boolean;
BEGIN
  -- 1. no date-of-birth column anywhere
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'app' AND (column_name ILIKE '%birth%' OR column_name ILIKE 'dob%');
  IF n <> 0 THEN RAISE EXCEPTION 'CHECK 1 failed: DOB-like column exists'; END IF;

  -- 2. hold_seat: 6 seats sell, 7th raises SESSION_FULL, session flips to sold_out
  FOR i IN 1..6 LOOP
    PERFORM app.hold_seat(('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid,
                          '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1',
                          ('00000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid, '{}', 'idem-' || i);
  END LOOP;
  IF (SELECT status FROM app.event_sessions WHERE id = '00000000-0000-0000-0000-0000000000f1') <> 'sold_out' THEN
    RAISE EXCEPTION 'CHECK 2 failed: not sold_out'; END IF;
  ok := false;
  BEGIN
    PERFORM app.hold_seat('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-0000000000f1',
                          '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000207');
  EXCEPTION WHEN SQLSTATE 'P0011' OR SQLSTATE 'P0010' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 2 failed: 7th seat was sold'; END IF;

  -- 3. idempotent replay returns the same booking, no extra seat
  b := app.hold_seat('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000f1',
                     '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000201', '{}', 'idem-1');
  SELECT count(*) INTO n FROM app.bookings WHERE user_id = '00000000-0000-0000-0000-000000000101';
  IF n <> 1 OR (SELECT seats_sold FROM app.event_sessions WHERE id = '00000000-0000-0000-0000-0000000000f1') <> 6 THEN
    RAISE EXCEPTION 'CHECK 3 failed: idempotent replay created a booking'; END IF;

  -- 4. user cancel frees a seat and reopens sale
  UPDATE app.bookings SET status = 'cancelled_by_user', cancelled_at = now(), cancel_actor = 'user'
   WHERE user_id = '00000000-0000-0000-0000-000000000106';
  IF (SELECT seats_sold || '/' || status FROM app.event_sessions WHERE id = '00000000-0000-0000-0000-0000000000f1') <> '5/on_sale' THEN
    RAISE EXCEPTION 'CHECK 4 failed: seat not released'; END IF;

  -- 5. expired holds are released by the sweeper
  UPDATE app.bookings SET hold_expires_at = now() - interval '1 minute' WHERE user_id = '00000000-0000-0000-0000-000000000105';
  IF app.release_expired_holds() <> 1 THEN RAISE EXCEPTION 'CHECK 5 failed: hold not released'; END IF;

  -- 6. table capacity CHECK 4..6
  ok := false;
  BEGIN
    INSERT INTO app.event_tables (session_id, table_code, capacity) VALUES ('00000000-0000-0000-0000-0000000000f1', 'X7', 7);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 6 failed: capacity 7 accepted'; END IF;

  -- 7. a table cannot lock below quorum
  INSERT INTO app.event_tables (id, session_id, table_code) VALUES ('00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-0000000000f1', 'T01');
  ok := false;
  BEGIN
    UPDATE app.event_tables SET status = 'locked', locked_at = now() WHERE id = '00000000-0000-0000-0000-0000000003a1';
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 7 failed: locked below quorum'; END IF;

  -- 8. consent ledger is append-only
  INSERT INTO app.user_consents (user_id, consent_type, document_version, granted, source)
  VALUES ('00000000-0000-0000-0000-000000000101', 'terms', 'terms-1', true, 'app_web');
  ok := false;
  BEGIN
    UPDATE app.user_consents SET granted = false;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 8 failed: consent row updated'; END IF;

  -- 9. refunds never exceed the payment
  UPDATE app.bookings SET status = 'paid_awaiting_group', hold_expires_at = NULL WHERE user_id = '00000000-0000-0000-0000-000000000101';
  INSERT INTO app.payments (id, booking_id, user_id, psp, psp_payment_intent_id, amount_minor, status, idempotency_key, succeeded_at)
  SELECT '00000000-0000-0000-0000-0000000004a1', id, user_id, 'test_psp', 'pi_1', 5900, 'succeeded', 'pay-1', now()
    FROM app.bookings WHERE user_id = '00000000-0000-0000-0000-000000000101';
  INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, idempotency_key)
  SELECT '00000000-0000-0000-0000-0000000004a1', booking_id, 3000, 'organizer_cancel', 'rf-1' FROM app.payments WHERE id = '00000000-0000-0000-0000-0000000004a1';
  ok := false;
  BEGIN
    INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, idempotency_key)
    SELECT '00000000-0000-0000-0000-0000000004a1', booking_id, 3000, 'organizer_cancel', 'rf-2' FROM app.payments WHERE id = '00000000-0000-0000-0000-0000000004a1';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 9 failed: over-refund accepted'; END IF;

  -- 10. goodwill refund needs a different approver
  ok := false;
  BEGIN
    INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, idempotency_key, initiated_by, approved_by)
    SELECT '00000000-0000-0000-0000-0000000004a1', booking_id, 100, 'goodwill', 'rf-3',
           '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a002'
      FROM app.payments WHERE id = '00000000-0000-0000-0000-0000000004a1';
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 10 failed: self-approved goodwill refund'; END IF;

  -- 11. published questionnaire is immutable (and its questions too); retire is allowed
  INSERT INTO app.questions (id, questionnaire_version_id, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type,
                             matching_use, data_class, sort_order)
  VALUES ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000e1', 'Q05', 'profile', 'س', 'q', 'غ', 'p',
          'multi', 'soft_factor', 'P3', 5);
  UPDATE app.questionnaire_versions SET status = 'published', published_at = now(), approved_by = '00000000-0000-0000-0000-00000000a003'
   WHERE id = '00000000-0000-0000-0000-0000000000e1';
  ok := false;
  BEGIN
    UPDATE app.questions SET text_en = 'changed' WHERE id = '00000000-0000-0000-0000-0000000005a1';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 11a failed: published question edited'; END IF;
  ok := false;
  BEGIN
    UPDATE app.questionnaire_versions SET code = 'QV-X' WHERE id = '00000000-0000-0000-0000-0000000000e1';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 11b failed: published version edited'; END IF;
  UPDATE app.questionnaire_versions SET status = 'retired', retired_at = now() WHERE id = '00000000-0000-0000-0000-0000000000e1';

  -- 12. Q07 must be P4
  ok := false;
  BEGIN
    INSERT INTO app.questionnaire_versions (id, code) VALUES ('00000000-0000-0000-0000-0000000000e2', 'QV-T2');
    INSERT INTO app.questions (questionnaire_version_id, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type,
                               matching_use, data_class, sort_order)
    VALUES ('00000000-0000-0000-0000-0000000000e2', 'Q07', 'profile', 'س', 'q', 'غ', 'p', 'contact_request', 'ops_only', 'P3', 7);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 12 failed: Q07 stored below P4'; END IF;

  -- 13. audit log is append-only and P4 reads need a reason
  ok := false;
  BEGIN
    INSERT INTO app.audit_logs (actor_id, action, entity) VALUES ('00000000-0000-0000-0000-00000000a001', 'read_p4', 'safety_reports');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 13 failed: P4 read without reason'; END IF;

  -- 14. no-show fee must be 0 (non-punitive)
  ok := false;
  BEGIN
    INSERT INTO app.cancellation_policies (version, full_refund_until_hours, late_cancel_refund_pct, no_show_fee_pct, text_ar, text_en)
    VALUES ('cxl-bad', 48, 0, 50, 'x', 'x');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 14 failed: punitive no-show fee accepted'; END IF;

  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;

-- 15. same-session merge (MOVED_TABLE): moves only within a session, validates blocks, requires a reason
INSERT INTO event_sessions (id, city_id, experience, conversation_language, starts_at, ends_at, district_hint_ar, district_hint_en,
  price_plan_id, cancellation_policy_id, max_seats, booking_opens_at, booking_closes_at, lock_at, reveal_at, check_in_opens_at, status)
VALUES ('00000000-0000-0000-0000-0000000000f2', 'doh', 'dinner', 'ar', now() + interval '3 days', now() + interval '3 days 2 hours',
  'مشيرب', 'Msheireb', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 12,
  now() - interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '2 days',
  now() + interval '3 days' - interval '30 minutes', 'on_sale');
DO $$
DECLARE ok boolean; ids uuid[];
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM app.hold_seat(('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid,
                          '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000b1',
                          ('00000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid);
  END LOOP;
  UPDATE app.bookings SET status = 'paid_awaiting_group', hold_expires_at = NULL
   WHERE session_id = '00000000-0000-0000-0000-0000000000f2';
  SELECT array_agg(id ORDER BY user_id) INTO ids FROM app.bookings WHERE session_id = '00000000-0000-0000-0000-0000000000f2';
  INSERT INTO app.matching_runs (id, session_id, mode, rule_version, questionnaire_version_id, algorithm, seed, inputs_hash,
                                 result_summary, published_at)
  VALUES ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000000f2', 'published', 'r1-baseline',
          '00000000-0000-0000-0000-0000000000e1', 'baseline_random', 1, repeat('0', 64), '{}', now());
  INSERT INTO app.event_tables (id, session_id, table_code, status) VALUES
    ('00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000000f2', 'T01', 'forming'),
    ('00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000000f2', 'T02', 'forming');
  INSERT INTO app.table_assignments (booking_id, table_id, matching_run_id)
  SELECT ids[g], CASE WHEN g <= 3 THEN '00000000-0000-0000-0000-0000000008b1'::uuid ELSE '00000000-0000-0000-0000-0000000008b2'::uuid END,
         '00000000-0000-0000-0000-0000000008a1' FROM generate_series(1, 5) g;

  ok := false;
  BEGIN PERFORM app.move_booking_table(ids[4], '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-00000000a001', 'because');
  EXCEPTION WHEN SQLSTATE 'P0040' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 15a failed: move without a valid reason code'; END IF;

  ok := false;
  BEGIN PERFORM app.move_booking_table(ids[4], '00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-00000000a001', 'quorum_merge');
  EXCEPTION WHEN SQLSTATE 'P0042' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 15b failed: cross-session move accepted'; END IF;

  INSERT INTO app.user_blocks (blocker_user_id, blocked_user_id, source)
  VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000105', 'user');
  ok := false;
  BEGIN PERFORM app.move_booking_table(ids[5], '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-00000000a001', 'quorum_merge');
  EXCEPTION WHEN SQLSTATE 'P0046' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 15c failed: move next to a blocked user accepted'; END IF;

  PERFORM app.move_booking_table(ids[4], '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-00000000a001', 'quorum_merge');
  IF (SELECT confirmed_count FROM app.event_tables WHERE id = '00000000-0000-0000-0000-0000000008b1') <> 4
     OR NOT EXISTS (SELECT 1 FROM app.notifications_outbox WHERE template_key = 'MOVED_TABLE')
     OR NOT EXISTS (SELECT 1 FROM app.audit_logs WHERE action = 'table_move' AND reason_code = 'quorum_merge') THEN
    RAISE EXCEPTION 'CHECK 15d failed: merge did not count, notify or audit';
  END IF;
  RAISE NOTICE 'CHECK 15 PASSED';
END $$;
