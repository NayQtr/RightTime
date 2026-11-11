// Item 41, the owner's option (ج) and wording of 11 Nov 2026: while PRICING_LAUNCH_FREE is on, the organising fee is
// announced as "free for a limited period", and it is said at the last step alone — the site says nothing about money
// before the booking review. The amount is still taken and refunded, so the card-name check keeps working and the
// price_minor > 0 constraint is never touched: this test proves the amount is unchanged while the wording changes.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, client, signUp, startTestEnv } from "./helpers.mjs";
import { resetConfigCache } from "../src/lib/config.js";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
let env, browser, call, sessionId;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const owner = await adminLogin(call, env.sql, "owner@example.test");
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 5 * DAY).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
  sessionId = s.body.id;
});
after(async () => { await browser?.close(); await env?.stop(); });

async function setLaunchFree(on) {
  await env.sql`UPDATE app.app_config SET value = ${on ? "true" : "false"} WHERE key = 'PRICING_LAUNCH_FREE'`;
  resetConfigCache();
}

test("the setting ships off, so nothing changes until the owner turns the offer on", async () => {
  const [row] = await env.sql`SELECT value FROM app.app_config WHERE key = 'PRICING_LAUNCH_FREE'`;
  assert.equal(row.value, "false", "migration 025 ships the offer off");
});

test("the amount never changes: only what she is told does", async () => {
  const me = await signUp(call, { name: "ندى" });
  for (const on of [false, true]) {
    await setLaunchFree(on);
    const list = await call("GET", "/api/v1/sessions", { token: me.token });
    const s = list.body.sessions.find((x) => x.id === sessionId);
    assert.equal(s.launch_free, on, "the session says whether the offer is on");
    assert.ok(s.price.amount_minor > 0, "the fee itself is untouched, so the card-name check still runs");
  }
  await setLaunchFree(false);
});

test("the booking reply carries the offer, and the amount with it", async () => {
  const me = await signUp(call, { name: "ريم" });
  await setLaunchFree(true);
  const b = await call("POST", "/api/v1/bookings", { token: me.token, body: { session_id: sessionId } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(b.body.launch_free, true);
  assert.ok(b.body.amount.amount_minor > 0);
  const got = await call("GET", `/api/v1/bookings/${b.body.booking_id}`, { token: me.token });
  assert.equal(got.body.launch_free, true, "re-reading the booking says the same");
  await setLaunchFree(false);
});

test("website: no money before the last step, and the owner's words at it", async () => {
  await setLaunchFree(true);
  const me = await signUp(call, { name: "سارة" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-QA", serviceWorkers: "block" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(env.base + "/");
  await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify("ar")); },
    { access_token: me.token, refresh_token: me.refresh });

  // "What you get" and the session list are earlier steps: they must say nothing about money
  await page.goto(env.base + "/#/what-you-get");
  await page.waitForSelector("#plan");
  assert.equal(await page.locator("#wyg-sum").count(), 0, "no fee summary before the last step");
  assert.ok(!(await page.locator("#plan").innerText()).includes("ر.ق"), "no amount on What you get");
  await page.goto(env.base + "/#/sessions");
  await page.waitForSelector(".sticky-bar");
  assert.ok(!(await page.locator(".sticky-bar").innerText()).includes("ر.ق"), "no amount while she chooses a session");

  // the booking review is the last step: the amount struck through, the owner's words beside it, and her explanation
  const b = await call("POST", "/api/v1/bookings", { token: me.token, body: { session_id: sessionId } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  await page.goto(`${env.base}/#/booking/${b.body.booking_id}`);
  await page.waitForSelector("#launch-note");
  assert.equal(await page.locator(".fee-offer s").innerText(), b.body.amount.display, "the amount is still shown, struck through");
  assert.equal(await page.locator(".fee-offer strong").innerText(), "مجاني لفترة محدودة");
  assert.equal(await page.locator("#launch-note").innerText(), "يُخصم المبلغ للتحقق من البطاقة ويُرد إليكِ كاملًا.");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".fee-offer s")).textDecorationLine), "line-through");

  // with the offer off the same screen reads as before
  await setLaunchFree(false);
  await page.reload();
  await page.waitForSelector(".kv strong");
  assert.equal(await page.locator("#launch-note").count(), 0);
  assert.equal(await page.locator(".fee-offer").count(), 0);
  assert.ok((await page.locator(".kv").first().innerText()).includes("ر.ق"));
  await ctx.close();
});
