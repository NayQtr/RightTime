// Error reporting to Sentry without an SDK (classic script, loaded before app.js so it also catches load errors).
// Active only when QATAR_CONFIG.sentryDsn is set (Vercel build). Sends uncaught errors, unhandled promise rejections
// and API 5xx responses; at most 10 reports per page load. Never attached: user id, IP, request bodies, headers,
// storage contents. Messages are scrubbed of phone numbers, tokens and OTP-like codes; ids in the URL become {id}.
// Release health (NMX-62): with QATAR_CONFIG.release set, each page load is one Sentry session (no user or device id),
// ended as "exited" when the page closes or "crashed" on an uncaught error, so Sentry can measure crash-free sessions.
(function () {
  "use strict";
  var UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  var cfg = window.QATAR_CONFIG || {};
  var sent = 0;
  var LIMIT = 10;

  function parseDsn(dsn) {
    var m = /^https:\/\/([0-9a-f]+)@([^/]+)\/(\d+)$/.exec(String(dsn || "").trim());
    return m ? { key: m[1], host: m[2], projectId: m[3], dsn: String(dsn).trim() } : null;
  }
  function scrub(text) {
    return String(text == null ? "" : text)
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
      .replace(/\brt_[\w-]{20,}/g, "[token]")
      .replace(/\+?974[\s-]?\d{4}[\s-]?\d{4}/g, "[phone]")
      .replace(/(^|[^\w-])[3-7]\d{3}[\s-]?\d{4}(?![\w-])/g, "$1[phone]")
      .replace(/(^|[^\w-])\d{6}(?![\w-])/g, "$1[code]")
      .slice(0, 2000);
  }
  // Chrome/Safari/Firefox stack lines -> Sentry frames, oldest call first.
  function frames(stack) {
    var out = [];
    String(stack || "").split("\n").slice(0, 40).forEach(function (line) {
      var m = /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line.trim()) || /^(.*?)@(.+?):(\d+):(\d+)$/.exec(line.trim());
      if (m) out.push({ "function": m[1] || "?", filename: m[2].replace(location.origin, "").replace(/\?.*$/, ""), lineno: +m[3], colno: +m[4], in_app: m[2].indexOf(location.origin) === 0 || m[2].charAt(0) === "/" });
    });
    return out.reverse();
  }
  function page() { return location.pathname + location.hash.replace(UUID, "{id}").replace(/\?.*$/, ""); }
  function envelope(d, type, message, stack, extraTags) {
    var id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, "").slice(0, 32);
    var tags = { route: page(), locale: document.documentElement.lang || "ar" };
    for (var k in extraTags || {}) tags[k] = extraTags[k];
    var ev = { event_id: id, timestamp: Date.now() / 1000, platform: "javascript", level: "error", environment: cfg.sentryEnvironment || "staging",
      release: cfg.release || undefined,
      transaction: page(), tags: tags, request: { url: location.origin + page() },
      exception: { values: [{ type: type || "Error", value: scrub(message), stacktrace: { frames: frames(stack) } }] } };
    return JSON.stringify({ event_id: id, sent_at: new Date().toISOString(), dsn: d.dsn }) + "\n" + JSON.stringify({ type: "event" }) + "\n" + JSON.stringify(ev) + "\n";
  }
  function post(d, body) {
    try {
      fetch("https://" + d.host + "/api/" + d.projectId + "/envelope/?sentry_key=" + d.key + "&sentry_version=7",
        { method: "POST", body: body, keepalive: true }).catch(function () {});
    } catch (x) { /* never break the app */ }
  }

  // one session per page load; "errors" counts reported errors, an uncaught one ends it as "crashed"
  var session = null;
  function sendSession() {
    session.body.timestamp = new Date().toISOString();
    post(session.d, JSON.stringify({ sent_at: session.body.timestamp, dsn: session.d.dsn }) + "\n" + JSON.stringify({ type: "session" }) + "\n" + JSON.stringify(session.body) + "\n");
    session.body.init = false;
  }
  function startSession() {
    var d = parseDsn(cfg.sentryDsn);
    if (!d || !cfg.release) return;
    var now = new Date().toISOString();
    var sid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
    session = { d: d, done: false, body: { sid: sid, init: true, started: now, timestamp: now, status: "ok", errors: 0,
      attrs: { release: cfg.release, environment: cfg.sentryEnvironment || "staging" } } };
    sendSession();
  }
  function endSession(status) {
    if (!session || session.done) return;
    session.done = true;
    session.body.status = status;
    sendSession();
  }

  function report(err, tags, unhandled) {
    // the session counts every error (sent with its final update), even past the per-page report cap
    if (session && !session.done) { session.body.errors += 1; if (unhandled) endSession("crashed"); }
    var d = parseDsn(cfg.sentryDsn);
    if (!d || sent >= LIMIT) return false;
    sent += 1;
    var e = err instanceof Error ? err : new Error(String(err));
    post(d, envelope(d, e.name, e.message, e.stack, tags));
    return true;
  }
  window.addEventListener("error", function (ev) { if (ev.error || ev.message) report(ev.error || new Error(ev.message), null, true); });
  window.addEventListener("unhandledrejection", function (ev) { report(ev.reason, null, true); });
  window.addEventListener("pagehide", function () { endSession("exited"); });
  startSession();
  window.hzMonitor = { report: report, scrub: scrub, frames: frames, parseDsn: parseDsn, envelope: envelope, session: function () { return session && session.body; } };
})();
