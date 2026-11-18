// A suspension whose recorded end (report_actions.effective_to) has passed lifts itself on the every-minute tick.
// An open interim suspension (temporary_suspension with no end yet) always keeps the account suspended.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplate, client, signUp, startTestEnv } from "./helpers.mjs";
import { suspensionsTick } from "../src/services/suspensions.js";

let env, call, reporter;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  reporter = await signUp(call, { name: "Noor" });
});
after(async () => { await env?.stop(); });

async function suspendedWith(actions) {
  const m = await signUp(call, { name: "Sara" });
  const [r] = await env.sql`
    INSERT INTO app.safety_reports (case_ref, reporter_user_id, reported_user_id, category, timing, status)
    VALUES (app.next_case_ref(), ${reporter.userId}, ${m.userId}, 'harassment', 'after', 'actioned') RETURNING id`;
  for (const [action, to] of actions)
    await env.sql`INSERT INTO app.report_actions (report_id, action, actor_id, effective_to) VALUES (${r.id}, ${action}, NULL, ${to})`;
  await env.sql`UPDATE app.users SET status = 'suspended' WHERE id = ${m.userId}`;
  return m;
}
const status = async (m) => (await env.sql`SELECT status FROM app.users WHERE id = ${m.userId}`)[0].status;
const hourAgo = () => new Date(Date.now() - 3600000);
const tomorrow = () => new Date(Date.now() + 86400000);

test("an ended suspension reactivates the account, once, with an audit row and no actor", async () => {
  const m = await suspendedWith([["suspension", hourAgo()]]);
  assert.deepEqual(await suspensionsTick(env.sql), { reactivated: 1 });
  assert.equal(await status(m), "active");
  const logs = await env.sql`SELECT actor_id, reason_code FROM app.audit_logs WHERE action = 'suspension_expired' AND entity_id = ${m.userId}`;
  assert.equal(logs.length, 1);
  assert.deepEqual([logs[0].actor_id, logs[0].reason_code], [null, "auto_reactivate"]);
  assert.deepEqual(await suspensionsTick(env.sql), { reactivated: 0 }, "a second tick finds nothing to do");
});

test("a suspension still running, or an interim one still open, keeps the account suspended", async () => {
  const running = await suspendedWith([["suspension", tomorrow()]]);
  const interim = await suspendedWith([["suspension", hourAgo()], ["temporary_suspension", null]]);
  await suspensionsTick(env.sql);
  assert.equal(await status(running), "suspended", "the end date is still ahead");
  assert.equal(await status(interim), "suspended", "an S1 report under review never auto-lifts");
  // the decision closes the interim row (liftInterimSuspension sets effective_to = now()); then the tick lifts it
  await env.sql`UPDATE app.report_actions SET effective_to = now() - interval '1 minute' WHERE action = 'temporary_suspension' AND effective_to IS NULL`;
  assert.deepEqual(await suspensionsTick(env.sql), { reactivated: 1 });
  assert.equal(await status(interim), "active");
  assert.equal(await status(running), "suspended");
});
