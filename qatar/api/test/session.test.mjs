// Sessions end at once (NMX-17, MASVS-AUTH): an access token stops working the moment its session is signed out,
// its refresh token is reused (theft signal), or the account is deleted; not 15 minutes later when it expires.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, client, signUp, startTestEnv } from "./helpers.mjs";

let env, call, sql;

before(async () => { buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql; });
after(async () => { await env.stop(); });

test("signing out ends that session's access token at once; another device's session keeps working", async () => {
  const a = await signUp(call, { name: "Noor" });
  // the same member on a second device
  await sql`UPDATE app.otp_challenges SET created_at = created_at - interval '1 hour'`; // past the resend wait
  const r1 = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: a.phone, locale: "ar" } });
  const r2 = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r1.body.challenge_id, code: r1.body.dev_code } });
  assert.equal(r2.status, 200);
  const other = r2.body.access_token;

  assert.equal((await call("GET", "/api/v1/users/me", { token: a.token })).status, 200);
  const out = await call("POST", "/api/v1/auth/logout", { token: a.token, body: { refresh_token: a.refresh } });
  assert.equal(out.status, 204);
  assert.equal((await call("GET", "/api/v1/users/me", { token: a.token })).status, 401, "signed-out access token is refused");
  assert.equal((await call("GET", "/api/v1/users/me", { token: other })).status, 200, "the other device stays signed in");
});

test("a refreshed session keeps working; reusing an old refresh token ends the whole session", async () => {
  const a = await signUp(call, { name: "Huda" });
  const r = await call("POST", "/api/v1/auth/token:refresh", { body: { refresh_token: a.refresh } });
  assert.equal(r.status, 200);
  assert.equal((await call("GET", "/api/v1/users/me", { token: r.body.access_token })).status, 200);
  assert.equal((await call("GET", "/api/v1/users/me", { token: a.token })).status, 200, "the older access token of the same session is still valid");
  const reuse = await call("POST", "/api/v1/auth/token:refresh", { body: { refresh_token: a.refresh } });
  assert.equal(reuse.status, 401);
  assert.equal((await call("GET", "/api/v1/users/me", { token: r.body.access_token })).status, 401, "reuse revokes every token of the session");
  assert.equal((await call("POST", "/api/v1/auth/token:refresh", { body: { refresh_token: r.body.refresh_token } })).status, 401);
});

test("deleting the account ends its sessions at once", async () => {
  const a = await signUp(call, { name: "Reem" });
  assert.equal((await call("DELETE", "/api/v1/users/me", { token: a.token })).status, 202);
  assert.equal((await call("GET", "/api/v1/users/me", { token: a.token })).status, 401);
});

test("an admin access token stops working when its session is revoked", async () => {
  const { token } = await adminLogin(call, sql, "owner@example.test");
  assert.equal((await call("GET", "/api/admin/v1/me", { token })).status, 200);
  await sql`UPDATE app.refresh_tokens SET revoked_at = now() WHERE subject_type = 'admin' AND revoked_at IS NULL`;
  assert.equal((await call("GET", "/api/admin/v1/me", { token })).status, 401);
});
