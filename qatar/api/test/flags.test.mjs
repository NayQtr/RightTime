// Country flags in the phone field (owner, 13 Nov 2026: «It's not emojis, it's flags»): every country the picker offers
// has its round flag picture on the website (svg) and in the app (png), there are no others (so no Israel), the website's
// files are plain drawings, and the licence travels with them. Rebuild with qatar/ops/build-flags.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COUNTRIES } from "../src/lib/countries.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = path.join(ROOT, "web/flags"), APP = path.join(ROOT, "app/assets/flags");
const isos = COUNTRIES.map((c) => c.iso.toLowerCase()).sort();

test("every country in the list has its flag on the website and in the app, and there are no others", () => {
  const files = (dir, ext) => readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort();
  assert.deepEqual(files(WEB, ".svg"), isos, "website flags = the countries offered");
  assert.deepEqual(files(APP, ".png"), isos, "app flags = the countries offered");
  assert.equal(existsSync(path.join(WEB, "il.svg")) || existsSync(path.join(APP, "il.png")), false, "no Israel");
  for (const dir of [WEB, APP]) assert.match(readFileSync(path.join(dir, "LICENSE-circle-flags.md"), "utf8"), /MIT License/);
});

test("the website's flags are plain round drawings: nothing that runs or reaches out", () => {
  for (const iso of isos) {
    const svg = readFileSync(path.join(WEB, `${iso}.svg`), "utf8");
    assert.match(svg, /^<svg [^>]*viewBox="0 0 512 512"/, iso);
    assert.doesNotMatch(svg, /<script|foreignObject|\son[a-z]+=|<image|@import|(?:xlink:)?href=["'](?!#)|url\((?!#)/i, iso);
  }
});

test("the app's flags are 72x72 PNG pictures, and the app ships the folder", () => {
  for (const iso of isos) {
    const png = readFileSync(path.join(APP, `${iso}.png`));
    assert.equal(png.subarray(1, 4).toString(), "PNG", iso);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [72, 72], iso);
  }
  assert.match(readFileSync(path.join(ROOT, "app/pubspec.yaml"), "utf8"), /^\s+- assets\/flags\/$/m);
});
