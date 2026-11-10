// Production with no SMS or email provider set up yet (OTP_DEV_MODE false): sign-in and the venue code answer 503 as
// before, the app reviewers' fixed number still works (item 11), and a safety report still raises its coordinator alert
// and answers 201 with no provider and no coordinator device (item 40): nothing breaks, the console shows the alert.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";
import { resetConfigCache } from "../src/lib/config.js";

const REVIEW = { phone: "+97455500888", code: "135790" };
let env, call, sql;

before(async () => {
  buildTemplate();
  env = await startTestEnv({ REVIEW_PHONE_E164: REVIEW.phone, REVIEW_OTP_CODE: REVIEW.code });
  call = client(env.base);
  sql = env.sql;
  await setDevMode(false); // as production
});
after(async () => { await env.stop(); });

// OTP_DEV_MODE through app_config (the server runs in this process, so its settings cache can be cleared from here)
async function setDevMode(on) {
  await sql`UPDATE app.app_config SET value = ${on ? "true" : "false"} WHERE key = 'OTP_DEV_MODE'`;
  resetConfigCache();
}

test("no SMS provider: 503 for every number but the reviewer's, who signs in with the fixed code", async () => {
  const r = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455501234" } });
  assert.equal(r.status, 503);
  assert.deepEqual(r.body.details, [{ reason: "no SMS provider configured" }]);
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.otp_challenges`)[0].n, 0);
  const rv = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: REVIEW.phone } });
  assert.equal(rv.status, 202, JSON.stringify(rv.body));
  assert.equal(rv.body.dev_code, undefined);
  const ok = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: rv.body.challenge_id, code: REVIEW.code } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test("no email provider: the venue code answers 503 and is never shown", async () => {
  const r = await call("POST", "/api/venue/v1/auth/code:request", { body: { email: "host@venue.test" }, idem: false });
  assert.equal(r.status, 503);
  assert.equal(r.body.dev_code, undefined);
});

test("coordinator alert with no provider and no device: the report answers 201, the alert waits in the console", async () => {
  // a member with a paid booking (staging's dev codes for this setup step only)
  await setDevMode(true);
  const owner = await adminLogin(call, sql, "owner@example.test");
  const M = await signUp(call, { name: "Reem" });
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 5 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "الدفنة", district_hint_en: "Dafna" } });
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  const b = await call("POST", "/api/v1/bookings", { token: M.token, body: { session_id: s.body.id } });
  await payViaMock(call, await checkoutUrlFor(call, M.token, b.body));
  await setDevMode(false);

  const rep = await call("POST", "/api/v1/reports", { token: M.token, body: { booking_id: b.body.booking_id, category: "threat_violence", timing: "during" } });
  assert.equal(rep.status, 201, JSON.stringify(rep.body));
  const [a] = await sql`SELECT * FROM app.coordinator_alerts`;
  assert.ok(a && a.paged_at, "raised and paged");
  assert.deepEqual([a.push_devices, a.push_delivered, a.sms_numbers, a.sms_delivered], [0, 0, 0, 0]);
  const [log] = await sql`SELECT reason_code FROM app.audit_logs WHERE action = 'coordinator_paged'`;
  assert.equal(log.reason_code, "push_0/0_sms_off", "the audit says what was sent: nothing");
  const list = await call("GET", "/api/admin/v1/coordinator-alerts", { token: owner.token });
  assert.equal(list.status, 200);
  assert.equal(list.body.alerts.length, 1);
  assert.deepEqual(list.body.channels, { push_devices: 0, sms: false, sms_numbers: 0 });
  // escalation with nobody to reach still completes, once
  await sql`UPDATE app.coordinator_alerts SET paged_at = paged_at - interval '6 minutes'`;
  const [{ token: dt }] = await sql`SELECT token FROM app.push_dispatch_token WHERE id = 1`;
  const d = await call("POST", "/api/internal/push:dispatch", { body: {}, headers: { "x-dispatch-token": dt } });
  assert.equal(d.status, 200, JSON.stringify(d.body));
  assert.deepEqual(d.body.coordinator_alerts, { paged: 0, escalated: 1 });
  assert.equal((await sql`SELECT reason_code FROM app.audit_logs WHERE action = 'coordinator_alert_escalated'`)[0].reason_code, "push_0/0_sms_off");
});
