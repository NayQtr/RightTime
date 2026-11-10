// Member engagement (migration 023, provisional, owner's request of 10 Nov):
// - "notify me when a session is available" (v0.3 E-LANG-1): one alert per member, independent of marketing consent,
//   answered once when a session in one of her languages goes on sale, then over;
// - reasons with a low rating (3 stars or less), kept with the rating and shown to coordinators;
// - a compensation code after a rating of 2 or less: suggested in the admin console, issued only by a coordinator who
//   types the discount, single use and for that member only, with a notification to her.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

const DAY = 86400000;
let env, call, sql, owner, ops;
const U = {};

async function newSession(language, days = 5) {
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: language,
    starts_at: new Date(Date.now() + days * DAY).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  return s.body.id;
}
const openSale = (id, token = owner.token) => call("POST", `/api/admin/v1/sessions/${id}:open-sale`, { token });
const notes = async (u, key) => (await call("GET", "/api/v1/notifications", { token: u.token })).body.notifications.filter((n) => n.template_key === key);

before(async () => {
  buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql;
  owner = await adminLogin(call, sql, "owner@example.test");
  ops = await adminLogin(call, sql, "ops.oncall@example.test");
});
after(async () => { await env.stop(); });

// ===================================================================== notify me
test("notify me: one open alert per member, whatever her marketing consent; the sessions list says it is on", async () => {
  U.nora = await signUp(call, { name: "نورة", languages: ["lang_en"] });
  const [{ n: marketing }] = await sql`SELECT count(*)::int AS n FROM app.user_consents WHERE user_id = ${U.nora.userId} AND consent_type = 'marketing' AND granted`;
  assert.equal(marketing, 0, "no marketing consent");
  const before = await call("GET", "/api/v1/sessions", { token: U.nora.token });
  assert.equal(before.body.notify_me_active, false);
  const r = await call("POST", "/api/v1/session-alerts", { token: U.nora.token });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.active, true);
  assert.deepEqual(r.body.languages, ["en"]);
  const again = await call("POST", "/api/v1/session-alerts", { token: U.nora.token });
  assert.equal(again.status, 200, "pressing again keeps the same alert");
  assert.equal(again.body.created_at, r.body.created_at);
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.session_alerts WHERE user_id = ${U.nora.userId}`)[0].n, 1);
  assert.equal((await call("GET", "/api/v1/sessions", { token: U.nora.token })).body.notify_me_active, true);
  const noIdem = await call("POST", "/api/v1/session-alerts", { token: U.nora.token, idem: false });
  assert.equal(noIdem.status, 400, "a write needs an Idempotency-Key");
});

test("notify me: a session in another language changes nothing; one in hers sends one notification and ends the alert", async () => {
  U.huda = await signUp(call, { name: "هدى", languages: ["lang_ar", "lang_en"] }); // never asked: gets nothing
  U.other = await signUp(call, { name: "ريم", languages: ["lang_other"] });        // another language only
  assert.equal((await call("POST", "/api/v1/session-alerts", { token: U.other.token })).status, 201);
  const ar = await newSession("ar");
  const o1 = await openSale(ar);
  assert.equal(o1.status, 200, JSON.stringify(o1.body));
  assert.equal(o1.body.result.members_alerted, 0);
  assert.deepEqual(await notes(U.nora, "SESSION_AVAILABLE"), []);
  assert.equal((await call("GET", "/api/v1/sessions", { token: U.nora.token })).body.notify_me_active, true, "still waiting");

  const en = await newSession("en", 6);
  const o2 = await openSale(en);
  assert.equal(o2.body.result.members_alerted, 1);
  const [note] = await notes(U.nora, "SESSION_AVAILABLE");
  assert.ok(note, "she is told");
  assert.equal(note.text, "توفر موعد جديد بلغتك. احجزي مقعدك من «الرئيسية».");
  const [row] = await sql`SELECT channel, status FROM app.notifications_outbox WHERE user_id = ${U.nora.userId} AND template_key = 'SESSION_AVAILABLE'`;
  assert.equal(row.channel, "push", "the same row goes to her phone when she turned notifications on");
  const [alert] = await sql`SELECT notified_at, session_id FROM app.session_alerts WHERE user_id = ${U.nora.userId}`;
  assert.ok(alert.notified_at);
  assert.equal(alert.session_id, en);
  assert.equal((await call("GET", "/api/v1/sessions", { token: U.nora.token })).body.notify_me_active, false, "the alert is over");
  const en2 = await newSession("en", 7);
  assert.equal((await openSale(en2)).body.result.members_alerted, 0, "once per alert");
  assert.equal((await notes(U.nora, "SESSION_AVAILABLE")).length, 1);
  assert.deepEqual(await notes(U.huda, "SESSION_AVAILABLE"), [], "no alert, no notification");
  assert.deepEqual(await notes(U.other, "SESSION_AVAILABLE"), [], "no session in her language yet");
  // she can ask again after being told
  assert.equal((await call("POST", "/api/v1/session-alerts", { token: U.nora.token })).status, 201);
  const exp = (await call("GET", "/api/v1/users/me/export", { token: U.nora.token })).body;
  assert.equal(exp.session_alerts.length, 2);
  assert.ok(exp.session_alerts[0].notified_at && exp.session_alerts[1].notified_at === null);
});

test("notify me: a suspended member is skipped; an ops proposal approved by the owner also answers alerts (English text)", async () => {
  U.lina = await signUp(call, { name: "Lina", locale: "en", languages: ["lang_ar"] });
  U.sama = await signUp(call, { name: "سما", languages: ["lang_ar"] });
  for (const u of [U.lina, U.sama]) assert.equal((await call("POST", "/api/v1/session-alerts", { token: u.token })).status, 201);
  await sql`UPDATE app.users SET status = 'suspended' WHERE id = ${U.sama.userId}`;
  const ar = await newSession("ar", 8);
  const p = await openSale(ar, ops.token);
  assert.equal(p.status, 202, "ops proposes; the owner approves");
  const ap = await call("POST", `/api/admin/v1/approvals/${p.body.approval_id}:approve`, { token: owner.token });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  assert.equal(ap.body.result.members_alerted, 1);
  const [note] = (await call("GET", "/api/v1/notifications", { token: U.lina.token, locale: "en" })).body.notifications.filter((n) => n.template_key === "SESSION_AVAILABLE");
  assert.equal(note.text, "A new session in your language is open. Book your seat from Home.");
  assert.equal((await sql`SELECT notified_at FROM app.session_alerts WHERE user_id = ${U.sama.userId}`)[0].notified_at, null, "suspended: not told, still open");
  await sql`UPDATE app.users SET status = 'active' WHERE id = ${U.sama.userId}`;
});

test("notify me needs her answers first", async () => {
  const r1 = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97433123456", locale: "ar", purpose: "login" } });
  const r2 = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r1.body.challenge_id, code: r1.body.dev_code } });
  const legal = (await call("GET", "/api/v1/legal/current")).body;
  await call("POST", "/api/v1/users/me/registration", { token: r2.body.access_token, body: { display_name: "منى", locale: "ar", age_eligibility_confirmed: true, woman_confirmed: true,
    consents: ["terms", "conduct", "privacy_notice"].map((t) => ({ type: t, document_version: legal[t].document_version, granted: true })) } });
  const r = await call("POST", "/api/v1/session-alerts", { token: r2.body.access_token });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "QUESTIONNAIRE_INCOMPLETE");
});

// ===================================================================== ratings: reasons and compensation
async function finishedMeetup() {
  const id = await newSession("ar", 4);
  assert.equal((await openSale(id)).status, 200);
  for (const name of ["فاطمة", "سارة", "دانة", "مريم"]) {
    const u = await signUp(call, { name });
    const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: id } });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal((await payViaMock(call, await checkoutUrlFor(call, u.token, b.body))).status, 200);
    U[name] = { ...u, booking: b.body.booking_id };
  }
  assert.equal((await call("POST", `/api/admin/v1/sessions/${id}/matching:publish`, { token: owner.token, body: { seed: 3 } })).status, 201);
  const det = (await call("GET", `/api/admin/v1/sessions/${id}`, { token: owner.token })).body;
  assert.equal((await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:lock`, { token: owner.token })).status, 200);
  // the meetup ended a minute ago (every session timestamp moves together)
  const [s] = await sql`SELECT ends_at FROM app.event_sessions WHERE id = ${id}`;
  const shift = Date.now() - 60000 - new Date(s.ends_at).getTime();
  await sql`UPDATE app.event_sessions SET starts_at = starts_at + ${shift} * interval '1 millisecond', ends_at = ends_at + ${shift} * interval '1 millisecond',
            booking_opens_at = LEAST(booking_opens_at + ${shift} * interval '1 millisecond', now() - interval '30 days'),
            booking_closes_at = booking_closes_at + ${shift} * interval '1 millisecond', lock_at = lock_at + ${shift} * interval '1 millisecond',
            reveal_at = reveal_at + ${shift} * interval '1 millisecond', check_in_opens_at = check_in_opens_at + ${shift} * interval '1 millisecond'
            WHERE id = ${id}`;
}
const rate = (who, body) => call("POST", `/api/v1/bookings/${U[who].booking}/feedback`, { token: U[who].token, body: { comfort_rating: 3, ...body } });
const reasonsOf = async (who) => (await sql`SELECT low_rating_reasons FROM app.event_feedback WHERE booking_id = ${U[who].booking}`)[0].low_rating_reasons;

test("reasons: kept with 3 stars or less, in a fixed order; unknown reasons are refused; ignored above 3", async () => {
  await finishedMeetup();
  const bad = await rate("فاطمة", { overall_rating: 2, low_rating_reasons: ["venue", "rude_waiter"] });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.details.find((d) => d.field === "low_rating_reasons").code, "INVALID");
  const notList = await rate("فاطمة", { overall_rating: 2, low_rating_reasons: "venue" });
  assert.equal(notList.status, 422);
  assert.equal((await rate("فاطمة", { overall_rating: 2, low_rating_reasons: ["no_shows", "venue", "venue"], comment: "تأخر الطعام كثيرًا" })).status, 201);
  assert.deepEqual(await reasonsOf("فاطمة"), ["venue", "no_shows"]);
  assert.equal((await rate("سارة", { overall_rating: 3, low_rating_reasons: ["other"] })).status, 201);
  assert.deepEqual(await reasonsOf("سارة"), ["other"]);
  assert.equal((await rate("دانة", { overall_rating: 5, low_rating_reasons: ["venue"] })).status, 201);
  assert.equal(await reasonsOf("دانة"), null, "a 5-star rating keeps no reasons");
  assert.equal((await rate("مريم", { overall_rating: 1 })).status, 201);
  assert.equal(await reasonsOf("مريم"), null, "reasons stay optional");
  const exp = (await call("GET", "/api/v1/users/me/export", { token: U["فاطمة"].token })).body;
  assert.deepEqual(exp.ratings[0].low_rating_reasons, ["venue", "no_shows"]);
});

test("admin console: coordinators see the low ratings with reasons; 2 stars or less suggests compensation; the read is audited", async () => {
  const fin = await adminLogin(call, sql, "finance@example.test");
  assert.equal((await call("GET", "/api/admin/v1/feedback", { token: fin.token })).status, 403, "owner and ops only");
  const r = await call("GET", "/api/admin/v1/feedback", { token: ops.token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.low_rating_max, 3);
  assert.equal(r.body.compensation_max_rating, 2);
  assert.deepEqual(r.body.reasons, ["table_fit", "venue", "food_service", "organisation", "no_shows", "other"]);
  const by = Object.fromEntries(r.body.feedback.map((f) => [f.member, f]));
  assert.deepEqual(Object.keys(by).sort(), ["سارة", "فاطمة", "مريم"].sort(), "5 stars is not a low rating");
  assert.deepEqual(by["فاطمة"].low_rating_reasons, ["venue", "no_shows"]);
  assert.equal(by["فاطمة"].comment, "تأخر الطعام كثيرًا");
  assert.equal(by["فاطمة"].compensation_suggested, true);
  assert.equal(by["مريم"].compensation_suggested, true);
  assert.equal(by["سارة"].compensation_suggested, false, "3 stars: reasons shown, no compensation suggested");
  assert.equal(by["فاطمة"].compensation, null, "nothing is issued by itself");
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.promo_codes`)[0].n, 0);
  const all = await call("GET", "/api/admin/v1/feedback?scope=all", { token: ops.token });
  assert.ok(all.body.feedback.some((f) => f.member === "دانة" && f.overall_rating === 5));
  const audits = await sql`SELECT action, reason_code FROM app.audit_logs WHERE action = 'read_feedback' ORDER BY at`;
  assert.deepEqual(audits.map((a) => a.reason_code), ["low_3", "all_4"]);
});

test("compensation: the coordinator types the discount and approves in one click; the member alone can use the single-use code", async () => {
  const fb = Object.fromEntries((await call("GET", "/api/admin/v1/feedback", { token: ops.token })).body.feedback.map((f) => [f.member, f]));
  const give = (f, body) => call("POST", `/api/admin/v1/feedback/${f.id}:compensate`, { token: ops.token, body });
  assert.equal((await give(fb["فاطمة"], {})).status, 422, "no default figure: the amount is required");
  assert.equal((await give(fb["فاطمة"], { percent_off: 0 })).status, 422);
  assert.equal((await give(fb["فاطمة"], { percent_off: 101 })).status, 422);
  assert.equal((await give(fb["فاطمة"], { percent_off: 12.5 })).status, 422);
  assert.equal((await give(fb["سارة"], { percent_off: 20 })).status, 409, "3 stars is above the compensation threshold");
  const ok = await give(fb["فاطمة"], { percent_off: 15 });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.match(ok.body.code, /^HZ[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(ok.body.percent_off, 15);
  assert.equal((await give(fb["فاطمة"], { percent_off: 15 })).status, 409, "one code per rating");
  const [p] = await sql`SELECT * FROM app.promo_codes WHERE code = ${ok.body.code}`;
  assert.equal(p.user_id, U["فاطمة"].userId);
  assert.equal(p.max_uses, 1);
  assert.equal(p.feedback_id, fb["فاطمة"].id);
  assert.equal(p.created_by, ops.admin.id);
  const [note] = await notes(U["فاطمة"], "COMPENSATION_CODE");
  assert.equal(note.text, `نأسف لأن لقاءكِ لم يكن كما تمنّيتِ. هذا رمز خصم 15% لحجزكِ القادم: ${ok.body.code}`);
  // her code: valid for her, unknown for anyone else
  const mine = await call("POST", "/api/v1/promo-codes:check", { token: U["فاطمة"].token, body: { code: ok.body.code.toLowerCase() } });
  assert.deepEqual(mine.body, { valid: true, percent_off: 15 });
  const theirs = await call("POST", "/api/v1/promo-codes:check", { token: U["سارة"].token, body: { code: ok.body.code } });
  assert.deepEqual(theirs.body, { valid: false });
  // the console shows what was issued, by whom; the promo-code list marks it as one member's
  const after = (await call("GET", "/api/admin/v1/feedback", { token: owner.token })).body.feedback.find((f) => f.id === fb["فاطمة"].id);
  assert.equal(after.compensation_suggested, false);
  assert.equal(after.compensation.code, ok.body.code);
  assert.equal(after.compensation.issued_by, "Ops On-call");
  const promo = (await call("GET", "/api/admin/v1/promo-codes", { token: owner.token })).body.promo_codes.find((c) => c.code === ok.body.code);
  assert.equal(promo.member_only, true);
  const [a] = await sql`SELECT reason_code FROM app.audit_logs WHERE action = 'compensation_issued'`;
  assert.equal(a.reason_code, "15pct");
  // a suspended member is not compensated automatically or otherwise until active again
  await sql`UPDATE app.users SET status = 'suspended' WHERE id = ${U["مريم"].userId}`;
  assert.equal((await give(fb["مريم"], { percent_off: 10 })).status, 409);
  const exp = (await call("GET", "/api/v1/users/me/export", { token: U["فاطمة"].token })).body;
  assert.deepEqual(exp.discount_codes.map((c) => [c.code, c.percent_off, c.usable]), [[ok.body.code, 15, true]]);
});
