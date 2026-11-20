// Website: design patterns of 15 Nov 2026 (owner's list, items 1-13; sources in docs/design/taste-2026-11-15).
// 1 the booking bar names her pick or why it waits  2 a key under the table drawing  3 three steps on review
// 4 pay buttons carry the amount  5 confirmation on the control  6 appearance is a real switch  7 notifications by day
// 8 one ink underline on where and when (60-30-10, 20 Nov 2026: it was mauve)  9 the contact sheet in the pinned bar on the meetup day
// 10 status and chevron on this week's photos  11 time left on the resume card  12 icon tiles on account rows
// 13 week headings carry their count
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signInAgain, signUp, startTestEnv } from "./helpers.mjs";
import { STRINGS } from "../../web/strings.js";
import { buildSteps, minutesLeft } from "../../web/quiz-flow.js";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
let env, browser, call, owner, member, pending;
const S = {};
const ar = STRINGS.ar, en = STRINGS.en;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  owner = await adminLogin(call, env.sql, "owner@example.test");
  await env.sql`DELETE FROM app.event_sessions`;
  await env.sql`INSERT INTO app.price_plans (city_id, experience, service_fee_minor, valid_from) VALUES ('doh', 'coffee', 3900, now() - interval '1 day')`;
  const add = async (key, experience, days, seats = 18, hour = 16) => {
    const at = new Date(Date.now() + days * DAY); at.setUTCHours(hour, 30, 0, 0);
    const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience, conversation_language: "ar",
      starts_at: at.toISOString(), duration_minutes: 120, max_seats: seats, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
    S[key] = s.body.id;
  };
  // the nearest meetups share one day, so they are all in the first group (the photo row) whatever today is
  await add("open", "dinner", 2, 18, 10); await add("coffee", "coffee", 2, 18, 11); await add("full", "dinner", 2, 4, 12); await add("mine", "dinner", 2, 18, 13);
  await add("later", "dinner", 16);
  member = await fresh("Hind");
  for (const n of ["Sara", "Amal", "Jood", "Lama"]) await paid(await fresh(n), S.full);
  S.myBooking = await paid(member, S.mine);
  pending = await fresh("Rana");
  const b = await call("POST", "/api/v1/bookings", { token: pending.token, body: { session_id: S.later } });
  assert.equal(b.status, 201);
  pending.booking = b.body.booking_id;
});
after(async () => { await browser?.close(); await env?.stop(); });

async function tokensFor(u) { await env.sql`DELETE FROM app.otp_challenges`; return signInAgain(call, env.sql, u.phone); }
async function fresh(name) { await env.sql`DELETE FROM app.otp_challenges`; return signUp(call, { name }); }
async function paid(u, session) {
  const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: session } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  await payViaMock(call, await checkoutUrlFor(call, u.token, b.body));
  return b.body.booking_id;
}
const ready = (page) => page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
async function context({ width = 390, height = 844, ...opts } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block", ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return ctx;
}
// routes: [[pattern, (json) => void]] change a real answer before the page sees it
async function open(hash, { who = member, locale = "ar", routes = [], signedOut = false, store = {}, ...opts } = {}) {
  const page = await (await context(opts)).newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  for (const [re, edit] of routes) await page.route(re, async (r) => { const res = await r.fetch(); const j = await res.json(); edit(j); r.fulfill({ response: res, json: j }); });
  await page.goto(env.base + "/");
  const t = signedOut ? null : await tokensFor(who);
  await page.evaluate(([x, l, st]) => { if (x) localStorage.setItem("q_tokens", JSON.stringify(x)); localStorage.setItem("q_locale", JSON.stringify(l));
    for (const [k, v] of Object.entries(st)) localStorage.setItem("q_" + k, JSON.stringify(v)); }, [t, locale, store]);
  await page.goto("about:blank"); await page.goto(env.base + "/" + hash); await ready(page);
  return page;
}
const asColour = (page, name) => page.evaluate((n) => { const e = document.createElement("i"); e.style.color = `var(${n})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, name);
const noSideScroll = async (page, what) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${what}: the page scrolls sideways`);
const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

test("1. the booking bar says why Continue waits, then names her pick (date · time · kind); the form scrolls clear of it", async () => {
  for (const [locale, L] of [["ar", ar], ["en", en]]) {
    const page = await open("#/sessions", { locale, width: 360 });
    await page.waitForSelector("#dock-pick");
    assert.equal((await page.locator("#dock-pick").innerText()).trim(), L.readyPick);
    assert.deepEqual(await page.locator("#go").evaluate((b) => [b.disabled, b.getAttribute("aria-describedby")]), [true, "dock-pick"]);
    await page.locator(`.sess[data-id="${S.open}"] label`).click();
    await page.waitForFunction(() => !document.querySelector("#go").disabled);
    const pick = (await page.locator("#dock-pick").innerText()).trim();
    assert.equal(pick.split(" · ").length, 3, pick);
    assert.ok(pick.endsWith(L.dinner), pick);
    assert.equal(await page.locator("#go").getAttribute("aria-describedby"), null);
    assert.equal((await page.locator("#go").innerText()).trim(), L.continueToPay, "the button names the action");
    // the room under the form follows the bar's real height, and focus never lands under it
    // the bar grows when her pick fills it; a ResizeObserver then resizes the room, a frame later: wait for it (up to 3 s)
    await page.waitForFunction(() => { const bar = document.querySelector(".book-dock").getBoundingClientRect().height;
      return parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) >= bar && parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom) >= bar; }, null, { timeout: 3000 }).catch(() => {});
    const room = await page.evaluate(() => ({ pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom), bar: document.querySelector(".book-dock").getBoundingClientRect().height,
      mainPad: parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom) }));
    assert.ok(room.pad >= room.bar && room.mainPad >= room.bar, JSON.stringify(room));
    await noSideScroll(page, "sessions");
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});

test("2. the table drawing has a key in words: a filled mauve seat is taken, a dashed one is free", async () => {
  const page = await open(`#/booking/${S.myBooking}`, { routes: [[/\/event-details$/, (j) => { j.reveal.phase = "locked"; j.table = { capacity: 6, confirmed_count: 4, code: "A1", members: null, shared_themes: [] }; }]] });
  await page.waitForSelector("#seat-key");
  assert.deepEqual(await page.locator("#seat-key li").allInnerTexts(), [ar.keyTaken, ar.keyFree]);
  const dots = await page.locator("#seat-key circle").evaluateAll((cs) => cs.map((c) => { const s = getComputedStyle(c); return [c.getAttribute("class"), s.strokeDasharray]; }));
  assert.equal(dots[0][0], "seat on"); assert.equal(dots[1][0], "seat off");
  assert.notEqual(dots[1][1], "none", "the free seat is dashed");
  assert.equal(await page.locator("#seat-key circle.on").evaluate((c) => getComputedStyle(c).fill), await asColour(page, "--c-seat"));
  await page.context().close();
});

test("3-5. review: three steps (done, current, next), the pay button carries the amount, and +1 confirms on itself", async () => {
  const amount = (await call("GET", `/api/v1/bookings/${pending.booking}`, { token: pending.token })).body.amount.display;
  for (const [locale, L] of [["ar", ar], ["en", en]]) {
    const page = await open(`#/booking/${pending.booking}/review`, { who: pending, locale, width: 360 });
    await page.waitForSelector("#steps3");
    assert.equal(await page.locator("#steps3").getAttribute("aria-label"), L.stepsLabel);
    const steps = await page.locator("#steps3 li").evaluateAll((ls) => ls.map((l) => ({ text: l.innerText.trim(), cls: l.className, cur: l.getAttribute("aria-current"), tick: Boolean(l.querySelector("svg")),
      fits: l.scrollWidth <= l.clientWidth + 1 && l.getBoundingClientRect().right <= innerWidth && l.getBoundingClientRect().left >= 0, bg: getComputedStyle(l).backgroundColor })));
    assert.deepEqual(steps.map((s) => [s.text, s.cls, s.cur, s.tick]), [[L.dateTime, "done", null, true], [L.stepReview, "current", "step", false], [L.stepPay, "", null, false]]);
    assert.ok(steps.every((s) => s.fits), "the row fits a 360 px phone");
    assert.equal(steps[0].bg, await asColour(page, "--c-surfaceSunken"), "done: a neutral fill with its tick (60-30-10)");
    const fee = locale === "en" ? `QAR ${amount.match(/[\d.]+/)[0]}` : amount;
    assert.equal((await page.locator("#pay").innerText()).trim(), L.pay.replace("{fee}", fee));
    // +1: the tick joins the mark while it is on; no pop-up message
    assert.equal(await page.locator("#plus-btn .plus-ok").isVisible(), false);
    await page.locator("#plus-btn").click();
    assert.equal(await page.locator("#plus-btn .plus-ok").isVisible(), true);
    assert.equal((await page.locator("#plus-btn").textContent()).trim(), "+1");
    await page.locator("#plus-btn").click();
    assert.equal(await page.locator("#plus-btn .plus-ok").isVisible(), false);
    assert.equal(await page.locator("#toast").textContent(), "");
    await noSideScroll(page, "review");
    await page.context().close();
  }
  // a failed payment: "try again" names the action and the amount
  const page = await open(`#/pay/return/${pending.booking}`, { who: pending, routes: [[new RegExp(`/bookings/${pending.booking}$`), (j) => { j.payment = { status: "failed" }; }]] });
  await page.waitForSelector("#pay-again");
  assert.equal((await page.locator("#pay-again").innerText()).trim(), ar.pay.replace("{fee}", amount));
  await page.context().close();
});

test("6, 12. account: each row's icon on a 40 px neutral tile; appearance is a switch that Space and Enter turn", async () => {
  const page = await open("#/profile");
  const tiles = await page.locator(".settings .rl").evaluateAll((rs) => rs.map((r) => { const t = r.querySelector(".ri"); if (!t) return null; const b = t.getBoundingClientRect();
    return [Math.round(b.width), Math.round(b.height), getComputedStyle(t).backgroundColor, Boolean(t.querySelector("svg"))]; }));
  const sunken = await asColour(page, "--c-surfaceSunken");
  assert.ok(tiles.length >= 9 && tiles.every((t) => t && t[0] === 40 && t[1] === 40 && t[2] === sunken && t[3]), JSON.stringify(tiles));
  const sw = page.locator("#thm");
  assert.deepEqual(await sw.evaluate((b) => [b.getAttribute("role"), b.getAttribute("aria-checked"), b.getAttribute("aria-label"), b.getBoundingClientRect().height >= 44]), ["switch", "false", ar.themeToDark, true]);
  assert.ok((await sw.innerText()).includes(ar.themeToDark), "the visible label is in the name");
  const thumb = () => page.locator("#thm .sw-t").evaluate((t) => ({ x: Math.round(t.getBoundingClientRect().left), tick: getComputedStyle(t.querySelector("svg")).opacity }));
  const off = await thumb();
  assert.equal(off.tick, "0");
  await sw.focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark" && document.querySelector("#thm").getAttribute("aria-checked") === "true");
  await page.waitForTimeout(400);
  const on = await thumb();
  assert.notEqual(on.x, off.x, "the thumb moved"); assert.equal(on.tick, "1", "and shows a tick");
  assert.ok(on.x < off.x, "toward the reading end (left in Arabic)");
  assert.equal(await page.evaluate(() => document.activeElement.id), "thm");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light" && document.querySelector("#thm").getAttribute("aria-checked") === "false");
  // the top bar's own button keeps the switch true
  await page.click("#theme");
  await page.waitForFunction(() => document.querySelector("#thm").getAttribute("aria-checked") === "true");
  assert.equal(await page.locator("#toast").textContent(), "");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("7. notifications: «اليوم», «أمس», then weekday and date; the new-since-last-visit dot stays", async () => {
  const now = Date.now(), iso = (d) => new Date(now - d * DAY).toISOString();
  const list = [{ id: "n1", text: "a", created_at: iso(0) }, { id: "n2", text: "b", created_at: iso(1) }, { id: "n3", text: "c", created_at: iso(3) }];
  for (const [locale, L] of [["ar", ar], ["en", en]]) {
    const page = await (await context()).newPage();
    await page.route(/\/api\/v1\/notifications$/, (r) => r.fulfill(json({ notifications: list })));
    await page.goto(env.base + "/");
    await page.evaluate(([t, l]) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify(l)); }, [await tokensFor(member), locale]);
    await page.goto("about:blank"); await page.goto(env.base + "/#/inbox"); await ready(page);
    await page.waitForSelector(".rail-day");
    const third = new Intl.DateTimeFormat(locale === "ar" ? "ar-QA-u-nu-latn" : "en-GB", { timeZone: "Asia/Qatar", weekday: "long", day: "numeric", month: "long" }).format(new Date(list[2].created_at));
    assert.deepEqual(await page.locator(".rail-day").allInnerTexts(), [L.dayToday, L.dayYesterday, third]);
    assert.equal(await page.locator(".rail .msg.is-new").count(), 3, "all new on a first visit");
    await page.context().close();
  }
});

test("8. details: where and when underline once in ink as they come into view; nothing under less motion", async () => {
  const venue = (j) => { j.reveal.phase = "revealed"; j.table = { capacity: 6, confirmed_count: 5, code: "B7", members: null, shared_themes: [] };
    j.venue = { name: "Café Rose", address: "Street 1", district: "Lusail", map_url: "https://maps.example/x", arrival_instructions: "Ask at the desk", bill_policy: "Each pays her own" }; };
  const page = await open(`#/booking/${S.myBooking}`, { height: 640, routes: [[/\/event-details$/, venue]] });
  await page.waitForSelector("#place .hl");
  assert.equal(await page.locator("#place .hl").count(), 2, "the place and the time");
  await page.locator("#place").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector("#place").scrollIntoView({ block: "center" }));
  await page.waitForFunction(() => document.querySelector("#place").classList.contains("hl-on"));
  await page.waitForTimeout(1000);
  const line = await page.locator("#place .hl").first().evaluate((h) => { const s = getComputedStyle(h, "::after"); return { bg: s.backgroundColor, t: s.transform, h: s.height }; });
  assert.equal(line.bg, await asColour(page, "--c-text"), "ink (60-30-10), never yellow");
  assert.equal(line.h, "2px");
  assert.ok(["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(line.t), line.t);
  await page.context().close();
  const calm = await open(`#/booking/${S.myBooking}`, { reducedMotion: "reduce", routes: [[/\/event-details$/, venue]] });
  await calm.waitForSelector("#place .hl");
  await calm.evaluate(() => document.querySelector("#place").scrollIntoView({ block: "center" }));
  await calm.waitForTimeout(500);
  assert.equal(await calm.locator("#place").evaluate((p) => p.classList.contains("hl-on")), false);
  assert.equal(await calm.locator("#place .hl").first().evaluate((h) => getComputedStyle(h, "::after").display), "none");
  await calm.context().close();
});

test("9. meetup day: the pinned bar holds a 44 px button to the contact sheet; its text stays hidden from screen readers", async () => {
  const page = await open(`#/booking/${S.myBooking}`, { height: 480, routes: [[/\/event-details$/, (j) => { j.reveal.phase = "day_of"; }]] });
  await page.waitForSelector("#pin-help", { state: "attached" });
  assert.deepEqual(await page.locator("#pin > span").evaluateAll((ss) => ss.map((s) => s.getAttribute("aria-hidden"))), ["true", "true"]);
  assert.equal(await page.locator("#pin").getAttribute("aria-hidden"), null);
  assert.equal(await page.locator("#pin-help").isVisible(), false, "not there before the heading scrolls away");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => document.querySelector("#pin").classList.contains("on"));
  await page.waitForTimeout(300);
  const b = await page.locator("#pin-help").evaluate((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), x.getAttribute("aria-label"), r.right <= innerWidth && r.left >= 0]; });
  assert.deepEqual(b, [44, 44, ar.contactRequest, true]);
  await page.locator("#pin-help").click();
  await page.locator("dialog.contact-sheet[open]").waitFor();
  await page.context().close();
  // another phase: no button
  const other = await open(`#/booking/${S.myBooking}`);
  assert.equal(await other.locator("#pin-help").count(), 0);
  await other.context().close();
});

test("10, 13. home: the status sits on each photo with a 32 px chevron; week headings carry their count", async () => {
  const page = await open("#/home");
  await page.waitForSelector(".peek a.photo-card");
  const card = (id) => page.locator(`a.photo-card[data-session="${id}"]`);
  assert.equal((await card(S.full).locator(".shot-pill").innerText()).trim(), ar.full);
  assert.equal((await card(S.mine).locator(".shot-pill").innerText()).trim(), ar.alreadyBooked);
  assert.equal(await card(S.open).locator(".shot-pill").count(), 0, "plenty of seats: nothing said");
  assert.equal(await card(S.full).locator(".shot-pill").evaluate((p) => getComputedStyle(p).color), await asColour(page, "--c-danger"));
  assert.equal(await card(S.full).locator(".t .m").count(), 1, "the status is no longer repeated under the photo");
  assert.ok((await card(S.full).getAttribute("aria-label")).endsWith(ar.full), "the spoken label still says it");
  const go = await card(S.open).locator(".shot-go").evaluate((g) => { const r = g.getBoundingClientRect(), img = g.parentElement.querySelector("img").getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height), r.bottom <= img.bottom && r.left >= img.left, g.getAttribute("aria-hidden")]; });
  assert.deepEqual(go, [32, 32, true, "true"]);
  // counts
  const heads = await page.locator(".week-group > h2").evaluateAll((hs) => hs.map((h) => ({ n: h.querySelector(".num").textContent.trim(), sr: h.querySelector(".sr-only").textContent, cards: h.parentElement.querySelectorAll("li").length })));
  for (const h of heads) { assert.equal(h.n, `· ${h.cards}`); assert.ok(h.sr.includes(String(h.cards))); }
  const first = page.locator(".week-group > h2").first();
  await page.locator(".tile[data-kind=coffee]").click();
  assert.equal((await first.locator(".num").textContent()).trim(), "· 1", "recounted when the filter hides cards");
  await page.context().close();
});

test("11. the resume card says how long is left, in the questionnaire's own words", async () => {
  const preview = (await call("GET", "/api/v1/questionnaires/preview")).body;
  const steps = buildSteps(preview.questions);
  const at = steps.findIndex((s) => s.kind === "q" && s.index === 2);
  const left = steps.slice(at).filter((s) => s.kind === "q").length;
  const m = minutesLeft(left), key = m === 0 ? "timeLeftUnder" : m === 1 ? "timeLeftOne" : m === 2 ? "timeLeftTwo" : "timeLeftFew";
  const page = await open("#/welcome", { signedOut: true, store: { quiz: { version_id: preview.questionnaire_version_id, answers: { [preview.questions[0].id]: [preview.questions[0].options[0].id] } }, resume: `#/quiz/${at}` } });
  await page.waitForSelector("#resume-card .time-left");
  assert.equal((await page.locator("#resume-card .caption").innerText()).trim(), `${ar.resumeBody.replace("{n}", "1")} · ${ar[key]}`);
  await page.context().close();
});
