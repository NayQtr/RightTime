// NMX-63: the per-IP limits use the address the gateway saw (x-real-ip / cf-connecting-ip), never a client-supplied
// X-Forwarded-For, and an unreadable address shares one bucket instead of skipping the limit.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplate, client, startTestEnv } from "./helpers.mjs";

let env, call;
before(async () => { buildTemplate(); env = await startTestEnv(); call = client(env.base); });
after(async () => { await env.stop(); });

const phone = (i) => `+9745${String(5000000 + i)}`;

test("rotating a fake X-Forwarded-For does not get past the 20-per-hour OTP limit for one address", async () => {
  await env.sql`DELETE FROM app.otp_challenges`;
  const statuses = [];
  for (let i = 0; i < 21; i++) {
    const r = await call("POST", "/api/v1/auth/otp:request", { headers: { "x-forwarded-for": `203.0.${i}.9` }, body: { phone_e164: phone(i), locale: "ar" } });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses.slice(0, 20), Array(20).fill(202));
  assert.equal(statuses[20], 429);
});

test("an unreadable address is limited as one shared bucket, not skipped", async () => {
  await env.sql`DELETE FROM app.otp_challenges`;
  const statuses = [];
  for (let i = 0; i < 21; i++) {
    const r = await call("POST", "/api/v1/auth/otp:request", { headers: { "x-real-ip": "not-an-ip" }, body: { phone_e164: phone(100 + i), locale: "ar" } });
    statuses.push(r.status);
  }
  assert.equal(statuses.filter((s) => s === 429).length, 1, statuses.join(","));
  const [{ n }] = await env.sql`SELECT count(*)::int AS n FROM app.otp_challenges WHERE request_ip_trunc = '0.0.0.0'::inet`;
  assert.equal(n, 20);
});
