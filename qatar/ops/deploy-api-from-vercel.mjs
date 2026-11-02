// Deploys the HerZone API (Supabase Edge Function "api") during the Vercel production build, so the site and the API
// go live together. Runs as part of the web build command (qatar/web/vercel.json). Preview builds skip it.
// Needs the Vercel environment variable SUPABASE_ACCESS_TOKEN (Production only); the token is only passed to the
// Supabase CLI. The function is staged in a temporary directory, never inside the web output directory.
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Staging (qatar-mvp) unless the Vercel project sets SUPABASE_PROJECT_REF (herzone-production: pwxxulqgdydrkowmtkia).
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "fvodcnqmxskgzziwuwmz";
if (!/^[a-z]{20}$/.test(PROJECT_REF)) { console.error(`[deploy-api] SUPABASE_PROJECT_REF is not a project ref: ${PROJECT_REF}`); process.exit(1); }
const CLI = "supabase@2.120.0";
const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../api");

if (process.env.VERCEL_ENV !== "production") {
  console.log(`[deploy-api] skipped: VERCEL_ENV=${process.env.VERCEL_ENV || "unset"} (only production builds deploy the API)`);
  process.exit(0);
}
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("[deploy-api] SUPABASE_ACCESS_TOKEN is not set for Production; the site would go live without its API. Stopping.");
  process.exit(1);
}

const root = mkdtempSync(path.join(os.tmpdir(), "herzone-api-"));
const fn = path.join(root, "supabase", "functions", "api");
mkdirSync(fn, { recursive: true });
writeFileSync(path.join(root, "supabase", "config.toml"), 'project_id = "herzone"\n');
cpSync(path.join(api, "edge-index.ts"), path.join(fn, "index.ts"));
cpSync(path.join(api, "src"), path.join(fn, "src"), { recursive: true });

console.log(`[deploy-api] deploying function "api" to ${PROJECT_REF}`);
execFileSync("npx", ["--yes", CLI, "functions", "deploy", "api", "--project-ref", PROJECT_REF, "--no-verify-jwt", "--use-api", "--workdir", root],
  { stdio: "inherit", env: process.env });
console.log("[deploy-api] done");
