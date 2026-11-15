// Website, round 2 of the reference-sites study (owner's decision of 14 Nov 2026; plan docs/plans/2026-11-14-rounds-1-3.md):
// - details: the date as one large numeral, and a slim summary that stays under the top bar once the heading is gone
// - choosing a session: the bottom bar floats as one pill; the chosen session's own cancellation line docks above it
// - review: a receipt (the amount large, the lines, what is due now), the cancellation line under the pay button
// - inbox: notifications on a rail under their day, the dot filled while new
// - my meetups before a first booking: a getting-ready card whose rows show real state
// - "how it works": a tag, one statement in two tones, three plain rows
// - feedback: each row's heading repeats the choice, the comment behind "+", a summary after sending
// - tab bar: the four links are kept and a marker glides to the current one
// - less motion: everything is in its final state at once
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signInAgain, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
let env, browser, call, owner, fresh, booked, pending, rater;
const S = {};

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  owner = await adminLogin(call, env.sql, "owner@example.test");
  const add = async (key, days, seats = 18) => {
    const at = new Date(Date.now() + days * DAY); at.setUTCHours(16, 30, 0, 0);
    const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
      starts_at: at.toISOString(), duration_minutes: 120, max_seats: seats, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
    S[key] = { id: s.body.id, at };
  };
  await env.sql`DELETE FROM app.event_sessions`;
  await add("far", 16); await add("other", 20); await add("rated", 9);
  fresh = await signUp(call, { name: "Noor" });
  booked = await signUp(call, { name: "Hind" });
  const b = await call("POST", "/api/v1/bookings", { token: booked.token, body: { session_id: S.far.id } });
  await payViaMock(call, await checkoutUrlFor(call, booked.token, b.body));
  booked.booking = b.body.booking_id;
  pending = await signUp(call, { name: "Maha" });
  pending.booking = (await call("POST", "/api/v1/bookings", { token: pending.token, body: { session_id: S.far.id } })).body.booking_id;
  // a finished meetup to rate: four paid seats, one table published and locked, then the session moved into the past
  for (const name of ["Sara", "Amal", "Jood", "Lama"]) {
    const u = await signUp(call, { name });
    const bk = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: S.rated.id } });
    await payViaMock(call, await checkoutUrlFor(call, u.token, bk.body));
    if (!rater) rater = { ...u, booking: bk.body.booking_id };
  }
  assert.equal((await call("POST", `/api/admin/v1/sessions/${S.rated.id}/matching:publish`, { token: owner.token, body: { seed: 5 } })).status, 201);
  const det = (await call("GET", `/api/admin/v1/sessions/${S.rated.id}`, { token: owner.token })).body;
  assert.equal((await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:lock`, { token: owner.token })).status, 200);
  await env.sql`UPDATE app.event_sessions SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour',
                  booking_opens_at = now() - interval '10 days', booking_closes_at = now() - interval '4 hours', lock_at = now() - interval '27 hours',
                  reveal_at = now() - interval '27 hours', check_in_opens_at = now() - interval '4 hours' WHERE id = ${S.rated.id}`;
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
// signed in (pattern of seats-ui.test.mjs: boot once with the tokens, then move within the app)
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
const token = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
// a colour token as the browser computes it on an element (so it can be compared with a computed style)
const asColour = (page, name) => page.evaluate((n) => { const e = document.createElement("i"); e.style.color = `var(${n})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, name);

test("details: the date leads as one large numeral; a summary appears under the top bar once the heading is gone", async () => {
  for (const locale of ["ar", "en"]) {
    const page = await open(`#/booking/${booked.booking}`, { who: booked, locale, viewport: { width: 390, height: 560 } });
    await page.waitForSelector(".det-head .bigdate");
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", day: "numeric" }).format(S.far.at);
    assert.equal((await page.locator(".bigdate b").innerText()).trim(), day);
    const info = await page.evaluate(() => { const b = document.querySelector(".bigdate b"), cs = getComputedStyle(b);
      return { size: parseFloat(cs.fontSize), hidden: document.querySelector(".bigdate").getAttribute("aria-hidden"), fits: b.getBoundingClientRect().right <= innerWidth && b.getBoundingClientRect().left >= 0,
        when: document.querySelector(".det-head .when").textContent.trim(), colour: cs.color }; });
    assert.ok(info.size >= 100, `the numeral is large (${info.size}px)`);
    assert.equal(info.hidden, "true", "a repeat of the heading: not read twice");
    assert.ok(info.fits && info.when.length > 4, "the full date and time stay in the heading for screen readers");
    assert.equal(info.colour, await asColour(page, "--c-primary"));
    // the summary: not there at the top, there after scrolling, gone again at the top
    const pinState = () => page.evaluate(() => { const p = document.querySelector("#pin"), cs = getComputedStyle(p); return { on: p.classList.contains("on"), visibility: cs.visibility, hidden: [...p.children].filter((c) => c.tagName === "SPAN").every((c) => c.getAttribute("aria-hidden") === "true") }; });
    assert.deepEqual(await pinState(), { on: false, visibility: "hidden", hidden: true });
    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForFunction(() => document.querySelector("#pin").classList.contains("on"));
    await settle(page);
    const pin = await page.evaluate(() => { const p = document.querySelector("#pin"), r = p.getBoundingClientRect(), t = document.querySelector("#topbar").getBoundingClientRect();
      return { text: p.innerText, below: r.top >= t.bottom - 1, inside: r.left >= 0 && r.right <= innerWidth, opacity: getComputedStyle(p).opacity }; });
    assert.ok(pin.below && pin.inside && pin.opacity === "1", JSON.stringify(pin));
    assert.ok(pin.text.includes(locale === "ar" ? "لوسيل" : "Lusail"), pin.text);
    await noSideScroll(page, "details, scrolled");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => !document.querySelector("#pin").classList.contains("on"));
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});

test("choosing a session: the bar is one floating pill, and the chosen session's own cancellation line docks above it", async () => {
  const sessions = (await call("GET", "/api/v1/sessions", { token: fresh.token })).body.sessions;
  const far = sessions.find((s) => s.id === S.far.id);
  for (const [locale, starts] of [["ar", "يمكنك الإلغاء مع استرداد كامل حتى"], ["en", "You can cancel with a full refund until"]]) {
    const page = await open("#/sessions", { locale });
    await page.waitForSelector(".book-dock .book-pill #go");
    assert.equal(await page.locator("#dock-note").isHidden(), true, "nothing chosen: no line");
    const pill = await page.evaluate(() => { const p = document.querySelector(".book-pill"), cs = getComputedStyle(p), bar = getComputedStyle(document.querySelector(".book-dock"));
      return { radius: parseFloat(cs.borderTopLeftRadius), barBg: bar.backgroundColor, fee: p.querySelector(".caption").textContent, btnBg: getComputedStyle(p.querySelector("#go")).borderTopLeftRadius }; });
    assert.ok(pill.radius >= 28, "a pill");
    assert.equal(pill.barBg, "rgba(0, 0, 0, 0)", "the bar itself is not a strip any more");
    assert.ok(pill.fee.includes(far.price.display.match(/\d+/)[0]), "the fee line of today stays in the pill");
    await page.locator(`.sess[data-id="${S.far.id}"] label`).click();
    await page.waitForFunction(() => document.querySelector("#dock-note").textContent.length > 0);
    const note = (await page.locator("#dock-note").innerText()).trim();
    assert.ok(note.startsWith(starts), note);
    const deadline = await page.evaluate(([iso, l]) => new Intl.DateTimeFormat(l === "ar" ? "ar-QA-u-nu-latn" : "en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "long" }).format(new Date(iso)), [far.full_refund_until, locale]);
    assert.ok(note.includes(deadline), `the session's real deadline (${deadline}) is in the line: ${note}`);
    await settle(page);
    const lay = await page.evaluate(() => { const n = document.querySelector("#dock-note").getBoundingClientRect(), p = document.querySelector(".book-pill").getBoundingClientRect(), g = document.querySelector("#go").getBoundingClientRect();
      window.scrollTo(0, document.documentElement.scrollHeight);
      const last = [...document.querySelectorAll("#f fieldset:not([hidden]), #f .sess")].pop().getBoundingClientRect();
      return { above: n.bottom <= p.top + 1, inView: p.bottom <= innerHeight + 1 && n.top >= 0, btnInPill: g.left >= p.left && g.right <= p.right && g.height >= 44, clear: last.bottom <= n.top + 1 }; });
    assert.deepEqual(lay, { above: true, inView: true, btnInPill: true, clear: true }, "the line sits above the pill and the end of the form scrolls clear of both");
    await noSideScroll(page, "sessions");
    assert.equal(await page.locator("#go").isDisabled(), false);
    await page.context().close();
  }
  // a session whose full-refund time has passed shows no line (the review screen carries the warning instead)
  const page = await open("#/sessions");
  await page.route("**/api/v1/sessions", async (route) => {
    const r = await route.fetch(), body = await r.json();
    for (const s of body.sessions) s.full_refund_until = new Date(Date.now() - 3600000).toISOString();
    await route.fulfill({ response: r, json: body });
  });
  await page.reload(); await ready(page);
  await page.locator(`.sess[data-id="${S.far.id}"] label`).click();
  await page.waitForFunction(() => !document.querySelector("#go").disabled);
  assert.equal((await page.locator("#dock-note").textContent()).trim(), "");
  await page.context().close();
});

test("review: a receipt, the amount large, what is due now last, and the cancellation line under the pay button", async () => {
  const amount = (await call("GET", `/api/v1/bookings/${pending.booking}`, { token: pending.token })).body.amount.display.match(/\d+/)[0];
  for (const [locale, due, starts] of [["ar", "المطلوب الآن", "إلغاء مجاني حتى"], ["en", "Due now", "Free cancellation until"]]) {
    const page = await open(`#/booking/${pending.booking}/review`, { who: pending, locale });
    await page.waitForSelector(".receipt #due-row");
    assert.ok((await page.locator("#rc-total").innerText()).includes(amount));
    assert.ok(parseFloat(await page.locator("#rc-total").evaluate((e) => getComputedStyle(e).fontSize)) >= 26, "the amount is the largest line");
    assert.ok((await page.locator(".rc-name").innerText()).includes(locale === "ar" ? "عشاء" : "Dinner"));
    const rows = await page.locator(".receipt .kv:not([hidden])").evaluateAll((els) => els.map((e) => [e.children[0].textContent.trim(), e.children[1].textContent.trim()]));
    assert.equal(rows.length, 7);
    assert.equal(rows[6][0], due, "the last line is what is due now");
    assert.equal(rows[6][1], (await page.locator("#rc-total").innerText()).trim());
    assert.ok(rows[5][1].includes(amount), "the fee line");
    assert.ok((await page.locator("#pay").innerText()).includes(amount), "the button carries the amount");
    const under = await page.evaluate(() => { const p = document.querySelector("#rc-policy"), b = document.querySelector("#pay");
      return { text: p.textContent, after: Boolean(b.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING), below: p.getBoundingClientRect().top >= b.getBoundingClientRect().bottom }; });
    assert.ok(under.text.startsWith(starts) && under.after && under.below, JSON.stringify(under));
    assert.equal(await page.locator(".banner-info").count(), 0, "the line is said once, under the button");
    assert.equal(await page.locator("#clock").count(), 1, "the seat-hold clock stays");
    await noSideScroll(page, "review");
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
  // a late booking keeps its warning and its check box above the button; nothing is promised under it
  const page = await open("#/home", { who: pending });
  await page.route(`**/api/v1/bookings/${pending.booking}/event-details`, async (route) => {
    const r = await route.fetch(), body = await r.json();
    Object.assign(body.booking.cancellation, { full_refund_window_open: false, refund_if_cancelled_after_payment: "none", acknowledgement_required: "late_no_refund", full_refund_until_hours: 48 });
    await route.fulfill({ response: r, json: body });
  });
  await page.goto(`${env.base}/#/booking/${pending.booking}/review`);
  await page.waitForSelector("#late");
  assert.equal(await page.locator("#rc-policy").count(), 0);
  assert.equal(await page.locator("#pay").isDisabled(), true);
  await page.locator("#ack").check({ force: true });
  assert.equal(await page.locator("#pay").isDisabled(), false);
  await page.context().close();
});

test("inbox: notifications sit on a rail under their day; the dot is filled while new and a ring on the next visit", async () => {
  const page = await open("#/inbox", { who: booked });
  await page.waitForSelector(".rail .msg");
  const list = (await call("GET", "/api/v1/notifications", { token: booked.token })).body.notifications; // read after the sign-in above, which adds one
  assert.ok(list.length >= 1, "the paid booking produced a notification");
  const days = [...new Set(list.map((n) => new Date(new Date(n.created_at).getTime() + 3 * 3600000).toISOString().slice(0, 10)))];
  assert.equal(await page.locator(".rail-day").count(), days.length, "one heading for each day");
  const head = await page.locator(".rail-day").first().evaluate((h) => ({ text: h.textContent.trim(), position: getComputedStyle(h).position, labels: h.parentElement.getAttribute("aria-labelledby") === h.id }));
  // the newest notification is from today: its day reads «اليوم» (design patterns, 15 Nov 2026)
  assert.equal(head.text, "اليوم");
  assert.equal(head.position, "sticky");
  assert.ok(head.labels, "each day is a labelled group");
  assert.equal(await page.locator(".rail .msg").count(), list.length);
  const dot = () => page.locator(".rail .msg").first().evaluate((m) => ({ isNew: m.classList.contains("is-new"), bg: getComputedStyle(m, "::before").backgroundColor, tag: m.querySelectorAll(".new-tag").length }));
  assert.deepEqual(await dot(), { isNew: true, bg: await asColour(page, "--c-primary"), tag: 1 }, "new: a filled dot, and the word (not colour alone)");
  await noSideScroll(page, "inbox");
  await page.goto(env.base + "/#/home"); await ready(page);
  await page.goto(env.base + "/#/inbox"); await ready(page);
  await page.waitForSelector(".rail .msg");
  assert.deepEqual(await dot(), { isNew: false, bg: await asColour(page, "--c-bg"), tag: 0 }, "seen: a ring");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("my meetups before a first booking: a getting-ready card with real states; opening the rules marks them read", async () => {
  for (const [locale, title, count0, count1] of [["ar", "قبل لقائك الأول", "1 من 4", "2 من 4"], ["en", "Before your first meetup", "1 of 4", "2 of 4"]]) {
    const page = await open("#/events", { locale });
    await page.waitForSelector(".ready-card");
    assert.equal(await page.locator(".empty").count(), 0, "the card stands where the empty state was");
    assert.equal((await page.locator(".ready-card h2").innerText()).trim(), title);
    assert.equal((await page.locator("#ready-n").innerText()).trim(), count0, "her answers are in; nothing else yet");
    const rows = await page.locator(".ready-card .ck-row").evaluateAll((els) => els.map((e) => ({ done: e.classList.contains("done"), struck: Boolean(e.querySelector("s")), href: e.getAttribute("href"), h: e.getBoundingClientRect().height })));
    assert.deepEqual(rows.map((r) => r.done), [true, false, false, false]);
    assert.ok(rows.every((r) => r.done === r.struck), "a done row is struck through, not only recoloured");
    assert.deepEqual(rows.slice(0, 3).map((r) => r.href), ["#/quiz/2", "#/home", "#/notify?next=profile"]);
    assert.ok(rows.every((r) => r.h >= 44), "every row is a 44 px target");
    // the rules open in place, and that marks them read on this device
    await page.locator("#ready-rules summary").click();
    await page.waitForFunction((c) => document.querySelector("#ready-n").textContent.trim() === c, count1);
    assert.ok((await page.locator("#ready-rules p").innerText()).trim().length > 0, "the conduct rules themselves");
    assert.equal(await page.locator("#ready-rules summary").evaluate((e) => e.classList.contains("done") && Boolean(e.querySelector("s"))), true);
    await noSideScroll(page, "getting ready");
    await page.reload(); await ready(page);
    await page.waitForSelector(".ready-card");
    assert.equal((await page.locator("#ready-n").innerText()).trim(), count1, "remembered on this device");
    assert.equal((await page.locator(".ready-card + .btn").getAttribute("href")), "#/home");
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
  // with a booking the usual next-meetup card shows, not the getting-ready card
  const page = await open("#/events", { who: booked });
  await page.waitForSelector(".card.hero");
  assert.equal(await page.locator(".ready-card").count(), 0);
  await page.context().close();
});

test("how it works: a tag, one statement in two tones, and three plain rows", async () => {
  for (const [locale, tag, say, rest] of [["ar", "كيف يعمل HerZone", "طاولة صغيرة تُختار بعناية.", "أنتِ تجيبين، ونحن نرتّب الباقي."],
    ["en", "How HerZone works", "A small table, chosen with care.", "You answer, and we arrange the rest."]]) {
    const page = await guest("#/quiz/0", { locale });
    let found = false;
    for (let i = 0; i < 40 && !found; i += 1) {
      await page.goto(`${env.base}/#/quiz/${i}`);
      await page.waitForFunction((n) => location.hash === `#/quiz/${n}` && document.querySelector("main h1") && document.querySelector("#nx, #yes"), i);
      found = (await page.locator("[data-inter=how]").count()) === 1;
    }
    assert.ok(found, "the how-it-works screen is in the questionnaire");
    assert.equal((await page.locator("[data-inter=how] .tag").innerText()).trim(), tag);
    assert.equal((await page.locator("[data-inter=how] h1").innerText()).replace(/\s+/g, " ").trim(), `${say} ${rest}`);
    const tones = await page.evaluate(() => { const h = document.querySelector("[data-inter=how] h1"); return [getComputedStyle(h).color, getComputedStyle(h.querySelector("i")).color, getComputedStyle(h.querySelector("i")).fontStyle]; });
    assert.equal(tones[0], await asColour(page, "--c-text"));
    assert.equal(tones[1], await asColour(page, "--c-textMuted"));
    assert.equal(tones[2], "normal");
    assert.equal(await page.locator("[data-inter=how] .plain-steps li").count(), 3);
    assert.equal(await page.locator("[data-inter=how] .steps, [data-inter=how] .art").count(), 0, "no numbered circles, no icon tile");
    assert.equal(await page.title(), `${tag} · HerZone`);
    await settle(page);
    await noSideScroll(page, "how it works");
    await page.click("#nx");
    await page.waitForFunction(() => !document.querySelector("[data-inter=how]"));
    await page.context().close();
  }
});

test("feedback: each row's heading repeats her choice, the comment waits behind +, and a summary follows", async () => {
  const page = await open(`#/booking/${rater.booking}/feedback`, { who: rater });
  await page.waitForSelector("input[name=overall]");
  assert.equal(await page.locator(".segs").count(), 3, "three 1-5 rows");
  const legend = (name) => page.locator(`fieldset:has(input[name=${name}]) legend`).innerText().then((t) => t.replace(/\s+/g, " ").trim());
  assert.equal(await legend("overall"), "التقييم العام");
  const pick = (name, v) => page.locator(`input[name=${name}][value="${v}"]`).check({ force: true });
  await pick("overall", 2);
  assert.equal(await legend("overall"), "التقييم العام : 2 من 5");
  await page.locator("#reasons .chip", { hasText: "المكان" }).click();
  await page.locator("#reasons .chip", { hasText: "الطعام أو الخدمة" }).click();
  assert.equal((await page.locator("#reasons legend").innerText()).replace(/\s+/g, " ").trim(), "ما الذي لم يعجبكِ؟ (اختياري) : المكان، الطعام أو الخدمة");
  await pick("comfort", 4);
  assert.equal(await legend("comfort"), "هل شعرتِ بالراحة في الحوار؟ : 4 من 5");
  assert.equal(await legend("venue"), "تقييم المكان (اختياري)", "an unanswered row repeats nothing");
  // the comment: closed at first, opened by its row, announced to assistive technology
  assert.equal(await page.locator("#cm").isVisible(), false);
  assert.deepEqual(await page.locator("#cm-more").evaluate((b) => [b.getAttribute("aria-expanded"), b.getAttribute("aria-controls"), b.querySelector(".pm").textContent]), ["false", "cm-box", "+"]);
  await page.locator("#cm-more").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#cm").isVisible(), true);
  assert.equal(await page.locator("#cm-more").getAttribute("aria-expanded"), "true");
  assert.equal(await page.evaluate(() => document.activeElement.id), "cm", "the keyboard lands in the field");
  await page.fill("#cm", "شكرًا");
  await noSideScroll(page, "feedback");
  await page.click("#go");
  await page.waitForSelector("#fb-sum");
  const sum = await page.locator("#fb-sum .kv").evaluateAll((els) => els.map((e) => [e.children[0].textContent.trim(), e.children[1].textContent.trim()]));
  assert.deepEqual(sum, [["التقييم العام", "2 من 5"], ["هل شعرتِ بالراحة في الحوار؟", "4 من 5"], ["ما الذي لم يعجبكِ؟ (اختياري)", "المكان، الطعام أو الخدمة"]]);
  const [fb] = await env.sql`SELECT overall_rating, comfort_rating, venue_rating, comment_private AS comment, low_rating_reasons FROM app.event_feedback WHERE booking_id = ${rater.booking}`;
  assert.deepEqual([fb.overall_rating, fb.comfort_rating, fb.venue_rating, fb.comment], [2, 4, null, "شكرًا"], "what was sent is what the summary says");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("tab bar: the same four links stay while a marker glides to the current tab; a new language redraws it", async () => {
  const page = await open("#/home");
  await page.waitForSelector("#tabbar a[aria-current=page]");
  await page.evaluate(() => { document.querySelector("#tabbar a[href='#/home']").dataset.kept = "1"; });
  const marker = () => page.evaluate(() => { const nav = document.querySelector("#tabbar"), a = nav.querySelector("a[aria-current=page]"), cs = getComputedStyle(nav, "::before");
    return { x: nav.style.getPropertyValue("--ind-x"), w: nav.style.getPropertyValue("--ind-w"), left: `${a.offsetLeft}px`, width: `${a.offsetWidth}px`, drawn: cs.width, href: a.getAttribute("href"), current: nav.querySelectorAll("a[aria-current=page]").length }; });
  let m = await marker();
  assert.deepEqual([m.x, m.w, m.drawn, m.href, m.current], [m.left, m.width, m.width, "#/home", 1]);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#tabbar"), "::before").backgroundColor), await asColour(page, "--c-primarySubtle"));
  assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector("#tabbar"), "::before").transitionDuration.includes("0.4s")), "it glides");
  const first = m.x;
  await page.click("#tabbar a[href='#/profile']"); await ready(page);
  await page.waitForFunction(() => document.querySelector("#tabbar a[aria-current=page]").getAttribute("href") === "#/profile");
  m = await marker();
  assert.deepEqual([m.x, m.w, m.current], [m.left, m.width, 1]);
  assert.notEqual(m.x, first, "the marker moved to the new tab");
  assert.equal(await page.evaluate(() => document.querySelector("#tabbar a[href='#/home']").dataset.kept), "1", "the links were kept, not drawn again");
  assert.equal(await page.locator("#tabbar a").count(), 4);
  // a new language draws the bar again, with its labels, and the marker is on the same tab
  await page.click("#lng"); await ready(page);
  await page.waitForFunction(() => document.documentElement.lang === "en" && document.querySelector("#tabbar a[aria-current=page]"));
  assert.equal((await page.locator("#tabbar a[aria-current=page]").innerText()).trim(), "Account");
  m = await marker();
  assert.deepEqual([m.x, m.w], [m.left, m.width]);
  // a detail screen hides the bar; coming back shows it with the marker in place
  await page.goto(`${env.base}/#/plans`); await ready(page);
  assert.equal(await page.locator("#tabbar").isHidden(), true);
  await page.goto(`${env.base}/#/inbox`); await ready(page);
  m = await marker();
  assert.deepEqual([m.x, m.href], [m.left, "#/inbox"]);
  await page.context().close();
});

test("less motion: the numeral, the summary, the docked line and the tab marker are in place at once", async () => {
  const page = await open(`#/booking/${booked.booking}`, { who: booked, reducedMotion: "reduce", viewport: { width: 390, height: 560 } });
  await page.waitForSelector(".bigdate b");
  assert.equal(await page.locator(".bigdate b").evaluate((e) => getComputedStyle(e).animationName), "none");
  assert.equal(await page.locator("#pin").evaluate((e) => getComputedStyle(e).transitionDuration), "0s");
  await page.goto(`${env.base}/#/sessions`); await ready(page);
  await page.locator(`.sess[data-id="${S.other.id}"] label`).click();
  await page.waitForFunction(() => document.querySelector("#dock-note").textContent.length > 0);
  assert.equal(await page.locator("#dock-note").evaluate((e) => getComputedStyle(e).animationName), "none");
  await page.goto(`${env.base}/#/home`); await ready(page);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#tabbar"), "::before").transitionDuration), "0s");
  await page.goto(`${env.base}/#/events`); await ready(page);
  await page.context().close();
});

test("dark theme: the new pieces use the dark tokens (pill, receipt lines, rail, getting-ready card)", async () => {
  const page = await open("#/sessions", { colorScheme: "dark" });
  await page.waitForSelector(".book-pill");
  assert.equal(await token(page, "--c-bg"), "#241620", "the dark tokens are on");
  assert.equal(await page.locator(".book-pill").evaluate((e) => getComputedStyle(e).backgroundColor), await asColour(page, "--c-surface"));
  await page.goto(`${env.base}/#/events`); await ready(page);
  await page.waitForSelector(".ready-card");
  assert.equal(await page.locator(".ready-card").evaluate((e) => getComputedStyle(e).backgroundColor), await asColour(page, "--c-primarySubtle"));
  assert.equal(await page.locator(".ready-card .ck-row.done").first().evaluate((e) => getComputedStyle(e).color), await asColour(page, "--c-textMuted"));
  await page.goto(`${env.base}/#/home`); await ready(page);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#tabbar"), "::before").backgroundColor), await asColour(page, "--c-primarySubtle"));
  await noSideScroll(page, "dark");
  await page.context().close();
});
