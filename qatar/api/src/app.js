// Framework-free API application: handle(Request) -> Response. Runs on Node (local, tests) and Deno (Supabase Edge).
// Routes: /api/v1/* (user), /api/admin/v1/* (admin), /api/v1/payments/webhooks/{psp}, /api/mock-psp/* (staging only).
import { loadConfig } from "./lib/config.js";
import { randomToken, sha256hex } from "./lib/crypto.js";
import { ApiError, fail, ipTrunc, json, mapPgError, problemBody } from "./lib/http.js";
import { jwtVerify } from "./lib/crypto.js";
import { loadKeys } from "./lib/keys.js";
import { testPsp } from "./services/psp.js";
import { userRoutes } from "./routes/user.js";
import { paymentRoutes } from "./routes/payments.js";
import { adminRoutes } from "./routes/admin.js";

// Endpoints a suspended / banned user may still call (v0.3 §3.1 ACCOUNT_SUSPENDED applies to the rest)
const SUSPENDED_ALLOWED = new Set(["GET /api/v1/users/me", "POST /api/v1/auth/logout", "GET /api/v1/notifications",
  "GET /api/v1/cases/mine", "POST /api/v1/cases/{ref}/appeal", "GET /api/v1/bookings", "GET /api/v1/bookings/{id}",
  "GET /api/v1/bookings/{id}/event-details"]);

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
  const routes = compile([...userRoutes, ...paymentRoutes, ...adminRoutes]);
  const app = { sql, getEnv, handle: null, psp: null };

  async function context(req) {
    const keys = await loadKeys(sql, getEnv);
    const cfg = await loadConfig(sql, getEnv);
    const url = new URL(req.url);
    const fwd = req.headers.get("x-forwarded-for") || "";
    const locale = (req.headers.get("accept-language") || "ar").toLowerCase().startsWith("en") ? "en" : "ar";
    const psp = testPsp({ keys, cfg, deliver: (raw, headers) => deliverWebhook(raw, headers) });
    return { req, url, keys, cfg, sql, locale, psp, ip: fwd.split(",")[0].trim() || null,
      ipTrunc: ipTrunc(fwd.split(",")[0].trim()), requestId: "req_" + randomToken(9) };
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
    const [prev] = await sql`SELECT * FROM app.idempotency_keys WHERE principal = ${principal} AND key = ${key}`;
    if (prev) {
      if (prev.request_hash !== reqHash) fail(409, "IDEMPOTENCY_KEY_REUSED");
      return json(prev.status_code, prev.response, { "Idempotent-Replayed": "true" });
    }
    const res = await run();
    if (res.status < 500) {
      const body = await res.clone().json().catch(() => ({}));
      await sql`INSERT INTO app.idempotency_keys (principal, key, method_path, request_hash, status_code, response)
                VALUES (${principal}, ${key}, ${route.key}, ${reqHash}, ${res.status}, ${sql.json(body)})
                ON CONFLICT (principal, key) DO NOTHING`;
    }
    return res;
  }

  app.handle = async function handle(req) {
    let ctx = null;
    let cfg = null;
    try {
      ctx = await context(req);
      cfg = ctx.cfg;
      app.psp = ctx.psp;
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
      await authenticate(ctx, route);
      const run = () => route.handler(ctx);
      let res = route.idem ? await withIdempotency(ctx, route, run) : await run();
      const headers = new Headers(res.headers);
      headers.set("X-Request-Id", ctx.requestId);
      for (const [k, v] of Object.entries(corsHeaders(req, cfg))) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      const err = mapPgError(e) || (e instanceof ApiError ? e : null);
      const locale = ctx?.locale || "ar";
      const requestId = ctx?.requestId || "req_unknown";
      if (!err) {
        console.error(requestId, e && e.stack ? e.stack : e);
        return json(500, problemBody(new ApiError(500, "INTERNAL"), locale, requestId), { "X-Request-Id": requestId, ...corsHeaders(req, cfg) });
      }
      const headers = { "X-Request-Id": requestId, ...corsHeaders(req, cfg) };
      if (err.extra && err.extra.retry_after) headers["Retry-After"] = String(err.extra.retry_after);
      return json(err.status, problemBody(err, locale, requestId), headers);
    }
  };
  return app;
}
