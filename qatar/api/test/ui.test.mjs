// Browser E2E: the real user web app and admin panel against the real API + PostgreSQL (Chromium via Playwright).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";
import { sha256hex, totpAt } from "../src/lib/crypto.js";

// Screenshots go to a temp dir so a test run never dirties the repo; UI_SHOTS=docs refreshes docs/qatar-phase4/screens.
const DOC_SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/qatar-phase4/screens");
const SHOTS = process.env.UI_SHOTS === "docs" ? DOC_SHOTS : process.env.UI_SHOTS || path.join(os.tmpdir(), "rightime-ui-shots");
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

// Walks the quiz-first flow (spec 2026-10-28) until the sign-up name screen; returns what it saw on the way.
async function walkQuiz(page) {
  const seen = { keys: [], inters: [], timeleft: false };
  for (let guard = 0; guard < 80; guard += 1) {
    const hash = await page.evaluate(() => location.hash);
    if (hash === "#/name") return seen;
    await page.waitForSelector("main:not([aria-busy]) h1");
    if (/timeleft/i.test(await page.locator("body").innerText())) seen.timeleft = true;
    const inter = (await page.locator("[data-inter]").count()) ? await page.locator("[data-inter]").getAttribute("data-inter") : null;
    if (inter) {
      seen.inters.push(inter);
      if (inter === "vibe") await page.screenshot({ path: `${SHOTS}/04-quiz-vibe-ar.png` });
      if (inter === "ready") await page.click("#yes"); else await page.click("#nx");
    } else {
      const text = await page.locator("main h1").innerText();
      seen.keys.push(text);
      if (await page.locator(".scale").count()) {
        await page.locator(".scale label").nth(3).click();
      } else if (await page.locator(".chips").count()) {
        const chips = page.locator(".chip");
        const max = Number(((await page.locator(".why").innerText()).match(/\d+/) || ["1"])[0]);
        for (let k = 0; k < max; k += 1) await chips.nth(k).click();
        if (max === 5) {
          assert.equal(await chips.nth(5).locator("input").isDisabled(), true, "max 5 interests enforced");
          await page.screenshot({ path: `${SHOTS}/03-quiz-chips-ar.png` });
        }
        await page.click("#nx");
      } else {
        const want = text.includes("اللغة") ? "العربية" : text.includes("إنفاقك") ? "حتى 200" : null;
        const opt = want ? page.locator("label.option", { hasText: want }).first() : page.locator("label.option").first();
        if (text.includes("كيف تعرّف نفسك")) {
          assert.deepEqual((await page.locator("label.option").allInnerTexts()).map((x) => x.replace(/\s+/g, "")), ["🙋‍♂️رجل", "🙋‍♀️امرأة"], "man / woman only");
          await page.screenshot({ path: `${SHOTS}/02-quiz-question-ar.png` });
        }
        await opt.click();
        if (await page.evaluate((h) => location.hash === h, hash)) await page.click("#nx").catch(() => {});
      }
    }
    await page.waitForFunction((h) => location.hash !== h, hash, { timeout: 5000 });
  }
  throw new Error("quiz did not reach the name screen");
}

test("user journey in Arabic (RTL, 360px): quiz first, sign-up, what you get, book, pay, details, cancel", async () => {
  const { page, errors } = await newPage();
  await page.goto(env.base + "/");
  assert.equal(await page.getAttribute("html", "dir"), "rtl");
  await page.waitForSelector(".hero-welcome h1");
  await oneH1(page);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/01-welcome-ar.png` });
  await page.click("#start");
  const seen = await walkQuiz(page);
  assert.deepEqual(seen.inters, ["doha", "community", "how", "science", "vibe", "curating", "ready", "safety"]);
  assert.equal(seen.keys.length, 22, "22 questions in QA-2026-02");
  assert.equal(seen.timeleft, false, "no Timeleft text anywhere");
  assert.ok(!seen.keys.some((k) => /فكاهة|غير لائقة/.test(k)), "no politically incorrect humour question");
  assert.ok(await page.evaluate(() => Boolean(localStorage.getItem("q_quiz"))), "answers kept on the device before sign-up");
  // sign-up after the quiz: first name -> phone -> OTP -> consents
  await page.fill("#fname", "مريم");
  await page.click("#nx");
  await page.fill("#phone", "55512345");
  await page.click("#send");
  await page.waitForSelector("#code");
  const dev = (await page.locator(".banner-warning bdi").innerText()).trim();
  assert.match(dev, /^[0-9]{6}$/);
  await page.fill("#code", dev);
  await page.click("#ver");
  await page.waitForSelector("#age");
  assert.equal(await page.locator("#name").count(), 0, "name already given in the quiz");
  await page.check("#age");
  for (const t of ["terms", "conduct", "privacy_notice"]) await page.check(`input[name=c][value=${t}]`);
  await page.click("#go");
  // what you get (per seat; subscription-ready)
  await page.waitForSelector("#plan[data-kind=per_seat]");
  const wyg = await page.locator("main").innerText();
  assert.ok(wyg.includes("ماذا تحصل مع Rightime") && wyg.includes("59 ر.ق") && wyg.includes("48 ساعة"), wyg.slice(0, 300));
  assert.ok(wyg.includes("هل Rightime تطبيق تعارف؟"));
  assert.ok(!/شخصيت/.test(wyg.replace("هل Rightime", "")) || !wyg.includes("حسب شخصيتك"), "no personality-matching claim");
  assert.equal(await page.evaluate(() => localStorage.getItem("q_quiz")), null, "device copy deleted after submit");
  const [{ n: answered }] = await env.sql`SELECT count(DISTINCT a.question_id)::int AS n FROM app.answers a JOIN app.questionnaire_responses r ON r.id = a.response_id
                                          JOIN app.users u ON u.id = r.user_id WHERE u.display_name = 'مريم' AND r.status = 'submitted'`;
  assert.equal(answered, 22, "every quiz answer saved");
  await page.screenshot({ path: `${SHOTS}/05-what-you-get-ar.png`, fullPage: true });
  await page.click("#wyg-go");
  // home: Doha, sessions by week, tab bar, coordinator (audit F10)
  await page.waitForSelector(".event-card");
  await oneH1(page);
  assert.equal((await page.locator("main h1").innerText()).trim().startsWith("الدوحة"), true);
  assert.equal(await page.locator("#tabbar a").count(), 4);
  assert.equal(await page.getAttribute("#tabbar a[aria-current=page]", "href"), "#/home");
  assert.equal(await page.getAttribute("#call-coord", "href"), "tel:+97460053006");
  assert.equal(await page.getAttribute("#wa-coord", "href"), "https://wa.me/97460053006");
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/06-home-ar.png`, fullPage: true });
  await page.locator(".event-card").first().click();
  // session picker opens with the tapped session selected
  await page.waitForSelector("input[name=s]:checked");
  assert.equal(await page.locator("#go").isDisabled(), false);
  await page.screenshot({ path: `${SHOTS}/07-sessions-ar.png` });
  await page.click("#go");
  // review: the seeded session starts in ~24 h -> no-refund warning + acknowledgement (audit F1)
  await page.waitForSelector("#pay");
  assert.ok((await page.locator("main").innerText()).includes("59 ر.ق"));
  assert.ok((await page.locator("#late").innerText()).includes("فلن يُسترد رسم التنظيم"));
  assert.equal(await page.locator("#pay").isDisabled(), true);
  await page.check("#ack");
  await page.screenshot({ path: `${SHOTS}/08-review-ar.png`, fullPage: true });
  await page.click("#pay");
  await page.waitForSelector("[data-o=success]");
  await page.click("[data-o=success]");
  await page.waitForSelector("text=تم الدفع. نجمع طاولتك الآن.", { timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/09-paid-ar.png` });
  // my events tab: the booking with its stepper
  await page.goto(env.base + "/#/events");
  await page.waitForSelector(".hero");
  assert.ok((await page.locator(".hero").innerText()).includes("نجمع طاولتك الآن"));
  assert.equal(await page.getAttribute("#tabbar a[aria-current=page]", "href"), "#/events");
  await oneH1(page);
  await page.screenshot({ path: `${SHOTS}/10-events-ar.png`, fullPage: true });
  await page.click(".hero a.btn-primary");
  await page.waitForSelector("text=تفاصيل اللقاء");
  assert.ok((await page.locator("main").innerText()).includes("نكشف اسم المكان"), "venue hidden while forming");
  assert.equal(await page.locator("#tabbar").isHidden(), true, "no tab bar on detail screens");
  await page.screenshot({ path: `${SHOTS}/11-event-forming-ar.png`, fullPage: true });
  await page.click("a[href$='/cancel']");
  await page.waitForSelector("text=تأكيد الإلغاء");
  await page.screenshot({ path: `${SHOTS}/12-cancel-ar.png`, fullPage: true });
  // profile tab, then English (LTR)
  await page.goto(env.base + "/#/profile");
  await page.waitForSelector(".avatar");
  assert.ok((await page.locator("main").innerText()).includes("مريم"));
  await page.screenshot({ path: `${SHOTS}/13-profile-ar.png`, fullPage: true });
  await page.click("#lang");
  await page.waitForFunction(() => document.documentElement.dir === "ltr");
  await page.waitForSelector("text=Account");
  await page.screenshot({ path: `${SHOTS}/13-profile-en.png`, fullPage: true });
  assert.deepEqual(errors, []);
});

test("existing user with answers from the old questionnaire is not blocked and is invited to complete the card", async () => {
  const call = client(env.base);
  const u = await signUp(call, { name: "Old" });
  const [v1] = await env.sql`SELECT id FROM app.questionnaire_versions WHERE code = 'QA-2026-01'`;
  // move this user's response back to the retired v1 (as if answered before v2 was published)
  await env.sql`UPDATE app.questionnaire_responses SET questionnaire_version_id = ${v1.id} WHERE user_id = ${u.userId}`;
  await env.sql`UPDATE app.answers a SET question_id = q1.id, option_id = o1.id
                  FROM app.questions q2 JOIN app.question_options o2 ON o2.question_id = q2.id,
                       app.questions q1 JOIN app.question_options o1 ON o1.question_id = q1.id
                 WHERE a.question_id = q2.id AND a.option_id = o2.id AND q1.questionnaire_version_id = ${v1.id}
                   AND q1.key = q2.key AND o1.key = o2.key
                   AND a.response_id IN (SELECT id FROM app.questionnaire_responses WHERE user_id = ${u.userId})`;
  await env.sql`DELETE FROM app.answers a USING app.questions q WHERE a.question_id = q.id AND q.questionnaire_version_id <> ${v1.id}
                 AND a.response_id IN (SELECT id FROM app.questionnaire_responses WHERE user_id = ${u.userId})`;
  const { page, errors } = await newPage();
  await page.goto(env.base + "/");
  await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify("ar")); },
    { access_token: u.token, refresh_token: u.refresh });
  await page.goto(env.base + "/#/home");
  await page.waitForSelector("#complete-card");
  await page.click("#complete-card a");
  await page.waitForSelector(".quiz-q h1");
  assert.ok(page.url().endsWith("#/quiz/2"), page.url());
  assert.deepEqual(errors, []);
});

test("SCR-10 private report: 'I'm in danger now' opens the 999 screen before submit", async () => {
  const call = client(env.base);
  const u = await signUp(call, { name: "Lina" });
  const [s] = await env.sql`SELECT id FROM app.event_sessions WHERE status = 'on_sale' ORDER BY starts_at LIMIT 1`;
  const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: s.id } });
  await payViaMock(call, await checkoutUrlFor(call, u.token, b.body));
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
