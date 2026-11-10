// Matching rules over the database (migration 020): matching_input() returns who shared a table lately (with the
// "both asked to stay in touch" flag) and how long ago each woman was left without a table; the admin runs apply the
// no-repeat and priority rules; every run stores each table's score and components; coordinators see "Low match".
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { PG, adminLogin, buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const MATCHING_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../matching");
const DAY = 86400000;
let env, call, sql, owner;
const W = {};

async function newSession(days) {
  const s = await call("POST", "/api/admin/v1/sessions", { token: owner.token, body: { experience: "dinner", conversation_language: "ar",
    starts_at: new Date(Date.now() + days * DAY).toISOString(), duration_minutes: 120, max_seats: 18, district_hint_ar: "لوسيل", district_hint_en: "Lusail" } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal((await call("POST", `/api/admin/v1/sessions/${s.body.id}:open-sale`, { token: owner.token })).status, 200);
  return s.body.id;
}
async function bookAndPay(u, session) {
  const b = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: session } });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal((await payViaMock(call, await checkoutUrlFor(call, u.token, b.body))).status, 200);
  return b.body.booking_id;
}
const seat = (seed, bookingId) => "P-" + createHash("sha256").update(`${seed}:${bookingId}`).digest("hex").slice(0, 8);
const dry = async (session, body) => {
  const r = await call("POST", `/api/admin/v1/sessions/${session}/matching:dry-run`, { token: owner.token, body });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};

before(async () => {
  buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql;
  owner = await adminLogin(call, sql, "owner@example.test");
  // Session A in 4 days: seven women, one table (max_tables 1), so one of them is left without a table; the table locks.
  W.A = await newSession(4);
  W.a = [];
  for (const name of ["Amal", "Basma", "Dana", "Farah", "Hind", "Jana", "Lama"]) {
    const u = await signUp(call, { name });
    W.a.push({ ...u, name, bookingA: await bookAndPay(u, W.A) });
  }
  const pub = await call("POST", `/api/admin/v1/sessions/${W.A}/matching:publish`, { token: owner.token, body: { seed: 1, max_tables: 1 } });
  assert.equal(pub.status, 201, JSON.stringify(pub.body));
  const det = (await call("GET", `/api/admin/v1/sessions/${W.A}`, { token: owner.token })).body;
  assert.equal(det.tables.length, 1);
  assert.equal((await call("POST", `/api/admin/v1/tables/${det.tables[0].id}:lock`, { token: owner.token })).status, 200);
  W.tableA = det.tables[0].id;
  const seatedA = new Set(det.tables[0].members.map((m) => m.booking_id));
  W.left = W.a.find((u) => !seatedA.has(u.bookingA));
  [W.p1, W.p2] = W.a.filter((u) => seatedA.has(u.bookingA));
  // Session B six days later: the two tablemates, the woman left out, and four new women (7 for 1 table of 6)
  W.B = await newSession(10);
  W.b = [W.p1, W.p2, W.left];
  for (const name of ["Maha", "Nada", "Rana", "Salma"]) W.b.push({ ...(await signUp(call, { name })), name });
  for (const u of W.b) u.bookingB = await bookAndPay(u, W.B);
});
after(async () => { await env.stop(); });

test("matching_input: who shared a table lately (days apart), and how long ago a woman was left without a table", async () => {
  const [{ input }] = await sql`SELECT app.matching_input(${W.B}) AS input`;
  const [a, b] = [W.p1.userId, W.p2.userId].sort();
  assert.deepEqual(input.history, [[a, b, 6, false]], "only the two tablemates booked again; 6 Doha days apart");
  const byUser = Object.fromEntries(input.bookings.map((x) => [x.user_id, x.unseated_days_ago]));
  assert.equal(byUser[W.left.userId], 6, "left without a table in A, six days before B");
  assert.equal(byUser[W.p1.userId], null);
  assert.equal(byUser[W.b[3].userId], null);
  // Runbook A cancels a leftover as no_table_formed (or below_quorum when her table failed): still left without a table
  const unseatedFor = async (reason) => {
    await sql`UPDATE app.bookings SET status = 'cancelled_by_organizer', cancelled_at = now(), cancel_actor = 'organizer',
              cancel_reason_code = ${reason} WHERE id = ${W.left.bookingA}`;
    const [{ input: i }] = await sql`SELECT app.matching_input(${W.B}) AS input`;
    return i.bookings.find((x) => x.user_id === W.left.userId).unseated_days_ago;
  };
  assert.equal(await unseatedFor("no_table_formed"), 6);
  assert.equal(await unseatedFor("below_quorum"), 6);
  assert.equal(await unseatedFor("account_banned"), null, "any other cancellation is not a missed table");
  await sql`UPDATE app.bookings SET status = 'paid_awaiting_group', cancelled_at = NULL, cancel_actor = NULL, cancel_reason_code = NULL
            WHERE id = ${W.left.bookingA}`;
  const [fn] = await sql`SELECT proconfig FROM pg_proc WHERE oid = 'app.matching_input(uuid)'::regprocedure`;
  assert.deepEqual(fn.proconfig, ["search_path=app, pg_temp"]);
  // A itself has no history: its own table does not count
  const [{ input: inA }] = await sql`SELECT app.matching_input(${W.A}) AS input`;
  assert.deepEqual(inA.history, []);
});

test("no repeat within 7 days (small session): the tablemates never share a table", async () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = await dry(W.B, { seed, max_tables: 1 });
    assert.equal(r.explanations.rules.small_session, true);
    assert.equal(r.explanations.rules.repeat_block_days, 7);
    const t = r.explanations.tables[0];
    assert.ok(!(t.seats.includes(seat(seed, W.p1.bookingB)) && t.seats.includes(seat(seed, W.p2.bookingB))), `seed ${seed}`);
    assert.equal(r.summary.seated, 6);
  }
});

test("both asked to stay in touch: the pair may sit together again; the woman left out last time keeps priority", async () => {
  await sql`INSERT INTO app.contact_requests (table_id, from_user_id, to_user_id, status, expires_at, decided_at)
            VALUES (${W.tableA}, ${W.p1.userId}, ${W.p2.userId}, 'accepted', now() + interval '7 days', now())`;
  const [{ input }] = await sql`SELECT app.matching_input(${W.B}) AS input`;
  assert.equal(input.history[0][3], true);
  let together = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = await dry(W.B, { seed, max_tables: 1 });
    const t = r.explanations.tables[0];
    if (t.seats.includes(seat(seed, W.p1.bookingB)) && t.seats.includes(seat(seed, W.p2.bookingB))) together++;
    // 7 women, 6 seats, no rule in the way: the one left without a table in A is never the one left out again
    assert.ok(t.seats.includes(seat(seed, W.left.bookingB)), `seed ${seed}: priority`);
    assert.ok(r.explanations.leftovers.every((l) => l.seat !== seat(seed, W.left.bookingB)));
  }
  assert.ok(together > 0, "allowed again");
});

test("every run stores each table's score and components; the published table links to its row", async () => {
  const before = (await sql`SELECT count(*)::int AS n FROM app.matching_run_tables`)[0].n;
  const d = await dry(W.B, { seed: 3, max_tables: 1 });
  const [row] = await sql`SELECT t.* FROM app.matching_run_tables t JOIN app.matching_runs r ON r.id = t.matching_run_id
                           WHERE r.session_id = ${W.B} AND r.mode = 'dry_run' ORDER BY t.created_at DESC LIMIT 1`;
  assert.equal((await sql`SELECT count(*)::int AS n FROM app.matching_run_tables`)[0].n, before + 1);
  assert.equal(row.table_id, null, "a dry run creates no table");
  assert.equal(row.size, 6);
  assert.equal(Number(row.score), d.explanations.tables[0].score);
  assert.deepEqual(Object.keys(row.components).sort(), ["cohesion", "energy_balance", "interest", "objective", "priority_boost", "repeat_penalty", "size_penalty"]);
  assert.equal(row.components.priority_boost, 0.05);
  assert.equal(row.low_match, d.explanations.tables[0].low_match);
  assert.equal(d.summary.low_match, d.explanations.tables.filter((t) => t.low_match).length);
  const pub = await call("POST", `/api/admin/v1/sessions/${W.B}/matching:publish`, { token: owner.token, body: { seed: 3, max_tables: 1 } });
  assert.equal(pub.status, 201, JSON.stringify(pub.body));
  const det = (await call("GET", `/api/admin/v1/sessions/${W.B}`, { token: owner.token })).body;
  const [linked] = await sql`SELECT * FROM app.matching_run_tables WHERE table_id = ${det.tables[0].id}`;
  assert.equal(linked.table_code, det.tables[0].code);
  assert.equal(det.tables[0].low_match, linked.low_match);
  assert.equal(det.tables[0].match_score, Number(linked.score));
  // client roles never reach it (same protection as every app table)
  const [rls] = await sql`SELECT relrowsecurity FROM pg_class WHERE oid = 'app.matching_run_tables'::regclass`;
  assert.equal(rls.relrowsecurity, true);
  W.tableB = det.tables[0];
});

test("publish_run.py (Runbook A bridge) stores the table scores too", async () => {
  const [{ input }] = await sql`SELECT app.matching_input(${W.B})::text AS input`;
  const out = execFileSync("python3", ["publish_run.py", "--rule-version", "r1-interest", "--seed", "4", "--mode", "dry_run", "--max-tables", "1"],
    { cwd: MATCHING_DIR, input, stdio: ["pipe", "pipe", "pipe"] }).toString();
  assert.match(out, /INSERT INTO matching_run_tables/);
  execFileSync("psql", ["-h", process.env.PGHOST_PSQL || "/tmp", "-p", String(PG.port), "-U", PG.user, "-d", env.db, "-v", "ON_ERROR_STOP=1", "-q", "-1"],
    { input: out, stdio: ["pipe", "pipe", "pipe"] });
  const rows = await sql`SELECT t.size, t.components FROM app.matching_run_tables t JOIN app.matching_runs r ON r.id = t.matching_run_id
                          WHERE r.session_id = ${W.B} AND r.rule_version = 'r1-interest'`;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].size, 6);
  assert.ok("objective" in rows[0].components);
});

test("admin console: a low-match table shows the marker on the session page and in a run's tables", async () => {
  await sql`UPDATE app.matching_run_tables SET low_match = true WHERE table_id = ${W.tableB.id}`;
  // a run whose table shares no interest at all: r1-interest scores it 0, below the 0.15 threshold
  const C = await newSession(20);
  const topics = [["food"], ["travel"], ["sport"], ["tech"], ["books_culture"], ["creative_hobbies"]];
  const names = ["Wafa", "Yara", "Zaina", "Ghada", "Huda", "Iman"];
  for (const [i, t] of topics.entries()) await bookAndPay(await signUp(call, { name: names[i], topics: t }), C);
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(([t, a]) => { sessionStorage.setItem("qa_token", JSON.stringify(t)); sessionStorage.setItem("qa_admin", JSON.stringify(a)); },
      [owner.token, owner.admin]);
    await page.goto(`${env.base}/admin/#/sessions/${W.B}`);
    const card = page.locator("section.card", { hasText: W.tableB.code }).first();
    await card.locator(".badge", { hasText: "Low match" }).waitFor();
    await page.goto(`${env.base}/admin/#/sessions/${C}`);
    await page.waitForSelector("#mf");
    await page.selectOption("#mf select[name=rule_version]", "r1-interest");
    await page.click("#mf button[type=submit]");
    await page.waitForSelector("#explain table");
    assert.equal(await page.locator("#explain td .badge", { hasText: "Low match" }).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
