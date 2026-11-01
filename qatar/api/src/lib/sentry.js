// Error reporting to Sentry without an SDK: one envelope POST per unexpected error (HTTP 500 path only). Nothing is
// sent unless SENTRY_DSN is set. Messages are scrubbed of phone numbers, tokens and OTP-like codes; no request body,
// header, user id or IP is ever attached (privacy notice: no tracking).
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function parseDsn(dsn) {
  const m = /^https:\/\/([0-9a-f]+)@([^/]+)\/(\d+)$/.exec(String(dsn || "").trim());
  return m ? { key: m[1], host: m[2], projectId: m[3], dsn: String(dsn).trim() } : null;
}

export function scrub(text) {
  return String(text ?? "")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/\brt_[\w-]{20,}/g, "[token]")
    .replace(/\+?974[\s-]?\d{4}[\s-]?\d{4}/g, "[phone]")
    .replace(/(?<![\w-])\d{6}(?![\w-])/g, "[code]")
    .slice(0, 2000);
}

// V8 stack lines -> Sentry frames (oldest call first, as Sentry expects).
export function frames(stack) {
  const out = [];
  for (const line of String(stack || "").split("\n").slice(1, 40)) {
    const m = /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line.trim());
    if (m) out.push({ function: m[1] || "?", filename: m[2].replace(/^.*\/(src\/)/, "$1"), lineno: Number(m[3]), colno: Number(m[4]), in_app: !/node_modules|node:|ext:/.test(m[2]) });
  }
  return out.reverse();
}

export function buildEnvelope(d, err, { route = null, requestId = null, environment = "staging", now = Date.now() } = {}) {
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId, timestamp: now / 1000, platform: "node", level: "error", environment, server_name: "herzone-api",
    transaction: route ? route.replace(UUID, "{id}") : undefined,
    tags: { ...(requestId ? { request_id: requestId } : {}) },
    exception: { values: [{ type: (err && err.name) || "Error", value: scrub(err && err.message ? err.message : err),
      stacktrace: { frames: frames(err && err.stack) } }] },
  };
  const header = { event_id: eventId, sent_at: new Date(now).toISOString(), dsn: d.dsn };
  return `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
}

export async function reportError(getEnv, err, opts = {}) {
  const d = parseDsn(getEnv("SENTRY_DSN"));
  if (!d) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`https://${d.host}/api/${d.projectId}/envelope/?sentry_key=${d.key}&sentry_version=7`, {
      method: "POST", body: buildEnvelope(d, err, { ...opts, environment: getEnv("SENTRY_ENVIRONMENT") || "staging" }), signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch { return false; }
}
