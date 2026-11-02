// Real responses match the OpenAPI description (openapi/spec.mjs): a member signs up, books and pays, and each answer is
// checked against the documented schema (required keys, types, enums, nullability), so the description a mobile app is
// generated from cannot drift from what the server returns.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplate, checkoutUrlFor, client, payViaMock, signUp, startTestEnv } from "./helpers.mjs";
import { spec } from "../openapi/spec.mjs";

let env, call, sql;
before(async () => { buildTemplate(); env = await startTestEnv(); call = client(env.base); sql = env.sql; });
after(async () => { await env.stop(); });

const resolve = (s) => (s && s.$ref ? resolve(s.$ref.split("/").slice(1).reduce((o, k) => o[k], spec)) : s);

// Minimal JSON Schema check for the subset the description uses.
function check(schema, value, at, problems) {
  const s = resolve(schema);
  if (!s || Object.keys(s).length === 0) return;
  if (s.anyOf || s.oneOf) {
    const alts = s.anyOf || s.oneOf;
    if (!alts.some((alt) => { const p = []; check(alt, value, at, p); return p.length === 0; })) problems.push(`${at}: matches no alternative (${JSON.stringify(value)?.slice(0, 80)})`);
    return;
  }
  if (s.allOf) { s.allOf.forEach((part) => check(part, value, at, problems)); return; }
  if ("const" in s) { if (value !== s.const) problems.push(`${at}: expected ${JSON.stringify(s.const)}`); return; }
  const type = s.type;
  if (type === "null") { if (value !== null) problems.push(`${at}: expected null`); return; }
  if (value === null || value === undefined) { problems.push(`${at}: missing or null`); return; }
  if (type === "object") {
    if (typeof value !== "object" || Array.isArray(value)) { problems.push(`${at}: expected object`); return; }
    for (const k of s.required || []) if (!(k in value)) problems.push(`${at}.${k}: required key missing`);
    for (const [k, sub] of Object.entries(s.properties || {})) if (k in value) check(sub, value[k], `${at}.${k}`, problems);
  } else if (type === "array") {
    if (!Array.isArray(value)) { problems.push(`${at}: expected array`); return; }
    value.forEach((v, i) => check(s.items, v, `${at}[${i}]`, problems));
  } else if (type === "string") {
    if (typeof value !== "string") problems.push(`${at}: expected string, got ${typeof value}`);
    else if (s.enum && !s.enum.includes(value)) problems.push(`${at}: "${value}" not in ${JSON.stringify(s.enum)}`);
  } else if (type === "integer") {
    if (!Number.isInteger(value)) problems.push(`${at}: expected integer`);
  } else if (type === "number") {
    if (typeof value !== "number") problems.push(`${at}: expected number`);
  } else if (type === "boolean") {
    if (typeof value !== "boolean") problems.push(`${at}: expected boolean`);
  }
}

function conforms(method, path, res) {
  const op = spec.paths[path][method];
  const r = op.responses[String(res.status)];
  assert.ok(r, `${method.toUpperCase()} ${path}: status ${res.status} is not described (${JSON.stringify(res.body)?.slice(0, 200)})`);
  const resp = r.$ref ? resolve(r) : r;
  const content = resp.content && (resp.content["application/json"] || resp.content["application/problem+json"]);
  if (!content) return;
  const problems = [];
  check(content.schema, res.body, `${method.toUpperCase()} ${path}`, problems);
  assert.deepEqual(problems, [], problems.join("\n"));
}

test("the checker itself rejects wrong shapes", () => {
  const p = [];
  check({ $ref: "#/components/schemas/User" }, { id: 1, locale: "fr" }, "User", p);
  assert.ok(p.some((x) => x.includes("display_name: required")) && p.some((x) => x.includes('"fr" not in')) && p.some((x) => x.includes("id: expected string")), p.join("\n"));
});

test("public, account, questionnaire and notification responses match the description", async () => {
  conforms("get", "/api/v1/health", await call("GET", "/api/v1/health"));
  conforms("get", "/api/v1/legal/current", await call("GET", "/api/v1/legal/current"));
  conforms("get", "/api/v1/support/contact", await call("GET", "/api/v1/support/contact"));
  conforms("get", "/api/v1/questionnaires/preview", await call("GET", "/api/v1/questionnaires/preview"));
  const u = await signUp(call, { name: "Maha" });
  conforms("post", "/api/v1/questionnaire-responses", u.submit);
  conforms("get", "/api/v1/users/me", await call("GET", "/api/v1/users/me", { token: u.token }));
  conforms("get", "/api/v1/questionnaires/current", await call("GET", "/api/v1/questionnaires/current", { token: u.token }));
  conforms("get", "/api/v1/notifications", await call("GET", "/api/v1/notifications", { token: u.token }));
  conforms("get", "/api/v1/cases/mine", await call("GET", "/api/v1/cases/mine", { token: u.token }));
  conforms("post", "/api/v1/promo-codes:check", await call("POST", "/api/v1/promo-codes:check", { token: u.token, body: { code: "NOPE" } }));
  conforms("get", "/api/v1/push/key", await call("GET", "/api/v1/push/key"));
  // errors use the problem envelope
  conforms("get", "/api/v1/users/me", await call("GET", "/api/v1/users/me"));
  conforms("post", "/api/v1/auth/token:refresh", await call("POST", "/api/v1/auth/token:refresh", { body: { refresh_token: u.refresh }, idem: false }));
});

test("booking, payment, event details and cancellation responses match the description", async () => {
  const u = await signUp(call, { name: "Shaikha" });
  const sessions = await call("GET", "/api/v1/sessions", { token: u.token });
  conforms("get", "/api/v1/sessions", sessions);
  const s = sessions.body.sessions.find((x) => x.language_match && !x.is_full);
  assert.ok(s, "seed data offers an open Arabic dinner");
  const booked = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: s.id } });
  conforms("post", "/api/v1/bookings", booked);
  conforms("get", "/api/v1/bookings/{id}", await call("GET", `/api/v1/bookings/${booked.body.booking_id}`, { token: u.token }));
  await payViaMock(call, await checkoutUrlFor(call, u.token, booked.body));
  conforms("get", "/api/v1/bookings", await call("GET", "/api/v1/bookings", { token: u.token }));
  conforms("get", "/api/v1/bookings/{id}/event-details", await call("GET", `/api/v1/bookings/${booked.body.booking_id}/event-details`, { token: u.token }));
  conforms("get", "/api/v1/bookings/{id}/contacts", await call("GET", `/api/v1/bookings/${booked.body.booking_id}/contacts`, { token: u.token }));
  conforms("post", "/api/v1/bookings/{id}/cancel", await call("POST", `/api/v1/bookings/${booked.body.booking_id}/cancel`, { token: u.token, body: { reason_code: "other" } }));
  conforms("post", "/api/v1/bookings/{id}/check-in", await call("POST", `/api/v1/bookings/${booked.body.booking_id}/check-in`, { token: u.token }));
});
