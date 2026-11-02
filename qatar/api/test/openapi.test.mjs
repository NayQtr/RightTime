// The OpenAPI description (openapi/spec.mjs) matches the server: every member route is described with its method and
// auth, nothing described is missing from the server, every $ref resolves, and openapi.json is up to date.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { userRoutes } from "../src/routes/user.js";
import { pushRoutes } from "../src/routes/push.js";
import { spec } from "../openapi/spec.mjs";

const NOT_FOR_APPS = new Set(["/api/internal/push:dispatch"]);
const served = [...userRoutes, ...pushRoutes].filter((r) => !NOT_FOR_APPS.has(r.path));

test("every member route is described, and every described route exists", () => {
  const described = Object.entries(spec.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`));
  const server = served.map((r) => `${r.method} ${r.path}`);
  assert.deepEqual([...server].sort(), [...described].sort());
});

test("auth matches: signed-in routes need the bearer token, public ones do not; writes declare Idempotency-Key", () => {
  for (const r of served) {
    const op = spec.paths[r.path][r.method.toLowerCase()];
    assert.equal(op.security.length > 0, r.auth !== "none", `${r.method} ${r.path} security`);
    const idem = (op.parameters || []).some((p) => p.$ref === "#/components/parameters/IdempotencyKey");
    assert.equal(idem, Boolean(r.idem), `${r.method} ${r.path} Idempotency-Key`);
  }
});

test("every $ref resolves and openapi.json is rebuilt", () => {
  const text = JSON.stringify(spec);
  for (const [, ref] of text.matchAll(/"\$ref":"#\/([^"]+)"/g)) {
    const target = ref.split("/").reduce((o, k) => (o ? o[k] : undefined), spec);
    assert.ok(target, `unresolved $ref #/${ref}`);
  }
  const built = JSON.parse(readFileSync(new URL("../openapi/openapi.json", import.meta.url), "utf8"));
  assert.deepEqual(built, JSON.parse(text), "run: node openapi/build.mjs");
});
