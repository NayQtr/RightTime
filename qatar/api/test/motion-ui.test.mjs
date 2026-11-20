// Website: the motion work of 19 Nov 2026 (the 19-principles brief, branch motion-web).
// - frequent controls use the fast token; the button release uses the --m-spring back-out curve
// - dialogs grow from where she pressed (--pop-x/--pop-y); a keyboard open keeps the centre
// - the «+1» toggle pulses the due-now amount exactly once
// - the all-set table's six seats pop in one after another (60 ms apart)
// - the meetup's own table pops exactly confirmed_count seats, and nothing anywhere moves under reduced motion
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signInAgain, signUp, startTestEnv } from "./helpers.mjs";
import { buildSteps } from "../../web/quiz-flow.js";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
let env, browser, call, owner, member, pending, session;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  owner = await adminLogin(call, env.sql, "owner@example.test");
  await env.sql`DELETE FROM app.event_sessions`;
  const at = new Date(Date.now() + 3 * DAY); at.setUTCHours(16, 30, 0, 0);
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: at.toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  session = s.body.id;
  assert.equal((await call("POST", `/api/admin/v1/sessions/${session}:open-sale`, { token: owner.token })).status, 200);
  member = await fresh("Hind");
  pending = await fresh("Rana");
  const b = await call("POST", "/api/v1/bookings", { token: pending.token, body: { session_id: session } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  pending.booking = b.body.booking_id;
  const mb = await call("POST", "/api/v1/bookings", { token: member.token, body: { session_id: session } });
  assert.equal(mb.status, 201);
  member.booking = mb.body.booking_id;
  await payViaMock(call, await checkoutUrlFor(call, member.token, mb.body));
});
after(async () => { await browser?.close(); await env?.stop(); });

async function tokensFor(u) { await env.sql`DELETE FROM app.otp_challenges`; return signInAgain(call, env.sql, u.phone); }
async function fresh(name) { await env.sql`DELETE FROM app.otp_challenges`; return signUp(call, { name }); }
const ready = (page) => page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
async function context({ width = 390, height = 844, ...opts } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block", ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return ctx;
}
// routes: [[pattern, (json) => void]] change a real answer before the page sees it
async function open(hash, { who = member, locale = "ar", routes = [], signedOut = false, ...opts } = {}) {
  const page = await (await context(opts)).newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  for (const [re, edit] of routes) await page.route(re, async (r) => { const res = await r.fetch(); const j = await res.json(); edit(j); r.fulfill({ response: res, json: j }); });
  await page.goto(env.base + "/");
  const t = signedOut ? null : await tokensFor(who);
  await page.evaluate(([x, l]) => { if (x) localStorage.setItem("q_tokens", JSON.stringify(x)); localStorage.setItem("q_locale", JSON.stringify(l)); }, [t, locale]);
  await page.goto("about:blank"); await page.goto(env.base + "/" + hash); await ready(page);
  return page;
}
const token = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const asSeconds = (ms) => `${parseFloat(ms) / 1000}s`; // "120ms" -> "0.12s", the form computed styles use
const noSideScroll = async (page, what) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${what}: the page scrolls sideways`);

test("frequent controls: the feedback cells use the fast token; the button release uses the --m-spring curve", async () => {
  const page = await open("#/welcome", { signedOut: true });
  const fast = await token(page, "--m-fast"), ease = await token(page, "--m-ease"), spring = await token(page, "--m-spring");
  assert.match(fast, /^\d+ms$/); assert.match(spring, /^cubic-bezier/);
  // the 1-5 feedback cells (.segs input + span): built as the feedback screen builds them, read from the stylesheet
  const seg = await page.evaluate(() => {
    const d = document.createElement("div"); d.className = "segs";
    d.innerHTML = "<label><input type=radio><span>3</span></label>";
    document.body.append(d);
    const cs = getComputedStyle(d.querySelector("span"));
    const out = { props: cs.transitionProperty, durations: cs.transitionDuration, curves: cs.transitionTimingFunction };
    d.remove();
    return out;
  });
  assert.equal(seg.props, "background-color, color");
  assert.deepEqual(seg.durations.split(", "), [asSeconds(fast), asSeconds(fast)]);
  assert.deepEqual(seg.curves.split(/, (?=cubic|linear|ease|steps)/), [ease, ease]);
  // the primary button: transform transitions on the spring (release overshoots and settles); press stays instant
  const btn = await page.locator(".btn-primary").first().evaluate((b) => {
    const cs = getComputedStyle(b);
    const i = cs.transitionProperty.split(", ").indexOf("transform");
    return { i, duration: cs.transitionDuration.split(", ")[i], curve: cs.transitionTimingFunction.split(/, (?=cubic|linear|ease|steps)/)[i] };
  });
  assert.ok(btn.i >= 0, "transform is transitioned");
  assert.equal(btn.duration, asSeconds(fast));
  assert.equal(btn.curve, spring);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("the confirm dialog grows from where she pressed; a keyboard open keeps the centre", async () => {
  const u = await fresh("Wafa");
  const page = await open("#/profile", { who: u });
  await page.click("#del");
  const dlg = page.locator("dialog.confirm-dialog[open]");
  await dlg.waitFor();
  // offsetWidth/Height: the entrance animation scales the box, which would skew getBoundingClientRect
  const spot = (d) => { const [x, y] = getComputedStyle(d).transformOrigin.split(" ").map(parseFloat);
    return { x: d.style.getPropertyValue("--pop-x"), y: d.style.getPropertyValue("--pop-y"), off: Math.hypot(x - d.offsetWidth / 2, y - d.offsetHeight / 2) }; };
  const at = await dlg.evaluate(spot);
  assert.match(at.x, /px$/, "a click sets --pop-x");
  assert.match(at.y, /px$/, "a click sets --pop-y");
  assert.ok(at.off > 2, `the origin is not the centre (${at.off}px off)`);
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  await page.waitForTimeout(1100); // the remembered pointerdown only counts for a moment
  await page.locator("#del").focus();
  await page.keyboard.press("Enter");
  await dlg.waitFor();
  const kb = await dlg.evaluate(spot);
  assert.equal(kb.x, "", "a keyboard open sets nothing");
  assert.ok(kb.off <= 1, `the origin stays the centre (${kb.off}px off)`);
  await page.keyboard.press("Escape");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("«+1»: the due-now amount pulses exactly once (the class comes and goes again)", async () => {
  const page = await open(`#/booking/${pending.booking}/review`, { who: pending });
  await page.waitForSelector("#plus-btn");
  await page.evaluate(() => {
    const due = document.querySelector("#due-amt");
    window._pulses = 0;
    new MutationObserver(() => { if (due.classList.contains("pulse-once") && !due._had) window._pulses += 1; due._had = due.classList.contains("pulse-once"); })
      .observe(due, { attributes: true, attributeFilter: ["class"] });
  });
  await page.locator("#plus-btn").click();
  await page.waitForFunction(() => window._pulses === 1);
  await page.waitForFunction(() => !document.querySelector("#due-amt").classList.contains("pulse-once"), null, { timeout: 2000 });
  assert.equal(await page.evaluate(() => window._pulses), 1, "one pulse per flip, and the class leaves on animationend");
  await noSideScroll(page, "review");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("all set: the six filled seats pop in one after another, 60 ms apart", async () => {
  const u = await fresh("Hessa");
  const q = (await call("GET", "/api/v1/questionnaires/current", { token: u.token })).body;
  const readyAt = buildSteps(q.questions).findIndex((s) => s.id === "ready");
  const page = await open(`#/quiz/${readyAt}`, { who: u });
  await page.waitForSelector("[data-inter=ready] .done-art .seat.on");
  const seats = await page.locator(".done-art .seat.on").evaluateAll((cs) => cs.map((c) => { const s = getComputedStyle(c); return [s.animationName, s.animationDelay]; }));
  assert.equal(seats.length, 6, "every seat taken");
  assert.ok(seats.every(([n]) => n === "seat-pop"), JSON.stringify(seats));
  assert.deepEqual(seats.map(([, d]) => d), ["0s", "0.06s", "0.12s", "0.18s", "0.24s", "0.3s"], "increasing, 60 ms apart");
  await noSideScroll(page, "all set");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("details: the table pops exactly confirmed_count seats when it scrolls into view, never on a forming table", async () => {
  const table = (n) => [/\/event-details$/, (j) => { j.reveal.phase = "locked"; j.table = { capacity: 6, confirmed_count: n, code: "A1", members: null, shared_themes: [] }; }];
  const page = await open(`#/booking/${member.booking}`, { height: 640, routes: [table(4)] });
  await page.waitForSelector(".table-figure .table");
  await page.evaluate(() => document.querySelector(".table-figure").scrollIntoView({ block: "center" }));
  await page.waitForFunction(() => document.querySelector(".table-figure .table").classList.contains("seats-pop"));
  const seats = await page.locator(".table-figure .seat").evaluateAll((cs) => cs.map((c) => [c.getAttribute("class"), getComputedStyle(c).animationName]));
  assert.deepEqual(seats.map(([cls, a]) => a !== "none"), [true, true, true, true, false, false], JSON.stringify(seats));
  assert.equal(seats.filter(([, a]) => a === "seat-pop").length, 4, "exactly confirmed_count seats move");
  await noSideScroll(page, "details");
  assert.deepEqual(page.errors, []);
  await page.context().close();
  // an all-dashed forming table never pops
  const forming = await open(`#/booking/${member.booking}`, { height: 640, routes: [table(0)] });
  await forming.waitForSelector(".table-figure .table");
  await forming.evaluate(() => document.querySelector(".table-figure").scrollIntoView({ block: "center" }));
  await forming.waitForTimeout(400);
  assert.equal(await forming.locator(".table-figure .table").evaluate((t) => t.classList.contains("seats-pop")), false);
  await forming.context().close();
});

test("reduced motion: nothing on the details screen animates (the seats are simply already there)", async () => {
  const page = await open(`#/booking/${member.booking}`, { height: 640, reducedMotion: "reduce",
    routes: [[/\/event-details$/, (j) => { j.reveal.phase = "locked"; j.table = { capacity: 6, confirmed_count: 4, code: "A1", members: null, shared_themes: [] }; }]] });
  await page.waitForSelector(".table-figure .table");
  await page.evaluate(() => document.querySelector(".table-figure").scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".table-figure .table").evaluate((t) => t.classList.contains("seats-pop")), false, "already there, no pop class");
  const moving = await page.evaluate(() => [...document.querySelectorAll("*")]
    .map((el) => { const s = getComputedStyle(el); return { el: el.tagName + "." + el.className, name: s.animationName, dur: s.animationDuration }; })
    .filter((a) => a.name !== "none" && a.dur.split(", ").some((d) => parseFloat(d) > 0)));
  assert.deepEqual(moving, [], "no animation runs anywhere on the screen");
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
