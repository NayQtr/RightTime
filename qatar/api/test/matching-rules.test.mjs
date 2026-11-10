// Matching rules (owner's proposals, built provisionally on 10 Nov 2026): no repeat of the same two women, age gap,
// small sessions, low-match flag, priority for women left without a table, tables of 5-6 preferred, score components
// recorded, and the celebrant keeps her seat (item 31). The Python engine has the same tests (test_matching_engine.py)
// and test/parity.test.mjs proves both engines agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_LOOKBACK_DAYS, MATCHING_RULES, PRIORITY_REASON, ageBand, effectiveRules, repeatRules, runMatching, tableSizes }
  from "../src/matching/engine.js";

const TOPICS = [["food", "travel"], ["food", "books_culture"], ["sport", "tech"], ["tech", "books_culture"], ["travel", "creative_hobbies"], ["creative_hobbies", "food"]];
const make = (n, { topics = true, start = 0 } = {}) => Array.from({ length: n }, (_, k) => {
  const i = start + k, id = String(i).padStart(3, "0");
  return { booking_id: `b${id}`, user_id: `u${id}`, session_id: "S", status: "paid_awaiting_group", conversation_language: "ar",
    budget_tier_rank: 2, q05_topics: topics ? TOPICS[i % TOPICS.length] : null, consents_current: true, age_attested: true, account_active: true };
});
const run = (pool, { rule = "r1-baseline", seed = 1, history = [], maxTables = null } = {}) =>
  runMatching({ sessionId: "S", mode: "dry_run", ruleVersion: rule, seed, bookings: pool, history, maxTables });
const together = (tables, a, b) => tables.some((t) => { const ids = t.members.map((m) => m.user_id); return ids.includes(a) && ids.includes(b); });
const seedsTogether = (pool, history, { rule = "r1-baseline", a = "u000", b = "u001" } = {}) =>
  Array.from({ length: 30 }, (_, s) => s).filter((seed) => together(run(pool, { rule, seed, history }).tables, a, b));
const withAge = (b, band) => ({ ...b, answers: { ...(b.answers || {}), Q11: [band] } });
const withQ25 = (b, key) => ({ ...b, answers: key ? { Q25: [key] } : null });

test("the rules are the owner's provisional values, and the history window covers them", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(MATCHING_RULES)), {
    repeat_block_days: 14, repeat_decay_end_days: 42, repeat_penalty: 0.1, max_age_band_gap: 2,
    small_pool_below: 24, small_repeat_block_days: 7, small_max_age_band_gap: 3,
    low_match_below: { personality_v1: 0.3, interest_opt_v1: 0.15, baseline_random: 0.15 },
    priority_days: 28, priority_boost: 0.05, size4_penalty: 0.02 });
  assert.ok(Object.isFrozen(MATCHING_RULES));
  assert.ok(MATCHING_RULES.repeat_decay_end_days <= HISTORY_LOOKBACK_DAYS && MATCHING_RULES.priority_days <= HISTORY_LOOKBACK_DAYS);
  const small = effectiveRules(23, "interest_opt_v1"), regular = effectiveRules(24, "personality_v1");
  assert.deepEqual([small.small_session, small.repeat_block_days, small.max_age_band_gap], [true, 7, 3]);
  assert.deepEqual([regular.small_session, regular.repeat_block_days, regular.max_age_band_gap, regular.low_match_below], [false, 14, 2, 0.3]);
});

test("no repeat: blocked within 14 days in a regular session, either order; allowed after", () => {
  const pool = make(24);
  assert.deepEqual(seedsTogether(pool, [["u000", "u001", 14, false]]), []);
  assert.deepEqual(seedsTogether(pool, [["u001", "u000", 0, false]]), []);
  assert.notDeepEqual(seedsTogether(pool, [["u000", "u001", 15, false]]), []);
  assert.equal(run(pool).explanations.rules.small_session, false);
});

test("small session (fewer than 24): repeats blocked for 7 days only", () => {
  const pool = make(12);
  assert.deepEqual(seedsTogether(pool, [["u000", "u001", 7, false]]), []);
  assert.notDeepEqual(seedsTogether(pool, [["u000", "u001", 8, false]]), []);
  assert.equal(run(pool).explanations.rules.small_session, true);
});

test("both asked to meet again: no block and no penalty", () => {
  assert.notDeepEqual(seedsTogether(make(24), [["u000", "u001", 2, true]]), []);
  const { blocked, penalties } = repeatRules([["a", "b", 2, true], ["c", "d", 20, true]], effectiveRules(24, "interest_opt_v1"));
  assert.deepEqual(blocked, []);
  assert.equal(penalties.size, 0);
});

test("repeat penalty falls linearly to 0 at 42 days and is recorded with the table", () => {
  const { penalties } = repeatRules([["a", "b", 15, false], ["c", "d", 28, false], ["e", "f", 41, false], ["g", "h", 42, false]], effectiveRules(24, "interest_opt_v1"));
  assert.deepEqual([...penalties.entries()], [["a|b", 27 / 28], ["c|d", 0.5], ["e|f", 1 / 28]]);
  assert.equal(repeatRules([["a", "b", 8, false]], effectiveRules(12, "interest_opt_v1")).penalties.get("a|b"), 34 / 35);
  const pool = make(24), history = [["u000", "u001", 28, false]];
  const res = run(pool, { seed: seedsTogether(pool, history)[0], history });
  const rows = res.tables.map((t, i) => [t, res.explanations.tables[i]]).filter(([t]) => together([t], "u000", "u001"));
  assert.deepEqual(rows.map(([, e]) => e.repeat_penalty), [0.05]);
});

test("the optimised rule versions avoid a recent repeat when tables are otherwise equal", () => {
  const pool = make(24, { topics: false });
  for (let seed = 0; seed < 15; seed++)
    assert.ok(!together(run(pool, { rule: "r1-interest", seed, history: [["u000", "u001", 20, false]] }).tables, "u000", "u001"), `seed ${seed}`);
});

test("age gap: at most 2 bands in a regular session, 3 in a small one; no answer is not limited", () => {
  assert.equal(ageBand(withAge(make(1)[0], "age_45_54")), 3);
  assert.equal(ageBand(make(1)[0]), null);
  assert.equal(ageBand({ answers: { Q11: ["age_18_24", "age_55_plus"] } }), null);
  const pool = make(24);
  [pool[0], pool[1], pool[2]] = [withAge(pool[0], "age_18_24"), withAge(pool[1], "age_45_54"), withAge(pool[2], "age_35_44")];
  assert.deepEqual(seedsTogether(pool, []), []);
  assert.notDeepEqual(seedsTogether(pool, [], { b: "u002" }), []);
  assert.notDeepEqual(seedsTogether(pool, [], { a: "u001", b: "u003" }), []);
  const small = make(12);
  [small[0], small[1], small[2]] = [withAge(small[0], "age_18_24"), withAge(small[1], "age_45_54"), withAge(small[2], "age_55_plus")];
  assert.notDeepEqual(seedsTogether(small, []), []);
  assert.deepEqual(seedsTogether(small, [], { b: "u002" }), []);
});

test("low match: a table below the threshold is flagged, and everyone is still seated", () => {
  const shared = make(6).map((b) => ({ ...b, q05_topics: ["food", "travel"] }));
  assert.equal(run(shared, { rule: "r1-interest" }).explanations.tables[0].low_match, false);
  const apart = make(6).map((b, i) => ({ ...b, q05_topics: [["food", "travel", "sport", "tech", "books_culture", "creative_hobbies"][i]] }));
  const res = run(apart, { rule: "r1-interest" });
  assert.equal(res.explanations.tables[0].score, 0);
  assert.equal(res.explanations.tables[0].low_match, true);
  assert.equal(res.tables[0].low_match, true);
  assert.deepEqual([res.tables.length, res.leftovers.length], [1, 0]);
  assert.equal(res.explanations.rules.low_match_below, 0.15);
  assert.equal(run(make(6, { topics: false }), { rule: "r1-interest" }).explanations.tables[0].low_match, false, "no score: nothing to judge");
});

test("every table records its score and components", () => {
  const pool = make(13);
  pool[0] = { ...pool[0], unseated_days_ago: 5 };
  const res = run(pool, { rule: "r1-interest", seed: 3, history: [["u001", "u002", 30, false]] });
  for (const e of res.explanations.tables) {
    for (const k of ["interest", "cohesion", "score", "repeat_penalty", "priority_boost", "size_penalty", "objective", "low_match"]) assert.ok(k in e, k);
    assert.equal(e.size_penalty, e.size === 4 ? 0.02 : 0);
    assert.ok(Math.abs(e.objective - (e.score - e.repeat_penalty + e.priority_boost - e.size_penalty)) < 1e-3);
  }
  assert.equal(res.explanations.tables.reduce((a, e) => a + e.priority_boost, 0), 0.05);
});

test("tables of 5-6 are preferred: seats are spread evenly, a table of 4 only when needed", () => {
  assert.deepEqual(tableSizes(10, 6), [5, 5]);
  assert.deepEqual(tableSizes(15, 6), [5, 5, 5]);
  assert.deepEqual(tableSizes(16, 6), [6, 5, 5]);
  assert.deepEqual(tableSizes(9, 6), [5, 4]);
  assert.deepEqual(tableSizes(13, 6), [5, 4, 4]);
  assert.deepEqual(tableSizes(13, 6, "min_leftovers", 2), [6, 6]);
  assert.deepEqual(tableSizes(13, 6, "greedy_6"), [6, 6], "greedy_6 unchanged");
  assert.deepEqual(run(make(10)).tables.map((t) => t.members.length), [5, 5]);
});

test("a woman left without a table in the last 28 days takes a seat first; the number seated never falls", () => {
  const pool = make(13, { topics: false });
  const leftOut = new Set();
  for (let seed = 0; seed < 20; seed++) {
    const who = run(pool, { rule: "r1-interest", seed, maxTables: 2 }).leftovers[0].booking.booking_id;
    leftOut.add(who);
    const prio = pool.map((b) => (b.booking_id === who ? { ...b, unseated_days_ago: 10 } : b));
    const res = run(prio, { rule: "r1-interest", seed, maxTables: 2 });
    assert.equal(res.leftovers.length, 1);
    assert.notEqual(res.leftovers[0].booking.booking_id, who, `seed ${seed}`);
    assert.equal(res.leftovers[0].reason, PRIORITY_REASON);
    assert.equal(res.tables.reduce((a, t) => a + t.members.length, 0), 12);
    const late = pool.map((b) => (b.booking_id === who ? { ...b, unseated_days_ago: 29 } : b));
    assert.equal(run(late, { rule: "r1-interest", seed, maxTables: 2 }).leftovers[0].booking.booking_id, who, "older than 4 weeks: no priority");
    assert.equal(run(prio, { seed, maxTables: 2 }).leftovers[0].booking.booking_id, who, "r1-baseline stays random");
  }
  assert.ok(leftOut.size > 1);
});

test("item 31: when the celebration rule leaves someone out, the celebrant keeps her seat", () => {
  for (const q of ["prefer_none", null]) {
    const pool = make(5).map((b) => withQ25(b, "dont_mind"));
    pool[0] = { ...pool[0], occasion: "birthday" };
    pool[4] = withQ25(pool[4], q);
    for (const rule of ["r1-baseline", "r1-interest"])
      for (let seed = 0; seed < 25; seed++)
        assert.deepEqual(run(pool, { rule, seed }).leftovers.map((lo) => lo.booking.user_id), ["u004"], `${q} ${rule} ${seed}`);
  }
});

test("priority never takes a celebrant's seat", () => {
  const pool = make(7, { topics: false }).map((b) => withQ25(b, "love_to_join"));
  pool[0] = { ...pool[0], occasion: "birthday" };
  for (let seed = 0; seed < 20; seed++) {
    const others = run(pool, { rule: "r1-interest", seed, maxTables: 1 }).leftovers.map((lo) => lo.booking.booking_id);
    const prio = pool.map((b) => (others.includes(b.booking_id) ? { ...b, unseated_days_ago: 3 } : b));
    const res = run(prio, { rule: "r1-interest", seed, maxTables: 1 });
    assert.ok(res.tables[0].members.some((m) => m.user_id === "u000"), `seed ${seed}`);
  }
});

test("history and unseated days enter the inputs hash only when present (earlier runs keep their hash)", () => {
  const pool = make(8);
  const plain = run(pool, { rule: "r1-interest" }).inputs_hash;
  assert.equal(run(pool, { rule: "r1-interest", history: [] }).inputs_hash, plain);
  assert.notEqual(run(pool, { rule: "r1-interest", history: [["u000", "u001", 50, false]] }).inputs_hash, plain);
  assert.notEqual(run([{ ...pool[0], unseated_days_ago: 40 }, ...pool.slice(1)], { rule: "r1-interest" }).inputs_hash, plain);
});
