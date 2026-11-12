// Email through a provider (item 14c, provisional decision of 10 Nov: Resend's HTTP API). Used for the venue portal's
// sign-in code (routes/venue.js). Without a provider, production answers 503 and the venue page says codes cannot be
// sent; the code is never shown on screen there (only staging's OTP_DEV_MODE shows it, and only with no provider).
//
// Settings: EMAIL_PROVIDER ("resend"; empty = none, config.js) and these Edge Function secrets, entered by the owner in
// Supabase, never in the repository or the database:
//   RESEND_API_KEY, and EMAIL_FROM (a sender on a domain verified in Resend, e.g. "HerZone <venues@herzone.app>").
// RESEND_BASE_URL only points the tests at a fake server; it must be https unless it is this machine.
// Plain fetch, so it runs on Node (tests) and Supabase Edge (Deno). Nothing here logs an address or a message text.
import { safeBase } from "./sms.js";
import { isEmail } from "./validate.js";

const RESEND = "https://api.resend.com";

/** The provider's settings, or null when email is not set up (no provider chosen, or a secret missing). */
export function emailSettings(getEnv, provider) {
  const env = (k) => String((getEnv && getEnv(k)) || "").trim();
  if (provider !== "resend") return null;
  const apiKey = env("RESEND_API_KEY"), from = env("EMAIL_FROM");
  const baseUrl = safeBase(env("RESEND_BASE_URL"), RESEND);
  if (!apiKey || !/@[^@\s]+\.[^@\s>]+>?$/.test(from) || !baseUrl) return null;
  return { provider, apiKey, from, baseUrl };
}

/** Sends one plain-text email. Returns { ok, status, id?, error? }; never throws. */
export async function sendEmail({ to, subject, text }, settings, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (!settings) return { ok: false, status: 0, error: "not_configured" };
  if (!isEmail(to) || !subject || !text) return { ok: false, status: 0, error: "invalid" };
  try {
    const res = await fetchImpl(`${settings.baseUrl}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: settings.from, to: [to], subject, text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, id: (data && data.id) || null };
    console.error(`email: ${settings.provider} refused a message: ${res.status}`);
    return { ok: false, status: res.status, error: "http" };
  } catch (e) {
    const reason = e && e.name === "TimeoutError" ? "timeout" : "network";
    console.error(`email: ${settings.provider} unreachable: ${reason}`);
    return { ok: false, status: 0, error: reason };
  }
}
