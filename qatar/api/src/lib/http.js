// HTTP helpers: problem-details errors (v0.3 §3.1), JSON responses, time and money formatting.
import { errorMessage } from "./i18n.js";

export class ApiError extends Error {
  constructor(status, code, details, extra = {}) {
    super(code);
    this.status = status; this.code = code; this.details = details; this.extra = extra;
  }
}

export const fail = (status, code, details, extra) => { throw new ApiError(status, code, details, extra); };

export function problemBody(err, locale, requestId, domain = "docs.example") {
  return {
    type: `https://${domain}/errors/${err.code}`,
    status: err.status,
    code: err.code,
    message: errorMessage(err.code, locale),
    request_id: requestId,
    ...(err.details ? { details: err.details } : {}),
    retryable: err.status >= 500 || err.status === 429 || err.code === "OTP_INVALID" || err.code === "IDEMPOTENCY_IN_PROGRESS",
    ...err.extra,
  };
}

export function json(status, body, headers = {}) {
  return new Response(status === 204 || status === 304 ? null : JSON.stringify(body), {
    status,
    // nosniff: a browser never reads an API response as another type (ZAP 10021, NMX-31)
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

// Postgres SQLSTATEs raised by app.* functions -> API errors
const PG_MAP = {
  P0010: [409, "SESSION_FULL"], P0011: [422, "SESSION_NOT_ON_SALE"], P0012: [409, "ALREADY_BOOKED"],
  P0030: [409, "NOT_REBOOKABLE"], P0031: [422, "LANGUAGE_CONFLICT"],
  P0004: [409, "CONFLICT"], P0002: [409, "CONFLICT"],
  P0020: [404, "NOT_FOUND"], P0021: [409, "CONFLICT"], P0022: [409, "CONFLICT"],
  P0040: [422, "VALIDATION_FAILED"], P0041: [404, "NOT_FOUND"], P0042: [422, "VALIDATION_FAILED"],
  P0043: [409, "CONFLICT"], P0044: [409, "CONFLICT"], P0045: [422, "VALIDATION_FAILED"], P0046: [422, "VALIDATION_FAILED"],
  P0050: [409, "CONFLICT"], P0051: [403, "FORBIDDEN"], P0052: [403, "FORBIDDEN"],
  "23505": [409, "CONFLICT"], "23514": [422, "VALIDATION_FAILED"], "22P02": [400, "MALFORMED_REQUEST"],
  // database busy (no free connection, or starting up): a short, retryable 503, never a 500 (NMX-31)
  "53300": [503, "UNAVAILABLE"], "57P03": [503, "UNAVAILABLE"],
};
const BUSY = new Set(["53300", "57P03"]);

export function mapPgError(e) {
  if (e instanceof ApiError) return e;
  const m = e && PG_MAP[e.code];
  if (!m) return null;
  if (BUSY.has(e.code)) { console.error("database busy:", e.code); return new ApiError(503, "UNAVAILABLE", [{ reason: "busy" }], { retry_after: 2 }); }
  return new ApiError(m[0], m[1], [{ reason: String(e.message || "").split("\n")[0].slice(0, 200) }]);
}

// Asia/Qatar is UTC+3 all year (no DST): ISO-8601 with offset (v0.3 §3.1)
export function qa(ts) {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  return new Date(d.getTime() + 3 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "+03:00");
}

export function money(minor, locale = "ar") {
  const v = minor / 100;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return { amount_minor: minor, currency: "QAR", display: locale === "en" ? `QAR ${s}` : `${s} ر.ق` };
}

export const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function requireUuid(v, field) {
  if (!isUuid(v)) fail(400, "MALFORMED_REQUEST", [{ field, code: "INVALID_UUID" }]);
  return v;
}

// Truncated client IP (IPv4 /24, IPv6 /48) so no full address is stored. IPv6 is expanded first: "2001:db8::1" has
// only two groups before "::", and cutting the text at the third colon gave invalid values such as "2001:db8:::/48".
export function ipTrunc(ip) {
  if (!ip) return null;
  let s = String(ip).trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(s);
  if (mapped) s = mapped[1];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) {
    const p = s.split(".").map(Number);
    return p.every((n) => n <= 255) ? `${p[0]}.${p[1]}.${p[2]}.0/24` : null;
  }
  if (!s.includes(":") || (s.match(/::/g) || []).length > 1) return null;
  const [head, tail] = s.includes("::") ? s.split("::") : [s, null];
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = tail === null ? 0 : 8 - left.length - right.length;
  const groups = [...left, ...Array(Math.max(fill, 0)).fill("0"), ...right];
  if (groups.length !== 8 || (tail !== null && fill < 1) || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.slice(0, 3).map((g) => parseInt(g, 16).toString(16)).join(":") + "::/48";
}
