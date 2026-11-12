// Framework-free API application: handle(Request) -> Response. Runs on Node (local, tests) and Deno (Supabase Edge).
// Routes: /api/v1/* (user), /api/admin/v1/* (admin), /api/v1/payments/webhooks/{psp}, /api/mock-psp/* (staging only).
import { loadConfig } from "./lib/config.js";
import { randomToken, sha256hex } from "./lib/crypto.js";
import { ApiError, fail, ipTrunc, json, mapPgError, problemBody } from "./lib/http.js";
import { jwtVerify } from "./lib/crypto.js";
import { loadKeys } from "./lib/keys.js";
import { reportError } from "./lib/sentry.js";
import { testPsp } from "./services/psp.js";
import { userRoutes } from "./routes/user.js";
import { paymentRoutes } from "./routes/payments.js";
import { adminRoutes } from "./routes/admin.js";
import { pushRoutes } from "./routes/push.js";
import { venueRoutes } from "./routes/venue.js";
import { alertRoutes } from "./routes/alerts.js";
import { funnelRoutes } from "./routes/funnel.js";

// Endpoints a suspended / banned user may still call (v0.3 §3.1 ACCOUNT_SUSPENDED applies to the rest)
const SUSPENDED_ALLOWED = new Set(["GET /api/v1/users/me", "POST /api/v1/auth/logout", "GET /api/v1/notifications",
  "GET /api/v1/cases/mine", "POST /api/v1/cases/{ref}/appeal", "GET /api/v1/bookings", "GET /api/v1/bookings/{id}",
  "GET /api/v1/bookings/{id}/event-details", "GET /api/v1/users/me/export"]);

function compile(routes) {
  return routes.map((r) => {
    const names = [];
    const src = r.path.split(/(\{[a-z_]+\})/).map((part) => {
      const m = /^\{([a-z_]+)\}$/.exec(part);
      if (m) { names.push(m[1]); return "([^/]+?)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    const re = new RegExp("^" + src + "$");
    return { ...r, re, names, key: `${r.method} ${r.path}` };
  });
}

export function createApp({ sql, getEnv = () => undefined }) {
  const routes = compile([...userRoutes, ...paymentRoutes, ...adminRoutes, ...pushRoutes, ...venueRoutes, ...alertRoutes, ...funnelRoutes]);
  const app = { sql, getEnv, handle: null, psp: null };

  async function context(req) {
    const keys = await loadKeys(sql, getEnv);
    const cfg = await loadConfig(sql, getEnv);
    const url = new URL(req.url);
    const fwd = req.headers.get("x-forwarded-for") || "";
    const locale = (req.headers.get("accept-language") || "ar").toLowerCase().startsWith("en") ? "en" : "ar";
    const psp = testPsp({ keys, cfg, deliver: (raw, headers) => deliverWebhook(raw, headers) });
    // Client IP (NMX-63): the address Cloudflare or the gateway saw (cf-connecting-ip / x-real-ip, which a client cannot
    // set), and only without them the first X-Forwarded-For entry. Rate limits use ipBucket: an address that cannot be
    // read shares one bucket ("0.0.0.0") instead of skipping the per-IP limit.
    const rawIp = (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || fwd.split(",")[0] || "").trim();
    const trunc = ipTrunc(rawIp);
    return { req, url, keys, cfg, sql, getEnv, locale, psp, ip: rawIp || null,
      ipTrunc: trunc, ipBucket: trunc || "0.0.0.0", requestId: "req_" + randomToken(9) };
  }

  // In-process delivery used by the mock PSP: goes through the full webhook route (signature, dedupe, processing).
  async function deliverWebhook(raw, headers) {
    const res = await app.handle(new Request("http://internal/api/v1/payments/webhooks/test_psp", {
      method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw }));
    if (res.status >= 300) throw new Error(`webhook delivery failed: ${res.status}`);
    return res;
  }

  function corsHeaders(req, cfg) {
    const origin = req.headers.get("origin");
    const allow = cfg && (cfg.corsOrigins.includes("*") ? "*" : (origin && cfg.corsOrigins.includes(origin) ? origin : null));
    if (!allow) return {};
    return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key, accept-language, if-none-match, x-signature, x-timestamp",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS", "Access-Control-Expose-Headers": "x-request-id, etag, retry-after", "Vary": "Origin" };
  }

  async function authenticate(ctx, route) {
    const h = ctx.req.headers.get("authorization") || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (route.auth === "none") return;
    const claims = token ? jwtVerify(ctx.keys.jwt.publicKey, token) : null;
    ctx.claims = claims;
    // Venue portal (016): its own token type, accepted only on venue routes, and only while its portal session lives.
    if (route.auth === "venue" || (claims && claims.typ === "venue")) {
      if (route.auth !== "venue" || !claims || claims.typ !== "venue" || !claims.sid) fail(401, "UNAUTHENTICATED");
      const [vu] = await sql`SELECT u.id, u.venue_id, u.email, v.name AS venue_name FROM app.venue_portal_sessions ps
                               JOIN app.venue_users u ON u.id = ps.venue_user_id JOIN app.venues v ON v.id = u.venue_id
                              WHERE ps.id = ${claims.sid} AND u.id = ${claims.sub} AND ps.revoked_at IS NULL AND ps.expires_at > now()
                                AND u.status = 'active'`;
      if (!vu) fail(401, "UNAUTHENTICATED");
      ctx.venueUser = vu;
      return;
    }
    // A session ends at once (NMX-17): sign-out, refresh-token reuse and account deletion revoke the session's refresh
    // tokens, and its access tokens are refused from then on. Tokens issued before sessions were tracked carry no sid
    // and expire on their own within the access TTL.
    if (claims && claims.sid) {
      const [live] = await sql`SELECT 1 FROM app.refresh_tokens WHERE family_id = ${claims.sid} AND subject_id = ${claims.sub}
                                  AND revoked_at IS NULL AND expires_at > now() LIMIT 1`;
      if (!live) fail(401, "UNAUTHENTICATED");
    }
    if (route.auth === "user" || route.auth === "user_any") {
      if (!claims || claims.typ !== "user") fail(401, "UNAUTHENTICATED");
      const [u] = await sql`SELECT * FROM app.users WHERE id = ${claims.sub}`;
      if (!u || ["deleted"].includes(u.status)) fail(401, "UNAUTHENTICATED");
      if (["suspended", "banned"].includes(u.status) && !SUSPENDED_ALLOWED.has(route.key)) fail(403, "ACCOUNT_SUSPENDED");
      if (route.auth === "user" && !u.registration_completed_at) fail(403, "REGISTRATION_INCOMPLETE");
      ctx.user = u;
      return;
    }
    if (route.auth === "admin") {
      if (!claims || claims.typ !== "admin") fail(401, "UNAUTHENTICATED");
      const [a] = await sql`SELECT id, email, name, role, status FROM app.admin_users WHERE id = ${claims.sub}`;
      if (!a || a.status !== "active") fail(401, "UNAUTHENTICATED");
      if (route.roles && !route.roles.includes(a.role)) fail(403, "FORBIDDEN");
      ctx.admin = a;
    }
  }

  async function withIdempotency(ctx, route, run) {
    const key = ctx.req.headers.get("idempotency-key");
    if (!key || key.length > 100) fail(400, "IDEMPOTENCY_KEY_REQUIRED");
    const principal = ctx.user ? `user:${ctx.user.id}` : ctx.admin ? `admin:${ctx.admin.id}` : `anon:${ctx.ipTrunc || "unknown"}`;
    const reqHash = sha256hex(`${route.key}\n${ctx.rawBody || ""}\n${JSON.stringify(ctx.params)}`);
    await sql`DELETE FROM app.idempotency_keys WHERE created_at < now() - interval '24 hours'`;
    // Reserve the key before running (status_code 0 = in progress), so a client retry that arrives while the first
    // request is still running is told to wait instead of running the handler a second time.
    const reserved = await sql`INSERT INTO app.idempotency_keys (principal, key, method_path, request_hash, status_code, response)
                               VALUES (${principal}, ${key}, ${route.key}, ${reqHash}, 0, '{}'::jsonb)
                               ON CONFLICT (principal, key) DO NOTHING RETURNING key`;
    if (!reserved.length) {
      const [prev] = await sql`SELECT * FROM app.idempotency_keys WHERE principal = ${principal} AND key = ${key}`;
      if (prev && prev.status_code === 0) fail(409, "IDEMPOTENCY_IN_PROGRESS", null, { retry_after: 2 });
      if (prev && prev.request_hash !== reqHash) fail(409, "IDEMPOTENCY_KEY_REUSED");
      if (prev) return json(prev.status_code, prev.response, { "Idempotent-Replayed": "true" });
    }
    const release = () => sql`DELETE FROM app.idempotency_keys WHERE principal = ${principal} AND key = ${key} AND status_code = 0`;
    let res;
    // a thrown error is never stored (as before): the key is freed so the client may try again
    try { res = await run(); } catch (e) { await release(); throw e; }
    if (res.status < 500) {
      const body = await res.clone().json().catch(() => ({}));
      await sql`UPDATE app.idempotency_keys SET status_code = ${res.status}, response = ${sql.json(body)} WHERE principal = ${principal} AND key = ${key}`;
    } else await release();
    return res;
  }

  app.handle = async function handle(req) {
    let ctx = null;
    let cfg = null;
    try {
      ctx = await context(req);
      cfg = ctx.cfg;
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req, cfg) });
      const path = ctx.url.pathname.replace(/\/+$/, "") || "/";
      let route = null, params = {};
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(path);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== req.method) continue;
        route = r; r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
        break;
      }
      if (!route) fail(pathMatched ? 405 : 404, pathMatched ? "METHOD_NOT_ALLOWED" : "NOT_FOUND");
      ctx.params = params;
      ctx.rawBody = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) ? await req.text() : "";
      ctx.body = {};
      if (ctx.rawBody && !route.rawBody) {
        try { ctx.body = JSON.parse(ctx.rawBody); } catch { fail(400, "MALFORMED_REQUEST"); }
        if (ctx.body === null || typeof ctx.body !== "object" || Array.isArray(ctx.body)) fail(400, "MALFORMED_REQUEST");
      }
      // Forced update (NMX-61): the mobile app sends "X-HerZone-App: <version> <platform>". Below MIN_APP_VERSION (for
      // example after a security fix) every call is refused with 426, and the app shows only "Update". The website
      // sends no such header and is never affected.
      const appVersion = req.headers.get("x-herzone-app");
      if (appVersion && cfg.minAppVersion && versionBelow(appVersion, cfg.minAppVersion)) {
        const ios = /\bios\b/i.test(appVersion);
        const store = ios ? cfg.appStoreUrl : cfg.playStoreUrl;
        fail(426, "APP_UPDATE_REQUIRED", [{ field: "app_version", code: "BELOW_MINIMUM", min_version: cfg.minAppVersion, ...(store ? { store_url: store } : {}) }]);
      }
      await authenticate(ctx, route);
      const run = () => route.handler(ctx);
      let res = route.idem ? await withIdempotency(ctx, route, run) : await run();
      const headers = new Headers(res.headers);
      headers.set("X-Request-Id", ctx.requestId);
      for (const [k, v] of Object.entries(corsHeaders(req, cfg))) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      const err = mapPgError(e);
      const locale = ctx?.locale || "ar";
      const requestId = ctx?.requestId || "req_unknown";
      if (!err) {
        console.error(requestId, e && e.stack ? e.stack : e);
        // the DSN comes from the environment or app_config (a DSN is a public, write-only key)
        const dsnEnv = (k) => getEnv(k) ?? (k === "SENTRY_DSN" ? cfg && cfg.sentryDsn : k === "SENTRY_ENVIRONMENT" ? cfg && cfg.sentryEnvironment : undefined);
        await reportError(dsnEnv, e, { route: `${req.method} ${new URL(req.url).pathname}`, requestId });
        return json(500, problemBody(new ApiError(500, "INTERNAL"), locale, requestId), { "X-Request-Id": requestId, ...corsHeaders(req, cfg) });
      }
      const headers = { "X-Request-Id": requestId, ...corsHeaders(req, cfg) };
      if (err.extra && err.extra.retry_after) headers["Retry-After"] = String(err.extra.retry_after);
      return json(err.status, problemBody(err, locale, requestId), headers);
    }
  };
  return app;
}

// "1.4.2+17 android" below "1.5.0"? Compares major.minor.patch; the build number is ignored. A version that cannot be
// read counts as below, so a broken client is asked to update rather than let through.
export function versionBelow(header, min) {
  const parse = (v) => { const m = /^\s*(\d+)\.(\d+)\.(\d+)/.exec(String(v)); return m ? m.slice(1, 4).map(Number) : null; };
  const a = parse(header), b = parse(min);
  if (!b) return false;
  if (!a) return true;
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

