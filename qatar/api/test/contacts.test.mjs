// Contact requests after a meetup (migration 010): only tablemates, only from the meetup's end for 7 days, a refusal
// or a block is never revealed to the sender, and a WhatsApp link appears only after both agreed.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

const DAY = 86400000;
let env, call, sql;
const U = {};

before(async () => {
  buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql;
  const owner = await adminLogin(call, sql, "owner@example.test");
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 4 * DAY).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
  U.session = s.body.id;
  for (const name of ["فاطمة", "سارة", "هدى", "منى"]) {
    const u = await signUp(call, { name });
    const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: U.session } });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal((await payViaMock(call, await checkoutUrlFor(call, u.token, b.body))).status, 200);
    U[name] = { ...u, booking: b.body.booking_id };
  }
  assert.equal((await call("POST", `/api/admin/v1/sessions/${U.session}/matching:publish`, { token: owner.token, body: { seed: 3 } })).status, 201);
  const det = (await call("GET", `/api/admin/v1/sessions/${U.session}`, { token: owner.token })).body;
  assert.equal(det.tables.length, 1);
  assert.equal((await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:lock`, { token: owner.token })).status, 200);
});
after(async () => { await env.stop(); });

// time travel: the meetup ended `ago` ms before now (every session timestamp moves together)
async function endedAgo(ago) {
  const [s] = await sql`SELECT ends_at FROM app.event_sessions WHERE id = ${U.session}`;
  const shift = Date.now() - ago - new Date(s.ends_at).getTime();
  await sql`UPDATE app.event_sessions SET starts_at = starts_at + ${shift} * interval '1 millisecond', ends_at = ends_at + ${shift} * interval '1 millisecond',
            booking_opens_at = LEAST(booking_opens_at + ${shift} * interval '1 millisecond', now() - interval '30 days'),
            booking_closes_at = booking_closes_at + ${shift} * interval '1 millisecond', lock_at = lock_at + ${shift} * interval '1 millisecond',
            reveal_at = reveal_at + ${shift} * interval '1 millisecond', check_in_opens_at = check_in_opens_at + ${shift} * interval '1 millisecond'
            WHERE id = ${U.session}`;
}

const contacts = async (who) => (await call("GET", `/api/v1/bookings/${U[who].booking}/contacts`, { token: U[who].token })).body;
const rowOf = async (who, other) => (await contacts(who)).members.find((m) => m.display_name === other);
const send = async (from, to) => call("POST", "/api/v1/contact-requests", { token: U[from].token,
  body: { booking_id: U[from].booking, seat: (await rowOf(from, to)).seat } });
const notes = async (who, key) => (await call("GET", "/api/v1/notifications", { token: U[who].token })).body.notifications.filter((n) => n.template_key === key);
const wa = (who) => `https://wa.me/${U[who].phone.slice(1)}`;

test("before the meetup ends: no contacts, and a request is refused", async () => {
  const c = await contacts("فاطمة");
  assert.deepEqual(c, { open: false, closes_at: null, members: [] });
  const r = await call("POST", "/api/v1/contact-requests", { token: U["فاطمة"].token, body: { booking_id: U["فاطمة"].booking, seat: "s_x" } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "CONTACT_WINDOW_CLOSED");
});

test("after it ends: a request is delivered, a refusal is never shown to the sender", async () => {
  await endedAgo(60000);
  const c = await contacts("فاطمة");
  assert.equal(c.open, true);
  assert.deepEqual(c.members.map((m) => m.display_name).sort(), ["سارة", "منى", "هدى"]);
  assert.ok(c.members.every((m) => m.state === "none" && m.can_send && m.whatsapp_url === null && /^s_/.test(m.seat) && !("user_id" in m)));

  const r = await send("فاطمة", "سارة");
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body, { state: "sent", whatsapp_url: null });
  const [note] = await notes("سارة", "CONTACT_REQUEST");
  assert.ok(note && note.text.startsWith("فاطمة ترغب بالتواصل معكِ") && note.booking_id === U["سارة"].booking, JSON.stringify(note));
  const incoming = await rowOf("سارة", "فاطمة");
  assert.equal(incoming.state, "incoming");
  assert.equal(incoming.whatsapp_url, null, "no number before she accepts");

  const again = await send("فاطمة", "سارة");
  assert.equal(again.body.state, "sent", "sending twice changes nothing");
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM app.contact_requests WHERE from_user_id = ${U["فاطمة"].userId} AND to_user_id = ${U["سارة"].userId}`;
  assert.equal(n, 1);

  const dec = await call("POST", `/api/v1/contact-requests/${incoming.request_id}:decline`, { token: U["سارة"].token });
  assert.equal(dec.status, 200);
  assert.equal((await rowOf("فاطمة", "سارة")).state, "sent", "the sender still only sees 'sent'");
  assert.equal((await notes("فاطمة", "CONTACT_ACCEPTED")).length, 0);
  assert.equal((await rowOf("سارة", "فاطمة")).state, "none");
  assert.equal((await call("POST", `/api/v1/contact-requests/${incoming.request_id}:accept`, { token: U["سارة"].token })).body.code, "CONTACT_REQUEST_CLOSED");
});

test("accepting shows each a WhatsApp link to the other, and only the receiver can answer", async () => {
  await send("فاطمة", "هدى");
  const req = await rowOf("هدى", "فاطمة");
  assert.equal((await call("POST", `/api/v1/contact-requests/${req.request_id}:accept`, { token: U["سارة"].token })).status, 404, "not hers to answer");
  const acc = await call("POST", `/api/v1/contact-requests/${req.request_id}:accept`, { token: U["هدى"].token });
  assert.equal(acc.status, 200);
  assert.deepEqual(acc.body, { status: "accepted", whatsapp_url: wa("فاطمة") });
  assert.deepEqual(await rowOf("فاطمة", "هدى"), { ...(await rowOf("فاطمة", "هدى")), state: "connected", whatsapp_url: wa("هدى"), can_send: false });
  assert.equal((await rowOf("هدى", "فاطمة")).whatsapp_url, wa("فاطمة"));
  const [note] = await notes("فاطمة", "CONTACT_ACCEPTED");
  assert.ok(note.text.startsWith("هدى وافقت على التواصل"), note.text);
  assert.equal((await rowOf("سارة", "هدى")).whatsapp_url, null, "others see nothing");
});

test("if both ask each other, they connect at once (also after an earlier refusal)", async () => {
  await send("منى", "سارة");
  const both = await send("سارة", "منى");
  assert.deepEqual(both.body, { state: "connected", whatsapp_url: wa("منى") });
  assert.equal((await rowOf("منى", "سارة")).state, "connected");
  assert.equal((await notes("منى", "CONTACT_ACCEPTED")).length, 1);
  // سارة declined فاطمة earlier; if سارة now asks فاطمة herself, both want it
  const later = await send("سارة", "فاطمة");
  assert.equal(later.body.state, "connected");
  assert.equal((await rowOf("فاطمة", "سارة")).whatsapp_url, wa("سارة"));
});

test("a block is never revealed: the request looks sent but is not delivered, and a connection is hidden", async () => {
  await sql`INSERT INTO app.user_blocks (blocker_user_id, blocked_user_id, source) VALUES (${U["منى"].userId}, ${U["فاطمة"].userId}, 'user')`;
  const r = await send("فاطمة", "منى");
  assert.equal(r.body.state, "sent");
  const [row] = await sql`SELECT delivered FROM app.contact_requests WHERE from_user_id = ${U["فاطمة"].userId} AND to_user_id = ${U["منى"].userId}`;
  assert.equal(row.delivered, false);
  assert.equal((await notes("منى", "CONTACT_REQUEST")).filter((n) => n.text.startsWith("فاطمة")).length, 0);
  assert.equal((await rowOf("منى", "فاطمة")).state, "none");
  await sql`INSERT INTO app.user_blocks (blocker_user_id, blocked_user_id, source) VALUES (${U["هدى"].userId}, ${U["فاطمة"].userId}, 'user')`;
  const hidden = await rowOf("فاطمة", "هدى");
  assert.equal(hidden.whatsapp_url, null, "a later block hides the number");
  assert.notEqual(hidden.state, "connected");
});

test("an unknown seat is refused, and everything closes 7 days after the meetup", async () => {
  const bad = await call("POST", "/api/v1/contact-requests", { token: U["هدى"].token, body: { booking_id: U["هدى"].booking, seat: "s_notatablemate" } });
  assert.equal(bad.status, 422);
  await send("هدى", "سارة");
  const pending = await rowOf("سارة", "هدى");
  assert.equal(pending.state, "incoming");
  await endedAgo(7 * DAY + 60000);
  const c = await contacts("سارة");
  assert.equal(c.open, false);
  assert.ok(c.members.every((m) => !m.can_send && m.state !== "incoming"));
  assert.equal((await rowOf("سارة", "منى")).whatsapp_url, wa("منى"), "an accepted connection stays");
  assert.equal((await call("POST", `/api/v1/contact-requests/${pending.request_id}:accept`, { token: U["سارة"].token })).body.code, "CONTACT_REQUEST_CLOSED");
  const late = await call("POST", "/api/v1/contact-requests", { token: U["هدى"].token, body: { booking_id: U["هدى"].booking, seat: (await rowOf("هدى", "منى")).seat } });
  assert.equal(late.body.code, "CONTACT_WINDOW_CLOSED");
});
