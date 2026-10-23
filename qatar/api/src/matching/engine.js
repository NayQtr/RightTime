// JavaScript port of qatar/matching/matching_engine.py (the reference implementation).
// Same inputs + seed => identical tables, leftovers, inputs_hash and explanations
// (verified by test/parity.test.mjs against the Python engine).
import { createHash } from "node:crypto";

export const MIN_TABLE = 4;
export const MAX_TABLE = 6;
export const W_INTEREST = 0.6;
export const W_COHESION = 0.4;
export const PACKING_MODES = ["min_leftovers", "greedy_6"];
export const RULE_OBJECTIVES = { "r1-baseline": "baseline_random", "r1-interest": "interest_opt_v1" };
const LANGUAGES = ["ar", "en"];
const MODES = ["dry_run", "published"];
const NO_PREF = "no_pref";
const MAX_OPT_PASSES = 50;

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

const scoreOf = (g) => scoreGroup(g).score || 0;

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
  let left = Math.min(n, k * maxSize);
  const sizes = [];
  for (let i = k; i > 0; i--) {
    const size = Math.min(maxSize, left - MIN_TABLE * (i - 1));
    sizes.push(size); left -= size;
  }
  return sizes;
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

function optimise(groups, blocks) {
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
            const before = scoreOf(groups[gi]) + scoreOf(groups[gj]);
            const after = scoreOf(ni) + scoreOf(nj);
            if (after > before + 1e-12) { groups[gi] = ni; groups[gj] = nj; improved = true; }
          }
        }
      }
    }
    if (!improved) break;
  }
  return groups;
}

function formGroups(cell, maxSize, blocks, algorithm, seed, packing, budget) {
  const ordered = stableShuffle(cell, seed);
  const sizes = tableSizes(ordered.length, maxSize, packing, budget ? budget.left : null);
  if (budget && budget.left !== null) budget.left -= sizes.length;
  if (!sizes.length) return [[], ordered.map((m) => [m, "cell_below_quorum"])];
  let [groups, unseated] = seatGreedy(ordered, sizes, blocks);
  if (algorithm === "interest_opt_v1" && groups.length > 1) groups = optimise(groups, blocks);
  return [groups, unseated];
}

function placeLeftoversDownward(tables, leftovers, maxSize, blocks, algorithm, seed, nextCode, packing, budget) {
  const remaining = [];
  const sorted = [...leftovers].sort((x, y) => cmp(stableKey(seed, x.booking.booking_id), stableKey(seed, y.booking.booking_id)));
  for (const lo of sorted) {
    const m = lo.booking;
    const fit = tables.filter((t) => t.language === m.conversation_language && t.tier_rank <= m.budget_tier_rank
      && t.members.length < maxSize && !conflicts(m, t.members, blocks));
    if (fit.length) {
      fit.sort((x, y) => (x.members.length - y.members.length) || (y.tier_rank - x.tier_rank) || cmp(x.table_code, y.table_code));
      fit[0].members.push(m);
    } else remaining.push(lo);
  }
  const finalLeft = [];
  const reasons = Object.fromEntries(remaining.map((lo) => [lo.booking.booking_id, lo.reason]));
  for (const lang of LANGUAGES) {
    const pool = remaining.filter((lo) => lo.booking.conversation_language === lang).map((lo) => lo.booking);
    const [groups, unseated] = formGroups(pool, maxSize, blocks, algorithm, seed, packing, budget);
    for (const g of groups) {
      tables.push({ table_code: nextCode(), language: lang, tier_rank: Math.min(...g.map((m) => m.budget_tier_rank)), members: [...g], venue_id: null });
    }
    for (const [m, r] of unseated) finalLeft.push({ booking: m, reason: reasons[m.booking_id] ?? r });
  }
  return [tables, finalLeft];
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

export function inputsHash(pool, blocks, params) {
  const doc = {
    params,
    pool: pool.map((b) => [b.booking_id, b.user_id, b.conversation_language, b.budget_tier_rank,
      b.q05_topics && b.q05_topics.length ? [...b.q05_topics].sort() : null]).sort((x, y) => cmp(x[0], y[0])),
    blocks: [...blocks].map((k) => k.split("|").sort()).sort(cmpList),
  };
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

function explain(tables, leftovers, ineligible, seed, algorithm, venueWarnings) {
  return {
    algorithm,
    weights: algorithm === "interest_opt_v1" ? { interest: W_INTEREST, cohesion: W_COHESION } : null,
    tables: tables.map((t) => ({
      table_code: t.table_code, language: t.language, tier_rank: t.tier_rank, size: t.members.length,
      venue_id: t.venue_id, seats: t.members.map((m) => pseudonym(seed, m.booking_id)),
      interest: t.interest === null ? null : round4(t.interest),
      cohesion: t.cohesion === null ? null : round4(t.cohesion),
      score: t.score === null ? null : round4(t.score),
      answered_q05: t.members.filter((m) => topics(m) !== null).length,
      checks: { same_language: true, tier_within_caps: true, no_blocked_pair: true, size_within_bounds: true },
      warnings: sharedTopicCount(t.members) < 2 ? ["solo interest coverage < 2 topics"] : [],
    })),
    leftovers: leftovers.map((lo) => ({ seat: pseudonym(seed, lo.booking.booking_id), reason: lo.reason })),
    ineligible: ineligible.map(([b, r]) => ({ seat: pseudonym(seed, b.booking_id), reason: r })),
    venue_warnings: venueWarnings,
  };
}

export function runMatching({ sessionId, mode, ruleVersion, seed, bookings, blockRows = [], venueCapacity = MAX_TABLE,
  venues = null, packingMode = "min_leftovers", maxTables = null }) {
  if (!MODES.includes(mode)) throw new MatchingError(`mode must be one of ${MODES}`);
  if (!(ruleVersion in RULE_OBJECTIVES)) throw new MatchingError(`unknown rule_version ${ruleVersion}`);
  if (!(venueCapacity >= MIN_TABLE && venueCapacity <= MAX_TABLE)) throw new MatchingError("venue_capacity must be between 4 and 6");
  if (!Number.isInteger(seed)) throw new MatchingError("seed must be an integer");
  if (!PACKING_MODES.includes(packingMode)) throw new MatchingError(`packing_mode must be one of ${PACKING_MODES}`);
  if (maxTables !== null && maxTables < 0) throw new MatchingError("max_tables must be >= 0");
  const budget = { left: maxTables };
  const algorithm = RULE_OBJECTIVES[ruleVersion];
  const blocks = blockedPairs(blockRows);

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
    const [groups, unseated] = formGroups(cells.get(k), venueCapacity, blocks, algorithm, seed, packingMode, budget);
    for (const g of groups) tables.push({ table_code: nextCode(), language: lang, tier_rank: Number(tier), members: [...g], venue_id: null });
    for (const [m, r] of unseated) leftovers.push({ booking: m, reason: r });
  }
  [tables, leftovers] = placeLeftoversDownward(tables, leftovers, venueCapacity, blocks, algorithm, seed, nextCode, packingMode, budget);
  const venueWarnings = assignVenues(tables, venues);
  for (const t of tables) {
    t.members.sort((x, y) => cmp(stableKey(seed, x.booking_id), stableKey(seed, y.booking_id)));
    const s = scoreGroup(t.members);
    t.interest = s.interest; t.cohesion = s.cohesion; t.score = s.score; t.member_scores = s.memberScores;
  }
  const errors = validateTables(tables, venueCapacity, blocks);
  if (errors.length) throw new MatchingError("hard constraint violated: " + errors.join("; "));
  const params = { session_id: sessionId, rule_version: ruleVersion, seed, venue_capacity: venueCapacity,
    packing_mode: packingMode, max_tables: maxTables };
  return {
    session_id: sessionId, mode, rule_version: ruleVersion, algorithm, seed,
    inputs_hash: inputsHash(pool, blocks, params),
    tables, leftovers, ineligible,
    explanations: explain(tables, leftovers, ineligible, seed, algorithm, venueWarnings),
  };
}
