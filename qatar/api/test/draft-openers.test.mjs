// Table opener drafts (ops/draft-openers.mjs): the dry run lists every (question, option) pair a shared-themes line can
// show, from the questionnaire seed, without a key or a network call; without a key the real run stops clearly.
// Also the approved-library lookup (lib/openers.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openerPrompt, themePairs } from "../../ops/draft-openers.mjs";
import { OPENERS, openerFor } from "../src/lib/openers.js";
import { THEME_QUESTIONS } from "../src/matching/personality.js";

const SCRIPT = fileURLToPath(new URL("../../ops/draft-openers.mjs", import.meta.url));
const noKey = { ...process.env, GEMINI_API_KEY: "" };

test("--dry-run lists the 68 theme pairs and needs no key", () => {
  const out = execFileSync(process.execPath, [SCRIPT, "--dry-run"], { env: noKey, encoding: "utf8" }).trim().split("\n");
  assert.equal(out.at(-1), "68 pairs");
  const keys = out.slice(0, -1).map((l) => l.split("\t")[0]);
  assert.equal(keys.length, 68);
  assert.equal(new Set(keys).size, 68, "no pair twice");
  // per question: Q05 20 interests, Q19 4, Q18 3 (without "any"), Q20 4, Q09 6, Q13 2 (without "mix"), Q14/Q15 12, Q17 5
  const per = Object.fromEntries(THEME_QUESTIONS.map((q) => [q, keys.filter((k) => k.startsWith(q + ":")).length]));
  assert.deepEqual(per, { Q05: 20, Q19: 4, Q18: 3, Q20: 4, Q09: 6, Q13: 2, Q14: 12, Q15: 12, Q17: 5 });
  for (const k of ["Q18:any", "Q13:mix"]) assert.ok(!keys.includes(k), `${k} is never a theme`);
});

test("pairs carry the seed's texts, and the prompt holds only questionnaire texts", () => {
  const p = themePairs().find((x) => x.q === "Q05" && x.o === "coffee");
  assert.deepEqual(p, { q: "Q05", o: "coffee", question_ar: "ماذا تحبين أن تفعلي في وقت فراغك؟", question_en: "What do you enjoy doing in your free time?",
    theme_ar: "قهوة وكرك", theme_en: "Coffee & karak" });
  assert.equal(themePairs().find((x) => x.q === "Q18" && x.o === "playful").theme_en, "Playful & unexpected");
  const prompt = openerPrompt(p);
  for (const s of [p.question_ar, p.question_en, p.theme_ar, p.theme_en]) assert.ok(prompt.includes(s));
});

test("without GEMINI_API_KEY the run stops with a clear message and writes nothing", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { env: noKey, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /GEMINI_API_KEY is not set/);
});

test("a GEMINI_BASE_URL that is not https (and not this machine) stops the run before the key is sent anywhere", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, GEMINI_API_KEY: "test-key", GEMINI_BASE_URL: "http://203.0.113.9" }, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /GEMINI_BASE_URL must be https/);
  assert.doesNotMatch(r.stdout, /drafts written/);
});

test("openerFor: null with the empty library; the first approved line for the themes, in her language", () => {
  assert.deepEqual(OPENERS, {}, "nothing reaches members until the owner approves lines");
  const themes = [{ q: "Q05", o: "gaming" }, { q: "Q05", o: "music" }, { q: "Q19", o: "games" }];
  assert.equal(openerFor(themes, "ar"), null);
  assert.equal(openerFor(null, "en"), null);
  const lib = { "Q05:music": { ar: "سطر؟", en: "Line?" }, "Q19:games": { ar: "آخر؟", en: "Other?" } };
  assert.equal(openerFor(themes, "ar", lib), "سطر؟");
  assert.equal(openerFor(themes, "en", lib), "Line?");
});
