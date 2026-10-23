// Supabase Edge Function entry (Deno). Deployed as function "api": requests to
// https://<ref>.supabase.co/functions/v1/api/v1/... reach the same router as the Node runner.
// SUPABASE_DB_URL is injected by Supabase; the database password never leaves the platform.
import postgres from "npm:postgres@3.4.5";
import { createApp } from "./src/app.js";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3, onnotice: () => {} });
const app = createApp({ sql, getEnv: (k: string) => Deno.env.get(k) ?? undefined });

Deno.serve((req: Request) => app.handle(req));
