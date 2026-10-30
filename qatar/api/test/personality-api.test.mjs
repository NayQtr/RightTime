// r2-personality end to end: the admin default seats two clearly different profiles at separate tables with balanced
// energy, stores the shared-themes line, shows it to members only after reveal, and clears it after a manual move.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const SHOTS = process.env.UI_SHOTS || path.join(os.tmpdir(), "rightime-ui-shots");

const DAY = 86400000;
let env, call, sql, owner;
const U = [];

const A = { Q13: ["logic"], Q21: ["s5"], Q22: ["s5"], Q14: ["intelligent"], Q15: ["intelligent"], Q17: ["documentary"], Q09: ["conversations"],
  Q18: ["smart"], Q19: ["deep_talk"], Q20: ["calm"], Q16: ["finance"], Q23: ["yes"], Q24: ["married"] };
const B = { Q13: ["emotions"], Q21: ["s1"], Q22: ["s1"], Q14: ["funny"], Q15: ["funny"], Q17: ["comedy"], Q09: ["get_out"],
  Q18: ["playful"], Q19: ["games"], Q20: ["energized"], Q16: ["student"], Q23: ["no"], Q24: ["single"] };
const LEVELS = ["introvert", "ambivert", "extrovert"];
const NAMES = ["Amal", "Basma", "Dana", "Farah", "Hind", "Jana", "Lama", "Maha", "Nada", "Rana", "Salma", "Wafa"];

before(async () => {
  buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql;
  owner = await adminLogin(call, sql, "owner@example.test");
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 4 * DAY).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
  U.session = s.body.id;
  for (let i = 0; i < 11; i++) {
    const profile = i % 2 ? "B" : "A";
    const u = await signUp(call, { name: NAMES[i], locale: i === 0 ? "en" : "ar", topics: profile === "A" ? ["books_culture", "tech"] : ["music", "gaming"],
      age: profile === "A" ? "age_35_44" : "age_18_24", extra: { ...(profile === "A" ? A : B), Q12: [LEVELS[Math.floor(i / 2) % 3]] } });
    assert.equal(u.submit.status, 201, JSON.stringify(u.submit.body));
    const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: U.session } });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal((await payViaMock(call, await checkoutUrlFor(call, u.token, b.body))).status, 200);
    U.push({ ...u, profile, booking: b.body.booking_id });
  }
});
after(async () => { await env.stop(); });

const profileOf = (bookingId) => U.find((u) => u.booking === bookingId).profile;

test("matching_input carries every answer and the published questionnaire's option keys", async () => {
  const [{ input }] = await sql`SELECT app.matching_input(${U.session}) AS input`;
  assert.equal(input.bookings.length, 11);
  const first = input.bookings.find((b) => b.booking_id === U[0].booking);
  assert.deepEqual(first.answers.Q24, ["married"]);
  assert.deepEqual(first.answers.Q05, ["books_culture", "tech"]);
  assert.ok(input.questionnaire.Q12.includes("ambivert") && input.questionnaire.Q21.includes("s5"));
});

test("the default rule is r2-personality: profiles at separate tables, energies balanced, weights recorded", async () => {
  const dry = await call("POST", `/api/admin/v1/sessions/${U.session}/matching:dry-run`, { token: owner.token, body: { seed: 5 } });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.rule_version, "r2-personality");
  assert.equal(dry.body.explanations.algorithm, "personality_v1");
  assert.deepEqual(dry.body.explanations.weights.dimensions, { values: 0.32, personality: 0.28, social: 0.18, interests: 0.12, lifestyle: 0.1 });
  assert.equal(dry.body.explanations.answers_dropped, 0);
  const pub = await call("POST", `/api/admin/v1/sessions/${U.session}/matching:publish`, { token: owner.token, body: { seed: 5 } });
  assert.equal(pub.status, 201, JSON.stringify(pub.body));
  assert.equal(pub.body.inputs_hash, dry.body.inputs_hash);
  const det = (await call("GET", `/api/admin/v1/sessions/${U.session}`, { token: owner.token })).body;
  assert.equal(det.tables.length, 2);
  for (const t of det.tables) {
    assert.equal(new Set(t.members.map((m) => profileOf(m.booking_id))).size, 1, `${t.code || t.table_code} mixes profiles`);
  }
  for (const e of pub.body.explanations.tables) assert.equal(e.energy_balance, 1);
  U.tables = det.tables;
});

test("themes are stored, hidden before reveal, shown after in the member's language, never sensitive", async () => {
  const rows = await sql`SELECT match_themes FROM app.event_tables WHERE session_id = ${U.session}`;
  for (const r of rows) {
    assert.ok(r.match_themes.length >= 1 && r.match_themes.length <= 3);
    for (const th of r.match_themes) assert.ok(!["Q11", "Q16", "Q21", "Q22", "Q23", "Q24", "Q12"].includes(th.q), th.q);
  }
  for (const t of U.tables) assert.equal((await call("POST", `/api/admin/v1/tables/${t.id}:lock`, { token: owner.token })).status, 200);
  const locked = (await call("GET", `/api/v1/bookings/${U[1].booking}/event-details`, { token: U[1].token })).body;
  assert.equal(locked.reveal.phase, "locked");
  assert.equal(locked.table.shared_themes, undefined, "nothing before reveal");
  // time travel: move every session timestamp together so reveal_at was a minute ago
  const [ss] = await sql`SELECT reveal_at FROM app.event_sessions WHERE id = ${U.session}`;
  const shift = Date.now() - 60000 - new Date(ss.reveal_at).getTime();
  await sql`UPDATE app.event_sessions SET starts_at = starts_at + ${shift} * interval '1 millisecond', ends_at = ends_at + ${shift} * interval '1 millisecond',
            booking_opens_at = LEAST(booking_opens_at + ${shift} * interval '1 millisecond', now() - interval '30 days'),
            booking_closes_at = booking_closes_at + ${shift} * interval '1 millisecond', lock_at = lock_at + ${shift} * interval '1 millisecond',
            reveal_at = reveal_at + ${shift} * interval '1 millisecond', check_in_opens_at = check_in_opens_at + ${shift} * interval '1 millisecond'
            WHERE id = ${U.session}`;
  assert.equal((await call("POST", `/api/admin/v1/sessions/${U.session}:reveal`, { token: owner.token })).status, 200);
  const ar = (await call("GET", `/api/v1/bookings/${U[1].booking}/event-details`, { token: U[1].token })).body;
  assert.equal(ar.reveal.phase, "revealed");
  assert.deepEqual(ar.table.shared_themes, ["ألعاب إلكترونية", "موسيقى", "ضحك وألعاب"], "interests first, then the ideal evening");
  const en = (await call("GET", `/api/v1/bookings/${U[0].booking}/event-details`, { token: U[0].token, locale: "en" })).body;
  assert.deepEqual(en.table.shared_themes, ["Reading & culture", "Tech & innovation", "Deep conversation over coffee"]);
  // the member's event screen shows the line
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-QA" })).newPage();
    await page.goto(env.base + "/");
    await page.evaluate((t) => { localStorage.setItem("q_tokens", JSON.stringify(t)); }, { access_token: U[1].token, refresh_token: U[1].refresh });
    await page.goto(`${env.base}/#/booking/${U[1].booking}`);
    const line = page.locator(".shared-themes");
    await line.waitFor();
    assert.equal((await line.textContent()).trim(), "يجمعكن: ألعاب إلكترونية، موسيقى، ضحك وألعاب");
    await page.screenshot({ path: `${SHOTS}/22-shared-themes-ar.png`, fullPage: true });
  } finally { await browser.close(); }
});

test("a manual move clears the themes of both tables", async () => {
  const det = (await call("GET", `/api/admin/v1/sessions/${U.session}`, { token: owner.token })).body;
  const t2 = det.tables.find((t) => t.members.length === 5), t1 = det.tables.find((t) => t.members.length === 6);
  await sql`UPDATE app.event_tables SET status = 'forming' WHERE id = ${t2.id}`;   // setup: moves need an open table with a free seat
  const mv = await call("POST", `/api/admin/v1/bookings/${t1.members[0].booking_id}:move`, { token: owner.token, body: { to_table_id: t2.id, reason: "ops_balance" } });
  assert.equal(mv.status, 200, JSON.stringify(mv.body));
  const rows = await sql`SELECT match_themes FROM app.event_tables WHERE id IN (${t1.id}, ${t2.id})`;
  assert.ok(rows.every((r) => r.match_themes === null));
  const stayed = U.find((u) => u.booking === t1.members[1].booking_id);   // still at the revealed table she left
  const after = (await call("GET", `/api/v1/bookings/${stayed.booking}/event-details`, { token: stayed.token })).body;
  assert.equal(after.reveal.phase, "revealed");
  assert.deepEqual(after.table.shared_themes, []);
});
