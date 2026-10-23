// Audit F6: server keys at rest are encrypted with SERVER_KEYS_KEK; a wrong or missing KEK fails closed.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplate, client, startTestEnv } from "./helpers.mjs";
import { createApp } from "../src/app.js";
import { decrypt, Buffer } from "../src/lib/crypto.js";
import { kekFrom, resetKeyCache } from "../src/lib/keys.js";
import { resetConfigCache } from "../src/lib/config.js";

const KEK = "staging-kek-" + "x".repeat(40);
let env;
const plain = { DATA_KEY: "ab".repeat(32), PHONE_PEPPER: "pepper-plain", PSP_WEBHOOK_SECRET: "whsec-plain", SEAT_TOKEN_KEY: "seat-plain" };

before(async () => {
  buildTemplate();
  resetKeyCache(); resetConfigCache();
  env = await startTestEnv({ SERVER_KEYS_KEK: KEK });
});
after(async () => { resetKeyCache(); await env.stop(); });

const healthOf = async (getEnv) => {
  resetKeyCache();
  const app = createApp({ sql: env.sql, getEnv });
  const r = await app.handle(new Request("http://x/api/v1/health"));
  return { status: r.status, body: await r.json() };
};

test("existing plaintext keys are encrypted in place with the KEK and keep their values", async () => {
  // simulate the staging state before F6: keys stored in plaintext
  for (const [name, value] of Object.entries(plain)) {
    await env.sql`INSERT INTO app.server_keys (name, value) VALUES (${name}, ${value}) ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value`;
  }
  const h = await healthOf((k) => (k === "SERVER_KEYS_KEK" ? KEK : undefined));
  assert.deepEqual(h, { status: 200, body: { status: "ok", key_source: "db-encrypted" } });
  const rows = await env.sql`SELECT name, value FROM app.server_keys ORDER BY name`;
  assert.equal(rows.length, 5);
  for (const r of rows) assert.ok(r.value.startsWith("enc:v1:"), `${r.name} encrypted at rest`);
  const kek = kekFrom(KEK);
  for (const [name, value] of Object.entries(plain)) {
    const row = rows.find((x) => x.name === name);
    assert.equal(decrypt(kek, Buffer.from(row.value.slice(7), "base64")), value, `${name} keeps its value`);
  }
});

test("a wrong KEK fails closed and changes nothing; a missing KEK on encrypted keys fails closed", async () => {
  const before = await env.sql`SELECT name, value FROM app.server_keys ORDER BY name`;
  const wrong = await healthOf((k) => (k === "SERVER_KEYS_KEK" ? "a-different-secret-" + "y".repeat(40) : undefined));
  assert.equal(wrong.status, 500);
  const missing = await healthOf(() => undefined);
  assert.equal(missing.status, 500);
  const afterRows = await env.sql`SELECT name, value FROM app.server_keys ORDER BY name`;
  assert.deepEqual(afterRows.map((r) => r.value), before.map((r) => r.value), "keys never regenerated or overwritten");
  const ok = await healthOf((k) => (k === "SERVER_KEYS_KEK" ? KEK : undefined));
  assert.equal(ok.status, 200);
});

test("fresh keys are created encrypted, and the API works end to end with them", async () => {
  await env.sql`DELETE FROM app.server_keys`;
  resetKeyCache();
  const call = client(env.base);
  const ch = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455512399" } });
  assert.equal(ch.status, 202, JSON.stringify(ch.body));
  const v = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: ch.body.challenge_id, code: ch.body.dev_code } });
  assert.equal(v.status, 200);
  const me = await call("GET", "/api/v1/users/me", { token: v.body.access_token });
  assert.equal(me.status, 200);
  const rows = await env.sql`SELECT value FROM app.server_keys`;
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => r.value.startsWith("enc:v1:")));
  assert.equal((await call("GET", "/api/v1/health")).body.key_source, "db-encrypted");
});
