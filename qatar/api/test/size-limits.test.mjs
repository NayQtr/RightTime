// Size limits of the build gate (plan Q1, ops/size-limits.mjs): today's website is within them, and a JavaScript total
// or a single image over its limit is reported (the gate then stops the build).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SIZE_LIMITS, checkSizes, measure } from "../../ops/size-limits.mjs";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");

test("the website is within the size limits, with headroom", () => {
  const m = measure(WEB);
  assert.deepEqual(checkSizes(m), []);
  assert.ok(m.jsFiles >= 10 && m.totalJsBytes > 100_000, "the scan sees the shipped JavaScript");
  assert.ok(m.images.some((i) => i.file.endsWith("icon-512.png")), "the scan sees the images");
  assert.ok(SIZE_LIMITS.totalJsBytes > m.totalJsBytes, "JavaScript limit above today's total");
});

test("too much JavaScript, or one image too large, is reported", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hz-size-"));
  try {
    mkdirSync(path.join(dir, "img"));
    writeFileSync(path.join(dir, "a.js"), "x".repeat(600));
    writeFileSync(path.join(dir, "b.mjs"), "x".repeat(500));
    writeFileSync(path.join(dir, "img/hero.webp"), Buffer.alloc(300));
    writeFileSync(path.join(dir, "img/icon.png"), Buffer.alloc(50));
    writeFileSync(path.join(dir, "font.woff2"), Buffer.alloc(5000)); // fonts are not images
    const m = measure(dir);
    assert.equal(m.totalJsBytes, 1100);
    assert.deepEqual(checkSizes(m, { totalJsBytes: 2000, imageBytes: 400 }), []);
    assert.deepEqual(checkSizes(m, { totalJsBytes: 1000, imageBytes: 200 }),
      ["JavaScript 1100 bytes in all, limit 1000", `image ${path.join("img", "hero.webp")} 300 bytes, limit 200`]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
