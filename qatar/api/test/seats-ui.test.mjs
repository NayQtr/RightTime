// Website, seats left (owner's decision of 13 Nov 2026, from the MUJI restraint study): the count is shown only when
// 3 or fewer seats are left, on the sessions list and on the home cards; a session with plenty of room says nothing.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, client, signInAgain, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
let env, browser, call, member;
const S = {};

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const owner = await adminLogin(call, env.sql, "owner@example.test");
  for (const [k, days, area] of [["roomy", 4, "لوسيل"], ["few", 6, "مشيرب"]]) {
    const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
      starts_at: new Date(Date.now() + days * DAY).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: area, district_hint_en: area } });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
    S[k] = s.body.id;
  }
  await env.sql`UPDATE app.event_sessions SET seats_sold = 15 WHERE id = ${S.few}`;   // 18 - 15 = 3 left
  member = await signUp(call, { name: "Noor" });
});
after(async () => { await browser?.close(); await env?.stop(); });

async function open(hash, locale) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(env.base + "/");
  const tokens = await signInAgain(call, env.sql, member.phone);
  await page.evaluate(([t, l]) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify(l)); }, [tokens, locale]);
  // boot once with the tokens and let the first screen finish (it rotates the refresh token), then move within the app:
  // a reload during that first refresh would reuse the old token, which ends the session by design (NMX-63)
  const ready = () => page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
  await page.reload(); await ready();
  await page.goto(env.base + "/" + hash); await ready();
  return page;
}

for (const [locale, few, any] of [["ar", "3 مقاعد متبقية", /مقاعد متبقية/], ["en", "3 seats left", /seats left/]]) {
  test(`${locale}: sessions list shows the count only for the session with 3 seats left`, async () => {
    const page = await open("#/sessions", locale);
    const roomy = await page.locator(`.sess[data-id="${S.roomy}"]`).innerText();
    const short = await page.locator(`.sess[data-id="${S.few}"]`).innerText();
    assert.doesNotMatch(roomy, any, roomy);
    assert.ok(short.includes(few), short);
    await page.context().close();
  });

  test(`${locale}: home cards show the count only for the session with 3 seats left, in text and for screen readers`, async () => {
    const page = await open("#/home", locale);
    const card = (id) => page.locator(`a.event-card[data-session="${id}"]`);
    assert.doesNotMatch(await card(S.roomy).innerText(), any);
    assert.doesNotMatch(await card(S.roomy).getAttribute("aria-label"), any);
    assert.ok((await card(S.few).innerText()).includes(few));
    assert.ok((await card(S.few).getAttribute("aria-label")).includes(few));
    await page.context().close();
  });
}
