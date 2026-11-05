// Quiz-first questionnaire (spec 2026-10-28): public preview with display metadata, answers carried over from an
// older version, QA-2026-04 required questions, and the HerZone women-only confirmation.
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
  await call("POST", "/api/v1/users/me/registration", { token: r2.body.access_token, body: { display_name: name, locale: "ar", age_eligibility_confirmed: true, woman_confirmed: true,
    consents: ["terms", "conduct", "privacy_notice"].map((t) => ({ type: t, document_version: legal[t].document_version, granted: true })) } });
  return { token: r2.body.access_token, userId: r2.body.user.id };
}

test("preview: published v4 without a token, with display metadata and the Qatar adaptations", async () => {
  const r = await call("GET", "/api/v1/questionnaires/preview", { locale: "en" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.code, "QA-2026-04");
  assert.equal(r.body.draft, undefined, "no user data in the preview");
  const by = Object.fromEntries(r.body.questions.map((q) => [q.key, q]));
  assert.equal(by.Q05.layout, "chips");
  assert.equal(by.Q05.max_selections, 5);
  assert.equal(by.Q05.section, "Interests");
  assert.equal(by.Q21.layout, "scale");
  assert.equal(by.Q21.scale_low, "Not important");
  assert.equal(by.Q21.scale_high, "Very important");
  assert.equal(by.Q10, undefined, "no gender question: HerZone is for women only, confirmed at sign-up");
  assert.equal(by.Q08, undefined, "no contact preference: contact is a request after the meetup");
  assert.ok(!by.Q09.options.some((o) => /special/i.test(o.key)), "no dating goal");
  assert.ok(!r.body.questions.some((q) => /humou?r/i.test(q.text)), "no politically incorrect humour question");
  assert.ok(by.Q11.is_required);
  assert.deepEqual(r.body.questions.filter((q) => q.is_required).map((q) => q.key).sort(), ["Q01", "Q04", "Q11"]);
  const ar = await call("GET", "/api/v1/questionnaires/preview");
  assert.equal(ar.body.questions.find((q) => q.key === "Q05").section, "اهتماماتك");
  const arBy = Object.fromEntries(ar.body.questions.map((q) => [q.key, q]));
  assert.equal(arBy.Q09.text, "ما الذي تبحثين عنه؟", "addressed to a woman");
  assert.equal(arBy.Q07.purpose, "لنتواصل معكِ بشكل خاص؛ لا تكتبي تفاصيل هنا.");
  assert.deepEqual(arBy.Q24.options.map((o) => o.label), ["عزباء", "متزوجة", "مطلّقة / أرملة", "أفضّل عدم الإجابة"]);
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
  assert.equal(cur.code, "QA-2026-04");
  assert.equal(cur.submitted, null);
  assert.equal(cur.has_submitted_any, true);
  assert.equal(cur.carried.from_version_id, v1.id);
  const keyOf = (qid, oid) => { const q = cur.questions.find((x) => x.id === qid); return `${q.key}:${q.options.find((o) => o.id === oid).key}`; };
  const carried = cur.carried.answers.flatMap((a) => a.option_ids.map((o) => keyOf(a.question_id, o))).sort();
  assert.deepEqual(carried, ["Q01:lang_ar", "Q04:tier_2", "Q05:food", "Q05:travel"], "v1 'no_pref' has no Q05 match in v2 and is dropped");

  const opt = (key, ks) => { const q = cur.questions.find((x) => x.key === key); return { question_id: q.id, option_ids: q.options.filter((o) => ks.includes(o.key)).map((o) => o.id) }; };
  const missing = await call("POST", "/api/v1/questionnaire-responses", { token: u.token, body: { questionnaire_version_id: cur.questionnaire_version_id, status: "submitted",
    answers: [...cur.carried.answers] } });
  assert.equal(missing.status, 422);
  assert.deepEqual(missing.body.details.map((d) => `${d.question_key}:${d.code}`), ["Q11:REQUIRED_MISSING"]);
  const ok = await call("POST", "/api/v1/questionnaire-responses", { token: u.token, body: { questionnaire_version_id: cur.questionnaire_version_id, status: "submitted",
    answers: [...cur.carried.answers, opt("Q11", ["age_25_34"]), opt("Q12", ["ambivert"]), opt("Q21", ["s4"])] } });
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

test("privacy notice privacy-qa-4 (HerZone, women only, contact requests) lists the data and auto-save; an update is re-accepted without signing up again", async () => {
  const legal = (await call("GET", "/api/v1/legal/current")).body;
  assert.equal(legal.privacy_notice.document_version, "privacy-qa-4");
  for (const s of ["HerZone", "للنساء فقط", "طلبات التواصل", "زر واتساب", "تأكيدكِ أنكِ امرأة", "الحفظ التلقائي", "الفئة العمرية", "الحالة الاجتماعية", "بصمة الجهاز", "مسودة", "الأسئلة المطلوبة ثلاثة"])
    assert.ok(legal.privacy_notice.text.includes(s), s);
  assert.ok(!legal.privacy_notice.text.includes("Rightime") && !legal.privacy_notice.text.includes("رجل أو امرأة") && !legal.privacy_notice.text.includes("تفضيل التواصل"));
  const en = (await call("GET", "/api/v1/legal/current", { locale: "en" })).body;
  assert.ok(en.privacy_notice.text.includes("Auto-save") && en.privacy_notice.text.includes("device fingerprint") && en.privacy_notice.text.includes("women only"));

  const u = await registeredUser("Notice");
  assert.deepEqual((await call("GET", "/api/v1/users/me", { token: u.token })).body.user.outdated_consents, [], "just accepted the current notice");
  await env.sql`INSERT INTO app.legal_documents (version, type, text_ar, text_en, published_at) VALUES ('privacy-qa-test-next', 'privacy', 'نسخة أحدث', 'Newer', now())`;
  assert.deepEqual((await call("GET", "/api/v1/users/me", { token: u.token })).body.user.outdated_consents, ["privacy_notice"]);
  const old = await call("POST", "/api/v1/users/me/consents", { token: u.token, body: { consents: [{ type: "privacy_notice", document_version: "privacy-qa-4", granted: true }] } });
  assert.equal(old.body.code, "DOCUMENT_VERSION_OUTDATED");
  const refuse = await call("POST", "/api/v1/users/me/consents", { token: u.token, body: { consents: [{ type: "privacy_notice", document_version: "privacy-qa-test-next", granted: false }] } });
  assert.equal(refuse.body.code, "CONSENT_REQUIRED", "a required consent is withdrawn by deleting the account");
  assert.equal((await call("POST", "/api/v1/users/me/consents", { token: u.token, body: { consents: [] } })).status, 422);
  const ok = await call("POST", "/api/v1/users/me/consents", { token: u.token, body: { consents: [{ type: "privacy_notice", document_version: "privacy-qa-test-next", granted: true }] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.outdated_consents, []);
  const [row] = await env.sql`SELECT document_version, granted, source FROM app.user_consents WHERE user_id = ${u.userId} AND consent_type = 'privacy_notice'
                              ORDER BY recorded_at DESC, created_at DESC LIMIT 1`;
  assert.deepEqual({ ...row }, { document_version: "privacy-qa-test-next", granted: true, source: "app_web" });
  assert.equal((await call("POST", "/api/v1/users/me/consents", { body: { consents: [] } })).status, 401);
});

test("idempotency: a retry that arrives while the first request is still running is told to wait, never run twice", async () => {
  const u = await registeredUser("Retry");
  const principal = `user:${u.userId}`;
  // the first request has reserved its key and is still running
  await env.sql`INSERT INTO app.idempotency_keys (principal, key, method_path, request_hash, status_code, response)
                VALUES (${principal}, 'k-running', 'POST /api/v1/reports', ${"x".repeat(64)}, 0, '{}'::jsonb)`;
  const r = await call("POST", "/api/v1/users/me/consents", { token: u.token, idem: "k-running",
    body: { consents: [{ type: "marketing", document_version: (await call("GET", "/api/v1/legal/current")).body.marketing.document_version, granted: true }] } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "IDEMPOTENCY_IN_PROGRESS");
  assert.equal(r.body.retryable, true);
  const [{ n }] = await env.sql`SELECT count(*)::int AS n FROM app.user_consents WHERE user_id = ${u.userId} AND consent_type = 'marketing'`;
  assert.equal(n, 0, "the retry did not run the handler");
  // a normal key is reserved, then completed; the same key replays the stored answer
  const legal = (await call("GET", "/api/v1/legal/current")).body;
  const body = { consents: [{ type: "marketing", document_version: legal.marketing.document_version, granted: true }] };
  const first = await call("POST", "/api/v1/users/me/consents", { token: u.token, idem: "k-done", body });
  const again = await call("POST", "/api/v1/users/me/consents", { token: u.token, idem: "k-done", body });
  assert.equal(first.status, 200);
  assert.equal(again.headers.get("idempotent-replayed"), "true");
  const [{ m }] = await env.sql`SELECT count(*)::int AS m FROM app.user_consents WHERE user_id = ${u.userId} AND consent_type = 'marketing'`;
  assert.equal(m, 1, "applied exactly once");
  const [row] = await env.sql`SELECT status_code FROM app.idempotency_keys WHERE principal = ${principal} AND key = 'k-done'`;
  assert.equal(row.status_code, 200);
});

test("consents: malformed or duplicate entries are rejected with 422, not 500 or an arbitrary winner", async () => {
  const u = await registeredUser("Dupes");
  const legal = (await call("GET", "/api/v1/legal/current")).body;
  const v = (t) => legal[t].document_version;
  const dup = await call("POST", "/api/v1/users/me/consents", { token: u.token, body: { consents: [
    { type: "marketing", document_version: v("marketing"), granted: true }, { type: "marketing", document_version: v("marketing"), granted: false }] } });
  assert.equal(dup.status, 422);
  assert.equal(dup.body.code, "VALIDATION_FAILED");
  const r1 = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97466123456", locale: "ar", purpose: "login" } });
  const r2 = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r1.body.challenge_id, code: r1.body.dev_code } });
  const reg = await call("POST", "/api/v1/users/me/registration", { token: r2.body.access_token, body: { display_name: "N", locale: "ar", age_eligibility_confirmed: true, woman_confirmed: true,
    consents: [null, ...["terms", "conduct", "privacy_notice"].map((t) => ({ type: t, document_version: v(t), granted: true }))] } });
  assert.equal(reg.status, 422, JSON.stringify(reg.body));
  assert.equal(reg.body.code, "VALIDATION_FAILED");
});

test("women only: sign-up needs the confirmation; an older account confirms once before it can book", async () => {
  const r1 = await call("POST", "/api/v1/auth/otp:request", { body: { phone_e164: "+97466123499", locale: "ar", purpose: "login" } });
  const r2 = await call("POST", "/api/v1/auth/otp:verify", { body: { challenge_id: r1.body.challenge_id, code: r1.body.dev_code } });
  const legal = (await call("GET", "/api/v1/legal/current")).body;
  const consents = ["terms", "conduct", "privacy_notice"].map((t) => ({ type: t, document_version: legal[t].document_version, granted: true }));
  for (const woman of [undefined, false]) {
    const reg = await call("POST", "/api/v1/users/me/registration", { token: r2.body.access_token,
      body: { display_name: "N", locale: "ar", age_eligibility_confirmed: true, woman_confirmed: woman, consents } });
    assert.equal(reg.status, 422);
    assert.equal(reg.body.code, "WOMEN_ONLY");
    assert.equal(reg.body.message, "HerZone للنساء فقط. أكّدي أنكِ امرأة للمتابعة.");
  }
  const ok = await call("POST", "/api/v1/users/me/registration", { token: r2.body.access_token,
    body: { display_name: "N", locale: "ar", age_eligibility_confirmed: true, woman_confirmed: true, consents } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.user.woman_confirmed, true);

  // an account registered before HerZone became women-only
  const u = await registeredUser("Before");
  await env.sql`UPDATE app.users SET woman_confirmed_at = NULL WHERE id = ${u.userId}`;
  assert.equal((await call("GET", "/api/v1/users/me", { token: u.token })).body.user.woman_confirmed, false);
  const book = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: "00000000-0000-0000-0000-000000000000" } });
  assert.equal(book.status, 422);
  assert.equal(book.body.code, "WOMEN_ONLY", "no booking before the confirmation");
  assert.equal((await call("POST", "/api/v1/users/me/consents", { token: u.token, body: { consents: [], woman_confirmed: false } })).body.code, "WOMEN_ONLY");
  const conf = await call("POST", "/api/v1/users/me/consents", { token: u.token, body: { consents: [], woman_confirmed: true } });
  assert.equal(conf.status, 200, JSON.stringify(conf.body));
  assert.equal(conf.body.woman_confirmed, true);
  assert.equal((await call("GET", "/api/v1/users/me", { token: u.token })).body.user.woman_confirmed, true);
  const [{ at }] = await env.sql`SELECT woman_confirmed_at AS at FROM app.users WHERE id = ${u.userId}`;
  assert.ok(at, "the confirmation time is recorded");
  const after2 = await call("POST", "/api/v1/bookings", { token: u.token, body: { session_id: "00000000-0000-0000-0000-000000000000" } });
  assert.notEqual(after2.body.code, "WOMEN_ONLY");
});
