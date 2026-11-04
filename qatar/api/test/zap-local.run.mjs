// Local OWASP ZAP API scan (NMX-31): starts a throwaway API + database, signs up one member, and runs zap-api-scan
// (docker) against it with her token, so the active scan never touches staging or production. Not part of npm test.
// Run: node test/zap-local.run.mjs <output-dir>
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildTemplate, client, signUp, startTestEnv } from "./helpers.mjs";

const out = path.resolve(process.argv[2] || ".");
buildTemplate();
const env = await startTestEnv();
try {
  const port = new URL(env.base).port;
  const u = await signUp(client(env.base), { name: "Zap" });
  const spec = JSON.parse(readFileSync(new URL("../openapi/openapi.json", import.meta.url)));
  spec.servers = [{ url: `http://localhost:${port}` }];
  writeFileSync(path.join(out, "openapi-local.json"), JSON.stringify(spec));
  const auth = ["description=auth", "enabled=true", "matchtype=REQ_HEADER", "matchstr=Authorization", "regex=false", `replacement=Bearer ${u.token}`]
    .map((kv) => `-config replacer.full_list(0).${kv}`).join(" ");
  const r = spawnSync("docker", ["run", "--rm", "--network", "host", "-v", `${out}:/zap/wrk:rw`, "ghcr.io/zaproxy/zaproxy:stable",
    "zap-api-scan.py", "-t", "/zap/wrk/openapi-local.json", "-f", "openapi", "-r", "api-local.html", "-J", "api-local.json", "-T", "12", "-z", auth],
    { stdio: "inherit" });
  console.log("zap exit", r.status);
} finally { await env.stop(); }
