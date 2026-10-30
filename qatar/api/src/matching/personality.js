// Personality scoring for rule version r2-personality (spec docs/specs/2026-10-30-personality-matching-design.md).
// JavaScript port of qatar/matching/personality.py; every sum runs left to right in the same order as the Python
// reference, so both engines produce bit-identical scores (test/parity.test.mjs).

// Dimension weights chosen by the owner (spec §1). They must sum to 1.
export const DIMENSIONS = [
  ["values", 0.32],
  ["personality", 0.28],
  ["social", 0.18],
  ["interests", 0.12],
  ["lifestyle", 0.10],
];
// Q12 (energy) is balanced at table level; it gets the share one item has inside the personality dimension.
export const ENERGY_QUESTION = "Q12";
export const ENERGY_LEVELS = ["introvert", "ambivert", "extrovert"];
export const W_ENERGY = 0.07;
export const W_MEAN = 0.6;
export const W_COHESION = 0.4;
const NO_SAY = "no_say";
const NO_PREF = "no_pref";

// kind: single | multi | scale (ordered options; similarity falls with distance). wild: options that give 0.5 with
// anything. order: option keys in rank order for scale questions.
export const FEATURES = [
  { q: "Q13", dim: "values", kind: "single", wild: ["mix"] },
  { q: "Q21", dim: "values", kind: "scale", order: ["s1", "s2", "s3", "s4", "s5"] },
  { q: "Q22", dim: "values", kind: "scale", order: ["s1", "s2", "s3", "s4", "s5"] },
  { q: "Q14", dim: "values", kind: "multi" },
  { q: "Q15", dim: "personality", kind: "multi" },
  { q: "Q06", dim: "personality", kind: "multi" },
  { q: "Q17", dim: "personality", kind: "single" },
  { q: "Q09", dim: "social", kind: "multi" },
  { q: "Q18", dim: "social", kind: "single", wild: ["any"] },
  { q: "Q19", dim: "social", kind: "single" },
  { q: "Q20", dim: "social", kind: "single" },
  { q: "Q05", dim: "interests", kind: "multi" },
  { q: "Q11", dim: "lifestyle", kind: "scale", order: ["age_18_24", "age_25_34", "age_35_44", "age_45_54", "age_55_plus"] },
  { q: "Q16", dim: "lifestyle", kind: "single" },
  { q: "Q23", dim: "lifestyle", kind: "single" },
  { q: "Q24", dim: "lifestyle", kind: "single" },
];
// Questions a member-facing "what you share" line may draw from (spec §6), in tie-break order.
export const THEME_QUESTIONS = ["Q05", "Q19", "Q18", "Q20", "Q09", "Q13", "Q14", "Q15", "Q17"];
const THEME_EXCLUDED_OPTIONS = new Set(["mix", "any", NO_PREF, NO_SAY]);
const MAX_THEMES = 3;

export class PersonalityError extends Error {}

function sumLR(xs) { let s = 0; for (const x of xs) s += x; return s; }
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

{
  const total = sumLR(DIMENSIONS.map(([, w]) => w));
  if (Math.abs(total - 1) > 1e-9) throw new Error(`dimension weights sum to ${total}, not 1`);
  for (const f of FEATURES) if (!DIMENSIONS.some(([d]) => d === f.dim)) throw new Error(`unknown dimension ${f.dim}`);
}

// Every option key the engine relies on must exist in the published questionnaire; anything missing is an error.
export function checkQuestionnaire(questionnaire) {
  if (!questionnaire || typeof questionnaire !== "object") throw new PersonalityError("questionnaire options are required for r2-personality");
  const missing = [];
  for (const f of [...FEATURES, { q: ENERGY_QUESTION, order: ENERGY_LEVELS }]) {
    const opts = questionnaire[f.q];
    if (!Array.isArray(opts)) { missing.push(f.q); continue; }
    for (const o of [...(f.order || []), ...(f.wild || [])]) if (!opts.includes(o)) missing.push(`${f.q}.${o}`);
  }
  if (missing.length) throw new PersonalityError(`questionnaire is missing: ${missing.join(", ")}`);
}

// Keeps only answers to known questions with options the questionnaire still has; counts what was dropped.
export function cleanAnswers(raw, questionnaire) {
  const out = {};
  let dropped = 0;
  for (const f of [...FEATURES, { q: ENERGY_QUESTION, kind: "single" }]) {
    const given = raw && Array.isArray(raw[f.q]) ? raw[f.q] : [];
    const valid = [...new Set(given)].filter((o) => questionnaire[f.q].includes(o)).sort(cmp);
    dropped += given.length - valid.length;
    const usable = valid.filter((o) => o !== NO_SAY && !(f.kind === "multi" && o === NO_PREF));
    if (usable.length && (f.kind === "multi" || usable.length === 1)) out[f.q] = usable;
    else if (usable.length > 1) dropped += usable.length;
  }
  return { answers: out, dropped };
}

function itemSim(f, a, b) {
  if (f.kind === "multi") {
    const sb = new Set(b);
    let inter = 0;
    for (const x of a) if (sb.has(x)) inter++;
    return inter / (a.length + b.length - inter);
  }
  const x = a[0], y = b[0];
  if (f.kind === "scale") return 1 - Math.abs(f.order.indexOf(x) - f.order.indexOf(y)) / (f.order.length - 1);
  if (x === y) return 1;
  if (f.wild && (f.wild.includes(x) || f.wild.includes(y))) return 0.5;
  return 0;
}

// Weighted similarity of two members in [0, 1], or null when they share no answered item.
export function pairScore(a, b) {
  let num = 0, den = 0;
  for (const [dim, w] of DIMENSIONS) {
    const sims = [];
    for (const f of FEATURES) {
      if (f.dim !== dim || !a[f.q] || !b[f.q]) continue;
      sims.push(itemSim(f, a[f.q], b[f.q]));
    }
    if (!sims.length) continue;
    num += w * (sumLR(sims) / sims.length);
    den += w;
  }
  return den ? num / den : null;
}

// Sum of every pair's similarity at the table: the clustering objective of the first optimisation pass. Unlike the
// table score it has no cohesion term, so swaps that move a table toward one profile always count as progress.
export function pairTotal(group) {
  let total = 0;
  for (let i = 0; i < group.length; i++)
    for (let j = i + 1; j < group.length; j++) {
      const s = pairScore(group[i].answers, group[j].answers);
      if (s !== null) total += s;
    }
  return total;
}

export function energyBalance(group) {
  const levels = group.map((m) => (m.answers[ENERGY_QUESTION] || [])[0]).filter((x) => x);
  if (levels.length < 2) return null;
  return new Set(levels).size / Math.min(3, levels.length);
}

// Same shape as the r1 scorer: interest = mean pair similarity, cohesion = lowest member mean, score, memberScores.
export function scoreGroupPersonality(group) {
  const memberScores = {};
  for (const m of group) memberScores[m.booking_id] = null;
  const perMember = Object.fromEntries(group.map((m) => [m.booking_id, []]));
  const pairs = [];
  for (let i = 0; i < group.length; i++)
    for (let j = i + 1; j < group.length; j++) {
      const s = pairScore(group[i].answers, group[j].answers);
      if (s === null) continue;
      pairs.push(s);
      perMember[group[i].booking_id].push(s);
      perMember[group[j].booking_id].push(s);
    }
  const energy = energyBalance(group);
  let similarity = null, mean = null, cohesion = null;
  if (pairs.length) {
    for (const m of group) {
      const xs = perMember[m.booking_id];
      if (xs.length) memberScores[m.booking_id] = sumLR(xs) / xs.length;
    }
    mean = sumLR(pairs) / pairs.length;
    cohesion = Math.min(...group.map((m) => memberScores[m.booking_id]).filter((v) => v !== null));
    similarity = W_MEAN * mean + W_COHESION * cohesion;
  }
  let score = null;
  if (similarity !== null && energy !== null) score = (1 - W_ENERGY) * similarity + W_ENERGY * energy;
  else if (similarity !== null) score = similarity;
  else if (energy !== null) score = W_ENERGY * energy;
  return { interest: mean, cohesion, score, memberScores, energy };
}

// Up to three options shared by at least half the table (and at least two members), from THEME_QUESTIONS only.
export function tableThemes(group) {
  const need = Math.max(2, Math.ceil(group.length / 2));
  const found = [];
  THEME_QUESTIONS.forEach((q, qi) => {
    const counts = new Map();
    for (const m of group) for (const o of m.answers[q] || []) if (!THEME_EXCLUDED_OPTIONS.has(o)) counts.set(o, (counts.get(o) || 0) + 1);
    for (const [o, n] of counts) if (n >= need) found.push({ q, o, n, qi });
  });
  found.sort((x, y) => (y.n - x.n) || (x.qi - y.qi) || cmp(x.o, y.o));
  return found.slice(0, MAX_THEMES).map(({ q, o }) => ({ q, o }));
}

export const PERSONALITY_WEIGHTS = Object.freeze({
  dimensions: Object.fromEntries(DIMENSIONS), energy_balance: W_ENERGY, mean: W_MEAN, cohesion: W_COHESION,
});
