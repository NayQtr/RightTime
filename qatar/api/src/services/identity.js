// Identity reviews (015): shared steps for the admin decision and Gemini's second opinion.
import { decrypt } from "../lib/crypto.js";
import { askNameOpinion, clearsReview } from "../lib/ai.js";
import { audit, currentTable, notify } from "./common.js";
import { reportError, sentryEnv } from "../lib/sentry.js";

/** Once a review is approved: if the venue was already revealed for her session, send her the venue notice now. */
export async function sendHeldVenueNotice(tx, bookingId) {
  const [b] = await tx`SELECT id, user_id, status FROM app.bookings WHERE id = ${bookingId}`;
  if (!b || b.status !== "revealed") return;
  const t = await currentTable(tx, b.id);
  const [v] = t && t.venue_id ? await tx`SELECT name, district_ar FROM app.venues WHERE id = ${t.venue_id}` : [null];
  if (v) await notify(tx, b.user_id, "VENUE_REVEALED", { booking_id: b.id, venue: v.name, district: v.district_ar, code: t.table_code });
}

/**
 * Asks Gemini about pending "different name" reviews it has not seen yet, saves its opinion, and clears the review when
 * it is confident the name is the same (lib/ai.js clearsReview). Runs after a payment and when admins open the list, so a
 * busy or unreachable Gemini is simply asked again later. Never throws.
 */
export async function runAiOpinions(sql, { getEnv, cfg, keys }, { limit = 5 } = {}) {
  const apiKey = getEnv ? getEnv("GEMINI_API_KEY") : undefined;
  if (!cfg.cardNameCheck || !apiKey) return 0;
  let done = 0;
  try {
    const rows = await sql`
      SELECT ir.id, ir.booking_id, u.display_name, p.cardholder_name_enc
        FROM app.identity_reviews ir JOIN app.users u ON u.id = ir.user_id JOIN app.payments p ON p.id = ir.payment_id
       WHERE ir.status = 'pending' AND ir.result = 'mismatch' AND ir.ai_checked_at IS NULL AND p.cardholder_name_enc IS NOT NULL
       ORDER BY ir.created_at LIMIT ${limit}`;
    for (const r of rows) {
      const opinion = await askNameOpinion({ apiKey, model: cfg.geminiModel, baseUrl: cfg.geminiBaseUrl,
        registered: r.display_name, card: decrypt(keys.dataKey, r.cardholder_name_enc) });
      if (!opinion) continue;
      await sql.begin(async (tx) => {
        const clear = clearsReview(opinion);
        const updated = await tx`
          UPDATE app.identity_reviews SET ai_same_name = ${opinion.same}, ai_card_gender = ${opinion.gender},
                 ai_confidence = ${Math.round(opinion.confidence * 100) / 100}, ai_checked_at = now(),
                 status = ${clear ? "approved" : "pending"}, decided_by_ai = ${clear}, decided_at = ${clear ? new Date() : null}
           WHERE id = ${r.id} AND status = 'pending' RETURNING id`;
        if (!updated.length) return;
        if (clear) {
          await sendHeldVenueNotice(tx, r.booking_id);
          await audit(tx, null, "identity_review_ai_cleared", "bookings", r.booking_id, `confidence_${opinion.confidence}`);
        } else if (opinion.gender === "male") {
          await audit(tx, null, "identity_review_ai_male_name", "bookings", r.booking_id, `confidence_${opinion.confidence}`);
        }
      });
      done += 1;
    }
  } catch (e) {
    // a person reviews it; the payment and the list never fail because of the second opinion. The error is still
    // logged, and a database error (not only a failed AI call) reaches Sentry.
    console.error("identity second opinion failed:", e && e.message);
    await reportError(sentryEnv(getEnv, cfg), e, { route: "identity second opinion" });
  }
  return done;
}
