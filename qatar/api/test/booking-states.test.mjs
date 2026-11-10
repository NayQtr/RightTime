// Booking status transitions (Notion fix 15). The status model is v0.3 §1.0.1 (payment_pending -> paid_awaiting_group ->
// group_locked -> revealed -> checked_in -> completed, with the cancelled / expired / failed exits).
//   Database: every one of the 11 x 11 moves is tried; the allowed ones go through (bookings_status_guard, 021) and keep
//   seats_sold equal to the bookings holding a seat; every other one is refused (SQLSTATE P0060). Before 021 the database
//   took any move, and leaving a final status (e.g. expired -> paid_awaiting_group) did not take the seat back.
//   API: every status a booking can have, against each member action that changes status (cancel, check-in, payment,
//   hold expiry) and the admin's end of session; the answer, the status after, and the seat count are checked.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";
import { signWebhook } from "../src/services/psp.js";

const STATUSES = ["payment_pending", "paid_awaiting_group", "group_locked", "revealed", "checked_in", "completed", "waitlisted",
  "cancelled_by_user", "cancelled_by_organizer", "expired", "payment_failed"];
// statuses that keep a seat (seats_sold counts them); the others gave it back
const HOLDS = ["payment_pending", "paid_awaiting_group", "group_locked", "revealed", "checked_in", "completed", "waitlisted"];
const ALLOWED = {
  payment_pending: ["paid_awaiting_group", "expired", "payment_failed", "cancelled_by_user", "cancelled_by_organizer"],
  paid_awaiting_group: ["group_locked", "waitlisted", "cancelled_by_user", "cancelled_by_organizer"],
  waitlisted: ["paid_awaiting_group", "group_locked", "cancelled_by_user", "cancelled_by_organizer"],
  group_locked: ["revealed", "checked_in", "completed", "cancelled_by_user", "cancelled_by_organizer"],
  revealed: ["checked_in", "completed", "cancelled_by_user", "cancelled_by_organizer"],
  checked_in: ["completed"],
  completed: [], cancelled_by_user: [], cancelled_by_organizer: [], expired: [], payment_failed: [],
};
const DAY = 86400000;
let env, call, sql, owner;

before(async () => {
  buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql;
  owner = await adminLogin(call, sql, "owner@example.test");
});
after(async () => { await env.stop(); });

async function member(name) {
  await sql`DELETE FROM app.otp_challenges`; // many sign-ups from one test address
  return signUp(call, { name });
}
async function newSession(startsInMs) {
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + startsInMs).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
  return s.body.id;
}
// A booking put straight into a status (as if it had got there), with the seat it holds counted, optionally on a table.
async function bookingIn(u, session, status, table = null) {
  const [b] = await sql`
    INSERT INTO app.bookings (booking_ref, user_id, session_id, conversation_language, budget_tier_id, questionnaire_response_id, status,
                              hold_expires_at, price_minor, cancellation_policy_version, cancelled_at, cancel_actor)
    SELECT app.gen_booking_ref(), ${u.userId}, s.id, s.conversation_language, (SELECT id FROM app.budget_tiers ORDER BY rank DESC LIMIT 1),
           (SELECT id FROM app.questionnaire_responses WHERE user_id = ${u.userId} AND status = 'submitted'), ${status}::app.booking_status,
           CASE WHEN ${status}::text = 'payment_pending' THEN now() + interval '10 minutes' END, 5900, cp.version,
           CASE WHEN ${status}::text LIKE 'cancelled%' THEN now() END, CASE WHEN ${status}::text LIKE 'cancelled%' THEN 'user'::app.cancel_actor END
      FROM app.event_sessions s JOIN app.cancellation_policies cp ON cp.id = s.cancellation_policy_id WHERE s.id = ${session}
    RETURNING id`;
  if (HOLDS.includes(status)) await sql`UPDATE app.event_sessions SET seats_sold = seats_sold + 1 WHERE id = ${session}`;
  if (table) await sql`INSERT INTO app.table_assignments (booking_id, table_id, matching_run_id) VALUES (${b.id}, ${table.id}, ${table.run})`;
  return b.id;
}
const statusOf = async (id) => (await sql`SELECT status FROM app.bookings WHERE id = ${id}`)[0].status;
// seats_sold always equals the bookings holding a seat plus the seats kept for waitlist offers
async function seatsConsistent(session, where) {
  const [r] = await sql`
    SELECT s.seats_sold, (SELECT count(*)::int FROM app.bookings b WHERE b.session_id = s.id AND b.status::text IN ${sql(HOLDS)})
         + (SELECT count(*)::int FROM app.waitlist_entries w WHERE w.session_id = s.id AND w.status = 'offered') AS held
      FROM app.event_sessions s WHERE s.id = ${session}`;
  assert.equal(r.seats_sold, r.held, `seats_sold matches the seats held (${where})`);
}

test("database: every allowed move goes through and keeps the seat count; every other move is refused", async () => {
  const s = await newSession(5 * DAY);
  const u = await member("Sara");
  class Rollback { constructor(v) { this.v = v; } }
  const outcomes = [];
  for (const from of STATUSES) for (const to of STATUSES) {
    let got;
    try {
      await sql.begin(async (tx) => {
        const [b] = await tx`
          INSERT INTO app.bookings (booking_ref, user_id, session_id, conversation_language, budget_tier_id, questionnaire_response_id, status,
                                    hold_expires_at, price_minor, cancellation_policy_version, cancelled_at, cancel_actor)
          SELECT app.gen_booking_ref(), ${u.userId}, s.id, s.conversation_language, (SELECT id FROM app.budget_tiers ORDER BY rank DESC LIMIT 1),
                 (SELECT id FROM app.questionnaire_responses WHERE user_id = ${u.userId} AND status = 'submitted'), ${from}::app.booking_status,
                 CASE WHEN ${from}::text = 'payment_pending' THEN now() + interval '10 minutes' END, 5900, cp.version,
                 CASE WHEN ${from}::text LIKE 'cancelled%' THEN now() END, CASE WHEN ${from}::text LIKE 'cancelled%' THEN 'user'::app.cancel_actor END
            FROM app.event_sessions s JOIN app.cancellation_policies cp ON cp.id = s.cancellation_policy_id WHERE s.id = ${s}
          RETURNING id`;
        await tx`UPDATE app.event_sessions SET seats_sold = ${HOLDS.includes(from) ? 1 : 0} WHERE id = ${s}`;
        if (from === "payment_pending" && to === "expired") {
          // the one way a hold expires: release_expired_holds, which gives the seat back itself
          await tx`UPDATE app.bookings SET hold_expires_at = now() - interval '1 second' WHERE id = ${b.id}`;
          await tx`SELECT app.release_expired_holds()`;
        } else {
          await tx`UPDATE app.bookings SET status = ${to}::app.booking_status,
                     hold_expires_at = CASE WHEN ${to}::text = 'payment_pending' THEN now() + interval '10 minutes' END,
                     cancelled_at = COALESCE(cancelled_at, now()), cancel_actor = COALESCE(cancel_actor, 'user')
                   WHERE id = ${b.id}`;
        }
        const [after] = await tx`SELECT b.status, s.seats_sold FROM app.bookings b JOIN app.event_sessions s ON s.id = b.session_id WHERE b.id = ${b.id}`;
        throw new Rollback(after);
      });
    } catch (e) {
      got = e instanceof Rollback ? { ok: true, ...e.v } : { ok: false, code: e.code, message: e.message };
    }
    const allowed = from === to || ALLOWED[from].includes(to);
    outcomes.push(`${from} -> ${to}: ${got.ok ? "allowed" : got.code}`);
    if (allowed) {
      assert.ok(got.ok, `${from} -> ${to} should be allowed: ${got.message}`);
      assert.equal(got.status, to);
      assert.equal(got.seats_sold, HOLDS.includes(to) ? 1 : 0, `${from} -> ${to}: seat count`);
    } else {
      assert.equal(got.ok, false, `${from} -> ${to} should be refused`);
      assert.equal(got.code, "P0060", `${from} -> ${to}: ${got.message}`);
    }
  }
  assert.equal(outcomes.length, 121);
  assert.equal(outcomes.filter((o) => o.endsWith("allowed")).length, 11 + Object.values(ALLOWED).flat().length);
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.bookings WHERE session_id = ${s}`)[0].n, 0, "every try was rolled back");
});

test("API: cancel, check-in, payment and hold expiry from every status", async () => {
  // F: five days ahead, on sale. D: a meetup that started 10 minutes ago, with a locked table at a venue (check-in open).
  const F = await newSession(5 * DAY);
  const D = await newSession(26 * 3600000);
  const base = [];
  for (const name of ["Amal", "Badr", "Dima", "Eman"]) {
    const u = await member(name);
    const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: D } });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal((await payViaMock(call, await checkoutUrlFor(call, u.token, b.body))).status, 200);
    base.push(b.body.booking_id);
  }
  assert.equal((await call("POST", `/api/admin/v1/sessions/${D}/matching:publish`, { token: owner.token, body: { seed: 1 } })).status, 201);
  const det = (await call("GET", `/api/admin/v1/sessions/${D}`, { token: owner.token })).body;
  assert.equal(det.tables.length, 1);
  assert.equal((await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:lock`, { token: owner.token })).status, 200);
  const [{ run }] = await sql`SELECT matching_run_id AS run FROM app.table_assignments WHERE table_id = ${det.tables[0].id} LIMIT 1`;
  const table = { id: det.tables[0].id, run };
  await sql`UPDATE app.event_sessions SET starts_at = now() - interval '10 minutes', ends_at = now() + interval '110 minutes',
              booking_opens_at = now() - interval '3 days', booking_closes_at = now() - interval '70 minutes',
              lock_at = now() - interval '1 day', reveal_at = now() - interval '1 day', check_in_opens_at = now() - interval '70 minutes'
            WHERE id = ${D}`;

  const CANCELLABLE = ["payment_pending", "paid_awaiting_group", "group_locked", "revealed"];
  const CHECK_IN_FROM = ["group_locked", "revealed"];
  const rows = [];
  for (const from of STATUSES) {
    const u = await member("Huda");
    // cancel, five days before the meetup
    const f = await bookingIn(u, F, from);
    const c = await call("POST", `/api/v1/bookings/${f}/cancel`, { token: u.token, body: {} });
    const canCancel = CANCELLABLE.includes(from);
    assert.equal(c.status, canCancel ? 200 : 409, `cancel from ${from}: ${JSON.stringify(c.body)}`);
    if (!canCancel) assert.equal(c.body.code, "CANCEL_NOT_ALLOWED");
    assert.equal(await statusOf(f), canCancel ? "cancelled_by_user" : from, `cancel from ${from}`);
    await seatsConsistent(F, `cancel from ${from}`);
    rows.push(`cancel ${from}: ${c.status}`);

    // check-in, on the day (her booking on the locked table)
    const d = await bookingIn(u, D, from, table);
    const ci = await call("POST", `/api/v1/bookings/${d}/check-in`, { token: u.token, body: {} });
    const canCheckIn = CHECK_IN_FROM.includes(from);
    assert.equal(ci.status, canCheckIn ? 200 : 409, `check-in from ${from}: ${JSON.stringify(ci.body)}`);
    if (!canCheckIn) assert.equal(ci.body.code, "CHECK_IN_NOT_OPEN");
    assert.equal(await statusOf(d), canCheckIn ? "checked_in" : from, `check-in from ${from}`);
    // the meetup has started: nothing can be cancelled any more
    const late = await call("POST", `/api/v1/bookings/${d}/cancel`, { token: u.token, body: {} });
    assert.equal(late.status, 409, `cancel after the start from ${from}`);
    assert.equal(late.body.code, "CANCEL_NOT_ALLOWED");
    await seatsConsistent(D, `check-in from ${from}`);
    rows.push(`check-in ${from}: ${ci.status}`);
    await sql`UPDATE app.table_assignments SET is_current = false WHERE booking_id = ${d}`; // keep the table within 6
  }
  assert.equal(rows.length, 22);

  // payment: a valid hold becomes paid; a payment after the hold expired, or after she cancelled, changes nothing and is refunded
  const P = await member("Lama");
  const ok = (await call("POST", "/api/v1/bookings", { token: P.token, body: { session_id: F } })).body;
  assert.equal((await payViaMock(call, await checkoutUrlFor(call, P.token, ok))).status, 200);
  assert.equal(await statusOf(ok.booking_id), "paid_awaiting_group");
  const Q = await member("Maha");
  const exp = (await call("POST", "/api/v1/bookings", { token: Q.token, body: { session_id: F } })).body;
  const url = await checkoutUrlFor(call, Q.token, exp);
  await sql`UPDATE app.bookings SET hold_expires_at = now() - interval '1 second' WHERE id = ${exp.booking_id}`;
  await sql`SELECT app.release_expired_holds()`;
  assert.equal(await statusOf(exp.booking_id), "expired");
  assert.equal((await payViaMock(call, url)).status, 200);
  assert.equal(await statusOf(exp.booking_id), "expired", "a late payment never revives an expired hold");
  assert.equal((await sql`SELECT reason FROM app.refunds WHERE booking_id = ${exp.booking_id}`)[0].reason, "seat_unavailable");
  const R = await member("Nada");
  const cx = (await call("POST", "/api/v1/bookings", { token: R.token, body: { session_id: F } })).body;
  assert.equal((await call("POST", `/api/v1/bookings/${cx.booking_id}/cancel`, { token: R.token, body: {} })).status, 200);
  // her checkout page was still open and the card was charged: the provider's signed webhook arrives
  const [p] = await sql`SELECT * FROM app.payments WHERE booking_id = ${cx.booking_id}`;
  const [{ value: secret }] = await sql`SELECT value FROM app.server_keys WHERE name = 'PSP_WEBHOOK_SECRET'`;
  const raw = JSON.stringify({ id: "evt_states_" + p.id, type: "payment.succeeded",
    data: { payment_intent: p.psp_payment_intent_id, amount_minor: p.amount_minor, currency: p.currency } });
  const hook = await fetch(`${env.base}/api/v1/payments/webhooks/test_psp`, { method: "POST", headers: { "content-type": "application/json", ...signWebhook(secret, raw) }, body: raw });
  assert.equal(hook.status, 200);
  assert.equal(await statusOf(cx.booking_id), "cancelled_by_user", "a payment after she cancelled never revives the booking");
  assert.equal((await sql`SELECT reason FROM app.refunds WHERE booking_id = ${cx.booking_id}`)[0].reason, "seat_unavailable");
  // hold expiry touches only holds that ran out
  const S2 = await member("Ola");
  const live = (await call("POST", "/api/v1/bookings", { token: S2.token, body: { session_id: F } })).body;
  await sql`SELECT app.release_expired_holds()`;
  assert.equal(await statusOf(live.booking_id), "payment_pending");
  await seatsConsistent(F, "payments and expiry");

  // the admin ends the session: checked in -> completed; on the table but not checked in (the four group_locked members,
  // a revealed one) -> completed as a no-show; final statuses stay as they are. The table seats 6.
  const done = {};
  for (const from of ["checked_in", "revealed", "cancelled_by_user", "expired"]) done[from] = await bookingIn(await member("Rana"), D, from, table);
  await sql`UPDATE app.event_sessions SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour',
              check_in_opens_at = now() - interval '4 hours', booking_closes_at = now() - interval '4 hours' WHERE id = ${D}`;
  const end = await call("POST", `/api/admin/v1/sessions/${D}:complete`, { token: owner.token });
  assert.equal(end.status, 200, JSON.stringify(end.body));
  const after = Object.fromEntries(await Promise.all(Object.entries(done).map(async ([k, id]) => [k, (await sql`SELECT status, no_show FROM app.bookings WHERE id = ${id}`)[0]])));
  assert.deepEqual(after, { checked_in: { status: "completed", no_show: false }, revealed: { status: "completed", no_show: true },
    cancelled_by_user: { status: "cancelled_by_user", no_show: null }, expired: { status: "expired", no_show: null } });
  for (const id of base) assert.deepEqual((await sql`SELECT status, no_show FROM app.bookings WHERE id = ${id}`)[0], { status: "completed", no_show: true });
  await seatsConsistent(D, "end of session");
});
