// Hardening from the security review of 23 Nov 2026, the parts that need no database or browser:
// - GEMINI_BASE_URL goes through the same https-only check as TWILIO_BASE_URL (lib/sms.js safeBase): https, or plain
//   http to this machine for a fake server in the tests; anything else is refused and Gemini is not asked at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, resetConfigCache } from "../src/lib/config.js";
import { askNameOpinion } from "../src/lib/ai.js";

// loadConfig reads app.app_config through a tagged template; a table with no rows is enough here
const noRows = async () => [];
async function configWith(env) {
  resetConfigCache();
  try { return await loadConfig(noRows, (k) => env[k]); } finally { resetConfigCache(); }
}

test("GEMINI_BASE_URL: https or this machine is kept (without a trailing slash); plain http to another host is refused", async () => {
  assert.equal((await configWith({})).geminiBaseUrl, "https://generativelanguage.googleapis.com", "the default");
  assert.equal((await configWith({ GEMINI_BASE_URL: "https://gemini.example.test/" })).geminiBaseUrl, "https://gemini.example.test");
  assert.equal((await configWith({ GEMINI_BASE_URL: "http://127.0.0.1:4567" })).geminiBaseUrl, "http://127.0.0.1:4567", "a fake server in the tests");
  assert.equal((await configWith({ GEMINI_BASE_URL: "http://localhost:4567" })).geminiBaseUrl, "http://localhost:4567");
  for (const bad of ["http://203.0.113.9", "http://gemini.example.test", "ftp://gemini.example.test", "gemini.example.test", "not a url"])
    assert.equal((await configWith({ GEMINI_BASE_URL: bad })).geminiBaseUrl, null, bad);
  assert.equal((await configWith({ GEMINI_BASE_URL: "" })).geminiBaseUrl, "https://generativelanguage.googleapis.com", "empty means the default");
});

test("without an accepted base URL Gemini is not asked: no request leaves, the review stays with a person", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("must not be called"); };
  const args = { apiKey: "test-key", model: "m", registered: "Noor", card: "NOUR ALI", fetchImpl };
  assert.equal(await askNameOpinion({ ...args, baseUrl: null }), null);
  assert.equal(await askNameOpinion({ ...args, baseUrl: undefined }), null);
  assert.equal(await askNameOpinion({ ...args, baseUrl: "https://gemini.example.test", apiKey: "" }), null, "and never without a key");
  assert.equal(calls, 0);
});
