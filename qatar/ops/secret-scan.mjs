// Secret formats that must never appear in anything shipped to a browser or a phone: the website (qatar/web, every file
// Vercel publishes) and the Flutter app's source (qatar/app/lib). Key FORMATS only, so the scan depends on no particular
// value and can never leak one. Used by the build gate (ops/predeploy-gate.mjs); tested in api/test/secret-scan.test.mjs.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const SECRET_FORMS = [
  /sk_live_[0-9A-Za-z]{10,}/, /sk_test_[0-9A-Za-z]{10,}/,         // Stripe-style secret keys
  /\bsk-[A-Za-z0-9]{20,}/,                                       // OpenAI / Anthropic-style keys
  /AIza[0-9A-Za-z_-]{30,}/,                                       // Google API keys (Gemini, Maps)
  /sbp_[0-9a-f]{20,}/, /sb_secret_[0-9A-Za-z_-]{10,}/,           // Supabase access token, secret key
  /eyJhbGciOi[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\./,           // a signed JWT (Supabase service_role, any bearer token)
  /AKIA[0-9A-Z]{16}/,                                            // AWS access key id
  /ghp_[0-9A-Za-z]{30,}/, /github_pat_[0-9A-Za-z_]{20,}/,        // GitHub tokens
  /AC[0-9a-f]{32}:[0-9a-f]{32}/,                                  // Twilio account sid : auth token pair
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /SERVER_KEYS_KEK\s*[=:]/,
];

// Text files a browser or the app build could carry: scripts, pages, styles, data, source maps and Dart source.
export const TEXT_FILES = /\.(js|mjs|html|css|json|txt|map|dart)$/;

export function textFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : textFiles(p);
    return TEXT_FILES.test(e.name) ? [p] : [];
  });
}

export const hasSecretForm = (text) => SECRET_FORMS.some((re) => re.test(text));

/** Every file under the given directories that holds secret-like text, plus how many files were read. */
export function scanForSecrets(dirs) {
  const files = dirs.flatMap(textFiles);
  const hits = files.filter((f) => hasSecretForm(readFileSync(f, "utf8")));
  return { hits, scanned: files.length };
}
