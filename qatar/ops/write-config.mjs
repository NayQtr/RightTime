// Picks the site's config for this Vercel project: HERZONE_ENV=production uses web/config.production.js (production
// API on herzone-production); anything else uses web/config.vercel.js (staging API). Runs in the web build.
import { appendFileSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
const env = process.env.HERZONE_ENV === "production" ? "production" : "staging";
copyFileSync(path.join(web, env === "production" ? "config.production.js" : "config.vercel.js"), path.join(web, "config.js"));
// The page preconnects to the API host of this environment (index.html carries the staging host)
if (env === "production") {
  const index = path.join(web, "index.html");
  writeFileSync(index, readFileSync(index, "utf8").replace("https://fvodcnqmxskgzziwuwmz.supabase.co", "https://pwxxulqgdydrkowmtkia.supabase.co"));
}
// Sentry release (NMX-62): the commit being built, so crash-free sessions are measured per release
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12);
if (/^[0-9a-f]{7,12}$/.test(sha)) appendFileSync(path.join(web, "config.js"), `window.QATAR_CONFIG.release = "herzone-web@${sha}";\n`);
console.log(`[config] ${env}${sha ? ` release herzone-web@${sha}` : ""}`);
