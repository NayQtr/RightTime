// Website micro-interactions (owner-approved design study item 4, 13 Nov 2026, after Framer):
// - choosing an option animates its mark (the radio fills, the check pops in); still with reduced motion
// - hover tints exist only for a real pointer (@media (hover: hover)), so a tapped card on a phone never stays tinted
// - every button that waits on the server shows the in-button spinner (aria-busy) and cannot be pressed twice
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, client, signInAgain, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let env, browser, call, member, full;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const owner = await adminLogin(call, env.sql, "owner@example.test");
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 4 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  await env.sql`UPDATE app.event_sessions SET seats_sold = max_seats WHERE id = ${s.body.id}`;   // full: the waitlist button shows
  full = s.body.id;
  member = await signUp(call, { name: "Noor" });
});
after(async () => { await browser?.close(); await env?.stop(); });

async function open(hash, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(env.base + "/");
  const tokens = await signInAgain(call, env.sql, member.phone);
  await page.evaluate(([t]) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify("ar")); }, [tokens]);
  const ready = () => page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
  await page.reload(); await ready();
  await page.goto(env.base + "/" + hash); await ready();
  return page;
}

test("choosing an option animates its mark; with reduced motion it does not", async () => {
  for (const [motion, moving] of [["no-preference", true], ["reduce", false]]) {
    const page = await open("#/sessions", { reducedMotion: motion });
    const t = await page.evaluate(() => getComputedStyle(document.querySelector(".option .tick")).transitionDuration);
    assert.equal(t.split(",").some((d) => parseFloat(d) > 0), moving, `${motion}: ${t}`);
    await page.context().close();
  }
});

test("hover tints apply only where there is a real pointer (no tint left behind after a tap on a phone)", async () => {
  const page = await open("#/home");
  const loose = await page.evaluate(() => {
    const out = [];
    const walk = (rules, inHover) => { for (const r of rules) {
      if (r instanceof CSSMediaRule) walk(r.cssRules, inHover || /hover:\s*hover/.test(r.conditionText));
      else if (r.selectorText && r.selectorText.includes(":hover") && !inHover) out.push(r.selectorText);
    } };
    for (const sh of document.styleSheets) { if (sh.href && sh.href.endsWith("/styles.css")) walk(sh.cssRules, false); }
    return out;
  });
  assert.deepEqual(loose, []);
  await page.context().close();
});

for (const [name, hash, button, path] of [
  ["join the waitlist", "#/sessions", "[data-wait]", "/waitlist"],
  ["a copy of my data", "#/profile", "#mydata", "/users/me/export"],
]) {
  test(`${name}: the button shows its spinner while the server answers, and is not pressed twice`, async () => {
    const page = await open(hash);
    let calls = 0, release;
    const held = new Promise((r) => { release = r; });
    await page.route((u) => u.pathname.endsWith(path), async (route) => { calls++; await held; await route.continue(); });
    const b = page.locator(button).first();
    await b.click();
    await page.waitForFunction((sel) => document.querySelector(sel).getAttribute("aria-busy") === "true", button);
    assert.equal(await b.isDisabled(), true);
    await b.click({ force: true }).catch(() => null);
    release();
    await page.waitForFunction((sel) => !document.querySelector(sel) || document.querySelector(sel).getAttribute("aria-busy") !== "true", button);
    assert.equal(calls, 1);
    await page.context().close();
  });
}
