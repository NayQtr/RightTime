-- Choice window (T-24h -> +48h). Users act through the API; user_id always comes from the JWT.
SET search_path = app, public;

-- u14 picks its Q02 alternate S3 ("we transfer your fee as-is")
SELECT booking_ref, status FROM rebook_booking(
  (SELECT id FROM bookings WHERE user_id = '00000000-0000-0000-0000-000000000114' AND status = 'cancelled_by_organizer'),
  '00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0000-00000000f003');

-- the S1 leftover picks S3 (its first alternate, S2, was cancelled)
SELECT r.booking_ref, r.status FROM bookings b,
       LATERAL rebook_booking(b.id, b.user_id, '00000000-0000-0000-0000-00000000f003') r
WHERE b.session_id = '00000000-0000-0000-0000-00000000f001' AND b.cancel_reason_code = 'no_table_formed';

-- u15 picks a full refund (organizer_cancel: automatic, no approval needed)
INSERT INTO refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
SELECT p.id, b.id, p.amount_minor, 'organizer_cancel', 'requested', 'choice-refund-' || b.id
FROM bookings b JOIN payments p ON p.booking_id = b.id AND p.status = 'succeeded'
WHERE b.user_id = '00000000-0000-0000-0000-000000000115' AND b.status = 'cancelled_by_organizer';

-- u16 does not answer.
