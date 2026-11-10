// JavaScript port of qatar/matching/matching_engine.py (the reference implementation).
// Same inputs + seed => identical tables, leftovers, inputs_hash and explanations
// (verified by test/parity.test.mjs against the Python engine).
import { createHash } from "node:crypto";
import { checkQuestionnaire, cleanAnswers, pairTotal, PersonalityError, PERSONALITY_WEIGHTS, scoreGroupPersonality, tableThemes } from "./personality.js";

export const MIN_TABLE = 4;
export const MAX_TABLE = 6;
export const W_INTEREST = 0.6;
export const W_COHESION = 0.4;
export const PACKING_MODES = ["min_leftovers", "greedy_6"];
export const RULE_OBJECTIVES = { "r1-baseline": "baseline_random", "r1-interest": "interest_opt_v1", "r2-personality": "personality_v1" };
const PERSONALITY = "personality_v1";
const OPTIMISED = ["interest_opt_v1", PERSONALITY];
const LANGUAGES = ["ar", "en"];
const MODES = ["dry_run", "published"];
const NO_PREF = "no_pref";
const MAX_OPT_PASSES = 50;
// Celebration tables (migration 018): a woman celebrating an occasion is seated only with women whose Q25 answer
// says they would enjoy or not mind it. Applied as blocked pairs, so seating and validation enforce it like a block.
export const CELEBRATION_QUESTION = "Q25";
export const CELEBRATION_OK = ["love_to_join", "dont_mind"];
// Age range (Q11), in order: the age-gap rule counts bands between two women.
export const AGE_QUESTION = "Q11";
export const AGE_BANDS = ["age_18_24", "age_25_34", "age_35_44", "age_45_54", "age_55_plus"];

// Matching rules: the owner's proposals, built provisionally on 10 Nov 2026 (Notion fixes 1, 2, 5, 7, 8, 9, 13 and
// item 31). Change them here AND in MATCHING_RULES in qatar/matching/matching_engine.py: test/parity.test.mjs checks
// that both are equal. Days are Doha calendar days between two sessions (app.matching_input, migration 020). Scores and
// penalties are on the engine's 0..1 table-score scale. Soft rules (penalty, boost, size preference) steer the
// optimised rule versions only; r1-baseline stays random within the hard rules.
export const MATCHING_RULES = Object.freeze({
  repeat_block_days: 14,       // hard: the same two women never share a table again within 14 days...
  repeat_decay_end_days: 42,   // ...after that a penalty that falls linearly to 0 at 42 days...
  repeat_penalty: 0.1,         // ...worth 0.1 per pair at full strength. Both asked to stay in touch = no block, no penalty.
  max_age_band_gap: 2,         // hard: at most 2 Q11 age bands apart at one table; a woman without an age band is not limited
  small_pool_below: 24,        // a session with fewer eligible women than this is small, and then:
  small_repeat_block_days: 7,  //   the hard no-repeat window is 7 days
  small_max_age_band_gap: 3,   //   and 3 age bands apart are allowed
  // Coordinators see "Low match" on a table scoring below this (option b: everyone is still seated). Per algorithm,
  // because the scales differ: r2 averages similarity over all answers, r1 is Jaccard overlap of topics only.
  low_match_below: Object.freeze({ personality_v1: 0.3, interest_opt_v1: 0.15, baseline_random: 0.15 }),
  priority_days: 28,           // a woman left without a table in a session in the last 28 days (4 weeks)...
  priority_boost: 0.05,        // ...adds 0.05 to her table's score: she takes a seat when that costs the table less
  size4_penalty: 0.02,         // a table of 4 counts 0.02 less, so the engine prefers 5-6 when it can
});
// app.matching_input() returns history from this many days back (migration 020); the day windows above must fit in it.
export const HISTORY_LOOKBACK_DAYS = 90;
export const PRIORITY_REASON = "seat_given_to_priority";

export class MatchingError extends Error {}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const stableKey = (seed, id) => sha256(`shuffle:${seed}:${id}`);
const pseudonym = (seed, id) => "P-" + sha256(`${seed}:${id}`).slice(0, 8);
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const round4 = (x) => Number(x.toFixed(4));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function stableShuffle(items, seed) {
  return [...items].sort((x, y) => cmp(stableKey(seed, x.booking_id), stableKey(seed, y.booking_id)) || cmp(x.booking_id, y.booking_id));
}

function topics(b) {
  if (!b.q05_topics || b.q05_topics.length === 0) return null;
  const t = new Set(b.q05_topics.filter((x) => x !== NO_PREF));
  return t.size ? t : null;
}

export function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

export function blockedPairs(rows) {
  const s = new Set();
  for (const [a, b] of rows) if (a !== b) s.add(pairKey(a, b));
  return s;
}

export function celebrationPairs(pool) {
  const out = [];
  for (const c of pool) {
    if (!c.occasion) continue;
    for (const o of pool) {
      if (o.user_id === c.user_id) continue;
      const a = (o.answers && o.answers[CELEBRATION_QUESTION]) || [];
      if (!a.some((k) => CELEBRATION_OK.includes(k))) out.push([c.user_id, o.user_id]);
    }
  }
  return out;
}

// Rules in force for this pool: a small session (fewer than small_pool_below eligible women) relaxes the hard rules.
export function effectiveRules(poolSize, algorithm) {
  const R = MATCHING_RULES;
  const small = poolSize < R.small_pool_below;
  return {
    small_session: small,
    repeat_block_days: small ? R.small_repeat_block_days : R.repeat_block_days,
    repeat_decay_end_days: R.repeat_decay_end_days,
    repeat_penalty: R.repeat_penalty,
    max_age_band_gap: small ? R.small_max_age_band_gap : R.max_age_band_gap,
    priority_days: R.priority_days,
    priority_boost: R.priority_boost,
    size4_penalty: R.size4_penalty,
    low_match_below: R.low_match_below[algorithm],
  };
}

// Index of her Q11 age band, or null when she gave none (or more than one).
export function ageBand(b) {
  const given = b.answers && Array.isArray(b.answers[AGE_QUESTION]) ? b.answers[AGE_QUESTION] : [];
  const known = [...new Set(given.filter((x) => AGE_BANDS.includes(x)))];
  return known.length === 1 ? AGE_BANDS.indexOf(known[0]) : null;
}

// Pairs more than maxGap age bands apart; applied as blocked pairs (hard), like the celebration rule.
export function ageGapPairs(pool, maxGap) {
  const out = [], bands = pool.map(ageBand);
  for (let i = 0; i < pool.length; i++) {
    if (bands[i] === null) continue;
    for (let j = i + 1; j < pool.length; j++)
      if (bands[j] !== null && Math.abs(bands[i] - bands[j]) > maxGap) out.push([pool[i].user_id, pool[j].user_id]);
  }
  return out;
}

// history rows (app.matching_input, migration 020): [user_a, user_b, days between the two sessions, both asked to
// stay in touch]. Within the block window a repeat is a blocked pair; after it, a penalty factor from 1 down to 0.
export function repeatRules(history, rules) {
  const blocked = [], penalties = new Map();
  const span = rules.repeat_decay_end_days - rules.repeat_block_days;
  for (const [a, b, days, mutual] of history) {
    if (a === b || mutual) continue;
    if (days <= rules.repeat_block_days) blocked.push([a, b]);
    else if (days < rules.repeat_decay_end_days) {
      const f = (rules.repeat_decay_end_days - days) / span, k = pairKey(a, b);
      if (!penalties.has(k) || f > penalties.get(k)) penalties.set(k, f);
    }
  }
  return { blocked, penalties };
}

// Left without a table in a session within the last priority_days days.
const hasPriority = (b, rules) => b.unseated_days_ago !== null && b.unseated_days_ago !== undefined && b.unseated_days_ago <= rules.priority_days;

// Item 31: celebrants are seated first, so when the celebration rule leaves someone out it is the other woman.
const celebrantsFirst = (items, booking = (x) => x) => [...items.filter((x) => booking(x).occasion), ...items.filter((x) => !booking(x).occasion)];

const conflicts = (m, group, blocks) => group.some((o) => blocks.has(pairKey(m.user_id, o.user_id)));
function groupOk(group, blocks) {
  for (let i = 0; i < group.length; i++)
    for (let j = i + 1; j < group.length; j++)
      if (blocks.has(pairKey(group[i].user_id, group[j].user_id))) return false;
  return true;
}

function sum(xs) { let s = 0; for (const x of xs) s += x; return s; }

export function scoreGroup(group) {
  const answered = group.map((b) => [b, topics(b)]).filter(([, t]) => t !== null);
  const memberScores = {};
  for (const b of group) memberScores[b.booking_id] = null;
  if (answered.length < 2) return { interest: null, cohesion: null, score: null, memberScores };
  const pairs = [];
  for (let i = 0; i < answered.length; i++)
    for (let j = i + 1; j < answered.length; j++) pairs.push(jaccard(answered[i][1], answered[j][1]));
  const interest = sum(pairs) / pairs.length;
  for (const [b, tb] of answered) {
    const sims = answered.filter(([o]) => o.booking_id !== b.booking_id).map(([, to]) => jaccard(tb, to));
    memberScores[b.booking_id] = sum(sims) / sims.length;
  }
  const cohesion = Math.min(...Object.values(memberScores).filter((v) => v !== null));
  return { interest, cohesion, score: W_INTEREST * interest + W_COHESION * cohesion, memberScores };
}

const scorer = (algorithm) => (algorithm === PERSONALITY ? scoreGroupPersonality : scoreGroup);
const scoreOf = (g, algorithm) => scorer(algorithm)(g).score || 0;

// Soft rules at one table, on the score scale: the repeat penalty of every pair that met recently, the priority boost
// of each woman left without a table lately, and the size-4 penalty. soft = { penalties: Map pairKey -> factor,
// priority: Set of booking ids }.
function softParts(g, rules, soft) {
  let rp = 0, np = 0;
  if (soft.penalties.size) {
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const f = soft.penalties.get(pairKey(g[i].user_id, g[j].user_id));
        if (f !== undefined) rp += f;
      }
  }
  for (const m of g) if (soft.priority.has(m.booking_id)) np++;
  return { repeat_penalty: rules.repeat_penalty * rp, priority_boost: rules.priority_boost * np,
    size_penalty: g.length === MIN_TABLE ? rules.size4_penalty : 0 };
}
const objectiveOf = (score, p) => score - p.repeat_penalty + p.priority_boost - p.size_penalty;
// The value the optimiser maximises for one table: its score with the soft rules applied.
const makeObjective = (algorithm, rules, soft) => (g) => objectiveOf(scoreOf(g, algorithm), softParts(g, rules, soft));

// min_leftovers: as many seated as possible (fewest tables on a tie), then the seats are spread evenly, which gives
// the fewest tables of 4 (owner, 10 Nov: prefer 5-6; a table of 4 stays allowed). 10 -> 5 + 5, 16 -> 6 + 5 + 5.
export function tableSizes(n, maxSize, packing = "min_leftovers", maxTables = null) {
  const byPeople = Math.floor(n / MIN_TABLE);
  const limit = maxTables === null || maxTables === undefined ? byPeople : Math.min(maxTables, byPeople);
  if (limit <= 0) return [];
  if (packing === "greedy_6") {
    const full = Math.floor(n / maxSize), rest = n % maxSize;
    const sizes = Array(full).fill(maxSize).concat(rest >= MIN_TABLE ? [rest] : []);
    return sizes.slice(0, limit);
  }
  let k = 1, best = [Math.min(n, maxSize), -1];
  for (let c = 1; c <= limit; c++) {
    const key = [Math.min(n, c * maxSize), -c];
    if (key[0] > best[0] || (key[0] === best[0] && key[1] > best[1])) { best = key; k = c; }
  }
  const seated = Math.min(n, k * maxSize), base = Math.floor(seated / k), extra = seated % k;
  return Array.from({ length: k }, (_, i) => (i < extra ? base + 1 : base));
}

function seatGreedy(ordered, sizes, blocks) {
  const groups = sizes.map(() => []);
  const unseated = [];
  for (const m of ordered) {
    const options = groups.map((g, i) => i).filter((i) => groups[i].length < sizes[i]);
    if (!options.length) { unseated.push([m, "cell_below_quorum"]); continue; }
    const fit = options.filter((i) => !conflicts(m, groups[i], blocks));
    if (!fit.length) { unseated.push([m, "blocked_conflict"]); continue; }
    let target = fit[0];
    for (const i of fit) if (groups[i].length < groups[target].length) target = i;
    groups[target].push(m);
  }
  const keep = [];
  for (const g of groups) {
    if (g.length >= MIN_TABLE) keep.push(g);
    else for (const m of g) unseated.push([m, "cell_below_quorum"]);
  }
  const maxSize = Math.max(...sizes);
  const still = [];
  for (const [m, reason] of unseated) {
    const fit = keep.filter((g) => g.length < maxSize && !conflicts(m, g, blocks));
    if (fit.length) {
      let t = fit[0];
      for (const g of fit) if (g.length < t.length) t = g;
      t.push(m);
    } else still.push([m, reason]);
  }
  return [keep, still];
}

// maxSize set (r2 only): after the swaps of each pass, single-member moves between tables are also tried, keeping
// every table within MIN_TABLE..maxSize. Without them, tables of 6 and 5 can lock the wrong profile into each size.
function optimise(groups, blocks, value, maxSize = null) {
  for (let pass = 0; pass < MAX_OPT_PASSES; pass++) {
    let improved = false;
    for (let gi = 0; gi < groups.length; gi++) {
      for (let gj = gi + 1; gj < groups.length; gj++) {
        for (let ai = 0; ai < groups[gi].length; ai++) {
          for (let bi = 0; bi < groups[gj].length; bi++) {
            const a = groups[gi][ai], b = groups[gj][bi];
            const ni = [...groups[gi].slice(0, ai), b, ...groups[gi].slice(ai + 1)];
            const nj = [...groups[gj].slice(0, bi), a, ...groups[gj].slice(bi + 1)];
            if (!(groupOk(ni, blocks) && groupOk(nj, blocks))) continue;
            const before = value(groups[gi]) + value(groups[gj]);
            const after = value(ni) + value(nj);
            if (after > before + 1e-12) { groups[gi] = ni; groups[gj] = nj; improved = true; }
          }
        }
      }
    }
    if (maxSize !== null) for (let moves = 0; moves < MAX_MOVES && moveOnce(groups, blocks, value, maxSize); moves++) improved = true;
    if (!improved) break;
  }
  return groups;
}

const MAX_MOVES = 200;
// Applies the first strictly improving single-member move (fixed scan order); returns whether one was applied.
function moveOnce(groups, blocks, value, maxSize) {
  for (let gi = 0; gi < groups.length; gi++) {
    if (groups[gi].length <= MIN_TABLE) continue;
    for (let gj = 0; gj < groups.length; gj++) {
      if (gj === gi || groups[gj].length >= maxSize) continue;
      for (let ai = 0; ai < groups[gi].length; ai++) {
        const a = groups[gi][ai];
        if (conflicts(a, groups[gj], blocks)) continue;
        const ni = [...groups[gi].slice(0, ai), ...groups[gi].slice(ai + 1)];
        const nj = [...groups[gj], a];
        if (value(ni) + value(nj) > value(groups[gi]) + value(groups[gj]) + 1e-12) { groups[gi] = ni; groups[gj] = nj; return true; }
      }
    }
  }
  return false;
}

// r2: the table score's cohesion term can trap swap search between two profiles (3+3 never becomes 4+2 even though
// 6+0 is best), so a second start first clusters on pairTotal, then both starts climb on the table score and the
// higher total wins. The result is never below the plain climb.
function optimiseFor(groups, blocks, algorithm, maxSize, objective) {
  if (algorithm !== PERSONALITY) return optimise(groups, blocks, objective);
  // tables are never changed in place during the search (a swap or move builds new arrays), so a table's value can
  // be kept per array; the climb asks for the same unchanged table on every candidate swap
  const memo = (fn) => { const seen = new WeakMap(); return (g) => { if (!seen.has(g)) seen.set(g, fn(g)); return seen.get(g); }; };
  const value = memo(objective);
  const plain = optimise(groups.map((g) => [...g]), blocks, value, maxSize);
  const clustered = optimise(optimise(groups.map((g) => [...g]), blocks, memo(pairTotal), maxSize), blocks, value, maxSize);
  const total = (gs) => sum(gs.map(value));
  return total(clustered) > total(plain) + 1e-12 ? clustered : plain;
}

function formGroups(cell, maxSize, blocks, algorithm, seed, packing, budget, objective) {
  const ordered = celebrantsFirst(stableShuffle(cell, seed));
  const sizes = tableSizes(ordered.length, maxSize, packing, budget ? budget.left : null);
  if (budget && budget.left !== null) budget.left -= sizes.length;
  if (!sizes.length) return [[], ordered.map((m) => [m, "cell_below_quorum"])];
  let [groups, unseated] = seatGreedy(ordered, sizes, blocks);
  if (OPTIMISED.includes(algorithm) && groups.length > 1) groups = optimiseFor(groups, blocks, algorithm, maxSize, objective);
  return [groups, unseated];
}

const tableFit = (x, y) => (x.members.length - y.members.length) || (y.tier_rank - x.tier_rank) || cmp(x.table_code, y.table_code);
const canJoin = (m, t, maxSize, blocks) => t.language === m.conversation_language && t.tier_rank <= m.budget_tier_rank
  && t.members.length < maxSize && !conflicts(m, t.members, blocks);

function placeLeftoversDownward(tables, leftovers, maxSize, blocks, algorithm, seed, nextCode, packing, budget, objective) {
  const remaining = [];
  const sorted = celebrantsFirst([...leftovers].sort((x, y) => cmp(stableKey(seed, x.booking.booking_id), stableKey(seed, y.booking.booking_id))), (lo) => lo.booking);
  for (const lo of sorted) {
    const m = lo.booking;
    const fit = tables.filter((t) => canJoin(m, t, maxSize, blocks));
    if (fit.length) {
      fit.sort(tableFit);
      fit[0].members.push(m);
    } else remaining.push(lo);
  }
  const finalLeft = [];
  const reasons = Object.fromEntries(remaining.map((lo) => [lo.booking.booking_id, lo.reason]));
  for (const lang of LANGUAGES) {
    const pool = remaining.filter((lo) => lo.booking.conversation_language === lang).map((lo) => lo.booking);
    const [groups, unseated] = formGroups(pool, maxSize, blocks, algorithm, seed, packing, budget, objective);
    for (const g of groups) {
      tables.push({ table_code: nextCode(), language: lang, tier_rank: Math.min(...g.map((m) => m.budget_tier_rank)), members: [...g], venue_id: null });
    }
    for (const [m, r] of unseated) finalLeft.push({ booking: m, reason: reasons[m.booking_id] ?? r });
  }
  return [tables, finalLeft];
}

// Priority (Notion fix 9): a woman still without a seat who was left without a table lately takes the seat of a woman
// without priority when the table's value (score with the boost) rises, i.e. when the swap costs the table less than
// the boost. The best such swap is taken; a celebrant is never the one who gives up her seat (item 31). The woman who
// gives up her seat takes any other seat she fits, else she is a leftover. The number seated never falls.
function seatPriority(tables, leftovers, maxSize, blocks, objective, soft, seed) {
  let left = [...leftovers];
  const queue = left.filter((lo) => soft.priority.has(lo.booking.booking_id))
    .sort((x, y) => cmp(stableKey(seed, x.booking.booking_id), stableKey(seed, y.booking.booking_id)));
  for (const lo of queue) {
    const m = lo.booking;
    let best = null;
    for (const t of tables) {
      if (t.language !== m.conversation_language || t.tier_rank > m.budget_tier_rank) continue;
      const before = objective(t.members);
      for (let i = 0; i < t.members.length; i++) {
        const s = t.members[i];
        if (soft.priority.has(s.booking_id) || s.occasion) continue;
        const cand = [...t.members.slice(0, i), m, ...t.members.slice(i + 1)];
        if (!groupOk(cand, blocks)) continue;
        const gain = objective(cand) - before;
        if (gain > 1e-12 && (best === null || gain > best.gain + 1e-12)) best = { t, i, gain, cand };
      }
    }
    if (!best) continue;
    const out = best.t.members[best.i];
    best.t.members = best.cand;
    left = left.filter((x) => x !== lo);
    const fit = tables.filter((t) => t !== best.t && canJoin(out, t, maxSize, blocks));
    if (fit.length) { fit.sort(tableFit); fit[0].members.push(out); } else left.push({ booking: out, reason: PRIORITY_REASON });
  }
  return left;
}

function assignVenues(tables, venues) {
  const warnings = [];
  if (!venues) return warnings;
  const stock = Object.fromEntries(venues.map((v) => [v.venue_id, v.tables_available]));
  const order = [...tables].sort((x, y) => (y.members.length - x.members.length) || cmp(x.table_code, y.table_code));
  for (const t of order) {
    const fit = venues.filter((v) => v.tier_rank <= t.tier_rank && v.capacity >= t.members.length && stock[v.venue_id] > 0);
    if (!fit.length) { warnings.push(`${t.table_code}: no_venue_available`); continue; }
    fit.sort((x, y) => (y.tier_rank - x.tier_rank) || cmp(x.venue_id, y.venue_id));
    t.venue_id = fit[0].venue_id;
    stock[fit[0].venue_id] -= 1;
  }
  return warnings;
}

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

function cmpList(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = cmp(a[i], b[i]); if (c) return c;
  }
  return a.length - b.length;
}

// history and unseated days (migration 020) are added only when present, so earlier runs keep their hash.
export function inputsHash(pool, blocks, params, withAnswers = false, history = []) {
  const doc = {
    params,
    pool: pool.map((b) => [b.booking_id, b.user_id, b.conversation_language, b.budget_tier_rank,
      b.q05_topics && b.q05_topics.length ? [...b.q05_topics].sort() : null,
      ...(withAnswers ? [b.answers] : [])]).sort((x, y) => cmp(x[0], y[0])),
    blocks: [...blocks].map((k) => k.split("|").sort()).sort(cmpList),
  };
  if (history.length) doc.history = history.map(([a, b, d, m]) => (a < b ? [a, b, d, !!m] : [b, a, d, !!m])).sort(cmpList);
  const unseated = pool.filter((b) => b.unseated_days_ago !== null && b.unseated_days_ago !== undefined)
    .map((b) => [b.booking_id, b.unseated_days_ago]).sort(cmpList);
  if (unseated.length) doc.unseated = unseated;
  return sha256(canonical(doc));
}

export function validateTables(tables, maxSize, blocks) {
  const errors = [];
  const seen = new Set();
  for (const t of tables) {
    const n = t.members.length;
    if (n < MIN_TABLE || n > maxSize) errors.push(`${t.table_code}: size ${n} outside ${MIN_TABLE}..${maxSize}`);
    if (!t.members.every((m) => m.conversation_language === t.language)) errors.push(`${t.table_code}: mixed or wrong language`);
    if (t.members.some((m) => m.budget_tier_rank < t.tier_rank)) errors.push(`${t.table_code}: tier above a member's cap`);
    if (!groupOk(t.members, blocks)) errors.push(`${t.table_code}: blocked pair seated together`);
    for (const m of t.members) { if (seen.has(m.booking_id)) errors.push(`${t.table_code}: booking seated twice`); seen.add(m.booking_id); }
  }
  return errors;
}

function sharedTopicCount(group) {
  const counts = {};
  for (const b of group) for (const t of topics(b) || []) counts[t] = (counts[t] || 0) + 1;
  return Object.values(counts).filter((c) => c >= 2).length;
}

function explain(tables, leftovers, ineligible, seed, algorithm, venueWarnings, answersDropped, rules) {
  const personality = algorithm === PERSONALITY;
  const out = {
    algorithm,
    weights: algorithm === "interest_opt_v1" ? { interest: W_INTEREST, cohesion: W_COHESION } : personality ? PERSONALITY_WEIGHTS : null,
    rules,
    tables: tables.map((t) => ({
      table_code: t.table_code, language: t.language, tier_rank: t.tier_rank, size: t.members.length,
      venue_id: t.venue_id, seats: t.members.map((m) => pseudonym(seed, m.booking_id)),
      interest: t.interest === null ? null : round4(t.interest),
      cohesion: t.cohesion === null ? null : round4(t.cohesion),
      score: t.score === null ? null : round4(t.score),
      repeat_penalty: round4(t.soft.repeat_penalty), priority_boost: round4(t.soft.priority_boost),
      size_penalty: round4(t.soft.size_penalty), objective: round4(t.objective),
      low_match: t.low_match,
      answered_q05: t.members.filter((m) => topics(m) !== null).length,
      checks: { same_language: true, tier_within_caps: true, no_blocked_pair: true, size_within_bounds: true,
        no_recent_repeat: true, age_gap_within_limit: true },
      ...(personality ? {
        energy_balance: t.energy === null ? null : round4(t.energy),
        answered: t.members.filter((m) => Object.keys(m.answers).length > 0).length,
        warnings: t.members.filter((m) => Object.keys(m.answers).length > 0).length < 2 ? ["fewer than 2 members answered the questionnaire"] : [],
      } : { warnings: sharedTopicCount(t.members) < 2 ? ["solo interest coverage < 2 topics"] : [] }),
    })),
    leftovers: leftovers.map((lo) => ({ seat: pseudonym(seed, lo.booking.booking_id), reason: lo.reason })),
    ineligible: ineligible.map(([b, r]) => ({ seat: pseudonym(seed, b.booking_id), reason: r })),
    venue_warnings: venueWarnings,
  };
  if (personality) out.answers_dropped = answersDropped;
  return out;
}

// history: rows [user_a, user_b, days apart, mutual] (see repeatRules); each booking may carry unseated_days_ago.
export function runMatching({ sessionId, mode, ruleVersion, seed, bookings, blockRows = [], venueCapacity = MAX_TABLE,
  venues = null, packingMode = "min_leftovers", maxTables = null, questionnaire = null, history = [] }) {
  if (!MODES.includes(mode)) throw new MatchingError(`mode must be one of ${MODES}`);
  if (!(ruleVersion in RULE_OBJECTIVES)) throw new MatchingError(`unknown rule_version ${ruleVersion}`);
  if (!(venueCapacity >= MIN_TABLE && venueCapacity <= MAX_TABLE)) throw new MatchingError("venue_capacity must be between 4 and 6");
  if (!Number.isInteger(seed)) throw new MatchingError("seed must be an integer");
  if (!PACKING_MODES.includes(packingMode)) throw new MatchingError(`packing_mode must be one of ${PACKING_MODES}`);
  if (maxTables !== null && maxTables < 0) throw new MatchingError("max_tables must be >= 0");
  const budget = { left: maxTables };
  const algorithm = RULE_OBJECTIVES[ruleVersion];
  const personality = algorithm === PERSONALITY;
  if (personality) {
    try { checkQuestionnaire(questionnaire); } catch (e) { throw e instanceof PersonalityError ? new MatchingError(e.message) : e; }
  }
  const pool = [], ineligible = [], seenUsers = new Set();
  for (const b of bookings) {
    if (b.session_id !== sessionId) throw new MatchingError(`booking ${b.booking_id} belongs to another session`);
    if (!LANGUAGES.includes(b.conversation_language)) throw new MatchingError(`booking ${b.booking_id} has invalid language`);
    if (b.status !== "paid_awaiting_group") ineligible.push([b, "status_not_paid_awaiting_group"]);
    else if (!b.consents_current) ineligible.push([b, "consents_not_current"]);
    else if (!(b.age_attested && b.account_active)) ineligible.push([b, "not_eligible"]);
    else if (seenUsers.has(b.user_id)) ineligible.push([b, "duplicate_user_in_session"]);
    else { seenUsers.add(b.user_id); pool.push(b); }
  }
  history = history || [];
  const rules = effectiveRules(pool.length, algorithm);
  const repeats = repeatRules(history, rules);
  const blocks = blockedPairs([...blockRows, ...celebrationPairs(pool), ...ageGapPairs(pool, rules.max_age_band_gap), ...repeats.blocked]);
  const soft = { penalties: repeats.penalties, priority: new Set(pool.filter((b) => hasPriority(b, rules)).map((b) => b.booking_id)) };
  const objective = makeObjective(algorithm, rules, soft);
  let answersDropped = 0;
  if (personality) {
    for (let i = 0; i < pool.length; i++) {
      const c = cleanAnswers(pool[i].answers, questionnaire);
      answersDropped += c.dropped;
      pool[i] = { ...pool[i], answers: c.answers };
    }
  }

  let n = 0;
  const nextCode = () => `T${String(++n).padStart(2, "0")}`;
  const cells = new Map();
  for (const b of pool) {
    const k = `${b.conversation_language}|${String(b.budget_tier_rank).padStart(6, "0")}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(b);
  }
  let tables = [], leftovers = [];
  for (const k of [...cells.keys()].sort()) {
    const [lang, tier] = k.split("|");
    const [groups, unseated] = formGroups(cells.get(k), venueCapacity, blocks, algorithm, seed, packingMode, budget, objective);
    for (const g of groups) tables.push({ table_code: nextCode(), language: lang, tier_rank: Number(tier), members: [...g], venue_id: null });
    for (const [m, r] of unseated) leftovers.push({ booking: m, reason: r });
  }
  [tables, leftovers] = placeLeftoversDownward(tables, leftovers, venueCapacity, blocks, algorithm, seed, nextCode, packingMode, budget, objective);
  if (OPTIMISED.includes(algorithm) && soft.priority.size) leftovers = seatPriority(tables, leftovers, venueCapacity, blocks, objective, soft, seed);
  const venueWarnings = assignVenues(tables, venues);
  for (const t of tables) {
    t.members.sort((x, y) => cmp(stableKey(seed, x.booking_id), stableKey(seed, y.booking_id)));
    const s = scorer(algorithm)(t.members);
    t.interest = s.interest; t.cohesion = s.cohesion; t.score = s.score; t.member_scores = s.memberScores;
    t.energy = personality ? s.energy : null;
    t.themes = personality ? tableThemes(t.members) : [];
    t.soft = softParts(t.members, rules, soft);
    t.objective = objectiveOf(t.score || 0, t.soft);
    t.low_match = t.score !== null && t.score < rules.low_match_below;
  }
  const errors = validateTables(tables, venueCapacity, blocks);
  if (errors.length) throw new MatchingError("hard constraint violated: " + errors.join("; "));
  const params = { session_id: sessionId, rule_version: ruleVersion, seed, venue_capacity: venueCapacity,
    packing_mode: packingMode, max_tables: maxTables };
  return {
    session_id: sessionId, mode, rule_version: ruleVersion, algorithm, seed,
    inputs_hash: inputsHash(pool, blocks, params, personality, history),
    tables, leftovers, ineligible, rules,
    explanations: explain(tables, leftovers, ineligible, seed, algorithm, venueWarnings, answersDropped, rules),
  };
}
