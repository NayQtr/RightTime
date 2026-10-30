// Test harness: fresh database from a template (001+002+003+seed), the real server in-process, and an HTTP client.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { startServer } from "../server.mjs";
import { sha256hex, totpAt } from "../src/lib/crypto.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
export const PG = { host: process.env.PGHOST_TCP || "localhost", port: Number(process.env.PGPORT || 5433), user: process.env.PGUSER || "app" };
const TEMPLATE = "qatar_api_tpl";

function psql(db, args) {
  return execFileSync("psql", ["-h", "/tmp", "-p", String(PG.port), "-U", PG.user, "-d", db, "-v", "ON_ERROR_STOP=1", "-q", ...args], { stdio: ["ignore", "pipe", "pipe"] }).toString();
}

export function buildTemplate() {
  psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${TEMPLATE}`, "-c", `CREATE DATABASE ${TEMPLATE}`]);
  for (const f of ["db/migrations/001_init.sql", "db/migrations/002_api_support.sql", "db/migrations/003_otp_phone.sql", "db/migrations/004_cron_and_indexes.sql", "db/migrations/005_late_ack_and_admin_throttle.sql", "db/migrations/006_support_contact.sql", "db/migrations/007_deny_policies.sql", "db/migrations/008_question_display.sql", "db/migrations/009_women_only.sql", "db/migrations/010_contact_requests.sql", "db/migrations/011_personality_matching.sql", "ops/seed_common.sql", "ops/seed_questionnaire_v2.sql", "ops/seed_privacy_v2.sql", "ops/seed_questionnaire_v3.sql", "ops/seed_privacy_v3.sql", "ops/seed_questionnaire_v4.sql", "ops/seed_privacy_v4.sql"]) {
    psql(TEMPLATE, ["-1", "-f", path.join(ROOT, f)]);
  }
}

export async function startTestEnv(env = {}) {
  const db = "qatar_e2e_" + randomUUID().slice(0, 8);
  psql("postgres", ["-c", `CREATE DATABASE ${db} TEMPLATE ${TEMPLATE}`]);
  const url = `postgres://${PG.user}@${PG.host}:${PG.port}/${db}`;
  const { server, sql: serverSql, port } = await startServer({ databaseUrl: url, port: 0, env: { ...env } });
  const sql = postgres(url, { max: 2, onnotice: () => {} });
  const base = `http://localhost:${port}`;
  await sql`UPDATE app.app_config SET value = ${base} WHERE key = 'WEB_BASE_URL'`;
  return {
    db, sql, base,
    async stop() {
      server.close();
      await serverSql.end({ timeout: 1 });
      await sql.end({ timeout: 1 });
      psql("postgres", ["-c", `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`]);
    },
  };
}

export function client(base) {
  return async function call(method, p, { token, body, idem, headers = {}, locale = "ar" } = {}) {
    const h = { "accept-language": locale, ...headers };
    if (token) h.authorization = `Bearer ${token}`;
    if (body !== undefined) h["content-type"] = "application/json";
    if (idem !== false && method !== "GET") h["idempotency-key"] = idem || randomUUID();
    const res = await fetch(base + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
}

let phoneSeq = 0;
export async function signUp(call, { name = "Sara", locale = "ar", languages = ["lang_ar"], tier = "tier_2", topics = ["food", "travel"], q07 = "no", age = "age_25_34", extra = {} } = {}) {
  const phone = `+9745${String(5000000 + (++phoneSeq) * 7919 + Math.floor(Math.random() * 1000)).slice(0, 7)}`;
  const r1 = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: phone, locale, purpose: "login" } });
  const r2 = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r1.body.challenge_id, code: r1.body.dev_code } });
  const token = r2.body.access_token;
  const legal = (await call("GET", "/api/v1/legal/current")).body;
  await call("POST", "/api/v1/users/me/registration", { token, body: { display_name: name, locale, age_eligibility_confirmed: true, woman_confirmed: true,
    consents: ["terms", "conduct", "privacy_notice"].map((t) => ({ type: t, document_version: legal[t].document_version, granted: true })) } });
  const q = (await call("GET", "/api/v1/questionnaires/current", { token })).body;
  const pick = (key, optKeys) => { const qq = q.questions.find((x) => x.key === key); return { question_id: qq.id, option_ids: qq.options.filter((o) => optKeys.includes(o.key)).map((o) => o.id) }; };
  const sub = await call("POST", "/api/v1/questionnaire-responses", { token, body: { questionnaire_version_id: q.questionnaire_version_id, status: "submitted",
    answers: [pick("Q11", [age]), pick("Q01", languages), pick("Q04", [tier]), pick("Q05", topics), pick("Q06", ["opener_question"]), pick("Q07", [q07]),
      ...Object.entries(extra).map(([k, v]) => pick(k, v))] } });
  return { phone, token, userId: r2.body.user.id, refresh: r2.body.refresh_token, questionnaire: q, submit: sub };
}

export async function adminLogin(call, sql, email) {
  const token = "enr_test_" + randomUUID();
  await sql`UPDATE app.admin_users SET enroll_token_hash = ${sha256hex(token)}, enroll_expires_at = now() + interval '1 hour' WHERE email = ${email}`;
  const en = await call("POST", "/api/admin/v1/auth/enroll", { body: { email, enroll_token: token } });
  const lg = await call("POST", "/api/admin/v1/auth/login", { body: { email, totp_code: totpAt(en.body.secret, Date.now()) } });
  return { token: lg.body.access_token, secret: en.body.secret, admin: lg.body.admin };
}

// Checkout URL of a new booking; a booking after the full-refund cut-off first needs the no-refund acknowledgement (audit F1).
export async function checkoutUrlFor(call, token, booking) {
  if (booking.checkout_url) return booking.checkout_url;
  const c = await call("POST", `/api/v1/bookings/${booking.booking_id}/checkout`, { token, body: { acknowledge_late_no_refund: true } });
  if (c.status !== 200) throw new Error("checkout failed: " + JSON.stringify(c.body));
  return c.body.checkout_url;
}

// Pays a pending booking through the mock hosted checkout (the real signed-webhook path).
export async function payViaMock(call, checkoutUrl, outcome = "success") {
  const pi = new URL(checkoutUrl).searchParams.get("pi");
  return call("POST", `/api/mock-psp/checkout/${pi}`, { body: { outcome }, idem: false });
}
