// Smoke checks (ops/smoke.mjs; plan T10 and Notion fix 4) against the real server: pages 200, API 401 without sign-in,
// and in production the test paths (OTP dev mode, mock payments) must be closed. A staging-like server fails the
// production check; a server configured like production passes it.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplate, startTestEnv } from "./helpers.mjs";
import { resetConfigCache } from "../src/lib/config.js";
import { DEFAULT_TARGETS, report, runSmoke, targetsFromEnv } from "../../ops/smoke.mjs";

// the local runner serves these pages (the /venue and /delete-account rewrites exist only on Vercel)
const pages = ["/", "/admin"];
const asProduction = (base) => [{ name: "production", web: base, api: base, production: true }];
const byCheck = (results) => Object.fromEntries(results.map((r) => [r.check, r]));

before(() => buildTemplate());
after(() => resetConfigCache());

test("a staging-like server (OTP dev mode and mock payments on) fails the production test-path checks", async () => {
  resetConfigCache();
  const env = await startTestEnv();
  try {
    const health = await (await fetch(`${env.base}/api/v1/health`)).json();
    assert.deepEqual(health.test_paths_open, ["otp_dev_mode", "mock_payments"]);
    const r = byCheck(await runSmoke(asProduction(env.base), { pages }));
    assert.equal(r["page / answers 200"].ok, true);
    assert.equal(r["page /admin answers 200"].ok, true);
    assert.equal(r["API health answers 200 ok"].ok, true);
    assert.equal(r["/api/v1/users/me answers 401 without sign-in"].ok, true);
    assert.equal(r["/api/admin/v1/me answers 401 without sign-in"].ok, true);
    assert.equal(r["test paths closed (health)"].ok, false);
    assert.equal(r["test paths closed (health)"].detail, "open: otp_dev_mode, mock_payments");
    assert.equal(r["mock checkout closed (404 MOCK_PSP_DISABLED)"].ok, false);
    // the same server checked as staging only reports them
    const s = byCheck(await runSmoke([{ name: "staging", web: env.base, api: env.base, production: false }], { pages }));
    assert.deepEqual(Object.values(s).filter((x) => !x.ok), []);
    assert.equal(s["test paths (report only on staging)"].detail, "open: otp_dev_mode, mock_payments");
  } finally { await env.stop(); }
});

test("a server configured like production passes every check", async () => {
  resetConfigCache();
  const env = await startTestEnv({ OTP_DEV_MODE: "false", MOCK_PSP_ENABLED: "false" });
  try {
    const results = await runSmoke(asProduction(env.base), { pages });
    assert.deepEqual(report(results).failed, []);
    const r = byCheck(results);
    assert.equal(r["test paths closed (health)"].detail, "none open");
    assert.equal(r["mock checkout closed (404 MOCK_PSP_DISABLED)"].detail, "404 MOCK_PSP_DISABLED");
  } finally { await env.stop(); resetConfigCache(); }
});

test("a site that is down fails without throwing; a missing web address and an older API only warn", async () => {
  const down = await runSmoke([{ name: "production", web: "http://127.0.0.1:9", api: "http://127.0.0.1:9", production: true }], { pages: ["/"] });
  assert.ok(down.filter((x) => !x.ok).length >= 4);
  // an API from before this check: health has no test_paths_open, mock checkout already closed
  const old = async (url) => {
    const u = new URL(url);
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (u.pathname === "/api/v1/health") return reply(200, { status: "ok", key_source: "kek" });
    if (u.pathname.startsWith("/api/mock-psp/")) return reply(404, { code: "MOCK_PSP_DISABLED" });
    return reply(401, { code: "UNAUTHENTICATED" });
  };
  const r = await runSmoke([{ name: "production", web: "", api: "https://api.example.test", production: true }], { fetchImpl: old });
  assert.deepEqual(report(r).failed, []);
  assert.deepEqual(r.filter((x) => x.warn).map((x) => x.check), ["website pages", "test paths closed (health)"]);
});

test("addresses come from the defaults or SMOKE_<ENV>_WEB / SMOKE_<ENV>_API", () => {
  const [s, p] = targetsFromEnv({ SMOKE_PRODUCTION_WEB: "https://prod.example.test/", SMOKE_STAGING_WEB: "", SMOKE_STAGING_API: " " });
  assert.deepEqual(s, { name: "staging", ...DEFAULT_TARGETS.staging });
  assert.equal(p.web, "https://prod.example.test");
  assert.equal(p.api, DEFAULT_TARGETS.production.api);
  assert.equal(p.production, true);
  assert.throws(() => targetsFromEnv({}, ["qa"]), /unknown environment/);
});
