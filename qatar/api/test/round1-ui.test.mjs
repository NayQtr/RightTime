// Website, round 1 of the reference-sites study (owner's decision of 14 Nov 2026; plan docs/plans/2026-11-14-rounds-1-3.md):
// - welcome: an atmosphere photo instead of the table drawing, nothing under the two buttons
// - home: this week's meetups as a row of photo cards, the week strip and two tiles as the filter, a count for the day
// - questionnaire: an answer dims while pressed; on a question with several answers the heading gives way to one reply
//   line, and the question stays there for screen readers and comes back when she changes her answer
// - the next-meetup card in a double frame, its rows arriving one by one
// - /about: four type sizes, a statement and then a captioned photo
// - less motion: everything is in its final state at once
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signInAgain, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
// calendar day in Asia/Qatar, as the site computes it
const qatarDay = (ms) => new Date(ms + 3 * 3600000).toISOString().slice(0, 10);
let env, browser, call, member, booked;
const S = {};

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const owner = await adminLogin(call, env.sql, "owner@example.test");
  const add = async (key, days, experience, hour) => {
    const at = new Date(Date.now() + days * DAY); at.setUTCHours(hour, 0, 0, 0); // 13:00 or 16:00 UTC: the same Qatar day
    const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience, conversation_language: "ar",
      starts_at: at.toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
    S[key] = { id: s.body.id, day: qatarDay(at.getTime()) };
  };
  // only this file's sessions are on sale, so the nearest ones are known; the seed prices dinner only; coffee gets a price so that coffee sessions can be opened
  await env.sql`DELETE FROM app.event_sessions`;
  await env.sql`INSERT INTO app.price_plans (city_id, experience, service_fee_minor, valid_from) VALUES ('doh', 'coffee', 3900, now() - interval '1 day')`;
  // (a session opens at least 25 hours ahead) in 2 days: a dinner and a coffee; in 3: one coffee; in 4: three dinners;
  // in 5: eleven dinners; and one much later
  await add("dinner1", 2, "dinner", 16); await add("coffee1", 2, "coffee", 13);
  await add("coffee2", 3, "coffee", 13);
  for (let k = 0; k < 3; k += 1) await add(`three${k}`, 4, "dinner", 16);
  for (let k = 0; k < 11; k += 1) await add(`many${k}`, 5, "dinner", 16);
  await add("later", 16, "dinner", 16);
  member = await signUp(call, { name: "Noor" });
  booked = await signUp(call, { name: "Hind" });
  const b = await call("POST", "/api/v1/bookings", { token: booked.token, body: { session_id: S.later.id } });
  await payViaMock(call, await checkoutUrlFor(call, booked.token, b.body));
});
after(async () => { await browser?.close(); await env?.stop(); });

async function context(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return ctx;
}
const ready = (page) => page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
// signed out: the welcome screen and the questionnaire
async function guest(hash, { locale = "ar", ...opts } = {}) {
  const page = await (await context(opts)).newPage();
  await page.goto(env.base + "/");
  await page.evaluate((l) => localStorage.setItem("q_locale", JSON.stringify(l)), locale);
  await page.goto(env.base + "/" + hash); await page.reload(); await ready(page);
  return page;
}
// signed in (pattern of seats-ui.test.mjs: boot once with the tokens, then move within the app)
async function open(hash, { who = member, locale = "ar", ...opts } = {}) {
  const page = await (await context(opts)).newPage();
  await page.goto(env.base + "/");
  const tokens = await signInAgain(call, env.sql, who.phone);
  await page.evaluate(([t, l]) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify(l)); }, [tokens, locale]);
  await page.reload(); await ready(page);
  await page.goto(env.base + "/" + hash); await ready(page);
  return page;
}
const noSideScroll = async (page, what) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${what}: the page scrolls sideways`);
// the first questionnaire step whose answers are check boxes (several answers) or radio buttons (one answer)
async function quizStep(page, type) {
  for (let i = 0; i < 40; i += 1) {
    await page.goto(`${env.base}/#/quiz/${i}`);
    await page.waitForFunction((n) => location.hash === `#/quiz/${n}` && document.querySelector("main h1") && document.querySelector("#nx, #yes"), i);
    if (await page.locator(`.options input[name=o][type=${type}]`).count()) return i;
  }
  throw new Error(`no ${type} question`);
}
const shownCards = (page) => page.evaluate(() => [...document.querySelectorAll(".event-card[data-session]")].filter((a) => a.getClientRects().length).map((a) => a.dataset.session).sort());

test("welcome: the photo stands where the table drawing was, and nothing follows the two buttons", async () => {
  for (const [locale, hero] of [["ar", "تعرّفي على ناس.. تفهمك"], ["en", "Meet people who get you."]]) {
    const page = await guest("#/welcome", { locale });
    assert.equal(await page.locator(".welcome-table, .hero-welcome svg.table").count(), 0, "the table drawing is gone");
    const img = page.locator(".hero-welcome .welcome-photo img");
    assert.equal(await img.count(), 1);
    await page.waitForFunction(() => { const i = document.querySelector(".welcome-photo img"); return i.complete && i.naturalWidth > 0; });
    const info = await img.evaluate((i) => { const r = i.getBoundingClientRect(), cs = getComputedStyle(i);
      return { src: i.currentSrc, fallback: i.getAttribute("src"), alt: i.getAttribute("alt"), ratio: r.width / r.height, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, anim: cs.animationName, dur: cs.animationDuration }; });
    assert.ok(info.src.endsWith("/about/img/toast-720.webp"), info.src);
    assert.equal(info.fallback, "/about/img/toast-720.jpg");
    assert.equal(info.alt, "");
    assert.ok(Math.abs(info.ratio - 4 / 4.2) < 0.02, `4 : 4.2, got ${info.ratio}`);
    assert.equal(info.radius, "28px");
    assert.notEqual(info.shadow, "none");
    assert.deepEqual([info.anim, info.dur], ["photo-settle", "1.1s"]);
    // the words and the buttons are the ones the screen had
    assert.equal((await page.locator(".hero-welcome h1").innerText()).replace(/\s+/g, " ").trim(), hero);
    assert.deepEqual(await page.locator(".hero-welcome .stack a").evaluateAll((as) => as.map((a) => a.getAttribute("href"))), ["#/quiz/0", "#/signin"]);
    const order = await page.evaluate(() => {
      const hero = document.querySelector(".hero-welcome"), kids = [...hero.children];
      const lastBtn = hero.querySelector(".stack a:last-child").getBoundingClientRect().bottom;
      const below = [...document.querySelectorAll("main *")].filter((e) => !e.closest(".stack") && e.getClientRects().length && e.getBoundingClientRect().top >= lastBtn - 1);
      return { first: kids[0].tagName, last: kids[kids.length - 1].className, afterHero: hero.nextElementSibling, inStack: hero.querySelector(".stack").children.length,
        photoBeforeButtons: Boolean(hero.querySelector(".welcome-photo").compareDocumentPosition(hero.querySelector(".stack")) & Node.DOCUMENT_POSITION_FOLLOWING), below: below.length };
    });
    assert.deepEqual(order, { first: "H1", last: "stack", afterHero: null, inStack: 2, photoBeforeButtons: true, below: 0 }, "no number above the headline, nothing under the buttons");
    await noSideScroll(page, `welcome ${locale}`);
    // wide screens keep the two columns: the words and buttons on one side, the photo on the other
    await page.setViewportSize({ width: 1280, height: 800 });
    const cols = await page.evaluate(() => { const p = document.querySelector(".welcome-photo").getBoundingClientRect(), b = document.querySelector(".hero-welcome .stack").getBoundingClientRect(), h = document.querySelector(".hero-welcome h1").getBoundingClientRect();
      return { apart: p.left >= b.right || p.right <= b.left, level: p.top < b.bottom && p.bottom > h.top }; });
    assert.deepEqual(cols, { apart: true, level: true });
    await noSideScroll(page, `welcome ${locale} desktop`);
    await page.context().close();
  }
});

test("home: the first group is a row of photo cards (dinner: the seat; coffee: the cake or the barista); later groups stay a list", async () => {
  const page = await open("#/home");
  await page.waitForSelector(".peek a.photo-card");
  const cards = await page.locator(".week-group").first().locator(".peek > li > a.event-card.photo-card").evaluateAll((as) => as.map((a) => ({ id: a.dataset.session, exp: a.dataset.exp,
    img: a.querySelector("picture.shot img").getAttribute("src"), webp: a.querySelector("picture.shot source").getAttribute("srcset"), w: Math.round(a.parentElement.getBoundingClientRect().width),
    ratio: (() => { const r = a.querySelector("img").getBoundingClientRect(); return r.width / r.height; })(), leaf: Boolean(a.querySelector(".d b")), title: a.querySelector(".t strong").textContent, label: a.getAttribute("aria-label") })));
  assert.ok(cards.length >= 2, "the nearest meetups are in the row");
  assert.deepEqual(cards.slice(0, 2).map((c) => c.id).sort(), [S.dinner1.id, S.coffee1.id].sort());
  for (const c of cards) {
    assert.match(c.img, c.exp === "dinner" ? /\/about\/img\/seat-720\.jpg$/ : /\/about\/img\/(cake|barista)-720\.jpg$/, `${c.exp}: ${c.img}`);
    assert.equal(c.webp, c.img.replace(".jpg", ".webp"));
    assert.equal(c.w, 272);
    assert.ok(Math.abs(c.ratio - 4 / 3.3) < 0.02, `photo 4 : 3.3, got ${c.ratio}`);
    assert.ok(c.leaf && c.title && c.label, "the date leaf, the title and the spoken label are still there");
  }
  assert.ok(cards.find((c) => c.exp === "coffee").title.startsWith("قهوة") && cards.find((c) => c.exp === "dinner").title.startsWith("عشاء"));
  // a later group is the plain list it was (no photo), and every session is on the screen exactly once
  const later = page.locator(`a.event-card[data-session="${S.later.id}"]`);
  assert.equal(await later.evaluate((a) => a.closest("ul").className), "list");
  assert.equal(await later.locator("picture").count(), 0);
  assert.equal((await shownCards(page)).length, Object.keys(S).length);
  // the row scrolls inside itself (the page never does), snaps, and starts at the reading side (right in Arabic)
  const row = await page.locator(".peek").first().evaluate((ul) => { const cs = getComputedStyle(ul), first = ul.querySelector("li").getBoundingClientRect();
    return { scrolls: ul.scrollWidth > ul.clientWidth, snap: cs.scrollSnapType, firstRight: Math.round(window.innerWidth - first.right), liSnap: getComputedStyle(ul.querySelector("li")).scrollSnapAlign }; });
  assert.deepEqual(row, { scrolls: true, snap: "x mandatory", firstRight: 20, liSnap: "start" });
  await noSideScroll(page, "home");
  // keyboard: every card is a link; focusing the last one brings it into view
  const last = page.locator(".peek").first().locator("a.photo-card").last();
  await last.focus();
  await page.waitForFunction((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }, await last.elementHandle());
  await page.context().close();
});

test("home: a day on the week strip filters the meetups and says how many there are; a second tap clears it", async () => {
  for (const [locale, texts] of [["ar", { one: "لقاء واحد في هذا اليوم", two: "لقاءان في هذا اليوم", few: "3 لقاءات في هذا اليوم", many: "11 لقاءً في هذا اليوم", none: "لا يوجد لقاء بهذا الاختيار.", tiles: ["هذا الأسبوع", "مساءً", "عشاء", "عصرًا", "قهوة"] }],
    ["en", { one: "1 meetup on this day", two: "2 meetups on this day", few: "3 meetups on this day", many: "11 meetups on this day", none: "No meetup matches this choice.", tiles: ["This week", "Evening", "Dinner", "Afternoon", "Coffee"] }]]) {
    const page = await open("#/home", { locale });
    await page.waitForSelector(".peek a.photo-card");
    const all = await shownCards(page);
    const day = (key) => page.locator(`.week button[data-day="${S[key].day}"]`);
    const count = async () => (await page.locator("#day-count").innerText()).trim();
    assert.equal(await page.locator(".tiles .tile.wide .week button").count(), 7, "the strip sits in the wide tile");
    assert.deepEqual(await page.locator(".tiles .tile .e, .tiles .tile strong").allInnerTexts(), texts.tiles);
    assert.equal(await count(), "");
    assert.equal(await page.locator("#day-count").getAttribute("role"), "status", "the count is announced politely");
    for (const [key, text, ids] of [["dinner1", texts.two, [S.dinner1.id, S.coffee1.id]], ["coffee2", texts.one, [S.coffee2.id]], ["three0", texts.few, [0, 1, 2].map((k) => S[`three${k}`].id)],
      ["many0", texts.many, Array.from({ length: 11 }, (_, k) => S[`many${k}`].id)]]) {
      await day(key).click();
      assert.equal(await day(key).getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator('.week button[aria-pressed="true"]').count(), 1);
      assert.equal(await count(), text);
      assert.deepEqual(await shownCards(page), [...ids].sort());
      assert.equal(await page.locator(".week-group:visible").count(), 1, "a group with nothing on that day is not shown");
    }
    // the same day again: everything is back and the line is empty
    await day("many0").click();
    assert.equal(await day("many0").getAttribute("aria-pressed"), "false");
    assert.equal(await count(), "");
    assert.deepEqual(await shownCards(page), all);
    // the dinner and coffee tiles filter by kind, alone or with a day; nothing left says so
    const tile = (k) => page.locator(`.tile[data-kind="${k}"]`);
    await tile("coffee").click();
    assert.equal(await tile("coffee").getAttribute("aria-pressed"), "true");
    assert.deepEqual(await shownCards(page), [S.coffee1.id, S.coffee2.id].sort());
    assert.equal(await count(), "", "the count line is about a day");
    await day("dinner1").click();
    assert.deepEqual(await shownCards(page), [S.coffee1.id]);
    assert.equal(await count(), texts.one);
    await day("three0").click();
    assert.deepEqual(await shownCards(page), []);
    assert.equal((await page.locator("#no-match:visible").innerText()).trim(), texts.none);
    assert.equal(await count(), "");
    await tile("dinner").click();
    assert.equal(await tile("coffee").getAttribute("aria-pressed"), "false");
    assert.equal(await count(), texts.few);
    assert.equal(await page.locator("#no-match:visible").count(), 0);
    await tile("dinner").click(); await day("three0").click();
    assert.deepEqual(await shownCards(page), all);
    // every day of the strip is still a 44 px target, and a day without meetups cannot be pressed
    const days = await page.locator(".week button").evaluateAll((bs) => bs.map((b) => ({ w: b.getBoundingClientRect().width, off: b.disabled, has: b.classList.contains("has") })));
    assert.ok(days.every((d) => d.w >= 43.5 && d.off === !d.has), JSON.stringify(days));
    await noSideScroll(page, `home ${locale}`);
    await page.context().close();
  }
});

test("home and my events: cards rise in once (16 px, 600 ms, 120 ms apart); the next-meetup card has its double frame and its rows arrive in turn", async () => {
  const page = await open("#/home");
  await page.waitForSelector(".peek a.photo-card");
  const rise = () => page.evaluate(() => [...document.querySelectorAll(".peek > li")].slice(0, 7).map((li) => { const cs = getComputedStyle(li); return [cs.animationName, cs.animationDuration, cs.animationDelay].join(" "); }));
  assert.deepEqual(await rise(), ["rise-in 0.6s 0s", "rise-in 0.6s 0.12s", "rise-in 0.6s 0.24s", "rise-in 0.6s 0.36s", "rise-in 0.6s 0.48s", "rise-in 0.6s 0.48s", "rise-in 0.6s 0.48s"].slice(0, (await rise()).length));
  assert.equal(await page.evaluate(() => { const k = [...document.styleSheets].flatMap((s) => [...s.cssRules]).find((r) => r instanceof CSSKeyframesRule && r.name === "rise-in"); return k.cssRules[0].style.transform; }), "translateY(16px)");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".week-group > h2")).animationName), "rise-in");
  // filtering hides and shows cards; they do not rise a second time
  await page.locator(`.week button[data-day="${S.dinner1.day}"]`).click();
  await page.locator(`.week button[data-day="${S.dinner1.day}"]`).click();
  assert.deepEqual([...new Set(await rise())], ["none 0s 0s"]);
  await page.context().close();

  // the member with a booking: the card on home and the one on My events
  for (const [hash, sel, rows] of [["#/home", "a.next-card", 3], ["#/events", "section.card.hero", 5]]) {
    const p = await open(hash, { who: booked });
    await p.waitForSelector(sel);
    const card = await p.locator(sel).evaluate((el) => { const cs = getComputedStyle(el), m = getComputedStyle(document.querySelector("main"));
      const probe = document.createElement("i"); probe.style.color = "var(--c-primary)"; el.append(probe); const primary = getComputedStyle(probe).color; probe.remove();
      return { shadow: cs.boxShadow, bg: cs.backgroundColor, primary, inset: el.getBoundingClientRect().left - document.querySelector("main").getBoundingClientRect().left - parseFloat(m.paddingLeft),
        rows: [...el.children].map((c) => { const s = getComputedStyle(c); return [s.animationName, s.animationDuration, s.animationDelay].join(" "); }) }; });
    assert.equal(card.bg, card.primary, "the card keeps its own fill");
    assert.equal(card.inset, 6, "6 px of frame at the sides");
    const layers = card.shadow.split(/,(?![^(]*\))/).map((x) => x.trim());
    assert.equal(layers.length, 2, card.shadow);
    assert.match(layers[0], /0px 0px 0px 6px$/, "the outer band is 6 px");
    assert.match(layers[1], /0px 0px 0px 1px inset$/, "the inner edge is a hairline");
    assert.deepEqual(card.rows, ["sharpen 0.28s 0.2s", "sharpen 0.28s 0.26s", "sharpen 0.28s 0.32s", "sharpen 0.28s 0.38s", "sharpen 0.28s 0.44s"].slice(0, rows));
    await noSideScroll(p, hash);
    await p.context().close();
  }
});

test("questionnaire: after her first choice the heading gives way to one reply line; the question stays for screen readers and comes back when she changes her answer", async () => {
  for (const [locale, line] of [["ar", "جميل. سنبحث لكِ عن طاولة تشبهك."], ["en", "Lovely. We'll look for a table that feels like you."]]) {
    const page = await guest("#/quiz/0", { locale });
    await quizStep(page, "checkbox");
    const question = (await page.locator("#qh").innerText()).trim();
    const top = () => page.locator(".options .option").first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
    const before = await top();
    assert.equal(await page.locator("#q-reply").getAttribute("aria-live"), "polite");
    assert.equal(await page.locator("#q-reply").innerText(), "");
    // pressing dims the answer (150 ms); choosing fills it and its mark fades in
    const press = await page.locator(".options .option").first().evaluate((el) => { const cs = getComputedStyle(el); const i = cs.transitionProperty.split(", ").indexOf("opacity"); return cs.transitionDuration.split(", ")[i]; });
    assert.equal(press, "0.15s");
    assert.equal(await page.evaluate(() => { for (const sh of document.styleSheets) for (const r of sh.cssRules) if (r.selectorText === ".quiz-q :is(.option, .chip):active") return r.style.opacity; return null; }), "0.6");
    await page.locator(".options .option").nth(0).click();
    await page.waitForSelector("#q-head.replied:not(.out)");
    assert.equal((await page.locator("#q-reply p").innerText()).trim(), line);
    await page.waitForSelector("#q-reply svg.table .seat.on");
    assert.equal(await page.locator("#q-reply svg.table .seat.on").count(), 1, "one seat fills");
    assert.equal(await page.locator("#q-reply svg.table").getAttribute("aria-hidden"), "true");
    assert.ok(await page.locator(".options .option").nth(0).evaluate((el) => el.querySelector("input").checked && getComputedStyle(el.querySelector(".tick"), "::after").animationName === "tick-pop"));
    // the question is still in the page for assistive technology: one h1 with its text, and it still names the answers
    assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
    assert.equal((await page.getByRole("heading", { level: 1 }).textContent()).trim(), question);
    assert.equal(await page.locator(".options").getAttribute("aria-labelledby"), "qh");
    assert.ok(await page.locator("#qh").evaluate((h) => { const cs = getComputedStyle(h); return cs.display !== "none" && cs.visibility !== "hidden" && !h.closest("[hidden], [aria-hidden=true]"); }));
    // nothing moved and nothing is blocked
    assert.equal(await top(), before, "the answers stay where they were");
    assert.equal(await page.locator("#nx").isDisabled(), false);
    assert.equal(await page.locator(".options input:disabled").count(), 0);
    await noSideScroll(page, `quiz ${locale}`);
    // changing the answer brings the question back, and the reply is not shown a second time on this question
    await page.locator(".options .option").nth(1).click();
    await page.waitForSelector("#q-head:not(.replied):not(.out)");
    assert.equal(await page.locator("#q-reply").innerText(), "");
    assert.ok(await page.locator("#qh").evaluate((h) => h.getBoundingClientRect().height > 20), "the question is on the screen again");
    assert.equal(await top(), before);
    await page.locator(".options .option").nth(1).click();
    await page.locator(".options .option").nth(1).click();
    await page.waitForTimeout(450);
    assert.equal(await page.locator("#q-head.replied").count(), 0);
    // Continue still moves on
    const here = await page.evaluate(() => location.hash);
    await page.click("#nx");
    await page.waitForFunction((h) => location.hash !== h, here);
    await page.context().close();
  }
});

test("questionnaire: a single-choice question moves on by itself and shows no reply; the progress bar starts part-filled and moves over 400 ms", async () => {
  const page = await guest("#/quiz/0");
  const bar = () => page.locator(".progress > span").evaluate((el) => ({ w: Math.round((el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width) * 100), want: Number(el.dataset.w), t: getComputedStyle(el).transitionDuration }));
  // the first question: its segment is filled at once, with nothing to wait for
  await page.goto(`${env.base}/#/quiz/${Math.min(await quizStep(page, "checkbox"), await quizStep(page, "radio"))}`);
  await page.reload(); await ready(page);
  const first = await bar();
  assert.ok(first.want > 0 && first.want < 20 && Math.abs(first.w - first.want) <= 1, `the bar is part-filled from the first question: ${JSON.stringify(first)}`);
  assert.equal(first.t, "0.4s");
  // a later question: the bar travels from where it was to its new place
  const i = await quizStep(page, "radio");
  const moved = await bar();
  assert.ok(moved.want >= first.want);
  await page.waitForFunction(() => { const el = document.querySelector(".progress > span"); return Math.abs(Math.round((el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width) * 100) - Number(el.dataset.w)) <= 1; });
  // keyboard choice (no tap, so no auto-advance): the heading stays the question
  await page.locator(".options input[type=radio]").first().focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(450);
  assert.equal(await page.locator("#q-head.replied").count(), 0);
  assert.equal(await page.locator("#q-reply").innerText(), "");
  assert.equal(await page.evaluate(() => location.hash), `#/quiz/${i}`);
  // a tap moves on, as before
  await page.locator(".options .option").first().click();
  await page.waitForFunction((n) => location.hash === `#/quiz/${n + 1}`, i);
  await page.context().close();
});

test("less motion: the photo, the cards, the framed card, the reply and the bar are in their final state at once", async () => {
  const still = { reducedMotion: "reduce" };
  const w = await guest("#/welcome", still);
  assert.deepEqual(await w.locator(".welcome-photo img").evaluate((i) => { const cs = getComputedStyle(i); return [cs.animationName, cs.opacity, cs.transform]; }), ["none", "1", "none"]);
  await w.context().close();

  const h = await open("#/home", still);
  await h.waitForSelector(".peek a.photo-card");
  const moving = await h.evaluate(() => [...document.querySelectorAll(".peek > li, .list > li, .week-group > h2, .home-head .display-title")].map((el) => { const cs = getComputedStyle(el); return `${cs.animationName} ${cs.opacity} ${cs.transform}`; }));
  assert.deepEqual([...new Set(moving)], ["none 1 none"]);
  // the tiles and headings that are main's own children keep only the short fade every screen has, and never move
  assert.deepEqual(await h.evaluate(() => [...document.querySelectorAll("main > .tiles, main > h2")].map((el) => { const cs = getComputedStyle(el); return `${cs.animationName} ${cs.transform}`; })), ["enter-fade none", "enter-fade none"]);
  await h.locator(`.week button[data-day="${S.coffee2.day}"]`).click();
  assert.equal((await h.locator("#day-count").innerText()).trim(), "لقاء واحد في هذا اليوم");
  await h.context().close();

  const e = await open("#/events", { who: booked, ...still });
  await e.waitForSelector("section.card.hero");
  assert.deepEqual([...new Set(await e.locator("section.card.hero > *").evaluateAll((els) => els.map((el) => { const cs = getComputedStyle(el); return `${cs.animationName} ${cs.opacity} ${cs.filter}`; })))], ["none 1 none"]);
  await e.context().close();

  const q = await guest("#/quiz/0", still);
  await quizStep(q, "checkbox");
  assert.equal(await q.locator(".progress > span").evaluate((el) => getComputedStyle(el).transitionDuration), "0s");
  assert.equal(await q.locator(".options .option").first().evaluate((el) => getComputedStyle(el).transitionProperty), "none");
  await q.locator(".options .option").first().click();
  await q.waitForSelector("#q-head.replied:not(.out) #q-reply .seat.on", { timeout: 1000 });
  assert.equal(await q.locator("#q-head").evaluate((el) => getComputedStyle(el).transitionProperty), "none");
  await q.context().close();
});

test("/about: four type sizes, and a statement followed by a captioned photo (16:9 in the hero, 4:5 at the close)", async () => {
  for (const [path, t] of [["/about", { pull: "طاولة صغيرة، ووجوه جديدة، ومكان نختاره بعناية.", caps: ["أحد أماكن اللقاء في الدوحة.", "طاولة محجوزة باسم اللقاء."] }],
    ["/about/en", { pull: "A small table, new faces, and a venue we choose with care.", caps: ["One of the meetup venues in Doha.", "A table reserved in the meetup's name."] }]]) {
    for (const width of [390, 1280]) {
      const page = await (await context({ viewport: { width, height: 844 } })).newPage();
      await page.goto(env.base + path);
      const sizes = await page.evaluate(() => { const out = new Set();
        const walk = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent.trim() && n.parentElement.getClientRects().length) out.add(getComputedStyle(n.parentElement).fontSize);
        for (const s of document.querySelectorAll("main summary")) out.add(getComputedStyle(s, "::after").fontSize);
        out.add(getComputedStyle(document.querySelector(".about-foot p")).fontSize);
        return [...out].sort(); });
      assert.equal(sizes.length, 4, `${path} at ${width}: ${sizes}`);
      assert.ok(["13px", "16px", "22px"].every((s) => sizes.includes(s)), `${sizes}`);
      assert.equal((await page.locator(".about-hero .pull").innerText()).trim(), t.pull);
      assert.equal(await page.locator("main .pull").count(), 2, "one pull line in the hero, one for the venues");
      assert.deepEqual((await page.locator("main figure figcaption").allInnerTexts()).map((x) => x.trim()), t.caps);
      const figs = await page.locator("main figure").evaluateAll((fs) => fs.map((f) => { const r = f.querySelector("img").getBoundingClientRect(), c = f.querySelector("figcaption");
        const prev = f.previousElementSibling; return { ratio: +(r.width / r.height).toFixed(2), cap: getComputedStyle(c).fontSize, capUnder: c.getBoundingClientRect().top >= r.bottom, after: prev.matches("h2") || Boolean(prev.querySelector(".pull")) }; }));
      assert.deepEqual(figs, [{ ratio: 1.78, cap: "13px", capUnder: true, after: true }, { ratio: 0.8, cap: "13px", capUnder: true, after: true }]);
      await noSideScroll(page, `${path} at ${width}`);
      await page.context().close();
    }
  }
});
