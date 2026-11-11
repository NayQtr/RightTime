// Browser checks for member engagement (migration 023, provisional, 10 Nov): "notify me" on the empty session list, day and
// area chips on a long list only, time left in the questionnaire and the table at its end, reasons with a low rating, and
// the coordinators' Feedback page with its one-click compensation. Chromium via Playwright against the real API.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";
import { buildSteps } from "../../web/quiz-flow.js";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
let env, browser, call, owner;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  owner = await adminLogin(call, env.sql, "owner@example.test");
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); await env?.stop(); });

// A signed-in member's tab opened at `hash`. The tokens and language are set before the app starts, once per tab (a later
// reload must not put back tokens that have since been rotated).
async function memberPage(u, hash, { locale = "ar", width = 360 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 780 }, locale: locale === "ar" ? "ar-QA" : "en-GB" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_FAILED|404/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(([t, l]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify(l));
  }, [{ access_token: u.token, refresh_token: u.refresh }, locale]);
  await page.goto(env.base + "/" + hash);
  return { page, errors };
}

// No sideways scroll, and no label spills out of its box.
async function tidy(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  const out = await page.evaluate(() => {
    const p = [];
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) p.push("horizontal scroll");
    for (const e of document.querySelectorAll("main button, main a, main label, main .chip, main h1, main .badge")) {
      const r = e.getBoundingClientRect();
      if (!r.width || getComputedStyle(e).display === "inline") continue;
      if (e.scrollWidth > e.clientWidth + 2) p.push(`text spills out of ${e.tagName}.${e.className}`);
    }
    return p;
  });
  assert.deepEqual(out, [], page.url());
}

async function newSession(language, days, area = ["لوسيل", "Lusail"]) {
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: language,
    starts_at: new Date(Date.now() + days * DAY).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: area[0], district_hint_en: area[1] } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
  return s.body.id;
}

test("notify me: no session in her language offers it on the session list; pressed once, it says so (Arabic and English)", async () => {
  const u = await signUp(call, { name: "Noor", languages: ["lang_en"] }); // the seed has Arabic dinners only
  const { page, errors } = await memberPage(u, "#/sessions");
  await page.waitForSelector("#no-sessions");
  assert.ok((await page.locator("#no-sessions").innerText()).includes("لا توجد حاليًا مواعيد بلغة تختارينها"));
  assert.equal((await page.locator("#notify-me").innerText()).trim(), "أعلميني عند توفر موعد");
  await tidy(page);
  await page.click("#notify-me");
  await page.waitForSelector("#nm-on");
  assert.equal((await page.locator("#nm-on").innerText()).trim(), "سنُعلمكِ عند توفر موعد بلغتك.");
  assert.equal((await env.sql`SELECT count(*)::int AS n FROM app.session_alerts WHERE user_id = ${u.userId} AND notified_at IS NULL`)[0].n, 1);
  await page.goto(env.base + "/#/home");
  await page.waitForSelector(".home-head h1");
  await page.goto(env.base + "/#/sessions");
  await page.waitForSelector("#nm-on");
  assert.equal(await page.locator("#notify-me").count(), 0, "already asked: no button");
  assert.deepEqual(errors, []);
  await page.context().close();
  const v = await signUp(call, { name: "Dana", locale: "en", languages: ["lang_other"] });
  const en = await memberPage(v, "#/sessions", { locale: "en" });
  await en.page.waitForSelector("#notify-me");
  assert.equal((await en.page.locator("#notify-me").innerText()).trim(), "Notify me when a session opens");
  await tidy(en.page);
  assert.deepEqual(en.errors, []);
  await en.page.context().close();
});

test("filters: none on a short list; day and area chips on a list of more than 8, and a hidden choice is let go", async () => {
  const u = await signUp(call, { name: "Reem" });
  const { page, errors } = await memberPage(u, "#/sessions");
  await page.waitForSelector(".sess input[name=s]", { state: "attached" });
  assert.equal(await page.locator("input[name=s]").count(), 3, "the seed's three Arabic dinners");
  assert.equal(await page.locator("#filters").count(), 0, "3 sessions: no filters");
  const areas = [["الوكرة", "Al Wakrah"], ["لوسيل", "Lusail"], ["مشيرب", "Msheireb"]];
  for (let k = 0; k < 6; k += 1) await newSession("ar", 3 + k, areas[k % 3]);
  await page.goto(env.base + "/#/home");
  await page.waitForSelector(".event-card");
  await page.goto(env.base + "/#/sessions");
  await page.waitForSelector("#filters");
  assert.equal(await page.locator("input[name=s]").count(), 9);
  await page.waitForSelector("#filters");
  // the website's filter block is a grid of chip rows (styles.css #filters; the admin console's .filters is a row)
  assert.equal(await page.locator("#filters").evaluate((el) => getComputedStyle(el).display), "grid");
  const dayChips = await page.locator("#filters input[name=fday]").count();
  assert.ok(dayChips >= 8, `a chip per day plus All (${dayChips})`);
  const areaChips = await page.locator("#filters fieldset").nth(1).locator(".chip span").allInnerTexts();
  assert.equal(areaChips[0], "الكل");
  assert.deepEqual(areaChips.slice(1).sort(), ["الخليج الغربي", "الوكرة", "لوسيل", "مشيرب"].sort(), "each area once, soonest session first");
  await tidy(page);
  // choose a Lusail session, then filter by Al Wakrah: it is hidden and no longer chosen
  const lusail = page.locator(".sess", { hasText: "لوسيل" }).first();
  await lusail.evaluate((el) => el.scrollIntoView({ block: "center" })); // clear of the sticky Continue bar
  await lusail.locator("label.option").click();
  assert.equal(await page.locator("input[name=s]:checked").count(), 1);
  assert.equal(await page.locator("#go").isDisabled(), false);
  await page.locator("#filters .chip", { hasText: "الوكرة" }).click();
  const visible = await page.locator(".sess:not([hidden])").allInnerTexts();
  assert.equal(visible.length, 2);
  assert.ok(visible.every((t) => t.includes("الوكرة")), visible.join(" | "));
  assert.equal(await page.locator("input[name=s]:checked").count(), 0);
  assert.equal(await page.locator("#go").isDisabled(), true);
  // a day with no Al Wakrah session: nothing matches, and it says so
  const firstDay = await page.locator("#filters input[name=fday]").nth(1).getAttribute("value");
  const wakrahDays = await page.locator(".sess:not([hidden])").evaluateAll((rows) => rows.map((r) => r.dataset.id));
  await page.locator("#filters input[name=fday]").nth(1).check({ force: true });
  const shown = await page.locator(".sess:not([hidden])").count();
  if (shown === 0) assert.equal(await page.locator("#no-match").isHidden(), false, `no session on ${firstDay} in Al Wakrah`);
  assert.ok(wakrahDays.length === 2);
  // All + All: every session again
  await page.locator("#filters fieldset").nth(0).locator(".chip").first().click();
  await page.locator("#filters fieldset").nth(1).locator(".chip").first().click();
  assert.equal(await page.locator(".sess:not([hidden])").count(), 9);
  assert.equal(await page.locator("#no-match").isHidden(), true);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("questionnaire: the time left beside the step count, and the table with every seat taken at the end", async () => {
  const u = await signUp(call, { name: "Hessa" });
  const q = (await call("GET", "/api/v1/questionnaires/current", { token: u.token })).body;
  const steps = buildSteps(q.questions);
  const first = steps.findIndex((s) => s.kind === "q");
  const last = steps.map((s) => s.kind).lastIndexOf("q");
  const ready = steps.findIndex((s) => s.id === "ready");
  const n = q.questions.length;
  const { page, errors } = await memberPage(u, `#/quiz/${first}`);
  await page.waitForSelector(".quiz-q .time-left");
  // the owner's wording (11 Nov): one minute, two minutes, then "a few minutes" (web/app.js timeLeftText)
  const mins = Math.round((n * 10) / 60);
  const left = mins === 1 ? "بقي نحو دقيقة واحدة" : mins === 2 ? "بقي نحو دقيقتين" : "بقي نحو بضعة دقائق";
  assert.equal((await page.locator(".quiz-q .step-k").innerText()).trim(), `السؤال 1 من ${n} · ${left}`);
  await tidy(page);
  await page.goto(`${env.base}/#/quiz/${last}`);
  await page.waitForFunction((t) => document.querySelector(".quiz-q .step-k")?.textContent.includes(t), `${n} من ${n}`);
  assert.ok((await page.locator(".quiz-q .time-left").innerText()).includes("بقيت أقل من دقيقة"));
  await page.goto(`${env.base}/#/quiz/${ready}`);
  await page.waitForSelector("[data-inter=ready] .done-art svg");
  assert.equal(await page.locator(".done-art .seat.on").count(), 6, "every seat taken");
  assert.equal((await page.locator("[data-inter=ready] h1").innerText()).trim(), "اكتملت الصورة");
  await tidy(page);
  assert.equal(/timeleft/i.test(await page.locator("body").innerText()), false);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("feedback: reasons appear at 3 stars or less, go away (and clear) above; the coordinator sees them and compensates in one click", async () => {
  const id = await newSession("ar", 4, ["الدفنة", "Al Dafna"]);
  const M = {};
  for (const name of ["شيخة", "أمل", "جود", "لمى"]) {
    const u = await signUp(call, { name });
    const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: id } });
    await payViaMock(call, await checkoutUrlFor(call, u.token, b.body));
    M[name] = { ...u, booking: b.body.booking_id };
  }
  await call("POST", `/api/admin/v1/sessions/${id}/matching:publish`, { token: owner.token, body: { seed: 5 } });
  const det = (await call("GET", `/api/admin/v1/sessions/${id}`, { token: owner.token })).body;
  assert.equal((await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:lock`, { token: owner.token })).status, 200);
  await env.sql`UPDATE app.event_sessions SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour',
                  booking_opens_at = now() - interval '10 days', booking_closes_at = now() - interval '4 hours', lock_at = now() - interval '27 hours',
                  reveal_at = now() - interval '27 hours', check_in_opens_at = now() - interval '4 hours' WHERE id = ${id}`;
  const { page, errors } = await memberPage(M["شيخة"], `#/booking/${M["شيخة"].booking}/feedback`);
  await page.waitForSelector("input[name=overall]");
  assert.equal(await page.locator("#reasons").isHidden(), true, "no rating yet: no reasons");
  const star = (name, v) => page.locator(`input[name=${name}][value="${v}"]`).check({ force: true });
  await star("overall", 2);
  assert.equal(await page.locator("#reasons").isVisible(), true);
  assert.equal((await page.locator("#reasons legend").innerText()).trim(), "ما الذي لم يعجبكِ؟ (اختياري)");
  assert.deepEqual(await page.locator("#reasons .chip span").allInnerTexts(),
    ["الانسجام مع الطاولة", "المكان", "الطعام أو الخدمة", "التنظيم والمواعيد", "غياب بعض الحاضرات", "سبب آخر"]);
  await tidy(page);
  await page.locator("#reasons .chip", { hasText: "الطعام أو الخدمة" }).click();
  await star("overall", 5);
  assert.equal(await page.locator("#reasons").isHidden(), true, "4 or 5 stars: no reasons");
  assert.equal(await page.locator("input[name=reason]:checked").count(), 0, "and the picked ones are cleared");
  await star("overall", 2);
  await page.locator("#reasons .chip", { hasText: "المكان" }).click();
  await page.locator("#reasons .chip", { hasText: "غياب بعض الحاضرات" }).click();
  await star("comfort", 3);
  await page.click("#go");
  await page.waitForSelector(".success-check");
  const [fb] = await env.sql`SELECT overall_rating, low_rating_reasons FROM app.event_feedback WHERE booking_id = ${M["شيخة"].booking}`;
  assert.deepEqual([fb.overall_rating, fb.low_rating_reasons], [2, ["venue", "no_shows"]]);
  assert.deepEqual(errors, []);
  await page.context().close();

  // the coordinator: the low rating, its reasons, a suggested code; she types the discount and approves
  const ops = await adminLogin(call, env.sql, "ops.oncall@example.test");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ad = await ctx.newPage();
  const adErrors = [];
  ad.on("pageerror", (e) => adErrors.push(String(e)));
  await ad.addInitScript(([t, a]) => { sessionStorage.setItem("qa_token", JSON.stringify(t)); sessionStorage.setItem("qa_admin", JSON.stringify(a)); }, [ops.token, ops.admin]);
  await ad.goto(`${env.base}/admin/#/feedback`);
  await ad.waitForSelector("h1:text('Feedback')");
  assert.equal(await ad.locator("#nav a[href='#/feedback']").count(), 1, "in the menu for ops");
  const row = ad.locator("tr", { hasText: "شيخة" });
  const text = await row.innerText();
  assert.ok(text.includes("Venue, Some guests didn't come") && text.includes("Suggested"), text);
  await row.locator("button[type=submit]").click();
  assert.equal((await env.sql`SELECT count(*)::int AS n FROM app.promo_codes`)[0].n, 0, "no amount typed: nothing is sent");
  await row.locator("input[type=number]").fill("20");
  await row.locator("button[type=submit]").click();
  await ad.waitForSelector("#flash .banner-success");
  const [code] = await env.sql`SELECT code, percent_off, user_id FROM app.promo_codes`;
  assert.equal(code.percent_off, 20);
  assert.equal(code.user_id, M["شيخة"].userId);
  await ad.waitForSelector("form[data-comp]", { state: "detached" });
  assert.ok((await ad.locator("tr", { hasText: "شيخة" }).innerText()).includes(code.code), "issued: the code shows, no second one can be sent");
  assert.deepEqual(adErrors, []);
  await ctx.close();
});
