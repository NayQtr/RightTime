// Waitlist offers (migration 021, Notion fix 3, provisional): a seat freed in a full session is kept for the first member
// on the waitlist for WAITLIST_OFFER_HOURS (2 by default, never past the booking close); she is told (inbox and phone),
// sees it in the session list and books and pays within that time. Not taken in time, it passes to the next member;
// with nobody left waiting it goes back on sale. Nobody else can take the kept seat.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

const DAY = 86400000, MIN = 60000;
let env, call, sql, owner;

before(async () => {
  buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql;
  owner = await adminLogin(call, sql, "owner@example.test");
});
after(async () => { await env.stop(); });

// many sign-ups from one test address: older codes are cleared so the per-address hourly limit (20) is not reached
async function member(name, locale = "ar") {
  await sql`DELETE FROM app.otp_challenges`;
  return signUp(call, { name, locale });
}

async function newSession(maxSeats = 4) {
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 5 * DAY).toISOString(), duration_minutes: 120, max_seats: maxSeats, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
  return s.body.id;
}
async function bookAndPay(u, session) {
  const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: session } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal((await payViaMock(call, await checkoutUrlFor(call, u.token, b.body))).status, 200);
  return b.body;
}
async function fullSession(n = 4) {
  const id = await newSession(n);
  const members = [];
  for (let i = 0; i < n; i++) { const u = await member("Sara"); u.booking = await bookAndPay(u, id); members.push(u); }
  return { id, members };
}
const seats = async (id) => (await sql`SELECT seats_sold, max_seats, status FROM app.event_sessions WHERE id = ${id}`)[0];
const entry = async (u, id) => (await sql`SELECT status, offer_expires_at FROM app.waitlist_entries WHERE user_id = ${u.userId} AND session_id = ${id}`)[0];
const listed = async (u, id, locale = "ar") => (await call("GET", "/api/v1/sessions", { token: u.token, locale })).body.sessions.find((s) => s.id === id);
const join = (u, id) => call("POST", `/api/v1/sessions/${id}/waitlist`, { token: u.token });
const cancel = (u) => call("POST", `/api/v1/bookings/${u.booking.booking_id}/cancel`, { token: u.token, body: {} });
// the job that runs every minute (pg_cron); the API also runs it when the session list is opened
const tick = () => sql`SELECT app.release_expired_holds()`;

test("a cancellation offers the seat to the first member waiting for 2 hours; nobody else can take it", async () => {
  const S = await fullSession();
  const [w1, w2, other] = [await member("Hind"), await member("Mona", "en"), await member("Reem")];
  assert.equal((await join(w1, S.id)).status, 201);
  assert.equal((await join(w2, S.id)).status, 201);
  assert.deepEqual((await listed(w2, S.id)).waitlist, { status: "waiting", position: 2, offer_expires_at: null, window_text: null });

  assert.equal((await cancel(S.members[0])).status, 200);
  const e1 = await entry(w1, S.id);
  assert.equal(e1.status, "offered");
  const left = new Date(e1.offer_expires_at).getTime() - Date.now();
  assert.ok(left > 119 * MIN && left <= 120 * MIN, `2 hours (${left / MIN} min)`);
  assert.deepEqual(await seats(S.id), { seats_sold: 4, max_seats: 4, status: "sold_out" }, "the freed seat is kept for her");
  assert.equal((await entry(w2, S.id)).status, "waiting");

  // she is told: inbox (her language), with the session to book; the phone notification is queued on the push channel
  const inbox = (await call("GET", "/api/v1/notifications", { token: w1.token })).body.notifications;
  const n = inbox.find((x) => x.template_key === "WAITLIST_OFFER");
  assert.ok(n, JSON.stringify(inbox));
  assert.equal(n.session_id, S.id);
  assert.equal(n.booking_id, null);
  assert.match(n.text, /^توفر مقعد في .+! أكّدي خلال ساعتين للحجز والدفع\.$/);
  const [q] = await sql`SELECT channel, status FROM app.notifications_outbox WHERE user_id = ${w1.userId} AND template_key = 'WAITLIST_OFFER'`;
  assert.deepEqual(q, { channel: "push", status: "queued" });

  // the session list: bookable for her, still full for everyone else
  const mine = await listed(w1, S.id);
  assert.equal(mine.is_full, false);
  assert.equal(mine.seats_left, 1);
  assert.equal(mine.waitlist.status, "offered");
  assert.equal(mine.waitlist.position, null);
  assert.equal(mine.waitlist.window_text, "ساعتين");
  assert.equal(mine.waitlist.offer_expires_at.slice(0, 16), new Date(new Date(e1.offer_expires_at).getTime() + 3 * 3600000).toISOString().slice(0, 16));
  assert.equal((await listed(other, S.id)).is_full, true);
  const taken = await call("POST", "/api/v1/bookings", { token: other.token, body: { session_id: S.id } });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.code, "SESSION_FULL");

  // she books within the offer: her seat hold runs to the end of the offer; seats unchanged; then she pays
  const b = await call("POST", "/api/v1/bookings", { token: w1.token, body: { session_id: S.id } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(b.body.hold_expires_at.slice(0, 16), mine.waitlist.offer_expires_at.slice(0, 16));
  assert.equal((await entry(w1, S.id)).status, "accepted");
  assert.deepEqual(await seats(S.id), { seats_sold: 4, max_seats: 4, status: "sold_out" });
  assert.equal((await payViaMock(call, await checkoutUrlFor(call, w1.token, b.body))).status, 200);
  assert.equal((await sql`SELECT status FROM app.bookings WHERE id = ${b.body.booking_id}`)[0].status, "paid_awaiting_group");
  assert.equal((await listed(w1, S.id)).waitlist, null);

  // the next freed seat goes to the second member, in her language
  assert.equal((await cancel(S.members[1])).status, 200);
  assert.equal((await entry(w2, S.id)).status, "offered");
  const en = (await call("GET", "/api/v1/notifications", { token: w2.token, locale: "en" })).body.notifications.find((x) => x.template_key === "WAITLIST_OFFER");
  assert.match(en.text, /^A seat opened on .+! Confirm within 2 hours to book and pay\.$/);
  assert.equal((await listed(w2, S.id, "en")).waitlist.window_text, "2 hours");
});

test("an offer not taken in time passes to the next member; with nobody waiting the seat goes back on sale", async () => {
  const S = await fullSession();
  const [w1, w2, other] = [await member("Noor"), await member("Dana"), await member("Lama")];
  await join(w1, S.id); await join(w2, S.id);
  await cancel(S.members[0]);
  assert.equal((await entry(w1, S.id)).status, "offered");
  await sql`UPDATE app.waitlist_entries SET offer_expires_at = now() - interval '1 second' WHERE user_id = ${w1.userId} AND session_id = ${S.id}`;
  const late = await call("POST", "/api/v1/bookings", { token: w1.token, body: { session_id: S.id } });
  assert.equal(late.status, 409, "too late: the seat moved on");
  assert.equal(late.body.code, "SESSION_FULL");
  assert.equal((await entry(w1, S.id)).status, "expired");
  assert.equal((await entry(w2, S.id)).status, "offered");
  assert.deepEqual(await seats(S.id), { seats_sold: 4, max_seats: 4, status: "sold_out" });

  await sql`UPDATE app.waitlist_entries SET offer_expires_at = now() - interval '1 second' WHERE user_id = ${w2.userId} AND session_id = ${S.id}`;
  await listed(other, S.id); // opening the list runs the expiry (as pg_cron does every minute)
  assert.equal((await entry(w2, S.id)).status, "expired");
  assert.deepEqual(await seats(S.id), { seats_sold: 3, max_seats: 4, status: "on_sale" });
  const s = await listed(other, S.id);
  assert.equal(s.is_full, false);
  assert.equal(s.waitlist, null);
  assert.equal((await call("POST", "/api/v1/bookings", { token: other.token, body: { session_id: S.id } })).status, 201);
});

test("a held booking from an offer that is not paid in time frees the seat for the next member", async () => {
  const S = await fullSession();
  const [w1, w2] = [await member("Huda"), await member("Jana")];
  await join(w1, S.id); await join(w2, S.id);
  await cancel(S.members[0]);
  const b = await call("POST", "/api/v1/bookings", { token: w1.token, body: { session_id: S.id } });
  assert.equal(b.status, 201);
  await sql`UPDATE app.bookings SET hold_expires_at = now() - interval '1 second' WHERE id = ${b.body.booking_id}`;
  assert.equal((await tick())[0].release_expired_holds, 1);
  assert.equal((await sql`SELECT status FROM app.bookings WHERE id = ${b.body.booking_id}`)[0].status, "expired");
  assert.equal((await entry(w2, S.id)).status, "offered");
  // giving the seat up ("change session" cancels the held booking) also passes it on
  const b2 = await call("POST", "/api/v1/bookings", { token: w2.token, body: { session_id: S.id } });
  assert.equal(b2.status, 201);
  assert.equal((await call("POST", `/api/v1/bookings/${b2.body.booking_id}/cancel`, { token: w2.token, body: {} })).status, 200);
  assert.deepEqual(await seats(S.id), { seats_sold: 3, max_seats: 4, status: "on_sale" }, "nobody left waiting");
});

test("the offer never runs past the booking close; the hours come from app_config; inactive or booked members are skipped", async () => {
  const S = await fullSession();
  const [w1, w2, w3] = [await member("Asma"), await member("Ruba"), await member("Ola")];
  const booked = S.members[3]; // already has a seat in this session, and joined the waitlist anyway
  for (const u of [w1, booked, w2, w3]) assert.equal((await join(u, S.id)).status, 201);
  await sql`UPDATE app.users SET status = 'suspended' WHERE id = ${w1.userId}`;
  await sql`UPDATE app.event_sessions SET booking_closes_at = now() + interval '45 minutes' WHERE id = ${S.id}`;
  await cancel(S.members[0]);
  assert.equal((await entry(w1, S.id)).status, "waiting", "a suspended account is not offered a seat");
  assert.equal((await entry(booked, S.id)).status, "waiting", "a member already booked on it is skipped");
  const e2 = await entry(w2, S.id);
  assert.equal(e2.status, "offered");
  const [{ closes }] = await sql`SELECT booking_closes_at AS closes FROM app.event_sessions WHERE id = ${S.id}`;
  assert.equal(new Date(e2.offer_expires_at).getTime(), new Date(closes).getTime());
  const n = (await call("GET", "/api/v1/notifications", { token: w2.token })).body.notifications.find((x) => x.template_key === "WAITLIST_OFFER");
  assert.match(n.text, /أكّدي خلال 45 دقيقة للحجز والدفع/);

  // the owner changes the window to 3 hours; the next offer uses it
  await sql`UPDATE app.app_config SET value = '3' WHERE key = 'WAITLIST_OFFER_HOURS'`;
  await sql`UPDATE app.event_sessions SET booking_closes_at = starts_at - interval '1 hour' WHERE id = ${S.id}`;
  await cancel(S.members[1]);
  const e3 = await entry(w3, S.id);
  assert.equal(e3.status, "offered");
  const left = new Date(e3.offer_expires_at).getTime() - Date.now();
  assert.ok(left > 179 * MIN && left <= 180 * MIN, `3 hours (${left / MIN} min)`);
  assert.match((await call("GET", "/api/v1/notifications", { token: w3.token })).body.notifications[0].text, /خلال 3 ساعات/);
  await sql`UPDATE app.app_config SET value = '2' WHERE key = 'WAITLIST_OFFER_HOURS'`;
});
