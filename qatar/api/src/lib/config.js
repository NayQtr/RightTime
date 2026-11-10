// Runtime configuration: app.app_config rows, overridable by environment variables of the same name.
let cache = null;
let loadedAt = 0;
const TTL_MS = 30_000;

export async function loadConfig(sql, getEnv) {
  if (cache && Date.now() - loadedAt < TTL_MS) return cache;
  const rows = await sql`SELECT key, value FROM app.app_config`;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const get = (k, d) => getEnv(k) ?? map[k] ?? d;
  cache = {
    otpDevMode: get("OTP_DEV_MODE", "false") === "true",
    mockPspEnabled: get("MOCK_PSP_ENABLED", "false") === "true",
    webBaseUrl: get("WEB_BASE_URL", "http://localhost:8787").replace(/\/$/, ""),
    corsOrigins: get("CORS_ORIGINS", "*").split(",").map((s) => s.trim()),
    seatHoldMinutes: Number(get("SEAT_HOLD_MINUTES", "10")),
    rebookChoiceHours: Number(get("REBOOK_CHOICE_HOURS", "48")),
    feedbackWindowDays: Number(get("FEEDBACK_WINDOW_DAYS", "7")),
    accessTtl: Number(get("ACCESS_TOKEN_TTL_SECONDS", "900")),
    refreshTtlDays: Number(get("REFRESH_TOKEN_TTL_DAYS", "30")),
    adminTtl: Number(get("ADMIN_TOKEN_TTL_SECONDS", "3600")),
    packingMode: get("PACKING_MODE", "min_leftovers"),
    adminMaxFailsPerEmail: Number(get("ADMIN_LOGIN_MAX_FAILS_PER_EMAIL", "5")),
    adminMaxFailsPerIp: Number(get("ADMIN_LOGIN_MAX_FAILS_PER_IP", "20")),
    adminLoginWindowMinutes: Number(get("ADMIN_LOGIN_WINDOW_MINUTES", "15")),
    coordinatorPhone: get("COORDINATOR_PHONE_E164", "").trim(),
    coordinatorWhatsapp: get("COORDINATOR_WHATSAPP", "false") === "true",
    sentryDsn: get("SENTRY_DSN", "").trim(),
    sentryEnvironment: get("SENTRY_ENVIRONMENT", "staging"),
    // Forced update (NMX-61): mobile apps older than this are told to update. Empty = no minimum.
    minAppVersion: get("MIN_APP_VERSION", "").trim(),
    // Card name vs registered name (015). Off until migration 015 has run, which sets it to true.
    cardNameCheck: get("CARD_NAME_CHECK", "false") === "true",
    // Gemini second opinion on a mismatch (lib/ai.js); the key itself is read from GEMINI_API_KEY, never kept here.
    geminiModel: get("GEMINI_MODEL", "gemini-flash-lite-latest"),
    geminiBaseUrl: get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com").replace(/\/$/, ""),
    appStoreUrl: get("APP_STORE_URL", "").trim(),
    playStoreUrl: get("PLAY_STORE_URL", "https://play.google.com/store/apps/details?id=app.herzone").trim(),
    otpTtl: 300, otpResendAfter: 45, otpMaxAttempts: 5,
    // Provisional choices of 10 Nov (items 37, 38, 14c, 40); migration 019 lists them in app_config too. Provider keys,
    // the reviewer's number and code, and the coordinators' numbers are secrets read only from the environment
    // (lib/sms.js, lib/email.js, routes/user.js, services/coordinator_alerts.js), never from here.
    smsProvider: get("SMS_PROVIDER", "").trim().toLowerCase(),          // "twilio"; empty = no SMS
    emailProvider: get("EMAIL_PROVIDER", "").trim().toLowerCase(),      // "resend"; empty = no email
    phoneCountryCodes: countryCodes(get("PHONE_ALLOWED_COUNTRY_CODES", "974")),
    otpCountryHourlyCap: whole(get("OTP_COUNTRY_HOURLY_CAP", "20"), 20, 0, 10000),
    coordinatorEscalateMinutes: whole(get("COORDINATOR_ESCALATE_MINUTES", "5"), 5, 1, 1440),
    // Provisional (10 Nov, item 32): a celebration (birthday or another occasion) can be booked only this many hours or
    // more before the session starts, so the coordinator can prepare. 0 = no minimum. The site and the app read it from
    // GET /api/v1/sessions (occasion_allowed, occasion_notice_hours).
    celebrationNoticeHours: whole(get("CELEBRATION_NOTICE_HOURS", "72"), 72, 0, 720),
  };
  loadedAt = Date.now();
  return cache;
}

export function resetConfigCache() { cache = null; }

// A whole number within [min, max]; anything else (empty, text, out of range) is the default, so a typo can never switch
// a limit off.
function whole(v, d, min, max) {
  const n = Number(String(v).trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : d;
}

// "974, 966,44" -> ["974", "966", "44"]. Calling codes are 1 to 3 digits; anything else is ignored, and an empty result
// falls back to Qatar only.
export function countryCodes(v) {
  const codes = [...new Set(String(v || "").split(",").map((s) => s.trim().replace(/^\+/, "")).filter((s) => /^[1-9][0-9]{0,2}$/.test(s)))];
  return codes.length ? codes : ["974"];
}
