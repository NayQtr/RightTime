// Quiz-first flow (spec 2026-10-28 §3, §5): pure helpers shared by app.js and the Node unit tests. No DOM here.

// Interstitial screens shown after a question key ("start" before the first question, "end" after the last).
export const INTERSTITIALS = {
  start: ["doha", "community"],
  Q11: ["how"],
  Q15: ["science"],
  Q05: ["vibe"],
  Q06: ["curating"],
  end: ["ready", "safety"],
};

export const QUIZ_STORE_KEY = "quiz";

// [{kind:"inter", id} | {kind:"q", key, index}]; anchors whose question is absent are skipped.
export function buildSteps(questions) {
  const steps = INTERSTITIALS.start.map((id) => ({ kind: "inter", id }));
  questions.forEach((q, index) => {
    steps.push({ kind: "q", key: q.key, index });
    for (const id of INTERSTITIALS[q.key] || []) steps.push({ kind: "inter", id });
  });
  for (const id of INTERSTITIALS.end) steps.push({ kind: "inter", id });
  return steps;
}

// A light summary of the user's own answers for the "your card" screen; the screen says it is not a test.
export function vibeOf(byKey) {
  const has = (key, opt) => (byKey[key] || []).includes(opt);
  if (has("Q12", "extrovert") && has("Q18", "playful")) return "playful";
  if (has("Q12", "introvert") && has("Q13", "logic")) return "calm";
  if (has("Q13", "emotions")) return "warm";
  return "curious";
}

// {question_id: option_ids[]} -> API answers, answered questions only.
export function toPayload(answers) {
  return Object.entries(answers || {}).filter(([, ids]) => ids && ids.length).map(([question_id, ids]) => ({ question_id, option_ids: [...ids] }));
}
