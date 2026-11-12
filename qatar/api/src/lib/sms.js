// SMS through a provider (item 37, provisional decision of 10 Nov: Twilio Programmable Messaging, plan option a). It
// reaches Qatar and other countries if the allowed list widens (item 38), and offers a WhatsApp channel later.
// Used for members' sign-in codes (routes/user.js) and coordinator alerts (services/coordinator_alerts.js).
//
// Settings: SMS_PROVIDER ("twilio"; empty = none, config.js) and these Edge Function secrets, entered by the owner in
// Supabase, never in the repository or the database:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM (a sender
//   number or an approved alphanumeric sender name).
// TWILIO_BASE_URL only points the tests at a fake server; it must be https unless it is this machine.
// Plain fetch, so it runs on Node (tests) and Supabase Edge (Deno). Nothing here logs a message text or a full number.
import { isE164 } from "./validate.js";

const TWILIO = "https://api.twilio.com";

// A provider base URL: https, or plain http only to this machine (tests). Anything else is refused (TLS stays on).
export function safeBase(url, fallback) {
  const s = String(url || fallback).replace(/\/+$/, "");
  try {
    const u = new URL(s);
    if (u.protocol === "https:" || (u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))) return s;
  } catch { /* not a URL */ }
  return null;
}

/** The provider's settings, or null when SMS is not set up (no provider chosen, or a secret missing). */
export function smsSettings(getEnv, provider) {
  const env = (k) => String((getEnv && getEnv(k)) || "").trim();
  if (provider !== "twilio") return null;
  const accountSid = env("TWILIO_ACCOUNT_SID"), authToken = env("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = env("TWILIO_MESSAGING_SERVICE_SID"), from = env("TWILIO_FROM");
  const baseUrl = safeBase(env("TWILIO_BASE_URL"), TWILIO);
  if (!/^AC[0-9a-zA-Z]{32}$/.test(accountSid) || !authToken || !(messagingServiceSid || from) || !baseUrl) return null;
  return { provider, accountSid, authToken, messagingServiceSid, from, baseUrl };
}

// "+97455501234" -> "+974…34": enough to tell numbers apart in a log line, never the whole number.
export const maskPhone = (p) => (typeof p === "string" && p.length > 6 ? `${p.slice(0, 4)}…${p.slice(-2)}` : "…");

/**
 * Sends one SMS. Returns { ok, status, id? , error? }; never throws. `error` is the provider's numeric code or a short
 * reason, never its message (which can repeat the number).
 */
export async function sendSms({ to, body }, settings, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (!settings) return { ok: false, status: 0, error: "not_configured" };
  if (!isE164(to) || !body) return { ok: false, status: 0, error: "invalid" };
  const form = new URLSearchParams({ To: to, Body: body });
  if (settings.messagingServiceSid) form.set("MessagingServiceSid", settings.messagingServiceSid);
  else form.set("From", settings.from);
  try {
    const res = await fetchImpl(`${settings.baseUrl}/2010-04-01/Accounts/${settings.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${settings.accountSid}:${settings.authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status >= 200 && res.status < 300 && data && data.status !== "failed") return { ok: true, status: res.status, id: data.sid || null };
    const code = data && Number.isInteger(data.code) ? String(data.code) : "http";
    console.error(`sms: ${settings.provider} refused a message to ${maskPhone(to)}: ${res.status} ${code}`);
    return { ok: false, status: res.status, error: code };
  } catch (e) {
    const reason = e && e.name === "TimeoutError" ? "timeout" : "network";
    console.error(`sms: ${settings.provider} unreachable for ${maskPhone(to)}: ${reason}`);
    return { ok: false, status: 0, error: reason };
  }
}
