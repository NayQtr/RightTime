// Smoke checks of the live sites (plan T10 and Notion fix 4). Read-only GET requests, no sign-in, nothing written:
//   1. Website pages answer 200 (home, admin console, venue page, delete-account page).
//   2. The API is up (GET /api/v1/health answers 200 "ok") and refuses member and admin routes without a sign-in (401).
//   3. Production only: the test paths are closed. Health lists no open test path (OTP dev mode, mock payments), and
//      the mock checkout answers 404 MOCK_PSP_DISABLED (with mock payments on it would answer NOT_FOUND for a made-up id).
//      On staging the open test paths are only reported.
// Run before every production release (baseline checks), after it (smoke checks), and every 30 minutes from GitHub
// Actions (.github/workflows/uptime.yml).
//   node qatar/ops/smoke.mjs                      both environments
//   node qatar/ops/smoke.mjs production           one environment
// Addresses: the defaults below, or SMOKE_<ENV>_WEB / SMOKE_<ENV>_API (for example SMOKE_PRODUCTION_WEB). An
// environment without a web address skips its page checks with a warning; the API checks still run.
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Defaults. herzone.app has served production since 13 Nov 2026 (item 14b); staging keeps its vercel.app address.
export const DEFAULT_TARGETS = {
  staging: { web: "https://qatar-mvp-staging.vercel.app", api: "https://fvodcnqmxskgzziwuwmz.supabase.co/functions/v1", production: false },
  production: { web: "https://herzone.app", api: "https://pwxxulqgdydrkowmtkia.supabase.co/functions/v1", production: true },
};
export const PAGES = ["/", "/admin", "/venue", "/delete-account"];
const TIMEOUT_MS = 15_000;

export function targetsFromEnv(env = process.env, names = Object.keys(DEFAULT_TARGETS)) {
  return names.map((name) => {
    const d = DEFAULT_TARGETS[name];
    if (!d) throw new Error(`unknown environment ${name} (staging or production)`);
    // an empty variable (GitHub passes "" for an unset repository variable) keeps the default
    const pick = (k) => String(String(env[`SMOKE_${name.toUpperCase()}_${k.toUpperCase()}`] || "").trim() || d[k] || "").replace(/\/$/, "");
    return { name, web: pick("web"), api: pick("api"), production: d.production };
  });
}

async function get(fetchImpl, url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { redirect: "follow", signal: ctrl.signal, headers: { accept: "application/json, text/html" } });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: null, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally { clearTimeout(timer); }
}

// Runs every check; returns [{ env, check, ok, warn?, detail }]. Never throws for a site that is down.
export async function runSmoke(targets, { fetchImpl = fetch, pages = PAGES } = {}) {
  const results = [];
  const add = (t, check, ok, detail, warn = false) => results.push({ env: t.name, check, ok, warn, detail });
  const seen = (r) => (r.error ? r.error : String(r.status));
  for (const t of targets) {
    if (!t.web) add(t, "website pages", true, `no address set (SMOKE_${t.name.toUpperCase()}_WEB): skipped`, true);
    else for (const p of pages) {
      const r = await get(fetchImpl, t.web + p);
      add(t, `page ${p} answers 200`, r.status === 200, seen(r));
    }
    const h = await get(fetchImpl, `${t.api}/api/v1/health`);
    add(t, "API health answers 200 ok", h.status === 200 && h.body?.status === "ok", seen(h));
    for (const route of ["/api/v1/users/me", "/api/admin/v1/me"]) {
      const r = await get(fetchImpl, t.api + route);
      add(t, `${route} answers 401 without sign-in`, r.status === 401, seen(r));
    }
    const open = h.status === 200 && Array.isArray(h.body?.test_paths_open) ? h.body.test_paths_open : null;
    const mock = await get(fetchImpl, `${t.api}/api/mock-psp/checkout/pi_smoke_check`);
    const mockClosed = mock.status === 404 && mock.body?.code === "MOCK_PSP_DISABLED";
    if (t.production) {
      if (open === null) add(t, "test paths closed (health)", true, "health does not list test paths yet (API older than this check)", true);
      else add(t, "test paths closed (health)", open.length === 0, open.length ? `open: ${open.join(", ")}` : "none open");
      add(t, "mock checkout closed (404 MOCK_PSP_DISABLED)", mockClosed, `${seen(mock)} ${mock.body?.code || ""}`.trim());
    } else {
      add(t, "test paths (report only on staging)", true, open === null ? "not reported" : open.length ? `open: ${open.join(", ")}` : "none open");
    }
  }
  return results;
}

export function report(results) {
  const lines = results.map((r) => `[smoke] ${r.ok ? (r.warn ? "warn" : "ok  ") : "FAIL"} ${r.env.padEnd(10)} ${r.check}: ${r.detail}`);
  const table = ["| Environment | Check | Result | Detail |", "|---|---|---|---|",
    ...results.map((r) => `| ${r.env} | ${r.check} | ${r.ok ? (r.warn ? "warning" : "ok") : "**FAILED**"} | ${r.detail} |`)].join("\n");
  return { lines, table, failed: results.filter((r) => !r.ok) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = process.argv.slice(2);
  const results = await runSmoke(targetsFromEnv(process.env, names.length ? names : undefined));
  const { lines, table, failed } = report(results);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Smoke checks\n\n${table}\n`);
  for (const r of results.filter((x) => x.warn)) if (process.env.GITHUB_ACTIONS) console.log(`::warning::${r.env}: ${r.check}: ${r.detail}`);
  for (const r of failed) if (process.env.GITHUB_ACTIONS) console.log(`::error::${r.env}: ${r.check}: ${r.detail}`);
  console.log(failed.length ? `[smoke] ${failed.length} check(s) failed` : "[smoke] all checks passed");
  process.exit(failed.length ? 1 : 0);
}
