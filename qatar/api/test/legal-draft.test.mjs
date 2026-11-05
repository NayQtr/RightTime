// The privacy notice draft for counsel (privacy-qa-5, NMX-25) is loaded unpublished: members keep seeing and accepting
// privacy-qa-4 until the lawyer approves and the draft is published.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplate, client, startTestEnv } from "./helpers.mjs";

let env, call;
before(async () => { buildTemplate(); env = await startTestEnv(); call = client(env.base); });
after(async () => { await env.stop(); });

test("privacy-qa-5 draft is stored but not current until published", async () => {
  const [d] = await env.sql`SELECT published_at, text_ar, text_en FROM app.legal_documents WHERE version = 'privacy-qa-5'`;
  assert.ok(d, "draft loaded");
  assert.equal(d.published_at, null);
  assert.ok(d.text_ar.includes("مومباي") && d.text_en.includes("Mumbai"), "data location disclosed");
  assert.ok(!/\*\*/.test(d.text_ar + d.text_en), "no markdown in the stored text");
  const cur = await call("GET", "/api/v1/legal/current");
  assert.equal(cur.status, 200);
  assert.ok(JSON.stringify(cur.body).includes("privacy-qa-4") && !JSON.stringify(cur.body).includes("privacy-qa-5"), JSON.stringify(cur.body).slice(0, 300));
  await env.sql`UPDATE app.legal_documents SET published_at = now() WHERE version = 'privacy-qa-5' AND published_at IS NULL`;
  assert.ok(JSON.stringify((await call("GET", "/api/v1/legal/current")).body).includes("privacy-qa-5"), "the documented publish command works");
});
