// Pure logic of the quiz-first flow (web/quiz-flow.js): step order with interstitials, the vibe card, payloads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INTERSTITIALS, QUIZ_STORE_KEY, buildSteps, firstOpenStep, toPayload, vibeOf } from "../../web/quiz-flow.js";

const qs = (...keys) => keys.map((key) => ({ key }));
const label = (s) => (s.kind === "inter" ? `[${s.id}]` : s.key);

test("buildSteps: interstitials after their anchor keys, start first, end last", () => {
  const steps = buildSteps(qs("Q09", "Q10", "Q11", "Q12", "Q15", "Q01", "Q05", "Q06", "Q07"));
  assert.deepEqual(steps.map(label), [
    "[doha]", "[community]", "Q09", "Q10", "Q11", "[how]", "Q12", "Q15", "[science]", "Q01", "Q05", "[vibe]", "Q06", "[curating]", "Q07", "[ready]", "[safety]",
  ]);
  assert.deepEqual(steps.filter((s) => s.kind === "q").map((s) => s.index), [0, 1, 2, 3, 4, 5, 6, 7, 8], "index points into the question list");
});

test("buildSteps: an anchor whose question is absent is skipped", () => {
  const steps = buildSteps(qs("Q01", "Q04"));
  assert.deepEqual(steps.map(label), ["[doha]", "[community]", "Q01", "Q04", "[ready]", "[safety]"]);
  assert.deepEqual(INTERSTITIALS.start, ["doha", "community"]);
});

test("vibeOf: four light summaries, first matching rule wins", () => {
  assert.equal(vibeOf({ Q12: ["extrovert"], Q18: ["playful"], Q13: ["emotions"] }), "playful");
  assert.equal(vibeOf({ Q12: ["introvert"], Q13: ["logic"] }), "calm");
  assert.equal(vibeOf({ Q12: ["ambivert"], Q13: ["emotions"] }), "warm");
  assert.equal(vibeOf({ Q12: ["extrovert"], Q13: ["mix"] }), "curious");
  assert.equal(vibeOf({}), "curious");
});

test("toPayload: only answered questions, as API answers", () => {
  assert.deepEqual(toPayload({ a: ["1", "2"], b: [], c: ["3"] }), [{ question_id: "a", option_ids: ["1", "2"] }, { question_id: "c", option_ids: ["3"] }]);
  assert.deepEqual(toPayload(null), []);
  assert.equal(QUIZ_STORE_KEY, "quiz");
});

test("firstOpenStep: resumes at the first unanswered question, after the interstitials", () => {
  const questions = ["Q09", "Q10", "Q11", "Q12"].map((key) => ({ key, id: key.toLowerCase() }));
  const steps = buildSteps(questions);
  assert.equal(label(steps[firstOpenStep(steps, questions, {})]), "Q09", "nothing answered: first question, not the intro");
  assert.equal(label(steps[firstOpenStep(steps, questions, { q09: ["a"], q10: ["b"] })]), "Q11");
  assert.equal(label(steps[firstOpenStep(steps, questions, { q09: ["a"], q10: [], q11: ["c"] })]), "Q10", "an emptied answer counts as open");
  assert.equal(label(steps[firstOpenStep(steps, questions, { q09: ["a"], q10: ["b"], q11: ["c"], q12: ["d"] })]), "Q09", "all answered: back to the start");
  assert.equal(firstOpenStep(buildSteps([]), [], null), 0);
});
