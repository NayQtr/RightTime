// Venue portal API (/api/venue/v1, migration 016). A partner restaurant signs in with an email the admins registered
// and a 6-digit code, then sees HerZone's hosting requests for it, accepts or declines them, and on the day sees its
// tables and marks arrivals. It never sees a member's phone number, surname or booking id: only the table code, how
// many women, and their first names from 3 hours before the meetup.
import { hmacB64, jwtSign, randomDigits, safeEqual, sha256hex } from "../lib/crypto.js";
import { emailSettings, sendEmail } from "../lib/email.js";
import { fail, json, qa, requireUuid } from "../lib/http.js";
import { outboundText } from "../lib/i18n.js";
import { isEmail } from "../lib/validate.js";
import { audit, seatToken } from "../services/common.js";

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const PORTAL_HOURS = 12;
const NAMES_BEFORE_HOURS = 3;

const normEmail = (e) => String(e || "").trim().toLowerCase();
const validEmail = isEmail;
const emailHash = (keys, e) => sha256hex(`venue-email:${e}`);

// The same answer whether or not the email is registered, so the page never tells who is a partner.
// Item 14c: the code goes by email when a provider is set up (EMAIL_PROVIDER and its secrets, lib/email.js), and only
// to a registered, active address. Without a provider production answers 503 (the page says codes cannot be sent);
// only staging's OTP_DEV_MODE shows the code on screen, and never once a provider is set up.
async function requestCode(ctx) {
  const { sql, body, keys, cfg } = ctx;
  const email = normEmail(body.email);
  if (!validEmail(email)) fail(422, "VALIDATION_FAILED", [{ field: "email", code: "INVALID" }]);
  const eh = emailHash(keys, email);
  const [{ n_email }] = await sql`SELECT count(*)::int AS n_email FROM app.venue_login_codes WHERE email_hash = ${eh} AND created_at > now() - interval '1 hour'`;
  if (n_email >= 5) fail(429, "OTP_RATE_LIMITED", null, { retry_after: 3600 });
  const [{ n_ip }] = await sql`SELECT count(*)::int AS n_ip FROM app.venue_login_codes WHERE ip_trunc = ${ctx.ipBucket}::inet AND created_at > now() - interval '1 hour'`;
  if (n_ip >= 20) fail(429, "OTP_RATE_LIMITED", null, { retry_after: 3600 });
  const mail = emailSettings(ctx.getEnv, cfg.emailProvider);
  if (!mail && !cfg.otpDevMode) fail(503, "UNAVAILABLE", [{ reason: "no email provider configured" }]);
  const [u] = await sql`SELECT id FROM app.venue_users WHERE email = ${email} AND status = 'active'`;
  const code = randomDigits(6);
  const [c] = await sql`
    INSERT INTO app.venue_login_codes (venue_user_id, email_hash, expires_at, ip_trunc)
    VALUES (${u ? u.id : null}, ${eh}, now() + make_interval(mins => ${CODE_TTL_MIN}), ${ctx.ipBucket}::inet) RETURNING id`;
  // the same queries for every address (a row without a venue user never signs in, whatever its code)
  await sql`UPDATE app.venue_login_codes SET code_hash = ${hmacB64(keys.phonePepper, `${c.id}:${code}`)} WHERE id = ${c.id}`;
  if (u && mail) {
    // in the page's language (Accept-Language): Arabic, or English when the venue switched to it. Sent after the answer,
    // so a registered address answers like any other; an email that fails only makes this code unusable (it still counts
    // toward the limits above)
    const sending = sendEmail({ to: email, subject: outboundText("VENUE_CODE_SUBJECT", ctx.locale),
      text: outboundText("VENUE_CODE_BODY", ctx.locale, { code, minutes: CODE_TTL_MIN }) }, mail)
      .then(async (sent) => { if (!sent.ok) await sql`UPDATE app.venue_login_codes SET expires_at = now() WHERE id = ${c.id}`; })
      .catch((e) => console.error("venue code: email not sent:", e && e.message));
    globalThis.EdgeRuntime?.waitUntil?.(sending);
  }
  return json(202, { sent: true, expires_in: CODE_TTL_MIN * 60, ...(cfg.otpDevMode && !mail && u ? { dev_code: code } : {}) });
}

async function verifyCode(ctx) {
  const { sql, body, keys } = ctx;
  const email = normEmail(body.email);
  const code = String(body.code || "").trim();
  if (!validEmail(email) || !/^\d{6}$/.test(code)) fail(422, "VALIDATION_FAILED", [{ field: "code", code: "INVALID" }]);
  const [c] = await sql`
    UPDATE app.venue_login_codes SET attempts = attempts + 1
     WHERE id = (SELECT id FROM app.venue_login_codes WHERE email_hash = ${emailHash(keys, email)} AND consumed_at IS NULL
                   AND expires_at > now() ORDER BY created_at DESC LIMIT 1)
       AND attempts < ${MAX_ATTEMPTS}
     RETURNING *`;
  if (!c || !c.venue_user_id || !c.code_hash || !safeEqual(hmacB64(keys.phonePepper, `${c.id}:${code}`), c.code_hash)) fail(400, "OTP_INVALID");
  const used = await sql`UPDATE app.venue_login_codes SET consumed_at = now() WHERE id = ${c.id} AND consumed_at IS NULL RETURNING id`;
  if (!used.length) fail(400, "OTP_INVALID");
  const [u] = await sql`SELECT u.id, u.venue_id, v.name FROM app.venue_users u JOIN app.venues v ON v.id = u.venue_id
                         WHERE u.id = ${c.venue_user_id} AND u.status = 'active'`;
  if (!u) fail(400, "OTP_INVALID");
  const [ps] = await sql`INSERT INTO app.venue_portal_sessions (venue_user_id, expires_at)
                         VALUES (${u.id}, now() + make_interval(hours => ${PORTAL_HOURS})) RETURNING id, expires_at`;
  await sql`UPDATE app.venue_users SET last_login_at = now() WHERE id = ${u.id}`;
  await audit(sql, null, "venue_portal_login", "venue_users", u.id, null, ctx.ipTrunc);
  const now = Math.floor(Date.now() / 1000);
  const token = jwtSign(keys.jwt.privateKey, keys.jwt.kid, { sub: u.id, typ: "venue", sid: ps.id, iat: now, exp: now + PORTAL_HOURS * 3600 });
  return json(200, { access_token: token, token_type: "Bearer", expires_in: PORTAL_HOURS * 3600, venue: { name: u.name } });
}

async function logout(ctx) {
  await ctx.sql`UPDATE app.venue_portal_sessions SET revoked_at = now() WHERE id = ${ctx.claims.sid} AND revoked_at IS NULL`;
  return json(204, null);
}

const me = async (ctx) => json(200, { venue: { name: ctx.venueUser.venue_name }, email: ctx.venueUser.email });

const guestToken = (keys, venueId, bookingId) => seatToken(keys, `venue-${venueId}`, bookingId);

// Requests sent to this venue (from 3 days before), newest session first, with the tables once matching placed them.
async function listRequests(ctx) {
  const { sql, keys, venueUser } = ctx;
  await sql`SELECT app.venue_requests_tick()`;
  const rows = await sql`
    SELECT sv.session_id, sv.planned_guests, sv.status, sv.notified_at, sv.decided_at, s.starts_at, s.ends_at, s.experience, s.status AS session_status
      FROM app.session_venues sv JOIN app.event_sessions s ON s.id = sv.session_id
     WHERE sv.venue_id = ${venueUser.venue_id} AND sv.notified_at IS NOT NULL AND sv.status <> 'withdrawn'
       AND s.ends_at > now() - interval '1 day'
     ORDER BY s.starts_at`;
  const now = Date.now();
  const out = [];
  for (const r of rows) {
    const namesOpen = now >= new Date(r.starts_at).getTime() - NAMES_BEFORE_HOURS * 3600 * 1000;
    const tables = r.status !== "confirmed" ? [] : await sql`
      SELECT t.id, t.table_code, t.status FROM app.event_tables t
       WHERE t.session_id = ${r.session_id} AND t.venue_id = ${venueUser.venue_id} AND t.status IN ('locked','completed')
       ORDER BY t.table_code`;
    const tableViews = [];
    for (const t of tables) {
      const guests = await sql`
        SELECT b.id, b.status, b.checked_in_at, u.display_name FROM app.table_assignments a
          JOIN app.bookings b ON b.id = a.booking_id JOIN app.users u ON u.id = b.user_id
         WHERE a.table_id = ${t.id} AND a.is_current AND b.status IN ('group_locked','revealed','checked_in','completed')
         ORDER BY u.display_name`;
      tableViews.push({ code: t.table_code, women: guests.length,
        guests: namesOpen ? guests.map((g) => ({ id: guestToken(keys, venueUser.venue_id, g.id), first_name: g.display_name || null,
          arrived: Boolean(g.checked_in_at) })) : null });
    }
    out.push({ session_id: r.session_id, starts_at: qa(r.starts_at), ends_at: qa(r.ends_at), experience: r.experience,
      women_expected: r.planned_guests, status: r.status, can_answer: r.status === "pending" && now < new Date(r.starts_at).getTime(),
      names_from: qa(new Date(new Date(r.starts_at).getTime() - NAMES_BEFORE_HOURS * 3600 * 1000)), tables: tableViews });
  }
  return json(200, { venue: { name: venueUser.venue_name }, requests: out });
}

async function answer(ctx, accept) {
  const { sql, params, body, venueUser } = ctx;
  requireUuid(params.id, "session_id");
  const reason = accept ? null : String(body.reason || "").trim().slice(0, 300) || null;
  const out = await sql.begin(async (tx) => {
    const [sv] = await tx`SELECT sv.*, s.starts_at FROM app.session_venues sv JOIN app.event_sessions s ON s.id = sv.session_id
                           WHERE sv.session_id = ${params.id} AND sv.venue_id = ${venueUser.venue_id} AND sv.notified_at IS NOT NULL FOR UPDATE OF sv`;
    if (!sv) fail(404, "NOT_FOUND");
    if (sv.status !== "pending" || new Date(sv.starts_at) <= new Date()) fail(409, "CONFLICT", [{ status: sv.status }]);
    await tx`UPDATE app.session_venues SET status = ${accept ? "confirmed" : "declined"}, decided_at = now(), decided_by = ${venueUser.id},
                    decline_reason = ${reason}, updated_at = now()
              WHERE session_id = ${sv.session_id} AND venue_id = ${sv.venue_id}`;
    // the unanswered request's queued reminder is no longer needed
    await tx`UPDATE app.venue_outbox SET status = 'cancelled', updated_at = now()
              WHERE session_id = ${sv.session_id} AND venue_id = ${sv.venue_id} AND kind IN ('request','reminder') AND status = 'queued'`;
    if (!accept) await tx`INSERT INTO app.venue_outbox (session_id, venue_id, kind) VALUES (${sv.session_id}, ${sv.venue_id}, 'coordinator_declined')`;
    await audit(tx, null, accept ? "venue_request_accepted" : "venue_request_declined", "event_sessions", sv.session_id, null);
    return { status: accept ? "confirmed" : "declined" };
  });
  return json(200, out);
}

// On the day (from 3 hours before until the end): the venue marks a woman as arrived.
async function arrived(ctx) {
  const { sql, params, keys, venueUser } = ctx;
  const rows = await sql`
    SELECT b.id, b.status, s.starts_at, s.ends_at FROM app.event_tables t
      JOIN app.table_assignments a ON a.table_id = t.id AND a.is_current
      JOIN app.bookings b ON b.id = a.booking_id JOIN app.event_sessions s ON s.id = t.session_id
     WHERE t.venue_id = ${venueUser.venue_id} AND s.starts_at < now() + make_interval(hours => ${NAMES_BEFORE_HOURS}) AND s.ends_at > now()
       AND b.status IN ('group_locked','revealed','checked_in')`;
  const b = rows.find((r) => guestToken(keys, venueUser.venue_id, r.id) === params.guest);
  if (!b) fail(404, "NOT_FOUND");
  if (b.status !== "checked_in") {
    await sql`UPDATE app.bookings SET status = 'checked_in', checked_in_at = now(), checked_in_by_venue_user = ${venueUser.id}
               WHERE id = ${b.id} AND status IN ('group_locked','revealed')`;
    await audit(sql, null, "venue_marked_arrival", "bookings", b.id, null);
  }
  return json(200, { arrived: true });
}

export const venueRoutes = [
  { method: "POST", path: "/api/venue/v1/auth/code:request", auth: "none", handler: requestCode },
  { method: "POST", path: "/api/venue/v1/auth/code:verify", auth: "none", handler: verifyCode },
  { method: "POST", path: "/api/venue/v1/auth/logout", auth: "venue", handler: logout },
  { method: "GET", path: "/api/venue/v1/me", auth: "venue", handler: me },
  { method: "GET", path: "/api/venue/v1/requests", auth: "venue", handler: listRequests },
  { method: "POST", path: "/api/venue/v1/requests/{id}:accept", auth: "venue", handler: (ctx) => answer(ctx, true) },
  { method: "POST", path: "/api/venue/v1/requests/{id}:decline", auth: "venue", handler: (ctx) => answer(ctx, false) },
  { method: "POST", path: "/api/venue/v1/guests/{guest}:arrived", auth: "venue", handler: arrived },
];
