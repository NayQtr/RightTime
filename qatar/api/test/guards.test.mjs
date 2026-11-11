// Guards that stop silent mistakes (development plan, 10 Nov 2026, items T2 and T7):
// - every text exists in both Arabic and English, with the same {placeholders}, on the website and in the app;
// - every file the website loads at start is in the service worker's offline list (sw.js CORE).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { STRINGS } from "../../web/strings.js";

const WEB = new URL("../../web/", import.meta.url);
const ARB = new URL("../../app/lib/l10n/", import.meta.url);
const holes = (s) => (typeof s === "string" ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : []);

function sameKeysAndHoles(a, b, where) {
  const ka = Object.keys(a), kb = Object.keys(b);
  assert.deepEqual(ka.filter((k) => !(k in b)), [], `${where}: in Arabic only`);
  assert.deepEqual(kb.filter((k) => !(k in a)), [], `${where}: in English only`);
  const diff = ka.filter((k) => holes(a[k]).join() !== holes(b[k]).join());
  assert.deepEqual(diff, [], `${where}: different {placeholders} in Arabic and English`);
}

test("website texts: every key in both languages, with the same placeholders", () => {
  sameKeysAndHoles(STRINGS.ar, STRINGS.en, "web/strings.js");
});

test("app texts: every key in both .arb files, with the same placeholders", () => {
  const read = (f) => Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL(f, ARB), "utf8"))).filter(([k]) => !k.startsWith("@")));
  sameKeysAndHoles(read("app_ar.arb"), read("app_en.arb"), "app/lib/l10n");
});

test("offline: every file index.html loads, and every module app.js imports, is in the service worker's CORE list", () => {
  const sw = readFileSync(new URL("sw.js", WEB), "utf8");
  const core = new Set(JSON.parse(sw.match(/const CORE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"')));
  const html = readFileSync(new URL("index.html", WEB), "utf8");
  const local = (u) => !/^(https?:)?\/\//.test(u) && !u.startsWith("#") && !u.startsWith("data:");
  const norm = (u) => "/" + u.replace(/^\.?\//, "");
  const loaded = new Set();
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) if (local(m[1])) loaded.add(norm(m[1]));
  for (const m of html.matchAll(/<link[^>]*rel="(?:stylesheet|preload)"[^>]*href="([^"]+)"|<link[^>]*href="([^"]+)"[^>]*rel="(?:stylesheet|preload)"/g)) {
    const u = m[1] || m[2];
    if (local(u)) loaded.add(norm(u));
  }
  // static imports, followed from app.js
  const todo = ["app.js"], seen = new Set();
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    loaded.add(norm(f));
    for (const m of readFileSync(new URL(f, WEB), "utf8").matchAll(/^import\s[^;]*?from\s+"\.\/([^"]+)"/gm)) todo.push(m[1]);
  }
  assert.ok(loaded.size >= 8, `found only ${[...loaded]}`);
  assert.deepEqual([...loaded].filter((u) => !core.has(u)).sort(), [], "loaded at start but missing from sw.js CORE (would not work offline)");
});

test("notification tap: an open window is reused only when it is on the same page (app, admin console, venue page)", async () => {
  const src = readFileSync(new URL("sw.js", WEB), "utf8");
  const O = "https://herzone.example";
  async function tap(target, open) {
    const handlers = {}, log = [];
    const wins = open.map((u) => ({ url: O + u, focus: async () => log.push(`focus ${u}`), navigate: async (to) => log.push(`navigate ${u} -> ${new URL(to).pathname}${new URL(to).hash}`) }));
    const self = { location: new URL(O + "/sw.js"), addEventListener: (k, f) => (handlers[k] = f),
      clients: { matchAll: async () => wins, openWindow: async (to) => log.push(`open ${new URL(to).pathname}${new URL(to).hash}`) } };
    vm.runInNewContext(src, { self, URL, caches: {}, fetch: () => {} });
    let done;
    handlers.notificationclick({ notification: { data: { url: target }, close() {} }, waitUntil: (p) => (done = p) });
    await done;
    return log;
  }
  assert.deepEqual(await tap("/admin/#/alerts", ["/#/inbox"]), ["open /admin/#/alerts"], "the member app is not turned into the console");
  assert.deepEqual(await tap("/#/inbox", ["/admin/#/live"]), ["open /#/inbox"], "the console is not turned into the member app");
  assert.deepEqual(await tap("/#/inbox", ["/venue/"]), ["open /#/inbox"]);
  assert.deepEqual(await tap("/admin/#/alerts", ["/#/home", "/admin/#/live"]), ["focus /admin/#/live", "navigate /admin/#/live -> /admin/#/alerts"]);
  assert.deepEqual(await tap("/#/inbox", ["/index.html#/home"]), ["focus /index.html#/home", "navigate /index.html#/home -> /#/inbox"]);
});
