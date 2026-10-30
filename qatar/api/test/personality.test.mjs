// r2-personality: item scoring, missing answers, energy balance, questionnaire guard, themes, and engine properties
// on generated pools (spec docs/specs/2026-10-30-personality-matching-design.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runMatching, scoreGroup } from "../src/matching/engine.js";
import { cleanAnswers, DIMENSIONS, energyBalance, pairScore, scoreGroupPersonality, tableThemes, THEME_QUESTIONS, W_ENERGY } from "../src/matching/personality.js";
import { QUESTIONNAIRE, randomAnswers } from "./personality-fixtures.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const member = (id, answers) => ({ booking_id: id, answers });
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test("weights are the owner's: 32/28/18/12/10, energy 7%", () => {
  assert.deepEqual(DIMENSIONS, [["values", 0.32], ["personality", 0.28], ["social", 0.18], ["interests", 0.12], ["lifestyle", 0.10]]);
  close(DIMENSIONS.reduce((a, [, w]) => a + w, 0), 1);
  assert.equal(W_ENERGY, 0.07);
});

test("item similarity: same, different, wildcard, scale distance, overlap", () => {
  close(pairScore({ Q17: ["drama"] }, { Q17: ["drama"] }), 1);
  close(pairScore({ Q17: ["drama"] }, { Q17: ["comedy"] }), 0);
  close(pairScore({ Q13: ["mix"] }, { Q13: ["logic"] }), 0.5);
  close(pairScore({ Q18: ["any"] }, { Q18: ["playful"] }), 0.5);
  close(pairScore({ Q21: ["s1"] }, { Q21: ["s5"] }), 0);
  close(pairScore({ Q21: ["s4"] }, { Q21: ["s5"] }), 0.75);
  close(pairScore({ Q11: ["age_25_34"] }, { Q11: ["age_35_44"] }), 0.75);
  close(pairScore({ Q05: ["food", "travel"] }, { Q05: ["travel", "music"] }), 1 / 3);
  close(pairScore({ Q23: ["yes"] }, { Q23: ["yes"] }), 1);
  close(pairScore({ Q24: ["married"] }, { Q24: ["single"] }), 0);
});

test("dimensions are weighted and renormalised over what both answered", () => {
  // values identical (1), interests disjoint (0): (0.32*1 + 0.12*0) / (0.32 + 0.12)
  close(pairScore({ Q13: ["logic"], Q05: ["food"] }, { Q13: ["logic"], Q05: ["music"] }), 0.32 / 0.44);
  // items inside one dimension count equally: Q13 same (1), Q21 opposite (0) -> values 0.5
  close(pairScore({ Q13: ["logic"], Q21: ["s1"] }, { Q13: ["logic"], Q21: ["s5"] }), 0.5);
  assert.equal(pairScore({ Q13: ["logic"] }, { Q05: ["food"] }), null, "nothing answered in common");
});

test("no_say, no_pref, unknown options and extra picks are dropped, never scored", () => {
  const { answers, dropped } = cleanAnswers({ Q23: ["no_say"], Q24: ["married"], Q06: ["no_pref", "spontaneous"], Q17: ["drama", "comedy"],
    Q05: ["food", "food", "junk_key"], Q08: ["x"], Q12: ["ambivert"] }, QUESTIONNAIRE);
  assert.deepEqual(answers, { Q24: ["married"], Q06: ["spontaneous"], Q05: ["food"], Q12: ["ambivert"] });
  assert.equal(dropped, 4, "duplicate food, junk_key and the two Q17 picks");
  close(pairScore(answers, { Q23: ["yes"], Q24: ["married"] }), 1, "Q23 is skipped for the pair, Q24 matches");
});

test("energy (Q12) is balanced, not matched: mixed tables score higher", () => {
  const g = (...levels) => levels.map((l, i) => member(`m${i}`, { Q12: [l] }));
  close(energyBalance(g("introvert", "ambivert", "extrovert", "ambivert")), 1);
  close(energyBalance(g("introvert", "introvert", "introvert", "introvert")), 1 / 3);
  assert.equal(energyBalance([member("a", { Q12: ["introvert"] }), member("b", {})]), null);
  const same = { Q13: ["logic"], Q17: ["drama"] };
  const mixed = scoreGroupPersonality(["introvert", "extrovert", "ambivert", "introvert"].map((l, i) => member(`x${i}`, { ...same, Q12: [l] })));
  const flat = scoreGroupPersonality(["introvert", "introvert", "introvert", "introvert"].map((l, i) => member(`y${i}`, { ...same, Q12: [l] })));
  assert.ok(mixed.score > flat.score);
  close(mixed.score, (1 - W_ENERGY) * 1 + W_ENERGY * 1);
});

test("cohesion: one member far from the rest pulls the table score down", () => {
  const close4 = Array.from({ length: 4 }, (_, i) => member(`c${i}`, { Q13: ["logic"], Q19: ["deep_talk"] }));
  const odd = [...close4.slice(0, 3), member("odd", { Q13: ["emotions"], Q19: ["games"] })];
  const a = scoreGroupPersonality(close4), b = scoreGroupPersonality(odd);
  close(a.cohesion, 1);
  close(b.cohesion, 0);
  assert.ok(a.score > b.score);
});

test("themes: shared by half the table, at most three, never from age, work, family, children or marital status", () => {
  const g = [
    member("a", { Q05: ["coffee", "travel"], Q19: ["deep_talk"], Q11: ["age_25_34"], Q16: ["finance"], Q23: ["yes"], Q24: ["married"], Q13: ["mix"] }),
    member("b", { Q05: ["coffee"], Q19: ["deep_talk"], Q11: ["age_25_34"], Q16: ["finance"], Q23: ["yes"], Q24: ["married"], Q13: ["mix"] }),
    member("c", { Q05: ["coffee", "travel"], Q19: ["games"], Q11: ["age_25_34"], Q16: ["finance"], Q23: ["yes"], Q24: ["married"], Q13: ["mix"] }),
    member("d", { Q05: ["music"], Q19: ["deep_talk"], Q11: ["age_25_34"], Q16: ["finance"], Q23: ["yes"], Q24: ["married"], Q13: ["mix"] }),
  ];
  assert.deepEqual(tableThemes(g), [{ q: "Q05", o: "coffee" }, { q: "Q19", o: "deep_talk" }, { q: "Q05", o: "travel" }]);
  const r = rng(7);
  for (let i = 0; i < 300; i++) {
    const grp = Array.from({ length: 4 + (i % 3) }, (_, k) => member(`r${k}`, cleanAnswers(randomAnswers(r), QUESTIONNAIRE).answers));
    const th = tableThemes(grp);
    assert.ok(th.length <= 3);
    for (const t of th) {
      assert.ok(THEME_QUESTIONS.includes(t.q), `theme from ${t.q}`);
      assert.ok(!["mix", "any", "no_pref", "no_say"].includes(t.o));
      assert.ok(grp.filter((m) => (m.answers[t.q] || []).includes(t.o)).length >= Math.max(2, Math.ceil(grp.length / 2)));
    }
  }
});

function pool(seed, n, opts = {}) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => ({
    booking_id: `b${String(i).padStart(3, "0")}`, user_id: `u${String(i).padStart(3, "0")}`, session_id: "S", status: "paid_awaiting_group",
    conversation_language: opts.oneCell ? "ar" : (r() < 0.7 ? "ar" : "en"), budget_tier_rank: opts.oneCell ? 2 : 1 + Math.floor(r() * 3),
    q05_topics: null, consents_current: true, age_attested: true, account_active: true, answers: randomAnswers(r),
  }));
}
const run = (bookings, extra = {}) => runMatching({ sessionId: "S", mode: "dry_run", ruleVersion: "r2-personality", seed: 11, bookings,
  questionnaire: QUESTIONNAIRE, ...extra });
const total = (tables) => tables.reduce((a, t) => a + (scoreGroupPersonality(t.members).score || 0), 0);

test("the questionnaire guard refuses to run when an option the engine relies on is missing", () => {
  assert.throws(() => run(pool(1, 8), { questionnaire: null }), /questionnaire options are required/);
  const { Q12, ...noEnergy } = QUESTIONNAIRE;
  assert.throws(() => run(pool(1, 8), { questionnaire: noEnergy }), /questionnaire is missing: Q12/);
  assert.throws(() => run(pool(1, 8), { questionnaire: { ...QUESTIONNAIRE, Q21: ["s1", "s2", "s3", "s4"] } }), /Q21\.s5/);
  assert.throws(() => run(pool(1, 8), { questionnaire: { ...QUESTIONNAIRE, Q13: ["logic", "emotions"] } }), /Q13\.mix/);
});

test("200 generated pools: deterministic, never worse than unoptimised seating, constraints hold", () => {
  for (let s = 1; s <= 200; s++) {
    const bookings = pool(s, 8 + (s % 30), { oneCell: true });
    const a = run(bookings), b = run(bookings);
    assert.equal(a.inputs_hash, b.inputs_hash);
    assert.deepEqual(a.tables.map((t) => t.members.map((m) => m.booking_id)), b.tables.map((t) => t.members.map((m) => m.booking_id)));
    const base = runMatching({ sessionId: "S", mode: "dry_run", ruleVersion: "r1-baseline", seed: 11, bookings });
    const clean = (t) => t.members.map((m) => ({ ...m, answers: cleanAnswers(m.answers, QUESTIONNAIRE).answers }));
    assert.ok(total(a.tables) >= total(base.tables.map((t) => ({ members: clean(t) }))) - 1e-12, `pool ${s} got worse`);
    for (const t of a.tables) assert.ok(t.members.length >= 4 && t.members.length <= 6);
  }
});

test("similar women are seated together: two clear profiles split into two tables", () => {
  const A = { Q13: ["logic"], Q21: ["s5"], Q22: ["s5"], Q14: ["intelligent", "loyal"], Q15: ["intelligent"], Q17: ["documentary"],
    Q09: ["conversations"], Q18: ["smart"], Q19: ["deep_talk"], Q20: ["calm"], Q05: ["books_culture", "tech"], Q11: ["age_35_44"],
    Q16: ["finance"], Q23: ["yes"], Q24: ["married"] };
  const B = { Q13: ["emotions"], Q21: ["s1"], Q22: ["s1"], Q14: ["funny", "warm"], Q15: ["funny"], Q17: ["comedy"],
    Q09: ["get_out"], Q18: ["playful"], Q19: ["games"], Q20: ["energized"], Q05: ["music", "gaming"], Q11: ["age_18_24"],
    Q16: ["student"], Q23: ["no"], Q24: ["single"] };
  const levels = ["introvert", "ambivert", "extrovert", "introvert", "ambivert", "extrovert"];
  const bookings = Array.from({ length: 12 }, (_, i) => ({
    booking_id: `p${String(i).padStart(2, "0")}`, user_id: `u${i}`, session_id: "S", status: "paid_awaiting_group",
    conversation_language: "ar", budget_tier_rank: 2, q05_topics: null, consents_current: true, age_attested: true, account_active: true,
    answers: { ...(i % 2 ? B : A), Q12: [levels[Math.floor(i / 2)]] },
  }));
  const res = run(bookings);
  assert.equal(res.tables.length, 2);
  for (const t of res.tables) {
    const kinds = new Set(t.members.map((m) => Number(m.booking_id.slice(1)) % 2));
    assert.equal(kinds.size, 1, `${t.table_code} mixes the two profiles`);
    assert.equal(new Set(t.members.map((m) => m.answers.Q12[0])).size, 3, "energies are balanced");
  }
  assert.equal(res.explanations.algorithm, "personality_v1");
  assert.equal(res.explanations.weights.dimensions.values, 0.32);
  assert.ok(res.tables.every((t) => t.themes.length > 0));
});

test("uneven profiles (6 + 5, 5 + 4, ...) still separate for any booking ids: moves fix wrongly sized tables", () => {
  const A = { Q13: ["logic"], Q19: ["deep_talk"], Q17: ["documentary"], Q05: ["books_culture"], Q24: ["married"] };
  const B = { Q13: ["emotions"], Q19: ["games"], Q17: ["comedy"], Q05: ["music"], Q24: ["single"] };
  const levels = ["introvert", "ambivert", "extrovert"];
  for (const n of [9, 10, 11, 12]) {
    for (let k = 0; k < 60; k++) {
      const bookings = Array.from({ length: n }, (_, i) => ({ booking_id: `id-${n}-${k}-${i}`, user_id: `u${i}`, session_id: "S", status: "paid_awaiting_group",
        conversation_language: "ar", budget_tier_rank: 2, q05_topics: null, consents_current: true, age_attested: true, account_active: true,
        answers: { ...(i % 2 ? B : A), Q12: [levels[Math.floor(i / 2) % 3]] } }));
      const res = run(bookings);
      for (const t of res.tables) {
        const kinds = new Set(t.members.map((m) => Number(m.booking_id.split("-")[3]) % 2));
        assert.equal(kinds.size, 1, `n=${n} k=${k}: ${t.table_code} mixes profiles`);
        assert.ok(t.members.length >= 4 && t.members.length <= 6);
      }
    }
  }
});

test("a changed answer changes the inputs hash; r1 runs are unaffected by answers", () => {
  const bookings = pool(5, 12, { oneCell: true });
  const changed = bookings.map((b, i) => (i ? b : { ...b, answers: { ...(b.answers || {}), Q24: ["div_wid"] } }));
  assert.notEqual(run(bookings).inputs_hash, run(changed).inputs_hash);
  const r1 = (bs) => runMatching({ sessionId: "S", mode: "dry_run", ruleVersion: "r1-interest", seed: 3, bookings: bs }).inputs_hash;
  assert.equal(r1(bookings), r1(changed));
  assert.equal(typeof scoreGroup, "function");
});
