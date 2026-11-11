// Colour gate (plan D7): colours come only from qatar/design/tokens.json. The website's stylesheets, the admin console,
// the venue page and the Flutter app may not write a colour by hand (hex, rgb/rgba, hsl/hsla and the other CSS colour
// functions, named colours on colour properties, Color(0x...) / Colors.x in Dart); they use the token variables
// (var(--c-...)) and HzColors. tokens.css and herzone_tokens.dart are generated from tokens.json and are not scanned.
// An exception that cannot be a token without changing tokens.json is listed in ALLOWED with its reason; an entry that no
// longer matches anything fails too, so the list never goes stale. Runs in the build gate (ops/predeploy-gate.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QATAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tokens = JSON.parse(readFileSync(path.join(QATAR, "design/tokens.json"), "utf8"));

// Exceptions, each with its reason (provisional, 10 Nov 2026; the owner may turn any of them into a token).
export const ALLOWED = [
  { file: "web/admin/admin.css", text: "rgb(0 0 0 / 40%)",
    reason: "Dialog scrim of the admin console. tokens.json gives it only in prose (elevation.3: 'scrim #000 40 %'); "
      + "there is no scrim colour token, and adding one changes tokens.json. Same value as the design source." },
];

function filesUnder(rel, exts) {
  const dir = path.join(QATAR, rel);
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return filesUnder(path.join(rel, name), exts);
    return exts.some((e) => name.endsWith(e)) ? [path.join(rel, name)] : [];
  });
}

// What is scanned. The other web pages (checkout-mock, delete-account) share styles.css and are scanned too.
export const WEB_FILES = ["web/styles.css", "web/checkout-mock.css", "web/delete-account.css",
  ...filesUnder("web/admin", [".css", ".js", ".html"]), ...filesUnder("web/venue", [".css", ".js", ".html"])];
export const DART_FILES = [...filesUnder("app/lib", [".dart"]), ...filesUnder("app/test", [".dart"])]
  .filter((f) => !f.endsWith("herzone_tokens.dart"));

const NAMED = "white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|maroon|navy|teal|olive|lime|aqua|fuchsia|brown|beige|gold|ivory|tan|crimson|coral|salmon|violet|indigo|magenta|cyan|lavender|khaki|plum";
const CSS_RULES = [
  { name: "hex colour", re: /#[0-9a-fA-F]{3,8}\b/g },
  { name: "colour function", re: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/g },
  { name: "named colour", re: new RegExp(`\\b(?:color|background(?:-color)?|fill|stroke|outline(?:-color)?|border(?:-[a-z-]+)?|box-shadow|text-shadow|caret-color|accent-color|text-decoration-color)\\s*:[^;}{]*?\\b(?:${NAMED})\\b`, "gi") },
];
const DART_RULES = [
  { name: "Color literal", re: /\bColor\s*\(\s*0x[0-9a-fA-F]+\s*\)/g },
  { name: "Color constructor", re: /\bColor\.from(?:ARGB|RGBO)\s*\([^)]*\)/g },
  { name: "Material/Cupertino colour", re: /\b(?:Colors|CupertinoColors)\.(?!transparent\b)[a-zA-Z]+\w*/g },
];

export function findColours(file, src) {
  const rules = file.endsWith(".dart") ? DART_RULES : CSS_RULES;
  const hits = [];
  src.split("\n").forEach((line, i) => {
    // comments may mention colours ("near-black page"); only code counts
    const code = line.replace(/\/\*.*?\*\//g, "").replace(/(^|\s)\/\/.*$/, "$1");
    for (const { name, re } of rules) for (const m of code.matchAll(re)) hits.push({ file, line: i + 1, rule: name, text: m[0] });
  });
  return hits;
}

const isAllowed = (h) => ALLOWED.some((a) => a.file === h.file && h.text.includes(a.text));

test("no hand-written colour in the website styles, admin console, venue page or Flutter app", () => {
  const hits = [...WEB_FILES, ...DART_FILES].flatMap((f) => findColours(f, readFileSync(path.join(QATAR, f), "utf8"))).filter((h) => !isAllowed(h));
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line} ${h.rule} ${h.text}`), [],
    "use a token (var(--c-...) on the web, HzColors in the app) or add the exception to ALLOWED with a reason");
});

test("every allowed exception has a reason and still exists", () => {
  for (const a of ALLOWED) {
    assert.ok(a.reason && a.reason.length > 20, `${a.file}: reason`);
    const src = readFileSync(path.join(QATAR, a.file), "utf8");
    assert.ok(src.includes(a.text), `${a.file} no longer contains ${a.text}: remove it from ALLOWED`);
  }
});

test("the scan catches each kind of hand-written colour, and ignores tokens and comments", () => {
  const css = [".a { color: #fff; }", ".b { background: rgb(0 0 0 / 40%); }", ".c { border: 1px solid hsl(0 0% 0%); }",
    ".d { color: white; }", ".e { color: var(--c-text); background: color-mix(in oklch, var(--c-bg) 45%, transparent); }",
    "/* near-black page */ .f { white-space: nowrap; }", ".g { fill: oklch(0.5 0.1 20); }"].join("\n");
  assert.deepEqual(findColours("x.css", css).map((h) => h.line), [1, 2, 3, 4, 7]);
  const dart = ["final a = Color(0xFF112233);", "final b = Colors.black;", "final c = Colors.transparent;",
    "final d = Color.fromARGB(255, 1, 2, 3);", "final e = HzColors.light.primary; // Colors.red in a comment", "final f = CupertinoColors.white;"].join("\n");
  assert.deepEqual(findColours("x.dart", dart).map((h) => h.line), [1, 2, 4, 6]);
});

test("the browser theme colour (meta theme-color) equals the page background token in both themes", () => {
  // HTML meta tags and the theme switch cannot read CSS variables, so the value is written out; it must stay the token's.
  const { light, dark } = { light: tokens.color.light.bg.$value, dark: tokens.color.dark.bg.$value };
  const index = readFileSync(path.join(QATAR, "web/index.html"), "utf8");
  assert.ok(index.includes(`content="${light}" media="(prefers-color-scheme: light)"`), "index.html light");
  assert.ok(index.includes(`content="${dark}" media="(prefers-color-scheme: dark)"`), "index.html dark");
  for (const f of ["web/app.js", "web/theme-init.js"]) {
    const src = readFileSync(path.join(QATAR, f), "utf8");
    assert.ok(src.includes(`t === "dark" ? "${dark}" : "${light}"`), `${f} theme switch`);
  }
});
