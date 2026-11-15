// "+1" (migration 026, owner's decision of 14 Nov 2026): a member may bring one companion. One booking holds two seats,
// the amount is the organising fee x 2, both seats cancel together with one refund of the whole amount, and everything
// that counts seats counts both. qatar/docs/decisions/2026-11-14-plus-one.md.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

const DAY = 86400000;
let env, call, sql, owner, ops, FEE;

before(async () => {
  buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql;
  owner = await adminLogin(call, sql, "owner@example.test");
  ops = await adminLogin(call, sql, "ops.oncall@example.test");
});
after(async () => { await env.stop(); });

async function member(name = "Sara", locale = "ar") {
  await sql`DELETE FROM app.otp_challenges`;
  return signUp(call, { name, locale });
}
async function newSession(maxSeats = 6, ahead = 5 * DAY) {
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + ahead).toISOString(), duration_minutes: 120, max_seats: maxSeats, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
  return s.body.id;
}
const book = (u, session, guest) => call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: session, ...(guest === undefined ? {} : { guest }) } });
async function bookAndPay(u, session, guest) {
  const b = await book(u, session, guest);
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal((await payViaMock(call, await checkoutUrlFor(call, u.token, b.body))).status, 200);
  return b.body;
}
const seats = async (id) => (await sql`SELECT seats_sold, max_seats, status FROM app.event_sessions WHERE id = ${id}`)[0];
const listed = async (u, id) => (await call("GET", "/api/v1/sessions", { token: u.token })).body.sessions.find((s) => s.id === id);
const tick = () => sql`SELECT app.release_expired_holds()`;
// the invariant behind every test: seats_sold = seats of the live bookings + seats kept for waitlist offers
async function assertExact(id) {
  const [{ held }] = await sql`SELECT COALESCE(sum(seats), 0)::int AS held FROM app.bookings WHERE session_id = ${id}
                                AND status NOT IN ('cancelled_by_user','cancelled_by_organizer','expired','payment_failed')`;
  const [{ offered }] = await sql`SELECT count(*)::int AS offered FROM app.waitlist_entries WHERE session_id = ${id} AND status = 'offered'`;
  const s = await seats(id);
  assert.equal(s.seats_sold, held + offered, "seats_sold is exact");
  assert.ok(s.seats_sold <= s.max_seats, "never oversold");
}

test("a booking with a companion: two seats, double amount, shown everywhere; cancelling frees both and refunds the whole amount once", async () => {
  const S = await newSession(6);
  const u = await member("Noura");
  const before1 = await listed(u, S);
  assert.equal(before1.plus_one_available, true);
  FEE = before1.price.amount_minor;

  const b = await book(u, S, { name: "  Maryam   Al Thani " });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(b.body.seats, 2);
  assert.equal(b.body.guest_name, "Maryam Al Thani");
  assert.equal(b.body.unit_fee_minor, FEE);
  assert.equal(b.body.amount.amount_minor, FEE * 2);
  assert.equal(b.body.plus_one_available, true);
  assert.equal((await seats(S)).seats_sold, 2);
  const [pay] = await sql`SELECT amount_minor FROM app.payments WHERE booking_id = ${b.body.booking_id}`;
  assert.equal(pay.amount_minor, FEE * 2, "the payment is created by the server for the total");

  const review = (await call("GET", `/api/v1/bookings/${b.body.booking_id}`, { token: u.token })).body;
  assert.deepEqual([review.seats, review.guest_name, review.unit_fee_minor, review.amount.amount_minor], [2, "Maryam Al Thani", FEE, FEE * 2]);
  const co = await call("POST", `/api/v1/bookings/${b.body.booking_id}/checkout`, { token: u.token, body: {} });
  assert.deepEqual([co.body.seats, co.body.guest_name, co.body.unit_fee_minor, co.body.amount.amount_minor], [2, "Maryam Al Thani", FEE, FEE * 2]);

  assert.equal((await payViaMock(call, b.body.checkout_url)).status, 200);
  const d = (await call("GET", `/api/v1/bookings/${b.body.booking_id}/event-details`, { token: u.token })).body;
  assert.equal(d.booking.status, "paid_awaiting_group");
  assert.deepEqual([d.booking.seats, d.booking.guest_name, d.booking.unit_fee_minor, d.payment.amount.amount_minor], [2, "Maryam Al Thani", FEE, FEE * 2]);
  const mine = (await call("GET", "/api/v1/bookings", { token: u.token })).body.bookings.find((x) => x.id === b.body.booking_id);
  assert.deepEqual([mine.seats, mine.guest_name, mine.unit_fee_minor, mine.amount.amount_minor], [2, "Maryam Al Thani", FEE, FEE * 2]);
  assert.equal((await listed(u, S)).plus_one_available, false, "she is already booked");
  // her data export carries the companion's name
  const exp = (await call("GET", "/api/v1/users/me/export", { token: u.token })).body;
  const eb = exp.bookings.find((x) => x.booking_ref === b.body.ref);
  assert.deepEqual([eb.seats, eb.companion_name, eb.fee.amount_minor], [2, "Maryam Al Thani", FEE * 2]);

  const c = await call("POST", `/api/v1/bookings/${b.body.booking_id}/cancel`, { token: u.token, body: {} });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.refund.amount.amount_minor, FEE * 2);
  const refunds = await sql`SELECT amount_minor, status FROM app.refunds WHERE booking_id = ${b.body.booking_id}`;
  assert.deepEqual(refunds.map((r) => [r.amount_minor, r.status]), [[FEE * 2, "refunded"]], "one refund of the whole amount");
  assert.equal((await sql`SELECT status FROM app.payments WHERE booking_id = ${b.body.booking_id}`)[0].status, "refunded");
  assert.equal((await seats(S)).seats_sold, 0, "both seats are free again");
  // cancelling again changes nothing
  assert.equal((await call("POST", `/api/v1/bookings/${b.body.booking_id}/cancel`, { token: u.token, body: {} })).status, 409);
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.refunds WHERE booking_id = ${b.body.booking_id}`)[0].n, 1);
  await assertExact(S);
});

test("a booking without a companion is as before: one seat, guest_name null, unit fee = amount", async () => {
  const S = await newSession(6);
  const u = await member();
  for (const guest of [undefined, null]) {
    const b = await book(u, S, guest);
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.deepEqual([b.body.seats, b.body.guest_name, b.body.unit_fee_minor, b.body.amount.amount_minor], [1, null, FEE, FEE]);
    assert.equal((await seats(S)).seats_sold, 1);
    assert.equal((await call("POST", `/api/v1/bookings/${b.body.booking_id}/cancel`, { token: u.token, body: {} })).status, 200);
  }
});

test("the companion's name is required: empty, missing or longer than 60 characters is refused and takes no seat", async () => {
  const S = await newSession(6);
  const u = await member();
  for (const guest of [{ name: "" }, { name: "   " }, {}, { name: 7 }, "Maryam", { name: "م".repeat(61) }]) {
    const r = await book(u, S, guest);
    assert.equal(r.status, 422, JSON.stringify(guest));
    assert.equal(r.body.code, "GUEST_NAME_REQUIRED");
  }
  assert.equal((await call("POST", "/api/v1/bookings", { token: u.token, locale: "en", body: { session_id: S, guest: { name: "" } } })).body.message, "Please write your companion's name.");
  assert.equal((await seats(S)).seats_sold, 0);
  const ok = await book(u, S, { name: "م".repeat(60) });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.guest_name.length, 60);
  // the database refuses a companion without a second seat, and a second seat without a companion
  await assert.rejects(sql`UPDATE app.bookings SET guest_name = NULL WHERE id = ${ok.body.booking_id}`, /bookings_guest_name_chk/);
  await assert.rejects(sql`UPDATE app.bookings SET seats = 3 WHERE id = ${ok.body.booking_id}`, /bookings_seats_chk/);
});

test("one seat left: +1 is refused with NOT_ENOUGH_SEATS, and a single seat can still be booked", async () => {
  const S = await newSession(4);
  for (const n of ["A", "B", "C"]) await bookAndPay(await member(n), S);
  const u = await member("Dana");
  const l = await listed(u, S);
  assert.deepEqual([l.seats_left, l.is_full, l.plus_one_available], [1, false, false]);
  const r = await book(u, S, { name: "Maryam" });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "NOT_ENOUGH_SEATS");
  assert.equal(r.body.message, "لا يتوفر مقعدان في هذا الموعد.");
  assert.equal((await seats(S)).seats_sold, 3);
  // the database function refuses it as well (the API check is not the only guard)
  const [resp] = await sql`SELECT id FROM app.questionnaire_responses WHERE user_id = ${u.userId} AND status = 'submitted'`;
  const [tier] = await sql`SELECT id FROM app.budget_tiers ORDER BY rank LIMIT 1`;
  await assert.rejects(sql`SELECT app.hold_seat(${u.userId}, ${S}, ${tier.id}, ${resp.id}, '{}'::uuid[], NULL, 10, 'Maryam')`, (e) => e.code === "P0013");
  const one = await book(u, S);
  assert.equal(one.status, 201);
  assert.deepEqual([(await seats(S)).seats_sold, (await seats(S)).status], [4, "sold_out"]);
  // a full session answers SESSION_FULL, with or without a companion
  const late = await member("Eman");
  assert.equal((await book(late, S, { name: "Maryam" })).body.code, "SESSION_FULL");
  await assertExact(S);
});

test("a two-seat hold that expires frees two seats, and both go to the waitlist", async () => {
  const S = await newSession(4);
  await bookAndPay(await member("A"), S);
  await bookAndPay(await member("B"), S);
  const u = await member("Hold");
  const b = await book(u, S, { name: "Maryam" });
  assert.equal(b.status, 201);
  assert.deepEqual([(await seats(S)).seats_sold, (await seats(S)).status], [4, "sold_out"]);
  const [w1, w2, w3] = [await member("Wafa"), await member("Widad"), await member("Wijdan")];
  for (const w of [w1, w2, w3]) assert.equal((await call("POST", `/api/v1/sessions/${S}/waitlist`, { token: w.token })).status, 201);
  await sql`UPDATE app.bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ${b.body.booking_id}`;
  await tick();
  assert.equal((await sql`SELECT status FROM app.bookings WHERE id = ${b.body.booking_id}`)[0].status, "expired");
  const offered = await sql`SELECT user_id FROM app.waitlist_entries WHERE session_id = ${S} AND status = 'offered'`;
  assert.deepEqual(offered.map((o) => o.user_id).sort(), [w1.userId, w2.userId].sort(), "two freed seats, two offers");
  assert.equal((await seats(S)).seats_sold, 4, "both seats are kept for the two members offered");
  await assertExact(S);
  // without anyone waiting, the two seats simply go back on sale
  const T = await newSession(4);
  const t = await book(u, T, { name: "Maryam" });
  await sql`UPDATE app.bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ${t.body.booking_id}`;
  await tick();
  assert.deepEqual([(await seats(T)).seats_sold, (await seats(T)).status], [0, "on_sale"]);
});

test("a seat kept from the waitlist takes a companion only when a second seat is free", async () => {
  const S = await newSession(4);
  const first = [];
  for (const n of ["A", "B", "C", "D"]) { const m = await member(n); m.booking = await bookAndPay(m, S); first.push(m); }
  const w = await member("Waiting");
  assert.equal((await call("POST", `/api/v1/sessions/${S}/waitlist`, { token: w.token })).status, 201);
  assert.equal((await call("POST", `/api/v1/bookings/${first[0].booking.booking_id}/cancel`, { token: first[0].token, body: {} })).status, 200);
  let l = await listed(w, S);
  assert.deepEqual([l.waitlist.status, l.is_full, l.plus_one_available], ["offered", false, false]);
  const r = await book(w, S, { name: "Maryam" });
  assert.deepEqual([r.status, r.body.code], [409, "NOT_ENOUGH_SEATS"]);
  assert.equal((await sql`SELECT status FROM app.waitlist_entries WHERE user_id = ${w.userId} AND session_id = ${S}`)[0].status, "offered", "her offer is still hers");
  // a second seat frees up: now she can bring her companion
  assert.equal((await call("POST", `/api/v1/bookings/${first[1].booking.booking_id}/cancel`, { token: first[1].token, body: {} })).status, 200);
  l = await listed(w, S);
  assert.equal(l.plus_one_available, true);
  const ok = await book(w, S, { name: "Maryam" });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.seats, 2);
  assert.deepEqual([(await seats(S)).seats_sold, (await seats(S)).status], [4, "sold_out"]);
  await assertExact(S);
});

test("concurrent requests never oversell: five seats, six members ask for two seats each at the same moment", async () => {
  const S = await newSession(5);
  const members = [];
  for (let i = 0; i < 6; i++) members.push(await member(["Maha", "Mona", "Muna", "Mariam", "Maysa", "Malak"][i]));
  const results = await Promise.all(members.map((m) => book(m, S, { name: "Maryam" })));
  const okN = results.filter((r) => r.status === 201).length;
  assert.equal(okN, 2, results.map((r) => `${r.status} ${r.body.code || ""}`).join(", "));
  for (const r of results.filter((x) => x.status !== 201)) assert.equal(r.body.code, "NOT_ENOUGH_SEATS");
  assert.equal((await seats(S)).seats_sold, 4);
  await assertExact(S);
  // the last seat: three single requests at once, one wins
  const singles = await Promise.all(members.filter((m, i) => results[i].status !== 201).slice(0, 3).map((m) => book(m, S)));
  assert.equal(singles.filter((r) => r.status === 201).length, 1);
  assert.deepEqual([(await seats(S)).seats_sold, (await seats(S)).status], [5, "sold_out"]);
  await assertExact(S);
});

test("review step: the companion is added, renamed and removed on an unpaid booking; the amount to pay follows", async () => {
  const S = await newSession(4);
  const u = await member("Review");
  const b = (await book(u, S)).body;
  const guest = (g, token = u.token) => call("POST", `/api/v1/bookings/${b.booking_id}/guest`, { token, body: { guest: g } });
  const add = await guest({ name: "Maryam" });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  assert.deepEqual([add.body.seats, add.body.guest_name, add.body.unit_fee_minor, add.body.amount.amount_minor], [2, "Maryam", FEE, FEE * 2]);
  assert.equal(add.body.checkout_url, b.checkout_url, "the same payment, with the new amount");
  assert.equal((await seats(S)).seats_sold, 2);
  assert.equal((await sql`SELECT amount_minor FROM app.payments WHERE booking_id = ${b.booking_id}`)[0].amount_minor, FEE * 2);
  const ren = await guest({ name: "Mariam" });
  assert.deepEqual([ren.body.seats, ren.body.guest_name, (await seats(S)).seats_sold], [2, "Mariam", 2]);
  assert.equal((await guest({ name: "" })).body.code, "GUEST_NAME_REQUIRED");
  assert.equal((await call("POST", `/api/v1/bookings/${b.booking_id}/guest`, { token: u.token, body: {} })).status, 422);
  const other = await member("Other");
  assert.equal((await guest({ name: "X" }, other.token)).status, 404, "not her booking");
  const off = await guest(null);
  assert.deepEqual([off.body.seats, off.body.guest_name, off.body.amount.amount_minor, (await seats(S)).seats_sold], [1, null, FEE, 1]);
  assert.equal((await sql`SELECT amount_minor FROM app.payments WHERE booking_id = ${b.booking_id}`)[0].amount_minor, FEE);
  // no second seat left: refused, nothing changes
  for (const n of ["A", "B", "C"]) await bookAndPay(await member(n), S);
  const none = await guest({ name: "Maryam" });
  assert.deepEqual([none.status, none.body.code], [409, "NOT_ENOUGH_SEATS"]);
  assert.equal((await call("GET", `/api/v1/bookings/${b.booking_id}`, { token: u.token })).body.plus_one_available, false);
  assert.equal((await seats(S)).seats_sold, 4);
  // once paid, the seats are fixed (API and database)
  assert.equal((await payViaMock(call, b.checkout_url)).status, 200);
  assert.deepEqual([(await guest({ name: "Maryam" })).status, (await guest({ name: "Maryam" })).body.code], [409, "PAYMENT_NOT_PENDING"]);
  await assert.rejects(sql`UPDATE app.bookings SET seats = 2, guest_name = 'x' WHERE id = ${b.booking_id}`, (e) => e.code === "P0014");
  await assertExact(S);
});

test("a charge that is not the booking's total never confirms it: it is refunded in full", async () => {
  const S = await newSession(6);
  const u = await member("Stale");
  const b = (await book(u, S, { name: "Maryam" })).body;
  // an older payment page for one seat's fee (the companion was added after it was opened)
  await sql`UPDATE app.payments SET amount_minor = ${FEE} WHERE booking_id = ${b.booking_id}`;
  assert.equal((await payViaMock(call, b.checkout_url)).status, 200);
  assert.equal((await sql`SELECT status FROM app.bookings WHERE id = ${b.booking_id}`)[0].status, "payment_pending");
  const refunds = await sql`SELECT amount_minor, reason, status FROM app.refunds WHERE booking_id = ${b.booking_id}`;
  assert.deepEqual(refunds.map((r) => [r.amount_minor, r.reason, r.status]), [[FEE, "seat_unavailable", "refunded"]]);
  assert.equal((await sql`SELECT status FROM app.payments WHERE booking_id = ${b.booking_id}`)[0].status, "cancelled", "never kept");
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.audit_logs WHERE action = 'payment_total_mismatch'`)[0].n, 1);
  // she pays again from the review step: a new payment for the real total
  const co = await call("POST", `/api/v1/bookings/${b.booking_id}/checkout`, { token: u.token, body: {} });
  assert.equal(co.status, 200, JSON.stringify(co.body));
  assert.equal((await payViaMock(call, co.body.checkout_url)).status, 200);
  assert.equal((await sql`SELECT status FROM app.bookings WHERE id = ${b.booking_id}`)[0].status, "paid_awaiting_group");
  assert.equal((await sql`SELECT amount_minor FROM app.payments WHERE booking_id = ${b.booking_id} AND status = 'succeeded'`)[0].amount_minor, FEE * 2);
});

test("matching and the consoles count the companion: three members and one companion make a table of four", async () => {
  const [venue] = await sql`SELECT id FROM app.venues WHERE is_active AND 'dinner' = ANY (supported_experiences) ORDER BY name LIMIT 1`;
  assert.equal((await call("POST", `/api/admin/v1/venues/${venue.id}/portal-users`, { token: ops.token, body: { email: "plus1@venue.test" } })).status, 201);
  const S = await newSession(6, 26 * 3600000);
  assert.equal((await call("POST", `/api/admin/v1/sessions/${S}/venues`, { token: ops.token, body: { venue_id: venue.id, planned_guests: 6 } })).status, 200);
  const lead = await member("Lead");
  lead.booking = await bookAndPay(lead, S, { name: "Maryam" });
  const amal = await member("Amal");
  await bookAndPay(amal, S);
  await bookAndPay(await member("Badr"), S);
  const hold = await member("Holder");
  assert.equal((await book(hold, S, { name: "Friend" })).status, 201);   // an unpaid two-seat hold

  const list = (await call("GET", "/api/admin/v1/sessions", { token: owner.token })).body.sessions.find((s) => s.id === S);
  assert.deepEqual([list.seats_sold, list.paid_waiting], [6, 4]);
  let det = (await call("GET", `/api/admin/v1/sessions/${S}`, { token: owner.token })).body;
  assert.deepEqual([det.holds, det.pool.reduce((n, p) => n + p.n, 0)], [2, 4]);
  assert.deepEqual(det.unassigned.find((m) => m.booking_id === lead.booking.booking_id).guest_name, "Maryam");
  const input = (await sql`SELECT app.matching_input(${S}) AS i`)[0].i;
  assert.deepEqual(input.bookings.map((b) => b.seats).sort(), [1, 1, 2]);

  // the venue answers yes, then the table is published: 3 bookings, 4 seats
  const req = await call("POST", "/api/venue/v1/auth/code:request", { body: { email: "plus1@venue.test" } });
  const venueToken = (await call("POST", "/api/venue/v1/auth/code:verify", { body: { email: "plus1@venue.test", code: req.body.dev_code } })).body.access_token;
  await sql`UPDATE app.session_venues SET notified_at = now() WHERE session_id = ${S}`;
  assert.equal((await call("POST", `/api/venue/v1/requests/${S}:accept`, { token: venueToken })).status, 200);
  const pub = await call("POST", `/api/admin/v1/sessions/${S}/matching:publish`, { token: owner.token, body: { seed: 1 } });
  assert.equal(pub.status, 201, JSON.stringify(pub.body));
  assert.deepEqual([pub.body.summary.tables, pub.body.summary.seated, pub.body.summary.leftovers], [1, 4, 0]);
  assert.deepEqual([pub.body.explanations.tables[0].size, pub.body.explanations.tables[0].companions], [4, 1]);
  det = (await call("GET", `/api/admin/v1/sessions/${S}`, { token: owner.token })).body;
  assert.deepEqual([det.tables.length, det.tables[0].confirmed_count, det.tables[0].members.length], [1, 4, 3]);
  const row = det.tables[0].members.find((m) => m.booking_id === lead.booking.booking_id);
  assert.deepEqual([row.seats, row.guest_name], [2, "Maryam"]);
  assert.equal((await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:lock`, { token: owner.token })).status, 200, "four seats are a quorum");
  const mine = (await call("GET", `/api/v1/bookings/${lead.booking.booking_id}/event-details`, { token: lead.token })).body;
  assert.deepEqual([mine.table.confirmed_count, mine.booking.seats], [4, 2]);

  // the venue page: four women at the table, the companion named on the member's row
  await sql`UPDATE app.event_sessions SET starts_at = now() + interval '2 hours', ends_at = now() + interval '4 hours',
              booking_opens_at = now() - interval '3 days', booking_closes_at = now() - interval '1 hour', lock_at = now() - interval '50 minutes',
              reveal_at = now() - interval '40 minutes', check_in_opens_at = now() + interval '1 hour' WHERE id = ${S}`;
  const vr = (await call("GET", "/api/venue/v1/requests", { token: venueToken })).body.requests.find((r) => r.session_id === S);
  assert.equal(vr.tables[0].women, 4);
  assert.deepEqual(vr.tables[0].guests.map((g) => g.plus_one).filter(Boolean), ["Maryam"]);
  assert.equal(vr.tables[0].guests.length, 3);
  // arrival of the member counts her companion on the coordinators' board
  const g = vr.tables[0].guests.find((x) => x.plus_one);
  assert.equal((await call("POST", `/api/venue/v1/guests/${g.id}:arrived`, { token: venueToken })).status, 200);
  const board = (await call("GET", "/api/admin/v1/live/tonight", { token: owner.token })).body.tables.find((t) => t.session_id === S);
  assert.deepEqual([board.confirmed, board.checked_in], [4, 2]);
  // her tablemates see the companion's name on the day, next to the member who brings her (owner, 15 Nov 2026)
  await sql`UPDATE app.event_sessions SET check_in_opens_at = now() - interval '1 minute' WHERE id = ${S}`;   // the day-of phase
  const [amalBooking] = await sql`SELECT id FROM app.bookings WHERE user_id = ${amal.userId} AND session_id = ${S}`;
  const amalView = (await call("GET", `/api/v1/bookings/${amalBooking.id}/event-details`, { token: amal.token })).body;
  const leadRow = (amalView.table.members || []).find((m) => m.display_name === "Lead");
  assert.equal(leadRow && leadRow.guest_name, "Maryam", JSON.stringify(amalView.table));

});

test("a cancellation at a formed table takes both seats off its count", async () => {
  const S = await newSession(6);
  const lead = await member("Lead");
  lead.booking = await bookAndPay(lead, S, { name: "Maryam" });
  for (const n of ["Amal", "Badr"]) await bookAndPay(await member(n), S);
  assert.equal((await call("POST", `/api/admin/v1/sessions/${S}/matching:publish`, { token: owner.token, body: { seed: 1 } })).status, 201);
  const table = async () => (await sql`SELECT confirmed_count FROM app.event_tables WHERE session_id = ${S}`)[0].confirmed_count;
  assert.equal(await table(), 4);
  const c = await call("POST", `/api/v1/bookings/${lead.booking.booking_id}/cancel`, { token: lead.token, body: {} });
  assert.equal(c.body.refund.amount.amount_minor, FEE * 2);
  assert.deepEqual([await table(), (await seats(S)).seats_sold], [2, 2]);
  await assertExact(S);
});

test("rebooking after an organiser cancellation keeps the companion and needs two seats", async () => {
  const S = await newSession(6), tight = await newSession(4, 2 * DAY), roomy = await newSession(4, 3 * DAY);
  const u = await member("Rebook");
  const b = await bookAndPay(u, S, { name: "Maryam" });
  await sql`UPDATE app.bookings SET status = 'cancelled_by_organizer', cancelled_at = now(), cancel_actor = 'organizer', cancel_reason_code = 'below_quorum' WHERE id = ${b.booking_id}`;
  for (const n of ["A", "B", "C"]) await bookAndPay(await member(n), tight);
  const d = (await call("GET", `/api/v1/bookings/${b.booking_id}/event-details`, { token: u.token })).body;
  const offered = d.resolution.options.find((o) => o.type === "rebook").sessions.map((s) => s.session_id);
  assert.ok(offered.includes(roomy) && !offered.includes(tight), "only sessions with two free seats are offered");
  assert.equal(d.resolution.options.find((o) => o.type === "refund").amount.amount_minor, FEE * 2);
  const no = await call("POST", `/api/v1/bookings/${b.booking_id}/resolution`, { token: u.token, body: { choice: "rebook", session_id: tight } });
  assert.deepEqual([no.status, no.body.code], [409, "SESSION_FULL"]);
  const yes = await call("POST", `/api/v1/bookings/${b.booking_id}/resolution`, { token: u.token, body: { choice: "rebook", session_id: roomy } });
  assert.equal(yes.status, 200, JSON.stringify(yes.body));
  const [nb] = await sql`SELECT seats, guest_name, price_minor FROM app.bookings WHERE id = ${yes.body.booking.id}`;
  assert.deepEqual([nb.seats, nb.guest_name, nb.price_minor], [2, "Maryam", FEE * 2]);
  assert.equal((await seats(roomy)).seats_sold, 2);
  await assertExact(roomy);
});

test("account deletion erases the companion's name and keeps the seat count", async () => {
  const S = await newSession(6);
  const u = await member("Leaving");
  const b = await bookAndPay(u, S, { name: "Maryam" });
  assert.equal((await call("DELETE", "/api/v1/users/me", { token: u.token })).status, 202);
  await sql`UPDATE app.users SET deletion_requested_at = now() - interval '15 days' WHERE id = ${u.userId}`;
  await sql`SELECT app.finalize_account_deletions()`;
  const [row] = await sql`SELECT seats, guest_name FROM app.bookings WHERE id = ${b.booking_id}`;
  assert.deepEqual([row.seats, row.guest_name], [2, ""]);
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.bookings WHERE guest_name LIKE '%Maryam%' AND user_id = ${u.userId}`)[0].n, 0);
});

test("migration 026 is safe to run twice, and no client role can reach the new columns or functions", async () => {
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const file = fileURLToPath(new URL("../../db/migrations/026_plus_one.sql", import.meta.url));
  execFileSync("psql", ["-h", process.env.PGHOST_PSQL || "/tmp", "-p", String(process.env.PGPORT || 5433), "-U", process.env.PGUSER || "app", "-d", env.db,
    "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", file], { stdio: ["ignore", "pipe", "pipe"] });
  const [t] = await sql`SELECT relrowsecurity AS rls FROM pg_class WHERE oid = 'app.bookings'::regclass`;
  assert.equal(t.rls, true);
  const [pol] = await sql`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'app' AND tablename = 'bookings' AND policyname = 'deny_all'`;
  assert.equal(pol.n, 1);
  const open = await sql`SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'app'::regnamespace AND p.proname IN ('hold_seat','set_booking_guest','guard_booking_seats')
                           AND has_function_privilege('public', p.oid, 'EXECUTE')`;
  assert.deepEqual(open.map((r) => r.proname), []);
  assert.equal((await sql`SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace = 'app'::regnamespace AND proname = 'hold_seat'`)[0].n, 1, "one hold_seat, not two");
});
