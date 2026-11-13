// Web Push (RFC 8030) with message encryption (RFC 8291, aes128gcm per RFC 8188) and VAPID (RFC 8292).
// Built on WebCrypto only, which Node 18+ and Deno (Supabase Edge) both provide, so there is no dependency.
import { loadOptionalKey } from "../lib/keys.js";

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function fromB64u(s) {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hmac(key, data) {
  const k = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", k, data));
}
// HKDF with a single output block (every length used here is at most 32 bytes)
async function hkdf(salt, ikm, info, length) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

// A new VAPID key pair as a JSON string (private JWK). Stored once in app.server_keys via loadOptionalKey.
export async function generateVapidKey() {
  const kp = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return JSON.stringify(await subtle.exportKey("jwk", kp.privateKey));
}

// { privateKey: CryptoKey, publicKey: base64url of the uncompressed point } from the stored JWK
export async function vapidFromJwk(json) {
  const jwk = JSON.parse(json);
  const privateKey = await subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const publicKey = b64u(concat(new Uint8Array([4]), fromB64u(jwk.x), fromB64u(jwk.y)));
  return { privateKey, publicKey };
}

// The server's VAPID key pair (one for members and coordinators), loaded once per running copy.
let vapidCache = null;
export async function vapidKeys(sql, getEnv) {
  if (!vapidCache) vapidCache = await vapidFromJwk(await loadOptionalKey(sql, getEnv, "VAPID_PRIVATE_JWK", generateVapidKey));
  return vapidCache;
}
export function resetVapidCache() { vapidCache = null; }

// Signed VAPID JWT for the push service's origin (ES256; WebCrypto signatures are already raw r||s).
export async function vapidJwt(privateKey, endpoint, subject, now = Math.floor(Date.now() / 1000)) {
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: now + 12 * 3600, sub: subject })));
  const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

// Encrypts one push message for a subscription (keys.p256dh, keys.auth); returns the aes128gcm body.
export async function encryptPayload(plaintext, p256dh, auth) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  const local = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await subtle.exportKey("raw", local.publicKey));
  const uaKey = await subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const record = concat(enc.encode(plaintext), new Uint8Array([2])); // 0x02: last (and only) record
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, record));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

// Sends one message. Returns { ok, status, gone }: gone means the subscription no longer exists (404/410).
// urgency "high" (coordinator alerts) asks the push service to wake a sleeping phone at once.
export async function sendPush(sub, message, vapid, { subject, ttl = 86400, urgency = "normal", fetchImpl = fetch } = {}) {
  const body = await encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth);
  const jwt = await vapidJwt(vapid.privateKey, sub.endpoint, subject);
  let res;
  try {
    res = await fetchImpl(sub.endpoint, { method: "POST", body, headers: {
      "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: urgency,
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}` } });
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: String(e && e.message || e).slice(0, 200) };
  }
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}

// Which push endpoints we accept, and the shape of the two browser keys. Both the member's devices (routes/push.js)
// and a coordinator's (routes/alerts.js) are checked with these, so neither route has to import the other.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/];
export function validEndpoint(endpoint) {
  let u;
  try { u = new URL(String(endpoint || "")); } catch { return false; }
  return u.protocol === "https:" && String(endpoint).length <= 1000 && PUSH_HOSTS.some((re) => re.test(u.hostname));
}
export const b64uKey = (s, min, max) => typeof s === "string" && /^[A-Za-z0-9_-]+$/.test(s) && s.length >= min && s.length <= max;

/** A browser's push subscription as the member app and the admin console send it: a real push service and two keys. */
export const validSubscription = (body) => {
  const keys = (body && body.keys) || {};
  return validEndpoint(body && body.endpoint) && b64uKey(keys.p256dh, 80, 100) && b64uKey(keys.auth, 16, 32);
};
