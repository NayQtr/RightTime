// Phone notifications (Web Push, migration 013). A member's browser or home-screen app registers a push subscription;
// every notification queued for her on the "push" channel (the same rows the inbox shows) is then also sent to her
// devices by the dispatcher, which pg_cron calls every minute with a token only the database and the API know.
import { decrypt, safeEqual } from "../lib/crypto.js";
import { fail, json, qa, requireUuid } from "../lib/http.js";
import { audit } from "../services/common.js";
import { coordinatorAlertsTick } from "../services/coordinator_alerts.js";
import { b64uKey, resetVapidCache, sendPush, validEndpoint, vapidKeys } from "../services/webpush.js";
import { notificationText } from "../services/notifications.js";

const MAX_DEVICES = 10;
const BATCH = 50;
const FRESH_HOURS = 24; // older queued notifications are not pushed (still in the inbox)
const SUBJECT = "https://herzone.app";
// Retries (021, Notion fix 6, provisional): a notification no device accepted (a network error or a push-service error,
// not a device that no longer exists) is tried again after these many minutes: at most 3 more tries, with growing gaps.
// After the last one it is marked failed and listed for coordinators in the admin console.
export const PUSH_RETRY_MINUTES = [2, 10, 30];

// the key loader lives in services/webpush.js (coordinator alerts use it too); kept exported here for existing callers
export { resetVapidCache, vapidKeys };


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
// the same one), then marked sent (at least one device got it), queued again for a retry (no device got it and one of
// them may be reachable later: PUSH_RETRY_MINUTES), failed (every device refused, retries used up) or cancelled (no
// device, or too old to push). A device is only sent what was queued after it subscribed. Dead subscriptions are removed.
export const LOCK_SCREEN_TEXT = {
  ar: "لديكِ تحديث جديد في HerZone. افتحي التطبيق لقراءته.",
  en: "You have a new update in HerZone. Open the app to read it.",
};

export async function dispatchPush(sql, getEnv, { fetchImpl = fetch, limit = BATCH } = {}) {
  await sql`UPDATE app.notifications_outbox SET status = 'cancelled', provider_ref = 'push:stale'
             WHERE channel = 'push' AND status = 'queued' AND created_at < now() - make_interval(hours => ${FRESH_HOURS})`;
  const rows = await sql`
    UPDATE app.notifications_outbox SET provider_ref = 'push:claimed:' || to_char(now(), 'YYYYMMDDHH24MISS'), updated_at = now()
     WHERE id IN (SELECT id FROM app.notifications_outbox
                   WHERE channel = 'push' AND status = 'queued' AND send_after <= now()
                     AND (provider_ref IS NULL OR provider_ref LIKE 'push:retry:%'
                          OR (provider_ref LIKE 'push:claimed:%' AND updated_at < now() - interval '5 minutes'))
                   ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
     RETURNING *`;
  if (!rows.length) return { processed: 0, sent: 0, failed: 0, no_device: 0, retrying: 0 };
  const subs = await sql`SELECT * FROM app.push_subscriptions WHERE user_id IN ${sql([...new Set(rows.map((r) => r.user_id))])}`;
  const vapid = await vapidKeys(sql, getEnv);
  const out = { processed: rows.length, sent: 0, failed: 0, no_device: 0, retrying: 0 };
  for (const n of rows) {
    const devices = subs.filter((s) => s.user_id === n.user_id && new Date(s.created_at) <= new Date(n.created_at));
    if (!devices.length) {
      await sql`UPDATE app.notifications_outbox SET status = 'cancelled', provider_ref = 'push:no_device' WHERE id = ${n.id}`;
      out.no_device += 1;
      continue;
    }
    const ar = n.locale !== "en";
    // NMX-21: the lock screen shows one generic line, never a name, place, time or booking reference; the text itself
    // is read in the app (inbox), behind sign-in, and in the mobile app behind Face ID / fingerprint (NMX-52).
    const p = n.payload || {};
    // a waitlist offer (021) opens the session list at that session, where she books the seat kept for her
    const message = { title: "HerZone", body: ar ? LOCK_SCREEN_TEXT.ar : LOCK_SCREEN_TEXT.en, tag: n.id, lang: ar ? "ar" : "en", dir: ar ? "rtl" : "ltr",
      url: p.booking_id ? `/#/booking/${p.booking_id}` : p.session_id ? `/#/sessions?s=${p.session_id}` : "/#/inbox" };
    let delivered = 0, lastError = null, mayRecover = false;
    for (const d of devices) {
      const r = await sendPush(d, message, vapid, { subject: SUBJECT, fetchImpl });
      if (r.ok) { delivered += 1; await sql`UPDATE app.push_subscriptions SET failures = 0, last_success_at = now(), last_error = NULL WHERE id = ${d.id}`; continue; }
      lastError = `${r.status} ${r.error || ""}`.trim().slice(0, 200);
      if (r.gone) await sql`DELETE FROM app.push_subscriptions WHERE id = ${d.id}`;
      else { mayRecover = true; await sql`UPDATE app.push_subscriptions SET failures = failures + 1, last_error = ${lastError} WHERE id = ${d.id}`; }
    }
    const tries = n.attempts + 1;
    if (delivered) {
      await sql`UPDATE app.notifications_outbox SET status = 'sent', sent_at = now(), attempts = ${tries}, last_error = NULL,
                 provider_ref = ${`push:${delivered}/${devices.length}`} WHERE id = ${n.id}`;
      out.sent += 1;
    } else if (mayRecover && n.attempts < PUSH_RETRY_MINUTES.length) {
      await sql`UPDATE app.notifications_outbox SET attempts = ${tries}, last_error = ${lastError}, provider_ref = ${`push:retry:${tries}`},
                 send_after = now() + make_interval(mins => ${PUSH_RETRY_MINUTES[n.attempts]}) WHERE id = ${n.id}`;
      out.retrying += 1;
    } else {
      await sql`UPDATE app.notifications_outbox SET status = 'failed', sent_at = NULL, attempts = ${tries}, last_error = ${lastError},
                 provider_ref = ${`push:0/${devices.length}`} WHERE id = ${n.id}`;
      out.failed += 1;
    }
  }
  return out;
}

// ------------------------------------------------------------------ failed notifications (021), admin console
// Phone notifications that could not be delivered after every retry: coordinators reach the member another way (call,
// WhatsApp) and mark it handled. The list shows her first name and number (reading it is recorded in the audit log, as
// for call requests) and the message in English and in her language. ?count=1 returns only the open count (no numbers).
async function listFailedNotifications(ctx) {
  const { sql, keys, admin, url } = ctx;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM app.notifications_outbox WHERE channel = 'push' AND status = 'failed' AND handled_at IS NULL`;
  if (url.searchParams.get("count")) return json(200, { open_count: n });
  const handled = url.searchParams.get("status") === "handled";
  const rows = await sql`
    SELECT o.*, u.display_name, u.phone_e164_enc, u.status AS member_status, b.booking_ref, s.starts_at, a.name AS handled_by_name
      FROM app.notifications_outbox o JOIN app.users u ON u.id = o.user_id
      LEFT JOIN app.bookings b ON b.id = (CASE WHEN o.payload->>'booking_id' ~* '^[0-9a-f-]{36}$' THEN (o.payload->>'booking_id')::uuid END)
      LEFT JOIN app.event_sessions s ON s.id = COALESCE(b.session_id, CASE WHEN o.payload->>'session_id' ~* '^[0-9a-f-]{36}$' THEN (o.payload->>'session_id')::uuid END)
      LEFT JOIN app.admin_users a ON a.id = o.handled_by
     WHERE o.channel = 'push' AND o.status = 'failed' AND ${handled ? sql`o.handled_at IS NOT NULL` : sql`o.handled_at IS NULL`}
     ORDER BY ${handled ? sql`o.handled_at DESC` : sql`o.created_at`} LIMIT 100`;
  if (rows.length) await audit(sql, admin.id, "read_failed_notifications", "notifications_outbox", null, `${handled ? "handled" : "open"}_${rows.length}`, ctx.ipTrunc);
  return json(200, { open_count: n, notifications: rows.map((r) => ({ id: r.id, template_key: r.template_key, created_at: qa(r.created_at),
    attempts: r.attempts, last_error: r.last_error, last_try_at: qa(r.updated_at), name: r.display_name, member_status: r.member_status, locale: r.locale,
    phone: r.phone_e164_enc && r.phone_e164_enc.length ? decrypt(keys.dataKey, r.phone_e164_enc) : null,
    booking_ref: r.booking_ref, starts_at: qa(r.starts_at), text_en: notificationText(r, "en"), text: notificationText(r, r.locale),
    handled_at: qa(r.handled_at), handled_by: r.handled_by_name })) });
}

async function handleFailedNotification(ctx) {
  const { sql, params, admin } = ctx;
  requireUuid(params.id, "notification_id");
  const rows = await sql`UPDATE app.notifications_outbox SET handled_at = now(), handled_by = ${admin.id}
                          WHERE id = ${params.id} AND channel = 'push' AND status = 'failed' AND handled_at IS NULL RETURNING id`;
  if (!rows.length) fail(409, "CONFLICT");
  await audit(sql, admin.id, "notification_failure_handled", "notifications_outbox", params.id, null, ctx.ipTrunc);
  return json(200, { id: params.id, handled: true });
}

async function dispatch(ctx) {
  const given = ctx.req.headers.get("x-dispatch-token") || "";
  const [t] = await ctx.sql`SELECT token FROM app.push_dispatch_token WHERE id = 1`;
  if (!t || !given || !safeEqual(given, t.token)) fail(401, "UNAUTHENTICATED");
  // Coordinator alerts (019) ride on this every-minute call: an alert left unsent is paged, and one nobody acknowledged
  // in time is sent again. First, and on its own, so a member-push problem can never hold a safety alert back.
  const alerts = await coordinatorAlertsTick(ctx.sql, { getEnv: ctx.getEnv, cfg: ctx.cfg })
    .catch((e) => { console.error("coordinator alerts tick failed:", e && e.message); return { error: true }; });
  return json(200, { ...(await dispatchPush(ctx.sql, ctx.getEnv)), coordinator_alerts: alerts });
}

export const pushRoutes = [
  { method: "GET", path: "/api/v1/push/key", auth: "none", handler: publicKey },
  { method: "POST", path: "/api/v1/push/subscriptions", auth: "user_any", handler: subscribe },
  { method: "POST", path: "/api/v1/push/subscriptions:delete", auth: "user_any", handler: unsubscribe },
  { method: "POST", path: "/api/internal/push:dispatch", auth: "none", handler: dispatch },
  { method: "GET", path: "/api/admin/v1/notifications/failed", auth: "admin", roles: ["owner", "ops"], handler: listFailedNotifications },
  { method: "POST", path: "/api/admin/v1/notifications/{id}:handled", auth: "admin", roles: ["owner", "ops"], handler: handleFailedNotification },
];
