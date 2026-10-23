-- After choice_deadline: automatic refunds for members who did not choose, then the finance batch.
-- Production call: refund_unresolved_organizer_cancels(now() - interval '48 hours').
-- Simulation: the deadline is treated as passed for everything cancelled so far.
SET search_path = app, public;
SELECT refund_unresolved_organizer_cancels(clock_timestamp()) AS auto_refunds_created;

-- Batch: finance (a002) approves every requested organizer_cancel refund -> processing
WITH batch AS (
  UPDATE refunds SET status = 'processing', approved_by = '00000000-0000-0000-0000-00000000a002'
  WHERE status = 'requested' AND reason = 'organizer_cancel'
  RETURNING id
)
INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason_code)
SELECT '00000000-0000-0000-0000-00000000a002', 'refund_batch_approve', 'refunds', id, 'organizer_cancel' FROM batch;

-- PSP confirms each refund (in production: refund.succeeded webhook, deduplicated on (psp, psp_event_id))
INSERT INTO payment_webhook_events (psp, psp_event_id, event_type, signature_valid, payload, processed_at)
SELECT 'test_psp', 'evt_rf_' || r.id, 'refund.succeeded', true, jsonb_build_object('refund', 're_' || r.id), now()
FROM refunds r WHERE r.status = 'processing';

WITH done AS (
  UPDATE refunds SET status = 'refunded', psp_refund_id = 're_' || id, completed_at = now()
  WHERE status = 'processing'
  RETURNING id, payment_id, booking_id, amount_minor
), pay AS (
  UPDATE payments p SET status = 'refunded'
  FROM done WHERE p.id = done.payment_id
  RETURNING p.user_id, done.amount_minor, done.booking_id
)
INSERT INTO notifications_outbox (user_id, channel, template_key, locale, payload)
SELECT pay.user_id, 'push', 'REFUND_DONE', u.locale,
       jsonb_build_object('booking_id', pay.booking_id, 'amount_minor', pay.amount_minor, 'days', 10)
FROM pay JOIN users u ON u.id = pay.user_id;
