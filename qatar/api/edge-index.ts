// Supabase Edge Function entry (Deno). Deployed as function "api": requests to
// https://<ref>.supabase.co/functions/v1/api/v1/... reach the same router as the Node runner.
// SUPABASE_DB_URL is injected by Supabase; the database password never leaves the platform.
import postgres from "npm:postgres@3.4.5";
import { createApp } from "./src/app.js";

// Connections: each running copy of the function keeps at most 3 and closes them after 10 s idle, so copies that are no
// longer busy give their connections back instead of holding them until they shut down (a load test left 23 idle and
// filled the database's 60 slots, NMX-31). DB_POOLER_URL, when set as a function secret, routes through Supavisor
// (transaction mode, port 6543) for higher load; prepare:false already suits it.
const dbUrl = Deno.env.get("DB_POOLER_URL") || Deno.env.get("SUPABASE_DB_URL")!;
const sql = postgres(dbUrl, { prepare: false, max: 3, idle_timeout: 10, max_lifetime: 60 * 10, connect_timeout: 10, onnotice: () => {} });
const app = createApp({ sql, getEnv: (k: string) => Deno.env.get(k) ?? undefined });

Deno.serve((req: Request) => app.handle(req));
