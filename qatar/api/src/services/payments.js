// Webhook processing and refund dispatch (v0.3 §3.5, v0.4 §1.3.2 I3–I8).
import { encrypt } from "../lib/crypto.js";
import { money } from "../lib/http.js";
import { checkCardName } from "../lib/namematch.js";
import { audit, notify } from "./common.js";

// Applies one verified PSP event. Returns refund ids that must be sent to the PSP after commit.
// opts: { keys, cfg } for the card-name check (015), which runs only when cfg.cardNameCheck is on.
export async function applyPspEvent(sql, event, opts = {}) {
  const toDispatch = [];
  await sql.begin(async (tx) => {
    const d = event.data || {};
    if (event.type === "payment.succeeded" || event.type === "payment.failed") {
      const [p] = await tx`SELECT * FROM app.payments WHERE psp_payment_intent_id = ${d.payment_intent} FOR UPDATE`;
      if (!p) throw new Error("UNKNOWN_PAYMENT_INTENT");
      // NMX-63: a charge that succeeds after the member cancelled (her checkout page was still open) is not ignored: it
      // goes on as a late payment and is refunded automatically below (seat_unavailable), like an expired hold.
      const chargedAfterCancel = p.status === "cancelled" && !p.succeeded_at && event.type === "payment.succeeded";
      if (["succeeded", "refunded", "partially_refunded", "cancelled"].includes(p.status) && !chargedAfterCancel) return;
      const [b] = await tx`SELECT * FROM app.bookings WHERE id = ${p.booking_id} FOR UPDATE`;
      if (event.type === "payment.failed") {
        await tx`UPDATE app.payments SET status = 'failed', failure_code = ${d.failure_code || "other"} WHERE id = ${p.id}`;
        return;
      }
      if (Number(d.amount_minor) !== p.amount_minor || d.currency !== p.currency) {
        await audit(tx, null, "payment_amount_mismatch", "payments", p.id, "I5");
        throw new Error("AMOUNT_MISMATCH");
      }
      const [dup] = await tx`
        SELECT id FROM app.payments WHERE booking_id = ${p.booking_id} AND id <> ${p.id}
           AND status IN ('succeeded','partially_refunded','refunded','disputed')`;
      if (dup) {
        // a second successful charge for the same booking: never kept (v0.4 §1.3.2 I7)
        await tx`UPDATE app.payments SET status = 'cancelled', succeeded_at = now() WHERE id = ${p.id}`;
        const [r] = await tx`
          INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
          VALUES (${p.id}, ${p.booking_id}, ${p.amount_minor}, 'duplicate_charge', 'requested', ${"dup-" + p.id}) RETURNING id`;
        await audit(tx, null, "duplicate_charge_refund", "payments", p.id, "I7");
        toDispatch.push(r.id);
        return;
      }
      await tx`
        UPDATE app.payments SET status = 'succeeded', succeeded_at = now(), failure_code = NULL,
               method_brand = ${d.method_brand || null}, card_last4 = ${d.card_last4 || null}
         WHERE id = ${p.id}`;
      const holdValid = b.status === "payment_pending" && b.hold_expires_at && new Date(b.hold_expires_at) > new Date();
      if (holdValid) {
        await tx`UPDATE app.bookings SET status = 'paid_awaiting_group', hold_expires_at = NULL WHERE id = ${b.id}`;
        await notify(tx, b.user_id, "PAYMENT_CONFIRMED", { ref: b.booking_ref, booking_id: b.id });
        if (opts.cfg && opts.cfg.cardNameCheck) await checkIdentity(tx, opts.keys, p, b, d.cardholder_name);
      } else {
        // paid after the hold was gone (E-PAY-5): automatic full refund, reason seat_unavailable
        const [r] = await tx`
          INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
          VALUES (${p.id}, ${b.id}, ${p.amount_minor}, 'seat_unavailable', 'requested', ${"late-" + p.id}) RETURNING id`;
        toDispatch.push(r.id);
      }
      return;
    }
    if (event.type === "refund.succeeded") {
      const [r] = await tx`SELECT * FROM app.refunds WHERE id = ${d.refund_id} FOR UPDATE`;
      if (!r) throw new Error("UNKNOWN_REFUND");
      if (r.status === "refunded") return;
      await tx`UPDATE app.refunds SET status = 'refunded', psp_refund_id = ${d.psp_refund_id}, completed_at = now() WHERE id = ${r.id}`;
      const [p] = await tx`SELECT * FROM app.payments WHERE id = ${r.payment_id} FOR UPDATE`;
      const [{ total }] = await tx`SELECT COALESCE(sum(amount_minor), 0)::int AS total FROM app.refunds WHERE payment_id = ${p.id} AND status = 'refunded'`;
      if (["succeeded", "partially_refunded"].includes(p.status)) {
        await tx`UPDATE app.payments SET status = ${total >= p.amount_minor ? "refunded" : "partially_refunded"} WHERE id = ${p.id}`;
      }
      const [u] = await tx`SELECT locale FROM app.users WHERE id = ${p.user_id}`;
      await notify(tx, p.user_id, "REFUND_DONE", { amount: money(r.amount_minor, u.locale).display, days: 10, booking_id: r.booking_id });
      return;
    }
    throw new Error("UNSUPPORTED_EVENT_TYPE");
  });
  return toDispatch;
}

// Name on the card vs her registered first name (015). The card name is kept encrypted (owner's decision, 4 Nov). A
// mismatch, or no registered name, opens an identity review: the venue stays hidden from her until an admin approves.
async function checkIdentity(tx, keys, p, b, cardholderName) {
  const name = cardholderName ? String(cardholderName).trim().slice(0, 100) : "";
  const [u] = await tx`SELECT display_name FROM app.users WHERE id = ${b.user_id}`;
  const result = checkCardName(u && u.display_name, name);
  await tx`UPDATE app.payments SET name_check = ${result}, cardholder_name_enc = ${name ? encrypt(keys.dataKey, name) : null} WHERE id = ${p.id}`;
  if (result === "mismatch" || result === "no_name") {
    await tx`INSERT INTO app.identity_reviews (booking_id, payment_id, user_id, result) VALUES (${b.id}, ${p.id}, ${b.user_id}, ${result})
             ON CONFLICT (booking_id) DO NOTHING`;
    await audit(tx, null, "identity_review_opened", "bookings", b.id, result);
  }
}

// Sends one refund to the PSP. requested -> processing (committed) -> PSP call -> refund.succeeded webhook -> refunded.
// Only a 'requested' refund is ever sent, so one refund reaches the PSP at most once from here (two calls at the same
// moment: the row lock lets one through). A PSP error is recorded, never swallowed. Only an error the adapter marks
// `definite` (the PSP refused it, so no money moved) makes the refund 'failed'; any other error (a timeout, a lost
// answer) leaves it 'processing', because the PSP may have paid it: it is not sent again, and refundsTick() reports it
// so finance can check it with the PSP. Sending it again could pay her twice.
export async function dispatchRefund(sql, psp, refundId) {
  const row = await sql.begin(async (tx) => {
    const [r] = await tx`SELECT * FROM app.refunds WHERE id = ${refundId} FOR UPDATE`;
    if (!r || r.status !== "requested" || r.psp_refund_id) return null;
    await tx`UPDATE app.refunds SET status = 'processing' WHERE id = ${r.id}`;
    const [p] = await tx`SELECT psp_payment_intent_id FROM app.payments WHERE id = ${r.payment_id}`;
    return { refund: r, intent: p.psp_payment_intent_id };
  });
  if (!row) return false;
  try {
    await psp.refund(row.refund, row.intent);
    return true;
  } catch (e) {
    console.error(`refund ${refundId}: PSP call failed${e && e.definite ? " (refused)" : " (outcome unknown)"}:`, e && e.message);
    if (e && e.definite) await sql`UPDATE app.refunds SET status = 'failed' WHERE id = ${refundId} AND status = 'processing'`;
    await audit(sql, null, e && e.definite ? "refund_psp_refused" : "refund_psp_error", "refunds", refundId,
      String((e && (e.code || e.message)) || "error").slice(0, 40));
    return false;
  }
}

// Refunds that wait for finance on purpose: the refund she chose after an organizer cancellation, and the automatic one
// after the choice deadline (003, 015). Finance sends them with the batch approval, which sets approved_by.
const WAITS_FOR_FINANCE = sql0 => sql0`(r.approved_by IS NULL AND (r.idempotency_key LIKE 'auto-oc-%' OR r.idempotency_key LIKE 'choice-refund-%'))`;
export const REFUND_RESEND_AFTER_MINUTES = 5;
export const REFUND_STUCK_AFTER_MINUTES = 30;

// Runs every minute with the push dispatcher (routes/push.js). Two jobs:
//  1. A refund that should have gone to the PSP at once but is still 'requested' after 5 minutes (the server stopped
//     between saving it and sending it) is sent now. Safe: 'requested' means it never reached the PSP.
//  2. A refund the PSP refused ('failed'), or one with no answer from the PSP after 30 minutes ('processing'), is
//     reported once to Sentry (and the server log), so finance can deal with it. Neither is ever sent again from here.
// `report(err)` sends to Sentry; returns { resent, reported }.
export async function refundsTick(sql, psp, { report = async () => false } = {}) {
  const missed = await sql`
    SELECT r.id FROM app.refunds r
     WHERE r.status = 'requested' AND r.updated_at < now() - make_interval(mins => ${REFUND_RESEND_AFTER_MINUTES})
       AND NOT ${WAITS_FOR_FINANCE(sql)}
     ORDER BY r.created_at LIMIT 20`;
  let resent = 0;
  for (const r of missed) if (await dispatchRefund(sql, psp, r.id)) resent++;
  const stuck = await sql`
    SELECT r.id, r.status, r.reason, r.created_at FROM app.refunds r
     WHERE (r.status = 'failed' OR (r.status = 'processing' AND r.updated_at < now() - make_interval(mins => ${REFUND_STUCK_AFTER_MINUTES})))
       AND NOT EXISTS (SELECT 1 FROM app.audit_logs a WHERE a.entity = 'refunds' AND a.entity_id = r.id AND a.action = 'refund_stuck_reported')
     ORDER BY r.created_at LIMIT 20`;
  for (const r of stuck) {
    const what = r.status === "failed" ? "refused by the PSP" : `no PSP answer after ${REFUND_STUCK_AFTER_MINUTES} minutes`;
    const err = new Error(`Refund ${r.id} (${r.reason}) ${what}: check it with the PSP; do not send it again before that`);
    err.name = "RefundNeedsFinance";
    console.error(err.message);
    await report(err);
    await audit(sql, null, "refund_stuck_reported", "refunds", r.id, r.status);
  }
  return { resent, reported: stuck.length };
}
