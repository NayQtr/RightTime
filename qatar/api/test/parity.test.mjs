// The JS engine must reproduce the Python reference engine exactly on randomised inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runMatching } from "../src/matching/engine.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MATCHING_DIR = path.resolve(HERE, "../../matching");
const TOPICS = ["food", "travel", "sport", "books_culture", "creative_hobbies", "tech", "no_pref"];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function makeJob(seed) {
  const r = rng(seed);
  const n = 1 + Math.floor(r() * 30);
  const bookings = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(r() * 4);
    const t = new Set(); for (let j = 0; j < k; j++) t.add(TOPICS[Math.floor(r() * TOPICS.length)]);
    bookings.push({
      booking_id: `b${String(i).padStart(3, "0")}-${seed}`, user_id: `u${String(i).padStart(3, "0")}`, session_id: "S",
      status: r() < 0.93 ? "paid_awaiting_group" : "payment_pending",
      conversation_language: r() < 0.7 ? "ar" : "en", budget_tier_rank: 1 + Math.floor(r() * 3),
      q05_topics: t.size ? [...t] : null, consents_current: r() < 0.97, age_attested: true, account_active: true,
    });
  }
  const blocks = [];
  for (let i = 0; i < Math.floor(r() * 6); i++) blocks.push([`u${String(Math.floor(r() * n)).padStart(3, "0")}`, `u${String(Math.floor(r() * n)).padStart(3, "0")}`]);
  const venues = r() < 0.5 ? null : [
    { venue_id: "v-a", tier_rank: 1, capacity: 6, tables_available: 1 + Math.floor(r() * 3) },
    { venue_id: "v-b", tier_rank: 2, capacity: 6, tables_available: 1 + Math.floor(r() * 3) },
    { venue_id: "v-c", tier_rank: 3, capacity: 5 + Math.floor(r() * 2), tables_available: 1 },
  ];
  return {
    session_id: "S", mode: r() < 0.5 ? "dry_run" : "published", rule_version: r() < 0.5 ? "r1-baseline" : "r1-interest",
    seed: Math.floor(r() * 1e9), bookings, blocks, venues, venue_capacity: 4 + Math.floor(r() * 3),
    packing_mode: r() < 0.6 ? "min_leftovers" : "greedy_6", max_tables: r() < 0.5 ? null : Math.floor(r() * 5),
  };
}

function runJs(job) {
  const res = runMatching({ sessionId: job.session_id, mode: job.mode, ruleVersion: job.rule_version, seed: job.seed,
    bookings: job.bookings, blockRows: job.blocks, venueCapacity: job.venue_capacity, venues: job.venues,
    packingMode: job.packing_mode, maxTables: job.max_tables });
  return {
    tables: res.tables.map((t) => ({ code: t.table_code, language: t.language, tier: t.tier_rank, venue_id: t.venue_id, members: t.members.map((m) => m.booking_id) })),
    leftovers: res.leftovers.map((lo) => [lo.booking.booking_id, lo.reason]),
    ineligible: res.ineligible.map(([b, r]) => [b.booking_id, r]),
    inputs_hash: res.inputs_hash,
    explanations: res.explanations,
  };
}

test("JS engine == Python engine on 300 random jobs", () => {
  const jobs = Array.from({ length: 300 }, (_, i) => makeJob(i + 1));
  const py = execFileSync("python3", ["-c", `
import json, sys, subprocess
jobs = json.load(sys.stdin)
out = []
for j in jobs:
    p = subprocess.run([sys.executable, "parity_driver.py"], input=json.dumps(j), capture_output=True, text=True, cwd=${JSON.stringify(MATCHING_DIR)})
    out.append(json.loads(p.stdout) if p.returncode == 0 else {"error": p.stderr.strip().splitlines()[-1]})
print(json.dumps(out))
`], { input: JSON.stringify(jobs), maxBuffer: 64 * 1024 * 1024 }).toString();
  const pyResults = JSON.parse(py);
  let compared = 0;
  jobs.forEach((job, i) => {
    let js;
    try { js = runJs(job); } catch (e) { js = { error: e.message }; }
    if (pyResults[i].error || js.error) {
      assert.ok(pyResults[i].error && js.error, `job ${i + 1}: only one engine failed: py=${pyResults[i].error} js=${js.error}`);
      return;
    }
    assert.deepEqual(js, pyResults[i], `job ${i + 1} differs`);
    compared++;
  });
  assert.ok(compared > 250, `only ${compared} jobs compared`);
});
