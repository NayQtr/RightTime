// Subscription plans (display-only) and promo codes (migration 012): plan prices from plans.js, owner-only code
// management, a member check that never reveals why a code fails, and a per-member limit against guessing.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, client, signUp, startTestEnv } from "./helpers.mjs";
import { PLANS, fmtQar, planPrices } from "../../web/plans.js";

let env, call, sql, owner, ops;

before(async () => {
  buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql;
  owner = await adminLogin(call, sql, "owner@example.test");
  ops = await adminLogin(call, sql, "ops.oncall@example.test");
});
after(async () => { await env.stop(); });

test("plan prices: QAR placeholders, struck-through full price, saving and price per week", () => {
  const by = Object.fromEntries(PLANS.map((p) => [p.id, planPrices(p)]));
  assert.deepEqual(by.m1, { price: 51.99, list: 51.99, full: 51.99, save: 0, perWeek: 13 });
  assert.deepEqual(by.m3, { price: 119.99, list: 119.99, full: 155.97, save: 23, perWeek: 10 });
  assert.deepEqual(by.m12, { price: 223.99, list: 223.99, full: 623.88, save: 64, perWeek: 4.67 });
  assert.equal(planPrices(PLANS[1], 10).price, 107.99, "a promo takes its percentage off the plan price");
  assert.equal(fmtQar(119.99, "ar"), "119.99 ر.ق");
  assert.equal(fmtQar(4.67, "en"), "QAR 4.67");
});

test("promo codes: only the owner manages them; codes are stored in capitals and must be unique", async () => {
  const denied = await call("POST", "/api/admin/v1/promo-codes", { token: ops.token, body: { code: "OPS10", percent_off: 10 } });
  assert.equal(denied.status, 403);
  const bad = await call("POST", "/api/admin/v1/promo-codes", { token: owner.token, body: { code: "a b", percent_off: 0 } });
  assert.equal(bad.status, 422);
  const c = await call("POST", "/api/admin/v1/promo-codes", { token: owner.token, body: { code: "welcome10", percent_off: 10 } });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.code, "WELCOME10");
  assert.equal((await call("POST", "/api/admin/v1/promo-codes", { token: owner.token, body: { code: "WELCOME10", percent_off: 20 } })).status, 409);
  const list = await call("GET", "/api/admin/v1/promo-codes", { token: owner.token });
  assert.ok(list.body.promo_codes.some((x) => x.code === "WELCOME10" && x.uses === 0 && x.is_active));
  const [a] = await sql`SELECT action FROM app.audit_logs WHERE entity_id = ${c.body.id}`;
  assert.equal(a.action, "promo_code_create");
});

test("promo check: valid code gives its percentage; unknown, expired, used-up and deactivated all just say invalid", async () => {
  const u = await signUp(call, { name: "Noor" });
  const check = (code) => call("POST", "/api/v1/promo-codes:check", { token: u.token, body: { code } });
  const mk = (body) => call("POST", "/api/admin/v1/promo-codes", { token: owner.token, body });
  const live = await mk({ code: "EID25", percent_off: 25 });
  const old = await mk({ code: "OLD15", percent_off: 15, expires_at: new Date(Date.now() + 3600000).toISOString() });
  await sql`UPDATE app.promo_codes SET expires_at = now() - interval '1 minute' WHERE id = ${old.body.id}`;
  const full = await mk({ code: "FULL5", percent_off: 5, max_uses: 1 });
  await sql`UPDATE app.promo_codes SET uses = 1 WHERE id = ${full.body.id}`;
  const off = await mk({ code: "OFF30", percent_off: 30 });
  assert.equal((await call("POST", `/api/admin/v1/promo-codes/${off.body.id}:deactivate`, { token: owner.token })).status, 200);

  assert.deepEqual((await check("eid25")).body, { valid: true, percent_off: 25 }, "case-insensitive");
  for (const code of ["NOPE", "OLD15", "FULL5", "OFF30"]) assert.deepEqual((await check(code)).body, { valid: false }, code);
  assert.equal((await call("POST", "/api/v1/promo-codes:check", { body: { code: "EID25" } })).status, 401, "members only");
  assert.equal(live.status, 201);
});

test("promo check: at most 10 checks per member per hour, so codes cannot be guessed", async () => {
  const u = await signUp(call, { name: "Huda" });
  for (let i = 0; i < 10; i += 1) assert.equal((await call("POST", "/api/v1/promo-codes:check", { token: u.token, body: { code: `TRY${i}X` } })).status, 200);
  const r = await call("POST", "/api/v1/promo-codes:check", { token: u.token, body: { code: "EID25" } });
  assert.equal(r.status, 429);
  assert.equal(r.body.code, "RATE_LIMITED");
});

test("NMX-63: 40 parallel promo checks still pass at most 10 per hour", async () => {
  const u = await signUp(call, { name: "Rana" });
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => call("POST", "/api/v1/promo-codes:check", { token: u.token, body: { code: `PAR${i}X` } })));
  assert.ok(rs.filter((r) => r.status === 200).length <= 10, `${rs.filter((r) => r.status === 200).length} passed`);
});
