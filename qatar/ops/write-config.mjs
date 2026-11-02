// Picks the site's config for this Vercel project: HERZONE_ENV=production uses web/config.production.js (production
// API on herzone-production); anything else uses web/config.vercel.js (staging API). Runs in the web build.
import { copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
const env = process.env.HERZONE_ENV === "production" ? "production" : "staging";
copyFileSync(path.join(web, env === "production" ? "config.production.js" : "config.vercel.js"), path.join(web, "config.js"));
console.log(`[config] ${env}`);
