// Browser E2E: the real user web app and admin panel against the real API + PostgreSQL (Chromium via Playwright).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildTemplate, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";
import { sha256hex, totpAt } from "../src/lib/crypto.js";

const SHOTS = process.env.UI_SHOTS || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/qatar-phase4/screens");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let env, browser;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  mkdirSync(SHOTS, { recursive: true });
});
after(async () => { await browser?.close(); await env?.stop(); });

async function newPage(viewport = { width: 360, height: 780 }) {
  const ctx = await browser.newContext({ viewport, locale: "ar-QA" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_FAILED|404/.test(m.text())) errors.push(m.text()); });
  return { page, errors };
}

async function noHorizontalScroll(page) {
  const [sw, cw, culprits] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth,
    [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 1 || r.left < -1; })
      .slice(0, 5).map((e) => `${e.tagName}.${e.className}`)]);
  assert.ok(sw <= cw + 1, `horizontal overflow on ${page.url()}: ${sw} > ${cw} (${culprits.join(", ")})`);
}

async function oneH1(page) {
  assert.equal(await page.locator("main h1").count(), 1, `exactly one h1 on ${page.url()}`);
}

test("user journey in Arabic (RTL, 360px): SCR-01 -> SCR-07 with mock payment", async () => {
  const { page, errors } = await newPage();
  await page.goto(env.base + "/");
  assert.equal(await page.getAttribute("html", "dir"), "rtl");
  await page.waitForSelector("main h1");
  await oneH1(page);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/01-onboarding-ar.png` });
  await page.click("#next"); await page.click("#next");
  await page.click("a[href='#/signin'].btn-primary");
  // SCR-02a
  await page.fill("#phone", "55512345");
  await page.click("#send");
  // SCR-02b (staging shows the dev code)
  await page.waitForSelector("#code");
  const dev = (await page.locator(".banner-warning bdi").innerText()).trim();
  assert.match(dev, /^[0-9]{6}$/);
  await page.screenshot({ path: `${SHOTS}/02-otp-ar.png` });
  await page.fill("#code", dev);
  await page.click("#ver");
  // SCR-02c
  await page.waitForSelector("#age");
  await page.fill("#name", "مريم");
  await page.check("#age");
  for (const t of ["terms", "conduct", "privacy_notice"]) await page.check(`input[name=c][value=${t}]`);
  await page.screenshot({ path: `${SHOTS}/03-consents-ar.png`, fullPage: true });
  await page.click("#go");
  // SCR-03: six cards
  await page.waitForSelector("[role=progressbar]");
  assert.equal(await page.getAttribute("[role=progressbar]", "aria-valuenow"), "1");
  const choose = async (texts) => { for (const t of texts) await page.locator("label.option", { hasText: t }).first().click(); };
  await choose(["العربية"]); await page.screenshot({ path: `${SHOTS}/04-question-q01-ar.png` }); await page.click("#nx");
  await choose(["حتى 200 ر.ق"]); await page.click("#nx");
  await choose(["طعام", "سفر", "تقنية"]);
  assert.equal(await page.locator("label.option", { hasText: "رياضة" }).locator("input").isDisabled(), true, "max 3 enforced");
  await page.click("#nx");
  await choose(["سؤال افتتاحي"]); await page.click("#nx");
  await choose(["أرغب في تواصل خاص"]);
  assert.ok((await page.locator("#note").innerText()).includes("سيتواصل معك فريقنا"));
  await page.click("#nx");
  await choose(["تواصل بعد موافقة متبادلة"]); await page.click("#nx");
  // summary
  await page.waitForSelector("#save");
  await page.screenshot({ path: `${SHOTS}/05-summary-ar.png`, fullPage: true });
  await page.click("#save");
  // SCR-04
  await page.waitForSelector("input[name=s]");
  await noHorizontalScroll(page);
  await page.locator("label.option.radio").first().click();
  await page.screenshot({ path: `${SHOTS}/06-sessions-ar.png`, fullPage: true });
  await page.click("#go");
  // SCR-05
  await page.waitForSelector("#pay");
  assert.ok((await page.locator("main").innerText()).includes("59 ر.ق"));
  assert.match(await page.locator("#clock").innerText(), /^\d\d:\d\d$/);
  await page.screenshot({ path: `${SHOTS}/07-review-ar.png`, fullPage: true });
  await page.click("#pay");
  // mock hosted checkout
  await page.waitForSelector("[data-o=success]");
  await page.screenshot({ path: `${SHOTS}/08-mock-checkout.png`, fullPage: true });
  await page.click("[data-o=success]");
  // SCR-05P -> success
  await page.waitForSelector("text=تم الدفع. نجمع طاولتك الآن.", { timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/09-paid-ar.png` });
  await page.click("a[href='#/home']");
  // SCR-06
  await page.waitForSelector(".hero");
  assert.ok((await page.locator(".hero").innerText()).includes("نجمع طاولتك الآن"));
  await oneH1(page);
  await page.screenshot({ path: `${SHOTS}/10-dashboard-ar.png`, fullPage: true });
  // SCR-07
  await page.click(".hero a.btn-primary");
  await page.waitForSelector("text=تفاصيل اللقاء");
  assert.ok((await page.locator("main").innerText()).includes("نكشف اسم المكان"), "venue hidden while forming");
  await page.screenshot({ path: `${SHOTS}/11-event-forming-ar.png`, fullPage: true });
  // SCR-08a outcome panel
  await page.click("a[href$='/cancel']");
  await page.waitForSelector("text=تأكيد الإلغاء");
  await page.screenshot({ path: `${SHOTS}/12-cancel-ar.png`, fullPage: true });
  // language toggle -> English, LTR
  await page.click("#lang");
  await page.waitForFunction(() => document.documentElement.dir === "ltr");
  await page.waitForSelector("text=Cancel booking");
  await page.screenshot({ path: `${SHOTS}/13-cancel-en.png`, fullPage: true });
  assert.deepEqual(errors, []);
});

test("SCR-10 private report: 'I'm in danger now' opens the 999 screen before submit", async () => {
  const call = client(env.base);
  const u = await signUp(call, { name: "Lina" });
  const [s] = await env.sql`SELECT id FROM app.event_sessions WHERE status = 'on_sale' ORDER BY starts_at LIMIT 1`;
  const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: s.id } });
  await payViaMock(call, b.body.checkout_url);
  const { page, errors } = await newPage();
  await page.goto(env.base + "/");
  await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify("ar")); },
    { access_token: u.token, refresh_token: u.refresh });
  await page.goto(`${env.base}/#/report/${b.body.booking_id}`);
  await page.waitForSelector("#danger");
  await oneH1(page);
  await page.check("#danger");
  const dlg = page.locator(".emergency[role=alertdialog]");
  await dlg.waitFor();
  assert.equal(await dlg.locator("a.call").getAttribute("href"), "tel:999");
  await page.screenshot({ path: `${SHOTS}/14-report-999-ar.png` });
  await page.click("#emc");
  assert.equal(await page.locator(".emergency").count(), 0);
  await page.locator("label.option", { hasText: "تهديد أو عنف" }).click();
  await page.click("#go");
  await page.waitForSelector("text=وصلنا بلاغك");
  await page.locator(".emergency").waitFor();
  await page.screenshot({ path: `${SHOTS}/15-report-sent-ar.png` });
  const [r] = await env.sql`SELECT severity, immediate_danger FROM app.safety_reports WHERE booking_id = ${b.body.booking_id}`;
  assert.deepEqual({ ...r }, { severity: 1, immediate_danger: true });
  assert.deepEqual(errors, []);
});

test("admin: TOTP enrolment, sign-in, sessions cockpit dry-run, T&S reason prompt", async () => {
  const { page, errors } = await newPage({ width: 1280, height: 900 });
  const token = "enr_ui_" + crypto.randomUUID();
  await env.sql`UPDATE app.admin_users SET enroll_token_hash = ${sha256hex(token)}, enroll_expires_at = now() + interval '1 hour' WHERE email = 'ops.oncall@example.test'`;
  await page.goto(env.base + "/admin/#/enroll");
  await page.fill("#em", "ops.oncall@example.test");
  await page.fill("#tok", token);
  await page.click("button[type=submit]");
  const secret = (await page.locator("code.num").innerText()).trim();
  await page.click("a[href='#/login']"); await page.waitForSelector("#code");
  await page.fill("#em", "ops.oncall@example.test");
  await page.fill("#code", totpAt(secret, Date.now()));
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Sessions & Matching", { timeout: 10000 }).catch(async (e) => { throw new Error(e.message + " | page: " + (await page.locator("body").innerText()).slice(0, 400)); });
  await page.screenshot({ path: `${SHOTS}/20-admin-sessions.png`, fullPage: true });
  assert.equal(await page.locator("#nav a", { hasText: "Trust & Safety" }).count(), 0, "ops has no T&S navigation");
  await page.locator("a", { hasText: "Open" }).first().click();
  await page.waitForSelector("#mf");
  await page.click("#mf button[type=submit]");
  await page.waitForSelector("text=dry_run");
  await page.screenshot({ path: `${SHOTS}/21-admin-dry-run.png`, fullPage: true });
  await page.click("#nav a[href='#/live']");
  await page.waitForSelector("text=Tonight board");
  // T&S user: reason prompt before opening a case
  const ts = "enr_ui_ts_" + crypto.randomUUID();
  await env.sql`UPDATE app.admin_users SET enroll_token_hash = ${sha256hex(ts)}, enroll_expires_at = now() + interval '1 hour' WHERE email = 'ts.primary@example.test'`;
  await page.click("#logout");
  await page.goto(env.base + "/admin/#/enroll");
  await page.fill("#em", "ts.primary@example.test"); await page.fill("#tok", ts); await page.click("button[type=submit]");
  const s2 = (await page.locator("code.num").innerText()).trim();
  await page.click("a[href='#/login']"); await page.waitForSelector("#code");
  await page.fill("#em", "ts.primary@example.test"); await page.fill("#code", totpAt(s2, Date.now())); await page.click("button[type=submit]");
  await page.waitForSelector("text=Trust & Safety queue");
  await page.screenshot({ path: `${SHOTS}/22-admin-ts-queue.png`, fullPage: true });
  assert.deepEqual(errors, []);
});
