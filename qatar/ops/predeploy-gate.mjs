// Gate that runs first in every Vercel build (preview and production), before anything is published or deployed.
// If any check fails, the build stops: the site is not published and the API is not deployed.
//   1. Syntax check of every web and API JavaScript file (a file that fails to parse breaks the app for everyone).
//   2. The automated tests that need no database or browser (public page, design, error reporting, API description, matching, quiz flow, Flutter tokens).
//   3. No server secret in the shipped web files, and no hand-written colour (colours.test.mjs, plan D7).
//   4. Size limits: the shipped JavaScript all together and each image (ops/size-limits.mjs, plan Q1).
//   5. Known vulnerabilities in the API's runtime libraries (npm audit, high or critical).
// The database and browser tests (e2e, ui, push, promo, ...) need Postgres and Chromium, which the Vercel build machine
// does not have; they run before every push with `npm run check` in qatar/api (see qatar/ops/check-all.sh).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SIZE_LIMITS, checkSizes, measure } from "./size-limits.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = path.join(ROOT, "api");
const PURE_TESTS = ["about-page", "colours", "countries", "design", "ip", "monitor", "namematch", "openapi", "personality", "quiz-flow", "size-limits", "tokens-dart", "write-config"].map((n) => path.join(API, "test", `${n}.test.mjs`));

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    if (statSync(p).isDirectory()) return jsFiles(p);
    return /\.(m?js)$/.test(name) ? [p] : [];
  });
}

function step(label, fn) {
  const t = Date.now();
  try {
    fn();
    console.log(`[gate] ok   ${label} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  } catch (err) {
    console.error(`[gate] FAIL ${label}`);
    if (err.stdout) process.stderr.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    console.error("[gate] Build stopped: nothing was published or deployed.");
    process.exit(1);
  }
}

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...opts });

step("syntax of web and API files", () => {
  const files = [...jsFiles(path.join(ROOT, "web")), ...jsFiles(path.join(API, "src")), path.join(API, "server.mjs")];
  // Browser ES modules end in .js with no package.json "type"; check them as modules explicitly so the result does not
  // depend on the Node version's module detection.
  const tmp = mkdtempSync(path.join(os.tmpdir(), "herzone-gate-"));
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const isModule = f.endsWith(".mjs") || /^\s*(import|export)\s/m.test(src);
    const target = isModule && !f.endsWith(".mjs") ? path.join(tmp, path.basename(f) + ".mjs") : f;
    if (target !== f) writeFileSync(target, src);
    try { run(process.execPath, ["--check", target]); } catch (err) { console.error(`[gate]      ${path.relative(ROOT, f)}`); throw err; }
  }
  console.log(`[gate]      ${files.length} files parsed`);
});

step("tests without database", () => {
  const out = run(process.execPath, ["--test", "--test-reporter=tap", "--test-concurrency=1", ...PURE_TESTS], { cwd: API });
  const pass = /# pass (\d+)/.exec(out)?.[1];
  console.log(`[gate]      ${pass} tests passed`);
});

// The web folder is shipped to every browser: no server secret may appear in it. Key formats only, so the scan
// does not depend on any particular value.
const SECRET_FORMS = [/sk_live_[0-9A-Za-z]{10,}/, /sk_test_[0-9A-Za-z]{10,}/, /AIza[0-9A-Za-z_-]{35}/, /sbp_[0-9a-f]{20,}/,
  /sb_secret_[0-9A-Za-z_-]{10,}/, /ghp_[0-9A-Za-z]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /SERVER_KEYS_KEK\s*[=:]/];
function webFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return webFiles(p);
    return /\.(js|mjs|html|css|json|txt|map)$/.test(e.name) ? [p] : [];
  });
}
step("no server secret in the shipped web files", () => {
  const hits = webFiles(path.join(ROOT, "web")).filter((f) => { const src = readFileSync(f, "utf8"); return SECRET_FORMS.some((re) => re.test(src)); });
  if (hits.length) { console.error(hits.map((f) => `[gate]      secret-like text in ${path.relative(ROOT, f)}`).join("\n")); throw new Error("secret-like text in web files"); }
  console.log(`[gate]      ${webFiles(path.join(ROOT, "web")).length} web files scanned`);
});

// Plan Q1: the JavaScript all together and each image stay under the limits in ops/size-limits.mjs (provisional values).
step("shipped JavaScript and images within the size limits", () => {
  const m = measure(path.join(ROOT, "web"));
  const problems = checkSizes(m);
  const biggest = m.images[0];
  console.log(`[gate]      JavaScript ${m.totalJsBytes} of ${SIZE_LIMITS.totalJsBytes} bytes (${m.jsFiles} files); largest image ${biggest ? `${biggest.file} ${biggest.bytes}` : "none"} of ${SIZE_LIMITS.imageBytes} bytes`);
  if (problems.length) { console.error(problems.map((p) => `[gate]      too large: ${p}`).join("\n")); throw new Error("size limit"); }
});

step("runtime libraries have no high or critical advisories", () => {
  run("npm", ["audit", "--omit=dev", "--audit-level=high"], { cwd: API });
});

console.log("[gate] all checks passed");
