// Website, round 3 of the reference-sites study (owner's decision of 14 Nov 2026; plan docs/plans/2026-11-14-rounds-1-3.md):
// - home on a wide screen: the page uses the width (tiles in a row, cards in columns), and the places of the tiles and
//   cards are kept while it loads
// - dark theme: three surface steps and a hairline, no shadows; the admin console keeps its own look
// - a full session: her place on the waitlist shows as a marked step in the session's own row
// - account: labelled groups with icons; a change is confirmed in its own row
// - questionnaire: the 1-5 scale as one track with a sliding thumb; chips with the same look
// - "your card" as a membership card with rows of her own answers and a cropped arc of the table drawing
// - "what you get" as a plain roster with the small mark before the title
// - the revealed venue as one place card; cancelling as a when / what-you-get-back table from the booking's own rules
// Not built here (held for the owner's wording): the fee and FAQ page, the three explanatory waitlist steps.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signInAgain, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
let env, browser, call, owner, fresh, booked, waiter, seated;
const S = {};

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  owner = await adminLogin(call, env.sql, "owner@example.test");
  const add = async (key, days, seats = 18, experience = "dinner") => {
    const at = new Date(Date.now() + days * DAY); at.setUTCHours(experience === "dinner" ? 16 : 13, 30, 0, 0);
    const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience, conversation_language: "ar",
      starts_at: at.toISOString(), duration_minutes: 120, max_seats: seats, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
    S[key] = s.body.id;
  };
  await env.sql`DELETE FROM app.event_sessions`;
  await env.sql`INSERT INTO app.price_plans (city_id, experience, service_fee_minor, valid_from) VALUES ('doh', 'coffee', 3900, now() - interval '1 day')`;
  await add("near", 2); await add("c1", 2, 18, "coffee"); await add("c2", 3, 18, "coffee"); await add("d4", 4);
  await add("far", 16); await add("far2", 17); await add("far3", 18); await add("full", 12, 4); await add("rev", 11, 4);
  const pay = async (u, sid) => { const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: sid } }); await payViaMock(call, await checkoutUrlFor(call, u.token, b.body)); return b.body.booking_id; };
  const fill = async (sid) => { let first; for (const name of ["Sara", "Amal", "Jood", "Lama"]) { const u = await signUp(call, { name }); const id = await pay(u, sid); if (!first) first = { ...u, booking: id }; } return first; };
  fresh = await signUp(call, { name: "Noor" });
  waiter = await signUp(call, { name: "Dana" });
  booked = await signUp(call, { name: "Hind" });
  booked.booking = await pay(booked, S.far);
  await fill(S.full);
  // a revealed meetup: four paid seats, the table published and locked, the reveal time passed, the venue revealed
  seated = await fill(S.rev);
  assert.equal((await call("POST", `/api/admin/v1/sessions/${S.rev}/matching:publish`, { token: owner.token, body: { seed: 5 } })).status, 201);
  const det = (await call("GET", `/api/admin/v1/sessions/${S.rev}`, { token: owner.token })).body;
  assert.equal((await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:lock`, { token: owner.token })).status, 200);
  await env.sql`UPDATE app.event_sessions SET lock_at = now() - interval '2 minutes', reveal_at = now() - interval '1 minute' WHERE id = ${S.rev}`;
  assert.equal((await call("POST", `/api/admin/v1/sessions/${S.rev}:reveal`, { token: owner.token })).body.revealed, 4);
});
after(async () => { await browser?.close(); await env?.stop(); });

async function context(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return ctx;
}
const ready = (page) => page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
async function guest(hash, { locale = "ar", ...opts } = {}) {
  const page = await (await context(opts)).newPage();
  await page.goto(env.base + "/");
  await page.evaluate((l) => localStorage.setItem("q_locale", JSON.stringify(l)), locale);
  await page.goto(env.base + "/" + hash); await page.reload(); await ready(page);
  return page;
}
async function open(hash, { who = fresh, locale = "ar", ...opts } = {}) {
  const page = await (await context(opts)).newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(env.base + "/");
  const tokens = await signInAgain(call, env.sql, who.phone);
  await page.evaluate(([t, l]) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify(l)); }, [tokens, locale]);
  await page.reload(); await ready(page);
  await page.goto(env.base + "/" + hash); await ready(page);
  return page;
}
const settle = (page) => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
const noSideScroll = async (page, what) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${what}: the page scrolls sideways`);
// true when no shadow in a computed box-shadow list is blurred (a hairline has only a spread)
const noBlur = (shadow) => shadow === "none" || shadow.split(/,(?![^(]*\))/).every((s) => parseFloat((s.replace(/\([^)]*\)/g, "").match(/-?[\d.]+px/g) || [])[2] || "0") === 0);
const asColour = (page, name) => page.evaluate((n) => { const e = document.createElement("i"); e.style.color = `var(${n})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, name);
// the first questionnaire step that matches (signed in or out)
async function quizStep(page, selector) {
  for (let i = 0; i < 45; i += 1) {
    await page.goto(`${env.base}/#/quiz/${i}`);
    await page.waitForFunction((n) => location.hash === `#/quiz/${n}` && document.querySelector("main h1") && document.querySelector("#nx, #yes"), i);
    if (await page.locator(selector).count()) return i;
  }
  throw new Error(`no questionnaire step with ${selector}`);
}

test("home on a wide screen uses the width; while it loads, the places of the tiles and cards are kept", async () => {
  for (const [width, columns] of [[1280, 3], [390, 0]]) {
    const page = await open("#/profile", { viewport: { width, height: 900 } });
    let release;
    const held = new Promise((r) => { release = r; });
    await page.route("**/api/v1/sessions", async (route) => { await held; await route.continue(); });
    await page.click("#tabbar a[href='#/home']");
    await page.waitForSelector(".skel-home .skel-slots i");
    const before_ = await page.evaluate(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) }; };
      const sk = document.querySelector(".skel-home"); return { slot: r(".skel-slots i"), tiles: r(".skel-tiles"), role: sk.getAttribute("role"), busy: sk.getAttribute("aria-busy"), label: sk.getAttribute("aria-label"), main: Math.round(document.querySelector("main").getBoundingClientRect().width) }; });
    assert.deepEqual([before_.role, before_.busy, before_.label], ["status", "true", "جارٍ التحميل…"]);
    release(); await ready(page);
    await page.waitForSelector(".peek > li"); await settle(page);
    const after_ = await page.evaluate(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) }; };
      return { card: r(".peek > li"), tiles: r(".tiles"), main: Math.round(document.querySelector("main").getBoundingClientRect().width),
        tileTops: [...document.querySelectorAll(".tiles > *")].map((e) => Math.round(e.getBoundingClientRect().top)),
        peekTops: [...document.querySelectorAll(".peek > li")].slice(0, 3).map((e) => Math.round(e.getBoundingClientRect().top)),
        peekScrolls: document.querySelector(".peek").scrollWidth > document.querySelector(".peek").clientWidth + 1,
        listCols: getComputedStyle(document.querySelector(".week-group > .list") || document.body).gridTemplateColumns.split(" ").length,
        tabs: [...document.querySelectorAll("#tabbar a")].map((a) => a.getBoundingClientRect()).map((b) => [Math.round(b.left), Math.round(b.right)]) }; });
    assert.equal(before_.main, after_.main, "the column does not change width when the screen arrives");
    for (const [what, a, b] of [["tiles top", before_.tiles.top, after_.tiles.top], ["tiles height", before_.tiles.h, after_.tiles.h], ["first card top", before_.slot.top, after_.card.top],
      ["first card width", before_.slot.w, after_.card.w], ["first card height", before_.slot.h, after_.card.h]]) assert.ok(Math.abs(a - b) <= 24, `${width}px, ${what}: kept ${a}, arrived ${b}`);
    if (columns) {
      assert.ok(after_.main >= 1000, `a wide column (${after_.main}px)`);
      assert.equal(new Set(after_.tileTops).size, 1, "the three tiles sit in one row");
      assert.equal(new Set(after_.peekTops).size, 1, "this week's cards sit side by side");
      assert.equal(after_.peekScrolls, false, "and need no sideways swipe");
      assert.equal(after_.listCols, 2, "later meetups in two columns");
      assert.ok(after_.tabs[0][1] - after_.tabs[3][0] <= 561 || after_.tabs[3][1] - after_.tabs[0][0] <= 561, "the tab bar keeps its phone width");
    } else {
      assert.ok(after_.main <= 390);
      assert.equal(new Set(after_.tileTops).size, 2, "phone: the week strip above the two tiles, as before");
      assert.equal(after_.peekScrolls, true, "phone: the photo row still swipes");
    }
    await noSideScroll(page, `home ${width}`);
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});

test("dark theme: a card is the second surface step with a hairline and no shadow, what sits in it the third; light and the admin console are unchanged", async () => {
  for (const mode of ["device", "switch"]) {
    const page = await open(`#/booking/${seated.booking}`, { who: seated, colorScheme: mode === "device" ? "dark" : "light" });
    if (mode === "switch") { await page.click("#theme"); await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark"); }
    await page.waitForSelector("#place");
    const [surface, third, sunken] = [await asColour(page, "--c-surface"), await asColour(page, "--c-primarySubtle"), await asColour(page, "--c-surfaceSunken")];
    const look = (sel) => page.locator(sel).first().evaluate((e) => { const cs = getComputedStyle(e); return { bg: cs.backgroundColor, shadow: cs.boxShadow }; });
    for (const sel of ["#place", "section.card"]) {
      const c = await look(sel);
      assert.equal(c.bg, surface, `${mode}: ${sel} is the second step`);
      assert.ok(c.shadow.includes("inset") && noBlur(c.shadow), `${mode}: ${sel} has a hairline and no blurred shadow: ${c.shadow}`);
    }
    assert.notEqual(surface, sunken);
    await page.goto(`${env.base}/#/home`); await ready(page); await page.waitForSelector(".event-card");
    const card = await look(".event-card");
    assert.equal(card.bg, surface);
    assert.ok(noBlur(card.shadow), `${mode}: no blurred shadow on a meetup card: ${card.shadow}`);
    await page.goto(`${env.base}/#/plans`); await ready(page);
    if (await page.locator("main .card .badge:not(.badge-primary), main .card .btn-secondary").count()) {
      assert.equal((await look("main .card .badge:not(.badge-primary), main .card .btn-secondary")).bg, third, `${mode}: the third step inside a card`);
    }
    await noSideScroll(page, "dark");
    await page.context().close();
  }
  // light: a card is as it was
  const light = await open(`#/booking/${seated.booking}`, { who: seated });
  await light.waitForSelector("section.card");
  assert.equal(await light.locator("section.card").first().evaluate((e) => getComputedStyle(e).backgroundColor), await asColour(light, "--c-surfaceSunken"));
  await light.context().close();
  // the admin console shares the style sheet and keeps its dark cards
  const ctx = await context({ colorScheme: "dark" });
  const admin = await ctx.newPage();
  await admin.goto(`${env.base}/admin/`);
  await admin.waitForSelector("main");
  const adminCard = await admin.evaluate(() => { const c = document.createElement("section"); c.className = "card"; document.querySelector("main").append(c); const cs = getComputedStyle(c); const out = [cs.backgroundColor, cs.boxShadow]; c.remove(); return out; });
  assert.deepEqual(adminCard, [await asColour(admin, "--c-surfaceSunken"), "none"]);
  await ctx.close();
});

test("a full session: joining the waitlist puts her real place in the session's own row, with no pop-up", async () => {
  const page = await open("#/sessions", { who: waiter });
  const row = page.locator(`.sess[data-id="${S.full}"]`);
  await row.waitFor();
  assert.equal((await row.locator(".badge-danger").innerText()).trim(), "ممتلئ");
  assert.equal(await row.locator("input[name=s]").isDisabled(), true);
  await row.locator("[data-wait]").click();
  const step = row.locator(".wait-step");
  await step.waitFor();
  assert.equal((await step.innerText()).trim(), "أنتِ في قائمة الانتظار (الترتيب 1).");
  assert.equal(await step.getAttribute("role"), "status", "announced");
  assert.equal(await row.locator("[data-wait]").count(), 0, "the button gave way to the step");
  assert.equal(await page.locator("#toast").innerText(), "", "no pop-up message");
  assert.equal(await step.evaluate((e) => getComputedStyle(e, "::before").backgroundColor), await asColour(page, "--c-primary"), "the step is marked");
  assert.equal((await env.sql`SELECT count(*)::int AS n FROM app.waitlist_entries WHERE session_id = ${S.full} AND status = 'waiting'`)[0].n, 1);
  await page.reload(); await ready(page);
  assert.equal((await page.locator(`.sess[data-id="${S.full}"] .wait-step`).innerText()).trim(), "أنتِ في قائمة الانتظار (الترتيب 1).");
  assert.equal(await page.locator("main").evaluate((m) => /لا يُخصم|ينتقل المقعد/.test(m.textContent)), false, "no waitlist promise beyond the product's own text");
  await noSideScroll(page, "sessions");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("account: labelled groups with icons; language, appearance and the data copy confirm in their own row", async () => {
  const page = await open("#/profile");
  assert.deepEqual(await page.locator(".section-label").allInnerTexts(), ["الملف", "التفضيلات", "الخصوصية", "المساعدة"]);
  assert.equal(await page.locator("ul.settings").count(), 3);
  assert.equal(await page.locator("ul.settings li").count(), await page.locator("ul.settings li .rl svg").count(), "every row starts with an icon");
  assert.deepEqual(await page.locator("ul.settings li .rl").allInnerTexts(), ["إجاباتي", "اشتراكات HerZone", "قرارات تخصّك", "إشعارات الجوال", "المدينة", "اللغة", "المظهر", "إشعار الخصوصية", "تنزيل نسخة من بياناتي"]);
  // appearance: the theme changes, the row shows a check mark, then the next choice; the keyboard stays on the row
  assert.equal((await page.locator("#thm .v").innerText()).trim(), "الوضع الداكن");
  await page.locator("#thm").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
  assert.equal(await page.locator("#thm .v.ok svg").count(), 1, "confirmed in the row");
  assert.equal(await page.evaluate(() => document.activeElement.id), "thm");
  await page.waitForFunction(() => !document.querySelector("#thm .v.ok"));
  assert.equal((await page.locator("#thm .v").innerText()).trim(), "الوضع العادي");
  assert.equal(await page.locator("#toast").innerText(), "");
  // the data copy: a file, a check mark in the row, and the words for a screen reader
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#mydata")]);
  assert.match(download.suggestedFilename(), /^herzone-my-data-/);
  await page.waitForSelector("#mydata .v.ok svg");
  assert.equal((await page.locator("#row-live").innerText()).trim(), "نزّلنا ملف بياناتك.");
  assert.equal(await page.locator("#row-live").getAttribute("role"), "status");
  assert.equal(await page.locator("#toast").innerText(), "", "no pop-up message");
  // language: the screen comes back in English with the row confirmed and focused
  await page.click("#lng");
  await page.waitForFunction(() => document.documentElement.lang === "en" && document.querySelector("#lng .v.ok svg"));
  assert.equal(await page.evaluate(() => document.activeElement.id), "lng");
  assert.deepEqual(await page.locator(".section-label").allInnerTexts(), ["Profile", "Preferences", "Privacy", "Help"]);
  await page.waitForFunction(() => !document.querySelector("#lng .v.ok"));
  assert.equal((await page.locator("#lng .v").innerText()).trim(), "العربية");
  await noSideScroll(page, "account");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("questionnaire: the scale is one track and a thumb slides to the chosen number; chosen chips are raised, with an edge", async () => {
  for (const locale of ["ar", "en"]) {
    const page = await guest("#/quiz/0", { locale });
    await quizStep(page, ".quiz-q .scale");
    await settle(page);
    const n = await page.locator(".scale input").count();
    const state = () => page.evaluate(() => { const t = document.querySelector(".scale"), th = t.querySelector(".thumb"), cs = getComputedStyle(th), r = th.getBoundingClientRect();
      const on = t.querySelector("input:checked"), l = on ? on.closest("label").getBoundingClientRect() : null;
      return { has: t.classList.contains("has"), opacity: cs.opacity, off: l ? Math.round(Math.abs((r.left + r.width / 2) - (l.left + l.width / 2))) : null, hidden: th.getAttribute("aria-hidden"),
        labelBg: on ? getComputedStyle(on.closest("label")).backgroundColor : null, edge: cs.boxShadow.includes("inset"), radius: parseFloat(getComputedStyle(t).borderTopLeftRadius) }; });
    let s = await state();
    assert.deepEqual([s.has, s.opacity, s.hidden], [false, "0", "true"], "no answer: no thumb");
    assert.ok(s.radius >= 24, "one rounded track");
    // by keyboard (a tap on a single-answer question moves on by itself)
    await page.locator(".scale input").nth(1).focus();
    await page.keyboard.press("Space");
    await settle(page);
    s = await state();
    assert.deepEqual([s.has, s.opacity, s.edge, s.labelBg], [true, "1", true, "rgba(0, 0, 0, 0)"], "the thumb is the chosen state: a raised shape with an edge");
    assert.ok(s.off <= 1, `the thumb sits under the chosen number (${s.off}px off)`);
    await page.locator(".scale input").nth(n - 1).focus();
    await page.keyboard.press("Space");
    await settle(page);
    assert.ok((await state()).off <= 1, "and follows the next choice");
    assert.equal(await page.locator(".scale input:checked").count(), 1);
    await noSideScroll(page, "scale");
    // chips
    await quizStep(page, ".quiz-q .chips .chip");
    await settle(page);
    const chip = page.locator(".quiz-q .chip").first();
    const rest = await chip.evaluate((e) => getComputedStyle(e).backgroundColor);
    await chip.click();
    await page.mouse.move(0, 0); await settle(page);
    const chosen = await chip.evaluate((e) => { const cs = getComputedStyle(e); return { bg: cs.backgroundColor, shadow: cs.boxShadow, colour: cs.color }; });
    assert.equal(chosen.bg, await asColour(page, "--c-surface"));
    assert.notEqual(chosen.bg, rest);
    assert.ok(chosen.shadow.includes("inset"), "an edge, not colour alone");
    assert.equal(chosen.colour, await asColour(page, "--c-primary"));
    await page.context().close();
  }
});

test("your card: a membership card with rows of her own answers and a decorative cropped arc", async () => {
  for (const [locale, name, lang, budget] of [["ar", "الاسم الأول", "لغة الطاولة", "الميزانية"], ["en", "First name", "Table language", "Budget"]]) {
    const page = await open("#/home", { locale });
    await quizStep(page, "[data-inter=vibe]");
    await settle(page);
    assert.equal(await page.locator("[data-inter=vibe] .mcard h1").count(), 1);
    assert.equal(await page.locator("[data-inter=vibe] .mcard .mcard-head svg.table").count(), 1, "her seating drawing stays");
    const rows = await page.locator(".mcard .f").evaluateAll((els) => els.map((e) => [e.querySelector("dt").textContent.trim(), e.querySelector("dd").textContent.trim()]));
    const by = Object.fromEntries(rows);
    assert.equal(by[name], "Noor");
    assert.ok(by[lang] && by[lang].length > 1, `her table language: ${JSON.stringify(rows)}`);
    assert.ok(by[budget] && by[budget].length > 1, "her budget");
    assert.ok(rows.every(([, v]) => v.length > 0), "only rows she has answered");
    const arc = await page.locator(".mcard .arc").evaluate((e) => { const cs = getComputedStyle(e), c = e.closest(".mcard").getBoundingClientRect(), r = e.getBoundingClientRect();
      return { hidden: e.getAttribute("aria-hidden"), events: cs.pointerEvents, faint: Number(cs.opacity) <= 0.2, cropped: r.right > c.right || r.left < c.left || r.bottom > c.bottom, clip: getComputedStyle(e.closest(".mcard")).overflow }; });
    assert.deepEqual(arc, { hidden: "true", events: "none", faint: true, cropped: true, clip: "hidden" });
    assert.equal(await page.locator(".mcard .arc .mark, .mcard .mark").count(), 0, "the arc is the table drawing, not the logo");
    await noSideScroll(page, "your card");
    await page.context().close();
  }
});

test("what you get: the small mark and the title, one statement, a plain roster, and what comes next", async () => {
  for (const [locale, say, next, cta] of [["ar", "أمسية مرتّبة من أولها لآخرها.", "التالي", "اختاري موعدك"], ["en", "An evening arranged from start to finish.", "Next", "Choose your time"]]) {
    const page = await open("#/what-you-get", { locale });
    await page.waitForSelector("#plan[data-kind=per_seat]");
    const mark = await page.evaluate(() => ({ same: document.querySelector(".ttl .mark").innerHTML === document.querySelector(".topbar .brand .mark").innerHTML,
      fill: getComputedStyle(document.querySelector(".ttl .mark circle:not(.ring)")).fill === getComputedStyle(document.querySelector(".topbar .mark circle:not(.ring)")).fill }));
    assert.deepEqual(mark, { same: true, fill: true }, "the mark is the logo as it is, only smaller");
    assert.equal((await page.locator(".wyg-say").innerText()).trim(), say);
    assert.equal(await page.locator(".roster li").count(), 5);
    assert.equal(await page.locator(".roster svg, #plan .benefits").count(), 0, "no icons");
    assert.equal(await page.locator("#plan").evaluate((e) => e.classList.contains("card")), false, "no card");
    assert.deepEqual([(await page.locator(".nextf small").innerText()).trim(), (await page.locator(".nextf b").innerText()).trim()], [next, cta]);
    assert.equal(await page.locator(".faq details").count(), 4, "the questions stay");
    await noSideScroll(page, "what you get");
    await page.context().close();
  }
  const page = await guest("#/what-you-get");
  assert.equal(await page.locator(".nextf").count(), 0, "a guest goes back to her questions, so no 'next'");
  assert.equal(await page.locator(".roster li").count(), 5);
  await page.context().close();
});

test("the revealed venue is one place card: the name, four facts from the booking, the code as the one yellow highlight, one button", async () => {
  const ev = (await call("GET", `/api/v1/bookings/${seated.booking}/event-details`, { token: seated.token })).body;
  assert.equal(ev.reveal.phase, "revealed");
  for (const locale of ["ar", "en"]) {
    const page = await open(`#/booking/${seated.booking}`, { who: seated, locale });
    await page.waitForSelector("#place");
    assert.equal((await page.locator("#place h2").innerText()).trim(), ev.venue.name);
    assert.equal(await page.locator("#place").getAttribute("aria-labelledby"), "place-h");
    const facts = await page.locator("#place .prow b").allInnerTexts();
    assert.equal(facts.length, 4);
    assert.ok(facts[0].includes(ev.venue.address), "the address the API gave");
    assert.equal(facts[2].trim(), ev.table.code);
    const code = await page.locator("#place .table-code").evaluate((e) => { const cs = getComputedStyle(e); return [cs.backgroundColor, cs.color]; });
    assert.deepEqual(code, [await asColour(page, "--c-accent"), await asColour(page, "--c-onAccent")]);
    assert.equal(await page.locator("#place a.btn").count(), 1);
    assert.equal(await page.locator("#place a.btn-primary").getAttribute("href"), ev.venue.map_url);
    assert.equal(await page.locator("#place a.btn-primary").evaluate((e) => getComputedStyle(e).backgroundColor), await asColour(page, "--c-primary"), "the button stays mauve");
    const text = await page.locator("#place").innerText();
    if (locale === "ar") assert.ok(text.includes(ev.venue.arrival_instructions) && text.includes(ev.venue.bill_policy), "arrival and bill lines as the API gives them");
    assert.ok((await page.locator("#place .arrive p").innerText()).trim().length > 0);
    await noSideScroll(page, "venue");
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});

test("cancelling: a when / what-you-get-back table from the booking's own rules, the row in force marked", async () => {
  const ev = (await call("GET", `/api/v1/bookings/${booked.booking}/event-details`, { token: booked.token })).body;
  assert.equal(ev.booking.cancellation.refund_if_cancelled_now, "full");
  const page = await open(`#/booking/${booked.booking}/cancel`, { who: booked });
  await page.waitForSelector("#cancel-table");
  const rows = () => page.locator("#cancel-table .when").evaluateAll((els) => els.map((e) => ({ now: e.classList.contains("now"), current: e.getAttribute("aria-current"), when: e.querySelector("dt").textContent.trim(),
    title: (e.querySelector("dd b") || {}).textContent || "", detail: (e.querySelector("dd span") || {}).textContent || "" })));
  let r = await rows();
  assert.equal(r.length, 2);
  const deadline = new Intl.DateTimeFormat("ar-QA-u-nu-latn", { timeZone: "Asia/Qatar", day: "numeric", month: "long" }).format(new Date(ev.booking.cancellation.full_refund_until));
  assert.deepEqual([r[0].now, r[0].current, r[0].title], [true, "true", "استرداد كامل"]);
  assert.ok(r[0].when.startsWith("حتى ") && r[0].when.includes(deadline), `this booking's deadline: ${r[0].when}`);
  assert.ok(r[0].detail.includes(ev.payment.amount.display) && r[0].detail.includes("10"), "the product's own refund sentence, with the amount she paid");
  assert.deepEqual([r[1].now, r[1].current, r[1].when, r[1].title, r[1].detail], [false, null, "بعد ذلك", "لا يوجد استرداد", ""]);
  assert.equal(await page.locator("main .banner").count(), 0, "said once, in the table");
  assert.equal((await page.locator("#go").innerText()).trim(), "تأكيد الإلغاء");
  assert.equal(await page.locator("#go").isDisabled(), false);
  await noSideScroll(page, "cancel");
  // after the deadline the second row is in force and says so in the product's words
  const late = async (patch) => {
    await page.unroute(`**/api/v1/bookings/${booked.booking}/event-details`).catch(() => {});
    await page.route(`**/api/v1/bookings/${booked.booking}/event-details`, async (route) => { const res = await route.fetch(), body = await res.json(); Object.assign(body.booking.cancellation, patch); await route.fulfill({ response: res, json: body }); });
    await page.reload(); await ready(page); await page.waitForSelector("#cancel-table");
    return rows();
  };
  r = await late({ refund_if_cancelled_now: "none" });
  assert.deepEqual([r[0].now, r[1].now, r[1].current, r[1].title], [false, true, "true", "لا يوجد استرداد"]);
  assert.ok(r[1].detail.startsWith("انتهت مهلة الاسترداد"), r[1].detail);
  r = await late({ refund_if_cancelled_now: "partial", late_cancel_refund_pct: 50 });
  assert.ok(r[1].now && r[1].detail.includes("50%"), `a policy with a late share says the share: ${r[1].detail}`);
  // really cancelling still works from this screen
  await page.unroute(`**/api/v1/bookings/${booked.booking}/event-details`);
  await page.reload(); await ready(page);
  await page.click("#go");
  await page.waitForFunction(() => document.querySelector("main h1") && document.querySelector("main h1").textContent.includes("تم إلغاء حجزك"));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("less motion: the thumb, the waitlist step and the row's check mark are in place at once", async () => {
  const page = await guest("#/quiz/0", { reducedMotion: "reduce" });
  await quizStep(page, ".quiz-q .scale");
  assert.equal(await page.locator(".scale .thumb").evaluate((e) => getComputedStyle(e).transitionDuration), "0s");
  await page.context().close();
  const p2 = await open("#/profile", { reducedMotion: "reduce" });
  await p2.click("#thm");
  await p2.waitForSelector("#thm .v.ok");
  assert.equal(await p2.locator("#thm .v.ok").evaluate((e) => getComputedStyle(e).animationName), "none");
  await p2.goto(`${env.base}/#/sessions`); await ready(p2);
  await p2.waitForSelector(".sess");
  if (await p2.locator(".wait-step").count()) assert.equal(await p2.locator(".wait-step").first().evaluate((e) => getComputedStyle(e).animationName), "none");
  await p2.context().close();
});
