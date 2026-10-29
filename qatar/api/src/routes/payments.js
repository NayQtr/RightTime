// PSP webhook (v0.3 §3.5, v0.4 §1.3.2) and the staging-only mock hosted checkout (test_psp).
import { randomToken } from "../lib/crypto.js";
import { fail, json, money } from "../lib/http.js";
import { applyPspEvent, dispatchRefund } from "../services/payments.js";
import { verifyWebhook } from "../services/psp.js";

async function webhook(ctx) {
  const { sql, keys, params, rawBody, req } = ctx;
  if (params.psp !== "test_psp") fail(404, "NOT_FOUND");
  const valid = verifyWebhook(keys.pspWebhookSecret, rawBody, req.headers);
  let event = null;
  try { event = JSON.parse(rawBody); } catch { /* stored as invalid below */ }
  if (!valid || !event || !event.id || !event.type) {
    await sql`INSERT INTO app.payment_webhook_events (psp, psp_event_id, event_type, signature_valid, payload, processing_error)
              VALUES ('test_psp', ${"invalid-" + randomToken(12)}, ${String((event && event.type) || "unknown").slice(0, 60)}, false,
                      ${sql.json(event || { raw_length: rawBody.length })}, 'signature_invalid')`;
    fail(401, "SIGNATURE_INVALID");
  }
  const inserted = await sql`
    INSERT INTO app.payment_webhook_events (psp, psp_event_id, event_type, signature_valid, payload)
    VALUES ('test_psp', ${event.id}, ${event.type}, true, ${sql.json(event)})
    ON CONFLICT (psp, psp_event_id) DO NOTHING RETURNING id`;
  if (!inserted.length) return json(200, { received: true, duplicate: true });
  let refunds = [];
  try {
    refunds = await applyPspEvent(sql, event);
    await sql`UPDATE app.payment_webhook_events SET processed_at = now() WHERE id = ${inserted[0].id}`;
  } catch (e) {
    await sql`UPDATE app.payment_webhook_events SET processing_error = ${String(e.message).slice(0, 500)} WHERE id = ${inserted[0].id}`;
    return json(200, { received: true, processed: false });
  }
  for (const id of refunds) await dispatchRefund(sql, ctx.psp, id);
  return json(200, { received: true, processed: true });
}

async function mockIntent(ctx) {
  const { sql, cfg, params, locale } = ctx;
  if (!cfg.mockPspEnabled) fail(404, "MOCK_PSP_DISABLED");
  const [p] = await sql`
    SELECT p.*, b.booking_ref, b.hold_expires_at, b.status AS booking_status FROM app.payments p JOIN app.bookings b ON b.id = p.booking_id
     WHERE p.psp_payment_intent_id = ${params.pi}`;
  if (!p) fail(404, "NOT_FOUND");
  return { p, out: { payment_intent: p.psp_payment_intent_id, booking_id: p.booking_id, booking_ref: p.booking_ref, status: p.status,
    amount: money(p.amount_minor, locale), hold_expires_at: p.hold_expires_at, merchant: "HerZone (test)",
    return_url: `${cfg.webBaseUrl}/#/pay/return/${p.booking_id}` } };
}

async function mockGet(ctx) {
  const { out } = await mockIntent(ctx);
  return json(200, out);
}

async function mockComplete(ctx) {
  const { p, out } = await mockIntent(ctx);
  const outcome = ctx.body.outcome;
  if (!["success", "declined", "3ds_failed", "insufficient_funds", "cancel"].includes(outcome)) fail(422, "VALIDATION_FAILED", [{ field: "outcome" }]);
  if (p.status !== "created" && p.status !== "failed") fail(409, "PAYMENT_NOT_PENDING");
  if (outcome !== "cancel") await ctx.psp.completePayment(p, outcome);
  return json(200, { outcome, return_url: out.return_url });
}

export const paymentRoutes = [
  { method: "POST", path: "/api/v1/payments/webhooks/{psp}", auth: "none", rawBody: true, handler: webhook },
  { method: "GET", path: "/api/mock-psp/checkout/{pi}", auth: "none", handler: mockGet },
  { method: "POST", path: "/api/mock-psp/checkout/{pi}", auth: "none", handler: mockComplete },
];
