SET search_path = app, public;
DO $$
DECLARE v text; reporter uuid := '00000000-0000-0000-0000-000000000101'; reported uuid := '00000000-0000-0000-0000-000000000102';
BEGIN
  IF (SELECT case_ref FROM safety_reports WHERE id = '00000000-0000-0000-0000-0000000007c1') !~ '^TS-[0-9]{4}-0001$'
    THEN RAISE EXCEPTION 'case_ref format'; END IF;
  IF NOT EXISTS (SELECT 1 FROM blocked_pairs WHERE user_a = LEAST(reporter, reported) AND user_b = GREATEST(reporter, reported))
    THEN RAISE EXCEPTION 'mutual block missing'; END IF;
  IF (SELECT status FROM users WHERE id = reported) <> 'banned' THEN RAISE EXCEPTION 'reported user not banned'; END IF;
  SELECT string_agg(action::text, ',' ORDER BY action) INTO v FROM report_actions WHERE report_id = '00000000-0000-0000-0000-0000000007c1';
  IF v <> 'interim_block,temporary_suspension,ban,appeal_rejected' THEN RAISE EXCEPTION 'actions: %', v; END IF;
  IF EXISTS (SELECT 1 FROM report_actions WHERE action = 'temporary_suspension' AND effective_to IS NULL)
    THEN RAISE EXCEPTION 'temporary suspension not closed'; END IF;
  -- the reporter's identity never appears in anything sent to the reported user
  IF EXISTS (SELECT 1 FROM notifications_outbox WHERE user_id = reported
             AND (payload::text LIKE '%' || reporter::text || '%' OR payload::text ILIKE '%Tester A%'))
    THEN RAISE EXCEPTION 'reporter identity leaked'; END IF;
  -- every P4 read carries an actor and a reason (also enforced by CHECK)
  SELECT string_agg(reason_code, ',' ORDER BY reason_code) INTO v FROM audit_logs WHERE action = 'read_p4';
  IF v <> 'appeal_review,case_triage,second_approval' THEN RAISE EXCEPTION 'p4 reads: %', v; END IF;
  -- held future booking cancelled with a full refund requested
  IF NOT EXISTS (SELECT 1 FROM bookings b JOIN refunds r ON r.booking_id = b.id
                 WHERE b.user_id = reported AND b.cancel_reason_code = 'account_banned' AND r.amount_minor = 5900)
    THEN RAISE EXCEPTION 'future booking not released'; END IF;
  -- the matcher would exclude the banned user from any future pool
  IF EXISTS (SELECT 1 FROM json_array_elements(matching_input('00000000-0000-0000-0000-00000000f003')->'bookings') e
             WHERE e->>'user_id' = reported::text AND (e->>'account_active')::boolean)
    THEN RAISE EXCEPTION 'banned user still eligible'; END IF;
  SELECT string_agg(template_key, ',' ORDER BY template_key) INTO v FROM notifications_outbox
   WHERE template_key IN ('REPORT_RECEIVED','REPORT_OUTCOME','CONDUCT_DECISION','APPEAL_DECISION');
  IF v <> 'APPEAL_DECISION,CONDUCT_DECISION,REPORT_OUTCOME,REPORT_RECEIVED' THEN RAISE EXCEPTION 'notices: %', v; END IF;
  -- two-person team: decider (a004) never reviews; owner (a003) approved the ban and reviewed the appeal
  SELECT string_agg(action || ':' || right(actor_id::text, 4) || ':' || COALESCE(right(second_approver::text, 4), '-'), ',' ORDER BY action) INTO v
    FROM report_actions WHERE report_id = '00000000-0000-0000-0000-0000000007c1' AND actor_id IS NOT NULL;
  IF v <> 'ban:a004:a003,appeal_rejected:a003:-' THEN RAISE EXCEPTION 'reviewers: %', v; END IF;
  RAISE NOTICE 'RUNBOOK B SIMULATION PASSED';
END $$;
