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
    otpTtl: 300, otpResendAfter: 45, otpMaxAttempts: 5,
  };
  loadedAt = Date.now();
  return cache;
}

export function resetConfigCache() { cache = null; }
