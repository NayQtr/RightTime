// The country list behind the phone pickers (owner's decision, 11 Nov 2026: every country except Israel, Qatar first).
// One source, api/src/lib/countries.js; the website's and the app's lists are generated from it, so they cannot drift.
// Regenerate with: node qatar/ops/build-countries.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BLOCKED_CALLING_CODES, CALLING_CODES, COUNTRIES, DEFAULT_COUNTRY, callingCodeOf } from "../src/lib/countries.js";
import { DART_FILE, WEB_FILE, dartSource, webSource } from "../../ops/build-countries.mjs";

test("every row has an ISO code, a 1 to 3 digit calling code and a name in both languages", () => {
  assert.ok(COUNTRIES.length > 200, `only ${COUNTRIES.length} countries`);
  const seen = new Set();
  for (const c of COUNTRIES) {
    assert.match(c.iso, /^[A-Z]{2}$/, JSON.stringify(c));
    assert.equal(seen.has(c.iso), false, `${c.iso} twice`);
    seen.add(c.iso);
    assert.match(c.dial, /^[1-9][0-9]{0,2}$/, `${c.iso} calling code`);
    assert.ok(c.ar && c.en, `${c.iso} needs a name in Arabic and English`);
    assert.equal(c.ar, c.ar.trim());
    assert.equal(c.en, c.en.trim());
    assert.ok(!/[a-zA-Z]/.test(c.ar), `${c.iso}: the Arabic name is in Arabic`);
  }
});

test("sorted by English name, and Qatar is the default", () => {
  const names = COUNTRIES.map((c) => c.en);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en")));
  assert.equal(DEFAULT_COUNTRY, "QA");
  assert.equal(COUNTRIES.find((c) => c.iso === DEFAULT_COUNTRY).dial, "974");
});

test("Israel is not offered, and +972 is on the list that is never accepted", () => {
  assert.deepEqual(COUNTRIES.filter((c) => c.dial === "972"), []);
  assert.deepEqual(COUNTRIES.filter((c) => /israel/i.test(c.en)), []);
  assert.ok(BLOCKED_CALLING_CODES.includes("972"));
  assert.equal(callingCodeOf("+972501234567"), "972", "recognised, so the server can refuse it as a blocked country");
});

test("the calling codes are prefix-free, longest first, so a number belongs to one country code only", () => {
  assert.deepEqual(CALLING_CODES, [...CALLING_CODES].sort((a, b) => b.length - a.length || a.localeCompare(b)));
  const clash = CALLING_CODES.filter((a) => CALLING_CODES.some((b) => a !== b && b.startsWith(a)));
  assert.deepEqual(clash, [], "one code starts with another");
  assert.equal(callingCodeOf("+97455501234"), "974");
  assert.equal(callingCodeOf("+12125550123"), "1");
  assert.equal(callingCodeOf("+99912345678"), null);
  assert.equal(callingCodeOf("55501234"), null, "not E.164");
});

test("the website's and the app's lists are the generated ones", () => {
  assert.equal(readFileSync(WEB_FILE, "utf8"), webSource(), "run node qatar/ops/build-countries.mjs");
  assert.equal(readFileSync(DART_FILE, "utf8"), dartSource(), "run node qatar/ops/build-countries.mjs");
});
