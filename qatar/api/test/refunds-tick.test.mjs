// Refunds that must never be lost or paid twice (B1/B2): a refund the server saved but never sent is sent by the
// every-minute tick; one waiting for finance is left alone; a PSP error is recorded, never swallowed; a refund whose
// outcome is unknown is never sent again and is reported once (Sentry) for finance; the mock PSP pays one key once.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";
import { dispatchRefund, refundsTick, REFUND_STUCK_AFTER_MINUTES } from "../src/services/payments.js";
import { testPsp } from "../src/services/psp.js";

let env, call, sql, payment;

before(async () => {
  env = await startTestEnv();
  call = client(env.base);
  sql = env.sql;
  const owner = await adminLogin(call, sql, "owner@example.test");
  const ops = await adminLogin(call, sql, "ops.oncall@example.test");
  const member = await signUp(call, { name: "Noor" });
  const s = await call("POST", "/api/admin/v1/sessions", { token: ops.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 5 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "الدفنة", district_hint_en: "Dafna" } });
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  const b = await call("POST", "/api/v1/bookings", { token: member.token, body: { session_id: s.body.id } });
  await payViaMock(call, await checkoutUrlFor(call, member.token, b.body));
  [payment] = await sql`SELECT * FROM app.payments WHERE booking_id = ${b.body.booking_id} AND status = 'succeeded'`;
  assert.ok(payment, "a paid booking to refund");
});
after(async () => { await env.stop(); });

// A refund row as the routes save it (status 'requested'), `minutes` old.
async function refund(key, { minutes = 10, approvedBy = null, status = "requested" } = {}) {
  const [r] = await sql`
    INSERT INTO app.refunds (payment_id, booking_id, amount_minor, reason, status, approved_by, idempotency_key)
    VALUES (${payment.id}, ${payment.booking_id}, 100, 'organizer_cancel', 'requested', ${approvedBy}, ${key}) RETURNING id`;
  if (status !== "requested") await sql`UPDATE app.refunds SET status = ${status} WHERE id = ${r.id}`;
  await sql`ALTER TABLE app.refunds DISABLE TRIGGER USER`;
  await sql`UPDATE app.refunds SET updated_at = now() - make_interval(mins => ${minutes}) WHERE id = ${r.id}`;
  await sql`ALTER TABLE app.refunds ENABLE TRIGGER USER`;
  return r.id;
}
const statusOf = async (id) => (await sql`SELECT status FROM app.refunds WHERE id = ${id}`)[0].status;
const audits = async (id, action) => (await sql`SELECT * FROM app.audit_logs WHERE entity = 'refunds' AND entity_id = ${id} AND action = ${action}`).length;
const dispatchCall = async () => {
  const [{ token }] = await sql`SELECT token FROM app.push_dispatch_token WHERE id = 1`;
  return call("POST", "/api/internal/push:dispatch", { body: {}, headers: { "x-dispatch-token": token } });
};
const failingPsp = (definite) => {
  const p = { calls: 0, async refund() { p.calls++; const e = new Error(definite ? "refund_declined" : "timeout"); e.definite = definite; throw e; } };
  return p;
};

test("the every-minute tick sends a refund that was saved but never sent; refunds waiting for finance stay as they are", async () => {
  const missed = await refund("ucx-missed-1");
  const fresh = await refund("ucx-fresh-1", { minutes: 1 }); // the route may still be sending it
  const choice = await refund("choice-refund-wait-1");
  const auto = await refund("auto-oc-wait-1");
  const approved = await refund("auto-oc-approved-1", { approvedBy: (await sql`SELECT id FROM app.admin_users LIMIT 1`)[0].id });
  const res = await dispatchCall();
  assert.equal(res.status, 200);
  assert.ok(res.body.refunds && res.body.refunds.resent >= 2, JSON.stringify(res.body.refunds));
  assert.equal(await statusOf(missed), "refunded");
  assert.equal(await statusOf(approved), "refunded");
  assert.equal(await statusOf(fresh), "requested");
  assert.equal(await statusOf(choice), "requested");
  assert.equal(await statusOf(auto), "requested");
});

test("a PSP error with an unknown outcome: recorded, left 'processing', never sent again, reported once after 30 minutes", async () => {
  const id = await refund("ucx-unknown-1", { minutes: 0 });
  const psp = failingPsp(false);
  assert.equal(await dispatchRefund(sql, psp, id), false);
  assert.equal(await statusOf(id), "processing");
  assert.equal(await audits(id, "refund_psp_error"), 1);
  assert.equal(await dispatchRefund(sql, psp, id), false); // a second send is refused before the PSP is called
  assert.equal(psp.calls, 1);

  const reports = [];
  const report = async (e) => { reports.push(e); return true; };
  await refundsTick(sql, psp, { report });
  assert.equal(reports.filter((e) => e.message.includes(id)).length, 0, "not reported before 30 minutes");
  await sql`ALTER TABLE app.refunds DISABLE TRIGGER USER`;
  await sql`UPDATE app.refunds SET updated_at = now() - make_interval(mins => ${REFUND_STUCK_AFTER_MINUTES + 1}) WHERE id = ${id}`;
  await sql`ALTER TABLE app.refunds ENABLE TRIGGER USER`;
  await refundsTick(sql, psp, { report });
  await refundsTick(sql, psp, { report });
  const mine = reports.filter((e) => e.message.includes(id));
  assert.equal(mine.length, 1, "reported once");
  assert.equal(mine[0].name, "RefundNeedsFinance");
  assert.match(mine[0].message, /do not send it again/);
  assert.equal(psp.calls, 1, "the tick never sends it again");
  assert.equal(await statusOf(id), "processing");
});

test("a refund the PSP refused: 'failed', recorded, reported once", async () => {
  const id = await refund("ucx-refused-1", { minutes: 0 });
  const psp = failingPsp(true);
  assert.equal(await dispatchRefund(sql, psp, id), false);
  assert.equal(await statusOf(id), "failed");
  assert.equal(await audits(id, "refund_psp_refused"), 1);
  const reports = [];
  await refundsTick(sql, psp, { report: async (e) => { reports.push(e); } });
  await refundsTick(sql, psp, { report: async (e) => { reports.push(e); } });
  assert.equal(reports.filter((e) => e.message.includes(id)).length, 1);
  assert.equal(psp.calls, 1);
});

test("the mock PSP pays one idempotency key once, as a real PSP must (the adapter contract)", async () => {
  const sent = [];
  const psp = testPsp({ keys: { pspWebhookSecret: "x" }, cfg: { webBaseUrl: "" }, deliver: async (raw) => { sent.push(JSON.parse(raw)); } });
  const r = { id: "00000000-0000-0000-0000-000000000001", amount_minor: 100, idempotency_key: "ucx-key-once-" + Date.now() };
  const a = await psp.refund(r, "pi_x");
  const b = await psp.refund(r, "pi_x");
  assert.equal(a, b);
  assert.equal(sent.length, 1);
});
