// Account deletion is carried out (privacy notice; App Store 5.1.1(v), Google Play): a request starts 14 days in which
// signing in again cancels it; after that the number, name and answers are removed, the records the business keeps
// stay anonymous, and the number can sign up again as a new member.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplate, client, signInAgain, signUp, startTestEnv } from "./helpers.mjs";

let env, call, sql;
before(async () => { buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql; });
after(async () => { await env.stop(); });

const answersOf = async (userId) => (await sql`SELECT count(*)::int AS n FROM app.answers a JOIN app.questionnaire_responses r ON r.id = a.response_id
                                               WHERE r.user_id = ${userId}`)[0].n;

test("the request is dated; signing in again within 14 days cancels it", async () => {
  const a = await signUp(call, { name: "Lulwa" });
  assert.equal((await call("DELETE", "/api/v1/users/me", { token: a.token })).status, 202);
  const [u] = await sql`SELECT status, deletion_requested_at FROM app.users WHERE id = ${a.userId}`;
  assert.equal(u.status, "deletion_requested");
  assert.ok(u.deletion_requested_at, "request time recorded");

  const again = await signInAgain(call, sql, a.phone);
  const [v] = await sql`SELECT status, deletion_requested_at, display_name FROM app.users WHERE id = ${a.userId}`;
  assert.deepEqual([v.status, v.deletion_requested_at, v.display_name], ["active", null, "Lulwa"]);
  assert.equal((await call("GET", "/api/v1/users/me", { token: again.access_token })).status, 200);
});

test("after 14 days the number, name and answers are removed; the number can sign up again as someone new", async () => {
  const a = await signUp(call, { name: "Dana" });
  assert.ok((await answersOf(a.userId)) > 0);
  await call("DELETE", "/api/v1/users/me", { token: a.token });

  // not yet: day 13
  await sql`UPDATE app.users SET deletion_requested_at = now() - interval '13 days' WHERE id = ${a.userId}`;
  await sql`SELECT app.finalize_account_deletions()`;
  assert.equal((await sql`SELECT status FROM app.users WHERE id = ${a.userId}`)[0].status, "deletion_requested");

  // day 15
  await sql`UPDATE app.users SET deletion_requested_at = now() - interval '15 days' WHERE id = ${a.userId}`;
  const [{ n }] = await sql`SELECT app.finalize_account_deletions() AS n`;
  assert.ok(n >= 1);
  const [u] = await sql`SELECT status, display_name, octet_length(phone_e164_enc) AS enc, deleted_at FROM app.users WHERE id = ${a.userId}`;
  assert.deepEqual([u.status, u.display_name, u.enc], ["deleted", null, 0]);
  assert.ok(u.deleted_at);
  assert.equal(await answersOf(a.userId), 0, "questionnaire answers removed");
  assert.equal((await call("GET", "/api/v1/users/me", { token: a.token })).status, 401);

  // the same number signs up as a new member, with nothing of the old account
  const b = await signInAgain(call, sql, a.phone);
  const me = await call("GET", "/api/v1/users/me", { token: b.access_token });
  assert.equal(me.status, 200);
  assert.notEqual(me.body.user.id, a.userId);
  assert.equal(me.body.user.display_name ?? null, null);
});
