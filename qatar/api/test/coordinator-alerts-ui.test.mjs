// Admin console, coordinator alerts (plan T13, item 40): an S1 report during a meetup shows above every screen for owner
// and ops with Acknowledge, which records who and when; the Alerts screen lists it and offers alerts on this device.
// Chromium via Playwright, pages served with the production Content-Security-Policy (as in ui.test.mjs).
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CSP = JSON.parse(readFileSync(new URL("../../web/vercel.json", import.meta.url))).headers
  .flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;
let env, browser, call, caseRef;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  call = client(env.base);
  const owner = await adminLogin(call, env.sql, "owner@example.test");
  const M = await signUp(call, { name: "Maha" });
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 5 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "الدفنة", district_hint_en: "Dafna" } });
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  const b = await call("POST", "/api/v1/bookings", { token: M.token, body: { session_id: s.body.id } });
  await payViaMock(call, await checkoutUrlFor(call, M.token, b.body));
  const rep = await call("POST", "/api/v1/reports", { token: M.token, body: { booking_id: b.body.booking_id, category: "threat_violence", timing: "during" } });
  caseRef = rep.body.case_ref;
});
after(async () => { await browser?.close(); await env?.stop(); });

async function adminPage(who, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route((url) => url.origin === env.base && !url.pathname.startsWith("/api/") && /(\.html|\/)$/.test(url.pathname), async (r) => {
    const res = await r.fetch();
    await r.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": CSP.replace("connect-src 'self'", `connect-src 'self' ${env.base}`) } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_FAILED|404/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(([t, a]) => { sessionStorage.setItem("qa_token", JSON.stringify(t)); sessionStorage.setItem("qa_admin", JSON.stringify(a)); }, [who.token, who.admin]);
  return { page, errors };
}

test("the open alert shows above every screen for ops, with Acknowledge; the Alerts screen lists it and offers this device", async () => {
  const ops = await adminLogin(call, env.sql, "ops.oncall@example.test");
  const { page, errors } = await adminPage(ops);
  await page.goto(`${env.base}/admin/#/venues`);
  const strip = page.locator("#alerts [role=alert] .banner");
  await strip.first().waitFor();
  const text = await strip.first().innerText();
  assert.ok(text.includes("Safety alert") && text.includes(caseRef) && text.includes("S1"), text);
  assert.ok(/Alerts\s*not acknowledged:\s*1/.test(await page.locator("nav").innerText()), "the menu shows how many are open");
  // the same strip on another screen
  await page.goto(`${env.base}/admin/#/alerts`);
  await page.waitForSelector("h1:text('Alerts')");
  assert.equal(await strip.count(), 1);
  const row = page.locator("main tr", { hasText: caseRef });
  assert.equal(await row.count(), 1);
  assert.ok((await row.innerText()).includes("Not yet"));
  assert.ok((await page.locator("#dev-state").innerText()).length > 0, "this device's state is shown");
  assert.equal(await page.locator("#dev-on").count(), 1, "alerts can be turned on here");
  assert.ok((await page.locator("main").innerText()).includes("SMS: not set up"));
  // Acknowledge from the strip: it goes, and the screen records who
  await strip.first().locator("[data-ack]").click();
  await page.waitForSelector("#alerts .banner", { state: "detached" });
  assert.equal(await page.locator("nav .alert-count").count(), 0);
  const [a] = await env.sql`SELECT acknowledged_by FROM app.coordinator_alerts`;
  assert.equal(a.acknowledged_by, ops.admin.id);
  await page.click("[data-filter=all]");
  await page.waitForSelector(`main tr:has-text('${caseRef}'):has-text('Ops On-call')`);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("other roles see no alert strip and no Alerts screen", async () => {
  const fin = await adminLogin(call, env.sql, "finance@example.test");
  const { page, errors } = await adminPage(fin);
  await page.goto(`${env.base}/admin/#/refunds`);
  await page.waitForSelector("h1");
  assert.equal(await page.locator("#alerts *").count(), 0);
  assert.equal(await page.locator("nav a[href='#/alerts']").count(), 0);
  assert.deepEqual(errors, []);
  await page.context().close();
});
