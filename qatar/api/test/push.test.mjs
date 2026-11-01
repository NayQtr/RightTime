// Phone notifications (Web Push, migration 013): RFC 8291 encryption (checked by decrypting as the browser would),
// VAPID signatures, subscription rules (push services only, one row per device), and the dispatcher's outcomes.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplate, client, signUp, startTestEnv } from "./helpers.mjs";
import { b64u, encryptPayload, fromB64u, generateVapidKey, vapidFromJwk, vapidJwt } from "../src/services/webpush.js";
import { dispatchPush, resetVapidCache, validEndpoint } from "../src/routes/push.js";

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

test("dispatcher: sends the inbox text in her language, removes dead devices, skips old or pre-subscription rows", async () => {
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
  assert.equal(msg.body, "تم الدفع. نجمع طاولتك الآن. رقم الحجز RT-ABC123.");
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
