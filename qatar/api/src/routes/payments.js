// PSP webhook (v0.3 §3.5, v0.4 §1.3.2) and the staging-only mock hosted checkout (test_psp).
import { randomToken } from "../lib/crypto.js";
import { fail, json, money } from "../lib/http.js";
import { applyPspEvent, dispatchRefund } from "../services/payments.js";
import { verifyWebhook } from "../services/psp.js";
import { runAiOpinions } from "../services/identity.js";

// Rejections decided by applyPspEvent (services/payments.js): a retry of the same event cannot change them.
const PERMANENT_REJECTIONS = new Set(["UNKNOWN_PAYMENT_INTENT", "AMOUNT_MISMATCH", "UNKNOWN_REFUND", "REFUND_MISMATCH", "UNSUPPORTED_EVENT_TYPE"]);

// The webhook log keeps the event for audit, but never the name on the card (that is stored encrypted, on the payment).
const withoutCardName = (event) => (event && event.data && event.data.cardholder_name
  ? { ...event, data: { ...event.data, cardholder_name: "[stored encrypted]" } } : event);

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
  // One row per event id. A processed event is a duplicate and is ignored. An event that is still open (its processing
  // failed, below) is NOT a duplicate: the provider's retry is processed again, so a failure never swallows an event.
  const [row] = await sql`
    INSERT INTO app.payment_webhook_events (psp, psp_event_id, event_type, signature_valid, payload)
    VALUES ('test_psp', ${event.id}, ${event.type}, true, ${sql.json(withoutCardName(event))})
    ON CONFLICT (psp, psp_event_id) DO UPDATE SET processing_error = NULL, payload = EXCLUDED.payload, updated_at = now()
      WHERE app.payment_webhook_events.processed_at IS NULL
    RETURNING id, (xmax = 0) AS fresh`;
  if (!row) return json(200, { received: true, duplicate: true });
  let refunds = [];
  try {
    refunds = await applyPspEvent(sql, event, { keys, cfg: ctx.cfg });
    await sql`UPDATE app.payment_webhook_events SET processed_at = now() WHERE id = ${row.id}`;
  } catch (e) {
    const code = String((e && e.message) || "error").slice(0, 500);
    // A rejection the server decided on (an unknown intent, an amount that does not match) will not change on a retry:
    // the event is closed with its error and answered 200. Anything else (the database, a fault) keeps the event open and
    // answers 500, so the provider sends it again and the retry above processes it.
    const permanent = PERMANENT_REJECTIONS.has(code);
    await sql`UPDATE app.payment_webhook_events SET processing_error = ${code}, processed_at = ${permanent ? new Date() : null} WHERE id = ${row.id}`;
    if (permanent) return json(200, { received: true, processed: false, error: code });
    console.error(`webhook ${event.id} (${event.type}) failed and stays open for the provider's retry:`, code);
    fail(500, "WEBHOOK_RETRY", [{ reason: "processing_failed" }]);
  }
  try { await runAiOpinions(sql, ctx, { limit: 3 }); } catch (e) { console.error("ai opinions after webhook:", e && e.message); } // never fails the webhook
  for (const id of refunds) await dispatchRefund(sql, ctx.psp, id);
  return json(200, { received: true, processed: true, retried: !row.fresh });
}

async function mockIntent(ctx) {
  const { sql, cfg, params, locale } = ctx;
  // never in production, whatever MOCK_PSP_ENABLED says (lib/config.js logs the misconfiguration; health reports it)
  if (!cfg.mockPspEnabled || cfg.production) fail(404, "MOCK_PSP_DISABLED");
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
  const cardholderName = typeof ctx.body.cardholder_name === "string" ? ctx.body.cardholder_name.slice(0, 100) : undefined;
  if (outcome !== "cancel") await ctx.psp.completePayment(p, outcome, { cardholder_name: cardholderName });
  return json(200, { outcome, return_url: out.return_url });
}

export const paymentRoutes = [
  { method: "POST", path: "/api/v1/payments/webhooks/{psp}", auth: "none", rawBody: true, handler: webhook },
  { method: "GET", path: "/api/mock-psp/checkout/{pi}", auth: "none", handler: mockGet },
  { method: "POST", path: "/api/mock-psp/checkout/{pi}", auth: "none", handler: mockComplete },
];
