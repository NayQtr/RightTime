// Server keys: JWT_PRIVATE_PEM, DATA_KEY (64 hex), PHONE_PEPPER, PSP_WEBHOOK_SECRET, SEAT_TOKEN_KEY.
// Each one is taken from an environment variable / Edge Function secret of the same name when set. Otherwise it
// lives in app.server_keys (generated once). With the SERVER_KEYS_KEK secret set (audit F6), those rows are stored
// encrypted (AES-256-GCM, key derived from the KEK), plaintext rows are encrypted in place on first use, and a
// missing or wrong KEK fails closed: keys are never regenerated over existing data.
import { Buffer, createHash, decrypt, encrypt, generateRsaPem, keyPairFromPem, randomToken } from "./crypto.js";

const SPECS = {
  JWT_PRIVATE_PEM: () => generateRsaPem(),
  DATA_KEY: () => Buffer.from(randomToken(32), "base64url").toString("hex"),
  PHONE_PEPPER: () => randomToken(32),
  PSP_WEBHOOK_SECRET: () => randomToken(32),
  SEAT_TOKEN_KEY: () => randomToken(32),
};
const ENC_PREFIX = "enc:v1:";

let cached = null;

export function kekFrom(secret) {
  if (!secret) return null;
  if (secret.length < 32) throw new Error("SERVER_KEYS_KEK must be at least 32 characters");
  // fixed derivation label (kept from the Rightime name): changing it would make every stored key unreadable
  return createHash("sha256").update("rightime/server-keys/v1\n" + secret).digest();
}

const seal = (kek, value) => ENC_PREFIX + encrypt(kek, value).toString("base64");

function open(kek, name, stored) {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  if (!kek) throw new Error(`server key ${name} is encrypted but SERVER_KEYS_KEK is not set`);
  try { return decrypt(kek, Buffer.from(stored.slice(ENC_PREFIX.length), "base64")); }
  catch { throw new Error(`server key ${name} cannot be decrypted: SERVER_KEYS_KEK is wrong`); }
}

export async function loadKeys(sql, getEnv) {
  if (cached) return cached;
  const kek = kekFrom(getEnv("SERVER_KEYS_KEK"));
  const values = {};
  const sources = {};
  for (const [name, gen] of Object.entries(SPECS)) {
    const fromEnv = getEnv(name);
    if (fromEnv) { values[name] = fromEnv.replace(/\\n/g, "\n"); sources[name] = "env"; continue; }
    const fresh = gen();
    await sql`INSERT INTO app.server_keys (name, value) VALUES (${name}, ${kek ? seal(kek, fresh) : fresh}) ON CONFLICT (name) DO NOTHING`;
    const [row] = await sql`SELECT value FROM app.server_keys WHERE name = ${name}`;
    values[name] = open(kek, name, row.value);
    if (kek && !row.value.startsWith(ENC_PREFIX)) {
      // one-time migration of a plaintext row; only replaces the exact value that was read
      await sql`UPDATE app.server_keys SET value = ${seal(kek, values[name])} WHERE name = ${name} AND value = ${row.value}`;
    }
    sources[name] = kek ? "db-encrypted" : "db";
  }
  const kp = keyPairFromPem(values.JWT_PRIVATE_PEM);
  const kinds = new Set(Object.values(sources));
  cached = {
    jwt: { ...kp, kid: "k1" },
    dataKey: Buffer.from(values.DATA_KEY, "hex"),
    phonePepper: values.PHONE_PEPPER,
    pspWebhookSecret: values.PSP_WEBHOOK_SECRET,
    seatTokenKey: values.SEAT_TOKEN_KEY,
    source: kinds.size === 1 ? [...kinds][0] === "db" ? "db-fallback" : [...kinds][0] : "mixed",
  };
  if (cached.dataKey.length !== 32) throw new Error("DATA_KEY must be 32 bytes (64 hex chars)");
  return cached;
}

export function resetKeyCache() { cached = null; }
