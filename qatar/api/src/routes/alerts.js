// Coordinator alerts in the admin console (plan T13, item 40, migration 019; services/coordinator_alerts.js): the open
// alerts with an Acknowledge button that records who and when, and turning alerts on or off for this browser (Web Push,
// the same VAPID key and service worker as members' phone notifications). Owner and ops only.
import { fail, json, qa, requireUuid } from "../lib/http.js";
import { smsSettings } from "../lib/sms.js";
import { audit } from "../services/common.js";
import { alertPhones, COORDINATOR_ROLES, coordinatorAlertsTick } from "../services/coordinator_alerts.js";
import { b64uKey, validEndpoint } from "./push.js";

const A = "/api/admin/v1";
const MAX_DEVICES = 10;

const view = (r) => ({ id: r.id, case_ref: r.case_ref, kind: r.kind, severity: r.severity, created_at: qa(r.created_at),
  venue: r.venue || null, table_code: r.table_code || null, starts_at: qa(r.starts_at),
  paged_at: qa(r.paged_at), push: { delivered: r.push_delivered, devices: r.push_devices }, sms: { delivered: r.sms_delivered, numbers: r.sms_numbers },
  escalated_at: qa(r.escalated_at), escalation: r.escalated_at ? { push_delivered: r.escalation_push_delivered, sms_delivered: r.escalation_sms_delivered } : null,
  acknowledged_at: qa(r.acknowledged_at), acknowledged_by: r.acknowledged_by_name || null });

// ?status=open (default): not yet acknowledged, oldest first. ?status=all: the latest 100, open ones first.
// Reading the list also runs the escalation check, so alerts are sent again in time even where pg_cron is not set up.
async function listAlerts(ctx) {
  const { sql, url, getEnv, cfg } = ctx;
  await coordinatorAlertsTick(sql, { getEnv, cfg }).catch((e) => console.error("coordinator alerts tick failed:", e && e.message));
  const open = url.searchParams.get("status") !== "all";
  const rows = await sql`
    SELECT a.*, r.case_ref, t.table_code, v.name AS venue, s.starts_at, ad.name AS acknowledged_by_name
      FROM app.coordinator_alerts a JOIN app.safety_reports r ON r.id = a.report_id
      LEFT JOIN app.event_tables t ON t.id = r.table_id LEFT JOIN app.venues v ON v.id = t.venue_id
      LEFT JOIN app.bookings b ON b.id = r.booking_id LEFT JOIN app.event_sessions s ON s.id = b.session_id
      LEFT JOIN app.admin_users ad ON ad.id = a.acknowledged_by
     WHERE ${open ? sql`a.acknowledged_at IS NULL` : sql`true`}
     ORDER BY ${open ? sql`a.created_at` : sql`(a.acknowledged_at IS NULL) DESC, a.created_at DESC`} LIMIT 100`;
  const [{ devices }] = await sql`SELECT count(*)::int AS devices FROM app.admin_push_subscriptions s JOIN app.admin_users u ON u.id = s.admin_id
                                    WHERE u.status = 'active' AND u.role::text IN ${sql(COORDINATOR_ROLES)}`;
  const sms = Boolean(smsSettings(getEnv, cfg.smsProvider));
  return json(200, { alerts: rows.map(view), escalate_after_minutes: cfg.coordinatorEscalateMinutes,
    channels: { push_devices: devices, sms, sms_numbers: sms ? alertPhones(getEnv).length : 0 } });
}

async function acknowledge(ctx) {
  const { sql, params, admin } = ctx;
  requireUuid(params.id, "alert_id");
  const [a] = await sql`UPDATE app.coordinator_alerts SET acknowledged_by = ${admin.id}, acknowledged_at = now()
                         WHERE id = ${params.id} AND acknowledged_at IS NULL RETURNING id, report_id, acknowledged_at`;
  if (!a) {
    const [was] = await sql`SELECT 1 FROM app.coordinator_alerts WHERE id = ${params.id}`;
    fail(was ? 409 : 404, was ? "CONFLICT" : "NOT_FOUND", was ? [{ reason: "already_acknowledged" }] : null);
  }
  await audit(sql, admin.id, "coordinator_alert_acknowledged", "safety_reports", a.report_id, null, ctx.ipTrunc);
  return json(200, { id: a.id, acknowledged_at: qa(a.acknowledged_at), acknowledged_by: admin.name });
}

// This coordinator's own devices with alerts on (the page compares them with this browser's subscription).
async function myDevices(ctx) {
  const rows = await ctx.sql`SELECT endpoint, created_at, last_success_at, failures FROM app.admin_push_subscriptions
                              WHERE admin_id = ${ctx.admin.id} ORDER BY created_at DESC`;
  return json(200, { devices: rows.map((r) => ({ endpoint: r.endpoint, created_at: qa(r.created_at), last_success_at: qa(r.last_success_at), failures: r.failures })) });
}

async function subscribe(ctx) {
  const { sql, body, admin } = ctx;
  const keys = body.keys || {};
  if (!validEndpoint(body.endpoint) || !b64uKey(keys.p256dh, 80, 100) || !b64uKey(keys.auth, 16, 32))
    fail(422, "VALIDATION_FAILED", [{ field: "subscription", code: "INVALID" }]);
  await sql.begin(async (tx) => {
    // one row per browser; a browser where another coordinator turns alerts on moves to her
    await tx`INSERT INTO app.admin_push_subscriptions (admin_id, endpoint, p256dh, auth)
             VALUES (${admin.id}, ${body.endpoint}, ${keys.p256dh}, ${keys.auth})
             ON CONFLICT (endpoint) DO UPDATE SET admin_id = EXCLUDED.admin_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
               created_at = now(), failures = 0, last_error = NULL`;
    await tx`DELETE FROM app.admin_push_subscriptions WHERE admin_id = ${admin.id} AND id NOT IN (
               SELECT id FROM app.admin_push_subscriptions WHERE admin_id = ${admin.id} ORDER BY created_at DESC LIMIT ${MAX_DEVICES})`;
  });
  await audit(sql, admin.id, "coordinator_alerts_device_on", "admin_users", admin.id, null, ctx.ipTrunc);
  return json(201, { subscribed: true });
}

async function unsubscribe(ctx) {
  const { sql, body, admin } = ctx;
  const gone = await sql`DELETE FROM app.admin_push_subscriptions WHERE admin_id = ${admin.id} AND endpoint = ${String(body.endpoint || "")} RETURNING id`;
  if (gone.length) await audit(sql, admin.id, "coordinator_alerts_device_off", "admin_users", admin.id, null, ctx.ipTrunc);
  return json(200, { subscribed: false });
}

export const alertRoutes = [
  { method: "GET", path: `${A}/coordinator-alerts`, auth: "admin", roles: COORDINATOR_ROLES, handler: listAlerts },
  { method: "POST", path: `${A}/coordinator-alerts/{id}:acknowledge`, auth: "admin", roles: COORDINATOR_ROLES, handler: acknowledge },
  { method: "GET", path: `${A}/push/subscriptions`, auth: "admin", roles: COORDINATOR_ROLES, handler: myDevices },
  { method: "POST", path: `${A}/push/subscriptions`, auth: "admin", roles: COORDINATOR_ROLES, handler: subscribe },
  { method: "POST", path: `${A}/push/subscriptions:delete`, auth: "admin", roles: COORDINATOR_ROLES, handler: unsubscribe },
];
