// Venue page and admin console (plan A2 / 13d-3, 13d-4, A3, A1; provisional 10 Nov): confirmations inside the page with
// buttons named for the action (never the browser's confirm() or prompt()), a screen-reader announcement after accept,
// decline and arrival, Tonight as cards on a phone with red alerts first, saved filters, keyboard shortcuts, and lists
// that update at once after an action. Chromium via Playwright, pages served with the production CSP (as in ui.test.mjs).
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, client, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CSP = JSON.parse(readFileSync(new URL("../../web/vercel.json", import.meta.url))).headers
  .flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;
let env, browser, call, owner, ops, venue, venueToken;
const S = {};

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  call = client(env.base);
  owner = await adminLogin(call, env.sql, "owner@example.test");
  ops = await adminLogin(call, env.sql, "ops.oncall@example.test");
  [venue] = await env.sql`SELECT id, name FROM app.venues WHERE is_active AND 'dinner' = ANY (supported_experiences) ORDER BY name LIMIT 1`;
  assert.equal((await call("POST", `/api/admin/v1/venues/${venue.id}/portal-users`, { token: ops.token, body: { email: "consoles@venue.test" } })).status, 201);
  for (const [k, hours] of [["decline", 48], ["accept", 60]]) {
    const s = await call("POST", "/api/admin/v1/sessions", { token: ops.token, body: { experience: "dinner", conversation_language: "ar",
      starts_at: new Date(Date.now() + hours * 3600000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
    await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
    assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}/venues`, { token: ops.token, body: { venue_id: venue.id, planned_guests: 6 } })).status, 200);
    S[k] = s.body.id;
  }
  const req = await call("POST", "/api/venue/v1/auth/code:request", { body: { email: "consoles@venue.test" } });
  const ver = await call("POST", "/api/venue/v1/auth/code:verify", { body: { email: "consoles@venue.test", code: req.body.dev_code } });
  venueToken = ver.body.access_token;
  assert.ok(venueToken, JSON.stringify(ver.body));
});
after(async () => { await browser?.close(); await env?.stop(); });

async function newPage(viewport) {
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
  // the browser's own confirm() / prompt() must never open
  page.on("dialog", (d) => { errors.push(`native ${d.type()}: ${d.message()}`); d.dismiss().catch(() => {}); });
  return { page, errors };
}
async function venuePage(lang, viewport = { width: 390, height: 844 }) {
  const p = await newPage(viewport);
  await p.page.addInitScript(([t, l]) => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); sessionStorage.setItem("vp_token", t); sessionStorage.setItem("vp_lang", l); } }, [venueToken, lang]);
  return p;
}
async function adminPage(who, viewport = { width: 1280, height: 900 }) {
  const p = await newPage(viewport);
  await p.page.addInitScript(([t, a]) => { sessionStorage.setItem("qa_token", JSON.stringify(t)); sessionStorage.setItem("qa_admin", JSON.stringify(a)); }, [who.token, who.admin]);
  return p;
}
const active = (page) => page.evaluate(() => { const e = document.activeElement; return e ? (e.id || e.getAttribute("data-decline") && `decline:${e.getAttribute("data-decline")}` || e.getAttribute("data-off") && "off" || e.textContent.trim()) : null; });
const announced = (page, text) => page.waitForFunction((t) => document.getElementById("sr-announce")?.textContent === t, text);

test("no browser confirm() or prompt() is left on the venue page or in the admin console", () => {
  for (const f of ["../../web/venue/venue.js", "../../web/admin/admin.js"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /(?<![\w.])(window\.)?confirm\(/, `${f} still calls confirm()`);
  }
  assert.doesNotMatch(readFileSync(new URL("../../web/venue/venue.js", import.meta.url), "utf8"), /(?<![\w.])prompt\(/);
});

test("venue page (Arabic): declining asks in the page, Escape keeps the request, the reason is saved; accept and decline are announced", async () => {
  const { page, errors } = await venuePage("ar");
  await page.goto(`${env.base}/venue/index.html`);
  await page.waitForSelector(`#req-${S.decline}`);
  assert.equal(await page.locator("#sr-announce[role=status][aria-live=polite]").count(), 1, "one polite live region");
  assert.equal(await page.getAttribute("main", "aria-live"), null, "the page itself is not a live region");

  await page.click(`[data-decline="${S.decline}"]`);
  const dlg = page.locator("dialog.confirm-dialog[open]");
  await dlg.waitFor();
  assert.equal(await dlg.getAttribute("role"), "alertdialog");
  assert.equal(await dlg.locator("h2").textContent(), "هل تريد الاعتذار عن هذا الحجز؟ سنبلغ منسق HerZone.");
  assert.deepEqual((await dlg.locator("button").allInnerTexts()).map((s) => s.trim()), ["إبقاء الطلب", "اعتذار"]);
  assert.equal(await dlg.locator("label").textContent(), "سبب الاعتذار (اختياري):");
  // keyboard: the reason first, then keep, then decline; the focus stays inside the box
  assert.equal(await active(page), "cd-f");
  await page.keyboard.press("Tab"); assert.equal(await active(page), "cd-no");
  await page.keyboard.press("Tab"); assert.equal(await active(page), "cd-yes");
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  assert.equal(await active(page), `decline:${S.decline}`, "the focus goes back to the button");
  assert.equal((await env.sql`SELECT status FROM app.session_venues WHERE session_id = ${S.decline}`)[0].status, "pending");

  await page.click(`[data-decline="${S.decline}"]`);
  await dlg.waitFor();
  await page.fill("#cd-f", "المطبخ مغلق للصيانة");
  await page.click("#cd-yes");
  await page.waitForSelector(`#req-${S.decline} .badge-danger`);
  await announced(page, "تم الاعتذار عن الحجز.");
  assert.equal(await active(page), `req-${S.decline}`, "the keyboard is on the redrawn card");
  const [sv] = await env.sql`SELECT status, decline_reason FROM app.session_venues WHERE session_id = ${S.decline}`;
  assert.deepEqual({ ...sv }, { status: "declined", decline_reason: "المطبخ مغلق للصيانة" });

  await page.click(`[data-accept="${S.accept}"]`);
  await page.waitForSelector(`#req-${S.accept} .badge-success`);
  await announced(page, "تم قبول الحجز.");
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("venue page (English): an arrival is announced with her first name; a failed answer is announced as an error", async () => {
  const { page, errors } = await venuePage("en");
  let arrived = false;
  const starts = new Date(Date.now() + 2 * 3600000).toISOString();
  const body = () => ({ venue: { name: venue.name }, requests: [{ session_id: "s-arr", starts_at: starts, women_expected: 6, status: "confirmed", can_answer: false,
    names_from: new Date(Date.now() - 3600000).toISOString(), tables: [{ code: "HZ-7", women: 2, guests: [{ id: "g1", first_name: "Noor", arrived }, { id: "g2", first_name: "Dana", arrived: false }] }] }] });
  await page.route(/\/api\/venue\/v1\/requests(\?|$)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body()) }));
  await page.route(/\/api\/venue\/v1\/guests\/g1:arrived/, (r) => { arrived = true; r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await page.route(/\/api\/venue\/v1\/guests\/g2:arrived/, (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await page.goto(`${env.base}/venue/index.html`);
  await page.click('[data-arrive="g1"]');
  await announced(page, "Noor marked as arrived.");
  assert.equal(await active(page), "req-s-arr");
  assert.ok((await page.locator("#req-s-arr").innerText()).includes("Arrived"));
  await page.click('[data-arrive="g2"]');
  await announced(page, "Could not connect. Please try again.");
  assert.deepEqual(errors.filter((e) => !/status of 500/.test(e)), [], "only the 500 this test asked for");
  await page.context().close();
});

test("admin: every confirmation is in the page, named for the action; Keep changes nothing, the action runs on confirm", async () => {
  const c = await call("POST", "/api/admin/v1/promo-codes", { token: owner.token, body: { code: "KEEPME", percent_off: 10 } });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const { page, errors } = await adminPage(owner);
  await page.goto(`${env.base}/admin/#/promo-codes`);
  const row = page.locator("tr", { hasText: "KEEPME" });
  await row.locator("[data-off]").click();
  const dlg = page.locator("dialog.confirm-dialog[open]");
  await dlg.waitFor();
  assert.equal(await dlg.locator("h2").textContent(), "Deactivate this code? Members will no longer be able to use it.");
  assert.deepEqual((await dlg.locator("button").allInnerTexts()).map((s) => s.trim()), ["Keep code", "Deactivate code"]);
  assert.equal(await active(page), "cd-no", "the safe choice has the focus");
  await page.click("#cd-no");
  await dlg.waitFor({ state: "detached" });
  assert.equal(await active(page), "off");
  assert.equal((await env.sql`SELECT is_active FROM app.promo_codes WHERE code = 'KEEPME'`)[0].is_active, true);
  await row.locator("[data-off]").click();
  await page.click("#cd-yes");
  await page.waitForSelector("tr:has-text('KEEPME'):has-text('Deactivated')");
  assert.equal((await env.sql`SELECT is_active FROM app.promo_codes WHERE code = 'KEEPME'`)[0].is_active, false);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("admin identity check: Reject asks once, in the page, with the reason in the same box; the list updates at once", async () => {
  let decided = null;
  const review = { id: "r1", booking_ref: "HZ-R1", starts_at: new Date(Date.now() + 86400000).toISOString(), registered_name: "Sara", card_name: "Ahmed",
    result: "different", ai: null, member_status: "active" };
  const { page, errors } = await adminPage(owner);
  await page.route(/\/api\/admin\/v1\/identity-reviews$/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reviews: decided ? [] : [review] }) }));
  await page.route(/\/api\/admin\/v1\/identity-reviews\/r1:decide/, (r) => { decided = r.request().postDataJSON(); r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await page.goto(`${env.base}/admin/#/identity`);
  await page.click("[data-no=r1]");
  const dlg = page.locator("dialog.confirm-dialog[open]");
  await dlg.waitFor();
  assert.equal(await dlg.locator("h2").textContent(), "Cancel this booking WITHOUT a refund and suspend the account for 30 days?");
  assert.equal(await dlg.locator("label").textContent(), "Reason for rejecting (kept encrypted, shown in the case):");
  assert.deepEqual((await dlg.locator("button").allInnerTexts()).map((s) => s.trim()), ["Keep booking", "Reject booking"]);
  await page.fill("#cd-f", "Card belongs to someone else");
  await page.click("#cd-yes");
  await page.waitForSelector("text=Nothing to review.");
  assert.deepEqual(decided, { decision: "reject", rationale: "Card belongs to someone else" });
  assert.ok((await page.locator("#flash").innerText()).includes("Rejected"));
  // the session page's venue withdrawal asks the same way; Keep leaves the venue planned
  await page.goto(`${env.base}/admin/#/sessions/${S.accept}`);
  await page.click(`[data-svw="${venue.id}"]`);
  await dlg.waitFor();
  assert.deepEqual((await dlg.locator("button").allInnerTexts()).map((s) => s.trim()), ["Keep venue", "Withdraw venue"]);
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  assert.notEqual((await env.sql`SELECT status FROM app.session_venues WHERE session_id = ${S.accept}`)[0].status, "withdrawn");
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("admin Tonight: cards below 640 px with red alerts first, the wide table above; refreshed every 30 s", async () => {
  const now = Date.now();
  const t = (code, alerts, mins) => ({ session_id: "s", starts_at: new Date(now + mins * 60000).toISOString(), district: "Lusail", table_id: code, table_code: code,
    venue: "Sufra", status: "locked", confirmed: 6, checked_in: 1, late_cancellations: 0, incidents: { open_s1_s2: 0, categories: [] }, venue_confirmed: true, alerts });
  const tables = [t("A1", [], -40), t("A2", [{ level: "amber", code: "checked_in_below_3_at_15m" }], -40), t("A3", [{ level: "red", code: "checked_in_below_2_at_30m" }], -40)];
  let calls = 0;
  for (const width of [390, 1280]) {
    const { page, errors } = await adminPage(ops, { width, height: 900 });
    await page.clock.install();
    await page.route(/\/api\/admin\/v1\/live\/tonight/, (r) => { calls++; r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generated_at: new Date().toISOString(), tables }) }); });
    await page.goto(`${env.base}/admin/#/live`);
    await page.waitForSelector("h1:text('Tonight board')");
    if (width < 640) {
      assert.equal(await page.locator(".live-wide").isVisible(), false);
      assert.deepEqual(await page.locator(".live-card h2").allInnerTexts(), ["Sufra · A3", "Sufra · A2", "Sufra · A1"], "red, then amber, then the rest");
      assert.ok(await page.locator(".live-card.live-red").first().isVisible());
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(sw <= 1, `no sideways scroll on a phone (${sw})`);
    } else {
      assert.equal(await page.locator(".live-cards").isVisible(), false);
      assert.deepEqual((await page.locator(".live-wide tbody tr").allInnerTexts()).map((s) => s.match(/A\d/)[0]), ["A1", "A2", "A3"], "the wide table keeps its order");
      const before = calls;
      await page.clock.fastForward(30000);
      await page.waitForFunction(() => true);
      await page.waitForTimeout(200);
      assert.ok(calls > before, "the board asked again after 30 s");
      assert.equal(await page.locator(".live-wide tbody tr").count(), 3);
    }
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});

test("admin: saved filters are remembered in this browser; the list updates at once after an action", async () => {
  const M = await signUp(call, { name: "Reem" });
  const [general] = await env.sql`INSERT INTO app.support_cases (user_id, type) VALUES (${M.userId}, 'general') RETURNING id`;
  await env.sql`INSERT INTO app.support_cases (user_id, type) VALUES (${M.userId}, 'occasion_celebration')`;
  await env.sql`INSERT INTO app.support_cases (user_id, type, status) VALUES (${M.userId}, 'payment', 'resolved')`;
  const { page, errors } = await adminPage(ops);
  await page.goto(`${env.base}/admin/#/support`);
  await page.waitForSelector("h1:text('Support requests')");
  const rows = () => page.locator("main tbody tr").allInnerTexts();
  assert.equal((await rows()).length, 3, "All by default");
  await page.click("[data-filter=celebrations]");
  await page.waitForSelector("[data-filter=celebrations][aria-pressed=true]");
  assert.deepEqual((await rows()).map((r) => r.split("\t")[1]), ["Celebration"]);
  assert.equal(await active(page), "Celebrations", "the keyboard stays on the filter");
  // another tab of the same browser opens with the same filter
  const p2 = await page.context().newPage();
  await p2.addInitScript(([t, a]) => { sessionStorage.setItem("qa_token", JSON.stringify(t)); sessionStorage.setItem("qa_admin", JSON.stringify(a)); }, [ops.token, ops.admin]);
  await p2.goto(`${env.base}/admin/#/support`);
  await p2.waitForSelector("[data-filter=celebrations][aria-pressed=true]");
  assert.equal(await p2.locator("main tbody tr").count(), 1);
  await p2.close();
  // Open: a resolved case leaves the list as soon as it is marked, and the result has the focus
  await page.click("[data-filter=open]");
  await page.waitForSelector("[data-filter=open][aria-pressed=true]");
  assert.equal((await rows()).length, 2);
  await page.selectOption(`[data-sc="${general.id}"]`, "resolved");
  await page.waitForSelector(`[data-sc="${general.id}"]`, { state: "detached", timeout: 2000 });
  assert.equal((await rows()).length, 1);
  assert.equal(await active(page), "flash");
  assert.ok((await page.locator("#flash").innerText()).includes("Updated"));
  assert.equal((await env.sql`SELECT status FROM app.support_cases WHERE id = ${general.id}`)[0].status, "resolved");
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("admin: Today shows only today's sessions (Doha time); call requests keep their filter", async () => {
  const today = new Date().toISOString();
  const later = new Date(Date.now() + 5 * 86400000).toISOString();
  const s = (id, at) => ({ id, starts_at: at, experience: "dinner", language: "ar", district: "Lusail", status: "on_sale", seats_sold: 0, max_seats: 18, paid_waiting: 0, tables: 0, locked_tables: 0 });
  const { page, errors } = await adminPage(ops);
  await page.route(/\/api\/admin\/v1\/sessions$/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [s("later", later), s("today", today)] }) }));
  await page.goto(`${env.base}/admin/#/sessions`);
  await page.waitForSelector("[data-filter=all][aria-pressed=true]");
  assert.equal(await page.locator("main tbody tr").count(), 2);
  await page.click("[data-filter=today]");
  await page.waitForSelector("[data-filter=today][aria-pressed=true]");
  assert.deepEqual(await page.locator("main tbody a[href^='#/sessions/']").evaluateAll((as) => as.map((a) => a.getAttribute("href"))), ["#/sessions/today"]);
  await page.goto(`${env.base}/admin/#/call-requests`);
  await page.click("[data-filter=closed]");
  await page.waitForSelector("[data-filter=closed][aria-pressed=true]");
  await page.goto(`${env.base}/admin/#/sessions`);
  await page.waitForSelector("[data-filter=today][aria-pressed=true]");
  await page.goto(`${env.base}/admin/#/call-requests`);
  await page.waitForSelector("[data-filter=closed][aria-pressed=true]");
  assert.equal(await page.evaluate(() => localStorage.getItem("qa_filter_call-requests")), "closed");
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("admin: keyboard shortcuts (g then a letter, ? for the list), never while typing, and they can be turned off", async () => {
  const { page, errors } = await adminPage(ops);
  await page.goto(`${env.base}/admin/#/sessions`);
  await page.waitForSelector("h1:text('Sessions & Matching')");
  await page.keyboard.press("?");
  const help = page.locator("dialog.kb-help[open]");
  await help.waitFor();
  const text = await help.innerText();
  assert.ok(text.includes("Keyboard shortcuts") && text.includes("Call requests") && text.includes("Tonight"), text);
  assert.ok(!text.includes("Trust & Safety"), "only the sections her role has");
  await page.keyboard.press("Escape");
  await help.waitFor({ state: "detached" });
  await page.keyboard.press("g"); await page.keyboard.press("c");
  await page.waitForSelector("h1:text('Call requests')");
  assert.equal(await page.evaluate(() => location.hash), "#/call-requests");
  await page.keyboard.press("g"); await page.keyboard.press("t");
  await page.waitForSelector("h1:text('Tonight board')");
  // typing in a field is never a shortcut
  await page.goto(`${env.base}/admin/#/sessions`);
  await page.waitForSelector("h1:text('Sessions & Matching')");
  await page.click("details summary");
  await page.click("input[name=district_hint_en]");
  await page.keyboard.type("gc?");
  assert.equal(await page.evaluate(() => location.hash), "#/sessions");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  // off: the menu button still opens the list, where they are turned back on
  await page.click("#kb");
  await help.waitFor();
  await page.uncheck("#kb-on");
  await page.click("dialog.kb-help button");
  await help.waitFor({ state: "detached" });
  assert.equal(await active(page), "kb", "the focus goes back to the Shortcuts button");
  await page.keyboard.press("g"); await page.keyboard.press("c");
  await page.keyboard.press("?");
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => location.hash), "#/sessions");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("qa_shortcuts")), "off");
  assert.deepEqual(errors, []);
  await page.context().close();
});
