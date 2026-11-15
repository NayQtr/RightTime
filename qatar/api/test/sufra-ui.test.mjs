// The «سُفرة» seats pattern (owner decision 15 Nov 2026, option B): a background layer of dashed seats on the welcome
// screen, the questionnaire interstitials, the empty states and between the /about sections; never on account, payment
// or meetup-details screens; hidden when more contrast or forced colours are asked for. Real API + PostgreSQL, Chromium
// via Playwright, pages served with the production Content-Security-Policy (the masks are data: images).
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, client, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const WEB = new URL("../../web/", import.meta.url);
const CSP = JSON.parse(readFileSync(new URL("vercel.json", WEB))).headers
  .flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;
const CSS = readFileSync(new URL("styles.css", WEB), "utf8");
const TOKENS = JSON.parse(readFileSync(new URL("../design/tokens.json", WEB)));
const DAY = 86400000;
let env, browser, call, owner;

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  owner = await adminLogin(call, env.sql, "owner@example.test");
  await env.sql`DELETE FROM app.event_sessions`;
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); await env?.stop(); });

async function newPage({ width = 390, height = 844, theme = null, ...opts } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block", ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route((url) => url.origin === env.base && !url.pathname.startsWith("/api/") && /(\.html|\/|\/about(\/en)?)$/.test(url.pathname), async (r) => {
    const res = await r.fetch();
    await r.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": CSP.replace("connect-src 'self'", `connect-src 'self' ${env.base}`) } });
  });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_FAILED|404/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(env.base + "/");
  await page.evaluate(([th]) => { localStorage.setItem("q_locale", JSON.stringify("ar")); if (th) localStorage.setItem("q_theme", JSON.stringify(th)); }, [theme]);
  return page;
}
async function go(page, hash, u = null) {
  if (u) await page.evaluate((t) => localStorage.setItem("q_tokens", JSON.stringify(t)), { access_token: u.token, refresh_token: u.refresh });
  await page.goto("about:blank");
  await page.goto(env.base + "/" + hash);
  await page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
}
// what each layer of the pattern actually draws: shown or not, its mask, colour and opacity
const layers = (page, sel = "body") => page.evaluate((s) => {
  const el = document.querySelector(s);
  return ["::before", "::after"].map((p) => {
    const c = getComputedStyle(el, p);
    return { content: c.content, display: c.display, mask: c.maskImage || c.webkitMaskImage, bg: c.backgroundColor, opacity: Number(c.opacity), size: c.maskSize || c.webkitMaskSize };
  });
}, sel);
const token = (page, name) => page.evaluate((n) => { const e = document.createElement("i"); e.style.color = `var(${n})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, name);
const on = (page) => page.evaluate(() => document.body.classList.contains("sufra-bg"));
async function shows(page, what, sel = "body") {
  const [l1, l2] = await layers(page, sel);
  for (const l of [l1, l2]) {
    assert.notEqual(l.display, "none", `${what}: pattern hidden`);
    assert.match(l.mask, /^url\("data:image\/svg\+xml/, `${what}: mask is a data: SVG`);
  }
  assert.equal(l1.bg, await token(page, "--c-borderStrong"), `${what}: layer 1 colour`);
  assert.equal(l2.bg, await token(page, "--c-seat"), `${what}: layer 2 colour`);
  assert.equal(l1.size, "64px 64px");
  assert.equal(l2.size, "192px 64px");
  return [l1, l2];
}
async function clean(page, what) {
  assert.deepEqual(await page.evaluate(() => window.__csp), [], `${what}: CSP violation`);
  assert.deepEqual(page.errors, [], `${what}: console errors`);
}

test("the masks: single dashed seats (r 4, stroke 1.25, dashes 3 2.5), never filled, no table ring; a 64 px staggered grid and one seat per 192 px", () => {
  const svgs = [...CSS.matchAll(/mask-image: url\("data:image\/svg\+xml,([^"]+)"\)/g)].map((m) => decodeURIComponent(m[1]));
  assert.equal(svgs.length, 4, "two layers, each with the -webkit- copy");
  const [l1, , l2] = svgs;
  for (const s of svgs) {
    assert.match(s, /fill='none'/); assert.match(s, /stroke-width='1\.25'/); assert.match(s, /stroke-dasharray='3 2\.5'/);
    assert.deepEqual([...s.matchAll(/r='([\d.]+)'/g)].map((m) => m[1]).filter((r) => r !== "4"), [], "only seat circles (r 4), no ring");
  }
  assert.match(l1, /width='64' height='64'/); assert.deepEqual([...l1.matchAll(/cx='(\d+)' cy='(\d+)'/g)].map((m) => `${m[1]},${m[2]}`), ["16,16", "48,48"]);
  assert.match(l2, /width='192' height='64'/); assert.deepEqual([...l2.matchAll(/cx='(\d+)' cy='(\d+)'/g)].map((m) => `${m[1]},${m[2]}`), ["16,16"]);
  assert.ok(!/animation|transition/.test(CSS.slice(CSS.indexOf("«سُفرة» seats pattern"))), "static");
});

test("contrast: body text and muted text keep 4.5:1 over the darkest pattern pixel (both layers crossing), light and dark", () => {
  const o1 = Number(/--sufra-o1: ([\d.]+)/.exec(CSS)[1]);
  const o2light = Number(/:root \{ --sufra-o1: [\d.]+; --sufra-o2: ([\d.]+); \}/.exec(CSS)[1]);
  const o2dark = Number(/:root\[data-theme="dark"\] \{ --sufra-o2: ([\d.]+); \}/.exec(CSS)[1]);
  assert.equal(o1, 0.3); assert.equal(o2dark, 0.22);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = (c) => { const l = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
  for (const [theme, o2] of [["light", o2light], ["dark", o2dark]]) {
    const c = Object.fromEntries(Object.entries(TOKENS.color[theme]).map(([k, v]) => [k, rgb(v.$value)]));
    const worst = mix(mix(c.bg, c.borderStrong, o1), c.seat, o2);
    for (const fg of ["text", "textMuted"]) assert.ok(ratio(c[fg], worst) >= 4.5, `${theme} ${fg}: ${ratio(c[fg], worst).toFixed(2)}:1`);
  }
});

test("shown: welcome and the interstitials (not the privacy one), light and dark; no CSP violation or console error", async () => {
  for (const theme of ["light", "dark"]) {
    const page = await newPage({ theme });
    await go(page, "#/welcome");
    assert.ok(await on(page), "welcome");
    const [l1, l2] = await shows(page, `welcome ${theme}`);
    assert.equal(l1.opacity, 0.3);
    assert.equal(l2.opacity, theme === "dark" ? 0.22 : 0.15);
    // the outlined button is solid over it (no dash through the label)
    assert.equal(await page.locator(".hero-welcome .btn-secondary").evaluate((b) => getComputedStyle(b).backgroundColor), await token(page, theme === "dark" ? "--c-surfaceSunken" : "--c-bg"));
    await go(page, "#/quiz/0");
    assert.equal(await page.locator(".inter").getAttribute("data-inter"), "doha");
    assert.ok(await on(page), "interstitial");
    await shows(page, `interstitial ${theme}`);
    await go(page, "#/quiz/999"); // the last step: the privacy screen, with the longer text
    assert.equal(await page.locator(".inter").getAttribute("data-inter"), "data");
    assert.equal(await on(page), false, "not behind the privacy screen");
    await go(page, "#/quiz/1"); // the next interstitial brings it back
    assert.ok(await on(page));
    await go(page, "#/signin");
    assert.equal(await on(page), false, "not on the sign-in form");
    await clean(page, `signed out ${theme}`);
    await page.context().close();
  }
});

test("empty states show it; account, payment and meetup details do not", async () => {
  await env.sql`DELETE FROM app.otp_challenges`;
  const u = await signUp(call, { name: "Hind" });
  const page = await newPage();
  await go(page, "#/home", u);
  await page.waitForSelector("main .empty");
  assert.ok(await on(page), "home with no sessions");
  await shows(page, "home empty");
  await go(page, "#/events");
  await page.waitForSelector(".ready-card");
  assert.ok(await on(page), "my meetups with no booking");
  await go(page, "#/profile");
  assert.equal(await on(page), false, "account");

  const at = new Date(Date.now() + 5 * DAY);
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: at.toISOString(), duration_minutes: 120, max_seats: 6, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token });
  await go(page, "#/home");
  assert.equal(await on(page), false, "home with sessions");
  const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: s.body.id } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  await go(page, `#/booking/${b.body.booking_id}/review`);
  assert.equal(await on(page), false, "payment review");
  await go(page, `#/booking/${b.body.booking_id}`);
  assert.equal(await on(page), false, "meetup details");
  await go(page, "#/events");
  assert.equal(await on(page), false, "my meetups with a booking");
  await clean(page, "signed in");
  await page.context().close();
});

test("hidden under prefers-contrast: more and forced colours", async () => {
  for (const opts of [{ contrast: "more" }, { forcedColors: "active" }]) {
    const page = await newPage(opts);
    await go(page, "#/welcome");
    assert.ok(await on(page));
    for (const l of await layers(page)) assert.equal(l.display, "none", JSON.stringify(opts));
    await clean(page, JSON.stringify(opts));
    await page.context().close();
  }
});

test("/about: a band of seats between every two sections, decorative, never inside one", async () => {
  for (const [path, file] of [["/about", "index.html"], ["/about/en", "en.html"]]) {
    const html = readFileSync(new URL(`about/${file}`, WEB), "utf8");
    assert.equal((html.match(/<\/section>\s*<div class="sufra-bg sufra-break" aria-hidden="true"><\/div>\s*<section/g) || []).length, 6, file);
    assert.equal((html.match(/sufra-break/g) || []).length, 6, file);
    const page = await newPage();
    await page.goto(env.base + path);
    await page.waitForSelector(".sufra-break");
    const [l1] = await shows(page, path, ".sufra-break");
    assert.equal(l1.opacity, 0.3);
    assert.equal(await page.locator(".sufra-break").first().evaluate((e) => e.getBoundingClientRect().height), 64);
    assert.equal(await on(page), false, "the page itself has the plain background");
    await clean(page, path);
    await page.context().close();
  }
});
