// SMS (lib/sms.js, Twilio) and email (lib/email.js, Resend) senders, and the provisional settings of 10 Nov (items 37, 38,
// 11, 14c, 40): what goes to the provider, what happens when it fails, and that no secret, code or full number is logged.
// No database: the provider is a fake fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPhone, safeBase, sendSms, smsSettings } from "../src/lib/sms.js";
import { emailSettings, sendEmail } from "../src/lib/email.js";
import { ALL_COUNTRIES, blockedCountryCodes, countryCodes } from "../src/lib/config.js";
import { outboundText } from "../src/lib/i18n.js";
import { countryOf, reviewLogin } from "../src/routes/user.js";
import { alertKind, alertPhones, alertText, smsText } from "../src/services/coordinator_alerts.js";

const SID = "AC" + "0123456789abcdef".repeat(2);
const env = (o) => (k) => o[k];
const TWILIO = { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: "tok-secret", TWILIO_FROM: "HerZone" };

// console.error lines written while fn runs
async function logged(fn) {
  const lines = [];
  const orig = console.error;
  console.error = (...a) => lines.push(a.join(" "));
  try { await fn(); } finally { console.error = orig; }
  return lines.join("\n");
}

test("SMS settings: off unless the provider is chosen and every secret is there; TLS only, except this machine", () => {
  assert.equal(smsSettings(env(TWILIO), ""), null, "no provider chosen");
  assert.equal(smsSettings(env(TWILIO), "other"), null, "unknown provider");
  assert.equal(smsSettings(env({ ...TWILIO, TWILIO_AUTH_TOKEN: "" }), "twilio"), null, "token missing");
  assert.equal(smsSettings(env({ ...TWILIO, TWILIO_FROM: "" }), "twilio"), null, "no sender");
  assert.equal(smsSettings(env({ ...TWILIO, TWILIO_ACCOUNT_SID: "AC123" }), "twilio"), null, "not an account SID");
  const s = smsSettings(env(TWILIO), "twilio");
  assert.equal(s.baseUrl, "https://api.twilio.com");
  assert.equal(smsSettings(env({ ...TWILIO, TWILIO_BASE_URL: "http://evil.example" }), "twilio"), null, "plain http elsewhere is refused");
  assert.equal(safeBase("http://127.0.0.1:9/", "x"), "http://127.0.0.1:9");
  assert.equal(safeBase("ftp://x", "x"), null);
});

test("SMS: Twilio Messages API with basic auth, the messaging service preferred over a sender; failures say why without the number", async () => {
  const got = [];
  const ok = async (url, init) => { got.push({ url, init }); return new Response(JSON.stringify({ sid: "SM1", status: "queued" }), { status: 201 }); };
  const s = smsSettings(env({ ...TWILIO, TWILIO_MESSAGING_SERVICE_SID: "MG" + "1".repeat(32) }), "twilio");
  const r = await sendSms({ to: "+97455501234", body: "Code 123456" }, s, { fetchImpl: ok });
  assert.deepEqual(r, { ok: true, status: 201, id: "SM1" });
  assert.equal(got[0].url, `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
  assert.equal(got[0].init.headers.Authorization, `Basic ${Buffer.from(`${SID}:tok-secret`).toString("base64")}`);
  const form = new URLSearchParams(got[0].init.body);
  assert.equal(form.get("To"), "+97455501234");
  assert.equal(form.get("Body"), "Code 123456");
  assert.equal(form.get("MessagingServiceSid"), "MG" + "1".repeat(32));
  assert.equal(form.get("From"), null);

  const refused = async () => new Response(JSON.stringify({ code: 21211, message: "The 'To' number +97455501234 is not valid" }), { status: 400 });
  let res;
  const log = await logged(async () => { res = await sendSms({ to: "+97455501234", body: "Code 123456" }, s, { fetchImpl: refused }); });
  assert.deepEqual(res, { ok: false, status: 400, error: "21211" });
  assert.ok(log.includes("400") && log.includes("+974…34"), log);
  assert.ok(!log.includes("55501234") && !log.includes("123456") && !log.includes("tok-secret"), "no number, code or token in the log");

  const down = async () => { throw new TypeError("fetch failed"); };
  // a provider that never answers (the timer stands for the open connection that keeps a real fetch alive)
  const slow = (url, init) => new Promise((_, reject) => {
    const open = setTimeout(() => {}, 5000);
    init.signal.addEventListener("abort", () => { clearTimeout(open); reject(init.signal.reason); });
  });
  const log2 = await logged(async () => {
    assert.deepEqual(await sendSms({ to: "+97455501234", body: "x" }, s, { fetchImpl: down }), { ok: false, status: 0, error: "network" });
    assert.deepEqual(await sendSms({ to: "+97455501234", body: "x" }, s, { fetchImpl: slow, timeoutMs: 20 }), { ok: false, status: 0, error: "timeout" });
  });
  assert.ok(log2.includes("network") && log2.includes("timeout") && !log2.includes("55501234"), log2);
  assert.equal((await sendSms({ to: "0555", body: "x" }, s, { fetchImpl: ok })).error, "invalid");
  assert.equal((await sendSms({ to: "+97455501234", body: "x" }, null)).error, "not_configured");
  assert.equal(maskPhone("+447700900123"), "+447…23");
});

test("email: Resend with a bearer key, plain text; off without a key or a sender; failures logged without the address", async () => {
  const E = { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "HerZone <venues@herzone.app>" };
  assert.equal(emailSettings(env(E), ""), null);
  assert.equal(emailSettings(env({ ...E, RESEND_API_KEY: "" }), "resend"), null);
  assert.equal(emailSettings(env({ ...E, EMAIL_FROM: "HerZone" }), "resend"), null);
  const s = emailSettings(env(E), "resend");
  const got = [];
  const ok = async (url, init) => { got.push({ url, init }); return new Response(JSON.stringify({ id: "em_1" }), { status: 200 }); };
  assert.deepEqual(await sendEmail({ to: "nobu@venue.test", subject: "S", text: "T 123456" }, s, { fetchImpl: ok }), { ok: true, status: 200, id: "em_1" });
  assert.equal(got[0].url, "https://api.resend.com/emails");
  assert.equal(got[0].init.headers.Authorization, "Bearer re_test_key");
  assert.deepEqual(JSON.parse(got[0].init.body), { from: "HerZone <venues@herzone.app>", to: ["nobu@venue.test"], subject: "S", text: "T 123456" });
  let res;
  const log = await logged(async () => { res = await sendEmail({ to: "nobu@venue.test", subject: "S", text: "T 123456" }, s, { fetchImpl: async () => new Response("{}", { status: 422 }) }); });
  assert.deepEqual(res, { ok: false, status: 422, error: "http" });
  assert.ok(!log.includes("nobu@") && !log.includes("123456") && !log.includes("re_test_key"), log);
});

test("texts: the sign-in SMS in her language, the venue email as the venue page speaks", () => {
  assert.equal(outboundText("SMS_SIGN_IN_CODE", "ar", { code: "123456", minutes: 5 }), "رمز الدخول إلى HerZone: 123456\nصالح لمدة 5 دقائق. لا تشاركيه مع أحد.");
  assert.equal(outboundText("SMS_SIGN_IN_CODE", "en", { code: "123456", minutes: 5 }), "Your HerZone sign-in code: 123456\nIt is valid for 5 minutes. Do not share it with anyone.");
  assert.ok(outboundText("VENUE_CODE_BODY", "ar", { code: "654321", minutes: 10 }).includes("654321"));
  assert.ok(outboundText("SMS_SIGN_IN_CODE", "ar", { code: "123456", minutes: 5 }).length <= 70, "one Arabic SMS segment");
});

test("countries: every country by default; a list narrows it; the longest calling code wins", () => {
  assert.equal(countryCodes("*"), ALL_COUNTRIES);
  assert.equal(countryCodes(""), ALL_COUNTRIES, "no setting = the product default, every country");
  assert.equal(countryCodes("all"), ALL_COUNTRIES, "an unreadable setting keeps the default; narrowing must be deliberate");
  assert.deepEqual(countryCodes("974"), ["974"]);
  assert.deepEqual(countryCodes(" +974, 966,44 ,44"), ["974", "966", "44"]);
  // ALL_COUNTRIES: the built-in table (lib/countries.js) decides, longest code first
  assert.equal(countryOf("+97455501234", ALL_COUNTRIES), "974");
  assert.equal(countryOf("+447700900123", ALL_COUNTRIES), "44");
  assert.equal(countryOf("+966501234567", ALL_COUNTRIES), "966");
  assert.equal(countryOf("+12125550123", ALL_COUNTRIES), "1");
  assert.equal(countryOf("+99912345678", ALL_COUNTRIES), null, "no such calling code");
  // an explicit list
  assert.equal(countryOf("+97455501234", ["974", "44"]), "974");
  assert.equal(countryOf("+966501234567", ["974", "44"]), null);
  assert.equal(countryOf("+12125550123", ["1", "974"]), "1");
});

test("Israel (+972) is always blocked, whatever the settings say (owner, 11 Nov 2026)", () => {
  assert.deepEqual(blockedCountryCodes(""), ["972"]);
  assert.deepEqual(blockedCountryCodes("972"), ["972"], "naming it again changes nothing");
  assert.deepEqual(blockedCountryCodes(" +1 , 44"), ["972", "1", "44"]);
  for (const setting of ["", "all", "*", "974", "972,xx"]) {
    assert.equal(countryOf("+972501234567", countryCodes(setting), blockedCountryCodes(setting)), null, `setting ${JSON.stringify(setting)}`);
  }
  // listing +972 as allowed does not help either
  assert.equal(countryOf("+972501234567", ["972", "974"], blockedCountryCodes("")), null);
  assert.equal(countryOf("+97455501234", countryCodes("*"), blockedCountryCodes("")), "974", "Qatar is unaffected");
});

test("reviewer sign-in: on only with a valid number and a 6-digit code", () => {
  assert.deepEqual(reviewLogin(env({ REVIEW_PHONE_E164: "+974 5550 0999", REVIEW_OTP_CODE: "246810" })), { phone: "+97455500999", code: "246810" });
  assert.equal(reviewLogin(env({ REVIEW_PHONE_E164: "+97455500999", REVIEW_OTP_CODE: "12345" })), null, "5 digits");
  assert.equal(reviewLogin(env({ REVIEW_PHONE_E164: "+97455500999", REVIEW_OTP_CODE: "abcdef" })), null);
  assert.equal(reviewLogin(env({ REVIEW_OTP_CODE: "246810" })), null, "no number");
  assert.equal(reviewLogin(env({ REVIEW_PHONE_E164: "55500999", REVIEW_OTP_CODE: "246810" })), null, "not E.164");
  assert.equal(reviewLogin(() => undefined), null);
});

test("coordinator alerts: which reports page, the numbers, and texts without report content", () => {
  assert.equal(alertKind({ danger: true, severity: 1, timing: "after" }), "immediate_danger");
  assert.equal(alertKind({ danger: false, severity: 1, timing: "during" }), "report_during");
  assert.equal(alertKind({ danger: false, severity: 2, timing: "during" }), "report_during");
  assert.equal(alertKind({ danger: false, severity: 3, timing: "during" }), null, "S3");
  assert.equal(alertKind({ danger: false, severity: 1, timing: "after" }), null, "after the meetup");
  assert.deepEqual(alertPhones(env({ COORDINATOR_ALERT_PHONES: " +974 5550 1111,+97455502222, bad ,+97455502222" })), ["+97455501111", "+97455502222"]);
  assert.deepEqual(alertPhones(() => undefined), []);
  const a = { kind: "report_during", severity: 2, case_ref: "TS-2026-0007" };
  assert.equal(alertText(a, "first", 5), "S2 safety report during a meetup (TS-2026-0007). Open the admin console and acknowledge.");
  assert.equal(alertText({ ...a, kind: "immediate_danger", severity: 1 }, "escalation", 5),
    "Not acknowledged after 5 min: immediate danger reported at a meetup (S1, TS-2026-0007). Open the admin console and acknowledge.");
  assert.ok(smsText(alertText(a, "first", 5), "https://herzone.app").endsWith("https://herzone.app/admin/#/alerts"));
  assert.ok(smsText(alertText({ ...a, kind: "immediate_danger" }, "escalation", 5), "https://herzone.app").length <= 200);
});
