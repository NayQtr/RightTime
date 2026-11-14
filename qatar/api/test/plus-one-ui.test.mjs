// Website: the owner's items of 14 Nov 2026.
// - "+1": a toggle on the review step (off by default); on, the explanation, the companion's name (required) and a
//   required check box; the receipt shows two seats and the doubled total and the pay button carries it. Booked through
//   the mock payment page; then two seats show in the confirmation, "my meetups", the details and the cancel page, and
//   cancelling refunds the whole amount once. Not offered when two seats are not free.
// - the fee page (what the organising fee includes, five questions), reached from the fee line by mouse or keyboard
// - the three waitlist steps under a full session, and the one-line refund text under the pay button and in the details
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signInAgain, signUp, startTestEnv } from "./helpers.mjs";
import { STRINGS } from "../../web/strings.js";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
let env, browser, call, owner, FEE, FEE_AR, FEE2_AR;
const S = {};

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  owner = await adminLogin(call, env.sql, "owner@example.test");
  const add = async (key, days, seats) => {
    const at = new Date(Date.now() + days * DAY); at.setUTCHours(16, 30, 0, 0);
    const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
      starts_at: at.toISOString(), duration_minutes: 120, max_seats: seats, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
    S[key] = s.body.id;
  };
  await env.sql`DELETE FROM app.event_sessions`;
  await add("roomy", 16, 18); await add("tight", 18, 4); await add("race", 20, 4); await add("full", 12, 4);
  for (const n of ["Sara", "Amal", "Jood", "Lama"]) await paid(await member(n), S.full);
  for (const n of ["Sara", "Amal", "Jood"]) await paid(await member(n), S.tight);
  for (const n of ["Sara", "Amal"]) await paid(await member(n), S.race);
});
after(async () => { await browser?.close(); await env?.stop(); });

async function member(name) { await env.sql`DELETE FROM app.otp_challenges`; return signUp(call, { name }); }
async function paid(u, session, guest) {
  const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: session, ...(guest ? { guest } : {}) } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  await payViaMock(call, await checkoutUrlFor(call, u.token, b.body));
  return b.body.booking_id;
}
const hold = async (u, session) => (await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: session } })).body.booking_id;
const ready = (page) => page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
async function open(hash, { who, locale = "ar", ...opts } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(env.base + "/");
  const tokens = await signInAgain(call, env.sql, who.phone);
  await page.evaluate(([t, l]) => { localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify(l)); }, [tokens, locale]);
  await page.reload(); await ready(page);
  await page.goto(env.base + "/" + hash); await ready(page);
  return page;
}
const noSideScroll = async (page, what) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${what}: the page scrolls sideways`);
const asColour = (page, name) => page.evaluate((n) => { const e = document.createElement("i"); e.style.color = `var(${n})`; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; }, name);
const text = async (loc) => (await loc.innerText()).replace(/[⁦-⁩‎‏]/g, "").replace(/\s+/g, " ").trim();
const seats = async (id) => (await env.sql`SELECT seats_sold FROM app.event_sessions WHERE id = ${id}`)[0].seats_sold;

test("+1 from the session choice to the refund: two seats and the doubled total everywhere, one refund", async () => {
  const u = await member("Noura");
  const price = (await call("GET", "/api/v1/sessions", { token: u.token })).body.sessions.find((s) => s.id === S.roomy).price;
  FEE = price.amount_minor; FEE_AR = price.display; FEE2_AR = FEE_AR.replace(String(FEE / 100), String(FEE * 2 / 100));
  const page = await open("#/sessions", { who: u });
  await page.locator(`.sess[data-id="${S.roomy}"] input[name=s]`).check({ force: true });
  await page.locator("#go").click();
  await page.waitForSelector("#plus-btn");
  const btn = page.locator("#plus-btn");
  // off by default: a real button, not pressed, nothing of the companion shown
  assert.deepEqual(await btn.evaluate((b) => [b.tagName, b.type, b.getAttribute("aria-pressed"), b.getAttribute("aria-controls"), b.textContent.trim(), b.disabled]),
    ["BUTTON", "button", "false", "plus-panel", "+1", false]);
  assert.equal(await page.locator("#plus-panel").isHidden(), true);
  assert.equal(await page.locator("#plus-row").isHidden(), true);
  assert.equal(await text(page.locator("#rc-total")), FEE_AR);
  assert.equal(await text(page.locator("#pay")), `ادفعي ${FEE_AR}`);
  assert.equal(await seats(S.roomy), 1);
  // on, by keyboard
  await btn.focus(); await page.keyboard.press("Enter");
  assert.equal(await btn.getAttribute("aria-pressed"), "true");
  await page.waitForFunction((c) => getComputedStyle(document.querySelector("#plus-btn")).backgroundColor === c, await asColour(page, "--c-primary"));
  assert.equal(await text(page.locator("#plus-exp")), "هذا الخيار يتيح لكِ الحضور برفقة من تودّين حضورها.");
  assert.equal(await text(page.locator("label[for=plus-name]")), "اسم مرافقتك");
  assert.deepEqual(await page.locator("#plus-name").evaluate((i) => [i.required, i.getAttribute("aria-describedby"), document.activeElement === i]), [true, "plus-exp plus-err", true]);
  assert.equal(await text(page.locator("label:has(#plus-ok)")), "أؤكد أن مرافقتي امرأة وعمرها 18 سنة أو أكثر.");
  assert.equal(await page.locator("#plus-ok").evaluate((i) => i.required && !i.checked), true);
  // the receipt: two seats, the fee x 2, the doubled total; the pay button carries the total and waits for the check box
  assert.equal(await text(page.locator("#plus-row > span").first()), "مقعدان");
  assert.equal(await text(page.locator("#fee-link")), "رسم التنظيم × 2");
  for (const sel of ["#rc-total", "#fee-amt", "#due-amt"]) assert.equal(await text(page.locator(sel)), FEE2_AR, sel);
  assert.equal(await text(page.locator("#pay")), `ادفعي ${FEE2_AR}`);
  assert.equal(await page.locator("#pay").isDisabled(), true);
  await page.locator("#plus-ok").check({ force: true });
  assert.equal(await page.locator("#pay").isDisabled(), false);
  // no name: said in an alert tied to the field, the field marked and focused; nothing is sent
  await page.locator("#pay").click();
  assert.equal(await text(page.locator("#plus-err")), "اكتبي اسم مرافقتك.");
  assert.deepEqual(await page.locator("#plus-name").evaluate((i) => [i.getAttribute("aria-invalid"), document.activeElement === i, document.querySelector("#plus-err").getAttribute("role")]), ["true", true, "alert"]);
  assert.equal(await seats(S.roomy), 1);
  await page.locator("#plus-name").fill("مريم");
  assert.equal(await text(page.locator("#plus-err")), "");
  assert.equal(await text(page.locator("#plus-row .plus-tag")), "+1 مريم");
  await noSideScroll(page, "review with +1");
  // the fee page and back: what she typed is still there
  await page.locator("#fee-link").click();
  await page.waitForSelector("#fee-faq");
  await page.locator("#fee-back").click();
  await page.waitForSelector("#plus-btn[aria-pressed=true]");
  assert.equal(await page.locator("#plus-name").inputValue(), "مريم");
  await page.locator("#plus-ok").check({ force: true });
  // pay through the mock payment page: it charges the total the server gave
  await page.locator("#pay").click();
  await page.waitForSelector("[data-o=success]");
  assert.ok((await text(page.locator("#box strong.num"))).includes(String(FEE * 2 / 100)), "the payment page asks for the total");
  assert.equal(await seats(S.roomy), 2);
  await page.click("[data-o=success]");
  await page.waitForSelector(".all-set .booking-peek", { timeout: 15000 });
  assert.ok((await text(page.locator(".booking-peek"))).includes(`+1 مريم · ${FEE2_AR}`));
  const [bk] = await env.sql`SELECT id, seats, guest_name, status, price_minor FROM app.bookings WHERE user_id = ${u.userId}`;
  assert.deepEqual([bk.seats, bk.guest_name, bk.status, bk.price_minor], [2, "مريم", "paid_awaiting_group", FEE * 2]);
  // my meetups, details, cancel
  await page.goto(`${env.base}/#/events`); await ready(page);
  assert.equal(await text(page.locator(".hero .plus-line")), `+1 مريم · ${FEE2_AR}`);
  await page.goto(`${env.base}/#/booking/${bk.id}`); await ready(page);
  assert.equal(await text(page.locator("#plus-fact")), "+1 مريم مقعدان");
  assert.equal(await text(page.locator("#plus-total")), `${FEE2_AR} رسم التنظيم × 2`);
  assert.ok((await text(page.locator("#det-refund"))).startsWith("إلغاء مجاني حتى"), "the one-line refund text");
  assert.ok((await text(page.locator("#det-refund"))).endsWith("بعده لا يُرد رسم التنظيم."));
  await noSideScroll(page, "details with +1");
  await page.goto(`${env.base}/#/booking/${bk.id}/cancel`); await ready(page);
  assert.equal(await text(page.locator("#cancel-plus")), `+1 مريم · ${FEE2_AR}`);
  assert.equal(await text(page.locator("#cancel-both")), "الإلغاء يشمل مقعدك ومقعد مرافقتك.");
  assert.ok((await text(page.locator("#cancel-table .when.now"))).includes(FEE2_AR), "the table gives back the total");
  await page.locator("#go").click();
  await page.waitForFunction((t) => document.querySelector("main h1")?.textContent.trim() === t, STRINGS.ar.cancelled);
  assert.ok((await text(page.locator("main"))).includes(FEE2_AR));
  const refunds = await env.sql`SELECT amount_minor, status FROM app.refunds WHERE booking_id = ${bk.id}`;
  assert.deepEqual(refunds.map((r) => [r.amount_minor, r.status]), [[FEE * 2, "refunded"]], "refunded once, the whole amount");
  assert.equal(await seats(S.roomy), 0);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("+1 in English, turned off again, and with less motion", async () => {
  const u = await member("Hala");
  const id = await hold(u, S.roomy);
  const page = await open(`#/booking/${id}/review`, { who: u, locale: "en", reducedMotion: "reduce" });
  const one = await text(page.locator("#rc-total"));
  await page.locator("#plus-btn").click();
  assert.equal(await page.locator("#plus-panel").evaluate((e) => getComputedStyle(e).animationName), "none");
  assert.equal(await text(page.locator("#plus-exp")), STRINGS.en.plusOneExplain);
  assert.equal(await text(page.locator("label[for=plus-name]")), "Your companion's name");
  assert.equal(await text(page.locator("label:has(#plus-ok)")), "I confirm that my companion is a woman aged 18 or over.");
  assert.equal(await text(page.locator("#plus-row > span").first()), "Two seats");
  assert.equal(await text(page.locator("#fee-link")), "Organising fee × 2");
  assert.equal(await text(page.locator("#due-amt")), `QAR ${FEE * 2 / 100}`);
  assert.equal(await text(page.locator("#pay")), `Pay QAR ${FEE * 2 / 100}`);
  assert.ok((await text(page.locator("#rc-policy"))).startsWith("Free cancellation until"));
  await noSideScroll(page, "review, English");
  // off again: one seat, the first total, nothing of the companion left
  await page.locator("#plus-btn").click();
  assert.equal(await page.locator("#plus-btn").getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator("#plus-panel").isHidden(), true);
  assert.equal(await page.locator("#plus-row").isHidden(), true);
  assert.deepEqual([await text(page.locator("#rc-total")), await text(page.locator("#due-amt")), await text(page.locator("#fee-link"))], [one, one, "Organising fee (paid now)"]);
  assert.equal(await page.locator("#pay").isDisabled(), false);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("+1 is not offered when two seats are not free, and says so if the second seat goes while she writes", async () => {
  // one seat left, and it is hers: the control is disabled with the reason beside it
  const a = await member("Dana");
  const idA = await hold(a, S.tight);
  let page = await open(`#/booking/${idA}/review`, { who: a });
  assert.deepEqual(await page.locator("#plus-btn").evaluate((b) => [b.disabled, b.getAttribute("aria-pressed"), b.getAttribute("aria-describedby")]), [true, "false", "plus-none"]);
  assert.equal(await text(page.locator("#plus-none")), "لا يتوفر مقعدان في هذا الموعد.");
  assert.equal(await page.locator("#plus-panel").isHidden(), true);
  assert.equal(await page.locator("#pay").isDisabled(), false);
  await page.context().close();
  // two seats left: offered; another member takes the last seat before she pays
  const b = await member("Reem"), c = await member("Mona");
  const idB = await hold(b, S.race);
  page = await open(`#/booking/${idB}/review`, { who: b });
  await page.locator("#plus-btn").click();
  await page.locator("#plus-name").fill("مريم");
  await page.locator("#plus-ok").check({ force: true });
  await hold(c, S.race);
  await page.locator("#pay").click();
  await page.waitForSelector("#plus-none");
  assert.equal(await text(page.locator("#toast")), "لا يتوفر مقعدان في هذا الموعد.");
  assert.equal(await page.locator("#plus-btn").isDisabled(), true);
  assert.equal(await text(page.locator("#pay")), `ادفعي ${FEE_AR}`);
  assert.equal(page.url().includes("/checkout/"), false, "she is not sent to pay for something else than she chose");
  const [row] = await env.sql`SELECT seats, guest_name, price_minor FROM app.bookings WHERE id = ${idB}`;
  assert.deepEqual([row.seats, row.guest_name, row.price_minor], [1, null, FEE]);
  assert.equal(await seats(S.race), 4);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test("the fee page: the real fee, what it includes and what it does not, five questions opening one at a time", async () => {
  const u = await member("Lina");
  for (const locale of ["ar", "en"]) {
    const L = STRINGS[locale];
    const page = await open("#/sessions", { who: u, locale });
    // reached by keyboard from the fee line of the session choice
    const link = page.locator(".book-pill a.fee-link");
    await link.focus(); await page.keyboard.press("Enter");
    await page.waitForSelector("#fee-faq");
    assert.equal(await text(page.locator("main h1")), L.feeTitle);
    assert.equal(await text(page.locator("#fee-big")), locale === "ar" ? FEE_AR : `QAR ${FEE / 100}`, "the only amount is the real fee");
    assert.deepEqual(await page.locator(".fee-part h2").allInnerTexts(), [L.feeIncl, L.feeExcl]);
    assert.deepEqual(await page.locator(".fee-part:not(.out) li").allInnerTexts(), [L.feeIn1, L.feeIn2, L.feeIn3]);
    assert.deepEqual(await page.locator(".fee-part.out li").allInnerTexts(), [L.feeOut1]);
    assert.deepEqual(await page.locator("#fee-faq summary").allInnerTexts(), [1, 2, 3, 4, 5].map((k) => L[`feeQ${k}`]));
    const answers = await page.locator("#fee-faq details p").evaluateAll((ps) => ps.map((p) => p.textContent.replace(/[⁦-⁩]/g, "")));
    assert.deepEqual(answers, [1, 2, 3, 4, 5].map((k) => L[`feeA${k}`].replace(/[⁦-⁩]/g, "")));
    // no other amount of money anywhere in the page
    const body = (await text(page.locator("main"))).replace(await text(page.locator("#fee-big")), "");
    assert.equal(/ر\.ق|QAR|\d{2,}/.test(body.replace("18", "")), false, body);
    // questions open with the keyboard, one at a time
    const q = page.locator("#fee-faq summary");
    await q.nth(0).focus(); await page.keyboard.press("Enter");
    assert.deepEqual(await page.locator("#fee-faq details").evaluateAll((d) => d.map((x) => x.open)), [true, false, false, false, false]);
    await q.nth(4).focus(); await page.keyboard.press("Enter");
    assert.deepEqual(await page.locator("#fee-faq details").evaluateAll((d) => d.map((x) => x.open)), [false, false, false, false, true]);
    await noSideScroll(page, "fee page");
    await page.locator("#fee-back").click();
    await page.waitForSelector(".book-pill");
    assert.ok(page.url().endsWith("#/sessions"));
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
  // opened directly (no session list seen yet): the fee still comes from the server
  const page = await open("#/fee", { who: u });
  assert.equal(await text(page.locator("#fee-big")), FEE_AR);
  await page.context().close();
});

test("a full session shows the three waitlist steps; the first is marked once she has joined", async () => {
  const u = await member("Wafa");
  for (const locale of ["ar", "en"]) {
    const L = STRINGS[locale];
    const page = await open("#/sessions", { who: u, locale });
    const row = page.locator(`.sess[data-id="${S.full}"]`);
    assert.deepEqual(await row.locator(".wait-steps li").allInnerTexts(), [L.waitStep1, L.waitStep2, L.waitStep3]);
    assert.equal(await row.locator(".wait-steps").evaluate((e) => e.tagName), "OL");
    const joined = locale === "en";   // she joins in the Arabic pass
    assert.equal(await row.locator(".wait-steps li.done").count(), joined ? 1 : 0);
    if (!joined) {
      await row.locator("[data-wait]").click();
      await row.locator(".wait-step").waitFor();
      assert.equal(await text(row.locator(".wait-step")), "أنتِ في قائمة الانتظار (الترتيب 1).", "her real place stays as built");
      assert.deepEqual(await row.locator(".wait-steps li").evaluateAll((ls) => ls.map((l) => l.classList.contains("done"))), [true, false, false]);
      assert.equal(await row.locator(".wait-steps li").first().evaluate((e) => getComputedStyle(e, "::before").backgroundColor), await asColour(page, "--c-primary"));
    }
    // a session with seats has no steps
    assert.equal(await page.locator(`.sess[data-id="${S.roomy}"] .wait-steps`).count(), 0);
    await noSideScroll(page, "sessions");
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }
});

test("the consoles show the companion beside her member and count her seat", async () => {
  const u = await member("Hind");
  await paid(u, S.roomy, { name: "Maryam" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(([t, a]) => { sessionStorage.setItem("qa_token", JSON.stringify(t)); sessionStorage.setItem("qa_admin", JSON.stringify(a)); }, [owner.token, owner.admin]);
  await page.goto(`${env.base}/admin/#/sessions/${S.roomy}`);
  await page.waitForSelector("text=Paid, waiting for matching");
  assert.ok((await text(page.locator("main"))).includes("Hind +1 Maryam"));
  // every seat figure counts her: seats sold, and the pool waiting for matching (two seats from one booking)
  assert.ok((await text(page.locator("main"))).includes(`Seats ${await seats(S.roomy)}/18`));
  const det = (await call("GET", `/api/admin/v1/sessions/${S.roomy}`, { token: owner.token })).body;
  assert.equal(det.pool.reduce((n, p) => n + p.n, 0), 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});
