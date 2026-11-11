// Size limits for what the website ships (plan Q1). The build gate (ops/predeploy-gate.mjs) stops the build when the
// JavaScript all together, or any single image, is larger than these limits.
// Provisional (10 Nov 2026): set a little above today's sizes with headroom. On 10 Nov the shipped JavaScript was
// about 292 KB in all (app.js 127 KB, admin.js 75 KB, strings.js 51 KB). The app icons are under 3 KB; the about-page
// photos prepared the same day are up to about 200 KB each (hero 1600 px), so the image limit leaves room for them.
// Change the numbers here.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export const SIZE_LIMITS = {
  totalJsBytes: 400_000, // every .js / .mjs file under web/, added up
  imageBytes: 250_000,   // each image under web/ (png, jpg, jpeg, webp, avif, gif, svg, ico)
};

const JS = /\.(m?js)$/i;
const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg|ico)$/i;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    return e.isDirectory() ? files(p) : [p];
  });
}

// Sizes of the shipped files under webDir: total JavaScript and every image, largest first.
export function measure(webDir) {
  const all = files(webDir).map((f) => ({ file: path.relative(webDir, f), bytes: statSync(f).size }));
  const js = all.filter((f) => JS.test(f.file));
  return { totalJsBytes: js.reduce((s, f) => s + f.bytes, 0), jsFiles: js.length,
    images: all.filter((f) => IMAGE.test(f.file)).sort((a, b) => b.bytes - a.bytes) };
}

// Problems (empty when everything is within the limits).
export function checkSizes(m, limits = SIZE_LIMITS) {
  const problems = [];
  if (m.totalJsBytes > limits.totalJsBytes) problems.push(`JavaScript ${m.totalJsBytes} bytes in all, limit ${limits.totalJsBytes}`);
  for (const img of m.images) if (img.bytes > limits.imageBytes) problems.push(`image ${img.file} ${img.bytes} bytes, limit ${limits.imageBytes}`);
  return problems;
}
