// Copies the round country flags for every country the phone picker offers (owner, 13 Nov 2026: «It's not emojis, it's
// flags» — real flag pictures, round as in the owner's reference image, not emoji).
// Source: circle-flags 2.8.3 by HatScripts, MIT licence (LICENSE-circle-flags.md beside the files).
//   npm i circle-flags@2.8.3   (anywhere outside the repository), then:
//   node qatar/ops/build-flags.mjs <path to node_modules/circle-flags/flags>
// Writes qatar/web/flags/<iso>.svg (the website shows them as <img>, so nothing in them can run) and
// qatar/app/assets/flags/<iso>.png, 72x72 px, drawn by the pre-installed Chromium because the app does not draw SVG.
// api/test/flags.test.mjs fails when a country in the list has no flag on either side.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { COUNTRIES } from "../api/src/lib/countries.js";

// require, not import: the pre-installed Playwright is found by require from any folder, not by an ES import
const { chromium } = createRequire(import.meta.url)("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
if (!src) { console.error("usage: node qatar/ops/build-flags.mjs <path to circle-flags/flags>"); process.exit(1); }
const WEB = path.join(ROOT, "web/flags"), APP = path.join(ROOT, "app/assets/flags");
const SAFE = (svg) => !/<script|foreignObject|\son[a-z]+=|<image|@import|(?:xlink:)?href=["'](?!#)|url\((?!#)/i.test(svg);

for (const dir of [WEB, APP]) { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); }
const licence = path.join(src, "..", "LICENSE.md");
for (const dir of [WEB, APP]) copyFileSync(licence, path.join(dir, "LICENSE-circle-flags.md"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 72, height: 72 } });
for (const c of COUNTRIES) {
  const iso = c.iso.toLowerCase();
  const svg = readFileSync(path.join(src, `${iso}.svg`), "utf8");
  if (!SAFE(svg)) throw new Error(`${iso}.svg has something that is not a plain drawing`);
  writeFileSync(path.join(WEB, `${iso}.svg`), svg);
  await page.setContent(`<html><body style="margin:0;background:transparent"><img id="f" width="72" height="72" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body></html>`);
  await page.locator("#f").evaluate((img) => img.decode());
  await page.locator("#f").screenshot({ path: path.join(APP, `${iso}.png`), omitBackground: true });
}
await browser.close();
console.log(`wrote ${COUNTRIES.length} flags to web/flags (svg) and app/assets/flags (png); ${readdirSync(APP).length - 1} png files`);
