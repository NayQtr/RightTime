// Browser checks for the reliability unit (migration 021, provisional): the waitlist offer on the website (home banner,
// session list, booking with the kept seat, inbox link), the step counter (nothing sent while off; one anonymous ping per
// step while on), and the admin console's failed-notification list and step-counter table. Real API + PostgreSQL,
// Chromium via Playwright, pages served with the production Content-Security-Policy.
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";
import { resetConfigCache } from "../src/lib/config.js";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CSP = JSON.parse(readFileSync(new URL("../../web/vercel.json", import.meta.url))).headers
  .flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;
const DAY = 86400000;
let env, browser, call, owner;

before(async () => {
  buildTemplate();
  resetConfigCache();
  env = await startTestEnv();
  call = client(env.base);
  owner = await adminLogin(call, env.sql, "owner@example.test");
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); await env?.stop(); resetConfigCache(); });

async function newPage(viewport = { width: 360, height: 780 }) {
  const ctx = await browser.newContext({ viewport, locale: "ar-QA" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route((url) => url.origin === env.base && !url.pathname.startsWith("/api/") && /(\.html|\/)$/.test(url.pathname), async (r) => {
    const res = await r.fetch();
    await r.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": CSP.replace("connect-src 'self'", `connect-src 'self' ${env.base}`) } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_FAILED|404/.test(m.text())) errors.push(m.text()); });
  return { page, errors };
}
async function signedIn(page, u) {
  await page.goto(env.base + "/");
  await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify("ar")); },
    { access_token: u.token, refresh_token: u.refresh });
}
async function noHorizontalScroll(page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(sw <= cw + 1, `horizontal overflow on ${page.url()}: ${sw} > ${cw}`);
}
async function member(name) {
  await env.sql`DELETE FROM app.otp_challenges`; // many sign-ups from one test address
  return signUp(call, { name });
}

test("waitlist offer: home banner, the session list keeps the seat for her, she books it; the next member sees her place", async () => {
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 5 * DAY).toISOString(), duration_minutes: 120, max_seats: 4, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  const seated = [];
  for (let i = 0; i < 4; i++) {
    const u = await member("Sara");
    const b = (await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: s.body.id } })).body;
    await payViaMock(call, await checkoutUrlFor(call, u.token, b));
    seated.push({ ...u, booking: b });
  }
  const [w1, w2] = [await member("هند"), await member("منى")];
  for (const w of [w1, w2]) assert.equal((await call("POST", `/api/v1/sessions/${s.body.id}/waitlist`, { token: w.token })).status, 201);
  assert.equal((await call("POST", `/api/v1/bookings/${seated[0].booking.booking_id}/cancel`, { token: seated[0].token, body: {} })).status, 200);

  const { page, errors } = await newPage();
  await signedIn(page, w1);
  await page.goto(env.base + "/#/home");
  const banner = page.locator(".banner-info", { hasText: "توفر مقعد في" });
  await banner.waitFor();
  assert.match(await banner.innerText(), /أكّدي خلال ساعتين للحجز والدفع\./);
  assert.match(await page.locator(`.event-card[data-session="${s.body.id}"]`).innerText(), /نحجز مقعدك لمدة\s+[12]:\d\d/);
  await noHorizontalScroll(page);
  await banner.locator("a", { hasText: "احجزي مقعدك" }).click();
  await page.waitForSelector(`input[name=s][value="${s.body.id}"]:checked`);
  assert.equal(await page.locator(`input[name=s][value="${s.body.id}"]`).isDisabled(), false, "the kept seat is hers to book");
  const card = page.locator("label.option", { has: page.locator(`input[value="${s.body.id}"]`) });
  assert.match(await card.innerText(), /نحجز مقعدك لمدة\s+[12]:\d\d/);
  await noHorizontalScroll(page);
  await page.click("#go");
  await page.waitForSelector("#clock");
  assert.match(await page.locator("#clock").innerText(), /^[12]:\d\d:\d\d$/, "the hold clock shows hours for a seat kept from the waitlist");
  await noHorizontalScroll(page);
  // the inbox links the offer to the session list
  await page.goto(env.base + "/#/inbox");
  const offer = page.locator("li.card", { hasText: "توفر مقعد في" });
  await offer.waitFor();
  assert.equal(await offer.locator(`a[href="#/sessions?s=${s.body.id}"]`).innerText(), "احجزي مقعدك");
  assert.deepEqual(errors, []);
  await page.context().close();

  // the second member: full for her, with her place on the list instead of the join button
  const p2 = await newPage();
  await signedIn(p2.page, w2);
  await p2.page.goto(env.base + "/#/sessions");
  await p2.page.waitForSelector("h1");
  await p2.page.locator("p.caption", { hasText: "أنتِ في قائمة الانتظار (الترتيب 1)." }).waitFor();
  assert.equal(await p2.page.locator(`[data-wait="${s.body.id}"]`).count(), 0);
  assert.equal(await p2.page.locator(`input[name=s][value="${s.body.id}"]`).isDisabled(), true);
  assert.deepEqual(p2.errors, []);
  await p2.page.context().close();
});

test("step counter: off sends nothing; on sends one ping per step, without sign-in, cookie or device id", async () => {
  const watch = (page) => { const pings = []; page.on("request", (r) => { if (r.url().includes("/api/v1/funnel/steps")) pings.push(r); }); return pings; };
  const off = await newPage();
  const offPings = watch(off.page);
  await off.page.goto(env.base + "/#/welcome");
  await off.page.waitForSelector("#start");
  await off.page.goto(env.base + "/#/signin");
  await off.page.waitForSelector("#phone");
  await off.page.waitForTimeout(300);
  assert.equal(offPings.length, 0, "nothing is sent while the counter is off");
  assert.equal((await env.sql`SELECT count(*)::int AS n FROM app.funnel_daily`)[0].n, 0);
  await off.page.context().close();

  await env.sql`UPDATE app.app_config SET value = 'true' WHERE key = 'FUNNEL_COUNTER_ENABLED'`;
  resetConfigCache();
  try {
    const on = await newPage();
    const pings = watch(on.page);
    await on.page.goto(env.base + "/#/welcome");
    await on.page.waitForSelector("#start");
    await on.page.goto(env.base + "/#/signin");
    await on.page.waitForSelector("#phone");
    await on.page.goto(env.base + "/#/welcome"); // back again: still one ping per step on this page load
    await on.page.waitForSelector("#start");
    await on.page.waitForTimeout(300);
    assert.deepEqual(pings.map((r) => JSON.parse(r.postData())), [{ step: "signup_welcome", platform: "web" }, { step: "signup_phone", platform: "web" }]);
    for (const r of pings) {
      const h = await r.allHeaders();
      assert.ok(!h.authorization && !h.cookie, "no sign-in token and no cookie");
    }
    const rows = await env.sql`SELECT step, platform, count FROM app.funnel_daily ORDER BY step`;
    assert.deepEqual(rows.map((x) => [x.step, x.platform, x.count]), [["signup_phone", "web", 1], ["signup_welcome", "web", 1]]);
    assert.deepEqual(on.errors, []);
    await on.page.context().close();
  } finally {
    await env.sql`UPDATE app.app_config SET value = 'false' WHERE key = 'FUNNEL_COUNTER_ENABLED'`;
    resetConfigCache();
  }
});

test("admin console: a failed notification shows with her name, number and message; Handled clears it; the step counter table", async () => {
  const ops = await adminLogin(call, env.sql, "ops.oncall@example.test");
  const m = await member("Mona");
  await env.sql`INSERT INTO app.notifications_outbox (user_id, channel, template_key, locale, payload, status, attempts, last_error)
                VALUES (${m.userId}, 'push', 'BOOKING_CANCELLED', 'ar', ${env.sql.json({ ref: "RT-FAIL22" })}, 'failed', 4, '503')`;
  const ad = await newPage({ width: 1280, height: 900 });
  await ad.page.addInitScript(([t, a]) => { sessionStorage.setItem("qa_token", JSON.stringify(t)); sessionStorage.setItem("qa_admin", JSON.stringify(a)); }, [ops.token, ops.admin]);
  await ad.page.goto(`${env.base}/admin/#/failed-notifications`);
  await ad.page.waitForSelector("h1:text('Failed notifications')");
  assert.ok(/Failed notifications\s*open:\s*\d+/.test(await ad.page.locator("nav").innerText()), "the menu shows how many are open");
  const row = ad.page.locator("tr", { hasText: "Mona" });
  assert.equal(await row.count(), 1);
  const text = await row.innerText();
  assert.ok(text.includes("Your booking RT-FAIL22 was cancelled.") && text.includes("503"), text);
  assert.equal(await row.locator("a[href^='tel:']").getAttribute("href"), `tel:${m.phone}`);
  await row.locator("[data-fn-done]").click();
  await ad.page.waitForSelector("tr:has-text('Mona')", { state: "detached" });
  assert.ok((await env.sql`SELECT handled_at FROM app.notifications_outbox WHERE user_id = ${m.userId}`)[0].handled_at);

  await env.sql`INSERT INTO app.funnel_daily (day, step, platform, count) VALUES ((now() AT TIME ZONE 'Asia/Qatar')::date, 'booking_paid', 'ios', 7)
                ON CONFLICT (day, step, platform) DO UPDATE SET count = 7`;
  await ad.page.goto(`${env.base}/admin/#/funnel`);
  await ad.page.waitForSelector("h1:text('Step counter')");
  assert.ok((await ad.page.locator("main").innerText()).includes("The counter is off"));
  const paidCol = (await ad.page.locator("thead th").allInnerTexts()).indexOf("Paid");
  assert.ok(paidCol > 0);
  assert.equal(await ad.page.locator("tbody tr").first().locator("td").nth(paidCol).innerText(), "7");
  await ad.page.click("[data-fp=web]");
  await ad.page.waitForSelector("[data-fp=web][aria-pressed=true]");
  assert.equal(await ad.page.locator("tbody tr").first().locator("td").nth(paidCol).innerText(), "—", "iOS counts are not in the web column");
  assert.deepEqual(ad.errors, []);
  await ad.page.context().close();
});
