// Local runner: serves the API (/api/...) plus the static user web app (/) and admin panel (/admin/).
// Usage: DATABASE_URL=postgres://... PORT=8787 node server.mjs
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { createApp } from "./src/app.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../web");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

export function startServer({ databaseUrl = process.env.DATABASE_URL, port = Number(process.env.PORT || 8787), env = process.env } = {}) {
  const sql = postgres(databaseUrl, { max: 5, onnotice: () => {} });
  const app = createApp({ sql, getEnv: (k) => env[k] });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        if (!headers.has("x-forwarded-for")) headers.set("x-forwarded-for", req.socket.remoteAddress?.replace("::ffff:", "") || "127.0.0.1");
        const r = await app.handle(new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }));
        res.writeHead(r.status, Object.fromEntries(r.headers));
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      let file;
      if (url.pathname.startsWith("/checkout/mock/")) file = path.join(WEB, "checkout-mock.html");
      else if (url.pathname === "/admin" || url.pathname === "/admin/") file = path.join(WEB, "admin", "index.html");
      else if (url.pathname === "/" ) file = path.join(WEB, "index.html");
      else file = path.join(WEB, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
      if (!file.startsWith(WEB)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    } catch (e) {
      if (e && e.code === "ENOENT") { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
      console.error(e);
      res.writeHead(500); res.end("error");
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, sql, app, port: server.address().port })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { port } = await startServer();
  console.log(`API + web on http://localhost:${port}`);
}
