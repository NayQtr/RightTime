// Crypto helpers built on node:crypto (available in Node 18+ and in Deno / Supabase Edge via node: specifiers).
import { Buffer } from "node:buffer";
import {
  createCipheriv, createDecipheriv, createHash, createHmac, createPrivateKey, createPublicKey,
  generateKeyPairSync, randomBytes, randomInt, randomUUID, sign, timingSafeEqual, verify,
} from "node:crypto";

export { Buffer, createHash, randomUUID };

export const sha256hex = (s) => createHash("sha256").update(s).digest("hex");
export const hmacHex = (key, s) => createHmac("sha256", key).update(s).digest("hex");
export const hmacB64 = (key, s) => createHmac("sha256", key).update(s).digest("base64");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const randomDigits = (n) => Array.from({ length: n }, () => randomInt(0, 10)).join("");
// n characters drawn uniformly from an alphabet (for codes a person reads and types, such as a discount code)
export const randomChars = (n, alphabet) => Array.from({ length: n }, () => alphabet[randomInt(0, alphabet.length)]).join("");

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// AES-256-GCM: output = iv(12) | tag(16) | ciphertext. key = 32-byte Buffer.
export function encrypt(key, plaintext) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(String(plaintext), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

export function decrypt(key, blob) {
  if (!blob) return null;
  const b = Buffer.from(blob);
  const d = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

// ---------------------------------------------------------------- JWT RS256 (v0.3 §3.1)
export function generateRsaPem() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" });
}

// keyPair(pem) -> { privateKey, publicKey } KeyObjects (create once, reuse)
export function keyPairFromPem(privatePem) {
  const privateKey = createPrivateKey(privatePem);
  return { privateKey, publicKey: createPublicKey(privateKey) };
}

export function jwtSign(privateKey, kid, payload) {
  const header = { alg: "RS256", typ: "JWT", kid };
  const data = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  const sig = sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url");
  return `${data}.${sig}`;
}

export function jwtVerify(publicKey, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  let header;
  try { header = JSON.parse(Buffer.from(parts[0], "base64url").toString()); } catch { return null; }
  if (header.alg !== "RS256") return null;
  const ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], "base64url"));
  if (!ok) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()); } catch { return null; }
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// ---------------------------------------------------------------- TOTP (RFC 6238, SHA-1, 6 digits, 30 s)
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s) {
  let bits = 0, value = 0; const out = [];
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(ch); if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totpAt(secretB32, timeMs, step = 30) {
  const counter = Math.floor(timeMs / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24 | h[off + 1] << 16 | h[off + 2] << 8 | h[off + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

export function totpVerify(secretB32, code, timeMs = Date.now()) {
  return totpStep(secretB32, code, timeMs) !== null;
}

// The 30-second step the code belongs to (one step either side of now), or null. Callers store the last accepted step
// so a code is never accepted twice (NMX-63).
export function totpStep(secretB32, code, timeMs = Date.now()) {
  if (!/^[0-9]{6}$/.test(String(code))) return null;
  for (const w of [-1, 0, 1]) if (safeEqual(totpAt(secretB32, timeMs + w * 30000), code)) return Math.floor(timeMs / 30000) + w;
  return null;
}

export const newTotpSecret = () => base32Encode(randomBytes(20));
