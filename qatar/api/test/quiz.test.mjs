// Quiz-first questionnaire (spec 2026-10-28): public preview with display metadata, answers carried over from an
// older version, and QA-2026-02 required questions.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplate, client, startTestEnv } from "./helpers.mjs";

let env, call;
before(async () => { buildTemplate(); env = await startTestEnv(); call = client(env.base); });
after(async () => { await env.stop(); });

async function registeredUser(name) {
  const phone = `+9746${String(1000000 + Math.floor(Math.random() * 8999999)).slice(0, 7)}`;
  const r1 = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: phone, locale: "ar", purpose: "login" } });
  const r2 = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r1.body.challenge_id, code: r1.body.dev_code } });
  const legal = (await call("GET", "/api/v1/legal/current")).body;
  await call("POST", "/api/v1/users/me/registration", { token: r2.body.access_token, body: { display_name: name, locale: "ar", age_eligibility_confirmed: true,
    consents: ["terms", "conduct", "privacy_notice"].map((t) => ({ type: t, document_version: legal[t].document_version, granted: true })) } });
  return { token: r2.body.access_token, userId: r2.body.user.id };
}

test("preview: published v2 without a token, with display metadata and the Qatar adaptations", async () => {
  const r = await call("GET", "/api/v1/questionnaires/preview", { locale: "en" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.code, "QA-2026-02");
  assert.equal(r.body.draft, undefined, "no user data in the preview");
  const by = Object.fromEntries(r.body.questions.map((q) => [q.key, q]));
  assert.equal(by.Q05.layout, "chips");
  assert.equal(by.Q05.max_selections, 5);
  assert.equal(by.Q05.section, "Interests");
  assert.equal(by.Q21.layout, "scale");
  assert.equal(by.Q21.scale_low, "Not important");
  assert.equal(by.Q21.scale_high, "Very important");
  assert.deepEqual(by.Q10.options.map((o) => o.key), ["man", "woman"], "no non-binary option");
  assert.ok(by.Q10.options.every((o) => typeof o.emoji === "string" && o.emoji.length > 0));
  assert.ok(!by.Q09.options.some((o) => /special/i.test(o.key)), "no dating goal");
  assert.ok(!r.body.questions.some((q) => /humou?r/i.test(q.text)), "no politically incorrect humour question");
  assert.ok(by.Q10.is_required && by.Q11.is_required);
  const ar = await call("GET", "/api/v1/questionnaires/preview");
  assert.equal(ar.body.questions.find((q) => q.key === "Q05").section, "اهتماماتك");
});

test("current: answers from an older version are carried by question and option key", async () => {
  const u = await registeredUser("Carry");
  const [v1] = await env.sql`SELECT id FROM app.questionnaire_versions WHERE code = 'QA-2026-01'`;
  const [resp] = await env.sql`INSERT INTO app.questionnaire_responses (user_id, questionnaire_version_id, status, submitted_at, completeness_required)
                               VALUES (${u.userId}, ${v1.id}, 'submitted', now(), 2) RETURNING id`;
  await env.sql`INSERT INTO app.answers (response_id, question_id, option_id)
                SELECT ${resp.id}, q.id, o.id FROM app.questions q JOIN app.question_options o ON o.question_id = q.id
                 WHERE q.questionnaire_version_id = ${v1.id}
                   AND ((q.key = 'Q05' AND o.key IN ('food', 'travel', 'no_pref')) OR (q.key = 'Q01' AND o.key = 'lang_ar') OR (q.key = 'Q04' AND o.key = 'tier_2'))`;
  const cur = (await call("GET", "/api/v1/questionnaires/current", { token: u.token })).body;
  assert.equal(cur.code, "QA-2026-02");
  assert.equal(cur.submitted, null);
  assert.equal(cur.has_submitted_any, true);
  assert.equal(cur.carried.from_version_id, v1.id);
  const keyOf = (qid, oid) => { const q = cur.questions.find((x) => x.id === qid); return `${q.key}:${q.options.find((o) => o.id === oid).key}`; };
  const carried = cur.carried.answers.flatMap((a) => a.option_ids.map((o) => keyOf(a.question_id, o))).sort();
  assert.deepEqual(carried, ["Q01:lang_ar", "Q04:tier_2", "Q05:food", "Q05:travel"], "v1 'no_pref' has no Q05 match in v2 and is dropped");

  const opt = (key, ks) => { const q = cur.questions.find((x) => x.key === key); return { question_id: q.id, option_ids: q.options.filter((o) => ks.includes(o.key)).map((o) => o.id) }; };
  const missing = await call("POST", "/api/v1/questionnaire-responses", { token: u.token, body: { questionnaire_version_id: cur.questionnaire_version_id, status: "submitted",
    answers: [...cur.carried.answers, opt("Q11", ["age_25_34"])] } });
  assert.equal(missing.status, 422);
  assert.deepEqual(missing.body.details.map((d) => `${d.question_key}:${d.code}`), ["Q10:REQUIRED_MISSING"]);
  const ok = await call("POST", "/api/v1/questionnaire-responses", { token: u.token, body: { questionnaire_version_id: cur.questionnaire_version_id, status: "submitted",
    answers: [...cur.carried.answers, opt("Q10", ["man"]), opt("Q11", ["age_25_34"]), opt("Q12", ["ambivert"]), opt("Q21", ["s4"])] } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const after2 = (await call("GET", "/api/v1/questionnaires/current", { token: u.token })).body;
  assert.ok(after2.submitted);
  assert.equal(after2.carried, null);
  assert.equal(after2.has_submitted_any, true);
});

test("current: a new user has nothing submitted and nothing carried", async () => {
  const u = await registeredUser("Fresh");
  const cur = (await call("GET", "/api/v1/questionnaires/current", { token: u.token })).body;
  assert.equal(cur.has_submitted_any, false);
  assert.equal(cur.carried, null);
  assert.equal(cur.submitted, null);
});
