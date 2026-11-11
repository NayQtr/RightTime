// Sign-in with providers on, as in production (OTP_DEV_MODE false): the member's code goes by SMS (Twilio, item 37), the
// venue's by email (Resend, item 14c), visitors' countries are configurable with an hourly cap (item 38), and the app
// reviewers' fixed number and code work without any SMS (item 11). The providers are fake local servers.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { adminLogin, buildTemplate, client, startTestEnv } from "./helpers.mjs";

const SID = "AC" + "0".repeat(32);
const REVIEW = { phone: "+97455500999", code: "246810" };
let env, call, sql, fake;
const sms = [], mails = [];
const failSmsTo = new Set();
let failMail = false;

before(async () => {
  fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url.startsWith("/2010-04-01/")) {
        const form = new URLSearchParams(body);
        sms.push({ url: req.url, auth: req.headers.authorization, to: form.get("To"), from: form.get("From"), body: form.get("Body") });
        if (failSmsTo.has(form.get("To"))) { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ code: 21211, message: `The 'To' number ${form.get("To")} is not valid` })); return; }
        res.writeHead(201, { "content-type": "application/json" }); res.end(JSON.stringify({ sid: `SM${sms.length}`, status: "queued" }));
      } else {
        mails.push({ url: req.url, auth: req.headers.authorization, ...JSON.parse(body) });
        res.writeHead(failMail ? 500 : 200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: `em_${mails.length}` }));
      }
    });
  });
  await new Promise((r) => fake.listen(0, r));
  const base = `http://127.0.0.1:${fake.address().port}`;
  buildTemplate();
  env = await startTestEnv({ OTP_DEV_MODE: "false",
    SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: "test-twilio-token", TWILIO_FROM: "HerZone", TWILIO_BASE_URL: base,
    PHONE_ALLOWED_COUNTRY_CODES: "974,44", OTP_COUNTRY_HOURLY_CAP: "2",
    REVIEW_PHONE_E164: REVIEW.phone, REVIEW_OTP_CODE: REVIEW.code,
    EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test_key", EMAIL_FROM: "HerZone <venues@herzone.test>", RESEND_BASE_URL: base });
  call = client(env.base);
  sql = env.sql;
});
after(async () => { await env.stop(); fake.close(); });

const codeIn = (text) => /\b(\d{6})\b/.exec(text)[1];
const until = async (f) => { for (let i = 0; i < 250 && !(await f()); i += 1) await new Promise((ok) => setTimeout(ok, 20)); };
const challenges = async () => (await sql`SELECT count(*)::int AS n FROM app.otp_challenges`)[0].n;

test("SMS: the code reaches her phone in her language, never the API answer; it signs her in", async () => {
  const r = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455501234", locale: "ar" } });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.equal(r.body.dev_code, undefined, "production: the code is never in the answer");
  assert.equal(sms.length, 1);
  assert.equal(sms[0].url, `/2010-04-01/Accounts/${SID}/Messages.json`);
  assert.equal(sms[0].auth, `Basic ${Buffer.from(`${SID}:test-twilio-token`).toString("base64")}`);
  assert.deepEqual([sms[0].to, sms[0].from], ["+97455501234", "HerZone"]);
  assert.match(sms[0].body, /^رمز الدخول إلى HerZone: \d{6}\nصالح لمدة 5 دقائق\. لا تشاركيه مع أحد\.$/);
  const v = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r.body.challenge_id, code: codeIn(sms[0].body) } });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  // English when she uses the app in English (or, without a choice, the request's language)
  const en = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455501235" }, locale: "en" });
  assert.equal(en.status, 202);
  assert.match(sms.at(-1).body, /^Your HerZone sign-in code: \d{6}\nIt is valid for 5 minutes\./);
});

test("SMS provider refuses: 503, the challenge can no longer be used but still counts, nothing about the number or code is logged", async () => {
  failSmsTo.add("+97455501236");
  const before = await challenges();
  const lines = [];
  const orig = console.error;
  console.error = (...a) => lines.push(a.join(" "));
  let r;
  try { r = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455501236", locale: "ar" } }); } finally { console.error = orig; }
  assert.equal(r.status, 503, JSON.stringify(r.body));
  assert.equal(r.body.code, "UNAVAILABLE");
  assert.equal(await challenges(), before + 1, "the challenge stays, so it counts toward the limits");
  const [failed] = await sql`SELECT id FROM app.otp_challenges ORDER BY created_at DESC LIMIT 1`;
  const code = codeIn(sms.at(-1).body);
  assert.ok(lines.some((l) => l.includes("400")), lines.join("\n"));
  assert.ok(!lines.join("\n").includes("55501236") && !lines.join("\n").includes(code), "no full number or code in the log");
  assert.equal((await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: failed.id, code } })).status, 410, "the code that was not sent cannot be used");
  // the failed attempt does not hold her back: she can ask again at once
  failSmsTo.delete("+97455501236");
  assert.equal((await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455501236" } })).status, 202);
});

test("countries: an allowed visitor country takes any valid number, with an hourly cap per country; others stay refused", async () => {
  assert.equal((await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+966501234567" } })).body.code, "UNSUPPORTED_COUNTRY");
  assert.equal((await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97412345678" } })).body.code, "INVALID_PHONE", "Qatar keeps its strict pattern");
  const n = sms.length;
  assert.equal((await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+447700900111" } })).status, 202);
  assert.equal((await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+447700900222" } })).status, 202);
  assert.equal(sms.length, n + 2);
  const capped = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+447700900333" } });
  assert.equal(capped.status, 429, "OTP_COUNTRY_HOURLY_CAP = 2 for +44");
  assert.equal(capped.body.code, "OTP_RATE_LIMITED");
  assert.equal(sms.length, n + 2, "no SMS paid for over the cap");
  const [row] = await sql`SELECT country_code FROM app.otp_challenges WHERE country_code = '44' LIMIT 1`;
  assert.equal(row.country_code, "44");
  assert.equal((await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455501237" } })).status, 202, "Qatar has no country cap");
});

test("country cap: parallel requests never pass it, and a refused SMS still counts toward it", async () => {
  // a fresh hour for every limit (the rows stay valid: created and expiry move together)
  await sql`UPDATE app.otp_challenges SET created_at = created_at - interval '2 hours', expires_at = expires_at - interval '2 hours'`;
  failSmsTo.add("+447700900400");
  assert.equal((await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+447700900400" } })).status, 503);
  failSmsTo.delete("+447700900400");
  const n = sms.length;
  const all = await Promise.all([1, 2, 3, 4, 5].map((i) => call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: `+44770090041${i}` } })));
  assert.deepEqual(all.map((r) => r.status).sort(), [202, 429, 429, 429, 429], "OTP_COUNTRY_HOURLY_CAP = 2, one taken by the refused SMS");
  assert.equal(sms.length, n + 1, "no SMS paid for over the cap");
});

test("reviewer: the fixed number gets no SMS and signs in with the fixed code; attempts and audit stay", async () => {
  const n = sms.length;
  const r = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: REVIEW.phone, locale: "en" } });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.equal(r.body.dev_code, undefined);
  assert.equal(sms.length, n, "no SMS for the reviewer's number");
  const wrong = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r.body.challenge_id, code: "000000" } });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.details[0].attempts_remaining, 4, "the attempt limit applies");
  const ok = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r.body.challenge_id, code: REVIEW.code } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const acts = (await sql`SELECT action FROM app.audit_logs WHERE action IN ('review_login_code','review_login') ORDER BY at`).map((x) => x.action);
  assert.deepEqual(acts, ["review_login_code", "review_login"]);
  // five wrong codes lock the challenge, as for anyone
  await sql`UPDATE app.otp_challenges SET created_at = created_at - interval '1 hour'`;
  const r2 = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: REVIEW.phone } });
  for (let i = 0; i < 5; i += 1) assert.equal((await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r2.body.challenge_id, code: "111111" } })).status, 400);
  assert.equal((await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r2.body.challenge_id, code: REVIEW.code } })).status, 423);
  // the fixed code is only for that number
  const other = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97455501238" } });
  assert.equal((await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: other.body.challenge_id, code: REVIEW.code } })).status, 400);
});

test("venue email: the code goes to a registered address only, never on screen; the same answer when the email fails", async () => {
  const ops = await adminLogin(call, sql, "ops.oncall@example.test");
  const [v] = await sql`SELECT id FROM app.venues WHERE is_active LIMIT 1`;
  assert.equal((await call("POST", `/api/admin/v1/venues/${v.id}/portal-users`, { token: ops.token, body: { email: "host@venue.test" } })).status, 201);
  const r = await call("POST", "/api/venue/v1/auth/code:request", { body: { email: "Host@Venue.test" }, idem: false, locale: "ar" });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.equal(r.body.dev_code, undefined, "never shown on screen");
  await until(() => mails.length === 1); // sent after the answer
  assert.equal(mails.length, 1);
  const m = mails[0];
  assert.equal(m.auth, "Bearer re_test_key");
  assert.deepEqual([m.url, m.from, m.to], ["/emails", "HerZone <venues@herzone.test>", ["host@venue.test"]]);
  assert.equal(m.subject, "رمز الدخول إلى صفحة المطاعم الشريكة في HerZone");
  assert.match(m.text, /^رمز الدخول: \d{6}\nصالح لمدة 10 دقائق\./);
  const ok = await call("POST", "/api/venue/v1/auth/code:verify", { body: { email: "host@venue.test", code: codeIn(m.text) }, idem: false });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  // an unknown address: the same answer, and nothing is sent
  const unknown = await call("POST", "/api/venue/v1/auth/code:request", { body: { email: "nobody@venue.test" }, idem: false });
  assert.deepEqual([unknown.status, unknown.body.sent], [202, true]);
  // English when the page is in English
  await call("POST", "/api/venue/v1/auth/code:request", { body: { email: "host@venue.test" }, idem: false, locale: "en" });
  await until(() => mails.length === 2);
  assert.equal(mails.length, 2, "nothing was sent to the unknown address");
  assert.equal(mails.at(-1).subject, "Your HerZone partner venues sign-in code");
  // the provider refuses: the same 202 as for any address (never 503, which would tell a registered one apart); that
  // code cannot be used, and its row stays, so it counts toward the hourly limits
  failMail = true;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM app.venue_login_codes`;
  const bad = await call("POST", "/api/venue/v1/auth/code:request", { body: { email: "host@venue.test" }, idem: false });
  assert.deepEqual([bad.status, bad.body.sent, bad.body.dev_code], [202, true, undefined]);
  await until(() => mails.length === 3);
  const code = codeIn(mails.at(-1).text);
  await until(async () => (await sql`SELECT count(*)::int AS n FROM app.venue_login_codes WHERE expires_at <= now()`)[0].n > 0);
  failMail = false;
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.venue_login_codes`)[0].n, n + 1);
  assert.equal((await call("POST", "/api/venue/v1/auth/code:verify", { body: { email: "host@venue.test", code }, idem: false })).status, 400);
});
