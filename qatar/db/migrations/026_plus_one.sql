-- 026: "+1" — a member may bring one companion (owner's decision, 14 Nov 2026; qatar/docs/decisions/2026-11-14-plus-one.md).
--   * bookings.seats (1 or 2) and bookings.guest_name (the companion's name only: no phone, no account). One booking,
--     one payment, one refund: bookings.price_minor is the TOTAL (organising fee x seats).
--   * Everything that takes, keeps or frees seats now counts seats, not booking rows: hold_seat, release_expired_holds,
--     the cancellation trigger, rebook_booking, the table count (event_tables.confirmed_count), move_booking_table.
--     Waitlist offers (021) stay one seat per member: two freed seats are offered to the first two members waiting.
--   * set_booking_guest: adds, renames or removes the companion while the booking is still unpaid (the review step).
--   * matching_input() gives each booking's seats (the engine seats the companion at the member's table).
--   * Account deletion erases the companion's name (kept as '' so the seat count of past meetups stays right).
-- No new table: app.bookings keeps its RLS and deny-all policy (002, 007); the new functions are not executable by
-- PUBLIC, anon or authenticated. Every name is schema-qualified; re-running this file is safe.
SET search_path = app, pg_temp;

ALTER TABLE app.bookings ADD COLUMN IF NOT EXISTS seats smallint NOT NULL DEFAULT 1;
ALTER TABLE app.bookings ADD COLUMN IF NOT EXISTS guest_name text;
ALTER TABLE app.bookings DROP CONSTRAINT IF EXISTS bookings_seats_chk;
ALTER TABLE app.bookings ADD CONSTRAINT bookings_seats_chk CHECK (seats IN (1, 2));
ALTER TABLE app.bookings DROP CONSTRAINT IF EXISTS bookings_guest_name_chk;
ALTER TABLE app.bookings ADD CONSTRAINT bookings_guest_name_chk
  CHECK ((guest_name IS NULL) = (seats = 1) AND (guest_name IS NULL OR char_length(guest_name) <= 60));
COMMENT ON COLUMN app.bookings.seats IS 'Seats this booking takes: 1, or 2 when she brings a companion (+1)';
COMMENT ON COLUMN app.bookings.guest_name IS 'Companion''s name (personal data); NULL without a companion; '''' once the account is deleted';

-- ================================================================ seat hold
-- 021's hold, plus the companion: p_guest_name (already trimmed by the API, 1-60 characters) makes it a two-seat hold.
-- Raises P0010 SESSION_FULL (no seat), P0013 NOT_ENOUGH_SEATS (a seat, but not two), P0011, P0012 as before.
-- A member with a waitlist offer has ONE seat kept; with a companion she also needs a second free seat.
DROP FUNCTION IF EXISTS app.hold_seat(uuid, uuid, uuid, uuid, uuid[], varchar, integer);
CREATE OR REPLACE FUNCTION app.hold_seat(p_user_id uuid, p_session_id uuid, p_budget_tier_id uuid, p_response_id uuid,
                          p_alternates uuid[] DEFAULT '{}', p_idempotency_key varchar DEFAULT NULL,
                          p_hold_minutes integer DEFAULT 10, p_guest_name text DEFAULT NULL)
RETURNS app.bookings LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE s event_sessions; b bookings; v_price integer; v_policy varchar; w waitlist_entries; v_offer boolean;
        v_seats smallint := CASE WHEN p_guest_name IS NULL THEN 1 ELSE 2 END; v_need smallint;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO b FROM bookings WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN b; END IF;
  END IF;

  SELECT * INTO w FROM waitlist_entries WHERE user_id = p_user_id AND session_id = p_session_id
     AND status = 'offered' AND offer_expires_at > now() FOR UPDATE;
  v_offer := FOUND;

  SELECT * INTO s FROM event_sessions WHERE id = p_session_id;
  IF NOT FOUND OR NOT (s.status = 'on_sale' OR (v_offer AND s.status = 'sold_out'))
     OR now() NOT BETWEEN s.booking_opens_at AND s.booking_closes_at THEN
    RAISE EXCEPTION 'SESSION_NOT_ON_SALE' USING ERRCODE = 'P0011';
  END IF;

  IF EXISTS (SELECT 1 FROM bookings WHERE user_id = p_user_id AND session_id = p_session_id
             AND status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed')) THEN
    RAISE EXCEPTION 'ALREADY_BOOKED' USING ERRCODE = 'P0012';
  END IF;

  -- the seat of a waitlist offer was counted in seats_sold when it was offered
  v_need := v_seats - CASE WHEN v_offer THEN 1 ELSE 0 END;
  IF v_need > 0 THEN
    UPDATE event_sessions SET seats_sold = seats_sold + v_need
     WHERE id = p_session_id AND status = 'on_sale' AND seats_sold + v_need <= max_seats;
    IF NOT FOUND THEN
      IF v_seats = 2 AND (v_offer OR EXISTS (SELECT 1 FROM event_sessions WHERE id = p_session_id AND status = 'on_sale' AND seats_sold < max_seats)) THEN
        RAISE EXCEPTION 'NOT_ENOUGH_SEATS' USING ERRCODE = 'P0013';
      END IF;
      RAISE EXCEPTION 'SESSION_FULL' USING ERRCODE = 'P0010';
    END IF;
  END IF;
  IF v_offer THEN UPDATE waitlist_entries SET status = 'accepted' WHERE id = w.id; END IF;

  SELECT pp.service_fee_minor, cp.version INTO v_price, v_policy
    FROM price_plans pp, cancellation_policies cp
   WHERE pp.id = s.price_plan_id AND cp.id = s.cancellation_policy_id;

  INSERT INTO bookings (booking_ref, user_id, session_id, alternate_session_ids, conversation_language,
                        budget_tier_id, questionnaire_response_id, status, hold_expires_at, price_minor,
                        cancellation_policy_version, idempotency_key, seats, guest_name)
  VALUES (gen_booking_ref(), p_user_id, p_session_id, COALESCE(p_alternates,'{}'), s.conversation_language,
          p_budget_tier_id, p_response_id, 'payment_pending',
          CASE WHEN v_offer THEN GREATEST(w.offer_expires_at, now() + make_interval(mins => p_hold_minutes))
               ELSE now() + make_interval(mins => p_hold_minutes) END,
          v_price * v_seats, v_policy, p_idempotency_key, v_seats, p_guest_name)
  RETURNING * INTO b;

  UPDATE event_sessions SET status = 'sold_out' WHERE id = p_session_id AND status = 'on_sale' AND seats_sold = max_seats;
  RETURN b;
END $$;
REVOKE ALL ON FUNCTION app.hold_seat(uuid, uuid, uuid, uuid, uuid[], varchar, integer, text) FROM PUBLIC;

-- The companion of an unpaid booking (review step): p_guest_name sets or renames her, NULL removes her. Adding her
-- takes the second seat (P0013 NOT_ENOUGH_SEATS when none is free); removing her gives it back (which offers it to the
-- waitlist, 021). The total follows: price_minor = fee x seats, and her unpaid payment rows carry the new amount (a
-- charge of any other amount is refunded and never confirms the booking: services/payments.js).
-- Raises P0014 GUEST_NOT_CHANGEABLE when the booking is not hers, not unpaid, or its hold has ended.
CREATE OR REPLACE FUNCTION app.set_booking_guest(p_booking_id uuid, p_user_id uuid, p_guest_name text)
RETURNS app.bookings LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE b bookings; v_unit integer; v_seats smallint := CASE WHEN p_guest_name IS NULL THEN 1 ELSE 2 END;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = p_booking_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'payment_pending' OR b.hold_expires_at IS NULL OR b.hold_expires_at <= now() THEN
    RAISE EXCEPTION 'GUEST_NOT_CHANGEABLE' USING ERRCODE = 'P0014';
  END IF;
  v_unit := b.price_minor / b.seats;
  IF v_seats > b.seats THEN
    UPDATE event_sessions SET seats_sold = seats_sold + 1
     WHERE id = b.session_id AND status = 'on_sale' AND seats_sold < max_seats;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ENOUGH_SEATS' USING ERRCODE = 'P0013'; END IF;
    UPDATE event_sessions SET status = 'sold_out' WHERE id = b.session_id AND status = 'on_sale' AND seats_sold = max_seats;
  ELSIF v_seats < b.seats THEN
    UPDATE event_sessions SET seats_sold = seats_sold - 1,
           status = CASE WHEN status = 'sold_out' THEN 'on_sale'::session_status ELSE status END
     WHERE id = b.session_id;
  END IF;
  UPDATE bookings SET seats = v_seats, guest_name = p_guest_name, price_minor = v_unit * v_seats WHERE id = b.id RETURNING * INTO b;
  UPDATE payments SET amount_minor = b.price_minor WHERE booking_id = b.id AND status IN ('created','failed');
  RETURN b;
END $$;
REVOKE ALL ON FUNCTION app.set_booking_guest(uuid, uuid, text) FROM PUBLIC;

-- Seats never change once a booking is paid: the payment, the refund and the table count all rest on them.
CREATE OR REPLACE FUNCTION app.guard_booking_seats() RETURNS trigger
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
BEGIN
  IF OLD.status <> 'payment_pending' THEN
    RAISE EXCEPTION 'BOOKING_SEATS_FIXED: status %', OLD.status USING ERRCODE = 'P0014';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_booking_seats() FROM PUBLIC;
DROP TRIGGER IF EXISTS bookings_seats_guard ON app.bookings;
CREATE TRIGGER bookings_seats_guard BEFORE UPDATE OF seats ON app.bookings
  FOR EACH ROW WHEN (OLD.seats IS DISTINCT FROM NEW.seats) EXECUTE FUNCTION app.guard_booking_seats();

-- ================================================================ seats given back
-- Expired holds (021): each gives back every seat it held. Waitlist offers stay one seat each.
CREATE OR REPLACE FUNCTION app.release_expired_holds() RETURNS integer
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id, session_id, seats FROM bookings
           WHERE status = 'payment_pending' AND hold_expires_at < now()
           FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE bookings SET status = 'expired', hold_expires_at = NULL WHERE id = r.id;
    UPDATE event_sessions SET seats_sold = seats_sold - r.seats,
           status = CASE WHEN status = 'sold_out' THEN 'on_sale'::session_status ELSE status END
     WHERE id = r.session_id;
    n := n + 1;
  END LOOP;
  FOR r IN SELECT id, session_id FROM waitlist_entries
           WHERE status = 'offered' AND offer_expires_at < now()
           FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE waitlist_entries SET status = 'expired' WHERE id = r.id;
    UPDATE event_sessions SET seats_sold = seats_sold - 1,
           status = CASE WHEN status = 'sold_out' THEN 'on_sale'::session_status ELSE status END
     WHERE id = r.session_id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Cancelling a booking (member, organiser, failed payment) frees every seat it held.
CREATE OR REPLACE FUNCTION app.release_seat_on_cancel() RETURNS trigger
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
BEGIN
  IF NEW.status IN ('cancelled_by_user','cancelled_by_organizer','payment_failed')
     AND OLD.status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed') THEN
    UPDATE event_sessions SET seats_sold = seats_sold - NEW.seats,
           status = CASE WHEN status = 'sold_out' THEN 'on_sale'::session_status ELSE status END
     WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END $$;

-- event_tables.confirmed_count = seats (member and companion) of the current, paid, not cancelled assignments.
CREATE OR REPLACE FUNCTION app.refresh_table_count(p_table_id uuid) RETURNS void
LANGUAGE sql SET search_path = app, pg_temp AS $$
  UPDATE event_tables t SET confirmed_count = (
    SELECT COALESCE(sum(b.seats), 0) FROM table_assignments a JOIN bookings b ON b.id = a.booking_id
     WHERE a.table_id = t.id AND a.is_current
       AND b.status IN ('paid_awaiting_group','group_locked','revealed','checked_in','completed'))
  WHERE t.id = p_table_id;
$$;

-- Rebook after an organiser cancellation (001): the new booking keeps the companion, so the target session needs as
-- many free seats as the booking has (P0010 SESSION_FULL otherwise). The fee paid (the total) moves with it.
CREATE OR REPLACE FUNCTION app.rebook_booking(p_booking_id uuid, p_user_id uuid, p_target_session uuid)
RETURNS app.bookings LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE old bookings; s event_sessions; nb bookings;
BEGIN
  SELECT * INTO old FROM bookings WHERE id = p_booking_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR old.status <> 'cancelled_by_organizer' THEN
    RAISE EXCEPTION 'NOT_REBOOKABLE' USING ERRCODE = 'P0030';
  END IF;
  IF EXISTS (SELECT 1 FROM bookings WHERE rebooked_from_booking_id = old.id)
     OR EXISTS (SELECT 1 FROM refunds WHERE booking_id = old.id AND status <> 'failed') THEN
    RAISE EXCEPTION 'NOT_REBOOKABLE: already resolved' USING ERRCODE = 'P0030';
  END IF;
  SELECT * INTO s FROM event_sessions WHERE id = p_target_session;
  IF NOT FOUND OR s.status <> 'on_sale' OR now() > s.booking_closes_at THEN
    RAISE EXCEPTION 'SESSION_NOT_ON_SALE' USING ERRCODE = 'P0011';
  END IF;
  IF s.conversation_language <> old.conversation_language THEN
    RAISE EXCEPTION 'LANGUAGE_CONFLICT' USING ERRCODE = 'P0031';
  END IF;
  UPDATE event_sessions SET seats_sold = seats_sold + old.seats
   WHERE id = p_target_session AND status = 'on_sale' AND seats_sold + old.seats <= max_seats;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_FULL' USING ERRCODE = 'P0010'; END IF;

  INSERT INTO bookings (booking_ref, user_id, session_id, conversation_language, budget_tier_id,
                        questionnaire_response_id, status, price_minor, cancellation_policy_version,
                        idempotency_key, rebooked_from_booking_id, seats, guest_name)
  VALUES (gen_booking_ref(), old.user_id, p_target_session, old.conversation_language, old.budget_tier_id,
          old.questionnaire_response_id, 'paid_awaiting_group', old.price_minor, old.cancellation_policy_version,
          'rebook-' || old.id, old.id, old.seats, old.guest_name)
  RETURNING * INTO nb;
  UPDATE event_sessions SET status = 'sold_out' WHERE id = p_target_session AND seats_sold = max_seats;
  RETURN nb;
END $$;

-- Same-session move (001): the destination table needs room for every seat of the booking.
CREATE OR REPLACE FUNCTION app.move_booking_table(p_booking_id uuid, p_to_table uuid, p_actor uuid, p_reason varchar)
RETURNS void LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE b bookings; cur table_assignments; dst event_tables; v_member_rank smallint; v_venue_rank smallint; v_locale varchar;
BEGIN
  IF p_reason NOT IN ('quorum_merge','friend_request_separate','accessibility_fit','ops_balance','other') THEN
    RAISE EXCEPTION 'REASON_CODE_REQUIRED' USING ERRCODE = 'P0040';
  END IF;
  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  SELECT * INTO cur FROM table_assignments WHERE booking_id = p_booking_id AND is_current FOR UPDATE;
  SELECT * INTO dst FROM event_tables WHERE id = p_to_table FOR UPDATE;
  IF b.id IS NULL OR cur.id IS NULL OR dst.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0041'; END IF;
  IF dst.session_id <> b.session_id THEN RAISE EXCEPTION 'CROSS_SESSION_MOVE_FORBIDDEN' USING ERRCODE = 'P0042'; END IF;
  IF dst.status NOT IN ('planned','forming') THEN RAISE EXCEPTION 'TABLE_NOT_OPEN' USING ERRCODE = 'P0043'; END IF;
  IF dst.confirmed_count + b.seats > dst.capacity THEN RAISE EXCEPTION 'TABLE_FULL' USING ERRCODE = 'P0044'; END IF;
  SELECT rank INTO v_member_rank FROM budget_tiers WHERE id = b.budget_tier_id;
  SELECT bt.rank INTO v_venue_rank FROM venues v JOIN budget_tiers bt ON bt.id = v.budget_tier_id WHERE v.id = dst.venue_id;
  IF v_venue_rank IS NOT NULL AND v_venue_rank > v_member_rank THEN
    RAISE EXCEPTION 'TIER_ABOVE_CAP' USING ERRCODE = 'P0045';
  END IF;
  IF EXISTS (SELECT 1 FROM table_assignments a JOIN bookings ob ON ob.id = a.booking_id
              JOIN user_blocks ub ON (ub.blocker_user_id = ob.user_id AND ub.blocked_user_id = b.user_id)
                                  OR (ub.blocked_user_id = ob.user_id AND ub.blocker_user_id = b.user_id)
             WHERE a.table_id = p_to_table AND a.is_current) THEN
    RAISE EXCEPTION 'BLOCKED_PAIR' USING ERRCODE = 'P0046';
  END IF;
  UPDATE table_assignments SET is_current = false WHERE id = cur.id;
  INSERT INTO table_assignments (booking_id, table_id, matching_run_id, is_current)
  VALUES (p_booking_id, p_to_table, cur.matching_run_id, true);
  SELECT locale INTO v_locale FROM users WHERE id = b.user_id;
  INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
  VALUES (b.user_id, 'push', 'MOVED_TABLE', v_locale, jsonb_build_object('booking_id', b.id));
  INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
  VALUES (p_actor, 'table_move', 'table_assignments', p_booking_id, p_reason);
END $$;

-- ================================================================ matching input
-- Same as 020 plus 'seats' per booking: the companion has no answers; the engine seats her at the member's table and
-- counts her toward the table size.
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
        'occasion', b.occasion, 'seats', b.seats,
        'unseated_days_ago', (
          SELECT min((s.starts_at AT TIME ZONE 'Asia/Qatar')::date - (ps.starts_at AT TIME ZONE 'Asia/Qatar')::date)
            FROM bookings pb JOIN event_sessions ps ON ps.id = pb.session_id
           WHERE pb.user_id = b.user_id AND ps.id <> s.id AND ps.starts_at < s.starts_at
             AND (s.starts_at AT TIME ZONE 'Asia/Qatar')::date - (ps.starts_at AT TIME ZONE 'Asia/Qatar')::date <= 90
             AND ((pb.status = 'cancelled_by_organizer' AND pb.cancel_reason_code IN ('no_table_formed', 'below_quorum'))
                  OR (pb.status = 'paid_awaiting_group'
                      AND EXISTS (SELECT 1 FROM matching_runs mr WHERE mr.session_id = ps.id AND mr.mode = 'published')
                      AND NOT EXISTS (SELECT 1 FROM table_assignments ta WHERE ta.booking_id = pb.id AND ta.is_current)))),
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
    'history', COALESCE((
      SELECT json_agg(json_build_array(h.user_a, h.user_b, h.days,
               EXISTS (SELECT 1 FROM contact_requests cr
                        WHERE cr.status = 'accepted' AND cr.delivered
                          AND ((cr.from_user_id = h.user_a AND cr.to_user_id = h.user_b)
                               OR (cr.from_user_id = h.user_b AND cr.to_user_id = h.user_a)))
               OR EXISTS (SELECT 1 FROM mutual_connections mc
                           WHERE (mc.user_a = h.user_a AND mc.user_b = h.user_b)
                              OR (mc.user_a = h.user_b AND mc.user_b = h.user_a)))
             ORDER BY h.user_a, h.user_b)
        FROM (SELECT ba.user_id AS user_a, bb.user_id AS user_b,
                     min(abs((s.starts_at AT TIME ZONE 'Asia/Qatar')::date - (ps.starts_at AT TIME ZONE 'Asia/Qatar')::date)) AS days
                FROM event_tables et
                JOIN event_sessions ps ON ps.id = et.session_id
                JOIN table_assignments ta ON ta.table_id = et.id AND ta.is_current
                JOIN table_assignments tb ON tb.table_id = et.id AND tb.is_current
                JOIN bookings ba ON ba.id = ta.booking_id
                JOIN bookings bb ON bb.id = tb.booking_id
               WHERE et.status IN ('locked', 'completed') AND ps.id <> s.id AND ba.user_id < bb.user_id
                 AND ba.status IN ('group_locked', 'revealed', 'checked_in', 'completed') AND ba.no_show IS NOT TRUE
                 AND bb.status IN ('group_locked', 'revealed', 'checked_in', 'completed') AND bb.no_show IS NOT TRUE
                 AND ba.user_id IN (SELECT p.user_id FROM bookings p WHERE p.session_id = s.id AND p.status = 'paid_awaiting_group')
                 AND bb.user_id IN (SELECT p.user_id FROM bookings p WHERE p.session_id = s.id AND p.status = 'paid_awaiting_group')
                 AND abs((s.starts_at AT TIME ZONE 'Asia/Qatar')::date - (ps.starts_at AT TIME ZONE 'Asia/Qatar')::date) <= 90
               GROUP BY ba.user_id, bb.user_id) h), '[]'::json),
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

-- ================================================================ account deletion
-- 014, 015, 017 plus: the companion's name goes too. It becomes '' (not NULL) so the booking still says it had two
-- seats and the counts of past meetups stay right.
CREATE OR REPLACE FUNCTION app.finalize_account_deletions(grace interval DEFAULT interval '14 days') RETURNS integer
LANGUAGE plpgsql SET search_path = app, pg_temp AS $$
DECLARE
  ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO ids FROM (
    SELECT id FROM users WHERE status = 'deletion_requested' AND deletion_requested_at <= now() - grace FOR UPDATE
  ) due;
  IF cardinality(ids) = 0 THEN RETURN 0; END IF;

  DELETE FROM answers WHERE response_id IN (SELECT id FROM questionnaire_responses WHERE user_id = ANY (ids));
  DELETE FROM push_subscriptions WHERE user_id = ANY (ids);
  DELETE FROM notifications_outbox WHERE user_id = ANY (ids);
  DELETE FROM call_requests WHERE user_id = ANY (ids);
  UPDATE payments SET cardholder_name_enc = NULL WHERE user_id = ANY (ids);
  UPDATE bookings SET guest_name = '' WHERE user_id = ANY (ids) AND guest_name IS NOT NULL;
  UPDATE refresh_tokens SET revoked_at = now() WHERE subject_id = ANY (ids) AND revoked_at IS NULL;

  UPDATE users
     SET display_name = NULL,
         phone_e164_enc = '\x'::bytea,
         phone_lookup_hash = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
         status = 'deleted',
         deleted_at = now()
   WHERE id = ANY (ids);
  RETURN cardinality(ids);
END $$;
REVOKE ALL ON FUNCTION app.finalize_account_deletions(interval) FROM PUBLIC;

-- no client role may run the new functions (002 revokes by default; said again here so this file stands alone)
DO $$
DECLARE r text; f text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH f IN ARRAY ARRAY['app.hold_seat(uuid, uuid, uuid, uuid, uuid[], varchar, integer, text)',
                               'app.set_booking_guest(uuid, uuid, text)', 'app.guard_booking_seats()'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, r);
      END LOOP;
    END IF;
  END LOOP;
END $$;
