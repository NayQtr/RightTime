// Admin API (v0.3 §4; permission matrix §4.0.1; maker-checker via app.admin_approvals; P4 reads audited with a reason).
import { decrypt, encrypt, newTotpSecret, randomToken, sha256hex, totpStep } from "../lib/crypto.js";
import { fail, json, money, qa, requireUuid } from "../lib/http.js";
import { runMatching, MatchingError } from "../matching/engine.js";
import { audit, capturedPayment, currentTable, notify } from "../services/common.js";
import { dispatchRefund } from "../services/payments.js";
import { runAiOpinions, sendHeldVenueNotice } from "../services/identity.js";
import { isForCoordinator, venueMessage } from "../services/venue_messages.js";
import { issueTokens } from "./user.js";

const OWNER = ["owner"], OPS = ["owner", "ops"], FIN = ["owner", "finance"], TS = ["trust_safety"];
const ANY = ["owner", "ops", "finance", "trust_safety", "analyst", "researcher", "developer"];
const P4_REASONS = ["case_triage", "investigation", "second_approval", "appeal_review", "legal_request"];

// ------------------------------------------------------------------ auth
// Brute-force protection (audit F5): failed sign-ins / enrolments are recorded per e-mail hash and IP prefix.
// Too many failures inside the window -> 429 + Retry-After, checked before the secret is verified.
async function lockedFor(tx, kind, emailHash, ipTrunc, cfg) {
  const win = cfg.adminLoginWindowMinutes;
  const retry = async (rows, max) => {
    if (rows.length < max) return 0;
    const oldest = new Date(rows[rows.length - 1].attempted_at).getTime();
    return Math.max(1, Math.ceil((oldest + win * 60000 - Date.now()) / 1000));
  };
  // per e-mail: failures since the last success, inside the window
  const byEmail = await tx`
    SELECT attempted_at FROM app.admin_auth_attempts
     WHERE kind = ${kind} AND email_hash = ${emailHash} AND NOT succeeded AND attempted_at > now() - make_interval(mins => ${win})
       AND attempted_at > COALESCE((SELECT max(attempted_at) FROM app.admin_auth_attempts
                                     WHERE kind = ${kind} AND email_hash = ${emailHash} AND succeeded), '-infinity')
     ORDER BY attempted_at DESC LIMIT ${cfg.adminMaxFailsPerEmail}`;
  const e = await retry(byEmail, cfg.adminMaxFailsPerEmail);
  if (e) return { retryAfter: e, scope: "email" };
  if (!ipTrunc) return null;
  // per IP prefix: all failed sign-ins and enrolments, any e-mail
  const byIp = await tx`
    SELECT attempted_at FROM app.admin_auth_attempts
     WHERE ip_trunc = ${ipTrunc}::inet AND NOT succeeded AND attempted_at > now() - make_interval(mins => ${win})
     ORDER BY attempted_at DESC LIMIT ${cfg.adminMaxFailsPerIp}`;
  const i = await retry(byIp, cfg.adminMaxFailsPerIp);
  return i ? { retryAfter: i, scope: "ip" } : null;
}

// Runs check -> verify -> record in one transaction, serialised per e-mail so parallel guesses cannot overshoot the limit.
async function throttledAttempt(ctx, kind, email, verify) {
  const emailHash = sha256hex(email);
  const out = await ctx.sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`admin-auth:${kind}:${emailHash}`}))`;
    const locked = await lockedFor(tx, kind, emailHash, ctx.ipBucket, ctx.cfg);
    if (locked) return { locked };
    const ok = await verify(tx);
    await tx`INSERT INTO app.admin_auth_attempts (kind, email_hash, ip_trunc, succeeded)
             VALUES (${kind}, ${emailHash}, ${ctx.ipBucket}::inet, ${!!ok})`;
    return { ok };
  });
  if (out.locked) {
    await audit(ctx.sql, null, `admin_${kind}_locked`, "admin_users", null, out.locked.scope, ctx.ipTrunc);
    fail(429, "ADMIN_LOGIN_LOCKED", null, { retry_after: out.locked.retryAfter });
  }
  if (!out.ok) await new Promise((r) => setTimeout(r, 300));
  return out.ok;
}

async function enroll(ctx) {
  const { body, keys } = ctx;
  const email = String(body.email || "").trim().toLowerCase();
  let admin = null;
  const secret = newTotpSecret();
  const ok = await throttledAttempt(ctx, "enroll", email, async (tx) => {
    const [a] = await tx`SELECT * FROM app.admin_users WHERE lower(email) = ${email} AND status = 'active'`;
    if (!a || !a.enroll_token_hash || a.enroll_token_hash.trim() !== sha256hex(String(body.enroll_token || "")) || new Date(a.enroll_expires_at) < new Date())
      return false;
    // a new secret: codes of the old one are void, so the single-use marker (last_login_at) starts afresh
    await tx`UPDATE app.admin_users SET totp_secret_enc = ${encrypt(keys.dataKey, secret)}, mfa_enabled = true,
                    enroll_token_hash = NULL, enroll_expires_at = NULL, last_login_at = NULL WHERE id = ${a.id}`;
    await audit(tx, a.id, "admin_mfa_enrolled", "admin_users", a.id, "totp");
    admin = a;
    return true;
  });
  if (!ok) fail(401, "ENROLLMENT_INVALID");
  return json(200, { secret, otpauth_uri: `otpauth://totp/HerZone%20Admin:${encodeURIComponent(admin.email)}?secret=${secret}&issuer=HerZone&digits=6&period=30` });
}

async function login(ctx) {
  const { sql, body, keys } = ctx;
  const email = String(body.email || "").trim().toLowerCase();
  let a = null;
  const ok = await throttledAttempt(ctx, "login", email, async (tx) => {
    [a] = await tx`SELECT * FROM app.admin_users WHERE lower(email) = ${email} AND status = 'active'`;
    if (!a || !a.totp_secret_enc) return false;
    const step = totpStep(decrypt(keys.dataKey, a.totp_secret_enc), String(body.totp_code || ""));
    if (step === null) return false;
    // NMX-63: a code is accepted once. A sign-in in the same or a later 30-second step means this code was already used
    // (the per-email lock in throttledAttempt makes this check and the update below one step).
    if (a.last_login_at && step <= Math.floor(new Date(a.last_login_at).getTime() / 30000)) return false;
    await tx`UPDATE app.admin_users SET last_login_at = now() WHERE id = ${a.id}`;
    return true;
  });
  if (!ok) fail(401, "LOGIN_FAILED");
  await audit(sql, a.id, "admin_login", "admin_users", a.id, "totp", ctx.ipTrunc);
  const tokens = await issueTokens(ctx, "admin", a.id);
  return json(200, { access_token: tokens.access_token, token_type: "Bearer", expires_in: tokens.expires_in,
    admin: { id: a.id, name: a.name, email: a.email, role: a.role } });
}

const me = async (ctx) => json(200, { admin: ctx.admin });

// NMX-63: signing out ends the admin session on the server, not only in the browser
async function adminLogout(ctx) {
  if (ctx.claims && ctx.claims.sid) await ctx.sql`UPDATE app.refresh_tokens SET revoked_at = now() WHERE family_id = ${ctx.claims.sid} AND subject_id = ${ctx.admin.id} AND revoked_at IS NULL`;
  await audit(ctx.sql, ctx.admin.id, "admin_logout", "admin_users", ctx.admin.id, null);
  return json(204, null);
}

async function issueEnrollToken(ctx) {
  requireUuid(ctx.params.id, "admin_id");
  // NMX-63: an enrolment token replaces the admin's authenticator. Never for the caller herself, and for an admin who
  // already has one only with an explicit reset (reset_mfa: true), which ends her sessions and is audited, so the owner
  // cannot quietly take over another admin's identity (and with it the two-person approval rule).
  if (ctx.params.id === ctx.admin.id) fail(403, "FORBIDDEN", [{ reason: "own_account" }]);
  const [target] = await ctx.sql`SELECT id, totp_secret_enc FROM app.admin_users WHERE id = ${ctx.params.id}`;
  if (!target) fail(404, "NOT_FOUND");
  if (target.totp_secret_enc && ctx.body.reset_mfa !== true) fail(409, "CONFLICT", [{ reason: "mfa_enabled", hint: "send reset_mfa: true to reset it" }]);
  const token = "enr_" + randomToken(24);
  const rows = await ctx.sql.begin(async (tx) => {
    if (target.totp_secret_enc) {
      // the old authenticator stops working at once (an active admin keeps mfa_enabled; she signs in only after enrolling)
      await tx`UPDATE app.admin_users SET totp_secret_enc = NULL WHERE id = ${target.id}`;
      await tx`UPDATE app.refresh_tokens SET revoked_at = now() WHERE subject_type = 'admin' AND subject_id = ${target.id} AND revoked_at IS NULL`;
      await audit(tx, ctx.admin.id, "admin_mfa_reset", "admin_users", target.id, "reset");
    }
    return tx`UPDATE app.admin_users SET enroll_token_hash = ${sha256hex(token)}, enroll_expires_at = now() + interval '24 hours'
               WHERE id = ${target.id} RETURNING id, email`;
  });
  await audit(ctx.sql, ctx.admin.id, "admin_enroll_token", "admin_users", ctx.params.id, "issued");
  return json(201, { email: rows[0].email, enroll_token: token, expires_in: 86400 });
}

// ------------------------------------------------------------------ sessions & matching
async function listSessions(ctx) {
  const rows = await ctx.sql`
    SELECT s.*, (SELECT count(*)::int FROM app.event_tables t WHERE t.session_id = s.id AND t.status IN ('forming','locked')) AS tables,
           (SELECT count(*)::int FROM app.event_tables t WHERE t.session_id = s.id AND t.status = 'locked') AS locked_tables,
           (SELECT count(*)::int FROM app.bookings b WHERE b.session_id = s.id AND b.status = 'paid_awaiting_group') AS paid_waiting
      FROM app.event_sessions s ORDER BY s.starts_at DESC LIMIT 200`;
  return json(200, { sessions: rows.map((s) => ({ id: s.id, experience: s.experience, language: s.conversation_language.trim(),
    starts_at: qa(s.starts_at), lock_at: qa(s.lock_at), reveal_at: qa(s.reveal_at), district: s.district_hint_en, status: s.status,
    seats_sold: s.seats_sold, max_seats: s.max_seats, tables: s.tables, locked_tables: s.locked_tables, paid_waiting: s.paid_waiting })) });
}

async function createSession(ctx) {
  const { sql, body } = ctx;
  const start = new Date(body.starts_at);
  const details = [];
  if (!["coffee", "dinner"].includes(body.experience)) details.push({ field: "experience" });
  if (!["ar", "en"].includes(body.conversation_language)) details.push({ field: "conversation_language" });
  if (isNaN(start) || start.getTime() < Date.now() + 25 * 3600 * 1000) details.push({ field: "starts_at", code: "AT_LEAST_25H_AHEAD" });
  const dur = Number(body.duration_minutes || 120);
  const maxSeats = Number(body.max_seats || 18);
  if (!(dur >= 30 && dur <= 360)) details.push({ field: "duration_minutes" });
  if (!(maxSeats >= 4 && maxSeats <= 120)) details.push({ field: "max_seats" });
  if (!body.district_hint_ar || !body.district_hint_en) details.push({ field: "district_hint" });
  if (details.length) fail(422, "VALIDATION_FAILED", details);
  const [pp] = await sql`SELECT id FROM app.price_plans WHERE city_id = 'doh' AND experience = ${body.experience}
                           AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now()) ORDER BY valid_from DESC LIMIT 1`;
  const [cp] = await sql`SELECT id FROM app.cancellation_policies ORDER BY created_at DESC LIMIT 1`;
  if (!pp || !cp) fail(422, "VALIDATION_FAILED", [{ field: "price_plan", code: "NONE_ACTIVE" }]);
  const H = 3600 * 1000;
  const [s] = await sql`
    INSERT INTO app.event_sessions (city_id, experience, conversation_language, starts_at, ends_at, district_hint_ar, district_hint_en,
      price_plan_id, cancellation_policy_id, max_seats, booking_opens_at, booking_closes_at, lock_at, reveal_at, check_in_opens_at, status)
    VALUES ('doh', ${body.experience}, ${body.conversation_language}, ${start}, ${new Date(start.getTime() + dur * 60000)},
      ${body.district_hint_ar}, ${body.district_hint_en}, ${pp.id}, ${cp.id}, ${maxSeats}, now(), ${new Date(start.getTime() - H)},
      ${new Date(start.getTime() - 24 * H)}, ${new Date(start.getTime() - 24 * H)}, ${new Date(start.getTime() - H)}, 'draft')
    RETURNING id, status`;
  await audit(sql, ctx.admin.id, "session_create", "event_sessions", s.id, "draft");
  return json(201, s);
}

async function sessionDetail(ctx) {
  const { sql, params } = ctx;
  requireUuid(params.id, "session_id");
  const [s] = await sql`SELECT * FROM app.event_sessions WHERE id = ${params.id}`;
  if (!s) fail(404, "SESSION_NOT_FOUND");
  const pool = await sql`
    SELECT b.conversation_language AS language, bt.rank AS tier_rank, count(*)::int AS n FROM app.bookings b
      JOIN app.budget_tiers bt ON bt.id = b.budget_tier_id WHERE b.session_id = ${s.id} AND b.status = 'paid_awaiting_group'
     GROUP BY 1, 2 ORDER BY 1, 2`;
  const [{ holds }] = await sql`SELECT count(*)::int AS holds FROM app.bookings WHERE session_id = ${s.id} AND status = 'payment_pending'`;
  const [{ waitlist }] = await sql`SELECT count(*)::int AS waitlist FROM app.waitlist_entries WHERE session_id = ${s.id} AND status = 'waiting'`;
  const [{ blocks }] = await sql`
    SELECT count(*)::int AS blocks FROM app.blocked_pairs bp
     WHERE bp.user_a IN (SELECT user_id FROM app.bookings WHERE session_id = ${s.id} AND status = 'paid_awaiting_group')
       AND bp.user_b IN (SELECT user_id FROM app.bookings WHERE session_id = ${s.id} AND status = 'paid_awaiting_group')`;
  const tables = await sql`
    SELECT t.*, v.name AS venue_name FROM app.event_tables t LEFT JOIN app.venues v ON v.id = t.venue_id
     WHERE t.session_id = ${s.id} AND (t.status <> 'planned' OR EXISTS (SELECT 1 FROM app.table_assignments a WHERE a.table_id = t.id AND a.is_current))
     ORDER BY t.table_code`;
  const members = await sql`
    SELECT a.table_id, b.id AS booking_id, b.booking_ref, b.status, u.display_name, b.checked_in_at FROM app.table_assignments a
      JOIN app.bookings b ON b.id = a.booking_id JOIN app.users u ON u.id = b.user_id
     WHERE a.is_current AND a.table_id IN (SELECT id FROM app.event_tables WHERE session_id = ${s.id}) ORDER BY b.booking_ref`;
  const unassigned = await sql`
    SELECT b.id AS booking_id, b.booking_ref, b.status, u.display_name FROM app.bookings b JOIN app.users u ON u.id = b.user_id
     WHERE b.session_id = ${s.id} AND b.status = 'paid_awaiting_group'
       AND NOT EXISTS (SELECT 1 FROM app.table_assignments a WHERE a.booking_id = b.id AND a.is_current)`;
  const runs = await sql`SELECT id, mode, rule_version, algorithm, seed::text AS seed, result_summary, created_at FROM app.matching_runs
                          WHERE session_id = ${s.id} ORDER BY created_at DESC LIMIT 10`;
  return json(200, {
    session: { id: s.id, experience: s.experience, language: s.conversation_language.trim(), status: s.status, starts_at: qa(s.starts_at),
      ends_at: qa(s.ends_at), booking_closes_at: qa(s.booking_closes_at), lock_at: qa(s.lock_at), reveal_at: qa(s.reveal_at),
      check_in_opens_at: qa(s.check_in_opens_at), district: s.district_hint_en, seats_sold: s.seats_sold, max_seats: s.max_seats },
    pool, holds, waitlist, blocks_in_pool: blocks,
    tables: tables.map((t) => ({ id: t.id, code: t.table_code, status: t.status, confirmed_count: t.confirmed_count, capacity: t.capacity,
      venue: t.venue_name, venue_confirmed_at: qa(t.venue_confirmed_at),
      members: members.filter((m) => m.table_id === t.id).map((m) => ({ booking_id: m.booking_id, ref: m.booking_ref, status: m.status,
        display_name: m.display_name, checked_in: !!m.checked_in_at })) })),
    unassigned: unassigned.map((m) => ({ booking_id: m.booking_id, ref: m.booking_ref, display_name: m.display_name })),
    runs: runs.map((r) => ({ ...r, created_at: qa(r.created_at) })),
  });
}

async function runFor(ctx, mode) {
  const { sql, params, body, cfg, admin } = ctx;
  requireUuid(params.id, "session_id");
  const [s] = await sql`SELECT * FROM app.event_sessions WHERE id = ${params.id}`;
  if (!s) fail(404, "SESSION_NOT_FOUND");
  if (mode === "published") {
    const [locked] = await sql`SELECT 1 FROM app.event_tables WHERE session_id = ${s.id} AND status = 'locked' LIMIT 1`;
    if (locked || new Date() >= new Date(s.lock_at)) fail(409, "MATCHING_LOCKED");
  }
  const [{ input }] = await sql`SELECT app.matching_input(${s.id}) AS input`;
  const ruleVersion = body.rule_version || "r2-personality";
  const seed = Number.isInteger(body.seed) ? body.seed : Math.floor(Math.random() * 2 ** 31);
  const packingMode = body.packing_mode || cfg.packingMode;
  const maxTables = Number.isInteger(body.max_tables) ? body.max_tables : input.venues.reduce((a, v) => a + v.tables_available, 0);
  let res;
  try {
    res = runMatching({ sessionId: s.id, mode, ruleVersion, seed, packingMode, maxTables,
      bookings: input.bookings.map((b) => ({ ...b, q05_topics: b.q05_topics || null })),
      blockRows: input.blocks, venueCapacity: 6, venues: input.venues, questionnaire: input.questionnaire });
  } catch (e) {
    if (e instanceof MatchingError) fail(422, "VALIDATION_FAILED", [{ reason: e.message }]);
    throw e;
  }
  const summary = { tables: res.tables.length, seated: res.tables.reduce((a, t) => a + t.members.length, 0),
    leftovers: res.leftovers.length, ineligible: res.ineligible.length, packing_mode: packingMode, max_tables: maxTables };
  const runId = await sql.begin(async (tx) => {
    // continue table numbering after existing codes so a re-publish never collides
    const [{ maxno }] = await tx`SELECT COALESCE(max(substring(table_code from 2)::int), 0) AS maxno FROM app.event_tables WHERE session_id = ${s.id} AND table_code ~ '^T[0-9]+$'`;
    const recode = Object.fromEntries(res.tables.map((t, i) => [t.table_code, `T${String(maxno + i + 1).padStart(2, "0")}`]));
    if (mode === "published") {
      for (const t of res.tables) t.table_code = recode[t.table_code];
      for (const e of res.explanations.tables) e.table_code = recode[e.table_code];
    }
    const [run] = await tx`
      INSERT INTO app.matching_runs (session_id, mode, rule_version, questionnaire_version_id, algorithm, seed, inputs_hash, result_summary, explanations, run_by, published_at)
      VALUES (${s.id}, ${mode}, ${ruleVersion}, ${input.questionnaire_version_id}, ${res.algorithm}, ${seed}, ${res.inputs_hash},
              ${tx.json(summary)}, ${tx.json(res.explanations)}, ${admin.id}, ${mode === "published" ? new Date() : null})
      RETURNING id`;
    if (mode === "published") {
      await tx`UPDATE app.table_assignments SET is_current = false WHERE is_current AND booking_id IN (SELECT id FROM app.bookings WHERE session_id = ${s.id})`;
      // theme labels come from the published questionnaire the run was checked against
      const labels = new Map((await tx`SELECT q.key AS q, o.key AS o, o.label_ar, o.label_en FROM app.questions q
        JOIN app.question_options o ON o.question_id = q.id WHERE q.questionnaire_version_id = ${input.questionnaire_version_id}`)
        .map((r) => [`${r.q}.${r.o}`, r]));
      for (const t of res.tables) {
        const themes = (t.themes || []).map((th) => labels.get(`${th.q}.${th.o}`)).filter(Boolean)
          .map((r) => ({ q: r.q, o: r.o, ar: r.label_ar, en: r.label_en }));
        const [et] = await tx`INSERT INTO app.event_tables (session_id, venue_id, table_code, capacity, status, match_themes)
                              VALUES (${s.id}, ${t.venue_id}, ${t.table_code}, 6, 'forming', ${themes.length ? tx.json(themes) : null}) RETURNING id`;
        for (const m of t.members) {
          const ms = t.member_scores[m.booking_id];
          await tx`INSERT INTO app.table_assignments (booking_id, table_id, matching_run_id, member_score)
                   VALUES (${m.booking_id}, ${et.id}, ${run.id}, ${ms === null ? null : Number(ms.toFixed(4))})`;
        }
      }
      await audit(tx, admin.id, "matching_publish", "matching_runs", run.id, ruleVersion);
    }
    return run.id;
  });
  return json(mode === "published" ? 201 : 200, { run_id: runId, mode, seed, rule_version: ruleVersion, inputs_hash: res.inputs_hash,
    summary, explanations: res.explanations });
}

async function lockTable(ctx) {
  const { sql, params, admin } = ctx;
  requireUuid(params.id, "table_id");
  const out = await sql.begin(async (tx) => {
    const [t] = await tx`SELECT * FROM app.event_tables WHERE id = ${params.id} FOR UPDATE`;
    if (!t) fail(404, "NOT_FOUND");
    if (t.status !== "forming" || t.confirmed_count < t.min_quorum || !t.venue_id) fail(409, "TABLE_NOT_LOCKABLE", [{ status: t.status, confirmed_count: t.confirmed_count, venue: !!t.venue_id }]);
    const [s] = await tx`SELECT * FROM app.event_sessions WHERE id = ${t.session_id}`;
    await tx`UPDATE app.event_tables SET status = 'locked', locked_at = now() WHERE id = ${t.id}`;
    const members = await tx`
      UPDATE app.bookings b SET status = 'group_locked' FROM app.table_assignments a
       WHERE a.booking_id = b.id AND a.is_current AND a.table_id = ${t.id} AND b.status = 'paid_awaiting_group'
       RETURNING b.id, b.user_id`;
    for (const m of members) await notify(tx, m.user_id, "TABLE_LOCKED", { booking_id: m.id, reveal_at: s.reveal_at });
    await audit(tx, admin.id, "table_lock", "event_tables", t.id, "quorum_met");
    return { table_id: t.id, status: "locked", notified: members.length };
  });
  return json(200, out);
}

async function cancelQuorumNow(tx, tableId, actorId, choiceHours) {
  const [{ n }] = await tx`SELECT app.cancel_table_quorum(${tableId}, ${actorId}, ${choiceHours}) AS n`;
  await audit(tx, actorId, "venue_notified", "event_tables", tableId, "VENUE_TABLE_RELEASED");
  return { table_id: tableId, bookings_cancelled: n };
}

// Actions an owner executes directly; ops proposes them for owner approval (permission matrix "A").
async function proposeOrRun(ctx, action, payload, run) {
  if (ctx.admin.role === "owner") return json(200, { executed: true, result: await ctx.sql.begin((tx) => run(tx, ctx.admin.id)) });
  const [a] = await ctx.sql`INSERT INTO app.admin_approvals (action, payload, proposed_by) VALUES (${action}, ${ctx.sql.json(payload)}, ${ctx.admin.id}) RETURNING id`;
  await audit(ctx.sql, ctx.admin.id, "approval_proposed", "admin_approvals", a.id, action);
  return json(202, { executed: false, approval_id: a.id, status: "pending", code: "APPROVAL_REQUIRED" });
}

async function cancelQuorum(ctx) {
  requireUuid(ctx.params.id, "table_id");
  const payload = { table_id: ctx.params.id };
  return proposeOrRun(ctx, "table_cancel_quorum", payload, (tx, actor) => cancelQuorumNow(tx, payload.table_id, actor, ctx.cfg.rebookChoiceHours));
}

async function moveBooking(ctx) {
  requireUuid(ctx.params.id, "booking_id");
  requireUuid(ctx.body.to_table_id, "to_table_id");
  const payload = { booking_id: ctx.params.id, to_table_id: ctx.body.to_table_id, reason: String(ctx.body.reason || "") };
  return proposeOrRun(ctx, "booking_move", payload, (tx, actor) => moveBookingNow(tx, payload, actor));
}

async function moveBookingNow(tx, p, actor) {
  const [from] = await tx`SELECT table_id FROM app.table_assignments WHERE booking_id = ${p.booking_id} AND is_current`;
  await tx`SELECT app.move_booking_table(${p.booking_id}, ${p.to_table_id}, ${actor}, ${p.reason})`;
  // the shared-themes line described the table as matched; after a manual move it may no longer be true
  await tx`UPDATE app.event_tables SET match_themes = NULL WHERE id IN (${p.to_table_id}, ${from ? from.table_id : p.to_table_id})`;
  return { moved: true };
}

async function openSale(ctx) {
  requireUuid(ctx.params.id, "session_id");
  const payload = { session_id: ctx.params.id };
  return proposeOrRun(ctx, "session_open_sale", payload, (tx, actor) => openSaleNow(tx, payload.session_id, actor));
}

async function openSaleNow(tx, sessionId, actor) {
  const rows = await tx`UPDATE app.event_sessions SET status = 'on_sale' WHERE id = ${sessionId} AND status = 'draft' RETURNING id`;
  if (!rows.length) fail(409, "CONFLICT", [{ reason: "session is not a draft" }]);
  await audit(tx, actor, "session_open_sale", "event_sessions", sessionId, "published");
  return { session_id: sessionId, status: "on_sale" };
}

async function reveal(ctx) {
  const { sql, params, admin } = ctx;
  requireUuid(params.id, "session_id");
  const out = await sql.begin(async (tx) => {
    const [s] = await tx`SELECT * FROM app.event_sessions WHERE id = ${params.id}`;
    if (!s) fail(404, "SESSION_NOT_FOUND");
    if (new Date() < new Date(s.reveal_at)) fail(409, "REVEAL_TOO_EARLY", null, { reveal_at: qa(s.reveal_at) });
    const rows = await tx`
      UPDATE app.bookings b SET status = 'revealed' FROM app.table_assignments a, app.event_tables t
       WHERE a.booking_id = b.id AND a.is_current AND t.id = a.table_id AND t.status = 'locked' AND t.session_id = ${s.id}
         AND b.status = 'group_locked'
       RETURNING b.id, b.user_id, t.table_code, t.venue_id`;
    for (const r of rows) {
      // a booking under identity review (015) gets the venue only once it is approved (see decideIdentityReview)
      if (ctx.cfg.cardNameCheck) {
        const [held] = await tx`SELECT 1 FROM app.identity_reviews WHERE booking_id = ${r.id} AND status = 'pending'`;
        if (held) continue;
      }
      const [v] = await tx`SELECT name, district_ar FROM app.venues WHERE id = ${r.venue_id}`;
      await notify(tx, r.user_id, "VENUE_REVEALED", { booking_id: r.id, venue: v.name, district: v.district_ar, code: r.table_code });
    }
    if (s.status === "on_sale" || s.status === "sold_out") await tx`UPDATE app.event_sessions SET status = 'locked' WHERE id = ${s.id}`;
    await audit(tx, admin.id, "session_reveal", "event_sessions", s.id, `revealed_${rows.length}`);
    return { revealed: rows.length };
  });
  return json(200, out);
}

async function completeSession(ctx) {
  const { sql, params, admin } = ctx;
  requireUuid(params.id, "session_id");
  const out = await sql.begin(async (tx) => {
    const [s] = await tx`SELECT * FROM app.event_sessions WHERE id = ${params.id}`;
    if (!s) fail(404, "SESSION_NOT_FOUND");
    if (new Date() < new Date(s.ends_at)) fail(409, "CONFLICT", [{ reason: "session has not ended" }]);
    const done = await tx`UPDATE app.bookings SET status = 'completed', no_show = false WHERE session_id = ${s.id} AND status = 'checked_in' RETURNING id`;
    const noshow = await tx`UPDATE app.bookings SET status = 'completed', no_show = true WHERE session_id = ${s.id} AND status IN ('revealed','group_locked') RETURNING id`;
    await tx`UPDATE app.event_tables SET status = 'completed' WHERE session_id = ${s.id} AND status = 'locked'`;
    await tx`UPDATE app.event_sessions SET status = 'completed' WHERE id = ${s.id}`;
    await audit(tx, admin.id, "session_complete", "event_sessions", s.id, `noshow_${noshow.length}`);
    return { completed: done.length + noshow.length, no_shows: noshow.length };
  });
  return json(200, out);
}

async function venueConfirmed(ctx) {
  requireUuid(ctx.params.id, "table_id");
  const rows = await ctx.sql`UPDATE app.event_tables SET venue_confirmed_at = now() WHERE id = ${ctx.params.id} RETURNING id`;
  if (!rows.length) fail(404, "NOT_FOUND");
  await audit(ctx.sql, ctx.admin.id, "venue_confirmed", "event_tables", ctx.params.id, "T-3h");
  return json(200, { table_id: ctx.params.id, venue_confirmed: true });
}

// ------------------------------------------------------------------ live board
async function tonight(ctx) {
  const { sql } = ctx;
  const rows = await sql`
    SELECT s.id AS session_id, s.starts_at, s.ends_at, s.district_hint_en, t.id AS table_id, t.table_code, t.status, t.confirmed_count,
           t.venue_confirmed_at, v.name AS venue_name,
           (SELECT count(*)::int FROM app.table_assignments a JOIN app.bookings b ON b.id = a.booking_id
             WHERE a.table_id = t.id AND a.is_current AND b.checked_in_at IS NOT NULL) AS checked_in,
           (SELECT count(*)::int FROM app.bookings b WHERE b.session_id = s.id AND b.status = 'cancelled_by_user'
             AND b.cancelled_at > now() - interval '24 hours') AS late_cancellations,
           (SELECT count(*)::int FROM app.safety_reports r WHERE r.table_id = t.id AND r.status NOT IN ('closed','closed_no_action') AND r.severity <= 2) AS open_s1_s2,
           (SELECT array_agg(DISTINCT r.category::text) FROM app.safety_reports r WHERE r.table_id = t.id AND r.status NOT IN ('closed','closed_no_action')) AS incident_categories
      FROM app.event_sessions s JOIN app.event_tables t ON t.session_id = s.id AND t.status IN ('locked','completed') LEFT JOIN app.venues v ON v.id = t.venue_id
     WHERE s.starts_at BETWEEN now() - interval '6 hours' AND now() + interval '30 hours'
     ORDER BY s.starts_at, t.table_code`;
  const now = Date.now();
  return json(200, { generated_at: qa(new Date()), tables: rows.map((r) => {
    const start = new Date(r.starts_at).getTime();
    const alerts = [];
    if (!r.venue_confirmed_at && now >= start - 3 * 3600000) alerts.push({ level: "amber", code: "venue_not_confirmed_T-3h" });
    if (now >= start + 15 * 60000 && r.checked_in < 3) alerts.push({ level: "amber", code: "checked_in_below_3_at_15m" });
    if (now >= start + 30 * 60000 && r.checked_in < 2) alerts.push({ level: "red", code: "checked_in_below_2_at_30m" });
    if (r.open_s1_s2 > 0) alerts.push({ level: "red", code: "open_s1_s2_incident" });
    return { session_id: r.session_id, starts_at: qa(r.starts_at), district: r.district_hint_en, table_id: r.table_id, table_code: r.table_code,
      venue: r.venue_name, status: r.status, confirmed: r.confirmed_count, checked_in: r.checked_in, late_cancellations: r.late_cancellations,
      incidents: { open_s1_s2: r.open_s1_s2, categories: r.incident_categories || [] }, venue_confirmed: !!r.venue_confirmed_at, alerts };
  }) });
}

// ------------------------------------------------------------------ venues
const VENUE_FIELDS = ["name", "district_ar", "district_en", "address_line", "lat", "lng", "venue_type", "supported_experiences", "total_bookable_tables",
  "seats_per_table_max", "price_band_min_minor", "price_band_max_minor", "budget_tier_id", "noise_level", "accessibility",
  "separate_bills_confirmed", "min_spend_policy", "arrival_instructions_ar", "arrival_instructions_en", "contract_status", "is_active"];

async function listVenues(ctx) {
  const rows = await ctx.sql`
    SELECT v.*, bt.rank AS tier_rank, vs.n AS ratings_n, vs.avg_venue_rating,
           (SELECT count(*)::int FROM app.venue_contacts c WHERE c.venue_id = v.id AND c.is_day_of_contact) AS day_of_contacts
      FROM app.venues v JOIN app.budget_tiers bt ON bt.id = v.budget_tier_id LEFT JOIN app.venue_scores vs ON vs.venue_id = v.id
     ORDER BY v.name`;
  return json(200, { venues: rows.map((v) => ({ ...v, lat: Number(v.lat), lng: Number(v.lng),
    avg_venue_rating: v.ratings_n >= 5 ? v.avg_venue_rating : null })) });
}

function venueValues(body, partial) {
  const out = {};
  for (const f of VENUE_FIELDS) if (body[f] !== undefined) out[f] = body[f];
  if (!partial) for (const f of VENUE_FIELDS.filter((x) => !["accessibility", "is_active", "contract_status", "separate_bills_confirmed"].includes(x)))
    if (out[f] === undefined) fail(422, "VALIDATION_FAILED", [{ field: f, code: "REQUIRED" }]);
  if (out.accessibility !== undefined) out.accessibility = JSON.stringify(out.accessibility);
  return out;
}

async function createVenue(ctx) {
  const vals = venueValues(ctx.body, false);
  const [v] = await ctx.sql`INSERT INTO app.venues ${ctx.sql({ city_id: "doh", ...vals })} RETURNING id`;
  await audit(ctx.sql, ctx.admin.id, "venue_create", "venues", v.id, null);
  return json(201, v);
}

async function updateVenue(ctx) {
  requireUuid(ctx.params.id, "venue_id");
  const vals = venueValues(ctx.body, true);
  if (!Object.keys(vals).length) fail(422, "VALIDATION_FAILED", [{ code: "NO_FIELDS" }]);
  const rows = await ctx.sql`UPDATE app.venues SET ${ctx.sql(vals)} WHERE id = ${ctx.params.id} RETURNING id, contract_status, is_active`;
  if (!rows.length) fail(404, "NOT_FOUND");
  await audit(ctx.sql, ctx.admin.id, "venue_update", "venues", ctx.params.id, Object.keys(vals).join(",").slice(0, 40));
  return json(200, rows[0]);
}

async function addContact(ctx) {
  requireUuid(ctx.params.id, "venue_id");
  const { name, phone_e164, role, is_day_of_contact } = ctx.body;
  if (!name || !/^\+[1-9][0-9]{6,14}$/.test(String(phone_e164 || ""))) fail(422, "VALIDATION_FAILED", [{ field: "name/phone_e164" }]);
  const [c] = await ctx.sql`INSERT INTO app.venue_contacts (venue_id, name, phone_e164_enc, role, is_day_of_contact)
                             VALUES (${ctx.params.id}, ${name}, ${encrypt(ctx.keys.dataKey, phone_e164)}, ${role || null}, ${!!is_day_of_contact}) RETURNING id`;
  await audit(ctx.sql, ctx.admin.id, "venue_contact_add", "venue_contacts", c.id, null);
  return json(201, { id: c.id });
}

async function listContacts(ctx) {
  requireUuid(ctx.params.id, "venue_id");
  const rows = await ctx.sql`SELECT * FROM app.venue_contacts WHERE venue_id = ${ctx.params.id} ORDER BY is_day_of_contact DESC, name`;
  return json(200, { contacts: rows.map((c) => {
    const phone = decrypt(ctx.keys.dataKey, c.phone_e164_enc) || "";
    return { id: c.id, name: c.name, role: c.role, is_day_of_contact: c.is_day_of_contact, phone_masked: `${phone.slice(0, 4)} •••• ${phone.slice(-4)}` };
  }) });
}

// ------------------------------------------------------------------ payments & refunds
async function listPayments(ctx) {
  const rows = await ctx.sql`
    SELECT p.id, p.psp, p.psp_payment_intent_id, p.amount_minor, p.status, p.failure_code, p.method_brand, p.created_at, p.succeeded_at, b.booking_ref
      FROM app.payments p JOIN app.bookings b ON b.id = p.booking_id ORDER BY p.created_at DESC LIMIT 200`;
  return json(200, { payments: rows.map((p) => ({ ...p, created_at: qa(p.created_at), succeeded_at: qa(p.succeeded_at), amount: money(p.amount_minor, "en") })) });
}

async function listRefunds(ctx) {
  const status = ctx.url.searchParams.get("status");
  const rows = await ctx.sql`
    SELECT r.*, b.booking_ref, b.status AS booking_status, b.cancel_reason_code FROM app.refunds r JOIN app.bookings b ON b.id = r.booking_id
     WHERE (${status}::text IS NULL OR r.status::text = ${status}) ORDER BY r.created_at DESC LIMIT 200`;
  return json(200, { refunds: rows.map((r) => ({ id: r.id, booking_ref: r.booking_ref, booking_status: r.booking_status, cancel_reason: r.cancel_reason_code,
    amount: money(r.amount_minor, "en"), reason: r.reason, status: r.status, psp_refund_id: r.psp_refund_id, created_at: qa(r.created_at),
    completed_at: qa(r.completed_at), approved_by: r.approved_by })) });
}

async function approveBatch(ctx) {
  const { sql, body, admin, psp } = ctx;
  const ids = Array.isArray(body.refund_ids) ? body.refund_ids : [];
  ids.forEach((id) => requireUuid(id, "refund_ids"));
  if (!ids.length) fail(422, "VALIDATION_FAILED", [{ field: "refund_ids" }]);
  const approved = await sql.begin(async (tx) => {
    const rows = await tx`
      UPDATE app.refunds SET approved_by = ${admin.id}
       WHERE id IN ${tx(ids)} AND status = 'requested' AND reason IN ('organizer_cancel','seat_unavailable','user_cancel_in_window','duplicate_charge')
       RETURNING id`;
    for (const r of rows) await audit(tx, admin.id, "refund_batch_approve", "refunds", r.id, "organizer_cancel");
    return rows.map((r) => r.id);
  });
  const results = [];
  for (const id of approved) { await dispatchRefund(sql, psp, id); results.push(id); }
  const final = approved.length ? await sql`SELECT id, status FROM app.refunds WHERE id IN ${sql(approved)}` : [];
  return json(200, { approved: approved.length, skipped: ids.length - approved.length, refunds: final });
}

async function autoRefundUnresolved(ctx) {
  const [{ n }] = await ctx.sql`SELECT app.refund_unresolved_organizer_cancels(now() - make_interval(hours => ${ctx.cfg.rebookChoiceHours})) AS n`;
  await audit(ctx.sql, ctx.admin.id, "refund_auto_unresolved", "refunds", null, `created_${n}`);
  return json(200, { created: n });
}

async function proposeGoodwill(ctx) {
  requireUuid(ctx.body.booking_id, "booking_id");
  const amount = Number(ctx.body.amount_minor);
  if (!Number.isInteger(amount) || amount <= 0) fail(422, "VALIDATION_FAILED", [{ field: "amount_minor" }]);
  const [a] = await ctx.sql`INSERT INTO app.admin_approvals (action, payload, proposed_by)
                             VALUES ('refund_goodwill', ${ctx.sql.json({ booking_id: ctx.body.booking_id, amount_minor: amount })}, ${ctx.admin.id}) RETURNING id`;
  await audit(ctx.sql, ctx.admin.id, "approval_proposed", "admin_approvals", a.id, "refund_goodwill");
  return json(202, { approval_id: a.id, status: "pending", code: "APPROVAL_REQUIRED" });
}

// ------------------------------------------------------------------ trust & safety
async function listCases(ctx) {
  const rows = await ctx.sql`
    SELECT r.id, r.case_ref, r.category, r.timing, r.immediate_danger, r.severity, r.status, r.sla_due_at, r.created_at, r.assigned_to,
           (r.reported_user_id IS NOT NULL) AS has_reported_user
      FROM app.safety_reports r
     WHERE r.status NOT IN ('closed','closed_no_action') OR r.created_at > now() - interval '30 days'
     ORDER BY (r.status IN ('closed','closed_no_action')), r.severity NULLS LAST, r.sla_due_at`;
  return json(200, { cases: rows.map((r) => ({ ...r, sla_due_at: qa(r.sla_due_at), created_at: qa(r.created_at) })) });
}

async function canReadCase(ctx, r) {
  if (ctx.admin.role === "trust_safety") return true;
  if (ctx.admin.role !== "owner") return false;
  if (r.status === "appealed") return true;
  const [pending] = await ctx.sql`SELECT 1 FROM app.admin_approvals WHERE action = 'case_ban' AND status = 'pending' AND payload->>'report_id' = ${r.id}`;
  return !!pending;
}

async function caseDetail(ctx) {
  const { sql, params, url, keys, admin } = ctx;
  requireUuid(params.id, "case_id");
  const reason = url.searchParams.get("reason");
  if (!P4_REASONS.includes(reason)) fail(428, "REASON_REQUIRED", [{ field: "reason", allowed: P4_REASONS }]);
  const [r] = await sql`SELECT * FROM app.safety_reports WHERE id = ${params.id}`;
  if (!r) fail(404, "CASE_NOT_FOUND");
  if (!(await canReadCase(ctx, r))) fail(403, "FORBIDDEN");
  await audit(sql, admin.id, "read_p4", "safety_reports", r.id, reason, ctx.ipTrunc);
  const actions = await sql`SELECT ra.action, ra.actor_id, ra.second_approver, ra.effective_from, ra.effective_to, ra.created_at, ra.rationale_enc
                             FROM app.report_actions ra WHERE ra.report_id = ${r.id} ORDER BY ra.created_at`;
  const people = await sql`SELECT id, display_name, status FROM app.users WHERE id IN (${r.reporter_user_id}, ${r.reported_user_id || r.reporter_user_id})`;
  const name = (id) => (people.find((p) => p.id === id) || {}).display_name || null;
  const [{ earlier }] = r.reported_user_id
    ? await sql`SELECT count(*)::int AS earlier FROM app.safety_reports WHERE reported_user_id = ${r.reported_user_id} AND id <> ${r.id}` : [{ earlier: 0 }];
  return json(200, { case: { id: r.id, case_ref: r.case_ref, category: r.category, timing: r.timing, immediate_danger: r.immediate_danger,
    severity: r.severity, status: r.status, sla_due_at: qa(r.sla_due_at), created_at: qa(r.created_at),
    description: decrypt(keys.dataKey, r.description_enc),
    reporter: { display_name: name(r.reporter_user_id) },
    reported: r.reported_user_id ? { display_name: name(r.reported_user_id), status: (people.find((p) => p.id === r.reported_user_id) || {}).status, earlier_cases: earlier } : null,
    actions: actions.map((a) => ({ action: a.action, actor_id: a.actor_id, second_approver: a.second_approver, effective_from: qa(a.effective_from),
      effective_to: qa(a.effective_to), rationale: decrypt(keys.dataKey, a.rationale_enc) })) } });
}

async function triage(ctx) {
  const { sql, params, body, admin } = ctx;
  requireUuid(params.id, "case_id");
  const sev = body.severity;
  if (sev !== undefined && ![1, 2, 3, 4].includes(sev)) fail(422, "VALIDATION_FAILED", [{ field: "severity" }]);
  if (!["triaged", "investigating"].includes(body.status)) fail(422, "VALIDATION_FAILED", [{ field: "status" }]);
  const rows = await sql`UPDATE app.safety_reports SET status = ${body.status}, assigned_to = ${admin.id},
                           severity = COALESCE(${sev ?? null}::smallint, severity) WHERE id = ${params.id}
                           AND status IN ('new','triaged','investigating') RETURNING id, status, severity`;
  if (!rows.length) fail(409, "CONFLICT");
  await audit(sql, admin.id, "case_triage", "safety_reports", params.id, body.status);
  return json(200, rows[0]);
}

async function decisionNotices(tx, r, decision) {
  if (r.reporter_user_id) await notify(tx, r.reporter_user_id, "REPORT_OUTCOME", { case: r.case_ref });
  if (r.reported_user_id && decision !== "no_action") {
    const [s] = r.booking_id ? await tx`SELECT s.starts_at FROM app.bookings b JOIN app.event_sessions s ON s.id = b.session_id WHERE b.id = ${r.booking_id}` : [null];
    await notify(tx, r.reported_user_id, "CONDUCT_DECISION", { case: r.case_ref, date: s ? s.starts_at : null, category: r.category,
      decision, appeal_until: new Date(Date.now() + 14 * 86400000).toISOString() }, "email");
  }
}

async function liftInterimSuspension(tx, r) {
  await tx`UPDATE app.report_actions SET effective_to = now() WHERE report_id = ${r.id} AND action = 'temporary_suspension' AND effective_to IS NULL`;
}

async function cancelFutureBookings(tx, userId, reasonCode) {
  const rows = await tx`
    UPDATE app.bookings b SET status = 'cancelled_by_organizer', cancelled_at = now(), cancel_actor = 'organizer', cancel_reason_code = ${reasonCode}
      FROM app.event_sessions s
     WHERE s.id = b.session_id AND s.starts_at > now() AND b.user_id = ${userId}
       AND b.status IN ('payment_pending','paid_awaiting_group','group_locked','revealed')
     RETURNING b.id`;
  const refundIds = [];
  for (const b of rows) {
    const p = await capturedPayment(tx, b.id);
    if (p) {
      const [r] = await tx`INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
                           VALUES (${p.id}, ${b.id}, ${p.amount_minor}, 'organizer_cancel', 'requested', ${reasonCode + "-" + b.id}) RETURNING id`;
      refundIds.push(r.id);
    }
  }
  return refundIds;
}

async function banNow(tx, reportId, decider, approver, keys, rationale) {
  const [r] = await tx`SELECT * FROM app.safety_reports WHERE id = ${reportId} FOR UPDATE`;
  if (!r || !r.reported_user_id) fail(409, "CONFLICT", [{ reason: "case has no reported user" }]);
  await tx`INSERT INTO app.report_actions (report_id, action, actor_id, second_approver, rationale_enc)
           VALUES (${r.id}, 'ban', ${decider}, ${approver}, ${rationale ? encrypt(keys.dataKey, rationale) : null})`;
  await liftInterimSuspension(tx, r);
  await tx`UPDATE app.users SET status = 'banned' WHERE id = ${r.reported_user_id}`;
  await tx`UPDATE app.safety_reports SET status = 'actioned' WHERE id = ${r.id}`;
  const refunds = await cancelFutureBookings(tx, r.reported_user_id, "account_banned");
  await decisionNotices(tx, r, "ban");
  await audit(tx, decider, "sanction_ban", "users", r.reported_user_id, `S${r.severity}_confirmed`);
  await audit(tx, approver, "sanction_approve", "report_actions", r.id, "second_approver");
  return { report_id: r.id, decision: "ban", refunds };
}

async function caseAction(ctx) {
  const { sql, params, body, admin, keys } = ctx;
  requireUuid(params.id, "case_id");
  const action = body.action;
  if (!["warning", "suspension", "no_action", "referral_authorities", "ban"].includes(action)) fail(422, "VALIDATION_FAILED", [{ field: "action" }]);
  const [r0] = await sql`SELECT * FROM app.safety_reports WHERE id = ${params.id}`;
  if (!r0) fail(404, "CASE_NOT_FOUND");
  if (!["new", "triaged", "investigating"].includes(r0.status)) fail(409, "CONFLICT", [{ status: r0.status }]);
  if (action === "ban") {
    const [a] = await sql`INSERT INTO app.admin_approvals (action, payload, proposed_by)
                          VALUES ('case_ban', ${sql.json({ report_id: r0.id, rationale: body.rationale || null })}, ${admin.id}) RETURNING id`;
    await audit(sql, admin.id, "approval_proposed", "admin_approvals", a.id, "case_ban");
    return json(202, { approval_id: a.id, status: "pending", code: "APPROVAL_REQUIRED" });
  }
  const days = Number(body.effective_days || 30);
  const refunds = await sql.begin(async (tx) => {
    const [r] = await tx`SELECT * FROM app.safety_reports WHERE id = ${r0.id} FOR UPDATE`;
    await tx`INSERT INTO app.report_actions (report_id, action, actor_id, effective_to, rationale_enc)
             VALUES (${r.id}, ${action}, ${admin.id}, ${action === "suspension" ? new Date(Date.now() + days * 86400000) : null},
                     ${body.rationale ? encrypt(keys.dataKey, String(body.rationale)) : null})`;
    await liftInterimSuspension(tx, r);
    let refundIds = [];
    if (r.reported_user_id) {
      if (action === "suspension") {
        await tx`UPDATE app.users SET status = 'suspended' WHERE id = ${r.reported_user_id} AND status IN ('active','suspended')`;
        refundIds = await cancelFutureBookings(tx, r.reported_user_id, "account_suspended");
      } else {
        await tx`UPDATE app.users SET status = 'active' WHERE id = ${r.reported_user_id} AND status = 'suspended'`;
      }
    }
    await tx`UPDATE app.safety_reports SET status = ${action === "no_action" ? "closed_no_action" : "actioned"} WHERE id = ${r.id}`;
    await decisionNotices(tx, r, action);
    await audit(tx, admin.id, `sanction_${action}`, "safety_reports", r.id, `S${r.severity}`);
    return refundIds;
  });
  for (const id of refunds) await dispatchRefund(sql, ctx.psp, id);
  return json(200, { case_id: r0.id, action, status: action === "no_action" ? "closed_no_action" : "actioned" });
}

async function appealDecision(ctx) {
  const { sql, params, body, admin, keys } = ctx;
  requireUuid(params.id, "case_id");
  if (!["upheld", "rejected"].includes(body.decision)) fail(422, "VALIDATION_FAILED", [{ field: "decision" }]);
  const action = body.decision === "upheld" ? "appeal_upheld" : "appeal_rejected";
  const appealRefunds = [];
  const out = await sql.begin(async (tx) => {
    const [r] = await tx`SELECT * FROM app.safety_reports WHERE id = ${params.id} FOR UPDATE`;
    if (!r) fail(404, "CASE_NOT_FOUND");
    if (r.status !== "appealed") fail(409, "CONFLICT", [{ status: r.status }]);
    await tx`INSERT INTO app.report_actions (report_id, action, actor_id, rationale_enc)
             VALUES (${r.id}, ${action}, ${admin.id}, ${body.rationale ? encrypt(keys.dataKey, String(body.rationale)) : null})`;
    if (action === "appeal_upheld" && r.reported_user_id) {
      await tx`UPDATE app.users SET status = 'active' WHERE id = ${r.reported_user_id} AND status IN ('suspended','banned')`;
      await tx`UPDATE app.report_actions SET effective_to = now() WHERE report_id = ${r.id} AND action IN ('suspension','ban') AND effective_to IS NULL`;
      // identity case (015): the fee kept on rejection is refunded once the appeal is upheld
      if (r.category === "identity_mismatch" && r.booking_id) {
        const p = await capturedPayment(tx, r.booking_id);
        const [done] = await tx`SELECT 1 FROM app.refunds WHERE booking_id = ${r.booking_id} AND status <> 'failed'`;
        if (p && !done) {
          const [f] = await tx`INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
                               VALUES (${p.id}, ${r.booking_id}, ${p.amount_minor}, 'organizer_cancel', 'requested', ${"appeal-" + r.booking_id}) RETURNING id`;
          appealRefunds.push(f.id);
        }
      }
    }
    await tx`UPDATE app.safety_reports SET status = 'closed' WHERE id = ${r.id}`;
    if (r.reported_user_id) {
      await notify(tx, r.reported_user_id, "APPEAL_DECISION", { case: r.case_ref, decision: action }, "email");
    }
    await audit(tx, admin.id, action, "safety_reports", r.id, "appeal_review");
    return { case_id: r.id, decision: action, status: "closed" };
  });
  for (const id of appealRefunds) await dispatchRefund(sql, ctx.psp, id);
  return json(200, out);
}

// ------------------------------------------------------------------ identity reviews (015)
// Bookings whose card name did not match the registered first name (or the member had no name). The venue stays hidden
// from her until approved. Reading the card names is recorded, like any access to sensitive data.
async function listIdentityReviews(ctx) {
  const { sql, keys, admin, url } = ctx;
  if (!ctx.cfg.cardNameCheck) return json(200, { reviews: [] });
  const status = ["pending", "approved", "rejected"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "pending";
  if (status === "pending") await runAiOpinions(sql, ctx, { limit: 10 }); // ask again for any Gemini could not answer before
  const rows = await sql`
    SELECT ir.id, ir.result, ir.status, ir.created_at, ir.decided_at, ir.decided_by_ai, ir.ai_same_name, ir.ai_card_gender, ir.ai_confidence,
           b.booking_ref, s.starts_at, u.display_name, u.status AS member_status, p.cardholder_name_enc
      FROM app.identity_reviews ir JOIN app.bookings b ON b.id = ir.booking_id JOIN app.event_sessions s ON s.id = b.session_id
      JOIN app.users u ON u.id = ir.user_id JOIN app.payments p ON p.id = ir.payment_id
     WHERE ir.status = ${status} ORDER BY (ir.ai_card_gender = 'male') DESC NULLS LAST, s.starts_at, ir.created_at LIMIT 100`;
  if (rows.length) await audit(sql, admin.id, "read_card_names", "identity_reviews", null, `${status}_${rows.length}`, ctx.ipTrunc);
  return json(200, { reviews: rows.map((r) => ({ id: r.id, booking_ref: r.booking_ref, starts_at: qa(r.starts_at), result: r.result, status: r.status,
    registered_name: r.display_name, card_name: r.cardholder_name_enc ? decrypt(keys.dataKey, r.cardholder_name_enc) : null,
    member_status: r.member_status, created_at: qa(r.created_at), decided_at: qa(r.decided_at), decided_by_ai: r.decided_by_ai,
    ai: r.ai_card_gender ? { same_name: r.ai_same_name, card_name_gender: r.ai_card_gender, confidence: Number(r.ai_confidence) } : null })) });
}

// approve: the venue shows (and its notice goes out if the session is already revealed).
// reject (owner's decision, 4 Nov): the booking is cancelled WITHOUT a refund and the account is suspended, recorded as a
// safety case about her (category identity_mismatch) so she sees it under "Decisions about you" and can appeal; an
// upheld appeal reactivates her and refunds the fee (appealDecision). Her other upcoming bookings are refunded.
async function decideIdentityReview(ctx) {
  const { sql, params, body, admin, keys } = ctx;
  requireUuid(params.id, "review_id");
  if (!ctx.cfg.cardNameCheck) fail(404, "NOT_FOUND");
  if (!["approve", "reject"].includes(body.decision)) fail(422, "VALIDATION_FAILED", [{ field: "decision" }]);
  const refunds = await sql.begin(async (tx) => {
    const [ir] = await tx`SELECT * FROM app.identity_reviews WHERE id = ${params.id} FOR UPDATE`;
    if (!ir) fail(404, "NOT_FOUND");
    if (ir.status !== "pending") fail(409, "CONFLICT", [{ status: ir.status }]);
    const [b] = await tx`SELECT * FROM app.bookings WHERE id = ${ir.booking_id} FOR UPDATE`;
    if (body.decision === "approve") {
      await tx`UPDATE app.identity_reviews SET status = 'approved', decided_by = ${admin.id}, decided_at = now() WHERE id = ${ir.id}`;
      await sendHeldVenueNotice(tx, b.id);
      await audit(tx, admin.id, "identity_review_approved", "bookings", b.id, ir.result);
      return [];
    }
    const t = await currentTable(tx, b.id);
    const [r] = await tx`
      INSERT INTO app.safety_reports (case_ref, reporter_user_id, reported_user_id, booking_id, table_id, category, timing, status)
      VALUES (app.next_case_ref(), NULL, ${ir.user_id}, ${b.id}, ${t ? t.id : null}, 'identity_mismatch', 'during', 'actioned')
      RETURNING *`;
    await tx`INSERT INTO app.report_actions (report_id, action, actor_id, effective_to, rationale_enc)
             VALUES (${r.id}, 'suspension', ${admin.id}, now() + interval '30 days',
                     ${body.rationale ? encrypt(keys.dataKey, String(body.rationale)) : null})`;
    await tx`UPDATE app.bookings SET status = 'cancelled_by_organizer', cancelled_at = now(), cancel_actor = 'organizer',
                    cancel_reason_code = 'identity_rejected', hold_expires_at = NULL
              WHERE id = ${b.id} AND status IN ('paid_awaiting_group','group_locked','revealed')`;
    await tx`UPDATE app.users SET status = 'suspended' WHERE id = ${ir.user_id} AND status IN ('active','suspended')`;
    const refundIds = await cancelFutureBookings(tx, ir.user_id, "account_suspended");
    await tx`UPDATE app.identity_reviews SET status = 'rejected', decided_by = ${admin.id}, decided_at = now(), report_id = ${r.id} WHERE id = ${ir.id}`;
    await notify(tx, ir.user_id, "IDENTITY_DECISION", { ref: b.booking_ref, booking_id: b.id,
      appeal_until: new Date(Date.now() + 14 * 86400000).toISOString() });
    await audit(tx, admin.id, "identity_review_rejected", "bookings", b.id, ir.result);
    return refundIds;
  });
  for (const id of refunds) await dispatchRefund(sql, ctx.psp, id);
  return json(200, { id: params.id, status: body.decision === "approve" ? "approved" : "rejected" });
}

// ------------------------------------------------------------------ venue portal (016)
// Emails that may sign in to a venue's page; the venues planned for each session; the hosting requests and the
// messages (WhatsApp later: until then the coordinator copies them and marks them sent).
async function listVenueUsers(ctx) {
  requireUuid(ctx.params.id, "venue_id");
  const rows = await ctx.sql`SELECT id, email, status, last_login_at, created_at FROM app.venue_users WHERE venue_id = ${ctx.params.id} ORDER BY email`;
  return json(200, { users: rows.map((r) => ({ ...r, last_login_at: qa(r.last_login_at), created_at: qa(r.created_at) })) });
}

async function addVenueUser(ctx) {
  const { sql, params, body, admin } = ctx;
  requireUuid(params.id, "venue_id");
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) fail(422, "VALIDATION_FAILED", [{ field: "email" }]);
  const [v] = await sql`SELECT id FROM app.venues WHERE id = ${params.id}`;
  if (!v) fail(404, "NOT_FOUND");
  const [u] = await sql`
    INSERT INTO app.venue_users (venue_id, email, created_by) VALUES (${params.id}, ${email}, ${admin.id})
    ON CONFLICT (email) DO UPDATE SET status = 'active', updated_at = now() WHERE app.venue_users.venue_id = ${params.id}
    RETURNING id, email, status`;
  if (!u) fail(409, "CONFLICT", [{ field: "email", code: "USED_BY_ANOTHER_VENUE" }]);
  await audit(sql, admin.id, "venue_user_add", "venue_users", u.id, null);
  return json(201, u);
}

async function disableVenueUser(ctx) {
  const { sql, params, admin } = ctx;
  requireUuid(params.id, "venue_user_id");
  const rows = await sql`UPDATE app.venue_users SET status = 'disabled', updated_at = now() WHERE id = ${params.id} RETURNING id`;
  if (!rows.length) fail(404, "NOT_FOUND");
  await sql`UPDATE app.venue_portal_sessions SET revoked_at = now() WHERE venue_user_id = ${params.id} AND revoked_at IS NULL`;
  await audit(sql, admin.id, "venue_user_disable", "venue_users", params.id, null);
  return json(200, { id: params.id, status: "disabled" });
}

async function listSessionVenues(ctx) {
  requireUuid(ctx.params.id, "session_id");
  await ctx.sql`SELECT app.venue_requests_tick()`;
  const rows = await ctx.sql`
    SELECT sv.*, v.name FROM app.session_venues sv JOIN app.venues v ON v.id = sv.venue_id WHERE sv.session_id = ${ctx.params.id} ORDER BY v.name`;
  return json(200, { venues: rows.map(venueRequestView) });
}

async function planSessionVenue(ctx) {
  const { sql, params, body, admin } = ctx;
  requireUuid(params.id, "session_id");
  requireUuid(body.venue_id, "venue_id");
  const guests = Number(body.planned_guests);
  if (!Number.isInteger(guests) || guests < 4 || guests > 120) fail(422, "VALIDATION_FAILED", [{ field: "planned_guests" }]);
  const [s] = await sql`SELECT id, starts_at, status FROM app.event_sessions WHERE id = ${params.id}`;
  if (!s) fail(404, "SESSION_NOT_FOUND");
  if (new Date(s.starts_at) <= new Date() || ["cancelled", "completed"].includes(s.status)) fail(409, "CONFLICT");
  const [v] = await sql`SELECT id FROM app.venues WHERE id = ${body.venue_id} AND is_active`;
  if (!v) fail(422, "VALIDATION_FAILED", [{ field: "venue_id", code: "NOT_ACTIVE" }]);
  // planning again after a decline or withdrawal starts a fresh request
  await sql`
    INSERT INTO app.session_venues (session_id, venue_id, planned_guests, created_by) VALUES (${s.id}, ${v.id}, ${guests}, ${admin.id})
    ON CONFLICT (session_id, venue_id) DO UPDATE SET planned_guests = EXCLUDED.planned_guests, updated_at = now(),
      status = CASE WHEN app.session_venues.status IN ('declined','withdrawn') THEN 'pending' ELSE app.session_venues.status END,
      notified_at = CASE WHEN app.session_venues.status IN ('declined','withdrawn') THEN NULL ELSE app.session_venues.notified_at END,
      reminded_at = CASE WHEN app.session_venues.status IN ('declined','withdrawn') THEN NULL ELSE app.session_venues.reminded_at END,
      escalated_at = CASE WHEN app.session_venues.status IN ('declined','withdrawn') THEN NULL ELSE app.session_venues.escalated_at END,
      decided_at = CASE WHEN app.session_venues.status IN ('declined','withdrawn') THEN NULL ELSE app.session_venues.decided_at END`;
  await sql`SELECT app.venue_requests_tick()`; // inside 3 days: the request goes out now
  await audit(sql, admin.id, "session_venue_plan", "event_sessions", s.id, null);
  return listSessionVenues(ctx);
}

async function withdrawSessionVenue(ctx) {
  const { sql, params, admin } = ctx;
  requireUuid(params.id, "session_id");
  requireUuid(params.venue, "venue_id");
  const rows = await sql`UPDATE app.session_venues SET status = 'withdrawn', updated_at = now()
                          WHERE session_id = ${params.id} AND venue_id = ${params.venue} AND status <> 'withdrawn' RETURNING venue_id`;
  if (!rows.length) fail(404, "NOT_FOUND");
  await sql`UPDATE app.venue_outbox SET status = 'cancelled', updated_at = now()
             WHERE session_id = ${params.id} AND venue_id = ${params.venue} AND status = 'queued' AND kind IN ('request','reminder')`;
  await audit(sql, admin.id, "session_venue_withdraw", "event_sessions", params.id, null);
  return json(200, { status: "withdrawn" });
}

const venueRequestView = (r) => ({ session_id: r.session_id, venue_id: r.venue_id, venue: r.name, planned_guests: r.planned_guests,
  status: r.status, starts_at: qa(r.starts_at), notified_at: qa(r.notified_at), reminded_at: qa(r.reminded_at), escalated_at: qa(r.escalated_at),
  decided_at: qa(r.decided_at), decline_reason: r.decline_reason,
  needs_attention: r.status === "declined" || (r.status === "pending" && Boolean(r.escalated_at)) });

// The coordinator's view: upcoming requests, those needing attention (declined, or no answer after the reminder) first.
async function listVenueRequests(ctx) {
  await ctx.sql`SELECT app.venue_requests_tick()`;
  const rows = await ctx.sql`
    SELECT sv.*, v.name, s.starts_at FROM app.session_venues sv JOIN app.venues v ON v.id = sv.venue_id JOIN app.event_sessions s ON s.id = sv.session_id
     WHERE s.starts_at > now() - interval '6 hours' AND sv.status <> 'withdrawn'
     ORDER BY (sv.status = 'declined' OR (sv.status = 'pending' AND sv.escalated_at IS NOT NULL)) DESC, s.starts_at, v.name LIMIT 200`;
  return json(200, { requests: rows.map(venueRequestView) });
}

async function listVenueOutbox(ctx) {
  const { sql, cfg, url } = ctx;
  await sql`SELECT app.venue_requests_tick()`;
  const status = ["queued", "sent", "cancelled"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "queued";
  const rows = await sql`
    SELECT o.id, o.kind, o.status, o.created_at, o.sent_at, o.session_id, v.name AS venue, s.starts_at, sv.planned_guests, sv.decline_reason,
           (SELECT array_agg(c.name || ' ' || c.role) FROM app.venue_contacts c WHERE c.venue_id = v.id AND c.is_day_of_contact) AS contacts
      FROM app.venue_outbox o JOIN app.venues v ON v.id = o.venue_id JOIN app.event_sessions s ON s.id = o.session_id
      LEFT JOIN app.session_venues sv ON sv.session_id = o.session_id AND sv.venue_id = o.venue_id
     WHERE o.status = ${status} ORDER BY o.created_at LIMIT 200`;
  const link = `${cfg.webBaseUrl}/venue/`;
  return json(200, { messages: rows.map((r) => ({ id: r.id, kind: r.kind, to: isForCoordinator(r.kind) ? "coordinator" : "venue", venue: r.venue,
    status: r.status, created_at: qa(r.created_at), sent_at: qa(r.sent_at), starts_at: qa(r.starts_at),
    text: venueMessage(r.kind, { venue: r.venue, startsAt: r.starts_at, women: r.planned_guests, link, reason: r.decline_reason }) })) });
}

async function markVenueMessageSent(ctx) {
  const { sql, params, admin } = ctx;
  requireUuid(params.id, "message_id");
  const rows = await sql`UPDATE app.venue_outbox SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = ${params.id} AND status = 'queued' RETURNING id`;
  if (!rows.length) fail(409, "CONFLICT");
  await audit(sql, admin.id, "venue_message_sent_manually", "venue_outbox", params.id, null);
  return json(200, { id: params.id, status: "sent" });
}

// ------------------------------------------------------------------ call requests (017)
// Members who pressed "Request Call". The owner / ops see the first name and the number, and call her. Reading the numbers is
// recorded in the audit log. ?count=1 returns only how many are open (the menu badge): no numbers, nothing recorded.
async function listCallRequests(ctx) {
  const { sql, keys, admin, url } = ctx;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM app.call_requests WHERE status = 'requested'`;
  if (url.searchParams.get("count")) return json(200, { open_count: n });
  const status = ["requested", "called", "closed"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "requested";
  // when she wants the call: now, in 10 minutes, in an hour (counted from when she last sent it), or tomorrow (no hour)
  const rows = await sql`
    SELECT x.*, CASE x.callback_when WHEN 'now' THEN x.sent_at WHEN '10min' THEN x.sent_at + interval '10 minutes'
                                     WHEN '1h' THEN x.sent_at + interval '1 hour' END AS due_at FROM (
      SELECT cr.id, cr.status, cr.callback_when, cr.created_at, cr.handled_at, COALESCE(cr.updated_at, cr.created_at) AS sent_at, cr.submissions,
             cr.message_enc, cr.contact_phone_enc, u.display_name, u.phone_e164_enc, b.booking_ref, s.starts_at, a.name AS handled_by_name
        FROM app.call_requests cr JOIN app.users u ON u.id = cr.user_id
        LEFT JOIN app.bookings b ON b.id = cr.booking_id LEFT JOIN app.event_sessions s ON s.id = b.session_id
        LEFT JOIN app.admin_users a ON a.id = cr.handled_by WHERE cr.status = ${status}) x
     ORDER BY ${status === "requested" ? sql`(x.callback_when = 'tomorrow'), due_at ASC NULLS LAST, x.created_at` : sql`x.handled_at DESC NULLS LAST`} LIMIT 100`;
  if (rows.length) await audit(sql, admin.id, "read_call_requests", "call_requests", null, `${status}_${rows.length}`, ctx.ipTrunc);
  const dec = (v) => (v && v.length ? decrypt(keys.dataKey, v) : null);
  return json(200, { open_count: n, requests: rows.map((r) => ({ id: r.id, status: r.status, name: r.display_name,
    phone: dec(r.phone_e164_enc), contact_phone: dec(r.contact_phone_enc), message: dec(r.message_enc),
    callback_when: r.callback_when, due_at: qa(r.due_at), sent_at: qa(r.sent_at), submissions: r.submissions,
    booking_ref: r.booking_ref, starts_at: qa(r.starts_at), created_at: qa(r.created_at), handled_at: qa(r.handled_at), handled_by: r.handled_by_name })) });
}

// She was called (or the request needs no call any more): out of the open list.
async function handleCallRequest(ctx) {
  const { sql, params, body, admin } = ctx;
  requireUuid(params.id, "call_request_id");
  if (!["called", "closed"].includes(body.status)) fail(422, "VALIDATION_FAILED", [{ field: "status" }]);
  const rows = await sql`UPDATE app.call_requests SET status = ${body.status}, handled_by = ${admin.id}, handled_at = now()
                          WHERE id = ${params.id} AND status = 'requested' RETURNING id`;
  if (!rows.length) fail(409, "CONFLICT");
  await audit(sql, admin.id, `call_request_${body.status}`, "call_requests", params.id, null, ctx.ipTrunc);
  return json(200, { id: params.id, status: body.status });
}

// ------------------------------------------------------------------ approvals (maker-checker)
const APPROVER_ROLES = { table_cancel_quorum: ["owner"], booking_move: ["owner"], session_open_sale: ["owner"],
  refund_goodwill: ["owner", "finance"], case_ban: ["owner", "trust_safety"] };

async function listApprovals(ctx) {
  const rows = await ctx.sql`
    SELECT a.*, p.name AS proposed_by_name, p.role AS proposed_by_role FROM app.admin_approvals a JOIN app.admin_users p ON p.id = a.proposed_by
     WHERE a.status = COALESCE(${ctx.url.searchParams.get("status")}::text, 'pending') ORDER BY a.created_at DESC LIMIT 100`;
  return json(200, { approvals: rows.map((a) => ({ id: a.id, action: a.action, payload: a.action === "case_ban" ? { report_id: a.payload.report_id } : a.payload,
    status: a.status, proposed_by: { id: a.proposed_by, name: a.proposed_by_name, role: a.proposed_by_role }, created_at: qa(a.created_at),
    can_approve: APPROVER_ROLES[a.action].includes(ctx.admin.role) && a.proposed_by !== ctx.admin.id, error: a.error })) });
}

async function decideApproval(ctx, approve) {
  const { sql, params, admin, keys, cfg } = ctx;
  requireUuid(params.id, "approval_id");
  const [a] = await sql`SELECT * FROM app.admin_approvals WHERE id = ${params.id}`;
  if (!a || a.status !== "pending") fail(404, "NOT_FOUND");
  if (!APPROVER_ROLES[a.action].includes(admin.role) || a.proposed_by === admin.id) fail(403, "APPROVAL_NOT_ALLOWED");
  if (!approve) {
    await sql`UPDATE app.admin_approvals SET status = 'rejected', approved_by = ${admin.id}, decided_at = now() WHERE id = ${a.id}`;
    await audit(sql, admin.id, "approval_rejected", "admin_approvals", a.id, a.action);
    return json(200, { id: a.id, status: "rejected" });
  }
  const p = a.payload;
  let refundsToSend = [];
  try {
    const result = await sql.begin(async (tx) => {
      let res;
      if (a.action === "table_cancel_quorum") res = await cancelQuorumNow(tx, p.table_id, admin.id, cfg.rebookChoiceHours);
      else if (a.action === "booking_move") res = await moveBookingNow(tx, p, admin.id);
      else if (a.action === "session_open_sale") res = await openSaleNow(tx, p.session_id, admin.id);
      else if (a.action === "refund_goodwill") {
        const pay = await capturedPayment(tx, p.booking_id);
        if (!pay) fail(409, "CONFLICT", [{ reason: "no captured payment" }]);
        const [r] = await tx`INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, status, initiated_by, approved_by, idempotency_key)
                             VALUES (${pay.id}, ${p.booking_id}, ${p.amount_minor}, 'goodwill', 'requested', ${a.proposed_by}, ${admin.id}, ${"gw-" + a.id}) RETURNING id`;
        refundsToSend = [r.id];
        res = { refund_id: r.id };
      } else if (a.action === "case_ban") {
        res = await banNow(tx, p.report_id, a.proposed_by, admin.id, keys, p.rationale);
        refundsToSend = res.refunds;
      }
      await tx`UPDATE app.admin_approvals SET status = 'approved', approved_by = ${admin.id}, decided_at = now(), result = ${tx.json(res)} WHERE id = ${a.id}`;
      await audit(tx, admin.id, "approval_approved", "admin_approvals", a.id, a.action);
      return res;
    });
    for (const id of refundsToSend) await dispatchRefund(sql, ctx.psp, id);
    return json(200, { id: a.id, status: "approved", result });
  } catch (e) {
    const msg = String(e.code || e.message || e).slice(0, 300);
    await sql`UPDATE app.admin_approvals SET status = 'failed', approved_by = ${admin.id}, decided_at = now(), error = ${msg} WHERE id = ${a.id}`;
    throw e;
  }
}

// ------------------------------------------------------------------ support cases (Q07), audit, config
async function supportCases(ctx) {
  const rows = await ctx.sql`
    SELECT c.id, c.type, c.status, c.created_at, u.display_name, u.locale FROM app.support_cases c JOIN app.users u ON u.id = c.user_id
     ORDER BY (c.status IN ('resolved','closed')), c.created_at DESC LIMIT 200`;
  return json(200, { cases: rows.map((c) => ({ ...c, created_at: qa(c.created_at) })) });
}

async function updateSupportCase(ctx) {
  requireUuid(ctx.params.id, "case_id");
  if (!["in_progress", "waiting_user", "resolved", "closed"].includes(ctx.body.status)) fail(422, "VALIDATION_FAILED", [{ field: "status" }]);
  const rows = await ctx.sql`UPDATE app.support_cases SET status = ${ctx.body.status}, assigned_to = ${ctx.admin.id} WHERE id = ${ctx.params.id} RETURNING id, status`;
  if (!rows.length) fail(404, "NOT_FOUND");
  await audit(ctx.sql, ctx.admin.id, "support_case_update", "support_cases", ctx.params.id, ctx.body.status);
  return json(200, rows[0]);
}

async function auditLog(ctx) {
  const rows = await ctx.sql`SELECT a.*, u.name AS actor_name FROM app.audit_logs a LEFT JOIN app.admin_users u ON u.id = a.actor_id ORDER BY a.at DESC LIMIT 300`;
  return json(200, { entries: rows.map((r) => ({ at: qa(r.at), actor: r.actor_name || "system", action: r.action, entity: r.entity, entity_id: r.entity_id, reason_code: r.reason_code })) });
}

async function configView(ctx) {
  const rows = await ctx.sql`SELECT key, value, description FROM app.app_config ORDER BY key`;
  return json(200, { config: rows, key_source: ctx.keys.source });
}

// Promo codes (migration 012): owner-managed. Subscriptions are display-only for now, so codes are only checked by
// members, never redeemed; `uses` stays 0 until purchases exist.
const promoOut = (r) => ({ id: r.id, code: r.code, percent_off: r.percent_off, expires_at: qa(r.expires_at), max_uses: r.max_uses,
  uses: r.uses, is_active: r.is_active, created_at: qa(r.created_at) });

async function listPromoCodes(ctx) {
  const rows = await ctx.sql`SELECT * FROM app.promo_codes ORDER BY created_at DESC LIMIT 200`;
  return json(200, { promo_codes: rows.map(promoOut) });
}

async function createPromoCode(ctx) {
  const b = ctx.body || {};
  const code = String(b.code || "").trim().toUpperCase();
  const pct = Number(b.percent_off);
  const errs = [];
  if (!/^[A-Z0-9]{3,24}$/.test(code)) errs.push({ field: "code", code: "FORMAT" });
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) errs.push({ field: "percent_off", code: "RANGE" });
  const maxUses = b.max_uses === undefined || b.max_uses === null || b.max_uses === "" ? null : Number(b.max_uses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) errs.push({ field: "max_uses", code: "RANGE" });
  const expires = b.expires_at ? new Date(b.expires_at) : null;
  if (expires && (Number.isNaN(expires.getTime()) || expires <= new Date())) errs.push({ field: "expires_at", code: "FUTURE" });
  if (errs.length) fail(422, "VALIDATION_FAILED", errs);
  const [dupe] = await ctx.sql`SELECT 1 FROM app.promo_codes WHERE code = ${code}`;
  if (dupe) fail(409, "PROMO_CODE_EXISTS");
  const [r] = await ctx.sql`INSERT INTO app.promo_codes (code, percent_off, expires_at, max_uses, created_by)
                            VALUES (${code}, ${pct}, ${expires}, ${maxUses}, ${ctx.admin.id}) RETURNING *`;
  await audit(ctx.sql, ctx.admin.id, "promo_code_create", "promo_codes", r.id, `${pct}pct`);
  return json(201, promoOut(r));
}

async function deactivatePromoCode(ctx) {
  requireUuid(ctx.params.id, "promo_code_id");
  const rows = await ctx.sql`UPDATE app.promo_codes SET is_active = false WHERE id = ${ctx.params.id} RETURNING *`;
  if (!rows.length) fail(404, "NOT_FOUND");
  await audit(ctx.sql, ctx.admin.id, "promo_code_deactivate", "promo_codes", ctx.params.id, null);
  return json(200, promoOut(rows[0]));
}

const A = "/api/admin/v1";
export const adminRoutes = [
  { method: "POST", path: `${A}/auth/enroll`, auth: "none", handler: enroll },
  { method: "POST", path: `${A}/auth/login`, auth: "none", handler: login },
  { method: "POST", path: `${A}/auth/logout`, auth: "admin", handler: adminLogout },
  { method: "GET", path: `${A}/me`, auth: "admin", roles: ANY, handler: me },
  { method: "POST", path: `${A}/admins/{id}:enroll-token`, auth: "admin", roles: OWNER, handler: issueEnrollToken },
  { method: "GET", path: `${A}/sessions`, auth: "admin", roles: [...OPS, "analyst", "finance"], handler: listSessions },
  { method: "POST", path: `${A}/sessions`, auth: "admin", roles: OPS, handler: createSession },
  { method: "GET", path: `${A}/sessions/{id}`, auth: "admin", roles: [...OPS, "analyst"], handler: sessionDetail },
  { method: "POST", path: `${A}/sessions/{id}:open-sale`, auth: "admin", roles: OPS, handler: openSale },
  { method: "POST", path: `${A}/sessions/{id}/matching:dry-run`, auth: "admin", roles: [...OPS, "analyst"], handler: (ctx) => runFor(ctx, "dry_run") },
  { method: "POST", path: `${A}/sessions/{id}/matching:publish`, auth: "admin", roles: OPS, handler: (ctx) => runFor(ctx, "published") },
  { method: "POST", path: `${A}/sessions/{id}:reveal`, auth: "admin", roles: OPS, handler: reveal },
  { method: "POST", path: `${A}/sessions/{id}:complete`, auth: "admin", roles: OPS, handler: completeSession },
  { method: "POST", path: `${A}/tables/{id}:lock`, auth: "admin", roles: OPS, handler: lockTable },
  { method: "POST", path: `${A}/tables/{id}:cancel-quorum`, auth: "admin", roles: OPS, handler: cancelQuorum },
  { method: "POST", path: `${A}/tables/{id}:venue-confirmed`, auth: "admin", roles: OPS, handler: venueConfirmed },
  { method: "POST", path: `${A}/bookings/{id}:move`, auth: "admin", roles: OPS, handler: moveBooking },
  { method: "GET", path: `${A}/live/tonight`, auth: "admin", roles: OPS, handler: tonight },
  { method: "GET", path: `${A}/venues`, auth: "admin", roles: OPS, handler: listVenues },
  { method: "POST", path: `${A}/venues`, auth: "admin", roles: OPS, handler: createVenue },
  { method: "PATCH", path: `${A}/venues/{id}`, auth: "admin", roles: OPS, handler: updateVenue },
  { method: "GET", path: `${A}/venues/{id}/contacts`, auth: "admin", roles: OPS, handler: listContacts },
  { method: "POST", path: `${A}/venues/{id}/contacts`, auth: "admin", roles: OPS, handler: addContact },
  { method: "GET", path: `${A}/payments`, auth: "admin", roles: FIN, handler: listPayments },
  { method: "GET", path: `${A}/refunds`, auth: "admin", roles: FIN, handler: listRefunds },
  { method: "POST", path: `${A}/refund-batches:approve`, auth: "admin", roles: ["finance"], handler: approveBatch },
  { method: "POST", path: `${A}/refunds:auto-unresolved`, auth: "admin", roles: FIN, handler: autoRefundUnresolved },
  { method: "POST", path: `${A}/refunds:goodwill`, auth: "admin", roles: FIN, handler: proposeGoodwill },
  { method: "GET", path: `${A}/cases`, auth: "admin", roles: TS, handler: listCases },
  { method: "GET", path: `${A}/cases/{id}`, auth: "admin", roles: [...TS, "owner"], handler: caseDetail },
  { method: "POST", path: `${A}/cases/{id}:triage`, auth: "admin", roles: TS, handler: triage },
  { method: "POST", path: `${A}/cases/{id}/actions`, auth: "admin", roles: TS, handler: caseAction },
  { method: "POST", path: `${A}/cases/{id}/appeal-decision`, auth: "admin", roles: [...TS, "owner"], handler: appealDecision },
  { method: "GET", path: `${A}/identity-reviews`, auth: "admin", roles: [...TS, "owner"], handler: listIdentityReviews },
  { method: "GET", path: `${A}/venues/{id}/portal-users`, auth: "admin", roles: OPS, handler: listVenueUsers },
  { method: "POST", path: `${A}/venues/{id}/portal-users`, auth: "admin", roles: OPS, handler: addVenueUser },
  { method: "POST", path: `${A}/venue-portal-users/{id}:disable`, auth: "admin", roles: OPS, handler: disableVenueUser },
  { method: "GET", path: `${A}/sessions/{id}/venues`, auth: "admin", roles: OPS, handler: listSessionVenues },
  { method: "POST", path: `${A}/sessions/{id}/venues`, auth: "admin", roles: OPS, handler: planSessionVenue },
  { method: "DELETE", path: `${A}/sessions/{id}/venues/{venue}`, auth: "admin", roles: OPS, handler: withdrawSessionVenue },
  { method: "GET", path: `${A}/call-requests`, auth: "admin", roles: OPS, handler: listCallRequests },
  { method: "POST", path: `${A}/call-requests/{id}:handle`, auth: "admin", roles: OPS, handler: handleCallRequest },
  { method: "GET", path: `${A}/venue-requests`, auth: "admin", roles: OPS, handler: listVenueRequests },
  { method: "GET", path: `${A}/venue-outbox`, auth: "admin", roles: OPS, handler: listVenueOutbox },
  { method: "POST", path: `${A}/venue-outbox/{id}:sent`, auth: "admin", roles: OPS, handler: markVenueMessageSent },
  { method: "POST", path: `${A}/identity-reviews/{id}:decide`, auth: "admin", roles: [...TS, "owner"], handler: decideIdentityReview },
  { method: "GET", path: `${A}/approvals`, auth: "admin", roles: ANY, handler: listApprovals },
  { method: "POST", path: `${A}/approvals/{id}:approve`, auth: "admin", roles: ANY, handler: (ctx) => decideApproval(ctx, true) },
  { method: "POST", path: `${A}/approvals/{id}:reject`, auth: "admin", roles: ANY, handler: (ctx) => decideApproval(ctx, false) },
  { method: "GET", path: `${A}/support-cases`, auth: "admin", roles: OPS, handler: supportCases },
  { method: "PATCH", path: `${A}/support-cases/{id}`, auth: "admin", roles: OPS, handler: updateSupportCase },
  { method: "GET", path: `${A}/promo-codes`, auth: "admin", roles: OWNER, handler: listPromoCodes },
  { method: "POST", path: `${A}/promo-codes`, auth: "admin", roles: OWNER, handler: createPromoCode },
  { method: "POST", path: `${A}/promo-codes/{id}:deactivate`, auth: "admin", roles: OWNER, handler: deactivatePromoCode },
  { method: "GET", path: `${A}/audit`, auth: "admin", roles: OWNER, handler: auditLog },
  { method: "GET", path: `${A}/config`, auth: "admin", roles: OWNER, handler: configView },
];
