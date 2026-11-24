// The build gate's secret scan (ops/secret-scan.mjs, security review of 23 Nov 2026, hardening): every key format it
// must catch, the harmless look-alikes it must let through, and the shipped tree itself (web and app/lib) is clean.
// Samples are assembled from parts, so this file holds nothing a repository-wide search would call a key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { SECRET_FORMS, hasSecretForm, scanForSecrets, textFiles } from "../../ops/secret-scan.mjs";

const QATAR = fileURLToPath(new URL("../../", import.meta.url));
const hex = (n) => "0123456789abcdef".repeat(4).slice(0, n);
const alnum = (n) => "Ab9".repeat(20).slice(0, n);

test("every key format is caught, in the middle of other text too", () => {
  const samples = {
    "Stripe live key": "sk_live_" + alnum(24),
    "Stripe test key": "sk_test_" + alnum(24),
    "OpenAI / Anthropic style key": "sk-" + alnum(40),
    "Google API key": "AIza" + alnum(35),
    "Google API key, longer": "AIza" + alnum(39) + "-_",
    "Supabase access token": "sbp_" + hex(40),
    "Supabase secret key": "sb_secret_" + alnum(30),
    "signed JWT": "eyJhbGciOi" + alnum(20) + "." + alnum(40) + "." + alnum(43),
    "AWS access key id": "AKIA" + "ABCDEFGHIJKLMNOP",
    "GitHub classic token": "ghp_" + alnum(36),
    "GitHub fine-grained token": "github_pat_" + alnum(22) + "_" + alnum(59),
    "Twilio sid:token": "AC" + hex(32) + ":" + hex(32),
    "private key block": "-----BEGIN RSA PRIVATE KEY-----",
    "server KEK assignment": "SERVER_KEYS_KEK = base64",
  };
  for (const [name, s] of Object.entries(samples)) {
    assert.ok(hasSecretForm(s), `${name} not caught`);
    assert.ok(hasSecretForm(`const k = "${s}"; // end`), `${name} not caught inside code`);
  }
  assert.equal(SECRET_FORMS.length, 13);
});

test("harmless look-alikes pass: short ids, test intents, the public Sentry DSN, an unsigned 'eyJ' prefix, ordinary words", () => {
  const fine = [
    "pi_test_" + alnum(12), "re_test_" + alnum(12), "evt_" + alnum(12), "rt_" + alnum(30),
    "task-1234567890", "sk-short", "ask-" + alnum(30), "desk-" + alnum(30),      // \bsk- only: not the tail of a word
    "AIza" + alnum(20),                                                         // too short for a Google key
    "https://" + hex(32) + "@o123456.ingest.de.sentry.io/4567890",              // a DSN is public by design
    "eyJ" + alnum(10), "eyJhbGciOi" + alnum(12),                                // header alone, no signature
    "AKIA" + alnum(8), "AKIAabcdefghijklmnop",                                  // wrong length or lower case
    "AC" + hex(32),                                                             // a Twilio sid alone is not a secret
    "ghp_" + alnum(10), "github_pat_" + alnum(10),
    "BEGIN PUBLIC KEY", "SERVER_KEYS_KEK is read from the environment",
    "const SERVER_KEYS_KEK_NAME = 1",
  ];
  for (const s of fine) assert.ok(!hasSecretForm(s), `false alarm on ${s}`);
});

test("the shipped tree is clean: web and app/lib hold no secret-like text", () => {
  const dirs = [QATAR + "web", QATAR + "app/lib"];
  const { hits, scanned } = scanForSecrets(dirs);
  assert.deepEqual(hits, []);
  assert.ok(scanned >= 60, `only ${scanned} files scanned`);
  assert.ok(textFiles(QATAR + "app/lib").some((f) => f.endsWith(".dart")), "Dart files are read");
  assert.ok(textFiles(QATAR + "web").some((f) => f.endsWith("sw.js")), "the service worker is read");
  assert.deepEqual(textFiles(QATAR + "nothing-here"), [], "a missing folder is simply empty");
});
