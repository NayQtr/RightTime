// Phone notifications (Web Push, migration 013). A member's browser or home-screen app registers a push subscription;
// every notification queued for her on the "push" channel (the same rows the inbox shows) is then also sent to her
// devices by the dispatcher, which pg_cron calls every minute with a token only the database and the API know.
import { safeEqual } from "../lib/crypto.js";
import { fail, json } from "../lib/http.js";
import { loadOptionalKey } from "../lib/keys.js";
import { generateVapidKey, sendPush, vapidFromJwk } from "../services/webpush.js";
import { notificationText } from "./user.js";

// Only the browsers' own push services: the API never posts to an address a client made up.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/];
const MAX_DEVICES = 10;
const BATCH = 50;
const FRESH_HOURS = 24; // older queued notifications are not pushed (still in the inbox)
const SUBJECT = "https://herzone.app";

let vapidCache = null;
export async function vapidKeys(sql, getEnv) {
  if (!vapidCache) vapidCache = await vapidFromJwk(await loadOptionalKey(sql, getEnv, "VAPID_PRIVATE_JWK", generateVapidKey));
  return vapidCache;
}
export function resetVapidCache() { vapidCache = null; }

export function validEndpoint(endpoint) {
  let u;
  try { u = new URL(String(endpoint || "")); } catch { return false; }
  return u.protocol === "https:" && String(endpoint).length <= 1000 && PUSH_HOSTS.some((re) => re.test(u.hostname));
}
const b64uKey = (s, min, max) => typeof s === "string" && /^[A-Za-z0-9_-]+$/.test(s) && s.length >= min && s.length <= max;

async function publicKey(ctx) {
  const v = await vapidKeys(ctx.sql, ctx.getEnv);
  return json(200, { public_key: v.publicKey }, { "Cache-Control": "public, max-age=3600" });
}

async function subscribe(ctx) {
  const { sql, body, user } = ctx;
  const keys = body.keys || {};
  if (!validEndpoint(body.endpoint) || !b64uKey(keys.p256dh, 80, 100) || !b64uKey(keys.auth, 16, 32))
    fail(422, "VALIDATION_FAILED", [{ field: "subscription", code: "INVALID" }]);
  await sql.begin(async (tx) => {
    // one row per device; a device that signs in as someone else moves to that account
    await tx`INSERT INTO app.push_subscriptions (user_id, endpoint, p256dh, auth)
             VALUES (${user.id}, ${body.endpoint}, ${keys.p256dh}, ${keys.auth})
             ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
               created_at = now(), failures = 0, last_error = NULL`;
    await tx`DELETE FROM app.push_subscriptions WHERE user_id = ${user.id} AND id NOT IN (
               SELECT id FROM app.push_subscriptions WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT ${MAX_DEVICES})`;
  });
  return json(201, { subscribed: true });
}

async function unsubscribe(ctx) {
  await ctx.sql`DELETE FROM app.push_subscriptions WHERE user_id = ${ctx.user.id} AND endpoint = ${String(ctx.body.endpoint || "")}`;
  return json(200, { subscribed: false });
}

// Sends due push-channel notifications to every device of their member. Rows are claimed first (so two runs never send
// the same one), then marked sent (at least one device got it), failed (every device refused) or cancelled (no device,
// or too old to push). A device is only sent what was queued after it subscribed. Dead subscriptions are removed.
export async function dispatchPush(sql, getEnv, { fetchImpl = fetch, limit = BATCH } = {}) {
  await sql`UPDATE app.notifications_outbox SET status = 'cancelled', provider_ref = 'push:stale'
             WHERE channel = 'push' AND status = 'queued' AND created_at < now() - make_interval(hours => ${FRESH_HOURS})`;
  const rows = await sql`
    UPDATE app.notifications_outbox SET provider_ref = 'push:claimed:' || to_char(now(), 'YYYYMMDDHH24MISS'), updated_at = now()
     WHERE id IN (SELECT id FROM app.notifications_outbox
                   WHERE channel = 'push' AND status = 'queued' AND send_after <= now()
                     AND (provider_ref IS NULL OR (provider_ref LIKE 'push:claimed:%' AND updated_at < now() - interval '5 minutes'))
                   ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
     RETURNING *`;
  if (!rows.length) return { processed: 0, sent: 0, failed: 0, no_device: 0 };
  const subs = await sql`SELECT * FROM app.push_subscriptions WHERE user_id IN ${sql([...new Set(rows.map((r) => r.user_id))])}`;
  const vapid = await vapidKeys(sql, getEnv);
  const out = { processed: rows.length, sent: 0, failed: 0, no_device: 0 };
  for (const n of rows) {
    const devices = subs.filter((s) => s.user_id === n.user_id && new Date(s.created_at) <= new Date(n.created_at));
    if (!devices.length) {
      await sql`UPDATE app.notifications_outbox SET status = 'cancelled', provider_ref = 'push:no_device' WHERE id = ${n.id}`;
      out.no_device += 1;
      continue;
    }
    const ar = n.locale !== "en";
    const message = { title: "HerZone", body: notificationText(n, n.locale), tag: n.id, lang: ar ? "ar" : "en", dir: ar ? "rtl" : "ltr",
      url: (n.payload || {}).booking_id ? `/#/booking/${n.payload.booking_id}` : "/#/inbox" };
    let delivered = 0;
    for (const d of devices) {
      const r = await sendPush(d, message, vapid, { subject: SUBJECT, fetchImpl });
      if (r.ok) { delivered += 1; await sql`UPDATE app.push_subscriptions SET failures = 0, last_success_at = now(), last_error = NULL WHERE id = ${d.id}`; }
      else if (r.gone) await sql`DELETE FROM app.push_subscriptions WHERE id = ${d.id}`;
      else await sql`UPDATE app.push_subscriptions SET failures = failures + 1, last_error = ${`${r.status} ${r.error || ""}`.trim().slice(0, 200)} WHERE id = ${d.id}`;
    }
    await sql`UPDATE app.notifications_outbox SET status = ${delivered ? "sent" : "failed"}, sent_at = ${delivered ? new Date() : null},
               provider_ref = ${`push:${delivered}/${devices.length}`} WHERE id = ${n.id}`;
    if (delivered) out.sent += 1; else out.failed += 1;
  }
  return out;
}

async function dispatch(ctx) {
  const given = ctx.req.headers.get("x-dispatch-token") || "";
  const [t] = await ctx.sql`SELECT token FROM app.push_dispatch_token WHERE id = 1`;
  if (!t || !given || !safeEqual(given, t.token)) fail(401, "UNAUTHENTICATED");
  return json(200, await dispatchPush(ctx.sql, ctx.getEnv));
}

export const pushRoutes = [
  { method: "GET", path: "/api/v1/push/key", auth: "none", handler: publicKey },
  { method: "POST", path: "/api/v1/push/subscriptions", auth: "user_any", handler: subscribe },
  { method: "POST", path: "/api/v1/push/subscriptions:delete", auth: "user_any", handler: unsubscribe },
  { method: "POST", path: "/api/internal/push:dispatch", auth: "none", handler: dispatch },
];
