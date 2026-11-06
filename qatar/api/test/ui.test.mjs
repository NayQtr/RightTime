// Browser E2E: the real user web app and admin panel against the real API + PostgreSQL (Chromium via Playwright).
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signInAgain, signUp, startTestEnv } from "./helpers.mjs";
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

const CSP = JSON.parse(readFileSync(new URL("../../web/vercel.json", import.meta.url))).headers
  .flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;

async function newPage(viewport = { width: 360, height: 780 }) {
  const ctx = await browser.newContext({ viewport, locale: "ar-QA" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // pages are served with the production Content-Security-Policy from vercel.json (with this server's API origin), so a
  // blocked script or style shows up here as a console error (NMX-31)
  await ctx.route((url) => url.origin === env.base && !url.pathname.startsWith("/api/") && /(\.html|\/)$/.test(url.pathname), async (r) => {
    const res = await r.fetch();
    await r.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": CSP.replace("connect-src 'self'", `connect-src 'self' ${env.base}`) } });
  });
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
  await cleanLayout(page);
}

// Nothing covers anything else in a bar or row, and no label spills out of its box (owner, 6 Nov: the test-site label
// covered the logo on an iPhone). Waits for entrance animations to settle first.
async function cleanLayout(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  const problems = await page.evaluate(() => {
    const out = [];
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.opacity !== "0"; };
    const name = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).join(".") : ""}`;
    for (const bar of document.querySelectorAll(".topbar, .tabbar, .quiz-foot, .sticky-bar, .quiz-head, .row, .brand, .det-head, .cs-group")) {
      if (!vis(bar)) continue;
      const kids = [...bar.children].filter(vis), br = bar.getBoundingClientRect();
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect();
        if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.push(`overlap in ${name(bar)}: ${name(kids[i])} / ${name(kids[j])}`);
      }
      if (bar.matches(".topbar, .tabbar")) for (const k of kids) { const r = k.getBoundingClientRect(); if (r.left < br.left - 1 || r.right > br.right + 1) out.push(`${name(k)} sticks out of ${name(bar)}`); }
    }
    for (const e of document.querySelectorAll("button, a, .btn, label, h1, h2, h3, .chip, .badge, .env-badge, .brand-name, .option")) {
      if (!vis(e)) continue;
      const cs = getComputedStyle(e);
      if (cs.overflowX !== "visible" || cs.display === "inline") continue;
      if (e.scrollWidth > e.clientWidth + 2) out.push(`text spills out of ${name(e)}: ${e.scrollWidth} > ${e.clientWidth}`);
    }
    return out;
  });
  assert.deepEqual(problems, [], `clean layout on ${page.url()}`);
}

async function oneH1(page) {
  assert.equal(await page.locator("main h1").count(), 1, `exactly one h1 on ${page.url()}`);
}

// Walks the quiz-first flow (spec 2026-10-28) until the sign-up name screen; returns what it saw on the way.
async function walkQuiz(page) {
  const seen = { keys: [], inters: [], timeleft: false, dataText: "" };
  let prev = null; // the previous screen (heading + interstitial); the router renders a moment after the hash changes
  for (let guard = 0; guard < 80; guard += 1) {
    const hash = await page.evaluate(() => location.hash);
    if (hash === "#/name") return seen;
    await page.waitForSelector("main:not([aria-busy]) h1");
    if (prev) await page.waitForFunction((p) => {
      const h = document.querySelector("main h1"), i = document.querySelector("[data-inter]");
      return `${h ? h.textContent : ""}|${i ? i.getAttribute("data-inter") : ""}` !== p;
    }, prev, { timeout: 5000 }).catch(() => {});
    const now = await page.evaluate(() => {
      const h = document.querySelector("main h1"), i = document.querySelector("[data-inter]");
      return { key: `${h ? h.textContent : ""}|${i ? i.getAttribute("data-inter") : ""}`, inter: i ? i.getAttribute("data-inter") : null };
    });
    prev = now.key;
    if (/timeleft/i.test(await page.locator("body").innerText())) seen.timeleft = true;
    const inter = now.inter;
    if (inter) {
      seen.inters.push(inter);
      if (inter === "vibe") await page.screenshot({ path: `${SHOTS}/04-quiz-vibe-ar.png` });
      if (inter === "energy") await page.screenshot({ path: `${SHOTS}/04b-quiz-energy-ar.png` });
      if (inter === "data") { seen.dataText = await page.locator("main").innerText(); await page.waitForTimeout(400); await noHorizontalScroll(page); await page.screenshot({ path: `${SHOTS}/04c-quiz-data-ar.png` }); }
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
        if (text.includes("فئتك العمرية")) {
          await page.screenshot({ path: `${SHOTS}/02-quiz-question-ar.png` });
          // "18–24" must read left to right inside Arabic text (it used to render as "24–18")
          const range = page.locator("label.option bdi[dir=ltr]", { hasText: "18–24" });
          assert.equal(await range.count(), 1, "age range is isolated left to right");
          const box = await range.boundingBox();
          const [a18, a24] = await Promise.all(["18", "24"].map((d) => range.evaluate((el, d) => {
            const t = el.firstChild, i = t.textContent.indexOf(d), r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + d.length);
            return r.getBoundingClientRect().x; }, d)));
          assert.ok(box && a18 < a24, "18 is drawn left of 24");
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
  // light or dark by choice: one tap switches, the choice survives a reload, the next tap switches back
  const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim());
  assert.equal(await bg(), "#F2D9ED", "light by default");
  assert.equal(await page.getAttribute("#theme", "aria-label"), "الوضع الداكن");
  await page.click("#theme");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark"); // revealed through a growing circle
  assert.equal(await page.getAttribute("html", "data-theme"), "dark");
  assert.equal(await bg(), "#3A2C39");
  assert.equal(await page.getAttribute("#theme", "aria-label"), "الوضع العادي");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "theme", "focus stays on the switch");
  await page.reload();
  await page.waitForSelector(".hero-welcome h1");
  assert.equal(await bg(), "#3A2C39", "the choice is remembered");
  assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), "#3A2C39", "browser bar follows");
  await page.click("#theme");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light");
  assert.equal(await bg(), "#F2D9ED");
  assert.equal(await page.getAttribute("html", "data-theme"), "light");
  await page.click("#start");
  await page.waitForSelector(".hero-welcome", { state: "detached" }); // the quiz has replaced the welcome screen
  const seen = await walkQuiz(page);
  assert.deepEqual(seen.inters, ["doha", "community", "how", "energy", "science", "vibe", "curating", "ready", "safety", "data"]);
  assert.ok(seen.dataText.includes("لنتحدث عن بياناتك") && seen.dataText.includes("لا يرين رقمكِ ولا إجاباتكِ"), "data screen before sign-up");
  assert.equal(seen.keys.length, 20, "20 questions in QA-2026-04");
  assert.ok(seen.keys.includes("ما الذي تبحثين عنه؟") && !seen.keys.some((k) => k.includes("تعرّف نفسك")), "addressed to a woman, no gender question");
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
  assert.ok((await page.locator("main").innerText()).includes("HerZone للنساء فقط."));
  await page.check("#age");
  for (const t of ["terms", "conduct", "privacy_notice"]) await page.check(`input[name=c][value=${t}]`);
  await page.click("#go");
  await page.waitForSelector("#err .banner");
  assert.ok((await page.locator("#err").innerText()).includes("للنساء فقط"), "the women-only confirmation is required");
  await page.check("#woman");
  for (const t of ["terms", "conduct", "privacy_notice"]) await page.check(`input[name=c][value=${t}]`);
  await page.click("#go");
  // turn on notifications (once, right after the first sign-up), then what you get
  await page.waitForSelector("[data-screen=notify]");
  await oneH1(page);
  await noHorizontalScroll(page);
  const notify = await page.locator("main").innerText();
  assert.ok(notify.includes("فعّلي الإشعارات") && notify.includes("لديكِ تحديث جديد في HerZone") && notify.includes("شاشة القفل"), notify.slice(0, 200));
  assert.equal(await page.locator("#push-go").count(), 1, "Chromium supports Web Push: the enable button is offered");
  assert.equal((await page.locator("#toast").innerText()).trim(), "حفظنا إجاباتك.", "the save confirmation shows on the next screen");
  await page.screenshot({ path: `${SHOTS}/04d-notify-ar.png` });
  await page.click("#skip-push");
  // what you get (per seat; subscription-ready)
  await page.waitForSelector("#plan[data-kind=per_seat]");
  const wyg = await page.locator("main").innerText();
  assert.ok(wyg.includes("ماذا تحصلين مع HerZone") && wyg.includes("59 ر.ق") && wyg.includes("48 ساعة"), wyg.slice(0, 300));
  assert.ok(wyg.includes("هل HerZone تطبيق تعارف؟") && wyg.includes("طاولة من 4 إلى 6 سيدات"));
  assert.ok(!/Rightime/.test(wyg), "old name gone");
  assert.ok(wyg.includes("يشبهنكِ في القيم والشخصية والاهتمامات"), "copy describes personality matching (r2, owner-approved wording)");
  assert.ok((await page.locator("#wyg-sum").innerText()).includes("59 ر.ق"), "price summary above the button");
  assert.equal(await page.evaluate(() => localStorage.getItem("q_quiz")), null, "device copy deleted after submit");
  const [{ n: answered }] = await env.sql`SELECT count(DISTINCT a.question_id)::int AS n FROM app.answers a JOIN app.questionnaire_responses r ON r.id = a.response_id
                                          JOIN app.users u ON u.id = r.user_id WHERE u.display_name = 'مريم' AND r.status = 'submitted'`;
  assert.equal(answered, 20, "every quiz answer saved");
  await page.screenshot({ path: `${SHOTS}/05-what-you-get-ar.png`, fullPage: true });
  // the fixed bottom button never covers the last content (spec 2026-10-29 §4)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const [lastBottom, footTop] = await page.evaluate(() => {
    const items = [...document.querySelectorAll("main > *:not(.quiz-foot)")];
    return [Math.max(...items.map((e) => e.getBoundingClientRect().bottom)), document.querySelector(".quiz-foot").getBoundingClientRect().top];
  });
  assert.ok(lastBottom <= footTop + 1, `content (${lastBottom}) hidden under the bottom button (${footTop})`);
  await page.click("#wyg-go");
  // home: Doha, sessions by week, tab bar, coordinator (audit F10)
  await page.waitForSelector(".event-card");
  assert.equal((await page.locator("#toast").innerText()).trim(), "", "a toast does not follow the member to a second screen");
  assert.equal(await page.locator("main .icon-btn[href='#/inbox']").count(), 0, "notifications are reached from the tab bar only");
  await oneH1(page);
  assert.equal((await page.locator("main h1").innerText()).trim().startsWith("الدوحة"), true);
  assert.equal(await page.locator("#tabbar a").count(), 4);
  assert.equal(await page.getAttribute("#tabbar a[aria-current=page]", "href"), "#/home");
  await noHorizontalScroll(page);
  // the coordinator: one "request contact" button; pressing it blurs the page (owner's design, 5 Nov)
  await page.click("#contact-open");
  await page.waitForSelector("dialog.contact-sheet[open]");
  // level 1: phone call, and a WhatsApp chat, one above the other
  assert.equal((await page.locator("dialog.contact-sheet [data-go=phone] span").innerText()).trim(), "اتصال هاتفي");
  assert.equal((await page.locator("#wa-coord span").innerText()).trim(), "محادثة واتساب");
  const [phoneBox, waBox] = await Promise.all([page.locator("[data-go=phone]").boundingBox(), page.locator("#wa-coord").boundingBox()]);
  assert.ok(phoneBox.y + phoneBox.height <= waBox.y, "the two options stand one above the other");
  // the WhatsApp chat opens with her name (no booking yet: no number)
  const waHref = await page.getAttribute("#wa-coord", "href");
  assert.ok(waHref.startsWith("https://wa.me/97460053006?text="));
  assert.equal(decodeURIComponent(waHref.split("?text=")[1]), "مرحباً ، انا مريم ، لدي مشكلة/طلب");
  await page.screenshot({ path: `${SHOTS}/06b-contact-sheet-ar.png` });
  // level 2: the phone call offers a request, and "call us now" (dials the coordinator at once)
  await page.click("[data-go=phone]");
  const lvl2 = await page.locator("dialog.contact-sheet").innerText();
  assert.ok(lvl2.includes("طلب تواصل") && lvl2.includes("شرح بسيط للمشكلة/الطلب قبل التواصل"), lvl2);
  assert.ok(lvl2.includes("اتصل بنا الان") && lvl2.includes("سوف تتصل بنا هاتفيا فوراً"), lvl2);
  assert.equal(await page.locator("dialog.contact-sheet [data-go=phone]").count(), 0, "the first two options are gone");
  assert.equal(await page.getAttribute("#call-coord", "href"), "tel:+97460053006", "dials the coordinator");
  await page.screenshot({ path: `${SHOTS}/06c-contact-phone-ar.png` });
  // level 3: the request: a note, the number to confirm, and when
  await page.click("[data-go=form]");
  assert.equal(await page.inputValue("#cs-phone"), "+97455512345", "her number, to confirm");
  assert.deepEqual(await page.locator("dialog.contact-sheet .cs-when .chip span").allInnerTexts(), ["الان", "بعد 10 دقايق", "بعد ساعة", "غدا"]);
  await page.click("dialog.contact-sheet button[type=submit]");
  await page.waitForSelector("dialog.contact-sheet .banner-danger"); // no note yet
  assert.equal((await env.sql`SELECT count(*)::int AS n FROM app.call_requests`)[0].n, 0, "nothing is sent without a note");
  await page.fill("#cs-msg", "الطاولة تغيّرت ولم يخبرني أحد");
  await page.click("dialog.contact-sheet .chip:has-text('بعد ساعة')");
  await page.screenshot({ path: `${SHOTS}/06d-contact-form-ar.png` });
  await page.click("dialog.contact-sheet button[type=submit]");
  await page.waitForSelector("dialog.contact-sheet .banner-success");
  assert.ok((await page.locator("dialog.contact-sheet").innerText()).includes("وصلنا طلبك"));
  const sent = (await env.sql`SELECT callback_when, contact_phone_enc, message_enc FROM app.call_requests`)[0];
  assert.equal(sent.callback_when, "1h");
  assert.equal(sent.contact_phone_enc, null, "she confirmed her own number: nothing extra is stored");
  assert.ok(sent.message_enc, "the note is stored (encrypted)");
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog.contact-sheet", { state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "contact-open", "focus returns to the button");
  // design audit (5 Nov): the week ribbon's days are 44 px targets and no label in the shell is under 12 px
  const small = await page.evaluate(() => ({
    days: [...document.querySelectorAll(".week button")].filter((e) => e.getBoundingClientRect().width < 43.5).length,
    tabs: [...document.querySelectorAll(".tabbar a, .week button")].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).length }));
  assert.deepEqual(small, { days: 0, tabs: 0 }, "day targets >= 44 px wide, tab and day labels >= 12 px");
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
  await page.waitForSelector(".all-set h1:has-text('كل شيء جاهز')");
  assert.equal(await page.locator(".booking-peek").count(), 1, "the booked meetup is shown as a card");
  await page.screenshot({ path: `${SHOTS}/09-paid-ar.png` });
  // my events tab: the booking with its stepper
  await page.goto(env.base + "/#/events");
  await page.waitForSelector(".hero");
  assert.ok((await page.locator(".hero").innerText()).includes("نجمع طاولتك الآن"));
  assert.equal(await page.getAttribute("#tabbar a[aria-current=page]", "href"), "#/events");
  await oneH1(page);
  // the filled "next meetup" card: every text on it is readable (>= 4.5:1), whatever the theme
  const lows = await page.evaluate(() => {
    const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const rgba = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = "#000"; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const card = document.querySelector(".card.hero"); if (!card) return ["no hero card"];
    const bg = rgba(getComputedStyle(card).backgroundColor).slice(0, 3); const out = [];
    card.querySelectorAll("h2, strong, .caption, p, .badge, .stepper li, .btn").forEach((el) => {
      const cs = getComputedStyle(el); let f = rgba(cs.color); const under = el.matches(".badge, .btn") ? rgba(cs.backgroundColor) : [...bg, 1];
      const base = el.matches(".badge") ? [0, 1, 2].map((i) => under[i] * under[3] + bg[i] * (1 - under[3])) : under.slice(0, 3);
      const fg = [0, 1, 2].map((i) => f[i] * f[3] + base[i] * (1 - f[3]));
      const r = (Math.max(lum(fg), lum(base)) + 0.05) / (Math.min(lum(fg), lum(base)) + 0.05);
      if (r < 4.5) out.push(`${el.className || el.tagName} ${r.toFixed(2)}`);
    });
    return out;
  });
  assert.deepEqual(lows, [], "text on the filled next-meetup card is readable");
  await page.screenshot({ path: `${SHOTS}/10-events-ar.png`, fullPage: true });
  // NMX-18: unread count on the Notifications tab until the inbox is opened; the logo is 48px
  assert.equal(Math.round((await page.locator(".brand .mark").boundingBox()).width), 48);
  const [{ n: notes }] = await env.sql`SELECT count(*)::int AS n FROM app.notifications_outbox o JOIN app.users u ON u.id = o.user_id WHERE u.display_name = 'مريم'`;
  if (notes > 0) {
    await page.waitForSelector("#inbox-badge:not([hidden])");
    assert.equal(await page.locator("#inbox-badge").innerText(), notes > 9 ? "9+" : String(notes));
    await page.screenshot({ path: `${SHOTS}/10b-inbox-badge-ar.png` });
    await page.click("#tabbar a[href='#/inbox']");
    await page.waitForSelector(".list .is-new");
    await page.goto(env.base + "/#/events");
    await page.waitForSelector(".hero");
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#inbox-badge").isHidden(), true, "badge cleared after the inbox was opened");
  }
  await page.click(".hero a.btn-primary");
  await page.waitForSelector(".det-head h1");
  assert.ok((await page.locator("main").innerText()).includes("نكشف اسم المكان"), "venue hidden while forming");
  assert.equal(await page.locator("#tabbar").isHidden(), true, "no tab bar on detail screens");
  await page.screenshot({ path: `${SHOTS}/11-event-forming-ar.png`, fullPage: true });
  await page.click("#contact-open");
  await page.waitForFunction(() => decodeURIComponent(document.querySelector("#wa-coord").href).includes("#RT-"));
  assert.match(decodeURIComponent((await page.getAttribute("#wa-coord", "href")).split("?text=")[1]), /^مرحباً ، انا مريم #RT-[A-Z0-9]+ ، لدي مشكلة\/طلب$/, "her name and her booking's number");
  await page.keyboard.press("Escape");
  // NMX-16: with no connection the details open from the copy saved on this device, read-only
  const detailsUrl = page.url();
  await page.route(/\/api\/v1\//, (r) => r.abort());
  await page.goto(detailsUrl.replace("/#", "/?offline=1#"));
  await page.waitForSelector("#offline-copy");
  const offlineText = await page.locator("main").innerText();
  assert.ok(offlineText.includes("نكشف اسم المكان") && offlineText.includes("أنتِ غير متصلة"), offlineText.slice(0, 300));
  assert.equal(await page.locator("a[href$='/cancel']").count(), 0, "no cancel while offline");
  await page.click("#contact-open");
  assert.ok((await page.getAttribute("#wa-coord", "href")).startsWith("https://wa.me/97460053006"), "WhatsApp is still offered from the saved copy");
  await page.click("[data-go=phone]");
  assert.equal(await page.getAttribute("#call-coord", "href"), "tel:+97460053006", "she can still call the coordinator with no data");
  await page.click("[data-go=form]");
  await page.fill("#cs-msg", "no connection");
  await page.click("dialog.contact-sheet button[type=submit]");
  await page.waitForSelector("dialog.contact-sheet .banner-danger"); // the request cannot be sent, and she is told
  assert.equal((await env.sql`SELECT count(*)::int AS n FROM app.call_requests`)[0].n, 1, "nothing new was recorded");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${SHOTS}/11b-event-offline-ar.png`, fullPage: true });
  await page.unroute(/\/api\/v1\//);
  await page.goto(detailsUrl);
  await page.waitForSelector("a[href$='/cancel']");
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
  assert.equal(errors.filter((e) => e.includes("status of 422")).length, 1, "the sign-up refused without the women-only confirmation");
  assert.deepEqual(errors.filter((e) => !e.includes("status of 422")), []);
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

test("auto-save: a dropped request is retried, an unfinished quiz resumes where it stopped, start over clears the device copy", async () => {
  const { page, errors } = await newPage();
  let dropped = 0;
  await page.route(/questionnaires\/preview/, (r) => (dropped++ === 0 ? r.abort("connectionreset") : r.continue()));
  await page.goto(env.base + "/");
  assert.equal(await page.locator("#resume-card").count(), 0, "nothing saved yet");
  assert.ok((await page.locator(".device-note").innerText()).includes("على هذا الجهاز فقط"));
  await page.click("#start");
  await page.waitForSelector("[data-inter=doha]");
  assert.equal(dropped, 2, "the dropped preview request was retried once");
  await page.click("#nx");
  await page.waitForSelector("[data-inter=community]");
  await page.click("#nx");
  await page.waitForSelector(".quiz-q h1");
  await page.locator("label.option").first().click();
  await page.click("#nx");
  await page.waitForFunction(() => location.hash === "#/quiz/3");
  await page.locator("label.option", { hasText: "25–34" }).click();
  await page.waitForFunction(() => location.hash === "#/quiz/4");
  // leave and come back later: the welcome screen offers to continue at the same question
  await page.goto(env.base + "/");
  await page.waitForSelector("#resume-card");
  assert.ok((await page.locator("#resume-card").innerText()).includes("الإجابات المحفوظة على هذا الجهاز: 2"));
  assert.equal(await page.getAttribute("#resume", "href"), "#/quiz/4");
  await page.screenshot({ path: `${SHOTS}/14-resume-ar.png` });
  await page.click("#resume");
  await page.waitForFunction(() => location.hash === "#/quiz/4");
  await page.goto(env.base + "/#/quiz/3");
  await page.waitForSelector(".quiz-q h1");
  assert.equal(await page.locator("input[data-key=age_25_34]").isChecked(), true, "earlier answer kept");
  // start over
  await page.goto(env.base + "/");
  await page.click("#over");
  await page.waitForSelector("[data-inter=doha]");
  assert.equal(await page.evaluate(() => localStorage.getItem("q_quiz")), null);
  await page.goto(env.base + "/");
  await page.waitForSelector(".hero-welcome h1");
  assert.equal(await page.locator("#resume-card").count(), 0, "start over leaves nothing to resume");
  // a reload on the code screen keeps the pending code and the typed number
  await page.goto(env.base + "/#/signin");
  await page.fill("#phone", "55512399");
  await page.click("#send");
  await page.waitForSelector("#code");
  assert.equal(await page.evaluate(() => localStorage.getItem("q_phone")), null, "a plain sign-in keeps no phone number on the device");
  await page.reload();
  await page.waitForSelector("#code");
  assert.ok((await page.locator("main").innerText()).includes("+97455512399"));
  const dev = (await page.locator(".banner-warning bdi").innerText()).trim();
  await page.fill("#code", dev);
  await page.click("#ver");
  await page.waitForSelector("#age");
  assert.deepEqual(errors.filter((e) => !e.includes("ERR_CONNECTION_RESET")), [], "only the request dropped on purpose");
});

test("auto-save when signed in: an edited answer is saved as a server draft and shows up on another device", async () => {
  const call = client(env.base);
  const u = await signUp(call, { name: "Draft" });
  const signIn = async () => {
    const { page, errors } = await newPage();
    await page.goto(env.base + "/");
    await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); }, await signInAgain(call, env.sql, u.phone));
    return { page, errors };
  };
  const a = await signIn();
  await a.page.goto(env.base + "/#/quiz/5");
  await a.page.waitForSelector("input[data-key=extrovert]");
  const stored = await a.page.evaluate(() => JSON.parse(localStorage.getItem("q_tokens")));
  assert.ok(stored.refresh_token && !("access_token" in stored), "the access token is kept in memory only, never in storage (NMX-17)");
  await a.page.locator("label.option", { has: a.page.locator("input[data-key=extrovert]") }).click();
  await a.page.waitForFunction(() => location.hash === "#/quiz/6");
  let draft = [];
  for (let k = 0; k < 20 && !draft.length; k += 1) {
    await a.page.waitForTimeout(250);
    draft = await env.sql`SELECT o.key FROM app.questionnaire_responses r JOIN app.answers x ON x.response_id = r.id
                            JOIN app.questions q ON q.id = x.question_id AND q.key = 'Q12' JOIN app.question_options o ON o.id = x.option_id
                           WHERE r.user_id = ${u.userId} AND r.status = 'draft'`;
  }
  assert.deepEqual(draft.map((d) => d.key), ["extrovert"], "draft saved on the server");
  const b = await signIn();
  await b.page.goto(env.base + "/#/quiz/5");
  await b.page.waitForSelector("input[data-key=extrovert]");
  assert.equal(await b.page.locator("input[data-key=extrovert]").isChecked(), true, "the other device continues from the draft");
  assert.deepEqual([...a.errors, ...b.errors], []);
});

test("women only: an account from before the change confirms once on home, then the banner is gone", async () => {
  const call = client(env.base);
  const u = await signUp(call, { name: "Hind" });
  await env.sql`UPDATE app.users SET woman_confirmed_at = NULL WHERE id = ${u.userId}`;
  const { page, errors } = await newPage();
  await page.goto(env.base + "/");
  await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify("ar")); },
    { access_token: u.token, refresh_token: u.refresh });
  await page.goto(env.base + "/#/home");
  await page.waitForSelector("#woman-upd");
  assert.ok((await page.locator("#woman-upd").innerText()).includes("HerZone أصبحت للنساء فقط"));
  await page.click("#woman-ok");
  await page.waitForSelector(".event-card");
  await page.waitForFunction(() => !document.querySelector("#woman-upd"));
  const [{ at }] = await env.sql`SELECT woman_confirmed_at AS at FROM app.users WHERE id = ${u.userId}`;
  assert.ok(at);
  assert.deepEqual(errors, []);
});

test("subscription plans (display-only): QAR plan cards, 1-month nudge, promo code check, guarantee, coming soon", async () => {
  const call = client(env.base);
  const owner = await adminLogin(call, env.sql, "owner@example.test");
  assert.equal((await call("POST", "/api/admin/v1/promo-codes", { token: owner.token, body: { code: "HERZONE10", percent_off: 10 } })).status, 201);
  const u = await signUp(call, { name: "Reem" });
  const { page, errors } = await newPage();
  await page.goto(env.base + "/");
  await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify("ar")); },
    { access_token: u.token, refresh_token: u.refresh });
  await page.goto(env.base + "/#/plans");
  await page.waitForSelector(".plan[data-plan=m3].on");
  await oneH1(page);
  const m3 = await page.locator(".plan[data-plan=m3]").innerText();
  assert.ok(m3.includes("119.99 ر.ق") && m3.includes("155.97 ر.ق") && m3.includes("وفّري 23%") && m3.includes("10.00 ر.ق في الأسبوع") && m3.includes("الأكثر اختيارًا"), m3);
  assert.ok((await page.locator(".plan[data-plan=m12]").innerText()).includes("وفّري 64%"));
  assert.equal(await page.locator("#plan-go").isDisabled(), true, "nothing can be bought yet");
  assert.ok((await page.locator("main").innerText()).includes("بدون تجديد تلقائي") && (await page.locator(".guarantee").innerText()).includes("14 يومًا"));
  await page.locator(".plan[data-plan=m1]").click();
  await page.waitForSelector("#nudge-go");
  await page.click("#nudge-go");
  await page.waitForSelector(".plan[data-plan=m3].on");
  await page.fill("#promo", "herzone10");
  await page.click("#promo-go");
  await page.waitForSelector("#promo-msg .banner-success");
  assert.ok((await page.locator(".plan[data-plan=m3]").innerText()).includes("107.99 ر.ق"), "10% off shown");
  assert.ok((await page.locator("#plan-sum").innerText()).includes("107.99 ر.ق"));
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/14-plans-ar.png`, fullPage: true });
  await page.fill("#promo", "NOPE");
  await page.click("#promo-go");
  await page.waitForSelector("#promo-msg .banner-danger");
  assert.ok((await page.locator(".plan[data-plan=m3]").innerText()).includes("119.99 ر.ق"), "back to the full price");
  assert.deepEqual(errors, []);
});

test("phone notifications: an iPhone in a Safari tab gets the short 'not supported' note (no home-screen steps); Profile opens the screen", async () => {
  const call = client(env.base);
  const u = await signUp(call, { name: "Dana" });
  const { page, errors } = await newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
    delete window.PushManager;
  });
  await page.goto(env.base + "/");
  await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify("ar")); },
    { access_token: u.token, refresh_token: u.refresh });
  await page.goto(env.base + "/#/profile");
  await page.click("a[href='#/notify?next=profile']");
  await page.waitForSelector("[data-screen=notify]");
  const t = await page.locator("main").innerText();
  assert.ok(!t.includes("الشاشة الرئيسية"), "no Home Screen steps (owner's decision, 5 Nov)");
  assert.ok(t.includes("هذا المتصفح لا يدعم إشعارات الجوال"), t.slice(0, 300));
  assert.equal(await page.locator("#push-go").count(), 0, "no enable button where the browser cannot do it");
  await page.screenshot({ path: `${SHOTS}/13b-notify-iphone-ar.png` });
  await page.click("#skip-push");
  await page.waitForFunction(() => location.hash === "#/profile");
  const man = await (await fetch(env.base + "/manifest.webmanifest")).json();
  assert.equal(man.display, "standalone");
  assert.ok((await (await fetch(env.base + "/sw.js")).text()).includes("showNotification"));
  assert.deepEqual(errors, []);
});

test("document updates (privacy notice and terms): existing users see them on home, read them and accept once", async () => {
  const call = client(env.base);
  const u = await signUp(call, { name: "Notice" });
  await env.sql`INSERT INTO app.legal_documents (version, type, text_ar, text_en, published_at)
                VALUES ('privacy-ui-3', 'privacy', 'نص إشعار الخصوصية المحدّث', 'Updated privacy notice text', now()),
                       ('terms-ui-2', 'terms', 'نص الشروط المحدّث', 'Updated terms text', now())`;
  const { page, errors } = await newPage();
  await page.goto(env.base + "/");
  await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); }, { access_token: u.token, refresh_token: u.refresh });
  await page.goto(env.base + "/#/home");
  await page.waitForSelector("#consent-upd");
  assert.equal(await page.locator("#consent-upd details").count(), 2, "both updated documents are listed");
  for (const s of await page.locator("#consent-upd summary").all()) await s.click();
  const banner = await page.locator("#consent-upd").innerText();
  assert.ok(banner.includes("نص إشعار الخصوصية المحدّث") && banner.includes("نص الشروط المحدّث"), banner.slice(0, 200));
  assert.ok(!banner.includes("privacy-ui-3") && !banner.includes("terms-ui-2"), "internal version codes are not shown to members");
  await page.screenshot({ path: `${SHOTS}/15-privacy-update-ar.png`, fullPage: true });
  await page.click("#pv-ok");
  await page.waitForSelector(".event-card");
  await page.waitForFunction(() => !document.querySelector("#consent-upd"));
  const rows = await env.sql`SELECT DISTINCT ON (consent_type) consent_type, document_version FROM app.user_consents WHERE user_id = ${u.userId}
                               AND consent_type IN ('privacy_notice', 'terms') ORDER BY consent_type, recorded_at DESC`;
  assert.deepEqual(rows.map((r) => `${r.consent_type}:${r.document_version}`).sort(), ["privacy_notice:privacy-ui-3", "terms:terms-ui-2"]);
  await page.goto(env.base + "/#/privacy");
  await page.waitForSelector(".legal-text");
  assert.ok((await page.locator(".legal-text").innerText()).includes("نص إشعار الخصوصية المحدّث"));
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
  const explain = await page.locator("#explain").innerText();
  assert.ok(explain.includes("Closeness") && explain.includes("Energy mix") && explain.includes("values 32%"), "r2 dry run is explained in words: " + explain.slice(0, 300));
  await page.screenshot({ path: `${SHOTS}/21-admin-dry-run.png`, fullPage: true });
  await page.click("#nav a[href='#/live']");
  await page.waitForSelector("text=Tonight board");
  // T&S user: reason prompt before opening a case
  const ts = "enr_ui_ts_" + crypto.randomUUID();
  await env.sql`UPDATE app.admin_users SET enroll_token_hash = ${sha256hex(ts)}, enroll_expires_at = now() + interval '1 hour' WHERE email = 'ts.primary@example.test'`;
  await page.click("#logout");
  await page.waitForSelector("#code"); // sign-out ends the session on the server first (NMX-63), then shows sign-in
  await page.goto(env.base + "/admin/#/enroll");
  await page.fill("#em", "ts.primary@example.test"); await page.fill("#tok", ts); await page.click("button[type=submit]");
  const s2 = (await page.locator("code.num").innerText()).trim();
  await page.click("a[href='#/login']"); await page.waitForSelector("#code");
  await page.fill("#em", "ts.primary@example.test"); await page.fill("#code", totpAt(s2, Date.now())); await page.click("button[type=submit]");
  await page.waitForSelector("text=Trust & Safety queue");
  await page.screenshot({ path: `${SHOTS}/22-admin-ts-queue.png`, fullPage: true });
  assert.deepEqual(errors, []);
});

test("contact request after the meetup: Fatima asks, Sara accepts, both get a WhatsApp button", async () => {
  const call = client(env.base);
  const owner = await adminLogin(call, env.sql, "owner@example.test");
  const ses = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 4 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  await call("POST", `/api/admin/v1/sessions/${ses.body.id}:open-sale`, { token: owner.token });
  const U = {};
  for (const name of ["فاطمة", "سارة", "هدى", "منى"]) {
    const u = await signUp(call, { name });
    const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: ses.body.id } });
    await payViaMock(call, await checkoutUrlFor(call, u.token, b.body));
    U[name] = { ...u, booking: b.body.booking_id };
  }
  await call("POST", `/api/admin/v1/sessions/${ses.body.id}/matching:publish`, { token: owner.token, body: { seed: 5 } });
  const det = (await call("GET", `/api/admin/v1/sessions/${ses.body.id}`, { token: owner.token })).body;
  assert.equal((await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:lock`, { token: owner.token })).status, 200);
  // the meetup ended an hour ago
  await env.sql`UPDATE app.event_sessions SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour',
                  booking_opens_at = now() - interval '10 days', booking_closes_at = now() - interval '4 hours', lock_at = now() - interval '27 hours',
                  reveal_at = now() - interval '27 hours', check_in_opens_at = now() - interval '4 hours' WHERE id = ${ses.body.id}`;
  const open = async (who) => {
    const { page, errors } = await newPage();
    await page.goto(env.base + "/");
    await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify("ar")); },
      { access_token: U[who].token, refresh_token: U[who].refresh });
    await page.goto(`${env.base}/#/booking/${U[who].booking}`);
    await page.waitForSelector("#contacts-list li");
    return { page, errors };
  };
  const f = await open("فاطمة");
  assert.ok((await f.page.locator("#contacts").innerText()).includes("التواصل بعد اللقاء"));
  await f.page.locator(".contact-row", { hasText: "سارة" }).locator("[data-seat]").click();
  await f.page.waitForFunction(() => [...document.querySelectorAll(".contact-row")].some((r) => r.textContent.includes("سارة") && r.textContent.includes("أُرسل الطلب")));
  await noHorizontalScroll(f.page);
  const s = await open("سارة");
  const row = s.page.locator(".contact-row", { hasText: "فاطمة" });
  assert.ok((await row.innerText()).includes("ترغب بالتواصل معكِ"));
  await s.page.screenshot({ path: `${SHOTS}/16-contact-request-ar.png`, fullPage: true });
  await row.locator("[data-accept]").click();
  await s.page.waitForSelector(".contact-row [data-wa]");
  assert.equal(await s.page.locator(".contact-row [data-wa]").getAttribute("href"), `https://wa.me/${U["فاطمة"].phone.slice(1)}`);
  await f.page.reload();
  await f.page.waitForSelector(".contact-row [data-wa]");
  assert.equal(await f.page.locator(".contact-row [data-wa]").getAttribute("href"), `https://wa.me/${U["سارة"].phone.slice(1)}`);
  await f.page.screenshot({ path: `${SHOTS}/17-contact-connected-ar.png`, fullPage: true });
  assert.deepEqual([...f.errors, ...s.errors], []);
});

test("sessions (NMX-17): no network keeps the member signed in; signing out ends the session on the server too", async () => {
  const call = client(env.base);
  const u = await signUp(call, { name: "Lulwa" });
  const { page, errors } = await newPage();
  await page.goto(env.base + "/");
  await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); }, await signInAgain(call, env.sql, u.phone));
  // the refresh cannot reach the server: she stays signed in and sees the offline message, not the welcome screen
  await page.route(/token:refresh/, (r) => r.abort());
  await page.goto(env.base + "/#/home");
  await page.waitForTimeout(800);
  assert.ok(await page.evaluate(() => Boolean(JSON.parse(localStorage.getItem("q_tokens") || "null"))), "still signed in on this device");
  assert.equal(await page.evaluate(() => location.hash), "#/home", "no bounce to the welcome screen");
  await page.waitForSelector("#retry-me");
  // back online: home loads; then sign out from Profile
  await page.unroute(/token:refresh/);
  await page.goto(env.base + "/?online=1#/profile"); // a fresh page load, as when she opens the app again
  await page.waitForSelector("#out");
  // a copy of her data downloads as a JSON file (NMX-38)
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#mydata")]);
  assert.match(download.suggestedFilename(), /^herzone-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  const file = JSON.parse(readFileSync(await download.path(), "utf8"));
  assert.equal(file.account.phone_e164, u.phone);
  assert.equal(file.account.display_name, "Lulwa");
  const refresh = await page.evaluate(() => JSON.parse(localStorage.getItem("q_tokens")).refresh_token);
  await page.click("#out");
  await page.waitForFunction(() => location.hash === "#/welcome");
  assert.equal(await page.evaluate(() => localStorage.getItem("q_tokens")), null);
  assert.equal((await call("POST", "/api/v1/auth/token:refresh", { body: { refresh_token: refresh }, idem: false })).status, 401, "the server ended the session");
  assert.deepEqual(errors.filter((e) => !/token:refresh/.test(e)), []);
});

test("public account deletion page (Google Play): both languages, served under the real CSP, phone width", async () => {
  const { page, errors } = await newPage();
  await page.goto(`${env.base}/delete-account.html`);
  await oneH1(page);
  assert.equal(await page.locator("main h1").textContent(), "حذف حسابكِ في HerZone");
  assert.equal(await page.locator("section[lang=en] h2").first().textContent(), "Delete your HerZone account");
  assert.ok((await page.locator("main").textContent()).includes("14"), "states the 14-day period");
  assert.equal(await page.locator('a[href="tel:+97460053006"]').count(), 2);
  await noHorizontalScroll(page);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("venue page (016): email, code, the hosting request, accept; Arabic, real CSP, phone width", async () => {
  const call = client(env.base);
  const ops = await adminLogin(call, env.sql, "ops.oncall@example.test");
  const owner = await adminLogin(call, env.sql, "owner@example.test");
  const s = await call("POST", "/api/admin/v1/sessions", { token: ops.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 2 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  const [v] = await env.sql`SELECT id, name FROM app.venues WHERE is_active AND 'dinner' = ANY (supported_experiences) ORDER BY name LIMIT 1`;
  assert.equal((await call("POST", `/api/admin/v1/venues/${v.id}/portal-users`, { token: ops.token, body: { email: "ui@venue.test" } })).status, 201);
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}/venues`, { token: ops.token, body: { venue_id: v.id, planned_guests: 6 } })).status, 200);

  const { page, errors } = await newPage();
  await page.goto(`${env.base}/venue/index.html`);
  await page.fill("#email", "ui@venue.test");
  await page.click("#go");
  const code = (await page.locator("#dev").textContent()).trim();
  await page.fill("#code", code);
  await page.click("#go");
  await page.waitForSelector(`#req-${s.body.id}`);
  assert.equal(await page.locator("#vp-venue").textContent(), v.name);
  const card = await page.locator(`#req-${s.body.id}`).textContent();
  assert.ok(card.includes("حجز لعدد 6 أشخاص (سيدات)"), card);
  await noHorizontalScroll(page);
  await page.click(`[data-accept="${s.body.id}"]`);
  await page.waitForSelector(`#req-${s.body.id} .badge-success`);
  // design audit (5 Nov): after a tap the keyboard focus is on the (redrawn) card, and the whole page is not a live region
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), `req-${s.body.id}`);
  assert.equal(await page.getAttribute("main", "aria-live"), null);
  const [sv] = await env.sql`SELECT status FROM app.session_venues WHERE session_id = ${s.body.id}`;
  assert.equal(sv.status, "confirmed");
  await page.click("#vp-lang");
  await page.waitForFunction(() => document.querySelector("h1")?.textContent.includes("Hosting requests") && document.documentElement.dir === "ltr");
  assert.deepEqual(errors, []);
  await page.context().close();

  // the admin side: the queued WhatsApp text, the request, the session's planned venue, the portal email
  const ad = await newPage({ width: 1280, height: 900 });
  await ad.page.addInitScript(([t, a]) => { sessionStorage.setItem("qa_token", JSON.stringify(t)); sessionStorage.setItem("qa_admin", JSON.stringify(a)); }, [ops.token, ops.admin]);
  await ad.page.goto(`${env.base}/admin/#/venue-requests`);
  await ad.page.waitForSelector("h1:text('Venue requests')");
  const reqRow = ad.page.locator("tr", { hasText: v.name }).filter({ has: ad.page.locator(".badge-success") });
  assert.equal(await reqRow.count(), 1, "the accepted request is listed as confirmed");
  await ad.page.goto(`${env.base}/admin/#/sessions/${s.body.id}`);
  await ad.page.waitForSelector("#sv table");
  assert.ok((await ad.page.locator("#sv").textContent()).includes("confirmed"));
  await ad.page.goto(`${env.base}/admin/#/venues`);
  await ad.page.click(`[data-portal="${v.id}"]`);
  await ad.page.waitForSelector("#puf");
  assert.ok((await ad.page.locator("#contacts").textContent()).includes("ui@venue.test"));
  assert.deepEqual(ad.errors, []);
  await ad.page.context().close();
});

test("admin console: a member's contact request shows with her note, number and time; Called takes it off the open list", async () => {
  const call = client(env.base);
  const ops = await adminLogin(call, env.sql, "ops.oncall@example.test");
  const M = await signUp(call, { name: "Mona" });
  assert.equal((await call("POST", "/api/v1/support/call-requests", { token: M.token,
    body: { message: "The venue changed and I have a question", callback_when: "10min", contact_phone: "55500011" } })).status, 201);
  const ad = await newPage({ width: 1280, height: 900 });
  await ad.page.addInitScript(([t, a]) => { sessionStorage.setItem("qa_token", JSON.stringify(t)); sessionStorage.setItem("qa_admin", JSON.stringify(a)); }, [ops.token, ops.admin]);
  await ad.page.goto(`${env.base}/admin/#/call-requests`);
  await ad.page.waitForSelector("h1:text('Call requests')");
  const row = ad.page.locator("tr", { hasText: "Mona" });
  assert.equal(await row.count(), 1);
  assert.equal(await row.locator("a[href^='tel:']").getAttribute("href"), "tel:+97455500011", "the number she asked to be called on");
  const rowText = await row.innerText();
  assert.ok(rowText.includes("The venue changed and I have a question") && rowText.includes("In 10 minutes"), rowText);
  assert.ok(rowText.includes(M.phone), "and the number she signed up with");
  assert.ok(/Call requests\s*waiting:\s*\d+/.test(await ad.page.locator("nav").innerText()), "the menu shows how many are open");
  await ad.page.screenshot({ path: `${SHOTS}/23-admin-call-requests.png`, fullPage: true });
  await row.locator("[data-called]").click();
  await ad.page.waitForSelector("tr:has-text('Mona')", { state: "detached" });
  assert.equal((await env.sql`SELECT status FROM app.call_requests WHERE user_id = ${M.userId}`)[0].status, "called");
  assert.deepEqual(ad.errors, []);
  await ad.page.context().close();
});

test("top bar: logo, test-site label, theme and language never overlap, even on a 320 px phone with large text", async () => {
  for (const [w, fs, loc] of [[320, 22, "ar"], [320, 22, "en"], [360, 19, "ar"], [402, 16, "ar"], [402, 22, "en"]]) {
    const { page, errors } = await newPage({ width: w, height: 700 });
    await page.goto(env.base + "/");
    await page.evaluate((l) => localStorage.setItem("q_locale", JSON.stringify(l)), loc);
    await page.reload();
    await page.waitForSelector(".hero-welcome h1");
    await page.evaluate((px) => document.documentElement.style.setProperty("font-size", `${px}px`, "important"), fs); // larger text, as on a phone set to bigger type
    assert.equal(await page.locator(".topbar .brand .env-badge").count(), 1, "the test-site label sits under the name, inside the logo link");
    await cleanLayout(page);
    assert.deepEqual(errors, []);
    await page.close();
  }
});
