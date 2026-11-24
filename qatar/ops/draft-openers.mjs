// Drafts the table opener library (owner's decision, 15 Nov 2026): one short conversation question per shared theme.
//   node qatar/ops/draft-openers.mjs            asks Gemini, writes qatar/docs/openers/drafts.json
//   node qatar/ops/draft-openers.mjs --dry-run  lists the (question, option) pairs only; no key, no network
// Gemini only drafts. Nothing here reaches members: a line shows only after the owner approves it and it is copied
// into qatar/api/src/lib/openers.js. Gemini receives the questionnaire's question and option texts and nothing else:
// no member, booking or table data.
// Key: GEMINI_API_KEY (environment only, never stored). Model: GEMINI_MODEL, same default as api/src/lib/config.js.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { THEME_QUESTIONS, THEME_EXCLUDED_OPTIONS } from "../api/src/matching/personality.js";
import { safeBase } from "../api/src/lib/sms.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// QA-2026-05 (seed_questionnaire_v5.sql) copies every v4 question and option unchanged and adds only Q25, which is not a
// theme question, so the v4 seed holds the live texts of every theme question.
export const SEED = path.join(ROOT, "ops", "seed_questionnaire_v4.sql");
export const OUT = path.join(ROOT, "docs", "openers", "drafts.json");
const DEFAULT_MODEL = "gemini-flash-lite-latest";
// GEMINI_BASE_URL only points a test at a fake server: https, or plain http to this machine, as lib/config.js and
// lib/sms.js require; anything else is null and the run stops before the key is sent anywhere.
const BASE_URL = safeBase(process.env.GEMINI_BASE_URL, "https://generativelanguage.googleapis.com");
const TIMEOUT_MS = 8000;
const PAUSE_MS = 1500;   // between calls: well under the free tier's per-minute limit
const RETRY_PAUSE_MS = 5000;

// Every parenthesised tuple of SQL literals in the file: 'text' (with '' escapes), NULL, true/false, numbers.
function sqlTuples(src) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf("(", i)) !== -1) {
    let j = i + 1;
    const vals = [];
    let ok = true;
    for (;;) {
      while (/\s/.test(src[j])) j++;
      if (src[j] === "'") {
        let s = "";
        j++;
        for (;;) {
          if (j >= src.length) { ok = false; break; }
          if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } j++; break; }
          s += src[j++];
        }
        if (!ok) break;
        vals.push(s);
      } else {
        const m = /^(NULL|true|false|-?\d+(?:\.\d+)?)\b/.exec(src.slice(j, j + 8));
        if (!m) { ok = false; break; }
        vals.push(m[1] === "NULL" ? null : m[1] === "true" ? true : m[1] === "false" ? false : Number(m[1]));
        j += m[1].length;
      }
      while (/\s/.test(src[j])) j++;
      if (src[j] === ",") { j++; continue; }
      if (src[j] === ")") break;
      ok = false;
      break;
    }
    if (ok && vals.length) out.push(vals);
    i++;
  }
  return out;
}

/** The (question, option) pairs a shared-themes line can show, in THEME_QUESTIONS order, with their ar/en texts. */
export function themePairs(src = readFileSync(SEED, "utf8")) {
  const questions = new Map();
  const options = new Map();
  const add = (q, o, ar, en) => { if (!options.has(q)) options.set(q, []); options.get(q).push({ o, ar, en }); };
  const isKey = (v) => typeof v === "string" && /^Q\d\d$/.test(v);
  for (const t of sqlTuples(src)) {
    if (t.length === 18 && isKey(t[0])) questions.set(t[0], { ar: t[1], en: t[2] });
    else if (t.length === 8 && isKey(t[0])) add(t[0], t[1], t[2], t[3]);
    // Q14 and Q15 share one list of qualities: (key, label_ar, label_en, emoji, sort_order)
    else if (t.length === 5 && typeof t[0] === "string" && !isKey(t[0]) && typeof t[4] === "number") for (const q of ["Q14", "Q15"]) add(q, t[0], t[1], t[2]);
  }
  const pairs = [];
  for (const q of THEME_QUESTIONS) {
    const qt = questions.get(q);
    if (!qt || !options.get(q)) throw new Error(`${q} is missing from ${path.basename(SEED)}`);
    for (const o of options.get(q)) if (!THEME_EXCLUDED_OPTIONS.has(o.o)) pairs.push({ q, o: o.o, question_ar: qt.ar, question_en: qt.en, theme_ar: o.ar, theme_en: o.en });
  }
  return pairs;
}

const SCHEMA = {
  type: "OBJECT",
  properties: { ar: { type: "STRING" }, en: { type: "STRING" } },
  required: ["ar", "en"],
};

export function openerPrompt(p) {
  return `You write conversation openers for small dinners in Doha where four to six women meet for the first time.
The women at this table gave the same answer to one questionnaire question.
Question (Arabic): "${p.question_ar}"
Question (English): "${p.question_en}"
Their shared answer (Arabic): "${p.theme_ar}"
Their shared answer (English): "${p.theme_en}"
Write ONE short, warm, open question the table can discuss about this shared answer.
- ar: Modern Standard Arabic, addressed to the group of women (feminine plural forms, e.g. ما أكثر ... أحببتنّ / ماذا تفضّلن), at most 14 words, ending with ؟
- en: the same question in natural English, at most 14 words, ending with ?
It must be easy for everyone to answer, never personal or sensitive (no money, religion, politics, family status, health or appearance), and not a yes/no question.
Answer only with the JSON fields.`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s, end) => {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  return t && t.length <= 160 && t.endsWith(end) ? t : null;
};

async function askOnce(p, { apiKey, model, fetchImpl }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: openerPrompt(p) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.7 },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const text = d?.candidates?.[0]?.content?.parts?.[0]?.text;
    const o = JSON.parse(text);
    const ar = clean(o.ar, "؟");
    const en = clean(o.en, "?");
    if (!ar || !en) throw new Error("answer did not have both questions");
    return { ar, en };
  } finally {
    clearTimeout(timer);
  }
}

async function ask(p, opts) {
  try {
    return await askOnce(p, opts);
  } catch {
    await sleep(RETRY_PAUSE_MS);
    return askOnce(p, opts);   // one retry; a second failure is reported
  }
}

async function main(argv) {
  const pairs = themePairs();
  if (argv.includes("--dry-run")) {
    for (const p of pairs) console.log(`${p.q}:${p.o}\t${p.theme_en}\t${p.theme_ar}`);
    console.log(`${pairs.length} pairs`);
    return 0;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set: nothing drafted. Add it as a GitHub secret and run the 'Draft table openers' workflow.");
    return 2;
  }
  if (!BASE_URL) {
    console.error("GEMINI_BASE_URL must be https (plain http only to this machine): nothing drafted, the key was not sent.");
    return 2;
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const drafts = [];
  const failed = [];
  for (const [n, p] of pairs.entries()) {
    if (n) await sleep(PAUSE_MS);
    try {
      const { ar, en } = await ask(p, { apiKey, model, fetchImpl: fetch });
      drafts.push({ q: p.q, o: p.o, theme_ar: p.theme_ar, theme_en: p.theme_en, ar, en, status: "draft" });
      console.log(`${n + 1}/${pairs.length} ${p.q}:${p.o}`);
    } catch (e) {
      failed.push(`${p.q}:${p.o} (${e.name === "AbortError" ? "timed out" : e.message})`);
      console.error(`${n + 1}/${pairs.length} ${p.q}:${p.o} failed after one retry`);
    }
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(drafts, null, 2) + "\n");
  console.log(`${drafts.length} drafts written to ${path.relative(path.dirname(ROOT), OUT)}`);
  if (failed.length) {
    console.error(`${failed.length} pairs not drafted: ${failed.join(", ")}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
