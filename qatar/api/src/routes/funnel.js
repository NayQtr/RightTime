// Step counter (migration 021, item 44 / plan U2; provisional). Off by default (FUNNEL_COUNTER_ENABLED, lib/config.js) until
// the owner or counsel words a line for the privacy notice. When on, the website (and later the app) sends one ping per
// sign-up and booking step it reaches, and only after GET /api/v1/support/contact said funnel_counter: true. The server
// adds 1 to a count per day, step and platform: no account, IP address, cookie or device id is read or kept (the route
// takes no sign-in and no Idempotency-Key, whose store would hold the address prefix). When off, nothing is stored.
import { fail, json } from "../lib/http.js";

// The steps, in the order a member meets them (website screens; the app uses the same names).
export const FUNNEL_STEPS = [
  "signup_welcome",   // welcome screen, signed out
  "signup_quiz",      // first question of the quiz, signed out
  "signup_phone",     // phone number
  "signup_code",      // sign-in code
  "signup_register",  // name and consents
  "signup_done",      // registration complete
  "booking_sessions", // list of sessions
  "booking_review",   // seat held: review and pay
  "booking_checkout", // went on to the payment page
  "booking_paid",     // payment confirmed
];
export const FUNNEL_PLATFORMS = ["web", "ios", "android"];

// Against a flood of pings (anyone can call this route): at most FUNNEL_PINGS_PER_WINDOW per address prefix (ipBucket)
// in 10 minutes, then 429. Counted in this running copy's memory only, never stored, and only while the counter is on.
export const FUNNEL_PINGS_PER_WINDOW = 60;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 10000;
const recent = new Map(); // ipBucket -> { start, n }
function overLimit(key, now = Date.now()) {
  let e = recent.get(key);
  if (!e || now - e.start >= WINDOW_MS) {
    if (recent.size >= MAX_KEYS) for (const [k, v] of recent) if (now - v.start >= WINDOW_MS) recent.delete(k);
    if (recent.size >= MAX_KEYS) recent.clear();
    e = { start: now, n: 0 };
    recent.set(key, e);
  }
  e.n += 1;
  return e.n > FUNNEL_PINGS_PER_WINDOW;
}

async function countStep(ctx) {
  const { sql, cfg, body } = ctx;
  if (!cfg.funnelCounter) return json(204, null);
  if (overLimit(ctx.ipBucket)) fail(429, "RATE_LIMITED", null, { retry_after: WINDOW_MS / 1000 });
  const details = [];
  if (!FUNNEL_STEPS.includes(body.step)) details.push({ field: "step", code: "INVALID" });
  if (!FUNNEL_PLATFORMS.includes(body.platform)) details.push({ field: "platform", code: "INVALID" });
  if (details.length) fail(422, "VALIDATION_FAILED", details);
  await sql`
    INSERT INTO app.funnel_daily (day, step, platform, count) VALUES ((now() AT TIME ZONE 'Asia/Qatar')::date, ${body.step}, ${body.platform}, 1)
    ON CONFLICT (day, step, platform) DO UPDATE SET count = app.funnel_daily.count + 1`;
  return json(204, null);
}

// Admin console: counts by day and step for the last ?days= days (default 30, at most 180), every platform.
async function funnelTable(ctx) {
  const days = Math.min(180, Math.max(1, Number.parseInt(ctx.url.searchParams.get("days"), 10) || 30));
  const rows = await ctx.sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, step, platform, count FROM app.funnel_daily
     WHERE day > (now() AT TIME ZONE 'Asia/Qatar')::date - ${days}::int ORDER BY day DESC, step, platform`;
  return json(200, { enabled: ctx.cfg.funnelCounter, steps: FUNNEL_STEPS, platforms: FUNNEL_PLATFORMS, days, rows });
}

export const funnelRoutes = [
  { method: "POST", path: "/api/v1/funnel/steps", auth: "none", handler: countStep },
  { method: "GET", path: "/api/admin/v1/funnel", auth: "admin", roles: ["owner", "ops", "analyst"], handler: funnelTable },
];
