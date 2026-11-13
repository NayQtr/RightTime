// Website, a meetup opened from its card grows out of that card (owner-approved design study item 2, 13 Nov 2026, after
// Apple's spatial continuity): main gets the enter-zoom entrance with its origin at the card's centre. With reduced
// motion the page simply appears. Either way the details screen opens as before.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signInAgain, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let env, browser, call, member, bookingId;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const owner = await adminLogin(call, env.sql, "owner@example.test");
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 4 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  member = await signUp(call, { name: "Noor" });
  const b = await call("POST", "/api/v1/bookings", { token: member.token, body: { session_id: s.body.id } });
  await payViaMock(call, await checkoutUrlFor(call, member.token, b.body));
  bookingId = b.body.booking_id;
});
after(async () => { await browser?.close(); await env?.stop(); });

async function home(reducedMotion) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(env.base + "/");
  const tokens = await signInAgain(call, env.sql, member.phone);
  await page.evaluate(([t]) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify("ar")); }, [tokens]);
  await page.reload();
  await page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
  await page.goto(env.base + "/#/home");
  await page.waitForSelector(`a[href="#/booking/${bookingId}"]`);
  return page;
}

test("tapping a booked meetup's card: the details grow out of that card", async () => {
  const page = await home("no-preference");
  const card = page.locator(`a.event-card[href="#/booking/${bookingId}"]`).first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));   // cards rise in on entry
  const [c, m] = await Promise.all([card.boundingBox(), page.locator("main").boundingBox()]);
  await card.click();
  await page.waitForSelector(".det-head h1");   // the class stays on main from the first frame to the finished screen
  const z = await page.evaluate(() => ({ cls: [...document.querySelector("main").classList], x: parseFloat(document.querySelector("main").style.getPropertyValue("--zx")),
    y: parseFloat(document.querySelector("main").style.getPropertyValue("--zy")) }));
  assert.ok(z.cls.includes("enter-zoom"), JSON.stringify(z));
  assert.ok(Math.abs(z.x - (c.x + c.width / 2 - m.x)) <= 2, `origin x ${z.x}`);
  assert.ok(Math.abs(z.y - (c.y + c.height / 2 - m.y)) <= 2, `origin y ${z.y}`);
  assert.equal(new URL(page.url()).hash, `#/booking/${bookingId}`);
  await page.context().close();
});

test("with reduced motion the details simply appear (no zoom)", async () => {
  const page = await home("reduce");
  await page.locator(`a.event-card[href="#/booking/${bookingId}"]`).first().click();
  await page.waitForSelector(".det-head h1");
  assert.ok(!(await page.evaluate(() => document.querySelector("main").classList.contains("enter-zoom"))));
  await page.context().close();
});

test("opening the details any other way (address, back and forth) keeps the usual entrance", async () => {
  const page = await home("no-preference");
  await page.goto(env.base + `/#/booking/${bookingId}`);
  await page.waitForSelector(".det-head h1");
  assert.ok(!(await page.evaluate(() => document.querySelector("main").classList.contains("enter-zoom"))));
  await page.context().close();
});
