// Error reporting to Sentry (api/src/lib/sentry.js and web/monitor.js): off without a DSN, scrubbed messages, ids
// removed from routes, valid envelopes, and a cap of 10 reports per page load in the browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildEnvelope, frames, parseDsn, reportError, scrub } from "../src/lib/sentry.js";

const DSN = "https://093e3b31f5dd57b324b6f48f149968bd@o4512359059488768.ingest.de.sentry.io/4512359079673936";

test("API: scrub removes phone numbers, tokens and 6-digit codes, keeps ordinary text", () => {
  const s = scrub("user +974 5550 1234 code 482913 jwt eyJhbGc.eyJzdWIi.c2ln refresh rt_abcdefghijklmnopqrstuvwxyz booking 12");
  assert.equal(s, "user [phone] code [code] jwt [token] refresh [token] booking 12");
  assert.equal(scrub("id 3fa85f64-5717-4562-b3fc-2c963f66afa6"), "id 3fa85f64-5717-4562-b3fc-2c963f66afa6", "UUID digits are not codes");
});

test("API: envelope has header, item and event with frames oldest-first and ids removed from the route", () => {
  const d = parseDsn(DSN);
  assert.deepEqual([d.key, d.host, d.projectId], ["093e3b31f5dd57b324b6f48f149968bd", "o4512359059488768.ingest.de.sentry.io", "4512359079673936"]);
  const err = new Error("boom for +97455501234");
  const [h, item, ev] = buildEnvelope(d, err, { route: "GET /api/v1/bookings/3fa85f64-5717-4562-b3fc-2c963f66afa6", requestId: "req_x" }).trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(h.dsn, DSN);
  assert.equal(item.type, "event");
  assert.equal(ev.transaction, "GET /api/v1/bookings/{id}");
  assert.equal(ev.exception.values[0].value, "boom for [phone]");
  assert.equal(ev.tags.request_id, "req_x");
  assert.ok(!("user" in ev) && !("request" in ev), "no user or request data");
  const f = frames("Error: x\n    at inner (file:///a/src/x.js:3:5)\n    at outer (file:///a/src/y.js:9:1)");
  assert.deepEqual(f.map((x) => x.function), ["outer", "inner"]);
});

test("API: nothing is sent without SENTRY_DSN; with it, one POST to the project's envelope endpoint", async () => {
  assert.equal(await reportError(() => undefined, new Error("x")), false);
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response("{}", { status: 200 }); };
  try {
    assert.equal(await reportError((k) => (k === "SENTRY_DSN" ? DSN : undefined), new Error("y")), true);
  } finally { globalThis.fetch = real; }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://o4512359059488768.ingest.de.sentry.io/api/4512359079673936/envelope/?sentry_key=093e3b31f5dd57b324b6f48f149968bd&sentry_version=7");
});

function loadWebMonitor(config) {
  const listeners = {};
  const sent = [];
  const window = { QATAR_CONFIG: config, addEventListener: (t, fn) => { listeners[t] = fn; } };
  const ctx = { window, location: { origin: "https://herzone.app", pathname: "/", hash: "#/booking/3fa85f64-5717-4562-b3fc-2c963f66afa6" },
    document: { documentElement: { lang: "ar" } }, crypto: globalThis.crypto, JSON, Date, String, Math, Error,
    fetch: (url, init) => { sent.push({ url, init }); return Promise.resolve(); } };
  vm.runInNewContext(readFileSync(new URL("../../web/monitor.js", import.meta.url), "utf8"), ctx);
  return { m: window.hzMonitor, sent, listeners };
}

test("web: off without a DSN; with it, reports carry the route without ids, scrubbed text, and stop after 10", () => {
  const off = loadWebMonitor({});
  assert.equal(off.m.report(new Error("x")), false);
  assert.equal(off.sent.length, 0);
  const on = loadWebMonitor({ sentryDsn: DSN });
  on.listeners.error({ error: new Error("failed for 0555 code 123456") });
  const ev = JSON.parse(on.sent[0].init.body.trim().split("\n")[2]);
  assert.equal(ev.transaction, "/#/booking/{id}");
  assert.equal(ev.exception.values[0].value, "failed for 0555 code [code]");
  assert.equal(ev.platform, "javascript");
  for (let i = 0; i < 20; i += 1) on.m.report(new Error("again"));
  assert.equal(on.sent.length, 10, "at most 10 reports per page load");
});

test("web: with a release, each page load is one session: started ok, ended exited on close or crashed on an uncaught error", () => {
  const noRelease = loadWebMonitor({ sentryDsn: DSN });
  assert.equal(noRelease.m.session(), null, "no session without a release");
  const parse = (call) => call.init.body.trim().split("\n").map((l) => JSON.parse(l));
  const a = loadWebMonitor({ sentryDsn: DSN, release: "herzone-web@abc1234", sentryEnvironment: "production" });
  const [h, item, s0] = parse(a.sent[0]);
  assert.equal(item.type, "session");
  assert.equal(h.dsn, DSN);
  assert.deepEqual([s0.init, s0.status, s0.errors, s0.attrs.release, s0.attrs.environment], [true, "ok", 0, "herzone-web@abc1234", "production"]);
  assert.ok(!("did" in s0) && !("ip_address" in s0.attrs), "no user or device id, no IP");
  a.m.report(new Error("api 503")); // handled: counted, no extra session request
  assert.equal(a.sent.length, 2);
  a.listeners.pagehide();
  const s1 = parse(a.sent[2])[2];
  assert.deepEqual([s1.init, s1.status, s1.errors, s1.sid], [false, "exited", 1, s0.sid]);
  a.listeners.pagehide();
  assert.equal(a.sent.length, 3, "a finished session is not sent again");
  const b = loadWebMonitor({ sentryDsn: DSN, release: "herzone-web@abc1234" });
  b.listeners.error({ error: new TypeError("x is undefined") });
  const ev = parse(b.sent.find((c) => c.init.body.includes('"type":"event"')))[2];
  assert.equal(ev.release, "herzone-web@abc1234");
  const crashed = b.sent.map(parse).filter((p) => p[1].type === "session").pop()[2];
  assert.deepEqual([crashed.status, crashed.errors], ["crashed", 1]);
});
