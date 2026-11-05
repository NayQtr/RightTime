// The web build picks config and the API preconnect per environment (ops/write-config.mjs): production must never
// point the page at the staging API, and staging never at production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const qatar = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function build(env) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hz-wc-"));
  cpSync(path.join(qatar, "web"), path.join(dir, "web"), { recursive: true });
  cpSync(path.join(qatar, "ops/write-config.mjs"), path.join(dir, "ops/write-config.mjs"));
  execFileSync(process.execPath, [path.join(dir, "ops/write-config.mjs")], { env: { ...process.env, HERZONE_ENV: env, VERCEL_GIT_COMMIT_SHA: "abc1234def5678" } });
  return { index: readFileSync(path.join(dir, "web/index.html"), "utf8"), config: readFileSync(path.join(dir, "web/config.js"), "utf8") };
}

test("production build: production API in config and preconnect, release set, no staging host", () => {
  const b = build("production");
  assert.ok(b.config.includes("pwxxulqgdydrkowmtkia") && b.index.includes('preconnect" href="https://pwxxulqgdydrkowmtkia.supabase.co"'));
  assert.ok(!b.config.includes("fvodcnqmxskgzziwuwmz") && !b.index.includes("fvodcnqmxskgzziwuwmz"));
  assert.ok(b.config.includes('release = "herzone-web@abc1234def56"'));
});

test("staging build: staging API in config and preconnect", () => {
  const b = build("staging");
  assert.ok(b.config.includes("fvodcnqmxskgzziwuwmz") && b.index.includes('preconnect" href="https://fvodcnqmxskgzziwuwmz.supabase.co"'));
  assert.ok(!b.index.includes("pwxxulqgdydrkowmtkia"));
});
