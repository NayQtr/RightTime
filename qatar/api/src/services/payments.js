// Webhook processing and refund dispatch (v0.3 §3.5, v0.4 §1.3.2 I3–I8).
import { money } from "../lib/http.js";
import { audit, notify } from "./common.js";

// Applies one verified PSP event. Returns refund ids that must be sent to the PSP after commit.
export async function applyPspEvent(sql, event) {
  const toDispatch = [];
  await sql.begin(async (tx) => {
    const d = event.data || {};
    if (event.type === "payment.succeeded" || event.type === "payment.failed") {
      const [p] = await tx`SELECT * FROM app.payments WHERE psp_payment_intent_id = ${d.payment_intent} FOR UPDATE`;
      if (!p) throw new Error("UNKNOWN_PAYMENT_INTENT");
      if (["succeeded", "refunded", "partially_refunded", "failed", "cancelled"].includes(p.status) && p.status !== "failed") return;
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

// Sends one refund to the PSP. requested -> processing (committed) -> PSP call -> refund.succeeded webhook -> refunded.
export async function dispatchRefund(sql, psp, refundId) {
  const row = await sql.begin(async (tx) => {
    const [r] = await tx`SELECT * FROM app.refunds WHERE id = ${refundId} FOR UPDATE`;
    if (!r || !["requested", "processing"].includes(r.status) || r.psp_refund_id) return null;
    await tx`UPDATE app.refunds SET status = 'processing' WHERE id = ${r.id}`;
    const [p] = await tx`SELECT psp_payment_intent_id FROM app.payments WHERE id = ${r.payment_id}`;
    return { refund: r, intent: p.psp_payment_intent_id };
  });
  if (!row) return false;
  try {
    await psp.refund(row.refund, row.intent);
    return true;
  } catch (e) {
    await sql`UPDATE app.refunds SET status = 'failed' WHERE id = ${refundId} AND status = 'processing'`;
    return false;
  }
}
