// The API is deployed (with every push) before migration 015 is applied to the database. Until then CARD_NAME_CHECK is
// absent, and booking, payment and the meetup details must work on a database without 015's columns and table.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

let env, call, sql;
before(async () => {
  buildTemplate();
  env = await startTestEnv({ CARD_NAME_CHECK: "false" });
  call = client(env.base);
  sql = env.sql;
  // the database as it is before 015
  await sql.unsafe(`DROP TABLE app.identity_reviews; ALTER TABLE app.payments DROP COLUMN cardholder_name_enc, DROP COLUMN name_check;
                    DELETE FROM app.app_config WHERE key = 'CARD_NAME_CHECK'`);
});
after(async () => { await env.stop(); });

test("before 015: book, pay with a card name, open the details, list reviews (empty)", async () => {
  const owner = await adminLogin(call, sql, "owner@example.test");
  const ops = await adminLogin(call, sql, "ops.oncall@example.test");
  const s = await call("POST", "/api/admin/v1/sessions", { token: ops.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + 6 * 86400000).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "الدفنة", district_hint_en: "Dafna" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
  const M = await signUp(call, { name: "فاطمة" });
  const b = await call("POST", "/api/v1/bookings", { token: M.token, body: { session_id: s.body.id } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  const p = await payViaMock(call, await checkoutUrlFor(call, M.token, b.body), "success", "MOHAMMED ALI");
  assert.equal(p.status, 200);
  const [bk] = await sql`SELECT status FROM app.bookings WHERE id = ${b.body.booking_id}`;
  assert.equal(bk.status, "paid_awaiting_group", "payment processed");
  const d = await call("GET", `/api/v1/bookings/${b.body.booking_id}/event-details`, { token: M.token });
  assert.equal(d.status, 200);
  assert.equal(d.body.identity_check, undefined);
  const list = await call("GET", "/api/admin/v1/identity-reviews", { token: owner.token });
  assert.deepEqual([list.status, list.body.reviews], [200, []]);
});
