// Website: the 60-30-10 colour rule (20 Nov 2026). 60 the page (bg), 30 one family of containers (surface with a hairline
// border), 10 the accent (mauve primary/cta, the table drawing's seats, the welcome screen's yellow word). The accent is
// kept for the screen's main button, the current tab and the seats of a real table drawing, so a screen never shows more
// than three accent elements at once. Counted on screen only (not below the fold, not the off-screen skip link); a
// drawing counts once however many seats it has, a control once with its icon and label; the «سُفرة» pattern layers are
// decorative and not counted.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signInAgain, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
let env, browser, call, owner, member, pending;
const S = {};

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  owner = await adminLogin(call, env.sql, "owner@example.test");
  await env.sql`DELETE FROM app.event_sessions`;
  await env.sql`INSERT INTO app.price_plans (city_id, experience, service_fee_minor, valid_from) VALUES ('doh', 'coffee', 3900, now() - interval '1 day')`;
  const add = async (key, experience, days, seats = 18, hour = 16) => {
    const at = new Date(Date.now() + days * DAY); at.setUTCHours(hour, 30, 0, 0);
    const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience, conversation_language: "ar",
      starts_at: at.toISOString(), duration_minutes: 120, max_seats: seats, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
    S[key] = s.body.id;
  };
  await add("open", "dinner", 2, 18, 10); await add("coffee", "coffee", 2, 18, 11); await add("full", "dinner", 2, 4, 12); await add("mine", "dinner", 2, 18, 13);
  await add("later", "dinner", 16);
  member = await fresh("Hind");
  for (const n of ["Sara", "Amal", "Jood", "Lama"]) await paid(await fresh(n), S.full);
  S.myBooking = await paid(member, S.mine);
  pending = await fresh("Rana");
  const b = await call("POST", "/api/v1/bookings", { token: pending.token, body: { session_id: S.later } });
  assert.equal(b.status, 201);
  pending.booking = b.body.booking_id;
});
after(async () => { await browser?.close(); await env?.stop(); });

async function fresh(name) { await env.sql`DELETE FROM app.otp_challenges`; return signUp(call, { name }); }
async function paid(u, session) {
  const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: session } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  await payViaMock(call, await checkoutUrlFor(call, u.token, b.body));
  return b.body.booking_id;
}
const ready = (page) => page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
async function open(hash, { who = member, signedOut = false, colorScheme = "light" } = {}) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", colorScheme })).newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(env.base + "/");
  await env.sql`DELETE FROM app.otp_challenges`;
  const t = signedOut ? null : await signInAgain(call, env.sql, who.phone);
  await page.evaluate(([x]) => { if (x) localStorage.setItem("q_tokens", JSON.stringify(x)); localStorage.setItem("q_locale", JSON.stringify("ar")); }, [t]);
  await page.goto("about:blank"); await page.goto(env.base + "/" + hash); await ready(page);
  return page;
}

// the accent elements on screen: background, border, ring (box-shadow), text, svg fill or stroke, or a gradient in an
// accent colour, on an element or its ::before / ::after
const ACCENTS = () => {
  const probe = (n) => { const e = document.createElement("i"); e.style.color = `var(${n})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; };
  const ACC = [...new Set(["--c-primary", "--c-cta", "--c-seat", "--c-accent"].map(probe))];
  const isAcc = (c) => ACC.includes(c);
  const inStr = (s) => Boolean(s) && s !== "none" && ACC.some((a) => s.includes(a));
  const look = (cs, text) => {
    const why = [];
    if (isAcc(cs.backgroundColor)) why.push("bg");
    if (/gradient/.test(cs.backgroundImage) && inStr(cs.backgroundImage)) why.push("gradient");
    for (const side of ["Top", "Right", "Bottom", "Left"]) if (parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== "none" && isAcc(cs[`border${side}Color`])) { why.push("border"); break; }
    if (inStr(cs.boxShadow)) why.push("ring");
    if (text && isAcc(cs.color)) why.push("text");
    return why;
  };
  const counted = new Set(), hits = [];
  const under = (el) => { for (let p = el.parentElement; p; p = p.parentElement) if (counted.has(p)) return true; return false; };
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 4 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const why = look(cs, [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    if (el instanceof SVGElement && (isAcc(cs.fill) || isAcc(cs.stroke))) why.push("svg");
    if (!el.classList.contains("sufra-bg")) for (const ps of ["::before", "::after"]) {
      const p = getComputedStyle(el, ps);
      if (!p.content || p.content === "none" || p.display === "none" || Number(p.opacity) === 0 || /^matrix\(0, /.test(p.transform)) continue;
      why.push(...look(p, p.content !== '""').map((w) => ps.slice(2) + ":" + w));
    }
    if (!why.length) continue;
    let key = el;
    if (el instanceof SVGElement) while (key.ownerSVGElement) key = key.ownerSVGElement; // one drawing, however many seats
    const ctl = key.closest("a, button, label");
    if (ctl && ctl !== key && isAcc(getComputedStyle(ctl).color)) key = ctl; // a control with its icon and label
    if (counted.has(key) || under(key)) continue;
    counted.add(key);
    hits.push(`${why.join("+")} ${key.id ? "#" + key.id : key.tagName.toLowerCase()} ${(key.textContent || "").trim().slice(0, 24)}`);
  }
  return hits;
};

test("60-30-10: no screen shows more than three accent elements (light and dark, 390 px)", async () => {
  const screens = [["welcome", "#/welcome", { signedOut: true }], ["home", "#/home", {}], ["sessions", "#/sessions", {}], ["events", "#/events", {}],
    ["details", `#/booking/${S.myBooking}`, {}], ["review", `#/booking/${pending.booking}/review`, { who: pending }], ["profile", "#/profile", {}], ["inbox", "#/inbox", {}]];
  for (const colorScheme of ["light", "dark"]) for (const [name, hash, o] of screens) {
    const page = await open(hash, { colorScheme, ...o });
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
    const hits = await page.evaluate(ACCENTS);
    assert.ok(hits.length <= 3, `${name} (${colorScheme}): ${hits.length} accent elements\n  ${hits.join("\n  ")}`);
    assert.deepEqual(page.errors, [], `${name} (${colorScheme})`);
    await page.context().close();
  }
});

test("60-30-10: the next-meetup card is a surface card; its pill is neutral and its button stays the mauve call to action", async () => {
  for (const colorScheme of ["light", "dark"]) {
    const page = await open("#/events", { colorScheme });
    await page.waitForSelector("section.card.hero");
    const tok = (n) => page.evaluate((x) => { const e = document.createElement("i"); e.style.color = `var(${x})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, n);
    const card = await page.locator("section.card.hero").evaluate((c) => ({ bg: getComputedStyle(c).backgroundColor, colour: getComputedStyle(c).color,
      pill: getComputedStyle(c.querySelector(".badge")).backgroundColor, button: getComputedStyle(c.querySelector(".btn-primary")).backgroundColor }));
    assert.deepEqual(card, { bg: await tok("--c-surface"), colour: await tok("--c-text"), pill: await tok("--c-surfaceSunken"), button: await tok("--c-primary") }, colorScheme);
    await page.context().close();
  }
});
