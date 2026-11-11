// Coordinator alerts (plan T13, item 40; spec v0.3 §4.4.2: "Page the on-call coordinator (push + SMS)"). Provisional
// decision of 10 Nov, option (c), both channels:
//  - Raised for every S1 or S2 report made "during the meetup", and for every "I am in danger now" (whatever the timing).
//  - Sent at once to every coordinator device with alerts turned on in the admin console (Web Push), and, when an SMS
//    provider is set up (lib/sms.js), by SMS to the numbers in the Edge Function secret COORDINATOR_ALERT_PHONES
//    (comma-separated E.164; entered by the owner in Supabase, never in the repository or the database).
//  - A coordinator acknowledges it in the admin console (who and when are recorded). If nobody does within
//    COORDINATOR_ESCALATE_MINUTES (config.js, default 5), it is sent again to everyone, once, and marked escalated. That
//    check runs every minute with the push dispatcher (pg_cron, 013) and whenever the admin console reads its alerts.
// Nothing about the report itself leaves the server: the texts say the kind, the severity and the case reference only.
import { sendSms, smsSettings } from "../lib/sms.js";
import { audit } from "./common.js";
import { sendPush, vapidKeys } from "./webpush.js";

// Who is a coordinator: the roles that run the night (the "Tonight" board). Provisional; change here.
export const COORDINATOR_ROLES = ["owner", "ops"];
const MAX_PHONES = 10;
const PUSH_TIMEOUT_MS = 8000;
const SUBJECT = "https://herzone.app";
export const ALERT_PATH = "/admin/#/alerts";

/** Which reports page a coordinator: "immediate_danger", "report_during", or null. */
export function alertKind({ danger, severity, timing }) {
  if (danger) return "immediate_danger";
  return severity <= 2 && timing === "during" ? "report_during" : null;
}

/** The coordinators' numbers from COORDINATOR_ALERT_PHONES: valid E.164 only, no repeats, at most 10. */
export function alertPhones(getEnv) {
  const raw = String((getEnv && getEnv("COORDINATOR_ALERT_PHONES")) || "");
  const valid = raw.split(",").map((s) => s.replace(/[\s\-().]/g, "")).filter((s) => /^\+[1-9][0-9]{6,14}$/.test(s));
  return [...new Set(valid)].slice(0, MAX_PHONES);
}

// English: coordinators read the admin console in English. Provisional wording (10 Nov).
const what = (a) => (a.kind === "immediate_danger" ? `immediate danger reported at a meetup (S1, ${a.case_ref})`
  : `S${a.severity} safety report during a meetup (${a.case_ref})`);
export function alertText(a, round, minutes) {
  const s = what(a);
  return round === "escalation" ? `Not acknowledged after ${minutes} min: ${s}. Open the admin console and acknowledge.`
    : `${s[0].toUpperCase()}${s.slice(1)}. Open the admin console and acknowledge.`;
}
export const PUSH_TITLE = "HerZone safety alert";
export const smsText = (text, webBaseUrl) => `HerZone alert: ${text} ${webBaseUrl}${ALERT_PATH}`;

/** Inside the report's transaction: the alert row. Sending happens after the commit (pageCoordinators). */
export async function raiseAlert(tx, report, kind) {
  const [a] = await tx`INSERT INTO app.coordinator_alerts (report_id, kind, severity) VALUES (${report.id}, ${kind}, ${report.severity})
                       ON CONFLICT (report_id) DO NOTHING RETURNING id`;
  return a ? a.id : null;
}

// Sends one round (first page or escalation) to every coordinator device and number, records the counts on the alert
// and in the audit log ("push_1/2_sms_1/1"; "sms_off" when no SMS provider is set up).
async function deliver(sql, id, round, { getEnv, cfg, fetchImpl = fetch }) {
  const [a] = await sql`SELECT a.id, a.kind, a.severity, a.report_id, r.case_ref FROM app.coordinator_alerts a
                          JOIN app.safety_reports r ON r.id = a.report_id WHERE a.id = ${id}`;
  if (!a) return null;
  const text = alertText(a, round, cfg.coordinatorEscalateMinutes);

  const devices = await sql`
    SELECT s.* FROM app.admin_push_subscriptions s JOIN app.admin_users u ON u.id = s.admin_id
     WHERE u.status = 'active' AND u.role::text IN ${sql(COORDINATOR_ROLES)}`;
  const sms = smsSettings(getEnv, cfg.smsProvider);
  const phones = sms ? alertPhones(getEnv) : [];
  // push and SMS go out side by side: a slow push service never holds back the SMS
  const pushAll = async () => {
    if (!devices.length) return 0;
    let ok = 0;
    const vapid = await vapidKeys(sql, getEnv);
    const message = { title: PUSH_TITLE, body: text, tag: `alert-${a.id}`, lang: "en", dir: "ltr", url: ALERT_PATH, urgent: true };
    const timed = (url, init) => fetchImpl(url, { ...init, signal: AbortSignal.timeout(PUSH_TIMEOUT_MS) });
    const results = await Promise.all(devices.map((d) => sendPush(d, message, vapid, { subject: SUBJECT, ttl: 3600, urgency: "high", fetchImpl: timed })));
    for (const [i, r] of results.entries()) {
      const d = devices[i];
      if (r.ok) { ok += 1; await sql`UPDATE app.admin_push_subscriptions SET failures = 0, last_success_at = now(), last_error = NULL WHERE id = ${d.id}`; }
      else if (r.gone) await sql`DELETE FROM app.admin_push_subscriptions WHERE id = ${d.id}`;
      else await sql`UPDATE app.admin_push_subscriptions SET failures = failures + 1, last_error = ${`${r.status} ${r.error || ""}`.trim().slice(0, 200)} WHERE id = ${d.id}`;
    }
    return ok;
  };
  const smsAll = async () => {
    if (!phones.length) return 0;
    const body = smsText(text, cfg.webBaseUrl);
    return (await Promise.all(phones.map((to) => sendSms({ to, body }, sms, { fetchImpl })))).filter((r) => r.ok).length;
  };
  const [pushOk, smsOk] = await Promise.all([pushAll(), smsAll()]);

  if (round === "first") {
    await sql`UPDATE app.coordinator_alerts SET push_devices = ${devices.length}, push_delivered = ${pushOk},
                     sms_numbers = ${phones.length}, sms_delivered = ${smsOk} WHERE id = ${a.id}`;
  } else {
    await sql`UPDATE app.coordinator_alerts SET escalation_push_delivered = ${pushOk}, escalation_sms_delivered = ${smsOk} WHERE id = ${a.id}`;
  }
  const sent = `push_${pushOk}/${devices.length}_sms_${sms ? `${smsOk}/${phones.length}` : "off"}`;
  await audit(sql, null, round === "first" ? "coordinator_paged" : "coordinator_alert_escalated", "safety_reports", a.report_id, sent);
  return { push: { delivered: pushOk, devices: devices.length }, sms: sms ? { delivered: smsOk, numbers: phones.length } : null };
}

/** Right after the report is saved: the first page. Never throws (the report is already saved and must answer 201). */
export async function pageCoordinators(sql, alertId, opts) {
  try {
    const [a] = await sql`UPDATE app.coordinator_alerts SET paged_at = now() WHERE id = ${alertId} AND paged_at IS NULL RETURNING id`;
    return a ? await deliver(sql, a.id, "first", opts) : null;
  } catch (e) {
    console.error("coordinator alert: paging failed:", e && e.message);
    return null;
  }
}

// The report answers within this, whatever the push services and the SMS provider do (the app gives up after 15 s). A
// page still going on carries on after the answer (kept alive on Supabase Edge); the every-minute run below is the
// backstop for an alert whose page never started.
export const PAGE_WAIT_MS = 5000;
/** After the report is saved: starts the first page and waits for it at most PAGE_WAIT_MS. Never throws. */
export async function pageWithin(sql, alertId, opts, ms = PAGE_WAIT_MS) {
  const paging = pageCoordinators(sql, alertId, opts);
  globalThis.EdgeRuntime?.waitUntil?.(paging);
  let timer;
  await Promise.race([paging, new Promise((r) => { timer = setTimeout(r, ms); })]);
  clearTimeout(timer);
}

/**
 * Every minute (push dispatcher) and when the admin console reads its alerts: pages any alert whose request stopped
 * before sending, then escalates, once, every alert nobody acknowledged within the configured minutes. Each alert is
 * claimed by one UPDATE first, so two runs never send the same round twice.
 */
export async function coordinatorAlertsTick(sql, opts) {
  const out = { paged: 0, escalated: 0 };
  const lost = await sql`UPDATE app.coordinator_alerts SET paged_at = now()
                          WHERE paged_at IS NULL AND created_at < now() - interval '1 minute' RETURNING id`;
  for (const a of lost) {
    await deliver(sql, a.id, "first", opts).catch((e) => console.error("coordinator alert: paging failed:", e && e.message));
    out.paged += 1;
  }
  const due = await sql`UPDATE app.coordinator_alerts SET escalated_at = now()
                         WHERE acknowledged_at IS NULL AND escalated_at IS NULL
                           AND paged_at <= now() - make_interval(mins => ${opts.cfg.coordinatorEscalateMinutes}) RETURNING id`;
  for (const a of due) {
    await deliver(sql, a.id, "escalation", opts).catch((e) => console.error("coordinator alert: escalation failed:", e && e.message));
    out.escalated += 1;
  }
  return out;
}
