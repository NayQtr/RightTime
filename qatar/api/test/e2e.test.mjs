// End-to-end tests against the real HTTP server + PostgreSQL (all routes of v0.3 §3 and v0.4 C14).
// Steps share state and run in order; time is moved forward by rewriting session timestamps.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";
import { signWebhook } from "../src/services/psp.js";

let env, call, sql;
const S = {};   // shared state across steps
const DAY = 86400000, H = 3600000;
const SEEDED = (n) => `00000000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  sql = env.sql;
});
after(async () => { await env.stop(); });

async function newSession({ admin, startsInDays = 4, language = "ar", district = ["الدفنة", "Dafna"] }) {
  const r = await call("POST", "/api/admin/v1/sessions", { token: admin, body: { experience: "dinner", conversation_language: language,
    starts_at: new Date(Date.now() + startsInDays * DAY).toISOString(), duration_minutes: 120, max_seats: 18,
    district_hint_ar: district[0], district_hint_en: district[1] } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const o = await call("POST", `/api/admin/v1/sessions/${r.body.id}:open-sale`, { token: S.owner.token });
  assert.equal(o.status, 200, JSON.stringify(o.body));
  return r.body.id;
}

async function bookAndPay(token, sessionId, extra = {}) {
  const b = await call("POST", "/api/v1/bookings", { token, body: { session_id: sessionId, ...extra } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  const p = await payViaMock(call, b.body.checkout_url);
  assert.equal(p.status, 200, JSON.stringify(p.body));
  return b.body;
}

// time travel: shift every timestamp of a session so that `field` is `deltaMs` from now (order constraints preserved)
async function moveSession(id, field, deltaMs) {
  const [s] = await sql`SELECT * FROM app.event_sessions WHERE id = ${id}`;
  const shift = Date.now() + deltaMs - new Date(s[field]).getTime();
  await sql`UPDATE app.event_sessions SET starts_at = starts_at + ${shift} * interval '1 millisecond', ends_at = ends_at + ${shift} * interval '1 millisecond',
            booking_opens_at = LEAST(booking_opens_at + ${shift} * interval '1 millisecond', now() - interval '1 day'),
            booking_closes_at = booking_closes_at + ${shift} * interval '1 millisecond', lock_at = lock_at + ${shift} * interval '1 millisecond',
            reveal_at = reveal_at + ${shift} * interval '1 millisecond', check_in_opens_at = check_in_opens_at + ${shift} * interval '1 millisecond'
            WHERE id = ${id}`;
}

// ===================================================================== auth & registration
test("OTP: phone validation, dev code, wrong code, rate limit, verify", async () => {
  assert.equal((await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+447700900123", locale: "en" } })).body.code, "UNSUPPORTED_COUNTRY");
  assert.equal((await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97412", locale: "ar" } })).body.code, "INVALID_PHONE");
  assert.equal((await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455501234" }, idem: false })).body.code, "IDEMPOTENCY_KEY_REQUIRED");
  const r1 = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455501234", locale: "ar", purpose: "login" } });
  assert.equal(r1.status, 202);
  assert.match(r1.body.dev_code, /^[0-9]{6}$/);
  const again = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455501234", locale: "ar" } });
  assert.equal(again.status, 429);
  assert.ok(Number(again.headers.get("retry-after")) > 0);
  const wrong = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r1.body.challenge_id, code: r1.body.dev_code === "000000" ? "111111" : "000000" } });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.details[0].attempts_remaining, 4);
  const ok = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r1.body.challenge_id, code: r1.body.dev_code } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.is_new, true);
  assert.equal(ok.body.user.registration_status, "consents_required");
  assert.equal((await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r1.body.challenge_id, code: r1.body.dev_code } })).status, 410);
  S.first = { token: ok.body.access_token, refresh: ok.body.refresh_token };
  // phone stored encrypted, not in clear
  const [u] = await sql`SELECT phone_e164_enc FROM app.users WHERE id = ${ok.body.user.id}`;
  assert.ok(!Buffer.from(u.phone_e164_enc).toString("latin1").includes("55501234"));
});

test("registration gate, consents, idempotent replay, refresh rotation", async () => {
  const blocked = await call("GET", "/api/v1/sessions", { token: S.first.token });
  assert.equal(blocked.body.code, "REGISTRATION_INCOMPLETE");
  const legal = (await call("GET", "/api/v1/legal/current")).body;
  const base = { display_name: "سارة", locale: "ar", age_eligibility_confirmed: true };
  const cons = (types) => types.map((t) => ({ type: t, document_version: legal[t].document_version, granted: true }));
  assert.equal((await call("POST", "/api/v1/users/me/registration", { token: S.first.token, body: { ...base, consents: cons(["terms", "conduct"]) } })).body.code, "CONSENT_REQUIRED");
  assert.equal((await call("POST", "/api/v1/users/me/registration", { token: S.first.token, body: { ...base, age_eligibility_confirmed: false, consents: cons(["terms", "conduct", "privacy_notice"]) } })).body.code, "AGE_NOT_ELIGIBLE");
  const outdated = await call("POST", "/api/v1/users/me/registration", { token: S.first.token, body: { ...base, consents: [...cons(["terms", "conduct"]), { type: "privacy_notice", document_version: "privacy-old", granted: true }] } });
  assert.equal(outdated.body.code, "DOCUMENT_VERSION_OUTDATED");
  const body = { ...base, consents: [...cons(["terms", "conduct", "privacy_notice"]), { type: "marketing", document_version: legal.marketing.document_version, granted: false }] };
  const r = await call("POST", "/api/v1/users/me/registration", { token: S.first.token, idem: "reg-1", body });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.registration_status, "complete");
  const replay = await call("POST", "/api/v1/users/me/registration", { token: S.first.token, idem: "reg-1", body });
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get("idempotent-replayed"), "true");
  assert.equal((await call("POST", "/api/v1/users/me/registration", { token: S.first.token, idem: "reg-1", body: { ...body, display_name: "Other" } })).body.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal((await call("POST", "/api/v1/users/me/registration", { token: S.first.token, body })).body.code, "ALREADY_REGISTERED");
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM app.user_consents uc JOIN app.users u ON u.id = uc.user_id WHERE u.display_name = 'سارة' AND consent_type = 'marketing' AND NOT granted`;
  assert.equal(n, 1, "refused marketing consent is evidenced");
  const rt = await call("POST", "/api/v1/auth/token:refresh", { body: { refresh_token: S.first.refresh }, idem: false });
  assert.equal(rt.status, 200);
  assert.equal((await call("POST", "/api/v1/auth/token:refresh", { body: { refresh_token: S.first.refresh }, idem: false })).status, 401, "reuse rejected");
  assert.equal((await call("POST", "/api/v1/auth/token:refresh", { body: { refresh_token: rt.body.refresh_token }, idem: false })).status, 401, "family revoked after reuse");
});

// ===================================================================== questionnaire
test("questionnaire: v0.3 validation codes, Q07 private contact case, derived profile", async () => {
  const q = (await call("GET", "/api/v1/questionnaires/current", { token: S.first.token, locale: "en" })).body;
  assert.deepEqual(q.questions.map((x) => x.key), ["Q01", "Q04", "Q05", "Q06", "Q07", "Q08"]);
  assert.equal(q.questions[0].text, "In which language can you comfortably hold a full group conversation?");
  const opt = (key, ks) => { const qq = q.questions.find((x) => x.key === key); return { question_id: qq.id, option_ids: qq.options.filter((o) => ks.includes(o.key)).map((o) => o.id) }; };
  const bad = await call("POST", "/api/v1/questionnaire-responses", { token: S.first.token, body: { questionnaire_version_id: q.questionnaire_version_id, status: "submitted",
    answers: [opt("Q04", ["tier_1", "tier_2"]), opt("Q05", ["food", "travel", "sport", "tech"]), opt("Q06", ["no_pref", "opener_question"])] } });
  assert.equal(bad.status, 422);
  const codes = bad.body.details.map((d) => `${d.question_key}:${d.code}`).sort();
  assert.deepEqual(codes, ["Q01:REQUIRED_MISSING", "Q04:SINGLE_CHOICE_EXPECTED", "Q05:TOO_MANY_SELECTIONS", "Q06:EXCLUSIVE_OPTION_CONFLICT"]);
  const draft = await call("POST", "/api/v1/questionnaire-responses", { token: S.first.token, body: { questionnaire_version_id: q.questionnaire_version_id, status: "draft", answers: [opt("Q01", ["lang_ar"])] } });
  assert.equal(draft.status, 201);
  const ok = await call("POST", "/api/v1/questionnaire-responses", { token: S.first.token, body: { questionnaire_version_id: q.questionnaire_version_id, status: "submitted",
    answers: [opt("Q01", ["lang_ar"]), opt("Q04", ["tier_2"]), opt("Q05", ["food", "travel"]), opt("Q06", ["opener_question"]), opt("Q07", ["private_contact"]), opt("Q08", ["mutual_consent"])] } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.derived.conversation_languages, ["ar"]);
  assert.ok(ok.body.derived.private_contact_case_id);
  assert.deepEqual(ok.body.completeness, { required_answered: 2, required_total: 2, optional_answered: 4, optional_total: 4 });
  const [c] = await sql`SELECT type, notes_enc FROM app.support_cases WHERE id = ${ok.body.derived.private_contact_case_id}`;
  assert.equal(c.type, "practical_arrangement_Q07");
  assert.equal(c.notes_enc, null, "no Q07 details stored");
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM app.questionnaire_responses WHERE status = 'draft' AND id = ${draft.body.response_id}`;
  assert.equal(n, 0, "draft converted to the submitted response");
});

// ===================================================================== admin & sessions
test("admin MFA login, roles, maker-checker for opening a session", async () => {
  S.owner = await adminLogin(call, sql, "owner@example.test");
  S.ops = await adminLogin(call, sql, "ops.oncall@example.test");
  S.fin = await adminLogin(call, sql, "finance@example.test");
  S.ts = await adminLogin(call, sql, "ts.primary@example.test");
  assert.equal(S.owner.admin.role, "owner");
  assert.equal((await call("POST", "/api/admin/v1/auth/login", { body: { email: "owner@example.test", totp_code: "000000" } })).status, 401);
  assert.equal((await call("GET", "/api/admin/v1/cases", { token: S.fin.token })).status, 403, "finance cannot see safety cases");
  assert.equal((await call("GET", "/api/admin/v1/sessions", { token: S.first.token })).status, 401, "user token is not an admin token");
  const r = await call("POST", "/api/admin/v1/sessions", { token: S.ops.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 4 * DAY).toISOString(), district_hint_ar: "لوسيل", district_hint_en: "Lusail", max_seats: 18 } });
  assert.equal(r.status, 201);
  const prop = await call("POST", `/api/admin/v1/sessions/${r.body.id}:open-sale`, { token: S.ops.token });
  assert.equal(prop.status, 202);
  assert.equal((await call("POST", `/api/admin/v1/approvals/${prop.body.approval_id}:approve`, { token: S.ops.token })).status, 403, "no self-approval");
  const ap = await call("POST", `/api/admin/v1/approvals/${prop.body.approval_id}:approve`, { token: S.owner.token });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  S.s1 = r.body.id;
  S.s3 = await newSession({ admin: S.ops.token, startsInDays: 6, district: ["مشيرب", "Msheireb"] });
  S.sEn = await newSession({ admin: S.ops.token, startsInDays: 5, language: "en", district: ["الخليج الغربي", "West Bay"] });
});

// ===================================================================== booking & payment
test("sessions list, LANGUAGE_CONFLICT, booking hold, mock checkout decline then success, webhook dedupe & signature", async () => {
  const list = await call("GET", "/api/v1/sessions", { token: S.first.token });
  const mine = list.body.sessions.find((s) => s.id === S.s1);
  assert.equal(mine.language_match, true);
  assert.equal(mine.price.display, "59 ر.ق");
  assert.equal(list.body.sessions.find((s) => s.id === S.sEn).language_match, false);
  assert.equal((await call("POST", "/api/v1/bookings", { token: S.first.token, body: { session_id: S.sEn } })).body.code, "LANGUAGE_CONFLICT");
  const body = { session_id: S.s1, alternate_session_ids: [S.s3] };
  const b = await call("POST", "/api/v1/bookings", { token: S.first.token, idem: "book-1", body });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(b.body.status, "payment_pending");
  assert.match(b.body.ref, /^RT-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal((await call("POST", "/api/v1/bookings", { token: S.first.token, idem: "book-1", body })).body.booking_id, b.body.booking_id, "replay");
  assert.equal((await call("POST", "/api/v1/bookings", { token: S.first.token, body })).body.code, "ALREADY_BOOKED");
  // decline
  assert.equal((await payViaMock(call, b.body.checkout_url, "declined")).status, 200);
  let g = await call("GET", `/api/v1/bookings/${b.body.booking_id}`, { token: S.first.token });
  assert.equal(g.body.status, "payment_pending");
  assert.equal(g.body.payment.status, "failed");
  assert.equal(g.body.payment.failure_code, "declined");
  const co = await call("POST", `/api/v1/bookings/${b.body.booking_id}/checkout`, { token: S.first.token });
  assert.equal(co.status, 200);
  assert.notEqual(co.body.checkout_url, b.body.checkout_url, "new payment intent after a failure");
  assert.equal((await payViaMock(call, co.body.checkout_url, "success")).status, 200);
  g = await call("GET", `/api/v1/bookings/${b.body.booking_id}`, { token: S.first.token });
  assert.equal(g.body.status, "paid_awaiting_group");
  assert.equal(g.body.payment.status, "succeeded");
  S.b1 = b.body.booking_id;
  // webhook: invalid signature rejected and stored as invalid; duplicate event ignored
  const raw = JSON.stringify({ id: "evt_forged", type: "payment.succeeded", data: { payment_intent: "pi_x", amount_minor: 5900, currency: "QAR" } });
  const forged = await fetch(`${env.base}/api/v1/payments/webhooks/test_psp`, { method: "POST", headers: { "content-type": "application/json", "x-signature": "00", "x-timestamp": String(Math.floor(Date.now() / 1000)) }, body: raw });
  assert.equal(forged.status, 401);
  const [{ n_invalid }] = await sql`SELECT count(*)::int AS n_invalid FROM app.payment_webhook_events WHERE NOT signature_valid`;
  assert.equal(n_invalid, 1);
  const [{ value: secret }] = await sql`SELECT value FROM app.server_keys WHERE name = 'PSP_WEBHOOK_SECRET'`;
  const [ev] = await sql`SELECT payload FROM app.payment_webhook_events WHERE event_type = 'payment.succeeded' AND signature_valid LIMIT 1`;
  const rawDup = JSON.stringify(ev.payload);
  const dup = await fetch(`${env.base}/api/v1/payments/webhooks/test_psp`, { method: "POST", headers: { "content-type": "application/json", ...signWebhook(secret, rawDup) }, body: rawDup });
  assert.deepEqual(await dup.json(), { received: true, duplicate: true });
  const stale = await fetch(`${env.base}/api/v1/payments/webhooks/test_psp`, { method: "POST", headers: { "content-type": "application/json", ...signWebhook(secret, rawDup, Math.floor(Date.now() / 1000) - 600) }, body: rawDup });
  assert.equal(stale.status, 401, "timestamp outside ±5 min");
});

test("E-PAY-5: payment after the hold expired is refunded automatically", async () => {
  const u = await signUp(call, { name: "Late" });
  const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: S.s3 } });
  await sql`UPDATE app.bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ${b.body.booking_id}`;
  await sql`SELECT app.release_expired_holds()`;
  assert.equal((await payViaMock(call, b.body.checkout_url)).status, 200);
  const [r] = await sql`SELECT r.reason, r.status, p.status AS pay FROM app.refunds r JOIN app.payments p ON p.id = r.payment_id WHERE r.booking_id = ${b.body.booking_id}`;
  assert.deepEqual({ ...r }, { reason: "seat_unavailable", status: "refunded", pay: "refunded" });
});

// ===================================================================== matching, lock, reveal, day-of
test("12 paid in S1 -> dry-run + publish (2 x 6), phases forming -> locked -> revealed -> day_of with ETag", async () => {
  S.reported = await signUp(call, { name: "Omar", topics: ["sport", "tech"] });
  await bookAndPay(S.reported.token, S.s1);
  S.reporter = S.first;
  for (let i = 1; i <= 10; i++) await sql`SELECT sim.book_and_pay(${i}, ${S.s1})`;
  const ev0 = await call("GET", `/api/v1/bookings/${S.b1}/event-details`, { token: S.first.token });
  assert.equal(ev0.body.reveal.phase, "forming");
  assert.equal(ev0.body.table, null);
  assert.equal(ev0.body.venue, null);
  const dry = await call("POST", `/api/admin/v1/sessions/${S.s1}/matching:dry-run`, { token: S.ops.token, body: { rule_version: "r1-interest", seed: 7 } });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.summary.seated, 12);
  assert.deepEqual(dry.body.explanations.tables.map((t) => t.size), [6, 6]);
  assert.ok(dry.body.explanations.tables.every((t) => t.seats.every((x) => /^P-[0-9a-f]{8}$/.test(x))), "pseudonymous");
  const pub = await call("POST", `/api/admin/v1/sessions/${S.s1}/matching:publish`, { token: S.ops.token, body: { rule_version: "r1-interest", seed: 7 } });
  assert.equal(pub.status, 201);
  assert.equal(pub.body.inputs_hash, dry.body.inputs_hash, "same inputs + seed => same hash");
  const det = (await call("GET", `/api/admin/v1/sessions/${S.s1}`, { token: S.ops.token })).body;
  assert.deepEqual(det.tables.map((t) => t.confirmed_count), [6, 6]);
  S.tables = det.tables;
  for (const t of det.tables) assert.equal((await call("POST", `/api/admin/v1/tables/${t.id}:lock`, { token: S.ops.token })).status, 200);
  const ev1 = await call("GET", `/api/v1/bookings/${S.b1}/event-details`, { token: S.first.token });
  assert.equal(ev1.body.reveal.phase, "locked");
  assert.deepEqual(ev1.body.table, { confirmed_count: 6, capacity: 6 });
  assert.equal(ev1.body.venue, null, "no venue before reveal");
  assert.equal((await call("POST", `/api/admin/v1/sessions/${S.s1}:reveal`, { token: S.ops.token })).body.code, "REVEAL_TOO_EARLY");
  await moveSession(S.s1, "reveal_at", -60000);
  assert.equal((await call("POST", `/api/admin/v1/sessions/${S.s1}:reveal`, { token: S.ops.token })).body.revealed, 12);
  const ev2 = await call("GET", `/api/v1/bookings/${S.b1}/event-details`, { token: S.first.token });
  assert.equal(ev2.body.reveal.phase, "revealed");
  assert.match(ev2.body.table.code, /^T\d\d$/);
  assert.ok(ev2.body.venue.name.startsWith("TEST Venue"));
  assert.equal(ev2.body.table.members, undefined, "no names before day-of");
  const etag = ev2.headers.get("etag");
  assert.equal((await call("GET", `/api/v1/bookings/${S.b1}/event-details`, { token: S.first.token, headers: { "if-none-match": etag } })).status, 304);
  const notes = (await call("GET", "/api/v1/notifications", { token: S.first.token, locale: "en" })).body.notifications.map((n) => n.template_key);
  assert.ok(notes.includes("TABLE_LOCKED") && notes.includes("VENUE_REVEALED") && notes.includes("PAYMENT_CONFIRMED"));
  await moveSession(S.s1, "check_in_opens_at", -60000);
  const ev3 = await call("GET", `/api/v1/bookings/${S.b1}/event-details`, { token: S.first.token });
  assert.equal(ev3.body.reveal.phase, "day_of");
  assert.ok(ev3.body.table.members.length >= 3);
  assert.ok(ev3.body.table.members.every((m) => /^s_/.test(m.seat) && !("user_id" in m) && !("booking_id" in m)));
  assert.ok(ev3.body.actions.some((a) => a.type === "check_in"));
  const ci = await call("POST", `/api/v1/bookings/${S.b1}/check-in`, { token: S.first.token });
  assert.equal(ci.body.status, "checked_in");
  // other user's booking is invisible (no enumeration)
  assert.equal((await call("GET", `/api/v1/bookings/${S.b1}/event-details`, { token: S.reported.token })).body.code, "BOOKING_NOT_FOUND");
  S.ev3 = ev3.body;
});

// ===================================================================== Runbook B over the API
test("S1 report: 999 flag, interim block + suspension, P4 reason gate, ban by T&S + owner approval, appeal by owner", async () => {
  const reportedSeat = await (async () => {
    // the reported user must sit at the reporter's table for a seat token; find it or move the user there via the owner
    const [mine] = await sql`SELECT table_id FROM app.table_assignments WHERE booking_id = ${S.b1} AND is_current`;
    const [theirs] = await sql`SELECT a.table_id, b.id FROM app.table_assignments a JOIN app.bookings b ON b.id = a.booking_id WHERE b.user_id = ${S.reported.userId} AND a.is_current`;
    if (mine.table_id !== theirs.table_id) {
      const [swap] = await sql`SELECT a.booking_id FROM app.table_assignments a JOIN app.bookings b ON b.id = a.booking_id
                               WHERE a.table_id = ${mine.table_id} AND a.is_current AND b.id <> ${S.b1} LIMIT 1`;
      await sql`UPDATE app.table_assignments SET table_id = ${theirs.table_id} WHERE booking_id = ${swap.booking_id} AND is_current`;
      await sql`UPDATE app.table_assignments SET table_id = ${mine.table_id} WHERE booking_id = ${theirs.id} AND is_current`;
    }
    const ev = (await call("GET", `/api/v1/bookings/${S.b1}/event-details`, { token: S.first.token })).body;
    return ev.table.members.find((m) => m.display_name === "Omar").seat;
  })();
  const rep = await call("POST", "/api/v1/reports", { token: S.first.token, body: { booking_id: S.b1, reported_seat: reportedSeat,
    category: "harassment", timing: "during", immediate_danger: true, description: "He threatened me at the table." } });
  assert.equal(rep.status, 201, JSON.stringify(rep.body));
  assert.equal(rep.body.severity, 1, "immediate danger forces S1");
  assert.deepEqual(rep.body.emergency, { show: true, number: "999" });
  const [u] = await sql`SELECT status FROM app.users WHERE id = ${S.reported.userId}`;
  assert.equal(u.status, "suspended");
  const [{ n_block }] = await sql`SELECT count(*)::int AS n_block FROM app.blocked_pairs WHERE ${S.reported.userId} IN (user_a, user_b)`;
  assert.equal(n_block, 1);
  assert.equal((await call("GET", "/api/v1/sessions", { token: S.reported.token })).body.code, "ACCOUNT_SUSPENDED");
  const [enc] = await sql`SELECT description_enc FROM app.safety_reports WHERE case_ref = ${rep.body.case_ref}`;
  assert.ok(!Buffer.from(enc.description_enc).toString("latin1").includes("threatened"), "narrative encrypted at rest");
  // live board pins the incident (category only)
  const live = (await call("GET", "/api/admin/v1/live/tonight", { token: S.ops.token })).body;
  const pinned = live.tables.find((t) => t.incidents.open_s1_s2 > 0);
  assert.ok(pinned && pinned.alerts.some((a) => a.code === "open_s1_s2_incident"));
  assert.ok(!JSON.stringify(live).includes("threatened"));
  // T&S queue has no narrative; detail requires a reason and is audited
  const queue = (await call("GET", "/api/admin/v1/cases", { token: S.ts.token })).body.cases;
  const c = queue.find((x) => x.case_ref === rep.body.case_ref);
  assert.ok(c && !("description" in c));
  assert.equal((await call("GET", `/api/admin/v1/cases/${c.id}`, { token: S.ts.token })).status, 428);
  const detail = await call("GET", `/api/admin/v1/cases/${c.id}?reason=case_triage`, { token: S.ts.token });
  assert.equal(detail.body.case.description, "He threatened me at the table.");
  assert.equal((await call("GET", `/api/admin/v1/cases/${c.id}?reason=case_triage`, { token: S.owner.token })).status, 403, "owner has no default P4 access");
  assert.equal((await call("POST", `/api/admin/v1/cases/${c.id}:triage`, { token: S.ts.token, body: { status: "investigating" } })).status, 200);
  const prop = await call("POST", `/api/admin/v1/cases/${c.id}/actions`, { token: S.ts.token, body: { action: "ban", rationale: "confirmed by venue staff" } });
  assert.equal(prop.status, 202);
  assert.equal((await call("POST", `/api/admin/v1/approvals/${prop.body.approval_id}:approve`, { token: S.ts.token })).status, 403);
  assert.equal((await call("GET", `/api/admin/v1/cases/${c.id}?reason=second_approval`, { token: S.owner.token })).status, 200, "owner may read to approve a pending ban");
  const ap = await call("POST", `/api/admin/v1/approvals/${prop.body.approval_id}:approve`, { token: S.owner.token });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  const [u2] = await sql`SELECT status FROM app.users WHERE id = ${S.reported.userId}`;
  assert.equal(u2.status, "banned");
  // reported user: decision notice without reporter identity, then one appeal
  const notes = (await call("GET", "/api/v1/notifications", { token: S.reported.token, locale: "en" })).body.notifications;
  const decision = notes.find((n) => n.template_key === "CONDUCT_DECISION");
  assert.ok(decision && decision.text.includes("a permanent ban"));
  const [raw] = await sql`SELECT payload::text AS p FROM app.notifications_outbox WHERE user_id = ${S.reported.userId} AND template_key = 'CONDUCT_DECISION'`;
  assert.ok(!raw.p.includes(S.first.token) && !raw.p.includes("سارة"));
  const [reporterRow] = await sql`SELECT reporter_user_id FROM app.safety_reports WHERE case_ref = ${rep.body.case_ref}`;
  assert.ok(!raw.p.includes(reporterRow.reporter_user_id));
  const mine = (await call("GET", "/api/v1/cases/mine", { token: S.reported.token })).body.cases;
  assert.equal(mine[0].can_appeal, true);
  assert.equal((await call("POST", `/api/v1/cases/${rep.body.case_ref}/appeal`, { token: S.reported.token })).status, 202);
  assert.equal((await call("POST", `/api/admin/v1/cases/${c.id}/appeal-decision`, { token: S.ts.token, body: { decision: "rejected" } })).status, 403, "decider can never review");
  const fin = await call("POST", `/api/admin/v1/cases/${c.id}/appeal-decision`, { token: S.owner.token, body: { decision: "rejected", rationale: "evidence consistent" } });
  assert.equal(fin.status, 200, JSON.stringify(fin.body));
  const reads = await sql`SELECT reason_code FROM app.audit_logs WHERE action = 'read_p4' ORDER BY at`;
  assert.deepEqual(reads.map((r) => r.reason_code), ["case_triage", "second_approval"]);
  const [{ n_appeal }] = await sql`SELECT count(*)::int AS n_appeal FROM app.notifications_outbox WHERE user_id = ${S.reported.userId} AND template_key = 'APPEAL_DECISION'`;
  assert.equal(n_appeal, 1);
});

// ===================================================================== completion & feedback
test("complete session -> feedback with mutual-consent connections", async () => {
  await moveSession(S.s1, "ends_at", -60000);
  const done = await call("POST", `/api/admin/v1/sessions/${S.s1}:complete`, { token: S.ops.token });
  assert.equal(done.status, 200);
  const ev = (await call("GET", `/api/v1/bookings/${S.b1}/event-details`, { token: S.first.token })).body;
  assert.equal(ev.reveal.phase, "completed");
  assert.ok(ev.actions.some((a) => a.type === "feedback"));
  const seat = ev.table.members[0].seat;
  const fb = await call("POST", `/api/v1/bookings/${S.b1}/feedback`, { token: S.first.token, body: { overall_rating: 5, comfort_rating: 4, venue_rating: 4,
    would_book_again: true, comment: "lovely evening", connections: [{ seat, choice: true }] } });
  assert.equal(fb.status, 201, JSON.stringify(fb.body));
  assert.deepEqual(fb.body.mutual, [], "no match until the other side agrees");
  assert.equal((await call("POST", `/api/v1/bookings/${S.b1}/feedback`, { token: S.first.token, body: { overall_rating: 5, comfort_rating: 4 } })).body.code, "ALREADY_SUBMITTED");
});

// ===================================================================== Runbook A over the API
test("quorum failure: cancel-quorum via approval, rebook (fee transferred) or refund, finance batch, cancel rebooked within window", async () => {
  S.s2 = await newSession({ admin: S.ops.token, startsInDays: 3, district: ["الخليج الغربي", "West Bay"] });
  const A = await signUp(call, { name: "Amal" });
  const C = await signUp(call, { name: "Khalid" });
  const bA = await bookAndPay(A.token, S.s2, { alternate_session_ids: [S.s3] });
  const bC = await bookAndPay(C.token, S.s2, { alternate_session_ids: [S.s3] });
  for (const i of [11, 12, 13]) await sql`SELECT sim.book_and_pay(${i}, ${S.s2})`;
  assert.equal((await call("POST", `/api/admin/v1/sessions/${S.s2}/matching:publish`, { token: S.ops.token, body: { seed: 1 } })).status, 201);
  // two seeded members cancel at T-25h (late: no refund)
  await sql`UPDATE app.bookings SET status = 'cancelled_by_user', cancelled_at = now(), cancel_actor = 'user'
            WHERE session_id = ${S.s2} AND user_id IN (${SEEDED(11)}, ${SEEDED(12)})`;
  const det = (await call("GET", `/api/admin/v1/sessions/${S.s2}`, { token: S.ops.token })).body;
  assert.equal(det.tables[0].confirmed_count, 3);
  assert.equal((await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:lock`, { token: S.ops.token })).body.code, "TABLE_NOT_LOCKABLE");
  const prop = await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:cancel-quorum`, { token: S.ops.token });
  assert.equal(prop.status, 202, "ops needs owner approval");
  const ap = await call("POST", `/api/admin/v1/approvals/${prop.body.approval_id}:approve`, { token: S.owner.token });
  assert.equal(ap.body.result.bookings_cancelled, 3);
  const evA = (await call("GET", `/api/v1/bookings/${bA.booking_id}/event-details`, { token: A.token })).body;
  assert.equal(evA.reveal.phase, "cancelled");
  assert.equal(evA.resolution.default_if_no_choice, "refund");
  assert.equal(evA.resolution.options[0].sessions[0].session_id, S.s3, "Q02 alternate offered first");
  assert.ok((await call("GET", "/api/v1/notifications", { token: A.token })).body.notifications.some((n) => n.template_key === "QUORUM_FAIL_CHOICE"));
  // C rebooks into S3: no new charge
  const rb = await call("POST", `/api/v1/bookings/${bC.booking_id}/resolution`, { token: C.token, body: { choice: "rebook", session_id: S.s3 } });
  assert.equal(rb.status, 200, JSON.stringify(rb.body));
  assert.equal(rb.body.booking.status, "paid_awaiting_group");
  const [{ n_pay }] = await sql`SELECT count(*)::int AS n_pay FROM app.payments WHERE user_id = ${C.userId}`;
  assert.equal(n_pay, 1, "fee transferred, no second payment");
  assert.equal((await call("POST", `/api/v1/bookings/${bC.booking_id}/resolution`, { token: C.token, body: { choice: "refund" } })).body.code, "RESOLUTION_NOT_AVAILABLE");
  // A chooses refund -> finance batch -> refunded
  const rf = await call("POST", `/api/v1/bookings/${bA.booking_id}/resolution`, { token: A.token, body: { choice: "refund" } });
  assert.equal(rf.body.refund.status, "requested");
  // seeded member 13 makes no choice -> automatic refund after the deadline
  await sql`UPDATE app.bookings SET cancelled_at = now() - interval '49 hours' WHERE session_id = ${S.s2} AND user_id = ${SEEDED(13)}`;
  assert.equal((await call("POST", "/api/admin/v1/refunds:auto-unresolved", { token: S.fin.token })).body.created, 1);
  const pending = (await call("GET", "/api/admin/v1/refunds?status=requested", { token: S.fin.token })).body.refunds;
  assert.equal(pending.length, 2);
  assert.equal((await call("POST", "/api/admin/v1/refund-batches:approve", { token: S.ops.token, body: { refund_ids: pending.map((r) => r.id) } })).status, 403);
  const batch = await call("POST", "/api/admin/v1/refund-batches:approve", { token: S.fin.token, body: { refund_ids: pending.map((r) => r.id) } });
  assert.equal(batch.body.approved, 2);
  assert.ok(batch.body.refunds.every((r) => r.status === "refunded"));
  const evA2 = (await call("GET", `/api/v1/bookings/${bA.booking_id}/event-details`, { token: A.token, locale: "en" })).body;
  assert.equal(evA2.refund.status, "refunded");
  assert.equal(evA2.refund.amount.display, "QAR 59");
  assert.ok((await call("GET", "/api/v1/notifications", { token: A.token })).body.notifications.some((n) => n.template_key === "REFUND_DONE"));
  // C cancels the rebooked S3 booking > 48 h before start: full refund from the ORIGINAL payment (v0.4 C10 chain)
  const cx = await call("POST", `/api/v1/bookings/${rb.body.booking.id}/cancel`, { token: C.token, body: { reason_code: "schedule_changed" } });
  assert.equal(cx.status, 200, JSON.stringify(cx.body));
  assert.equal(cx.body.refund.eligible, true);
  assert.equal(cx.body.refund.status, "refunded");
  const [s2] = await sql`SELECT seats_sold FROM app.event_sessions WHERE id = ${S.s2}`;
  assert.equal(s2.seats_sold, 0);
  // late user cancellation (inside 48 h) gets no refund
  const L = await signUp(call, { name: "Noor" });
  const s4 = await newSession({ admin: S.ops.token, startsInDays: 5 });
  const bL = await bookAndPay(L.token, s4);
  await moveSession(s4, "starts_at", 30 * H);
  const late = await call("POST", `/api/v1/bookings/${bL.booking_id}/cancel`, { token: L.token, body: {} });
  assert.equal(late.body.refund.eligible, false);
});

test("SESSION_FULL with waitlist link, and venue + support-case admin views", async () => {
  const s = await newSession({ admin: S.ops.token, startsInDays: 8 });
  await sql`UPDATE app.event_sessions SET max_seats = 4 WHERE id = ${s}`;
  for (const i of [14, 15, 16, 17]) await sql`SELECT sim.book_and_pay(${i}, ${s})`;
  const W = await signUp(call, { name: "Huda" });
  const full = await call("POST", "/api/v1/bookings", { token: W.token, body: { session_id: s } });
  assert.equal(full.status, 409, JSON.stringify(full.body));
  assert.equal(full.body.code, "SESSION_FULL");
  assert.equal(full.body.waitlist_href, `/api/v1/sessions/${s}/waitlist`);
  const wl = await call("POST", `/api/v1/sessions/${s}/waitlist`, { token: W.token });
  assert.equal(wl.status, 201);
  assert.equal(wl.body.position, 1);
  const venues = (await call("GET", "/api/admin/v1/venues", { token: S.ops.token })).body.venues;
  assert.equal(venues.length, 3);
  const add = await call("POST", `/api/admin/v1/venues/${venues[0].id}/contacts`, { token: S.ops.token, body: { name: "Duty manager", phone_e164: "+97444441234", role: "manager", is_day_of_contact: true } });
  assert.equal(add.status, 201);
  const contacts = (await call("GET", `/api/admin/v1/venues/${venues[0].id}/contacts`, { token: S.ops.token })).body.contacts;
  assert.equal(contacts[0].phone_masked, "+974 •••• 1234");
  const bad = await call("PATCH", `/api/admin/v1/venues/${venues[0].id}`, { token: S.ops.token, body: { separate_bills_confirmed: false } });
  assert.equal(bad.status, 422, "a signed venue must keep separate bills");
  const cases = (await call("GET", "/api/admin/v1/support-cases", { token: S.ops.token })).body.cases;
  assert.ok(cases.some((c) => c.type === "practical_arrangement_Q07"));
  const audit = (await call("GET", "/api/admin/v1/audit", { token: S.owner.token })).body.entries.map((e) => e.action);
  for (const a of ["admin_login", "matching_publish", "table_lock", "read_p4", "sanction_ban", "refund_batch_approve", "approval_approved"]) assert.ok(audit.includes(a), a);
});

test("errors use the v0.3 problem envelope with localised messages", async () => {
  const r = await call("GET", "/api/v1/bookings/00000000-0000-0000-0000-000000000000", { token: S.first.token, locale: "en" });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, "BOOKING_NOT_FOUND");
  assert.equal(r.body.message, "Booking not found.");
  assert.match(r.body.request_id, /^req_/);
  assert.equal(r.headers.get("x-request-id"), r.body.request_id);
  const ar = await call("GET", "/api/v1/bookings/00000000-0000-0000-0000-000000000000", { token: S.first.token, locale: "ar" });
  assert.equal(ar.body.message, "الحجز غير موجود.");
  assert.equal((await call("GET", "/api/v1/nope")).status, 404);
  assert.equal((await call("GET", "/api/v1/sessions")).body.code, "UNAUTHENTICATED");
});
