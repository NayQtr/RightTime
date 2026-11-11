// Website, member booking and meetup screens: the country picker on the phone screen (owner's decision of 11 Nov 2026:
// every country except Israel), 3 days' notice for a celebration (32), the nameless celebration line for tablemates
// (33), the next-step lines after a failed payment, a generic error and a failed refund (13d-2), and the empty
// decisions screen.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signInAgain, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DAY = 86400000;
let env, browser, call, owner;
const S = {};

before(async () => {
  buildTemplate();
  env = await startTestEnv();
  call = client(env.base);
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  owner = await adminLogin(call, env.sql, "owner@example.test");
  for (const [k, days] of [["far", 5], ["near", 2]]) {
    const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
      starts_at: new Date(Date.now() + days * DAY).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
    S[k] = s.body.id;
  }
});
after(async () => { await browser?.close(); await env?.stop(); });

async function newPage(u, locale = "ar") {
  // in tests the API shares the site's origin, so the service worker would answer GETs before page.route sees them
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: "ar-QA", serviceWorkers: "block" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_FAILED|404|422|500/.test(m.text())) errors.push(m.text()); });
  await page.goto(env.base + "/");
  // each browser gets its own sign-in: a refresh token already rotated by an earlier page would end the session
  const tokens = u ? await signInAgain(call, env.sql, u.phone) : null;
  await page.evaluate(([t, l]) => { if (t) localStorage.setItem("q_tokens", JSON.stringify(t)); localStorage.setItem("q_locale", JSON.stringify(l)); }, [tokens, locale]);
  await page.reload();   // the language is read at start; let the first screen finish before moving on
  await page.waitForFunction(() => document.querySelector("main h1") && !document.querySelector("main").hasAttribute("aria-busy"));
  return { page, errors };
}

test("welcome: nothing is said about one country any more", async () => {
  for (const locale of ["ar", "en"]) {
    const { page, errors } = await newPage(null, locale);
    await page.reload();
    await page.waitForSelector(".hero-welcome #start");
    const text = await page.locator("main").innerText();
    assert.ok(!/قطر فقط|Qatar numbers only/.test(text), text);
    const [start, len, have] = await Promise.all(["#start", ".quiz-length", "a[href='#/signin']"].map((s) => page.locator(s).boundingBox()));
    assert.ok(start.y < len.y && len.y < have.y, "the length hint still sits between Start and I have an account");
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});

// Owner's decision (11 Nov 2026): the calling code is one plain dropdown with no label of its own, it lists every
// country except Israel, Qatar is what it starts on, and the number box beside it sends the full E.164 number.
test("phone: the calling code is a dropdown of every country (no Israel), Qatar first, and the full number is sent", async () => {
  for (const [locale, name, number] of [["ar", "المملكة المتحدة", "7700900151"], ["en", "United Kingdom", "7700900152"]]) {
    const { page, errors } = await newPage(null, locale);
    await page.goto(`${env.base}/#/signin`);
    await page.waitForSelector("#cc");
    assert.equal(await page.evaluate(() => document.querySelector("#cc").tagName), "SELECT", "one plain dropdown");
    assert.equal(await page.locator("#cc").inputValue(), "QA", "starts on Qatar");
    assert.equal(await page.locator("#phone").getAttribute("pattern"), "[3-7][0-9]{7}", "Qatar keeps its strict pattern");
    assert.ok((await page.locator("#cc option").count()) > 200, "every country");
    assert.equal(await page.locator('#cc option[value="IL"]').count(), 0, "Israel is not offered");
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#cc option")].filter((o) => o.textContent.includes("+972")).length), 0, "no +972 anywhere");
    // no visible label and no search box: the owner asked for the dropdown alone
    assert.equal(await page.locator("#cc-q, #cc-pop, #cc-none").count(), 0);
    assert.ok((await page.locator("#cc").getAttribute("aria-label")).length > 0, "still named for screen readers");

    await page.selectOption("#cc", "GB");
    assert.equal(await page.locator("#phone").getAttribute("pattern"), "[0-9]{4,15}", "another country takes any plausible number");

    await page.fill("#phone", number);
    await page.click("#send");
    await page.waitForSelector("#code");
    assert.ok((await page.locator("main").innerText()).includes(`+44${number}`), "the full E.164 number was sent");
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});

test("a celebration needs 3 days' notice: the question shows for a far session only, and a late refusal shows the note", async () => {
  S.u = await signUp(call, { name: "جواهر" });
  const { page, errors } = await newPage(S.u);
  await page.goto(`${env.base}/#/sessions`);
  await page.waitForSelector(`input[name=s][value="${S.far}"]`, { state: "attached" });
  const pick = (id) => page.locator(`input[name=s][value="${id}"]`).check({ force: true });
  await pick(S.far);
  assert.equal(await page.locator("#occ").isVisible(), true, "5 days away: the question is offered");
  assert.equal(await page.locator("#occ-note").isHidden(), true);
  await page.locator("input[name=occasion][value=birthday]").check({ force: true });
  await pick(S.near);
  assert.equal(await page.locator("#occ").isHidden(), true, "2 days away: no question");
  assert.equal((await page.locator("#occ-note").innerText()).trim(), "الاحتفال بمناسبة يحتاج إلى حجز قبل 3 أيام على الأقل.");
  assert.equal(await page.locator("input[name=occasion]:checked").getAttribute("value"), "", "the answer goes back to No");
  // the date came closer while she was choosing: the server refuses, the question goes away with the note
  await pick(S.far);
  await page.locator("input[name=occasion][value=birthday]").check({ force: true });
  await page.route("**/api/v1/bookings", (r) => r.request().method() === "POST"
    ? r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ code: "VALIDATION_FAILED", message: "راجعي الإجابات المظللة.", details: [{ field: "occasion", code: "NOTICE_TOO_SHORT", min_notice_hours: 72 }] }) })
    : r.continue(), { times: 1 });
  await page.click("#go");
  await page.waitForSelector("#occ-note:not([hidden])");
  assert.equal(await page.locator("#occ").isHidden(), true);
  assert.equal(await page.locator("#err .banner").count(), 0, "the note explains it; no second message");
  // a far session books with the occasion as before
  await pick(S.near);
  await pick(S.far);
  await page.locator("input[name=occasion][value=birthday]").check({ force: true });
  await page.click("#go");
  await page.waitForSelector("#pay");
  const [b] = await env.sql`SELECT id, occasion FROM app.bookings WHERE session_id = ${S.far} AND user_id = ${S.u.userId}`;
  assert.equal(b.occasion, "birthday");
  S.booking = b.id;
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("revealed table: the other women read a nameless celebration line (cake for a birthday), in both languages", async () => {
  const cases = [["ar", "birthday", "إحدى الضيفات تحتفل بعيد ميلادها"], ["ar", "other", "إحدى الضيفات تحتفل بمناسبة خاصة"],
    ["en", "birthday", "One of the guests is celebrating her birthday"], ["ar", null, null]];
  for (const [locale, kind, text] of cases) {
    const { page, errors } = await newPage(S.u, locale);
    // the API side is covered in celebrations.test.mjs; here the screen draws what event-details returns once revealed
    await page.route("**/event-details", async (r) => {
      const res = await r.fetch();
      const e = await res.json();
      e.reveal.phase = "revealed";
      e.table = { confirmed_count: 5, capacity: 6, code: "K7Q2", shared_themes: [], celebration: kind };
      await r.fulfill({ response: res, json: e });
    });
    await page.goto(`${env.base}/#/booking/${S.booking}`);
    await page.waitForSelector(".table-figure");
    if (!kind) { assert.equal(await page.locator("#celebration").count(), 0, "no line when nobody else celebrates"); }
    else {
      assert.equal((await page.locator("#celebration").innerText()).trim(), text);
      assert.equal(await page.locator("#celebration svg").count(), 1, "with its icon");
    }
    if (kind === "birthday" && locale === "ar") {
      const cake = await page.evaluate(() => import("/icons.js").then((m) => { const d = document.createElement("div"); d.innerHTML = m.icon("cake"); return d.firstElementChild.outerHTML; }));
      assert.equal(await page.locator("#celebration svg").evaluate((s) => s.outerHTML), cake, "the existing cake icon");
    }
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});

test("next steps: failed payment (pay-return and review), generic error, failed refund", async () => {
  const u = await signUp(call, { name: "شيخة" });
  const bk = (await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: S.far } })).body;
  assert.equal((await payViaMock(call, await checkoutUrlFor(call, u.token, bk), "declined")).status, 200);
  const { page, errors } = await newPage(u);
  await page.goto(`${env.base}/#/pay/return/${bk.booking_id}`);
  await page.waitForSelector("#pay-next");
  assert.equal((await page.locator("#pay-next").innerText()).trim(), "يمكنكِ المحاولة مرة أخرى ما دام المقعد محجوزًا. لن تُخصم مرتين.");
  await page.goto(`${env.base}/#/booking/${bk.booking_id}/review`);
  await page.waitForSelector(".banner-warning");
  assert.ok((await page.locator(".banner-warning").innerText()).includes("لم يكتمل الدفع. يمكنكِ المحاولة مرة أخرى ما دام المقعد محجوزًا."));
  // the generic error (the server's INTERNAL message is the same words) gets its next step; other messages do not
  await page.route("**/api/v1/sessions", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "INTERNAL", message: "حدث خطأ. حاولي مرة أخرى." }) }), { times: 1 });
  await page.goto(`${env.base}/#/sessions`);
  await page.waitForSelector("main .banner-danger");
  assert.equal((await page.locator("main .banner-danger").innerText()).trim(), "حدث خطأ. حاولي مرة أخرى. إن تكرّر الخطأ، تواصلي معنا.");
  await page.route("**/api/v1/sessions", (r) => r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ code: "BUDGET_CONFLICT", message: "لا يوجد مكان ضمن ميزانيتك لهذا الموعد." }) }), { times: 1 });
  await page.goto(`${env.base}/#/profile`); await page.waitForSelector("main:not([aria-busy]) h1.display-title");   // a screen that does not load sessions
  await page.goto(`${env.base}/#/sessions`);
  await page.waitForSelector("main .banner-danger");
  assert.equal((await page.locator("main .banner-danger").innerText()).trim(), "لا يوجد مكان ضمن ميزانيتك لهذا الموعد.");
  // a refund that failed: the team's promise under the status
  await page.route("**/event-details", async (r) => {
    const res = await r.fetch();
    const e = await res.json();
    e.reveal.phase = "cancelled"; e.booking.status = "cancelled_by_user"; e.refund = { status: "failed" }; e.resolution = undefined;
    await r.fulfill({ response: res, json: e });
  });
  await page.goto(`${env.base}/#/booking/${bk.booking_id}`);
  await page.waitForSelector("#rf-next");
  assert.equal((await page.locator("#rf-next").innerText()).trim(), "سيتواصل معكِ فريقنا خلال يوم عمل.");
  assert.deepEqual(errors, []);
  await page.context().close();
});

test("decisions: the empty screen uses the app's text, only when the load worked", async () => {
  const u = await signUp(call, { name: "عائشة" });
  for (const [locale, text] of [["ar", "لا توجد قرارات تخصّك."], ["en", "There are no decisions about you."]]) {
    const { page, errors } = await newPage(u, locale);
    await page.goto(`${env.base}/#/cases`);
    await page.waitForSelector("#no-cases");
    assert.equal((await page.locator("#no-cases").innerText()).trim(), text);
    await page.route("**/api/v1/cases/mine", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "INTERNAL", message: "x" }) }));
    await page.goto(`${env.base}/#/profile`); await page.waitForSelector("main:not([aria-busy]) h1.display-title");
    await page.goto(`${env.base}/#/cases`);
    await page.waitForSelector("#retry-load");
    assert.equal(await page.locator("#no-cases").count(), 0, "a failed load never says there are no decisions");
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});
