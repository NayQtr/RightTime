// Server keys. Production: set JWT_PRIVATE_PEM, DATA_KEY (64 hex), PHONE_PEPPER, PSP_WEBHOOK_SECRET as secrets.
// Staging fallback: if a secret is not set, a key is generated once and stored in app.server_keys
// (readable only by the database owner role). The response header X-Key-Source tells which mode is active.
import { Buffer, generateRsaPem, keyPairFromPem, randomToken } from "./crypto.js";

const SPECS = {
  JWT_PRIVATE_PEM: () => generateRsaPem(),
  DATA_KEY: () => Buffer.from(randomToken(32), "base64url").toString("hex"),
  PHONE_PEPPER: () => randomToken(32),
  PSP_WEBHOOK_SECRET: () => randomToken(32),
  SEAT_TOKEN_KEY: () => randomToken(32),
};

let cached = null;

export async function loadKeys(sql, getEnv) {
  if (cached) return cached;
  const values = {};
  const sources = {};
  for (const [name, gen] of Object.entries(SPECS)) {
    const fromEnv = getEnv(name);
    if (fromEnv) { values[name] = fromEnv.replace(/\\n/g, "\n"); sources[name] = "env"; continue; }
    await sql`INSERT INTO app.server_keys (name, value) VALUES (${name}, ${gen()}) ON CONFLICT (name) DO NOTHING`;
    const [row] = await sql`SELECT value FROM app.server_keys WHERE name = ${name}`;
    values[name] = row.value; sources[name] = "db";
  }
  const kp = keyPairFromPem(values.JWT_PRIVATE_PEM);
  cached = {
    jwt: { ...kp, kid: "k1" },
    dataKey: Buffer.from(values.DATA_KEY, "hex"),
    phonePepper: values.PHONE_PEPPER,
    pspWebhookSecret: values.PSP_WEBHOOK_SECRET,
    seatTokenKey: values.SEAT_TOKEN_KEY,
    source: Object.values(sources).every((s) => s === "env") ? "env" : "db-fallback",
  };
  if (cached.dataKey.length !== 32) throw new Error("DATA_KEY must be 32 bytes (64 hex chars)");
  return cached;
}

export function resetKeyCache() { cached = null; }
