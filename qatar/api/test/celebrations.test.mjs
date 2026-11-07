// Celebration meetups (migration 018, questionnaire QA-2026-05): a member says at booking that the date is for an
// occasion; the coordinator gets one support case with the booking; matching never seats her with a woman who
// prefers meetups without celebrations (Q25), and an unknown occasion is refused.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

const DAY = 86400000;
let env, call, sql, owner;
const U = {};

async function book(u, body) {
  const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: U.session, ...body } });
  return b;
}

before(async () => {
  buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql;
  owner = await adminLogin(call, sql, "owner@example.test");
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 5 * DAY).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
  U.session = s.body.id;
});
after(async () => { await env.stop(); });

test("Q25 is in the published questionnaire with the approved wording", async () => {
  U.sara = await signUp(call, { name: "سارة", extra: { Q25: ["love_to_join"] } });
  assert.equal(U.sara.submit.status, 201, JSON.stringify(U.sara.submit.body));
  const q = U.sara.questionnaire;
  const q25 = q.questions.find((x) => x.key === "Q25");
  assert.ok(q25, "Q25 present");
  assert.equal(q25.text, "كيف تشعرين لو صادف اللقاء احتفالًا بمناسبة إحدى الحاضرات، مثل عيد ميلاد؟");
  assert.deepEqual(q25.options.map((o) => o.label), ["أحب أن أشارك في الاحتفال", "لا مانع عندي", "أفضّل لقاءً بدون احتفالات"]);
});

test("an unknown occasion is refused; a birthday opens one coordinator case with the booking", async () => {
  const bad = await book(U.sara, { occasion: "wedding" });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.details[0].field, "occasion");
  const ok = await book(U.sara, { occasion: "birthday" });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  U.sara.booking = ok.body;
  const [b] = await sql`SELECT occasion FROM app.bookings WHERE id = ${ok.body.booking_id}`;
  assert.equal(b.occasion, "birthday");
  const cases = await sql`SELECT type, status FROM app.support_cases WHERE booking_id = ${ok.body.booking_id}`;
  assert.deepEqual(cases.map((c) => [c.type, c.status]), [["occasion_celebration", "new"]]);
  assert.equal((await book(U.sara, { occasion: "birthday" })).status, 409, "one booking per session; no second case");
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.support_cases WHERE booking_id = ${ok.body.booking_id}`)[0].n, 1);
  const list = (await call("GET", "/api/admin/v1/support-cases", { token: owner.token })).body.cases;
  const mine = list.find((c) => c.type === "occasion_celebration");
  assert.equal(mine.occasion, "birthday");
  assert.equal(mine.booking_ref, ok.body.ref);
  assert.equal(mine.experience, "dinner");
  assert.ok(mine.starts_at);
});

test("no occasion: nothing is stored and no case is opened", async () => {
  U.huda = await signUp(call, { name: "هدى", extra: { Q25: ["dont_mind"] } });
  const r = await book(U.huda, {});
  assert.equal(r.status, 201);
  U.huda.booking = r.body;
  const [b] = await sql`SELECT occasion FROM app.bookings WHERE id = ${r.body.booking_id}`;
  assert.equal(b.occasion, null);
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.support_cases WHERE booking_id = ${r.body.booking_id}`)[0].n, 0);
});

test("matching: the celebrant never shares a table with a woman who prefers no celebrations", async () => {
  // five more paid members: one prefers no celebrations, one never answered Q25, three are happy to join
  const more = [["منى", ["prefer_none"]], ["ليلى", null], ["نورة", ["love_to_join"]], ["ريم", ["dont_mind"]], ["أمل", ["love_to_join"]]];
  for (const [name, q25] of more) {
    const u = await signUp(call, { name, extra: q25 ? { Q25: q25 } : {} });
    const r = await book(u, {});
    assert.equal(r.status, 201, JSON.stringify(r.body));
    U[name] = { ...u, booking: r.body };
  }
  for (const u of [U.sara, U.huda, ...more.map(([n]) => U[n])])
    assert.equal((await payViaMock(call, await checkoutUrlFor(call, u.token, u.booking))).status, 200);
  const input = (await sql`SELECT app.matching_input(${U.session}) AS i`)[0].i;
  assert.equal(input.bookings.find((b) => b.booking_id === U.sara.booking.booking_id).occasion, "birthday");
  const seat = (seed, booking) => "P-" + createHash("sha256").update(`${seed}:${booking.booking_id}`).digest("hex").slice(0, 8);
  let together = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const dry = await call("POST", `/api/admin/v1/sessions/${U.session}/matching:dry-run`, { token: owner.token, body: { seed } });
    assert.equal(dry.status, 200, JSON.stringify(dry.body));
    const table = dry.body.explanations.tables.find((t) => t.seats.includes(seat(seed, U.sara.booking)));
    if (!table) continue;                      // she may be the one left over; never seated with them
    together++;
    assert.ok(!table.seats.includes(seat(seed, U["منى"].booking)), `seed ${seed}: prefers no celebrations`);
    assert.ok(!table.seats.includes(seat(seed, U["ليلى"].booking)), `seed ${seed}: never answered Q25`);
    assert.ok(table.seats.length >= 4);
  }
  assert.ok(together > 0, "the celebrant is seated in at least one run");
});
