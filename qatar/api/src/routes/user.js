// User-facing API (v0.3 §3.2–3.5 + v0.4 C14). user_id is ALWAYS ctx.user.id from the verified JWT.
import { decrypt, encrypt, hmacB64, hmacHex, randomDigits, randomToken, randomUUID, safeEqual, sha256hex } from "../lib/crypto.js";
import { fail, json, money, qa, requireUuid } from "../lib/http.js";
import { ALL_COUNTRIES } from "../lib/config.js";
import { callingCodeOf } from "../lib/countries.js";
import { decisionLabel, durationText, outboundText } from "../lib/i18n.js";
import { sendSms, smsSettings } from "../lib/sms.js";
import { audit, capturedPayment, computePhase, currentTable, notify, seatToken } from "../services/common.js";
import { alertKind, pageWithin, raiseAlert } from "../services/coordinator_alerts.js";
import { dispatchRefund } from "../services/payments.js";
import { newPaymentIntentId } from "../services/psp.js";
import { LOW_RATING_REASONS } from "../lib/feedback.js";
import { isE164 } from "../lib/validate.js";
import { issueTokens, refreshTokens } from "../services/auth.js";
import { notificationText, notifySessionAlerts } from "../services/notifications.js";

const CONSENT_DOC = { terms: "terms", conduct: "conduct", privacy_notice: "privacy", marketing: "marketing" };
const REQUIRED_CONSENTS = ["terms", "conduct", "privacy_notice"];
const SINGLE_TYPES = ["single", "tier", "contact_request"];
const REPORT_CATEGORIES = ["harassment", "threat_violence", "photo_without_consent", "stalking_unwanted_contact", "fraud", "disruptive"];
const SEVERITY_BY_CATEGORY = { threat_violence: 1, harassment: 2, stalking_unwanted_contact: 2, photo_without_consent: 2, fraud: 2, disruptive: 3 };
const SLA_HOURS = { 1: 24, 2: 72, 3: 168, 4: 336 };

// ------------------------------------------------------------------ tokens: services/auth.js

const registrationStatus = (u) => (u.registration_completed_at ? "complete" : "consents_required");
const userView = (u) => ({ id: u.id, display_name: u.display_name, locale: u.locale, status: u.status, registration_status: registrationStatus(u),
  woman_confirmed: Boolean(u.woman_confirmed_at) });

// ------------------------------------------------------------------ profile helpers
async function submittedResponse(sql, userId) {
  const [r] = await sql`SELECT * FROM app.questionnaire_responses WHERE user_id = ${userId} AND status = 'submitted'`;
  return r || null;
}

async function profileOf(sql, responseId) {
  const rows = await sql`
    SELECT q.key, o.key AS option_key, o.maps_to FROM app.answers a
      JOIN app.questions q ON q.id = a.question_id JOIN app.question_options o ON o.id = a.option_id
     WHERE a.response_id = ${responseId}`;
  const languages = rows.filter((r) => r.key === "Q01" && r.maps_to && r.maps_to.language).map((r) => r.maps_to.language);
  const tierRow = rows.find((r) => r.key === "Q04" && r.maps_to && r.maps_to.budget_tier_id);
  let tier = null;
  if (tierRow) [tier] = await sql`SELECT id, rank, label_ar, label_en, max_spend_minor FROM app.budget_tiers WHERE id = ${tierRow.maps_to.budget_tier_id}`;
  return {
    languages, tier,
    onlyOther: rows.some((r) => r.key === "Q01" && r.option_key === "lang_other") && languages.length === 0,
    q07Private: rows.some((r) => r.key === "Q07" && r.option_key === "private_contact"),
  };
}

async function ownedBooking(sql, ctx, id, lock = false) {
  requireUuid(id, "booking_id");
  const [b] = lock
    ? await sql`SELECT * FROM app.bookings WHERE id = ${id} AND user_id = ${ctx.user.id} FOR UPDATE`
    : await sql`SELECT * FROM app.bookings WHERE id = ${id} AND user_id = ${ctx.user.id}`;
  if (!b) fail(404, "BOOKING_NOT_FOUND");
  return b;
}

const district = (s, locale) => (locale === "en" ? s.district_hint_en : s.district_hint_ar);
const hoursBefore = (ts, h) => new Date(new Date(ts).getTime() - h * 3600 * 1000);

// Refund terms that apply to a booking right now (audit F1): after the full-refund cut-off the fee is not refunded
// (or only late_cancel_refund_pct), so an unpaid booking must carry an explicit acknowledgement before checkout.
async function refundTerms(sql, b, s = null) {
  const [cp] = await sql`SELECT full_refund_until_hours, late_cancel_refund_pct FROM app.cancellation_policies WHERE version = ${b.cancellation_policy_version}`;
  if (!s) [s] = await sql`SELECT starts_at FROM app.event_sessions WHERE id = ${b.session_id}`;
  const fullUntil = hoursBefore(s.starts_at, cp.full_refund_until_hours);
  const windowOpen = new Date() <= fullUntil;
  return { fullUntil, windowOpen, hours: cp.full_refund_until_hours, pct: cp.late_cancel_refund_pct,
    afterPayment: windowOpen ? "full" : cp.late_cancel_refund_pct > 0 ? "partial" : "none",
    ackRequired: b.status === "payment_pending" && !windowOpen && !b.late_no_refund_ack_at };
}
const termsView = (t) => ({ full_refund_until: qa(t.fullUntil), full_refund_until_hours: t.hours, full_refund_window_open: t.windowOpen,
  refund_if_cancelled_after_payment: t.afterPayment, late_cancel_refund_pct: t.pct, acknowledgement_required: t.ackRequired ? "late_no_refund" : null });

async function tableMembers(sql, tableId) {
  return sql`
    SELECT b.id AS booking_id, b.user_id, b.occasion, u.display_name FROM app.table_assignments a
      JOIN app.bookings b ON b.id = a.booking_id JOIN app.users u ON u.id = b.user_id
     WHERE a.table_id = ${tableId} AND a.is_current AND b.status IN ('paid_awaiting_group','group_locked','revealed','checked_in','completed')
     ORDER BY b.created_at`;
}

// ------------------------------------------------------------------ auth
// Item 11: Apple and Google reviewers sign in with one fixed number and code, the Edge Function secrets
// REVIEW_PHONE_E164 and REVIEW_OTP_CODE (off unless both are set and the code is 6 digits). For that number no SMS is
// sent and the challenge carries that code; the request limits and the 5 attempts stay, and each use is audited.
export function reviewLogin(getEnv) {
  const phone = String((getEnv && getEnv("REVIEW_PHONE_E164")) || "").replace(/[\s\-().]/g, "");
  const code = String((getEnv && getEnv("REVIEW_OTP_CODE")) || "").trim();
  return isE164(phone) && /^[0-9]{6}$/.test(code) ? { phone, code } : null;
}

// The calling code a number belongs to, or null when the server does not accept it. `allowed` is ALL_COUNTRIES (every
// country in the built-in table, lib/countries.js) or an explicit list of calling codes; `blocked` always holds +972
// (owner's decision, 11 Nov 2026). The longest code wins, so a 3-digit code is never read as a 1-digit one.
export const countryOf = (phone, allowed, blocked = []) => {
  const code = allowed === ALL_COUNTRIES
    ? callingCodeOf(phone)
    : [...allowed].sort((a, b) => b.length - a.length).find((c) => phone.startsWith(`+${c}`)) || null;
  return code && !blocked.includes(code) ? code : null;
};

async function otpRequest(ctx) {
  const { sql, cfg, keys, body } = ctx;
  const phone = String(body.phone_e164 || "").trim();
  if (!isE164(phone)) fail(400, "INVALID_PHONE", [{ field: "phone_e164", code: "INVALID_PHONE" }]);
  const review = reviewLogin(ctx.getEnv);
  const isReview = Boolean(review && review.phone === phone);
  // Item 38 (owner's decision, 11 Nov 2026): every country except Israel (+972), which is refused whatever the settings
  // say. A Qatar number keeps its strict pattern; any other country takes any valid international number. The
  // reviewer's number is taken as set.
  const country = countryOf(phone, cfg.phoneCountryCodes, cfg.phoneBlockedCountryCodes);
  if (!country && !isReview) fail(422, "UNSUPPORTED_COUNTRY", [{ field: "phone_e164", code: "UNSUPPORTED_COUNTRY" }]);
  if (country === "974" && !isReview && !/^\+974[3-7][0-9]{7}$/.test(phone)) fail(400, "INVALID_PHONE", [{ field: "phone_e164", code: "INVALID_PHONE" }]);
  const lookup = hmacHex(keys.phonePepper, phone);
  await sql`SELECT app.purge_otp_challenges()`;
  // a code that never reached her (SMS refused, below) does not make her wait to ask again; it still counts in the limits
  const [last] = await sql`SELECT created_at FROM app.otp_challenges WHERE phone_lookup_hash = ${lookup} AND expires_at > now()
                             ORDER BY created_at DESC LIMIT 1`;
  if (last) {
    const age = (Date.now() - new Date(last.created_at).getTime()) / 1000;
    if (age < cfg.otpResendAfter) fail(429, "OTP_RATE_LIMITED", null, { retry_after: Math.ceil(cfg.otpResendAfter - age) });
  }
  const [{ n_phone }] = await sql`SELECT count(*)::int AS n_phone FROM app.otp_challenges WHERE phone_lookup_hash = ${lookup} AND created_at > now() - interval '1 hour'`;
  if (n_phone >= 5) fail(429, "OTP_RATE_LIMITED", null, { retry_after: 3600 });
  const [{ n_ip }] = await sql`SELECT count(*)::int AS n_ip FROM app.otp_challenges WHERE request_ip_trunc = ${ctx.ipBucket}::inet AND created_at > now() - interval '1 hour'`;
  if (n_ip >= 20) fail(429, "OTP_RATE_LIMITED", null, { retry_after: 3600 });
  // Item 37: the code goes by SMS when a provider is set up (SMS_PROVIDER and its secrets). Without one, only staging's
  // OTP_DEV_MODE (code in the answer) or the reviewer's number can sign in; production answers 503 as before.
  const sms = isReview ? null : smsSettings(ctx.getEnv, cfg.smsProvider);
  if (!isReview && !sms && !cfg.otpDevMode) fail(503, "UNAVAILABLE", [{ reason: "no SMS provider configured" }]);
  const id = randomUUID();
  const code = isReview ? review.code : randomDigits(6);
  await sql.begin(async (tx) => {
    // Paid SMS outside Qatar: at most OTP_COUNTRY_HOURLY_CAP codes an hour per country, against abuse. Counted and
    // taken under one lock per country, so parallel requests (even across function copies) never pass the cap.
    if (country && country !== "974" && !isReview) {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`otp-country:${country}`}))`;
      const [{ n_cc }] = await tx`SELECT count(*)::int AS n_cc FROM app.otp_challenges WHERE country_code = ${country} AND created_at > now() - interval '1 hour'`;
      if (n_cc >= cfg.otpCountryHourlyCap) fail(429, "OTP_RATE_LIMITED", null, { retry_after: 3600 });
    }
    await tx`
      INSERT INTO app.otp_challenges (id, phone_lookup_hash, phone_e164_enc, code_hash, expires_at, request_ip_trunc, country_code)
      VALUES (${id}, ${lookup}, ${encrypt(keys.dataKey, phone)}, ${hmacB64(keys.phonePepper, `${id}:${code}`)},
              now() + make_interval(secs => ${cfg.otpTtl}), ${ctx.ipBucket}::inet, ${country})`;
  });
  if (isReview) await audit(sql, null, "review_login_code", "otp_challenges", id, "no_sms", ctx.ipTrunc);
  if (sms) {
    // in her language: the one she chose in the app, else the request's
    const locale = ["ar", "en"].includes(body.locale) ? body.locale : ctx.locale;
    const sent = await sendSms({ to: phone, body: outboundText("SMS_SIGN_IN_CODE", locale, { code, minutes: Math.round(cfg.otpTtl / 60) }) }, sms);
    if (!sent.ok) {
      // no code reached her: the challenge can no longer be used (nor guessed), but it stays, so it still counts toward
      // the per-number, per-address and per-country limits (a refused send may still be paid for)
      await sql`UPDATE app.otp_challenges SET expires_at = now() WHERE id = ${id}`;
      fail(503, "UNAVAILABLE", [{ reason: "SMS not sent" }]);
    }
  }
  // the code is shown only on staging without a provider, and never for the reviewer's number
  return json(202, { challenge_id: id, expires_in: cfg.otpTtl, resend_after: cfg.otpResendAfter, code_length: 6,
    ...(cfg.otpDevMode && !sms && !isReview ? { dev_code: code } : {}) });
}

async function otpVerify(ctx) {
  const { sql, cfg, keys, body } = ctx;
  requireUuid(body.challenge_id, "challenge_id");
  if (!/^[0-9]{6}$/.test(String(body.code || ""))) fail(400, "OTP_INVALID", [{ field: "code", attempts_remaining: null }]);
  const [ch] = await sql`SELECT * FROM app.otp_challenges WHERE id = ${body.challenge_id}`;
  if (!ch) fail(404, "CHALLENGE_NOT_FOUND");
  if (ch.consumed_at || new Date(ch.expires_at) < new Date()) fail(410, "OTP_EXPIRED");
  // NMX-63: take an attempt atomically before comparing, so parallel guesses (even across function copies) can never
  // exceed the attempt limit
  const [slot] = await sql`UPDATE app.otp_challenges SET attempts = attempts + 1 WHERE id = ${ch.id} AND attempts < ${cfg.otpMaxAttempts} RETURNING attempts`;
  if (!slot) fail(423, "OTP_LOCKED", null, { retry_after: cfg.otpResendAfter });
  if (!safeEqual(hmacB64(keys.phonePepper, `${ch.id}:${body.code}`), ch.code_hash.trim())) {
    fail(400, "OTP_INVALID", [{ field: "code", attempts_remaining: Math.max(0, cfg.otpMaxAttempts - slot.attempts) }]);
  }
  const consumed = await sql`UPDATE app.otp_challenges SET consumed_at = now() WHERE id = ${ch.id} AND consumed_at IS NULL RETURNING id`;
  if (!consumed.length) fail(410, "OTP_EXPIRED");
  let isNew = false;
  let [user] = await sql`SELECT * FROM app.users WHERE phone_lookup_hash = ${ch.phone_lookup_hash}`;
  if (!user) {
    const locale = body.locale === "en" ? "en" : "ar";
    [user] = await sql`
      INSERT INTO app.users (phone_e164_enc, phone_lookup_hash, locale) VALUES (${ch.phone_e164_enc}, ${ch.phone_lookup_hash}, ${locale})
      ON CONFLICT (phone_lookup_hash) DO UPDATE SET last_login_at = now() RETURNING *`;
    isNew = true;
  }
  // Signing in during the 14 days after a deletion request cancels it (privacy notice: "you can change your mind").
  if (user.status === "deletion_requested") {
    [user] = await sql`UPDATE app.users SET status = 'active' WHERE id = ${user.id} AND status = 'deletion_requested' RETURNING *`;
  }
  await sql`UPDATE app.users SET last_login_at = now() WHERE id = ${user.id}`;
  const review = reviewLogin(ctx.getEnv);
  if (review && hmacHex(keys.phonePepper, review.phone) === ch.phone_lookup_hash) await audit(sql, null, "review_login", "users", user.id, null, ctx.ipTrunc);
  // A sign-in while another session of this account is still active: tell her (NMX-38). The lock screen shows only the
  // generic line (NMX-21); the text is in her inbox.
  if (!isNew) {
    const [other] = await sql`SELECT 1 FROM app.refresh_tokens WHERE subject_type = 'user' AND subject_id = ${user.id}
                                AND revoked_at IS NULL AND expires_at > now() LIMIT 1`;
    if (other) await notify(sql, user.id, "NEW_SIGN_IN", { date: new Date().toISOString() });
  }
  const tokens = await issueTokens(ctx, "user", user.id);
  return json(200, { ...tokens, user: { id: user.id, is_new: isNew, registration_status: registrationStatus(user), locale: user.locale, status: user.status } });
}


async function logout(ctx) {
  const token = String(ctx.body.refresh_token || "");
  // Also end the session the access token belongs to (its sid): a client may send a refresh token that a refresh
  // rotated a moment ago, and signing out must still end the session it is in.
  const sid = ctx.claims?.sid ?? null;
  await ctx.sql`UPDATE app.refresh_tokens SET revoked_at = now()
                 WHERE subject_id = ${ctx.user.id} AND revoked_at IS NULL
                   AND (token_hash = ${sha256hex(token)} OR (${sid}::uuid IS NOT NULL AND family_id = ${sid}::uuid))`;
  return json(204, null);
}

async function legalCurrent(ctx) {
  const rows = await ctx.sql`
    SELECT DISTINCT ON (type) type, version, text_ar, text_en FROM app.legal_documents
     WHERE published_at <= now() ORDER BY type, published_at DESC`;
  const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
  const out = {};
  for (const [consent, doc] of Object.entries(CONSENT_DOC)) {
    if (byType[doc]) out[consent] = { document_version: byType[doc].version, required: REQUIRED_CONSENTS.includes(consent),
      text: ctx.locale === "en" ? byType[doc].text_en : byType[doc].text_ar };
  }
  if (byType.cancellation) out.cancellation = { document_version: byType.cancellation.version, text: ctx.locale === "en" ? byType.cancellation.text_en : byType.cancellation.text_ar };
  return json(200, out);
}

async function register(ctx) {
  const { sql, body, user } = ctx;
  if (user.registration_completed_at) fail(409, "ALREADY_REGISTERED");
  const details = [];
  // the first name is required (4 Nov): it is compared with the name on the payment card (identity check, 015)
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  if (!displayName) details.push({ field: "display_name", code: "REQUIRED" });
  else if (!/^[\p{L} \-]{1,30}$/u.test(displayName)) details.push({ field: "display_name", code: "INVALID" });
  if (!["ar", "en"].includes(body.locale)) details.push({ field: "locale", code: "REQUIRED" });
  if (details.length) fail(422, "VALIDATION_FAILED", details);
  if (body.age_eligibility_confirmed !== true) fail(422, "AGE_NOT_ELIGIBLE", [{ field: "age_eligibility_confirmed", code: "REQUIRED" }]);
  if (body.woman_confirmed !== true) fail(422, "WOMEN_ONLY", [{ field: "woman_confirmed", code: "REQUIRED" }]);
  const consents = Array.isArray(body.consents) ? body.consents : [];
  checkConsentShape(consents);
  const missing = REQUIRED_CONSENTS.filter((t) => !consents.some((c) => c.type === t && c.granted === true));
  if (missing.length) fail(422, "CONSENT_REQUIRED", missing.map((t) => ({ field: `consents.${t}`, code: "REQUIRED" })));
  await checkConsentVersions(sql, consents);
  const [u] = await sql.begin(async (tx) => {
    for (const c of consents) {
      await tx`INSERT INTO app.user_consents (user_id, consent_type, document_version, granted, source, ip_trunc)
               VALUES (${user.id}, ${c.type}, ${c.document_version}, ${c.granted}, 'app_web', ${ctx.ipTrunc}::inet)`;
    }
    return tx`UPDATE app.users SET display_name = ${displayName}, locale = ${body.locale},
                     age_eligibility_confirmed_at = now(), woman_confirmed_at = now(), registration_completed_at = now()
               WHERE id = ${user.id} RETURNING *`;
  });
  return json(201, { user: userView(u), next: "questionnaire" });
}

async function currentDocVersions(sql) {
  const docs = await sql`
    SELECT DISTINCT ON (type) type, version FROM app.legal_documents WHERE published_at <= now() ORDER BY type, published_at DESC`;
  return Object.fromEntries(docs.map((d) => [d.type, d.version]));
}

// Each entry is an object with a known type and a boolean, and each type appears once (two rows recorded in the same
// transaction share a timestamp, so current_consents could not tell which one wins).
function checkConsentShape(consents) {
  const seen = new Set();
  for (const c of consents) {
    if (!c || typeof c !== "object" || !(c.type in CONSENT_DOC) || typeof c.granted !== "boolean" || seen.has(c.type))
      fail(422, "VALIDATION_FAILED", [{ field: "consents", code: "INVALID" }]);
    seen.add(c.type);
  }
}

async function checkConsentVersions(sql, consents, current = null) {
  checkConsentShape(consents);
  current = current || await currentDocVersions(sql);
  for (const c of consents) {
    const cur = current[CONSENT_DOC[c.type]];
    if (!cur || c.document_version !== cur) fail(422, "DOCUMENT_VERSION_OUTDATED", [{ field: `consents.${c.type}`, current_version: cur || null }]);
  }
  return current;
}

// Required consents whose latest grant is for an older version than the published document (e.g. an updated privacy notice).
async function outdatedConsents(sql, user, current = null) {
  if (!user.registration_completed_at) return [];
  current = current || await currentDocVersions(sql);
  const mine = await sql`SELECT consent_type, document_version, granted FROM app.current_consents WHERE user_id = ${user.id}`;
  return REQUIRED_CONSENTS.filter((t) => {
    const cur = current[CONSENT_DOC[t]];
    const m = mine.find((r) => r.consent_type === t);
    return cur && !(m && m.granted && m.document_version === cur);
  });
}

const me = async (ctx) => {
  const [p] = await ctx.sql`SELECT phone_e164_enc FROM app.users WHERE id = ${ctx.user.id}`;
  const phone = p && p.phone_e164_enc && p.phone_e164_enc.length ? decrypt(ctx.keys.dataKey, p.phone_e164_enc) : null;
  return json(200, { user: { ...userView(ctx.user), phone_e164: phone, outdated_consents: await outdatedConsents(ctx.sql, ctx.user) } });
};

// A copy of the member's own data (right of access, PDPPL; NMX-38): one JSON file with her account, consents, latest
// answers, bookings, payments, refunds, ratings and the reports she made. Other members' data is never included (no
// names, no reported person). Never cached.
async function exportMe(ctx) {
  const { sql, user, keys, locale } = ctx;
  const L = (row, f) => (locale === "en" ? row[`${f}_en`] : row[`${f}_ar`]);
  const [u] = await sql`SELECT * FROM app.users WHERE id = ${user.id}`;
  const consents = await sql`SELECT consent_type, document_version, granted, recorded_at, source FROM app.user_consents
                              WHERE user_id = ${user.id} ORDER BY recorded_at`;
  const [resp] = await sql`SELECT id, submitted_at FROM app.questionnaire_responses WHERE user_id = ${user.id} AND status = 'submitted'
                            ORDER BY submitted_at DESC LIMIT 1`;
  const answers = resp ? await sql`
    SELECT q.key, q.text_ar, q.text_en, o.label_ar, o.label_en FROM app.answers a
      JOIN app.questions q ON q.id = a.question_id JOIN app.question_options o ON o.id = a.option_id
     WHERE a.response_id = ${resp.id} ORDER BY q.sort_order, o.sort_order` : [];
  const byQuestion = [];
  for (const r of answers) {
    const last = byQuestion[byQuestion.length - 1];
    if (last && last.key === r.key) last.answers.push(L(r, "label"));
    else byQuestion.push({ key: r.key, question: L(r, "text"), answers: [L(r, "label")] });
  }
  const bookings = await sql`
    SELECT b.id, b.booking_ref, b.status, b.price_minor, b.created_at, b.cancelled_at, s.experience, s.starts_at
      FROM app.bookings b JOIN app.event_sessions s ON s.id = b.session_id WHERE b.user_id = ${user.id} ORDER BY s.starts_at`;
  const refOf = Object.fromEntries(bookings.map((b) => [b.id, b.booking_ref]));
  const payments = await sql`SELECT booking_id, amount_minor, status, method_brand, card_last4, succeeded_at, created_at
                               FROM app.payments WHERE user_id = ${user.id} ORDER BY created_at`;
  const refunds = await sql`SELECT r.booking_id, r.amount_minor, r.reason, r.status, r.completed_at, r.created_at
                              FROM app.refunds r JOIN app.payments p ON p.id = r.payment_id WHERE p.user_id = ${user.id} ORDER BY r.created_at`;
  const feedback = await sql`SELECT booking_id, overall_rating, comfort_rating, venue_rating, would_book_again, comment_private, low_rating_reasons, submitted_at
                               FROM app.event_feedback WHERE user_id = ${user.id} ORDER BY submitted_at`;
  const alerts = await sql`SELECT created_at, notified_at FROM app.session_alerts WHERE user_id = ${user.id} ORDER BY created_at`;
  const codes = await sql`SELECT code, percent_off, is_active, uses, max_uses, created_at FROM app.promo_codes WHERE user_id = ${user.id} ORDER BY created_at`;
  const reports = await sql`SELECT case_ref, booking_id, category, timing, immediate_danger, description_enc, status, created_at
                              FROM app.safety_reports WHERE reporter_user_id = ${user.id} ORDER BY created_at`;
  const asks = await sql`SELECT callback_when, status, message_enc, contact_phone_enc, created_at, handled_at
                           FROM app.call_requests WHERE user_id = ${user.id} ORDER BY created_at`;
  const body = {
    exported_at: qa(new Date()),
    account: {
      phone_e164: u.phone_e164_enc?.length ? decrypt(keys.dataKey, u.phone_e164_enc) : null,
      display_name: u.display_name, locale: u.locale, status: u.status, created_at: qa(u.created_at),
      registration_completed_at: qa(u.registration_completed_at), woman_confirmed_at: qa(u.woman_confirmed_at),
      age_eligibility_confirmed_at: qa(u.age_eligibility_confirmed_at), last_login_at: qa(u.last_login_at),
    },
    consents: consents.map((c) => ({ type: c.consent_type, document_version: c.document_version, granted: c.granted, recorded_at: qa(c.recorded_at), source: c.source })),
    questionnaire: resp ? { submitted_at: qa(resp.submitted_at), answers: byQuestion } : null,
    bookings: bookings.map((b) => ({ booking_ref: b.booking_ref, experience: b.experience, starts_at: qa(b.starts_at), status: b.status,
      fee: money(b.price_minor, locale), booked_at: qa(b.created_at), cancelled_at: qa(b.cancelled_at) })),
    payments: payments.map((p) => ({ booking_ref: refOf[p.booking_id] ?? null, amount: money(p.amount_minor, locale), status: p.status,
      card: p.method_brand ? `${p.method_brand} ${p.card_last4 ?? ""}`.trim() : null, paid_at: qa(p.succeeded_at), created_at: qa(p.created_at) })),
    refunds: refunds.map((r) => ({ booking_ref: refOf[r.booking_id] ?? null, amount: money(r.amount_minor, locale), reason: r.reason, status: r.status,
      completed_at: qa(r.completed_at), created_at: qa(r.created_at) })),
    ratings: feedback.map((f) => ({ booking_ref: refOf[f.booking_id] ?? null, overall: f.overall_rating, comfort: f.comfort_rating, venue: f.venue_rating,
      would_book_again: f.would_book_again, private_comment: f.comment_private, low_rating_reasons: f.low_rating_reasons, submitted_at: qa(f.submitted_at) })),
    session_alerts: alerts.map((a) => ({ requested_at: qa(a.created_at), notified_at: qa(a.notified_at) })),
    discount_codes: codes.map((c) => ({ code: c.code, percent_off: c.percent_off, usable: c.is_active && (c.max_uses === null || c.uses < c.max_uses), issued_at: qa(c.created_at) })),
    reports_made: reports.map((r) => ({ case_ref: r.case_ref, booking_ref: refOf[r.booking_id] ?? null, category: r.category, timing: r.timing,
      immediate_danger: r.immediate_danger, description: r.description_enc ? decrypt(keys.dataKey, r.description_enc) : null, status: r.status, created_at: qa(r.created_at) })),
    contact_requests: asks.map((r) => ({ requested_at: qa(r.created_at), callback_when: r.callback_when, status: r.status,
      message: r.message_enc ? decrypt(keys.dataKey, r.message_enc) : null, contact_phone: r.contact_phone_enc ? decrypt(keys.dataKey, r.contact_phone_enc) : null,
      handled_at: qa(r.handled_at) })),
  };
  const day = qa(new Date()).slice(0, 10);
  return json(200, body, { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="herzone-my-data-${day}.json"` });
}

// Accepting an updated document after registration, and the women-only confirmation of accounts registered before it
// was asked at sign-up. Required consents are withdrawn by deleting the account, not here.
async function updateConsents(ctx) {
  const { sql, body, user } = ctx;
  const consents = Array.isArray(body.consents) ? body.consents : [];
  if (body.woman_confirmed !== undefined && body.woman_confirmed !== true) fail(422, "WOMEN_ONLY", [{ field: "woman_confirmed", code: "REQUIRED" }]);
  if (!consents.length && body.woman_confirmed !== true) fail(422, "VALIDATION_FAILED", [{ field: "consents", code: "REQUIRED" }]);
  const current = await checkConsentVersions(sql, consents);
  const refused = consents.filter((c) => REQUIRED_CONSENTS.includes(c.type) && !c.granted);
  if (refused.length) fail(422, "CONSENT_REQUIRED", refused.map((c) => ({ field: `consents.${c.type}`, code: "REQUIRED" })));
  await sql.begin(async (tx) => {
    for (const c of consents) {
      await tx`INSERT INTO app.user_consents (user_id, consent_type, document_version, granted, source, ip_trunc)
               VALUES (${user.id}, ${c.type}, ${c.document_version}, ${c.granted}, 'app_web', ${ctx.ipTrunc}::inet)`;
    }
    if (body.woman_confirmed === true) await tx`UPDATE app.users SET woman_confirmed_at = COALESCE(woman_confirmed_at, now()) WHERE id = ${user.id}`;
  });
  return json(200, { outdated_consents: await outdatedConsents(sql, user, current), woman_confirmed: Boolean(user.woman_confirmed_at) || body.woman_confirmed === true });
}

async function deleteMe(ctx) {
  await ctx.sql`UPDATE app.users SET status = 'deletion_requested' WHERE id = ${ctx.user.id} AND status = 'active'`;
  await ctx.sql`UPDATE app.refresh_tokens SET revoked_at = now() WHERE subject_id = ${ctx.user.id} AND revoked_at IS NULL`;
  await ctx.sql`DELETE FROM app.push_subscriptions WHERE user_id = ${ctx.user.id}`;
  return json(202, { status: "deletion_requested" });
}

// ------------------------------------------------------------------ questionnaire
const pickLocale = (row, field, locale) => (locale === "en" ? row[`${field}_en`] : row[`${field}_ar`]) ?? null;

function questionView(q, opts, locale) {
  return {
    id: q.id, key: q.key, scope: q.scope, answer_type: q.answer_type, is_required: q.is_required, max_selections: q.max_selections,
    layout: q.layout || "list", section: pickLocale(q, "section", locale), scale_low: pickLocale(q, "scale_low", locale), scale_high: pickLocale(q, "scale_high", locale),
    text: pickLocale(q, "text", locale), purpose: pickLocale(q, "purpose", locale),
    options: opts.filter((o) => o.question_id === q.id)
      .map((o) => ({ id: o.id, key: o.key, label: pickLocale(o, "label", locale), emoji: o.emoji ?? null, is_exclusive: o.is_exclusive })),
  };
}

async function publishedQuestionnaire(sql) {
  const [v] = await sql`SELECT * FROM app.questionnaire_versions WHERE status = 'published'`;
  if (!v) fail(404, "QUESTIONNAIRE_VERSION_NOT_FOUND");
  const qs = await sql`SELECT * FROM app.questions WHERE questionnaire_version_id = ${v.id} ORDER BY sort_order`;
  const opts = await sql`SELECT o.* FROM app.question_options o JOIN app.questions q ON q.id = o.question_id
                          WHERE q.questionnaire_version_id = ${v.id} ORDER BY o.sort_order`;
  return { v, qs, opts };
}

// The quiz runs before sign-up (spec 2026-10-28 §3): questions only, never user data.
async function questionnairePreview(ctx) {
  const { v, qs, opts } = await publishedQuestionnaire(ctx.sql);
  return json(200, { questionnaire_version_id: v.id, code: v.code, questions: qs.map((q) => questionView(q, opts, ctx.locale)) });
}

async function questionnaireCurrent(ctx) {
  const { sql, locale, user } = ctx;
  const { v, qs, opts } = await publishedQuestionnaire(sql);
  const answersOf = async (status) => {
    const [r] = await sql`SELECT id FROM app.questionnaire_responses WHERE user_id = ${user.id} AND questionnaire_version_id = ${v.id} AND status = ${status}`;
    if (!r) return null;
    const rows = await sql`SELECT question_id, array_agg(option_id ORDER BY option_id) AS option_ids FROM app.answers WHERE response_id = ${r.id} GROUP BY question_id`;
    return { response_id: r.id, answers: rows.map((x) => ({ question_id: x.question_id, option_ids: x.option_ids })) };
  };
  const submitted = await answersOf("submitted");
  const anySubmitted = submitted ? null : await submittedResponse(sql, user.id);
  // Answers of an older version are offered again by (question key, option key); options that no longer exist are dropped.
  let carried = null;
  if (anySubmitted) {
    const rows = await sql`SELECT q.key AS qkey, o.key AS okey FROM app.answers a JOIN app.questions q ON q.id = a.question_id
                             JOIN app.question_options o ON o.id = a.option_id WHERE a.response_id = ${anySubmitted.id}`;
    const answers = [];
    for (const q of qs) {
      const keys = new Set(rows.filter((r) => r.qkey === q.key).map((r) => r.okey));
      const ids = opts.filter((o) => o.question_id === q.id && keys.has(o.key)).map((o) => o.id);
      if (ids.length) answers.push({ question_id: q.id, option_ids: ids });
    }
    carried = { from_version_id: anySubmitted.questionnaire_version_id, answers };
  }
  return json(200, {
    questionnaire_version_id: v.id, code: v.code,
    questions: qs.map((q) => questionView(q, opts, locale)),
    draft: await answersOf("draft"),
    submitted,
    has_submitted_any: Boolean(submitted || anySubmitted),
    carried,
  });
}

async function submitQuestionnaire(ctx) {
  const { sql, body, user } = ctx;
  requireUuid(body.questionnaire_version_id, "questionnaire_version_id");
  if (!["draft", "submitted"].includes(body.status)) fail(400, "MALFORMED_REQUEST", [{ field: "status" }]);
  if (!Array.isArray(body.answers)) fail(400, "MALFORMED_REQUEST", [{ field: "answers" }]);
  const [v] = await sql`SELECT * FROM app.questionnaire_versions WHERE id = ${body.questionnaire_version_id}`;
  if (!v) fail(404, "QUESTIONNAIRE_VERSION_NOT_FOUND");
  if (v.status !== "published") {
    const [cur] = await sql`SELECT id FROM app.questionnaire_versions WHERE status = 'published'`;
    fail(409, "QUESTIONNAIRE_VERSION_RETIRED", null, { current_version_id: cur ? cur.id : null });
  }
  const qs = await sql`SELECT * FROM app.questions WHERE questionnaire_version_id = ${v.id}`;
  const opts = await sql`SELECT o.* FROM app.question_options o JOIN app.questions q ON q.id = o.question_id WHERE q.questionnaire_version_id = ${v.id}`;
  const qById = Object.fromEntries(qs.map((q) => [q.id, q]));
  const details = [];
  const seen = new Set();
  const answers = [];
  for (const a of body.answers) {
    const q = qById[a && a.question_id];
    if (!q) { details.push({ question_id: a && a.question_id, code: "QUESTION_NOT_IN_VERSION" }); continue; }
    if (seen.has(q.id) || !Array.isArray(a.option_ids)) fail(400, "MALFORMED_REQUEST", [{ question_key: q.key }]);
    seen.add(q.id);
    const chosen = [...new Set(a.option_ids)];
    const own = chosen.map((id) => opts.find((o) => o.id === id && o.question_id === q.id));
    if (own.some((o) => !o)) { details.push({ question_key: q.key, code: "OPTION_NOT_IN_QUESTION" }); continue; }
    if (SINGLE_TYPES.includes(q.answer_type) && chosen.length > 1) details.push({ question_key: q.key, code: "SINGLE_CHOICE_EXPECTED" });
    if (q.max_selections && chosen.length > q.max_selections) details.push({ question_key: q.key, code: "TOO_MANY_SELECTIONS", max: q.max_selections });
    const excl = own.find((o) => o.is_exclusive);
    if (excl && chosen.length > 1) details.push({ question_key: q.key, code: "EXCLUSIVE_OPTION_CONFLICT", option_key: excl.key });
    answers.push({ q, options: own });
  }
  const answeredIds = new Set(answers.filter((a) => a.options.length > 0).map((a) => a.q.id));
  if (body.status === "submitted") {
    for (const q of qs) if (q.is_required && !answeredIds.has(q.id)) details.push({ question_key: q.key, code: "REQUIRED_MISSING" });
  }
  if (details.length) fail(422, "VALIDATION_FAILED", details);
  const reqTotal = qs.filter((q) => q.is_required).length;
  const optTotal = qs.length - reqTotal;
  const reqAnswered = qs.filter((q) => q.is_required && answeredIds.has(q.id)).length;
  const optAnswered = qs.filter((q) => !q.is_required && answeredIds.has(q.id)).length;
  const idemKey = ctx.req.headers.get("idempotency-key");

  const result = await sql.begin(async (tx) => {
    const [draft] = await tx`SELECT * FROM app.questionnaire_responses WHERE user_id = ${user.id} AND questionnaire_version_id = ${v.id} AND status = 'draft' FOR UPDATE`;
    let response;
    let created = false;
    if (body.status === "draft") {
      if (draft) [response] = await tx`UPDATE app.questionnaire_responses SET completeness_required = ${reqAnswered}, completeness_optional = ${optAnswered} WHERE id = ${draft.id} RETURNING *`;
      else { [response] = await tx`INSERT INTO app.questionnaire_responses (user_id, questionnaire_version_id, status, completeness_required, completeness_optional)
                                   VALUES (${user.id}, ${v.id}, 'draft', ${reqAnswered}, ${optAnswered}) RETURNING *`; created = true; }
    } else {
      await tx`UPDATE app.questionnaire_responses SET status = 'superseded' WHERE user_id = ${user.id} AND status = 'submitted'`;
      if (draft) [response] = await tx`UPDATE app.questionnaire_responses SET status = 'submitted', submitted_at = now(), completeness_required = ${reqAnswered},
                                         completeness_optional = ${optAnswered}, idempotency_key = ${idemKey} WHERE id = ${draft.id} RETURNING *`;
      else [response] = await tx`INSERT INTO app.questionnaire_responses (user_id, questionnaire_version_id, status, submitted_at, completeness_required, completeness_optional, idempotency_key)
                                 VALUES (${user.id}, ${v.id}, 'submitted', now(), ${reqAnswered}, ${optAnswered}, ${idemKey}) RETURNING *`;
      created = true;
    }
    await tx`DELETE FROM app.answers WHERE response_id = ${response.id}`;
    for (const a of answers) for (const o of a.options) {
      await tx`INSERT INTO app.answers (response_id, question_id, option_id) VALUES (${response.id}, ${a.q.id}, ${o.id})`;
    }
    let caseId = null;
    if (body.status === "submitted" && answers.some((a) => a.q.key === "Q07" && a.options.some((o) => o.key === "private_contact"))) {
      const [open] = await tx`SELECT id FROM app.support_cases WHERE user_id = ${user.id} AND type = 'practical_arrangement_Q07' AND status IN ('new','in_progress','waiting_user')`;
      if (open) caseId = open.id;
      else { const [c] = await tx`INSERT INTO app.support_cases (user_id, type) VALUES (${user.id}, 'practical_arrangement_Q07') RETURNING id`; caseId = c.id; }
    }
    return { response, created, caseId };
  });
  const out = { response_id: result.response.id, status: result.response.status, submitted_at: qa(result.response.submitted_at),
    completeness: { required_answered: reqAnswered, required_total: reqTotal, optional_answered: optAnswered, optional_total: optTotal } };
  if (body.status === "submitted") {
    const p = await profileOf(sql, result.response.id);
    out.derived = { conversation_languages: p.languages,
      budget_tier: p.tier ? { id: p.tier.id, label: ctx.locale === "en" ? p.tier.label_en : p.tier.label_ar } : null,
      supported_languages_note: p.onlyOther ? "only_ar_en_available" : null, private_contact_case_id: result.caseId };
    out.next = "choose_session";
  }
  return json(result.created ? 201 : 200, out);
}

// ------------------------------------------------------------------ sessions
async function listSessions(ctx) {
  const { sql, user, locale, url, cfg } = ctx;
  await sql`SELECT app.release_expired_holds()`;
  const resp = await submittedResponse(sql, user.id);
  const prof = resp ? await profileOf(sql, resp.id) : null;
  const exp = url.searchParams.get("experience");
  const rows = await sql`
    SELECT s.*, pp.service_fee_minor, cp.full_refund_until_hours,
           (SELECT b.id FROM app.bookings b WHERE b.session_id = s.id AND b.user_id = ${user.id}
              AND b.status IN ('payment_pending','paid_awaiting_group','group_locked','revealed','checked_in') LIMIT 1) AS my_booking_id
      FROM app.event_sessions s JOIN app.price_plans pp ON pp.id = s.price_plan_id JOIN app.cancellation_policies cp ON cp.id = s.cancellation_policy_id
     WHERE s.status IN ('on_sale','sold_out') AND s.booking_closes_at > now() AND s.booking_opens_at <= now()
       AND (${exp}::text IS NULL OR s.experience::text = ${exp})
     ORDER BY s.starts_at`;
  const waits = await myWaitlist(sql, user.id);
  const [alert] = await sql`SELECT 1 FROM app.session_alerts WHERE user_id = ${user.id} AND notified_at IS NULL`;
  return json(200, {
    profile_languages: prof ? prof.languages : [],
    notify_me_active: Boolean(alert),
    sessions: rows.map((s) => {
      const w = waits.get(s.id) || null;
      const offered = Boolean(w && w.status === "offered");
      return {
        id: s.id, experience: s.experience, conversation_language: s.conversation_language.trim(),
        language_match: prof ? prof.languages.includes(s.conversation_language.trim()) : null,
        starts_at: qa(s.starts_at), ends_at: qa(s.ends_at), district: district(s, locale),
        // a seat kept for her from the waitlist (021) is hers to book: the session is not full for her
        seats_left: offered ? Math.max(1, s.max_seats - s.seats_sold) : s.max_seats - s.seats_sold,
        is_full: !offered && (s.status === "sold_out" || s.seats_sold >= s.max_seats),
        price: money(s.service_fee_minor, locale), group_size: "4–6",
        full_refund_until: qa(hoursBefore(s.starts_at, s.full_refund_until_hours)), full_refund_until_hours: s.full_refund_until_hours, booking_closes_at: qa(s.booking_closes_at),
        my_booking_id: s.my_booking_id,
        // item 32: the occasion question is offered only when the session is far enough away
        occasion_allowed: occasionAllowed(s.starts_at, cfg), occasion_notice_hours: cfg.celebrationNoticeHours,
        // item 41: during the launch period the fee is announced as free for a limited time, and said only at the last step
        launch_free: cfg.launchFree,
        waitlist: w && {
          status: w.status, position: offered ? null : w.place,
          offer_expires_at: offered ? qa(w.offer_expires_at) : null,
          window_text: offered ? durationText(Math.ceil((new Date(w.offer_expires_at) - Date.now()) / 60000), locale) : null,
        },
      };
    }),
  });
}

// Her open waitlist entries (021) by session: waiting (with her place among those still waiting) or offered.
async function myWaitlist(sql, userId) {
  const rows = await sql`
    SELECT e.session_id, e.status, e.offer_expires_at,
           1 + (SELECT count(*)::int FROM app.waitlist_entries o
                 WHERE o.session_id = e.session_id AND o.status = 'waiting' AND o.position < e.position) AS place
      FROM app.waitlist_entries e
     WHERE e.user_id = ${userId} AND (e.status = 'waiting' OR (e.status = 'offered' AND e.offer_expires_at > now()))`;
  return new Map(rows.map((r) => [r.session_id, r]));
}

async function joinWaitlist(ctx) {
  const { sql, user, params } = ctx;
  requireUuid(params.id, "session_id");
  const [s] = await sql`SELECT * FROM app.event_sessions WHERE id = ${params.id}`;
  if (!s) fail(404, "SESSION_NOT_FOUND");
  if (s.seats_sold < s.max_seats) fail(409, "CONFLICT", [{ reason: "session has seats; book instead" }]);
  const [row] = await sql`
    INSERT INTO app.waitlist_entries (user_id, session_id, position)
    SELECT ${user.id}, ${s.id}, COALESCE(max(position), 0) + 1 FROM app.waitlist_entries WHERE session_id = ${s.id}
    ON CONFLICT DO NOTHING RETURNING position`;
  if (!row) fail(409, "CONFLICT", [{ reason: "already on the waitlist" }]);
  return json(201, { session_id: s.id, position: row.position, status: "waiting" });
}

// "Notify me when a session is available" (v0.3 E-LANG-1, migration 023, provisional): one open alert per member, whatever
// her marketing consent. It is answered once, when a session in one of her Q01 languages goes on sale
// (notifySessionAlerts in services/notifications.js, called from the admin's open-sale), and then it ends.
async function requestSessionAlert(ctx) {
  const { sql, user } = ctx;
  const resp = await submittedResponse(sql, user.id);
  if (!resp) fail(422, "QUESTIONNAIRE_INCOMPLETE");
  const [created] = await sql`INSERT INTO app.session_alerts (user_id) VALUES (${user.id})
                              ON CONFLICT (user_id) WHERE notified_at IS NULL DO NOTHING RETURNING created_at`;
  const [row] = created ? [created] : await sql`SELECT created_at FROM app.session_alerts WHERE user_id = ${user.id} AND notified_at IS NULL`;
  const prof = await profileOf(sql, resp.id);
  return json(created ? 201 : 200, { active: true, created_at: qa(row.created_at), languages: prof.languages });
}

// ------------------------------------------------------------------ bookings
async function createPayment(tx, ctx, booking, attempt = 0) {
  const intent = newPaymentIntentId();
  const [p] = await tx`
    INSERT INTO app.payments (booking_id, user_id, psp, psp_payment_intent_id, amount_minor, idempotency_key)
    VALUES (${booking.id}, ${booking.user_id}, 'test_psp', ${intent}, ${booking.price_minor}, ${`pay-${booking.id}${attempt ? "-" + attempt : ""}`})
    RETURNING *`;
  return p;
}

const OCCASIONS = ["birthday", "other"];
// Item 32 (provisional): an occasion needs cfg.celebrationNoticeHours of notice (CELEBRATION_NOTICE_HOURS, default 72).
const occasionAllowed = (startsAt, cfg) => new Date(startsAt).getTime() - Date.now() >= cfg.celebrationNoticeHours * 3600 * 1000;

async function createBooking(ctx) {
  const { sql, body, user, cfg, locale } = ctx;
  requireUuid(body.session_id, "session_id");
  const alternates = Array.isArray(body.alternate_session_ids) ? [...new Set(body.alternate_session_ids)] : [];
  alternates.forEach((a) => requireUuid(a, "alternate_session_ids"));
  if (alternates.length > 3 || alternates.includes(body.session_id)) fail(422, "VALIDATION_FAILED", [{ field: "alternate_session_ids", code: "INVALID" }]);
  if (!user.woman_confirmed_at) fail(422, "WOMEN_ONLY", [{ field: "woman_confirmed", code: "REQUIRED" }]);
  // Celebration meetups (migration 018): she can say the date is for an occasion; the coordinator gets a case.
  const occasion = body.occasion ?? null;
  if (occasion !== null && !OCCASIONS.includes(occasion)) fail(422, "VALIDATION_FAILED", [{ field: "occasion", code: "INVALID" }]);
  const resp = await submittedResponse(sql, user.id);
  if (!resp) fail(422, "QUESTIONNAIRE_INCOMPLETE");
  const prof = await profileOf(sql, resp.id);
  if (!prof.tier) fail(422, "QUESTIONNAIRE_INCOMPLETE", [{ question_key: "Q04", code: "REQUIRED_MISSING" }]);
  const [s] = await sql`SELECT * FROM app.event_sessions WHERE id = ${body.session_id}`;
  if (!s) fail(404, "SESSION_NOT_FOUND");
  if (occasion && !occasionAllowed(s.starts_at, cfg))
    fail(422, "VALIDATION_FAILED", [{ field: "occasion", code: "NOTICE_TOO_SHORT", min_notice_hours: cfg.celebrationNoticeHours }]);
  const lang = s.conversation_language.trim();
  if (!prof.languages.includes(lang)) fail(422, "LANGUAGE_CONFLICT", [{ field: "session_id", session_language: lang }]);
  const [venueOk] = await sql`
    SELECT 1 FROM app.venues v JOIN app.budget_tiers bt ON bt.id = v.budget_tier_id
     WHERE v.city_id = ${s.city_id} AND v.is_active AND ${s.experience} = ANY (v.supported_experiences) AND bt.rank <= ${prof.tier.rank} LIMIT 1`;
  if (!venueOk) fail(422, "BUDGET_CONFLICT");
  if (alternates.length) {
    const alts = await sql`SELECT id, conversation_language, status FROM app.event_sessions WHERE id IN ${sql(alternates)}`;
    if (alts.length !== alternates.length || alts.some((a) => a.conversation_language.trim() !== lang || !["on_sale", "sold_out"].includes(a.status)))
      fail(422, "VALIDATION_FAILED", [{ field: "alternate_session_ids", code: "NOT_ELIGIBLE" }]);
  }
  await sql`SELECT app.release_expired_holds()`;
  const [fresh] = await sql`SELECT status, seats_sold, max_seats FROM app.event_sessions WHERE id = ${s.id}`;
  // a live waitlist offer (021): the seat kept for her is in seats_sold, so the session looks full; hold_seat gives it to her
  const [offer] = await sql`SELECT 1 FROM app.waitlist_entries WHERE user_id = ${user.id} AND session_id = ${s.id}
                              AND status = 'offered' AND offer_expires_at > now()`;
  if (!offer && (fresh.status === "sold_out" || fresh.seats_sold >= fresh.max_seats))
    fail(409, "SESSION_FULL", [{ field: "session_id", code: "SESSION_FULL" }], { waitlist_href: `/api/v1/sessions/${s.id}/waitlist` });
  const idemKey = ctx.req.headers.get("idempotency-key");
  let result;
  try {
    result = await sql.begin(async (tx) => {
      const [b] = await tx`
        SELECT (h).* FROM (SELECT app.hold_seat(${user.id}, ${s.id}, ${prof.tier.id}, ${resp.id}, ${alternates}::uuid[], ${idemKey}, ${cfg.seatHoldMinutes}) AS h) x`;
      await tx`UPDATE app.bookings SET occasion = ${occasion} WHERE id = ${b.id}`;
      if (occasion) {
        const [open] = await tx`SELECT id FROM app.support_cases WHERE booking_id = ${b.id} AND type = 'occasion_celebration'`;
        if (!open) await tx`INSERT INTO app.support_cases (user_id, booking_id, type) VALUES (${user.id}, ${b.id}, 'occasion_celebration')`;
      }
      const [existing] = await tx`SELECT * FROM app.payments WHERE booking_id = ${b.id} ORDER BY created_at DESC LIMIT 1`;
      const p = existing || await createPayment(tx, ctx, b);
      return { b, p };
    });
  } catch (e) {
    if (e && e.code === "P0010") fail(409, "SESSION_FULL", [{ field: "session_id", code: "SESSION_FULL" }], { waitlist_href: `/api/v1/sessions/${s.id}/waitlist` });
    throw e;
  }
  const { b, p } = result;
  const terms = await refundTerms(sql, b, s);
  return json(201, { booking_id: b.id, ref: b.booking_ref, status: b.status, hold_expires_at: qa(b.hold_expires_at),
    checkout_url: terms.ackRequired ? null : ctx.psp.checkoutUrl(b.id, p.psp_payment_intent_id), amount: money(b.price_minor, locale),
    launch_free: cfg.launchFree, cancellation: termsView(terms) });
}

async function listBookings(ctx) {
  const { sql, user, locale } = ctx;
  const rows = await sql`
    SELECT b.*, s.experience, s.starts_at, s.ends_at, s.reveal_at, s.check_in_opens_at, s.lock_at, s.district_hint_ar, s.district_hint_en,
           t.status AS table_status, t.confirmed_count
      FROM app.bookings b JOIN app.event_sessions s ON s.id = b.session_id
      LEFT JOIN app.table_assignments a ON a.booking_id = b.id AND a.is_current
      LEFT JOIN app.event_tables t ON t.id = a.table_id
     WHERE b.user_id = ${user.id} ORDER BY s.starts_at DESC`;
  return json(200, { bookings: rows.map((r) => ({
    id: r.id, ref: r.booking_ref, status: r.status,
    phase: computePhase(r, r, r.table_status ? { status: r.table_status } : null),
    experience: r.experience, starts_at: qa(r.starts_at), ends_at: qa(r.ends_at), lock_at: qa(r.lock_at), reveal_at: qa(r.reveal_at),
    district: locale === "en" ? r.district_hint_en : r.district_hint_ar,
    confirmed_count: r.table_status === "locked" ? r.confirmed_count : null,
    hold_expires_at: qa(r.hold_expires_at),
  })) });
}

async function getBooking(ctx) {
  const { sql, locale, cfg } = ctx;
  const b = await ownedBooking(sql, ctx, ctx.params.id);
  const [p] = await sql`SELECT * FROM app.payments WHERE booking_id = ${b.id} ORDER BY created_at DESC LIMIT 1`;
  const holdValid = b.status === "payment_pending" && b.hold_expires_at && new Date(b.hold_expires_at) > new Date();
  const terms = await refundTerms(sql, b);
  return json(200, { id: b.id, ref: b.booking_ref, status: b.status, hold_expires_at: qa(b.hold_expires_at),
    amount: money(b.price_minor, locale),
    payment: p ? { status: p.status, failure_code: p.failure_code } : null,
    checkout_url: holdValid && !terms.ackRequired && p && p.status === "created" ? ctx.psp.checkoutUrl(b.id, p.psp_payment_intent_id) : null,
    launch_free: cfg.launchFree, cancellation: termsView(terms) });
}

async function newCheckout(ctx) {
  const { sql } = ctx;
  const out = await sql.begin(async (tx) => {
    const b = await ownedBooking(tx, ctx, ctx.params.id, true);
    if (b.status !== "payment_pending") fail(409, "PAYMENT_NOT_PENDING");
    if (!b.hold_expires_at || new Date(b.hold_expires_at) <= new Date()) fail(409, "HOLD_EXPIRED");
    const terms = await refundTerms(tx, b);
    if (terms.ackRequired) {
      if (ctx.body.acknowledge_late_no_refund !== true) fail(422, "LATE_ACK_REQUIRED", [{ field: "acknowledge_late_no_refund", code: "REQUIRED" }]);
      await tx`UPDATE app.bookings SET late_no_refund_ack_at = now() WHERE id = ${b.id}`;
      await audit(tx, null, "late_no_refund_ack", "bookings", b.id, terms.afterPayment);
    }
    const pays = await tx`SELECT * FROM app.payments WHERE booking_id = ${b.id} ORDER BY created_at DESC`;
    if (pays[0] && pays[0].status === "created") return { b, p: pays[0] };
    return { b, p: await createPayment(tx, ctx, b, pays.length) };
  });
  return json(200, { checkout_url: ctx.psp.checkoutUrl(out.b.id, out.p.psp_payment_intent_id), hold_expires_at: qa(out.b.hold_expires_at) });
}

async function resolutionOptions(sql, b, locale, cfg) {
  const deadline = new Date(new Date(b.cancelled_at).getTime() + cfg.rebookChoiceHours * 3600 * 1000);
  const sessions = await sql`
    SELECT s.id, s.starts_at, s.district_hint_ar, s.district_hint_en, s.max_seats - s.seats_sold AS seats_left,
           (s.id = ANY (${b.alternate_session_ids}::uuid[])) AS is_alternate
      FROM app.event_sessions s
     WHERE s.status = 'on_sale' AND s.conversation_language = ${b.conversation_language} AND s.booking_closes_at > now()
       AND s.id <> ${b.session_id} AND s.seats_sold < s.max_seats
     ORDER BY (s.id = ANY (${b.alternate_session_ids}::uuid[])) DESC, s.starts_at LIMIT 5`;
  return {
    choice_deadline: qa(deadline), default_if_no_choice: "refund", open: deadline > new Date(),
    options: [
      { type: "rebook", sessions: sessions.map((s) => ({ session_id: s.id, starts_at: qa(s.starts_at), district: locale === "en" ? s.district_hint_en : s.district_hint_ar, seats_left: s.seats_left, is_alternate: s.is_alternate })) },
      { type: "refund", amount: money(b.price_minor, locale) },
    ],
  };
}

async function resolutionState(sql, bookingId) {
  const [child] = await sql`SELECT id, booking_ref, status FROM app.bookings WHERE rebooked_from_booking_id = ${bookingId}`;
  const [refund] = await sql`SELECT status, amount_minor FROM app.refunds WHERE booking_id = ${bookingId} AND status <> 'failed' ORDER BY created_at DESC LIMIT 1`;
  return { child: child || null, refund: refund || null };
}

async function eventDetails(ctx) {
  const { sql, locale, cfg, keys } = ctx;
  const b = await ownedBooking(sql, ctx, ctx.params.id);
  const [s] = await sql`SELECT * FROM app.event_sessions WHERE id = ${b.session_id}`;
  const [cp] = await sql`SELECT * FROM app.cancellation_policies WHERE version = ${b.cancellation_policy_version}`;
  const [tier] = await sql`SELECT * FROM app.budget_tiers WHERE id = ${b.budget_tier_id}`;
  const t = await currentTable(sql, b.id);
  const [v] = t && t.venue_id ? await sql`SELECT * FROM app.venues WHERE id = ${t.venue_id}` : [null];
  const phase = computePhase(b, s, t);
  const now = new Date();
  const fullUntil = hoursBefore(s.starts_at, cp.full_refund_until_hours);
  const cancellable = ["payment_pending", "paid_awaiting_group", "group_locked", "revealed"].includes(b.status) && now < new Date(s.starts_at);
  const terms = await refundTerms(sql, b, s);
  const [p] = await sql`SELECT * FROM app.payments WHERE booking_id = ${b.id} ORDER BY (status IN ('succeeded','refunded','partially_refunded')) DESC, created_at DESC LIMIT 1`;
  const out = {
    booking: { id: b.id, ref: b.booking_ref, status: b.status, ...(b.cancel_reason_code ? { cancel_reason: b.cancel_reason_code } : {}),
      cancellation: { policy_version: cp.version, full_refund_until: qa(fullUntil), can_cancel: cancellable,
        refund_if_cancelled_now: cancellable && b.status !== "payment_pending" ? (now <= fullUntil ? "full" : (cp.late_cancel_refund_pct > 0 ? "partial" : "none")) : null,
        full_refund_until_hours: terms.hours, full_refund_window_open: terms.windowOpen, refund_if_cancelled_after_payment: terms.afterPayment, late_cancel_refund_pct: terms.pct,
        acknowledgement_required: terms.ackRequired ? "late_no_refund" : null, late_no_refund_ack_at: qa(b.late_no_refund_ack_at) } },
    session: { experience: s.experience, conversation_language: s.conversation_language.trim(), starts_at: qa(s.starts_at), ends_at: qa(s.ends_at),
      timezone: "Asia/Qatar", district: district(s, locale),
      food_price_band: { max_minor: tier.max_spend_minor, display: locale === "en" ? tier.label_en : tier.label_ar },
      accessibility: v ? v.accessibility : null, group_size: "4–6" },
    reveal: { phase, lock_at: qa(s.lock_at), reveal_at: qa(s.reveal_at), check_in_opens_at: qa(s.check_in_opens_at) },
    table: null, venue: null,
    payment: p ? { amount: money(p.amount_minor, locale), status: p.status } : null,
    actions: [],
  };
  // NMX-63: a member whose account is not active (e.g. interim suspension after a danger report) sees no venue, table
  // code or tablemates' names while her case is reviewed, even for bookings made before
  // Identity review (015): while the name on her card is being checked, the same things stay hidden.
  const [review] = cfg.cardNameCheck ? await sql`SELECT status FROM app.identity_reviews WHERE booking_id = ${b.id}` : [];
  const underReview = Boolean(review && review.status === "pending");
  if (underReview) out.identity_check = "pending";
  const restricted = ctx.user.status !== "active" || underReview;
  if (["locked", "revealed", "day_of", "completed"].includes(phase)) {
    out.table = { confirmed_count: t.confirmed_count, capacity: t.capacity };
    if (phase !== "locked" && !restricted) {
      out.table.code = t.table_code;
      out.table.shared_themes = (t.match_themes || []).map((th) => (locale === "en" ? th.en : th.ar));
    }
    // Item 33 (provisional): once the venue is revealed, the other women at the table see that one guest celebrates,
    // never who; only the kind leaves the server (birthday first when there are both). Her own occasion is not shown.
    if (["revealed", "day_of"].includes(phase) && !restricted) {
      const kinds = (await tableMembers(sql, t.id)).filter((m) => m.booking_id !== b.id && m.occasion).map((m) => m.occasion);
      out.table.celebration = kinds.includes("birthday") ? "birthday" : kinds.length ? "other" : null;
    }
    if (["day_of", "completed"].includes(phase) && !restricted) {
      const members = (await tableMembers(sql, t.id)).filter((m) => m.booking_id !== b.id);
      out.table.members = members.map((m) => ({ seat: seatToken(keys, b.id, m.booking_id), display_name: m.display_name || null }));
    }
  }
  if (["revealed", "day_of", "completed"].includes(phase) && v && !restricted) {
    out.venue = { name: v.name, address: v.address_line, district: locale === "en" ? v.district_en : v.district_ar,
      location: { lat: Number(v.lat), lng: Number(v.lng) }, map_url: `https://maps.google.com/?q=${Number(v.lat)},${Number(v.lng)}`,
      arrival_instructions: (locale === "en" ? v.arrival_instructions_en : v.arrival_instructions_ar).replace("{code}", t.table_code),
      bill_policy: locale === "en" ? "Everyone pays the venue directly for their own food and drinks. No minimum order from us." : "تدفع طعامك وشرابك للمكان مباشرة. لا يوجد حد أدنى للطلب من جهتنا." };
  }
  if (cancellable) out.actions.push({ type: "cancel", method: "POST", href: `/api/v1/bookings/${b.id}/cancel` });
  if (phase === "pending_payment") out.actions.push({ type: "pay", method: "POST", href: `/api/v1/bookings/${b.id}/checkout` });
  if (phase === "day_of" && ["revealed", "group_locked"].includes(b.status) && now < new Date(s.ends_at))
    out.actions.push({ type: "check_in", method: "POST", href: `/api/v1/bookings/${b.id}/check-in` });
  if (["day_of", "completed"].includes(phase)) out.actions.push({ type: "report", method: "POST", href: "/api/v1/reports" });
  if (phase === "completed") {
    const [fb] = await sql`SELECT id FROM app.event_feedback WHERE booking_id = ${b.id}`;
    const open = now < new Date(new Date(s.ends_at).getTime() + cfg.feedbackWindowDays * 86400000);
    if (!fb && open) out.actions.push({ type: "feedback", method: "POST", href: `/api/v1/bookings/${b.id}/feedback` });
    out.feedback = { submitted: !!fb, open };
  }
  if (phase === "cancelled") {
    const st = await resolutionState(sql, b.id);
    out.refund = st.refund ? { status: st.refund.status, amount: money(st.refund.amount_minor, locale) } : { status: "none" };
    if (st.child) out.rebooked_into = { booking_id: st.child.id, ref: st.child.booking_ref, status: st.child.status };
    if (b.status === "cancelled_by_organizer" && b.cancel_reason_code !== "identity_rejected" && !st.child && !st.refund) {
      out.resolution = await resolutionOptions(sql, b, locale, cfg);
      if (out.resolution.open) out.actions.push({ type: "resolution", method: "POST", href: `/api/v1/bookings/${b.id}/resolution` });
    }
  }
  const etag = `"${sha256hex(JSON.stringify(out)).slice(0, 32)}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-store" };
  if (ctx.req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return json(200, out, headers);
}

async function cancelBooking(ctx) {
  const { sql, body, locale } = ctx;
  const reason = ["schedule_changed", "illness", "other"].includes(body.reason_code) ? body.reason_code : null;
  const out = await sql.begin(async (tx) => {
    const b = await ownedBooking(tx, ctx, ctx.params.id, true);
    const [s] = await tx`SELECT * FROM app.event_sessions WHERE id = ${b.session_id}`;
    if (!["payment_pending", "paid_awaiting_group", "group_locked", "revealed"].includes(b.status) || new Date() >= new Date(s.starts_at))
      fail(409, "CANCEL_NOT_ALLOWED");
    const [cp] = await tx`SELECT * FROM app.cancellation_policies WHERE version = ${b.cancellation_policy_version}`;
    await tx`UPDATE app.bookings SET status = 'cancelled_by_user', cancelled_at = now(), cancel_actor = 'user',
                    cancel_reason_code = ${reason}, hold_expires_at = NULL WHERE id = ${b.id}`;
    if (b.status === "payment_pending") {
      await tx`UPDATE app.payments SET status = 'cancelled' WHERE booking_id = ${b.id} AND status IN ('created','requires_action','failed')`;
      return { refund: { eligible: false, amount: money(0, locale), status: "none" }, refundId: null, b };
    }
    const inWindow = new Date() <= hoursBefore(s.starts_at, cp.full_refund_until_hours);
    const amount = inWindow ? b.price_minor : Math.floor(b.price_minor * cp.late_cancel_refund_pct / 100);
    const p = await capturedPayment(tx, b.id);
    let refundId = null;
    if (amount > 0 && p) {
      const [r] = await tx`INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
                           VALUES (${p.id}, ${b.id}, ${amount}, 'user_cancel_in_window', 'requested', ${"ucx-" + b.id}) RETURNING id`;
      refundId = r.id;
    }
    await notify(tx, b.user_id, "BOOKING_CANCELLED", { ref: b.booking_ref, booking_id: b.id });
    return { refund: { eligible: amount > 0, amount: money(amount, locale), status: refundId ? "requested" : "none" }, refundId, b };
  });
  if (out.refundId) {
    await dispatchRefund(sql, ctx.psp, out.refundId);
    const [r] = await sql`SELECT status FROM app.refunds WHERE id = ${out.refundId}`;
    out.refund.status = r.status;
  }
  return json(200, { status: "cancelled_by_user", refund: out.refund });
}

async function chooseResolution(ctx) {
  const { sql, body, locale, cfg, user } = ctx;
  const b = await ownedBooking(sql, ctx, ctx.params.id);
  if (b.status !== "cancelled_by_organizer" || b.cancel_reason_code === "identity_rejected") fail(409, "RESOLUTION_NOT_AVAILABLE");
  const st = await resolutionState(sql, b.id);
  if (st.child || st.refund) fail(409, "RESOLUTION_NOT_AVAILABLE", [{ reason: "already_resolved" }]);
  if (new Date() > new Date(new Date(b.cancelled_at).getTime() + cfg.rebookChoiceHours * 3600 * 1000)) fail(409, "RESOLUTION_NOT_AVAILABLE", [{ reason: "deadline_passed" }]);
  if (body.choice === "rebook") {
    requireUuid(body.session_id, "session_id");
    const [nb] = await sql`SELECT (r).* FROM (SELECT app.rebook_booking(${b.id}, ${user.id}, ${body.session_id}) AS r) x`;
    return json(200, { choice: "rebook", booking: { id: nb.id, ref: nb.booking_ref, status: nb.status } });
  }
  if (body.choice === "refund") {
    const out = await sql.begin(async (tx) => {
      // NMX-63: lock the booking as rebook_booking does, then re-check, so a rebook and a refund sent at the same time
      // cannot both succeed (one free meetup plus a full refund)
      await tx`SELECT id FROM app.bookings WHERE id = ${b.id} FOR UPDATE`;
      const [done] = await tx`SELECT 1 FROM app.bookings WHERE rebooked_from_booking_id = ${b.id}
                              UNION ALL SELECT 1 FROM app.refunds WHERE booking_id = ${b.id} AND status <> 'failed' LIMIT 1`;
      if (done) fail(409, "RESOLUTION_NOT_AVAILABLE", [{ reason: "already_resolved" }]);
      const p = await capturedPayment(tx, b.id);
      if (!p) fail(409, "RESOLUTION_NOT_AVAILABLE", [{ reason: "no_payment" }]);
      const [r] = await tx`INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
                           VALUES (${p.id}, ${b.id}, ${p.amount_minor}, 'organizer_cancel', 'requested', ${"choice-refund-" + b.id}) RETURNING *`;
      return r;
    });
    return json(200, { choice: "refund", refund: { status: out.status, amount: money(out.amount_minor, locale) } });
  }
  fail(422, "VALIDATION_FAILED", [{ field: "choice", code: "INVALID" }]);
}

async function checkIn(ctx) {
  const { sql } = ctx;
  const b = await ownedBooking(sql, ctx, ctx.params.id);
  const [s] = await sql`SELECT * FROM app.event_sessions WHERE id = ${b.session_id}`;
  const t = await currentTable(sql, b.id);
  if (computePhase(b, s, t) !== "day_of" || !["revealed", "group_locked"].includes(b.status) || new Date() >= new Date(s.ends_at))
    fail(409, "CHECK_IN_NOT_OPEN");
  const [u] = await sql`UPDATE app.bookings SET status = 'checked_in', checked_in_at = now() WHERE id = ${b.id} RETURNING checked_in_at`;
  return json(200, { status: "checked_in", checked_in_at: qa(u.checked_in_at) });
}

async function feedback(ctx) {
  const { sql, body, cfg } = ctx;
  const b = await ownedBooking(sql, ctx, ctx.params.id);
  const [s] = await sql`SELECT * FROM app.event_sessions WHERE id = ${b.session_id}`;
  const t = await currentTable(sql, b.id);
  if (computePhase(b, s, t) !== "completed" || new Date() > new Date(new Date(s.ends_at).getTime() + cfg.feedbackWindowDays * 86400000))
    fail(409, "FEEDBACK_NOT_OPEN");
  const r15 = (x) => Number.isInteger(x) && x >= 1 && x <= 5;
  const details = [];
  if (!r15(body.overall_rating)) details.push({ field: "overall_rating", code: "REQUIRED" });
  if (!r15(body.comfort_rating)) details.push({ field: "comfort_rating", code: "REQUIRED" });
  if (body.venue_rating != null && !r15(body.venue_rating)) details.push({ field: "venue_rating", code: "INVALID" });
  if (body.comment != null && String(body.comment).length > 500) details.push({ field: "comment", code: "TOO_LONG" });
  const reasons = body.low_rating_reasons ?? [];
  if (!Array.isArray(reasons) || reasons.some((x) => !LOW_RATING_REASONS.includes(x))) details.push({ field: "low_rating_reasons", code: "INVALID" });
  if (details.length) fail(422, "VALIDATION_FAILED", details);
  // reasons are kept only with a low overall rating (023): above it the screen does not offer them
  const kept = body.overall_rating <= cfg.lowRatingReasonsMax && reasons.length ? LOW_RATING_REASONS.filter((x) => reasons.includes(x)) : null;
  await sql.begin(async (tx) => {
    const [dup] = await tx`SELECT id FROM app.event_feedback WHERE booking_id = ${b.id}`;
    if (dup) fail(409, "ALREADY_SUBMITTED");
    await tx`INSERT INTO app.event_feedback (booking_id, user_id, table_id, venue_id, overall_rating, comfort_rating, venue_rating, would_book_again, comment_private, low_rating_reasons)
             VALUES (${b.id}, ${ctx.user.id}, ${t.id}, ${t.venue_id}, ${body.overall_rating}, ${body.comfort_rating}, ${body.venue_rating ?? null},
                     ${typeof body.would_book_again === "boolean" ? body.would_book_again : null}, ${body.comment ?? null}, ${kept})`;
  });
  return json(201, { saved: true });
}

// ------------------------------------------------------------------ contact requests (migration 010)
// From the meetup's end and for 7 days, a member asks a tablemate to stay in touch; on acceptance each gets a WhatsApp
// button to the other. A refusal, no answer, a block or a suspended account is never revealed to the sender.
const CONTACT_WINDOW_DAYS = 7;

async function finishedTable(sql, ctx, bookingId) {
  const b = await ownedBooking(sql, ctx, bookingId);
  const [s] = await sql`SELECT * FROM app.event_sessions WHERE id = ${b.session_id}`;
  const t = await currentTable(sql, b.id);
  const ended = computePhase(b, s, t) === "completed";
  const closesAt = new Date(new Date(s.ends_at).getTime() + CONTACT_WINDOW_DAYS * 86400000);
  return { b, t, ended, open: ended && new Date() < closesAt, closesAt };
}

async function isBlockedPair(sql, a, b) {
  const [row] = await sql`SELECT 1 FROM app.blocked_pairs WHERE user_a = LEAST(${a}::uuid, ${b}::uuid) AND user_b = GREATEST(${a}::uuid, ${b}::uuid)`;
  return Boolean(row);
}

async function whatsappOf(sql, keys, userId) {
  const [u] = await sql`SELECT phone_e164_enc FROM app.users WHERE id = ${userId} AND status = 'active'`;
  const phone = u ? decrypt(keys.dataKey, u.phone_e164_enc) : null;
  return phone ? `https://wa.me/${phone.slice(1)}` : null;
}

async function bookingContacts(ctx) {
  const { sql, keys, user } = ctx;
  const { b, t, ended, open, closesAt } = await finishedTable(sql, ctx, ctx.params.id);
  if (!ended) return json(200, { open: false, closes_at: null, members: [] });
  const reqs = await sql`SELECT * FROM app.contact_requests WHERE table_id = ${t.id} AND ${user.id} IN (from_user_id, to_user_id)`;
  const members = [];
  for (const m of (await tableMembers(sql, t.id)).filter((x) => x.booking_id !== b.id)) {
    const mine = reqs.find((r) => r.from_user_id === user.id && r.to_user_id === m.user_id);
    const theirs = reqs.find((r) => r.from_user_id === m.user_id && r.to_user_id === user.id && r.delivered);
    const blocked = await isBlockedPair(sql, user.id, m.user_id);
    let state = mine ? "sent" : "none", requestId = null, whatsapp = null;
    if (!blocked && [mine, theirs].some((r) => r && r.status === "accepted")) {
      whatsapp = await whatsappOf(sql, keys, m.user_id);
      if (whatsapp) state = "connected";
    } else if (!blocked && !mine && theirs && theirs.status === "pending" && open) {
      state = "incoming"; requestId = theirs.id;
    }
    members.push({ seat: seatToken(keys, b.id, m.booking_id), display_name: m.display_name || null, state, request_id: requestId,
      whatsapp_url: whatsapp, can_send: open && state === "none" });
  }
  return json(200, { open, closes_at: qa(closesAt), members });
}

async function sendContactRequest(ctx) {
  const { sql, keys, user, body } = ctx;
  const { b, t, open, closesAt } = await finishedTable(sql, ctx, body.booking_id);
  if (!open) fail(409, "CONTACT_WINDOW_CLOSED");
  const m = (await tableMembers(sql, t.id)).find((x) => x.booking_id !== b.id && seatToken(keys, b.id, x.booking_id) === body.seat);
  if (!m) fail(422, "VALIDATION_FAILED", [{ field: "seat", code: "NOT_FOUND" }]);
  const state = await sql.begin(async (tx) => {
    const [existing] = await tx`SELECT status FROM app.contact_requests WHERE table_id = ${t.id} AND from_user_id = ${user.id} AND to_user_id = ${m.user_id}`;
    if (existing) return existing.status === "accepted" ? "connected" : "sent";
    const [target] = await tx`SELECT status FROM app.users WHERE id = ${m.user_id}`;
    const deliverable = target.status === "active" && !(await isBlockedPair(tx, user.id, m.user_id));
    // she already asked me (even if I declined then): both want it, so connect now
    const [theirs] = deliverable ? await tx`SELECT id FROM app.contact_requests WHERE table_id = ${t.id} AND from_user_id = ${m.user_id}
                                             AND to_user_id = ${user.id} AND delivered FOR UPDATE` : [];
    if (theirs) {
      await tx`UPDATE app.contact_requests SET status = 'accepted', decided_at = now() WHERE id = ${theirs.id} AND status <> 'accepted'`;
      await tx`INSERT INTO app.contact_requests (table_id, from_user_id, to_user_id, status, expires_at, decided_at)
               VALUES (${t.id}, ${user.id}, ${m.user_id}, 'accepted', ${closesAt}, now())`;
      await notify(tx, m.user_id, "CONTACT_ACCEPTED", { name: user.display_name, booking_id: m.booking_id });
      return "connected";
    }
    await tx`INSERT INTO app.contact_requests (table_id, from_user_id, to_user_id, delivered, expires_at)
             VALUES (${t.id}, ${user.id}, ${m.user_id}, ${deliverable}, ${closesAt})`;
    if (deliverable) await notify(tx, m.user_id, "CONTACT_REQUEST", { name: user.display_name, booking_id: m.booking_id });
    return "sent";
  });
  return json(201, { state, whatsapp_url: state === "connected" ? await whatsappOf(sql, keys, m.user_id) : null });
}

async function decideContactRequest(ctx, accept) {
  const { sql, keys, user } = ctx;
  requireUuid(ctx.params.id, "request_id");
  const r = await sql.begin(async (tx) => {
    const [row] = await tx`SELECT * FROM app.contact_requests WHERE id = ${ctx.params.id} AND to_user_id = ${user.id} AND delivered FOR UPDATE`;
    if (!row || await isBlockedPair(tx, user.id, row.from_user_id)) fail(404, "NOT_FOUND");
    // the window follows the meetup's actual end (an admin may have moved the session since the request was sent)
    const [s] = await tx`SELECT s.ends_at FROM app.event_tables t JOIN app.event_sessions s ON s.id = t.session_id WHERE t.id = ${row.table_id}`;
    const closesAt = new Date(new Date(s.ends_at).getTime() + CONTACT_WINDOW_DAYS * 86400000);
    if (row.status !== "pending" || new Date() >= closesAt) fail(409, "CONTACT_REQUEST_CLOSED");
    await tx`UPDATE app.contact_requests SET status = ${accept ? "accepted" : "declined"}, decided_at = now() WHERE id = ${row.id}`;
    if (accept) {
      const [sender] = await tx`SELECT b.id FROM app.table_assignments a JOIN app.bookings b ON b.id = a.booking_id
                                 WHERE a.table_id = ${row.table_id} AND a.is_current AND b.user_id = ${row.from_user_id}`;
      await notify(tx, row.from_user_id, "CONTACT_ACCEPTED", { name: user.display_name, booking_id: sender ? sender.id : null });
    }
    return row;
  });
  return json(200, { status: accept ? "accepted" : "declined", whatsapp_url: accept ? await whatsappOf(sql, keys, r.from_user_id) : null });
}

// ------------------------------------------------------------------ safety
async function createReport(ctx) {
  const { sql, body, keys, user } = ctx;
  const b = await ownedBooking(sql, ctx, body.booking_id);
  if (!REPORT_CATEGORIES.includes(body.category)) fail(422, "VALIDATION_FAILED", [{ field: "category", code: "INVALID" }]);
  if (!["during", "after"].includes(body.timing)) fail(422, "VALIDATION_FAILED", [{ field: "timing", code: "INVALID" }]);
  if (body.description != null && String(body.description).length > 2000) fail(422, "VALIDATION_FAILED", [{ field: "description", code: "TOO_LONG" }]);
  const danger = body.immediate_danger === true;
  const t = await currentTable(sql, b.id);
  let reported = null;
  if (body.reported_seat) {
    if (!t) fail(422, "VALIDATION_FAILED", [{ field: "reported_seat", code: "NOT_FOUND" }]);
    const m = (await tableMembers(sql, t.id)).find((x) => x.booking_id !== b.id && seatToken(keys, b.id, x.booking_id) === body.reported_seat);
    if (!m) fail(422, "VALIDATION_FAILED", [{ field: "reported_seat", code: "NOT_FOUND" }]);
    reported = m.user_id;
  }
  const severity = danger ? 1 : SEVERITY_BY_CATEGORY[body.category];
  const kind = alertKind({ danger, severity, timing: body.timing });
  let alertId = null;
  const report = await sql.begin(async (tx) => {
    const [r] = await tx`
      INSERT INTO app.safety_reports (case_ref, reporter_user_id, reported_user_id, booking_id, table_id, category, timing,
                                      immediate_danger, description_enc, severity, status, sla_due_at)
      VALUES (app.next_case_ref(), ${user.id}, ${reported}, ${b.id}, ${t ? t.id : null}, ${body.category}, ${body.timing}, ${danger},
              ${body.description ? encrypt(keys.dataKey, String(body.description)) : null}, ${severity}, 'new',
              now() + make_interval(hours => ${SLA_HOURS[severity]}))
      RETURNING *`;
    await audit(tx, null, "report_intake", "safety_reports", r.id, `S${severity}${danger ? "_immediate_danger" : ""}`);
    if (reported && severity <= 3) {
      await tx`INSERT INTO app.user_blocks (blocker_user_id, blocked_user_id, source, report_id)
               VALUES (${user.id}, ${reported}, 'safety_case', ${r.id}) ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING`;
      await tx`INSERT INTO app.report_actions (report_id, action, actor_id) VALUES (${r.id}, 'interim_block', NULL)`;
      await tx`DELETE FROM app.connection_consents WHERE (from_user_id = ${user.id} AND to_user_id = ${reported}) OR (from_user_id = ${reported} AND to_user_id = ${user.id})`;
      await audit(tx, null, "user_block_auto", "user_blocks", r.id, "safety_case");
    }
    if (reported && severity === 1) {
      await tx`INSERT INTO app.report_actions (report_id, action, actor_id) VALUES (${r.id}, 'temporary_suspension', NULL)`;
      await tx`UPDATE app.users SET status = 'suspended' WHERE id = ${reported} AND status = 'active'`;
      await audit(tx, null, "user_suspend_interim", "users", reported, "S1_pending_review");
    }
    // T13: S1/S2 during the meetup, or "I am in danger now": an alert for the coordinators, sent once this is saved
    if (kind) alertId = await raiseAlert(tx, r, kind);
    await notify(tx, user.id, "REPORT_RECEIVED", { case: r.case_ref });
    return r;
  });
  // push to coordinators' devices and SMS to their numbers; the audit row "coordinator_paged" records what was sent.
  // Her saved report never waits on a slow push service or SMS provider for more than a few seconds.
  if (alertId) await pageWithin(sql, alertId, { getEnv: ctx.getEnv, cfg: ctx.cfg });
  return json(201, { case_ref: report.case_ref, severity: report.severity, status: report.status,
    emergency: { show: danger, number: "999" } });
}

async function myCases(ctx) {
  const rows = await ctx.sql`
    SELECT r.case_ref, r.category, r.status, s.starts_at,
           (SELECT ra.action FROM app.report_actions ra WHERE ra.report_id = r.id AND ra.action IN ('warning','suspension','ban','no_action')
             ORDER BY ra.created_at DESC LIMIT 1) AS decision,
           (SELECT ra.created_at FROM app.report_actions ra WHERE ra.report_id = r.id AND ra.action IN ('warning','suspension','ban','no_action')
             ORDER BY ra.created_at DESC LIMIT 1) AS decided_at
      FROM app.safety_reports r LEFT JOIN app.bookings b ON b.id = r.booking_id LEFT JOIN app.event_sessions s ON s.id = b.session_id
     WHERE r.reported_user_id = ${ctx.user.id}`;
  return json(200, { cases: rows.filter((r) => r.decision).map((r) => ({
    case_ref: r.case_ref, event_date: qa(r.starts_at), category: r.category, decision: r.decision, decision_label: decisionLabel(r.decision, ctx.locale), status: r.status,
    appeal_until: qa(new Date(new Date(r.decided_at).getTime() + 14 * 86400000)),
    can_appeal: r.status === "actioned" && r.decision !== "no_action" && Date.now() < new Date(r.decided_at).getTime() + 14 * 86400000,
  })) });
}

async function appeal(ctx) {
  const { sql, params, user } = ctx;
  const [r] = await sql`SELECT * FROM app.safety_reports WHERE case_ref = ${params.ref} AND reported_user_id = ${user.id}`;
  if (!r) fail(404, "CASE_NOT_FOUND");
  const [d] = await sql`SELECT * FROM app.report_actions WHERE report_id = ${r.id} AND action IN ('warning','suspension','ban') ORDER BY created_at DESC LIMIT 1`;
  if (r.status !== "actioned" || !d || Date.now() > new Date(d.created_at).getTime() + 14 * 86400000) fail(409, "APPEAL_NOT_ALLOWED");
  await sql.begin(async (tx) => {
    await tx`UPDATE app.safety_reports SET status = 'appealed' WHERE id = ${r.id}`;
    await audit(tx, null, "appeal_filed", "safety_reports", r.id, "user_appeal");
  });
  return json(202, { case_ref: r.case_ref, status: "appealed" });
}

// The text of one notification in a language: the inbox and the phone notification (routes/push.js) show the same words.
async function notifications(ctx) {
  const rows = await ctx.sql`SELECT * FROM app.notifications_outbox WHERE user_id = ${ctx.user.id} ORDER BY created_at DESC LIMIT 50`;
  return json(200, { notifications: rows.map((n) => ({ id: n.id, template_key: n.template_key, created_at: qa(n.created_at),
    booking_id: (n.payload || {}).booking_id || null, session_id: (n.payload || {}).session_id || null, text: notificationText(n, ctx.locale) })) });
}

// Health probe: confirms the API, database and server keys load; reports where the keys come from (audit F6).
// test_paths_open (Notion fix 4) names the staging-only test paths that are switched on: "otp_dev_mode" (sign-in code in
// the answer) and "mock_payments" (mock checkout). Production must answer []: ops/smoke.mjs checks it before and after
// every production release and every 30 minutes (.github/workflows/uptime.yml).
export const openTestPaths = (cfg) => [...(cfg.otpDevMode ? ["otp_dev_mode"] : []), ...(cfg.mockPspEnabled ? ["mock_payments"] : [])];
const health = async (ctx) => json(200, { status: "ok", key_source: ctx.keys.source, test_paths_open: openTestPaths(ctx.cfg) });

// Coordinator on duty (audit F10): a real channel the app can show as call / WhatsApp buttons. Empty when not configured.
// It is also where the clients read public settings: funnel_counter (021) tells them whether to send step pings.
function supportContact(ctx) {
  const phone = ctx.cfg.coordinatorPhone;
  const funnel = ctx.cfg.funnelCounter;
  if (!isE164(phone)) return json(200, { coordinator: null, funnel_counter: funnel });
  const local = phone.startsWith("+974") ? `+974 ${phone.slice(4, 8)} ${phone.slice(8)}` : phone;
  return json(200, { coordinator: { phone_e164: phone, phone_display: local, tel_url: `tel:${phone}`,
    whatsapp_url: ctx.cfg.coordinatorWhatsapp ? `https://wa.me/${phone.slice(1)}` : null }, funnel_counter: funnel }, { "Cache-Control": "public, max-age=300" });
}

// "Request contact" (owner's design, 5 Nov): she writes what the problem or request is, confirms the number to call and when
// (now, in 10 minutes, in an hour, tomorrow). The request goes to the admin console (owner and ops), who call her. One open
// request per member: sending again updates it (up to 10 times); 3 new requests a day. The note and a different number are
// stored encrypted; account deletion erases them.
const CALLBACK_WHEN = ["now", "10min", "1h", "tomorrow"];
function normalizePhone(v) {
  const d = String(v).replace(/[\s\-().]/g, "").replace(/^00/, "+");
  if (/^[3-7][0-9]{7}$/.test(d)) return `+974${d}`;
  return isE164(d) ? d : null;
}
async function requestCall(ctx) {
  const { sql, user, body, keys } = ctx;
  const b = body || {};
  const message = String(b.message ?? "").trim();
  const details = [];
  if (!message) details.push({ field: "message", code: "REQUIRED" });
  else if (message.length > 500) details.push({ field: "message", code: "TOO_LONG" });
  if (!CALLBACK_WHEN.includes(b.callback_when)) details.push({ field: "callback_when", code: "INVALID" });
  let phone = null;
  if (b.contact_phone != null && String(b.contact_phone).trim() !== "") {
    phone = normalizePhone(b.contact_phone);
    if (!phone) details.push({ field: "contact_phone", code: "INVALID" });
  }
  if (details.length) fail(422, "VALIDATION_FAILED", details);
  let bookingId = null;
  if (b.booking_id != null) {
    requireUuid(b.booking_id, "booking_id");
    const [bk] = await sql`SELECT id FROM app.bookings WHERE id = ${b.booking_id} AND user_id = ${user.id}`;
    if (!bk) fail(404, "NOT_FOUND");
    bookingId = bk.id;
  }
  const [open] = await sql`SELECT id FROM app.call_requests WHERE user_id = ${user.id} AND status = 'requested'`;
  if (!open) {
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM app.call_requests WHERE user_id = ${user.id} AND created_at > now() - interval '24 hours'`;
    if (n >= 3) fail(429, "RATE_LIMITED", null, { retry_after: 3600 });
  }
  // one statement settles a double tap and a second send: the open request is created, or updated with her latest words
  const [r] = await sql`
    INSERT INTO app.call_requests (user_id, booking_id, message_enc, contact_phone_enc, callback_when)
    VALUES (${user.id}, ${bookingId}, ${encrypt(keys.dataKey, message)}, ${phone ? encrypt(keys.dataKey, phone) : null}, ${b.callback_when})
    ON CONFLICT (user_id) WHERE status = 'requested' DO UPDATE
       SET message_enc = EXCLUDED.message_enc, contact_phone_enc = EXCLUDED.contact_phone_enc, callback_when = EXCLUDED.callback_when,
           booking_id = COALESCE(EXCLUDED.booking_id, app.call_requests.booking_id),
           submissions = app.call_requests.submissions + 1, updated_at = now()
       WHERE app.call_requests.submissions < 10
    RETURNING id, created_at, (xmax = 0) AS inserted`;
  if (!r) fail(429, "RATE_LIMITED", null, { retry_after: 3600 });
  return json(r.inserted ? 201 : 200, { id: r.id, status: "requested", created_at: qa(r.created_at), already_requested: !r.inserted });
}

// Promo code check (migration 012). Subscriptions are display-only, so this only tells the member whether a code is
// valid and its percentage; nothing is redeemed. Every check is counted, at most 10 per member per hour, so codes
// cannot be guessed; an unknown, expired, used-up or deactivated code all answer the same way.
const PROMO_CHECKS_PER_HOUR = 10;
async function checkPromoCode(ctx) {
  const { sql, user } = ctx;
  const code = String((ctx.body || {}).code || "").trim().toUpperCase();
  if (!code || code.length > 24) fail(422, "VALIDATION_FAILED", [{ field: "code", code: "FORMAT" }]);
  // NMX-63: record the check first, then count (including this one), so parallel requests cannot all pass the limit
  await sql`INSERT INTO app.promo_code_checks (user_id) VALUES (${user.id})`;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM app.promo_code_checks WHERE user_id = ${user.id} AND at > now() - interval '1 hour'`;
  if (n > PROMO_CHECKS_PER_HOUR) fail(429, "RATE_LIMITED");
  // a compensation code (023) belongs to one member: for anyone else it does not exist
  const [p] = await sql`SELECT percent_off FROM app.promo_codes
                         WHERE code = ${code} AND is_active AND (expires_at IS NULL OR expires_at > now())
                           AND (max_uses IS NULL OR uses < max_uses) AND (user_id IS NULL OR user_id = ${user.id})`;
  return json(200, p ? { valid: true, percent_off: p.percent_off } : { valid: false });
}

export const userRoutes = [
  { method: "POST", path: "/api/v1/auth/otp:request", auth: "none", idem: true, handler: otpRequest },
  { method: "POST", path: "/api/v1/auth/otp:verify", auth: "none", handler: otpVerify },
  { method: "POST", path: "/api/v1/auth/token:refresh", auth: "none", handler: (ctx) => refreshTokens(ctx, "user") },
  { method: "POST", path: "/api/v1/auth/logout", auth: "user_any", handler: logout },
  { method: "GET", path: "/api/v1/legal/current", auth: "none", handler: legalCurrent },
  { method: "GET", path: "/api/v1/health", auth: "none", handler: health },
  { method: "POST", path: "/api/v1/promo-codes:check", auth: "user", handler: checkPromoCode },
  { method: "GET", path: "/api/v1/support/contact", auth: "none", handler: supportContact },
  { method: "POST", path: "/api/v1/support/call-requests", auth: "user", idem: true, handler: requestCall },
  { method: "POST", path: "/api/v1/users/me/registration", auth: "user_any", idem: true, handler: register },
  { method: "GET", path: "/api/v1/users/me", auth: "user_any", handler: me },
  { method: "GET", path: "/api/v1/users/me/export", auth: "user_any", handler: exportMe },
  { method: "POST", path: "/api/v1/users/me/consents", auth: "user", idem: true, handler: updateConsents },
  { method: "DELETE", path: "/api/v1/users/me", auth: "user_any", handler: deleteMe },
  { method: "GET", path: "/api/v1/questionnaires/preview", auth: "none", handler: questionnairePreview },
  { method: "GET", path: "/api/v1/questionnaires/current", auth: "user", handler: questionnaireCurrent },
  { method: "POST", path: "/api/v1/questionnaire-responses", auth: "user", idem: true, handler: submitQuestionnaire },
  { method: "GET", path: "/api/v1/sessions", auth: "user", handler: listSessions },
  { method: "POST", path: "/api/v1/sessions/{id}/waitlist", auth: "user", idem: true, handler: joinWaitlist },
  { method: "POST", path: "/api/v1/session-alerts", auth: "user", idem: true, handler: requestSessionAlert },
  { method: "POST", path: "/api/v1/bookings", auth: "user", idem: true, handler: createBooking },
  { method: "GET", path: "/api/v1/bookings", auth: "user", handler: listBookings },
  { method: "GET", path: "/api/v1/bookings/{id}", auth: "user", handler: getBooking },
  { method: "POST", path: "/api/v1/bookings/{id}/checkout", auth: "user", idem: true, handler: newCheckout },
  { method: "GET", path: "/api/v1/bookings/{id}/event-details", auth: "user", handler: eventDetails },
  { method: "POST", path: "/api/v1/bookings/{id}/cancel", auth: "user", idem: true, handler: cancelBooking },
  { method: "POST", path: "/api/v1/bookings/{id}/resolution", auth: "user", idem: true, handler: chooseResolution },
  { method: "POST", path: "/api/v1/bookings/{id}/check-in", auth: "user", idem: true, handler: checkIn },
  { method: "POST", path: "/api/v1/bookings/{id}/feedback", auth: "user", idem: true, handler: feedback },
  { method: "GET", path: "/api/v1/bookings/{id}/contacts", auth: "user", handler: bookingContacts },
  { method: "POST", path: "/api/v1/contact-requests", auth: "user", idem: true, handler: sendContactRequest },
  { method: "POST", path: "/api/v1/contact-requests/{id}:accept", auth: "user", idem: true, handler: (ctx) => decideContactRequest(ctx, true) },
  { method: "POST", path: "/api/v1/contact-requests/{id}:decline", auth: "user", idem: true, handler: (ctx) => decideContactRequest(ctx, false) },
  { method: "POST", path: "/api/v1/reports", auth: "user", idem: true, handler: createReport },
  { method: "GET", path: "/api/v1/cases/mine", auth: "user", handler: myCases },
  { method: "POST", path: "/api/v1/cases/{ref}/appeal", auth: "user", idem: true, handler: appeal },
  { method: "GET", path: "/api/v1/notifications", auth: "user_any", handler: notifications },
];

