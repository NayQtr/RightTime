// Coordinator alerts (plan T13, item 40, migration 019): an S1/S2 report during a meetup, or "I am in danger now",
// reaches every coordinator device (Web Push, decrypted here as the browser would) and number (SMS, Twilio) at once;
// nothing for S3 or after the meetup; Acknowledge records who and when; nobody acknowledging in time sends it again, once.
// The push service and Twilio are fake local servers.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";
import { b64u } from "../src/services/webpush.js";
import { resetVapidCache } from "../src/routes/push.js";
import { resetConfigCache } from "../src/lib/config.js";
import { PAGE_WAIT_MS } from "../src/services/coordinator_alerts.js";

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const SID = "AC" + "0".repeat(32);
let env, call, sql, fake, base, owner, ops, ts, member, bookingId;
const pushes = [], sms = [];
const browsers = {};
const held = []; // push requests to a device whose push service does not answer (last test)

// A browser-side push subscription and RFC 8291 decryption, independent of the sender code (as in push.test.mjs).
async function fakeBrowser() {
  const kp = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await subtle.exportKey("raw", kp.publicKey));
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { kp, p256dh: b64u(pub), auth: b64u(auth), pub, authRaw: auth };
}
const hmac = async (key, data) => new Uint8Array(await subtle.sign("HMAC", await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), data));
const cat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const hk = async (salt, ikm, info, n) => (await hmac(await hmac(salt, ikm), cat(info, new Uint8Array([1])))).slice(0, n);
async function decrypt(b, body) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const asKey = await subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: asKey }, b.kp.privateKey, 256));
  const ikm = await hk(b.authRaw, shared, cat(te.encode("WebPush: info\0"), b.pub, asPub), 32);
  const key = await subtle.importKey("raw", await hk(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["decrypt"]);
  const pt = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: await hk(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12) }, key, ct));
  return JSON.parse(new TextDecoder().decode(pt.slice(0, -1)));
}

before(async () => {
  fake = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (req.url.startsWith("/2010-04-01/")) {
        const form = new URLSearchParams(body.toString());
        sms.push({ to: form.get("To"), body: form.get("Body") });
        res.writeHead(201, { "content-type": "application/json" }); res.end(JSON.stringify({ sid: `SM${sms.length}`, status: "queued" }));
        return;
      }
      if (req.url.includes("slow")) { held.push(res); return; }
      pushes.push({ device: req.url.split("/").pop(), urgency: req.headers.urgency, ttl: req.headers.ttl, body: new Uint8Array(body) });
      res.writeHead(req.url.includes("gone") ? 410 : 201); res.end();
    });
  });
  await new Promise((r) => fake.listen(0, r));
  base = `http://127.0.0.1:${fake.address().port}`;
  buildTemplate();
  resetVapidCache();
  // SMS_PROVIDER is switched on in app_config once the member has signed up (with a provider, sign-in codes go by SMS
  // and staging's dev code is no longer in the answer, which the sign-up helper uses)
  env = await startTestEnv({ TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: "test-twilio-token",
    TWILIO_MESSAGING_SERVICE_SID: "MG" + "1".repeat(32), TWILIO_BASE_URL: base,
    COORDINATOR_ALERT_PHONES: "+97455501111, +97455502222, not-a-number" });
  call = client(env.base);
  sql = env.sql;
  owner = await adminLogin(call, sql, "owner@example.test");
  ops = await adminLogin(call, sql, "ops.oncall@example.test");
  ts = await adminLogin(call, sql, "ts.primary@example.test");
  // coordinators' browsers (owner and ops) and a T&S browser that must not get alerts. The endpoints point at the fake
  // push service; through the API only the real push services are accepted (last test).
  for (const [name, adminId] of [["owner", owner.admin.id], ["ops", ops.admin.id], ["ts", ts.admin.id]]) {
    browsers[name] = await fakeBrowser();
    await sql`INSERT INTO app.admin_push_subscriptions (admin_id, endpoint, p256dh, auth)
              VALUES (${adminId}, ${`${base}/push/${name}`}, ${browsers[name].p256dh}, ${browsers[name].auth})`;
  }
  // a member at a meetup
  member = await signUp(call, { name: "Lulwa" });
  const s = await call("POST", "/api/admin/v1/sessions", { token: ops.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 5 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "الدفنة", district_hint_en: "Dafna" } });
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  const b = await call("POST", "/api/v1/bookings", { token: member.token, body: { session_id: s.body.id } });
  await payViaMock(call, await checkoutUrlFor(call, member.token, b.body));
  bookingId = b.body.booking_id;
  await sql`UPDATE app.app_config SET value = 'twilio' WHERE key = 'SMS_PROVIDER'`;
  resetConfigCache(); // the server runs in this process
});
after(async () => { await env.stop(); fake.close(); });

const report = (body) => call("POST", "/api/v1/reports", { token: member.token, body: { booking_id: bookingId, ...body } });
const alertOf = async (caseRef) => (await sql`SELECT a.* FROM app.coordinator_alerts a JOIN app.safety_reports r ON r.id = a.report_id WHERE r.case_ref = ${caseRef}`)[0];
const dispatch = async () => {
  const [{ token }] = await sql`SELECT token FROM app.push_dispatch_token WHERE id = 1`;
  return call("POST", "/api/internal/push:dispatch", { body: {}, headers: { "x-dispatch-token": token } });
};

test("S1 during the meetup: push to every coordinator device and SMS to every coordinator number, at once; no report content", async () => {
  const r = await report({ category: "threat_violence", timing: "during", description: "He grabbed my arm near the door." });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const a = await alertOf(r.body.case_ref);
  assert.deepEqual([a.kind, a.severity, Boolean(a.paged_at)], ["report_during", 1, true]);
  assert.deepEqual([a.push_devices, a.push_delivered, a.sms_numbers, a.sms_delivered], [2, 2, 2, 2]);
  assert.deepEqual(pushes.map((p) => p.device).sort(), ["ops", "owner"], "coordinators only: not trust & safety");
  assert.ok(pushes.every((p) => p.urgency === "high"), "wakes a sleeping phone");
  const msg = await decrypt(browsers.ops, pushes.find((p) => p.device === "ops").body);
  assert.equal(msg.title, "HerZone safety alert");
  assert.equal(msg.body, `S1 safety report during a meetup (${r.body.case_ref}). Open the admin console and acknowledge.`);
  assert.deepEqual([msg.url, msg.lang, msg.urgent], ["/admin/#/alerts", "en", true]);
  assert.deepEqual(sms.map((m) => m.to).sort(), ["+97455501111", "+97455502222"]);
  assert.ok(sms.every((m) => m.body.startsWith("HerZone alert: S1 safety report") && m.body.endsWith(`${env.base}/admin/#/alerts`)), sms[0].body);
  const everything = JSON.stringify(msg) + sms.map((m) => m.body).join();
  assert.ok(!everything.includes("grabbed") && !everything.includes("Lulwa"), "no report content and no name leaves the server");
  const [log] = await sql`SELECT reason_code FROM app.audit_logs WHERE action = 'coordinator_paged' AND entity_id = ${a.report_id}`;
  assert.equal(log.reason_code, "push_2/2_sms_2/2", "the audit row records what was sent");
});

test("S2 during, and 'I am in danger now' at any time, alert too; S3, and S1/S2 after the meetup, do not", async () => {
  const s2 = await report({ category: "harassment", timing: "during" });
  assert.deepEqual([(await alertOf(s2.body.case_ref)).severity, (await alertOf(s2.body.case_ref)).kind], [2, "report_during"]);
  const danger = await report({ category: "disruptive", timing: "after", immediate_danger: true });
  assert.equal(danger.body.severity, 1);
  assert.equal((await alertOf(danger.body.case_ref)).kind, "immediate_danger");
  assert.ok(sms.at(-1).body.startsWith("HerZone alert: Immediate danger reported at a meetup (S1"), sms.at(-1).body);
  const n = [pushes.length, sms.length];
  for (const body of [{ category: "disruptive", timing: "during" }, { category: "threat_violence", timing: "after" }, { category: "fraud", timing: "after" }]) {
    const r = await report(body);
    assert.equal(r.status, 201);
    assert.equal(await alertOf(r.body.case_ref), undefined, JSON.stringify(body));
  }
  assert.deepEqual([pushes.length, sms.length], n, "nothing sent");
});

test("admin console: owner and ops see the open alerts and acknowledge them (who and when); other roles cannot", async () => {
  assert.equal((await call("GET", "/api/admin/v1/coordinator-alerts", { token: ts.token })).status, 403);
  const list = await call("GET", "/api/admin/v1/coordinator-alerts", { token: ops.token });
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.alerts.length, 3);
  assert.deepEqual(list.body.channels, { push_devices: 2, sms: true, sms_numbers: 2 });
  assert.equal(list.body.escalate_after_minutes, 5);
  const first = list.body.alerts[0];
  assert.deepEqual(Object.keys(first.push), ["delivered", "devices"]);
  assert.ok(!JSON.stringify(list.body).includes("grabbed"), "no report content in the console either");
  const ack = await call("POST", `/api/admin/v1/coordinator-alerts/${first.id}:acknowledge`, { token: ops.token });
  assert.equal(ack.status, 200, JSON.stringify(ack.body));
  assert.equal(ack.body.acknowledged_by, "Ops On-call");
  assert.equal((await call("POST", `/api/admin/v1/coordinator-alerts/${first.id}:acknowledge`, { token: owner.token })).status, 409, "once");
  assert.equal((await call("POST", `/api/admin/v1/coordinator-alerts/${crypto.randomUUID()}:acknowledge`, { token: owner.token })).status, 404);
  const [row] = await sql`SELECT acknowledged_by, acknowledged_at FROM app.coordinator_alerts WHERE id = ${first.id}`;
  assert.equal(row.acknowledged_by, ops.admin.id);
  assert.ok(row.acknowledged_at);
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.audit_logs WHERE action = 'coordinator_alert_acknowledged' AND actor_id = ${ops.admin.id}`)[0].n, 1);
  const open = await call("GET", "/api/admin/v1/coordinator-alerts", { token: owner.token });
  assert.equal(open.body.alerts.length, 2);
  const all = await call("GET", "/api/admin/v1/coordinator-alerts?status=all", { token: owner.token });
  assert.equal(all.body.alerts.length, 3);
  assert.equal(all.body.alerts.at(-1).acknowledged_by, "Ops On-call", "acknowledged ones come after the open ones");
});

test("escalation: nobody acknowledged within the minutes set: sent again to everyone, once; acknowledged alerts never", async () => {
  // every alert was paged 6 minutes ago (the setting is 5); one of them is acknowledged
  await sql`UPDATE app.coordinator_alerts SET paged_at = now() - interval '6 minutes'`;
  const n = [pushes.length, sms.length];
  const d = await dispatch();
  assert.equal(d.status, 200, JSON.stringify(d.body));
  assert.deepEqual(d.body.coordinator_alerts, { paged: 0, escalated: 2 }, "the two open alerts, not the acknowledged one");
  assert.deepEqual([pushes.length - n[0], sms.length - n[1]], [4, 4], "2 alerts x (2 devices, 2 numbers)");
  const msg = await decrypt(browsers.owner, pushes.findLast((p) => p.device === "owner").body);
  assert.match(msg.body, /^Not acknowledged after 5 min: /);
  assert.ok(sms.slice(-4).every((m) => m.body.startsWith("HerZone alert: Not acknowledged after 5 min:")));
  const rows = await sql`SELECT escalated_at, escalation_push_delivered, escalation_sms_delivered, acknowledged_at FROM app.coordinator_alerts`;
  assert.equal(rows.filter((r) => r.escalated_at).length, 2);
  assert.ok(rows.filter((r) => r.escalated_at).every((r) => r.escalation_push_delivered === 2 && r.escalation_sms_delivered === 2 && !r.acknowledged_at));
  assert.deepEqual((await sql`SELECT reason_code FROM app.audit_logs WHERE action = 'coordinator_alert_escalated'`).map((r) => r.reason_code), ["push_2/2_sms_2/2", "push_2/2_sms_2/2"]);
  // once: the next minute, and the console reading its alerts, send nothing more
  const again = await dispatch();
  assert.deepEqual(again.body.coordinator_alerts, { paged: 0, escalated: 0 });
  await call("GET", "/api/admin/v1/coordinator-alerts", { token: owner.token });
  assert.equal(pushes.length - n[0], 4);
});

test("an alert left unsent (the request stopped before paging) is paged by the next run; a gone device is removed", async () => {
  // a dead browser among the coordinators'
  const dead = await fakeBrowser();
  await sql`INSERT INTO app.admin_push_subscriptions (admin_id, endpoint, p256dh, auth) VALUES (${owner.admin.id}, ${`${base}/push/gone`}, ${dead.p256dh}, ${dead.auth})`;
  const [r] = await sql`SELECT id FROM app.safety_reports WHERE id NOT IN (SELECT report_id FROM app.coordinator_alerts) LIMIT 1`;
  await sql`INSERT INTO app.coordinator_alerts (report_id, kind, severity, created_at) VALUES (${r.id}, 'report_during', 2, now() - interval '2 minutes')`;
  const d = await dispatch();
  assert.deepEqual(d.body.coordinator_alerts, { paged: 1, escalated: 0 });
  const [a] = await sql`SELECT * FROM app.coordinator_alerts WHERE report_id = ${r.id}`;
  assert.ok(a.paged_at);
  assert.deepEqual([a.push_devices, a.push_delivered, a.sms_delivered], [3, 2, 2]);
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.admin_push_subscriptions WHERE endpoint LIKE '%/push/gone'`)[0].n, 0, "410 removes the device");
});

test("this device: coordinators turn alerts on and off for a browser (real push services only); other roles cannot", async () => {
  const b = await fakeBrowser();
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/coordinator-1", keys: { p256dh: b.p256dh, auth: b.auth } };
  assert.equal((await call("POST", "/api/admin/v1/push/subscriptions", { token: ts.token, body: sub })).status, 403);
  assert.equal((await call("POST", "/api/admin/v1/push/subscriptions", { token: ops.token, body: { ...sub, endpoint: `${base}/push/x` } })).status, 422);
  assert.equal((await call("POST", "/api/admin/v1/push/subscriptions", { token: ops.token, body: sub })).status, 201);
  const mine = await call("GET", "/api/admin/v1/push/subscriptions", { token: ops.token });
  assert.ok(mine.body.devices.some((d) => d.endpoint === sub.endpoint));
  assert.ok(!(await call("GET", "/api/admin/v1/push/subscriptions", { token: owner.token })).body.devices.some((d) => d.endpoint === sub.endpoint), "her own devices only");
  assert.equal((await call("POST", "/api/admin/v1/push/subscriptions:delete", { token: ops.token, body: { endpoint: sub.endpoint } })).status, 200);
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.admin_push_subscriptions WHERE endpoint = ${sub.endpoint}`)[0].n, 0);
  const acts = (await sql`SELECT action FROM app.audit_logs WHERE action LIKE 'coordinator_alerts_device_%' ORDER BY at`).map((x) => x.action);
  assert.deepEqual(acts, ["coordinator_alerts_device_on", "coordinator_alerts_device_off"]);
});

test("a push service that does not answer never holds up her report: 201 within seconds, the SMS goes at once, the page completes after", async () => {
  const slow = await fakeBrowser();
  await sql`INSERT INTO app.admin_push_subscriptions (admin_id, endpoint, p256dh, auth) VALUES (${ops.admin.id}, ${`${base}/push/slow`}, ${slow.p256dh}, ${slow.auth})`;
  const n = sms.length;
  const t0 = Date.now();
  const r = await report({ category: "threat_violence", timing: "during" });
  const took = Date.now() - t0;
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(took < PAGE_WAIT_MS + 2000, `answered in ${took} ms (the app gives up after 15 s)`);
  assert.equal(sms.length - n, 2, "the SMS did not wait for the push service");
  // the page carries on after the answer: once the silent device times out (8 s), the alert and the audit row record it
  const a0 = await alertOf(r.body.case_ref);
  let log;
  for (let i = 0; i < 150 && !log; i++) {
    [log] = await sql`SELECT reason_code FROM app.audit_logs WHERE action = 'coordinator_paged' AND entity_id = ${a0.report_id}`;
    if (!log) await new Promise((ok) => setTimeout(ok, 100));
  }
  assert.equal(log && log.reason_code, "push_2/3_sms_2/2");
  const a = await alertOf(r.body.case_ref);
  assert.deepEqual([Boolean(a.paged_at), a.push_devices, a.push_delivered, a.sms_delivered], [true, 3, 2, 2]);
  held.forEach((res) => res.destroy());
  await sql`DELETE FROM app.admin_push_subscriptions WHERE endpoint LIKE '%/push/slow'`;
});

test("a page cut off before it finished is not counted as sent: the next run sends it again and only then is it shown as sent", async () => {
  // a report with no alert of its own (S3), then its alert as a request that stopped mid-page leaves it: started
  // (paged_at) two minutes ago, nothing recorded of what it reached
  const r = await report({ category: "fraud", timing: "after" });
  assert.equal(r.status, 201);
  const [rep] = await sql`SELECT id FROM app.safety_reports WHERE case_ref = ${r.body.case_ref}`;
  assert.equal(await alertOf(r.body.case_ref), undefined);
  const [a0] = await sql`INSERT INTO app.coordinator_alerts (report_id, kind, severity, created_at, paged_at)
                         VALUES (${rep.id}, 'report_during', 2, now() - interval '3 minutes', now() - interval '2 minutes') RETURNING id`;
  const p0 = pushes.length, s0 = sms.length;
  const d = await dispatch();
  assert.equal(d.status, 200);
  assert.ok(d.body.coordinator_alerts.paged >= 1, JSON.stringify(d.body));
  assert.ok(pushes.length > p0, "pushed again");
  assert.equal(sms.length - s0, 2, "SMS again");
  const list = await call("GET", "/api/admin/v1/coordinator-alerts", { token: ops.token });
  const mine = list.body.alerts.find((x) => x.case_ref === r.body.case_ref);
  assert.equal(mine.page_done, true);
  assert.ok(mine.push.delivered + mine.sms.delivered > 0);
  // a finished page is never sent again by the next run
  const p1 = pushes.length;
  await sql`UPDATE app.coordinator_alerts SET paged_at = now() - interval '2 minutes' WHERE id = ${a0.id}`;
  await dispatch();
  assert.equal(pushes.length, p1);
});
