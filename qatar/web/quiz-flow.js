// Quiz-first flow (spec 2026-10-28 §3, §5): pure helpers shared by app.js and the Node unit tests. No DOM here.

// Interstitial screens shown after a question key ("start" before the first question, "end" after the last).
export const INTERSTITIALS = {
  start: ["doha", "community"],
  Q11: ["how"],
  Q12: ["energy"],
  Q15: ["science"],
  Q05: ["vibe"],
  Q06: ["curating"],
  end: ["ready", "safety", "data"],
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

// The answer to Q12 (energy) for the reply screen after it; "any" when skipped or not one of the three levels.
export function energyOf(byKey) {
  const level = (byKey.Q12 || [])[0];
  return ["introvert", "ambivert", "extrovert"].includes(level) ? level : "any";
}

// Time left in the questionnaire (U3, provisional 10 Nov: progress and time left only, no streaks, badges or points):
// the questions still to answer, this one included, times an average number of seconds per question, in whole minutes;
// 0 means less than a minute. The app uses the same figure (quiz_view_model.dart, secondsPerQuestion).
export const SECONDS_PER_QUESTION = 10;
export function minutesLeft(remaining, seconds = SECONDS_PER_QUESTION) {
  const s = Math.max(0, remaining) * seconds;
  return s < 60 ? 0 : Math.round(s / 60);
}

// {question_id: option_ids[]} -> API answers, answered questions only.
export function toPayload(answers) {
  return Object.entries(answers || {}).filter(([, ids]) => ids && ids.length).map(([question_id, ids]) => ({ question_id, option_ids: [...ids] }));
}

// Where a signed-in user resumes: the question right after the furthest one answered (optional questions skipped
// earlier are not replayed); the first question when nothing is answered or the last one already is.
export function firstOpenStep(steps, questions, answers) {
  const qSteps = steps.map((s, i) => [s, i]).filter(([s]) => s.kind === "q");
  const answered = (s) => ((answers || {})[questions[s.index].id] || []).length > 0;
  let last = -1;
  qSteps.forEach(([s], k) => { if (answered(s)) last = k; });
  const next = qSteps[last + 1] || qSteps[0];
  return next ? next[1] : 0;
}
