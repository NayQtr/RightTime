// Phone notifications (Web Push, migration 013): RFC 8291 encryption (checked by decrypting as the browser would),
// VAPID signatures, subscription rules (push services only, one row per device), and the dispatcher's outcomes.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, client, signUp, startTestEnv } from "./helpers.mjs";
import { b64u, encryptPayload, fromB64u, generateVapidKey, vapidFromJwk, vapidJwt } from "../src/services/webpush.js";
import { PUSH_RETRY_MINUTES, dispatchPush, resetVapidCache, validEndpoint } from "../src/routes/push.js";

const subtle = globalThis.crypto.subtle;
let env, call, sql;

before(async () => { buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql; resetVapidCache(); });
after(async () => { await env.stop(); });

// A browser-side subscription: its ECDH key pair and auth secret.
async function fakeBrowser() {
  const kp = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await subtle.exportKey("raw", kp.publicKey));
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { kp, p256dh: b64u(pub), auth: b64u(auth), pub, authRaw: auth };
}
async function hmac(key, data) {
  const k = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", k, data));
}
const cat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const hk = async (salt, ikm, info, n) => (await hmac(await hmac(salt, ikm), cat(info, new Uint8Array([1])))).slice(0, n);
const te = new TextEncoder();
// RFC 8291 decryption, independent of the sender code
async function browserDecrypt(b, body) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPub = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const asKey = await subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: asKey }, b.kp.privateKey, 256));
  const ikm = await hk(b.authRaw, shared, cat(te.encode("WebPush: info\0"), b.pub, asPub), 32);
  const cek = await hk(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hk(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const pt = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ct));
  assert.equal(pt[pt.length - 1], 2, "last-record delimiter");
  return new TextDecoder().decode(pt.slice(0, -1));
}

test("encryption: a browser holding the subscription keys decrypts the message (RFC 8291 aes128gcm)", async () => {
  const b = await fakeBrowser();
  const body = await encryptPayload(JSON.stringify({ body: "طاولتك مؤكدة!" }), b.p256dh, b.auth);
  assert.equal(new DataView(body.buffer).getUint32(16), 4096, "record size");
  assert.deepEqual(JSON.parse(await browserDecrypt(b, body)), { body: "طاولتك مؤكدة!" });
});

test("VAPID: ES256 JWT for the push service origin, verifiable with the public key", async () => {
  const v = await vapidFromJwk(await generateVapidKey());
  assert.equal(fromB64u(v.publicKey).length, 65);
  const jwt = await vapidJwt(v.privateKey, "https://fcm.googleapis.com/fcm/send/abc", "https://herzone.app");
  const [h, p, s] = jwt.split(".");
  const claims = JSON.parse(new TextDecoder().decode(fromB64u(p)));
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "https://herzone.app");
  const pub = await subtle.importKey("raw", fromB64u(v.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64u(s), te.encode(`${h}.${p}`)));
});

test("public key: generated once, stored server-side, the same on every call", async () => {
  const a = await call("GET", "/api/v1/push/key");
  const b = await call("GET", "/api/v1/push/key");
  assert.equal(a.status, 200);
  assert.equal(a.body.public_key, b.body.public_key);
  assert.equal(fromB64u(a.body.public_key).length, 65);
  const [row] = await sql`SELECT value FROM app.server_keys WHERE name = 'VAPID_PRIVATE_JWK'`;
  assert.ok(row && row.value.length > 50);
});

test("subscriptions: only real push services, valid keys; one row per device, moved to whoever signs in on it", async () => {
  assert.equal(validEndpoint("https://fcm.googleapis.com/fcm/send/x"), true);
  assert.equal(validEndpoint("https://web.push.apple.com/abc"), true);
  assert.equal(validEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"), true);
  for (const bad of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://169.254.169.254/x"])
    assert.equal(validEndpoint(bad), false, bad);
  const u1 = await signUp(call, { name: "Lina" });
  const u2 = await signUp(call, { name: "Maha" });
  const b = await fakeBrowser();
  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/device-1", keys: { p256dh: b.p256dh, auth: b.auth } };
  assert.equal((await call("POST", "/api/v1/push/subscriptions", { token: u1.token, body: { ...sub, endpoint: "https://evil.example/x" } })).status, 422);
  assert.equal((await call("POST", "/api/v1/push/subscriptions", { body: sub })).status, 401);
  assert.equal((await call("POST", "/api/v1/push/subscriptions", { token: u1.token, body: sub })).status, 201);
  assert.equal((await call("POST", "/api/v1/push/subscriptions", { token: u2.token, body: sub })).status, 201);
  const rows = await sql`SELECT user_id FROM app.push_subscriptions WHERE endpoint = ${sub.endpoint}`;
  assert.deepEqual(rows.map((r) => r.user_id), [u2.userId]);
  assert.equal((await call("POST", "/api/v1/push/subscriptions:delete", { token: u2.token, body: { endpoint: sub.endpoint } })).status, 200);
  assert.equal((await sql`SELECT 1 FROM app.push_subscriptions WHERE endpoint = ${sub.endpoint}`).length, 0);
});

test("dispatcher: lock-screen text is generic (no names, places or refs), removes dead devices, skips old or pre-subscription rows", async () => {
  const u = await signUp(call, { name: "Sara" });
  const queue = (key, payload, ago = "0 minutes") => sql`INSERT INTO app.notifications_outbox (user_id, channel, template_key, locale, payload, created_at, send_after)
    VALUES (${u.userId}, 'push', ${key}, 'ar', ${sql.json(payload)}, now() - ${ago}::interval, now() - ${ago}::interval) RETURNING id`;
  const [before] = await queue("BOOKING_CANCELLED", { ref: "OLD1" }, "2 minutes"); // queued before the device subscribed
  const [stale] = await queue("BOOKING_CANCELLED", { ref: "OLD2" }, "30 hours");
  const live = await fakeBrowser(), dead = await fakeBrowser();
  for (const [b, ep] of [[live, "https://fcm.googleapis.com/fcm/send/live"], [dead, "https://web.push.apple.com/dead"]])
    assert.equal((await call("POST", "/api/v1/push/subscriptions", { token: u.token, body: { endpoint: ep, keys: { p256dh: b.p256dh, auth: b.auth } } })).status, 201);
  const [fresh] = await queue("PAYMENT_CONFIRMED", { ref: "RT-ABC123", booking_id: "00000000-0000-0000-0000-000000000123" });

  const got = [];
  const fakeFetch = async (url, init) => {
    got.push({ url, init });
    return new Response(null, { status: url.includes("dead") ? 410 : 201 });
  };
  const r = await dispatchPush(sql, env.getEnv || (() => undefined), { fetchImpl: fakeFetch });
  assert.equal(r.sent, 1);
  assert.deepEqual(got.map((g) => g.url).sort(), ["https://fcm.googleapis.com/fcm/send/live", "https://web.push.apple.com/dead"], "only the fresh row, to both devices");
  const toLive = got.find((g) => g.url.includes("live"));
  assert.equal(toLive.init.headers["Content-Encoding"], "aes128gcm");
  assert.match(toLive.init.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);
  const msg = JSON.parse(await browserDecrypt(live, toLive.init.body));
  assert.equal(msg.title, "HerZone");
  // NMX-21: the lock screen shows the same generic line for every notification; the details stay in the app
  assert.equal(msg.body, "لديكِ تحديث جديد في HerZone. افتحي التطبيق لقراءته.");
  assert.ok(!JSON.stringify(msg).includes("RT-ABC123"), "no booking reference leaves the server in the push");
  assert.equal(msg.url, "/#/booking/00000000-0000-0000-0000-000000000123");
  assert.equal(msg.dir, "rtl");

  const status = async (id) => (await sql`SELECT status FROM app.notifications_outbox WHERE id = ${id}`)[0].status;
  assert.equal(await status(fresh.id), "sent");
  assert.equal(await status(stale.id), "cancelled", "older than 24 h: inbox only");
  assert.equal(await status(before.id), "cancelled", "queued before the device subscribed: not pushed to it");
  assert.equal((await sql`SELECT 1 FROM app.push_subscriptions WHERE endpoint = 'https://web.push.apple.com/dead'`).length, 0, "410 removes the device");
  assert.equal((await dispatchPush(sql, () => undefined, { fetchImpl: fakeFetch })).processed, 0, "nothing sent twice");
  const inbox = await call("GET", "/api/v1/notifications", { token: u.token });
  assert.equal(inbox.body.notifications.length, 3, "the inbox still shows everything");
});

test("dispatch endpoint: refused without the database's token, runs with it", async () => {
  assert.equal((await call("POST", "/api/internal/push:dispatch", { body: {} })).status, 401);
  assert.equal((await call("POST", "/api/internal/push:dispatch", { body: {}, headers: { "x-dispatch-token": "wrong" } })).status, 401);
  const [{ token }] = await sql`SELECT token FROM app.push_dispatch_token WHERE id = 1`;
  assert.equal(token.length, 64);
  const ok = await call("POST", "/api/internal/push:dispatch", { body: {}, headers: { "x-dispatch-token": token } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(typeof ok.body.processed, "number");
});

// ------------------------------------------------------------------ retries and the coordinators' list (021, Notion fix 6)
async function subscribed(name, endpoint) {
  await sql`DELETE FROM app.otp_challenges`;
  const u = await signUp(call, { name });
  const b = await fakeBrowser();
  assert.equal((await call("POST", "/api/v1/push/subscriptions", { token: u.token, body: { endpoint, keys: { p256dh: b.p256dh, auth: b.auth } } })).status, 201);
  return { ...u, browser: b };
}
const queued = async (u, key, payload) => (await sql`INSERT INTO app.notifications_outbox (user_id, channel, template_key, locale, payload)
  VALUES (${u.userId}, 'push', ${key}, 'ar', ${sql.json(payload)}) RETURNING id`)[0].id;
const row = async (id) => (await sql`SELECT status, attempts, last_error, provider_ref,
  round(extract(epoch FROM send_after - now()) / 60)::int AS wait_min FROM app.notifications_outbox WHERE id = ${id}`)[0];
const due = (id) => sql`UPDATE app.notifications_outbox SET send_after = now() WHERE id = ${id}`;
const pick = (o, ...k) => Object.fromEntries(k.map((x) => [x, o[x]]));

test("retries: a delivery no device accepted is tried 3 more times with growing gaps, then listed for coordinators", async () => {
  assert.deepEqual(PUSH_RETRY_MINUTES, [2, 10, 30]);
  const u = await subscribed("Sara", "https://fcm.googleapis.com/fcm/send/flaky");
  const id = await queued(u, "TABLE_LOCKED", { booking_id: "00000000-0000-0000-0000-000000000777", reveal_at: "2026-11-20T16:30:00Z" });
  const failing = async () => new Response(null, { status: 503 });
  const gaps = [];
  for (let i = 1; i <= 3; i++) {
    const r = await dispatchPush(sql, () => undefined, { fetchImpl: failing });
    assert.equal(r.retrying, 1, JSON.stringify(r));
    const x = await row(id);
    assert.deepEqual(pick(x, "status", "attempts", "last_error", "provider_ref"), { status: "queued", attempts: i, last_error: "503", provider_ref: `push:retry:${i}` });
    gaps.push(x.wait_min);
    assert.equal((await dispatchPush(sql, () => undefined, { fetchImpl: failing })).processed, 0, "not before its time");
    await due(id);
  }
  assert.deepEqual(gaps, [2, 10, 30], "growing gaps");
  assert.equal((await dispatchPush(sql, () => undefined, { fetchImpl: failing })).failed, 1);
  assert.deepEqual(pick(await row(id), "status", "attempts"), { status: "failed", attempts: 4 }, "the first try and 3 retries");

  // coordinators (owner, ops) see it with her name, number and the message; reading it is recorded
  const ops = await adminLogin(call, sql, "ops.oncall@example.test");
  const fin = await adminLogin(call, sql, "finance@example.test");
  assert.equal((await call("GET", "/api/admin/v1/notifications/failed", { token: fin.token })).status, 403);
  assert.equal((await call("GET", "/api/admin/v1/notifications/failed", { token: u.token })).status, 401);
  const count = await call("GET", "/api/admin/v1/notifications/failed?count=1", { token: ops.token });
  assert.deepEqual(Object.keys(count.body), ["open_count"], "the count carries no numbers");
  assert.ok(count.body.open_count >= 1);
  const list = await call("GET", "/api/admin/v1/notifications/failed", { token: ops.token });
  assert.equal(list.status, 200);
  const mine = list.body.notifications.find((n) => n.id === id);
  assert.deepEqual(pick(mine, "name", "phone", "attempts", "last_error", "locale"), { name: "Sara", phone: u.phone, attempts: 4, last_error: "503", locale: "ar" });
  assert.match(mine.text_en, /^Your table is confirmed! We'll reveal the venue at /);
  assert.match(mine.text, /^طاولتك مؤكدة!/);
  const [a] = await sql`SELECT reason_code FROM app.audit_logs WHERE action = 'read_failed_notifications' ORDER BY at DESC LIMIT 1`;
  assert.match(a.reason_code, /^open_\d+$/);
  // she was reached another way: out of the open list, into the handled one
  assert.equal((await call("POST", `/api/admin/v1/notifications/${id}:handled`, { token: ops.token })).status, 200);
  assert.equal((await call("POST", `/api/admin/v1/notifications/${id}:handled`, { token: ops.token })).status, 409);
  assert.ok(!(await call("GET", "/api/admin/v1/notifications/failed", { token: ops.token })).body.notifications.some((n) => n.id === id));
  const done = (await call("GET", "/api/admin/v1/notifications/failed?status=handled", { token: ops.token })).body.notifications.find((n) => n.id === id);
  assert.equal(done.handled_by, "Ops On-call");
  assert.ok(done.handled_at);
});

test("retries: a device that answers on a later try gets the message; a device that no longer exists is not retried", async () => {
  const u = await subscribed("Hind", "https://fcm.googleapis.com/fcm/send/recovers");
  const id = await queued(u, "BOOKING_CANCELLED", { ref: "RT-AAA222" });
  let calls = 0;
  const flaky = async () => new Response(null, { status: ++calls === 1 ? 500 : 201 });
  assert.equal((await dispatchPush(sql, () => undefined, { fetchImpl: flaky })).retrying, 1);
  await due(id);
  assert.equal((await dispatchPush(sql, () => undefined, { fetchImpl: flaky })).sent, 1);
  assert.deepEqual(pick(await row(id), "status", "attempts", "last_error"), { status: "sent", attempts: 2, last_error: null });

  const g = await subscribed("Mona", "https://web.push.apple.com/gone");
  const gid = await queued(g, "BOOKING_CANCELLED", { ref: "RT-BBB333" });
  const r = await dispatchPush(sql, () => undefined, { fetchImpl: async () => new Response(null, { status: 410 }) });
  assert.deepEqual(pick(r, "failed", "retrying"), { failed: 1, retrying: 0 });
  assert.deepEqual(pick(await row(gid), "status", "attempts"), { status: "failed", attempts: 1 });
});

test("a waitlist offer's phone notification opens the session list at that session", async () => {
  const u = await subscribed("Reem", "https://fcm.googleapis.com/fcm/send/offer");
  const session = "00000000-0000-0000-0000-000000000abc";
  await queued(u, "WAITLIST_OFFER", { session_id: session, date: "2026-11-20T16:30:00Z", window: 120 });
  const got = [];
  await dispatchPush(sql, () => undefined, { fetchImpl: async (url, init) => { got.push({ url, init }); return new Response(null, { status: 201 }); } });
  const msg = JSON.parse(await browserDecrypt(u.browser, got.find((x) => x.url.endsWith("/offer")).init.body));
  assert.equal(msg.url, `/#/sessions?s=${session}`);
  assert.equal(msg.body, "لديكِ تحديث جديد في HerZone. افتحي التطبيق لقراءته.", "the lock screen still shows only the generic line");
});
