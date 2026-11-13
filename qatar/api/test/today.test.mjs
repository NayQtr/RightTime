// Admin "Today" and "Find" (owner-approved design study item 5, 13 Nov 2026, after Notion and Linear):
// - GET /api/admin/v1/today: counts of what waits, only for the sections the admin's role can open, each with the same
//   meaning of "open" as the list it links to
// - GET /api/admin/v1/find?q=: a booking reference opens its session (ops, analyst), a case reference opens the case
//   (trust & safety, owner); anything else, or a reference the role may not open, is 404 (nothing is revealed)
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

let env, call, sql, owner, ops, fin, ts, bookingRef, caseRef, sessionId, caseId;

before(async () => {
  env = await startTestEnv();
  call = client(env.base);
  sql = env.sql;
  owner = await adminLogin(call, sql, "owner@example.test");
  ops = await adminLogin(call, sql, "ops.oncall@example.test");
  fin = await adminLogin(call, sql, "finance@example.test");
  ts = await adminLogin(call, sql, "ts.primary@example.test");
  const s = await call("POST", "/api/admin/v1/sessions", { token: ops.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 5 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  sessionId = s.body.id;
  const m = await signUp(call, { name: "Huda" });
  const b = await call("POST", "/api/v1/bookings", { token: m.token, body: { session_id: s.body.id } });
  await payViaMock(call, await checkoutUrlFor(call, m.token, b.body));
  [{ booking_ref: bookingRef }] = await sql`SELECT booking_ref FROM app.bookings WHERE id = ${b.body.booking_id}`;
  const r = await call("POST", "/api/v1/reports", { token: m.token, body: { booking_id: b.body.booking_id, category: "fraud", timing: "after" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  caseRef = r.body.case_ref;
  [{ id: caseId }] = await sql`SELECT id FROM app.safety_reports WHERE case_ref = ${caseRef}`;
  const cr = await call("POST", "/api/v1/support/call-requests", { token: m.token, body: { message: "Please call me about my table", callback_when: "10min" } });
  assert.ok([200, 201].includes(cr.status), JSON.stringify(cr.body));
});
after(async () => { await env.stop(); });

const today = async (who) => call("GET", "/api/admin/v1/today", { token: who.token });

test("each role sees counts for its own sections only", async () => {
  const keys = async (who) => Object.keys((await today(who)).body.counts).sort();
  assert.deepEqual(await keys(ops), ["alerts", "approvals", "call_requests", "failed_notifications", "support", "tonight", "venue_requests"]);
  assert.deepEqual(await keys(fin), ["approvals", "refunds_check", "refunds_waiting"]);
  assert.deepEqual(await keys(ts), ["approvals", "cases", "identity"]);
  assert.deepEqual(await keys(owner), ["alerts", "approvals", "call_requests", "failed_notifications", "identity", "refunds_check", "refunds_waiting",
    "support", "tonight", "venue_requests"]);
  assert.equal((await call("GET", "/api/admin/v1/today")).status, 401);
});

test("the counts mean what the lists they open mean", async () => {
  const c = (await today(ops)).body.counts;
  assert.equal(c.call_requests, (await call("GET", "/api/admin/v1/call-requests?count=1", { token: ops.token })).body.open_count);
  assert.equal(c.call_requests, 1);
  assert.equal(c.failed_notifications, (await call("GET", "/api/admin/v1/notifications/failed?count=1", { token: ops.token })).body.open_count);
  const cases = (await call("GET", "/api/admin/v1/cases", { token: ts.token })).body.cases.filter((x) => !["closed", "closed_no_action"].includes(x.status));
  assert.equal((await today(ts)).body.counts.cases, cases.length);
  assert.ok(cases.length >= 1);
  // a refund that waits for finance is counted for finance, then no longer once it is approved
  const before = (await today(fin)).body.counts.refunds_waiting;
  await sql`INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, status, idempotency_key)
            SELECT p.id, p.booking_id, 100, 'organizer_cancel', 'requested', 'auto-oc-today-test' FROM app.payments p WHERE p.status = 'succeeded' LIMIT 1`;
  assert.equal((await today(fin)).body.counts.refunds_waiting, before + 1);
});

test("find: a booking reference opens its session, a case reference opens the case, for the roles that may open them", async () => {
  const find = (who, q) => call("GET", `/api/admin/v1/find?q=${encodeURIComponent(q)}`, { token: who.token });
  assert.deepEqual((await find(ops, bookingRef)).body, { kind: "booking", href: `#/sessions/${sessionId}` });
  assert.deepEqual((await find(ops, ` ${bookingRef.toLowerCase()} `)).body, { kind: "booking", href: `#/sessions/${sessionId}` }, "case and spaces do not matter");
  assert.deepEqual((await find(ts, caseRef)).body, { kind: "case", href: `#/cases/${caseId}` });
  assert.equal((await find(ops, caseRef)).status, 404, "ops cannot open a case: nothing is revealed");
  assert.equal((await find(ts, bookingRef)).status, 404, "trust & safety does not open sessions");
  assert.equal((await find(ops, "RT-NOPE00")).status, 404);
  assert.equal((await find(ops, "")).status, 422);
});
