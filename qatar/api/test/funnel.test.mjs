// Step counter (migration 021, item 44, provisional): off by default. Off: the clients are told so and nothing is stored
// even if a ping arrives. On (FUNNEL_COUNTER_ENABLED=true): one count per day, step and platform, and nothing that could
// identify anyone (no account, IP address, cookie, device id or time of day). The admin console shows the counts.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, client, startTestEnv } from "./helpers.mjs";
import { resetConfigCache } from "../src/lib/config.js";
import { FUNNEL_STEPS } from "../src/routes/funnel.js";

let off, on;
before(async () => {
  buildTemplate();
  resetConfigCache();
  off = await startTestEnv();
  off.call = client(off.base);
});
after(async () => { await off.stop(); if (on) await on.stop(); resetConfigCache(); });

const ping = (env, body, headers = {}) => env.call("POST", "/api/v1/funnel/steps", { body, idem: false, headers });

test("off by default: the clients are told, and a ping stores nothing", async () => {
  const [cfg] = await off.sql`SELECT value FROM app.app_config WHERE key = 'FUNNEL_COUNTER_ENABLED'`;
  assert.equal(cfg.value, "false");
  const c = await off.call("GET", "/api/v1/support/contact");
  assert.equal(c.body.funnel_counter, false);
  const r = await ping(off, { step: "signup_phone", platform: "web" });
  assert.equal(r.status, 204);
  assert.equal((await ping(off, { step: "made_up", platform: "toaster" })).status, 204, "nothing is even checked while off");
  assert.equal((await off.sql`SELECT count(*)::int AS n FROM app.funnel_daily`)[0].n, 0);
  assert.equal((await off.sql`SELECT count(*)::int AS n FROM app.idempotency_keys`)[0].n, 0, "no idempotency record (it would hold the address prefix)");
  const owner = await adminLogin(off.call, off.sql, "owner@example.test");
  const t = await off.call("GET", "/api/admin/v1/funnel", { token: owner.token });
  assert.equal(t.status, 200);
  assert.equal(t.body.enabled, false);
  assert.deepEqual(t.body.rows, []);
});

test("on: counts per day, step and platform only; unknown steps refused; the admin table shows them", async () => {
  await off.stop(); off = { stop: async () => {} };
  resetConfigCache();
  on = await startTestEnv({ FUNNEL_COUNTER_ENABLED: "true" });
  on.call = client(on.base);
  assert.equal((await on.call("GET", "/api/v1/support/contact")).body.funnel_counter, true);
  const signedIn = { authorization: "Bearer not-even-checked", "x-real-ip": "203.0.113.7", cookie: "id=abc" };
  for (const [step, platform, n] of [["signup_phone", "web", 3], ["signup_code", "web", 2], ["signup_phone", "ios", 1], ["booking_paid", "android", 1]])
    for (let i = 0; i < n; i++) assert.equal((await ping(on, { step, platform }, signedIn)).status, 204);
  const bad = await ping(on, { step: "made_up", platform: "toaster" });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.body.details.map((d) => d.field), ["step", "platform"]);

  const rows = await on.sql`SELECT * FROM app.funnel_daily ORDER BY step, platform`;
  const [{ today }] = await on.sql`SELECT to_char((now() AT TIME ZONE 'Asia/Qatar')::date, 'YYYY-MM-DD') AS today`;
  assert.deepEqual(rows.map((r) => [r.step, r.platform, r.count]), [["booking_paid", "android", 1], ["signup_code", "web", 2], ["signup_phone", "ios", 1], ["signup_phone", "web", 3]]);
  // the table has these columns and no other: nothing about who sent a ping, from where, or when in the day
  const cols = (await on.sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'funnel_daily' ORDER BY ordinal_position`).map((c) => c.column_name);
  assert.deepEqual(cols, ["day", "step", "platform", "count"]);
  assert.equal((await on.sql`SELECT count(*)::int AS n FROM app.idempotency_keys`)[0].n, 0);
  assert.equal((await on.sql`SELECT count(*)::int AS n FROM app.audit_logs WHERE ip_trunc = '203.0.113.0/24'`)[0].n, 0);

  const analyst = await on.sql`INSERT INTO app.admin_users (email, name, role, status, mfa_enabled) VALUES ('analyst@example.test', 'Analyst', 'analyst', 'active', true) RETURNING id`;
  assert.ok(analyst.length);
  const a = await adminLogin(on.call, on.sql, "analyst@example.test");
  const t = await on.call("GET", "/api/admin/v1/funnel?days=7", { token: a.token });
  assert.equal(t.status, 200, JSON.stringify(t.body));
  assert.equal(t.body.enabled, true);
  assert.deepEqual(t.body.steps, FUNNEL_STEPS);
  assert.deepEqual(t.body.rows.find((r) => r.step === "signup_phone" && r.platform === "web"), { day: today, step: "signup_phone", platform: "web", count: 3 });
  const fin = await adminLogin(on.call, on.sql, "finance@example.test");
  assert.equal((await on.call("GET", "/api/admin/v1/funnel", { token: fin.token })).status, 403);
});
