// Payment service provider adapter. Only `test_psp` (mock hosted checkout) exists until a real PSP is signed (O05).
// A real adapter implements the same three operations and signs/verifies webhooks with its own scheme (v0.4 §1.3).
import { hmacHex, randomToken, safeEqual } from "../lib/crypto.js";

export const SIGNATURE_HEADER = "x-signature";
export const TIMESTAMP_HEADER = "x-timestamp";
const MAX_SKEW_SECONDS = 300;

export function signWebhook(secret, rawBody, ts = Math.floor(Date.now() / 1000)) {
  return { [SIGNATURE_HEADER]: hmacHex(secret, `${ts}.${rawBody}`), [TIMESTAMP_HEADER]: String(ts) };
}

export function verifyWebhook(secret, rawBody, headers) {
  const sig = headers.get(SIGNATURE_HEADER) || "";
  const ts = headers.get(TIMESTAMP_HEADER) || "";
  if (!sig || !/^[0-9]+$/.test(ts)) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_SKEW_SECONDS) return false;
  return safeEqual(hmacHex(secret, `${ts}.${rawBody}`), sig);
}

export const newPaymentIntentId = () => "pi_test_" + randomToken(12);

// The mock "PSP" delivers its webhooks by calling the real webhook route of this API (through deliver()),
// so signature verification, deduplication and processing are exercised exactly as with a real provider.
export function testPsp({ keys, cfg, deliver }) {
  async function send(event) {
    const raw = JSON.stringify(event);
    return deliver(raw, signWebhook(keys.pspWebhookSecret, raw));
  }
  return {
    name: "test_psp",
    checkoutUrl: (bookingId, intentId) => `${cfg.webBaseUrl}/checkout/mock/${bookingId}?pi=${encodeURIComponent(intentId)}`,
    async completePayment(intent, outcome, extra = {}) {
      const id = "evt_" + randomToken(12);
      if (outcome === "success") {
        return send({ id, type: "payment.succeeded", data: { payment_intent: intent.psp_payment_intent_id,
          amount_minor: intent.amount_minor, currency: intent.currency, method_brand: "visa", card_last4: "4242",
          ...(extra.cardholder_name ? { cardholder_name: extra.cardholder_name } : {}) } });
      }
      const code = outcome === "3ds_failed" ? "3ds_failed" : outcome === "insufficient_funds" ? "insufficient_funds" : "declined";
      return send({ id, type: "payment.failed", data: { payment_intent: intent.psp_payment_intent_id, failure_code: code } });
    },
    async refund(refund, paymentIntentId) {
      const pspRefundId = "re_test_" + randomToken(12);
      await send({ id: "evt_" + randomToken(12), type: "refund.succeeded",
        data: { refund_id: refund.id, psp_refund_id: pspRefundId, payment_intent: paymentIntentId, amount_minor: refund.amount_minor } });
      return pspRefundId;
    },
  };
}

