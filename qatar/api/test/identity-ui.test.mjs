// Identity step of 13 Nov 2026 (owner approved all five proposals, «All»): fields and buttons 56 px with 16 px corners and a
// focus halo; the sign-in code in six boxes over one real input (typing, paste and SMS autofill fill all six; a wrong code
// turns them red); questionnaire answers as light outlined cards; meetup cards raised and light; each account section one
// rounded card. Texts unchanged.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, client, signInAgain, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let env, browser, call, member;

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
});
after(async () => { await browser?.close(); await env?.stop(); });

async function page_(locale = "ar") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript((l) => localStorage.setItem("q_locale", JSON.stringify(l)), locale);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { page, errors };
}
// the computed colour a token resolves to, to compare with an element's computed colour
const token = (page, name) => page.evaluate((n) => { const d = document.createElement("i"); d.style.color = `var(${n})`; document.body.append(d);
  const c = getComputedStyle(d).color; d.remove(); return c; }, name);

test("the code: six boxes over one real input; typing, paste and a wrong code", async () => {
  const { page, errors } = await page_();
  await page.goto(`${env.base}/#/signin`);
  await page.waitForSelector("#cc");
  await page.fill("#phone", "33445566");
  await page.click("#send");
  await page.waitForSelector("#code");
  const boxes = () => page.locator(".otp6 .bx").allInnerTexts();
  assert.equal(await page.locator(".otp6 .bx").count(), 6);
  assert.equal(await page.locator(".otp6 .bx[aria-hidden=true]").count(), 6, "the boxes are a picture; the input is what is read");
  assert.equal(await page.locator("#code").getAttribute("autocomplete"), "one-time-code", "the phone can fill it from the SMS");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".otp6")).direction), "ltr", "left to right, as the SMS reads");
  // the real input lies over the boxes, so a tap on a box lands on it: tap where the third box is
  const third = await page.locator(".otp6 .bx").nth(2).boundingBox();
  await page.mouse.click(third.x + third.width / 2, third.y + third.height / 2);
  assert.equal(await page.evaluate(() => document.activeElement.id), "code", "a tap on any box types into the code");
  await page.keyboard.type("12a3");
  assert.deepEqual(await boxes(), ["1", "2", "3", "", "", ""], "digits only, one per box");
  assert.equal(await page.locator(".otp6 .bx.next").count(), 1);
  assert.equal(await page.locator(".otp6 .bx >> nth=3").getAttribute("class"), "bx next", "the next box to fill is marked");
  await page.fill("#code", "000000");
  assert.deepEqual(await boxes(), ["0", "0", "0", "0", "0", "0"], "a pasted or autofilled code fills all six");
  await page.click("#ver");
  await page.waitForSelector("#code[aria-invalid=true]");
  const danger = await token(page, "--c-danger");
  assert.ok((await page.locator(".otp6 .bx >> nth=0").evaluate((b) => getComputedStyle(b).boxShadow)).includes(danger), "a wrong code turns the boxes red");
  assert.notEqual((await page.locator("#oerr").innerText()).trim(), "");
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("fields and buttons are 56 px with 16 px corners; the field in use has the halo", async () => {
  const { page, errors } = await page_();
  await page.goto(`${env.base}/#/name`);
  await page.waitForSelector("main input");
  const name = page.locator("main input").first();
  await name.focus();
  const st = await name.evaluate((el) => { const s = getComputedStyle(el); return { h: el.getBoundingClientRect().height, r: s.borderTopLeftRadius, sh: s.boxShadow }; });
  assert.ok(st.h >= 56, `field height ${st.h}`);
  assert.equal(st.r, "16px");
  assert.match(st.sh, /0px 0px 0px 2px inset/, `ink edge: ${st.sh}`);
  assert.match(st.sh, /0px 0px 0px 4px/, `halo: ${st.sh}`);
  const btn = await page.locator("main .btn-primary").first().evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(btn >= 56, `button height ${btn}`);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("answers are light outlined cards; the chosen one is tinted with a mauve edge", async () => {
  const { page, errors } = await page_();
  await page.goto(`${env.base}/#/welcome`);
  await page.click("#start");
  await page.waitForFunction(() => location.hash.startsWith("#/quiz/"));
  await page.waitForTimeout(800);
  await page.goto(`${env.base}/#/quiz/2`);
  await page.waitForSelector("label.option");
  const [surface, subtle, primary] = [await token(page, "--c-surface"), await token(page, "--c-primarySubtle"), await token(page, "--c-primary")];
  const bg = (i) => page.locator("label.option").nth(i).evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(await bg(1), surface, "an answer not chosen is light");
  await page.locator("label.option").nth(0).click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);   // the tint fades in (120 ms)
  assert.equal(await bg(0), subtle, "the chosen one is tinted");
  assert.equal(await page.locator("label.option").nth(0).evaluate((el) => getComputedStyle(el).color), primary);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("meetup cards are raised and light; each account section is one rounded card", async () => {
  const { page, errors } = await page_();
  await page.goto(`${env.base}/`);
  const tokens = await signInAgain(call, env.sql, member.phone);
  await page.evaluate((t) => localStorage.setItem("q_tokens", JSON.stringify(t)), tokens);
  const ready = () => page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
  await page.reload(); await ready();
  await page.goto(`${env.base}/#/home`); await ready();
  const surface = await token(page, "--c-surface");
  const card = await page.locator("a.event-card").first().evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, sh: s.boxShadow, r: s.borderTopLeftRadius }; });
  assert.equal(card.bg, surface);
  assert.match(card.sh, /0px 0px 0px 1px/, `hairline edge: ${card.sh}`);
  assert.match(card.sh, /0px 10px 24px -18px/, `soft shadow: ${card.sh}`);
  assert.equal(card.r, "24px");
  await page.goto(`${env.base}/#/profile`); await ready();
  const groups = await page.locator("ul.settings").evaluateAll((els) => els.map((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, r: s.borderTopLeftRadius }; }));
  assert.ok(groups.length >= 2);
  for (const g of groups) assert.deepEqual(g, { bg: surface, r: "16px" });
  assert.equal(await page.locator("ul.settings li:last-child").first().evaluate((el) => getComputedStyle(el).borderBottomWidth), "0px", "no line under the last row");
  assert.deepEqual(errors, []);
  await page.context().close();
});
