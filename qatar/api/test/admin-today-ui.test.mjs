// Admin console, Today and Find (owner-approved design study item 5, 13 Nov 2026): the Today page lists what waits for
// her role, each row opening its list; Ctrl/Cmd-K or the Find button (phones have no keyboard shortcut) opens a box that
// takes a booking or case reference and goes to its page; an unknown reference says so. Sign-in still lands where it did.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let env, browser, call, ops, bookingRef, sessionId;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const owner = await adminLogin(call, env.sql, "owner@example.test");
  ops = await adminLogin(call, env.sql, "ops.oncall@example.test");
  const s = await call("POST", "/api/admin/v1/sessions", { token: ops.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 5 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  sessionId = s.body.id;
  const m = await signUp(call, { name: "Huda" });
  const b = await call("POST", "/api/v1/bookings", { token: m.token, body: { session_id: s.body.id } });
  await payViaMock(call, await checkoutUrlFor(call, m.token, b.body));
  [{ booking_ref: bookingRef }] = await env.sql`SELECT booking_ref FROM app.bookings WHERE id = ${b.body.booking_id}`;
  await call("POST", "/api/v1/support/call-requests", { token: m.token, body: { message: "Please call me", callback_when: "10min" } });
});
after(async () => { await browser?.close(); await env?.stop(); });

async function console_(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, serviceWorkers: "block" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript(([t, a]) => { sessionStorage.setItem("qa_token", JSON.stringify(t)); sessionStorage.setItem("qa_admin", JSON.stringify(a)); }, [ops.token, ops.admin]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { page, errors };
}

test("Today: what waits for ops, each row opening its list; nothing for other roles' sections", async () => {
  const { page, errors } = await console_(1280);
  await page.goto(env.base + "/admin/#/today");
  await page.waitForSelector("h1:text('Today')");
  const row = page.locator('a[data-today="call_requests"]');
  assert.equal(await row.getAttribute("href"), "#/call-requests");
  assert.match(await row.innerText(), /^1\s+Call requests waiting/);
  assert.equal(await page.locator('a[data-today="refunds_waiting"], a[data-today="cases"], a[data-today="identity"]').count(), 0);
  assert.equal(await page.locator("#nav a", { hasText: "Today" }).count(), 1);
  await row.click();
  await page.waitForURL(/#\/call-requests$/);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("Find: Ctrl+K on desktop, the Find button on a phone; a booking reference opens its session, an unknown one says so", async () => {
  for (const [width, open] of [[1280, (p) => p.keyboard.press("Control+k")], [390, (p) => p.click("#find")]]) {
    const { page, errors } = await console_(width);
    await page.goto(env.base + "/admin/#/today");
    await page.waitForSelector("h1:text('Today')");
    await open(page);
    await page.waitForSelector("dialog[open] #find-q");
    assert.equal(await page.evaluate(() => document.activeElement.id), "find-q", "the box takes the typing at once");
    await page.fill("#find-q", "RT-NOPE00");
    await page.click("#find-go");
    await page.waitForSelector("#find-err .error-text");
    assert.match(await page.locator("#find-err").innerText(), /Nothing found/);
    await page.fill("#find-q", bookingRef.toLowerCase());
    await page.press("#find-q", "Enter");
    await page.waitForURL(new RegExp(`#/sessions/${sessionId}$`));
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});
