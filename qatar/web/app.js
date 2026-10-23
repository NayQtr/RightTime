// {BRAND} user web app — SCR-01 … SCR-10 (v0.3 §1). Vanilla ES modules, hash router, RTL-first.
import { STRINGS } from "./strings.js";

const CFG = Object.assign({ apiBase: "", staging: true }, window.QATAR_CONFIG || {});
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("q_" + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("q_" + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem("q_" + k); } catch { /* private mode */ } },
};
let locale = store.get("locale") || "ar";
const state = { me: null, q: null, qAnswers: null, phone: null, challenge: null, timers: [] };
const main = document.getElementById("main");

// ------------------------------------------------------------------ helpers
const T = (k, vars = {}) => String(STRINGS[locale][k] ?? STRINGS.ar[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (vars[n] ?? `{${n}}`));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (s) => `<bdi class="num">${esc(s)}</bdi>`;
const intlLocale = () => (locale === "ar" ? "ar-QA-u-nu-latn" : "en-GB");
const fmtDate = (iso, opts = { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) =>
  iso ? new Intl.DateTimeFormat(intlLocale(), { timeZone: "Asia/Qatar", ...opts }).format(new Date(iso)) : "";
const fmtTime = (iso) => fmtDate(iso, { weekday: "short", hour: "numeric", minute: "2-digit" });
const $ = (sel, root = main) => root.querySelector(sel);
const $$ = (sel, root = main) => [...root.querySelectorAll(sel)];
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function clearTimers() { state.timers.forEach((t) => clearInterval(t)); state.timers = []; }
function every(ms, fn) { const t = setInterval(fn, ms); state.timers.push(t); return t; }

// Toasts hide after 4 s and can be dismissed by tapping so they never keep covering content.
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.onclick = () => { clearTimeout(toast.t); el.textContent = ""; };
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.textContent = ""; }, 4000);
}

function view(title, html) {
  main.innerHTML = html;
  document.title = `${title} · ${T("brand")}`;
  const h = main.querySelector("h1");
  if (h) { h.tabIndex = -1; h.focus({ preventScroll: false }); }
  window.scrollTo(0, 0);
}

function errorBanner(err) {
  const msg = (err && err.message) || T("errGeneric");
  return `<div class="banner banner-danger" role="alert"><span class="icon" aria-hidden="true">⚠️</span><div>${esc(msg)}</div></div>`;
}

function loadingView() { main.innerHTML = `<div class="center" aria-busy="true"><div class="spinner" role="img" aria-label="${esc(T("loading"))}"></div></div>`; }

// ------------------------------------------------------------------ API client (bearer token, Idempotency-Key, refresh rotation)
async function api(method, path, body, opts = {}) {
  const headers = { "Accept-Language": locale };
  const tok = store.get("tokens");
  if (tok && !opts.noAuth) headers.Authorization = `Bearer ${tok.access_token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["Idempotency-Key"] = opts.idem || uuid();
  let res;
  try {
    res = await fetch(CFG.apiBase + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, data: { code: "OFFLINE", message: T("offline") } };
  }
  if (res.status === 401 && tok && tok.refresh_token && !opts.retried && !opts.noAuth) {
    const r = await fetch(CFG.apiBase + "/api/v1/auth/token:refresh", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tok.refresh_token }) }).catch(() => null);
    if (r && r.ok) {
      store.set("tokens", await r.json());
      return api(method, path, body, { ...opts, retried: true });
    }
    store.del("tokens");
    go("#/welcome");
  }
  const text = res.status === 304 ? "" : await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (res.status === 403 && data && data.code === "ACCOUNT_SUSPENDED") state.suspended = true;
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

// ------------------------------------------------------------------ shell
function renderTopbar() {
  const signedIn = !!store.get("tokens");
  document.getElementById("topbar").innerHTML = `
    <a class="brand" href="${signedIn ? "#/home" : "#/welcome"}"><span class="brand-mark" aria-hidden="true">ط</span><span>${esc(T("brand"))}</span></a>
    ${CFG.staging ? `<span class="env-badge">${esc(T("staging"))}</span>` : ""}
    <span class="spacer"></span>
    ${signedIn ? `<a class="btn btn-ghost" href="#/inbox" aria-label="${esc(T("inbox"))}">🔔</a><a class="btn btn-ghost" href="#/profile" aria-label="${esc(T("profile"))}">👤</a>` : ""}
    <button class="btn btn-ghost" id="lang" lang="${locale === "ar" ? "en" : "ar"}">${esc(T("langToggle"))}</button>`;
  document.getElementById("lang").onclick = () => setLocale(locale === "ar" ? "en" : "ar");
}

function setLocale(l) {
  locale = l;
  store.set("locale", l);
  document.documentElement.lang = l;
  document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  document.querySelector(".skip").textContent = T("skip");
  state.q = null;
  renderTopbar();
  route();
}

async function loadMe() {
  const r = await api("GET", "/api/v1/users/me");
  if (!r.ok) return null;
  state.me = r.data.user;
  return state.me;
}

async function loadQuestionnaire(force = false) {
  if (state.q && !force) return state.q;
  const r = await api("GET", "/api/v1/questionnaires/current");
  if (!r.ok) throw r.data;
  state.q = r.data;
  const src = r.data.draft || r.data.submitted;
  if (!state.qAnswers || force) {
    state.qAnswers = {};
    for (const a of (src ? src.answers : [])) state.qAnswers[a.question_id] = new Set(a.option_ids);
  }
  return state.q;
}

// gate: signed in -> registered -> questionnaire submitted
async function guard({ needQuestionnaire = true } = {}) {
  if (!store.get("tokens")) { go("#/welcome"); return false; }
  const me = await loadMe();
  if (!me) { go("#/welcome"); return false; }
  if (me.status === "suspended" || me.status === "banned") { state.suspended = true; }
  if (me.registration_status !== "complete") { go("#/register"); return false; }
  if (needQuestionnaire && !state.suspended) {
    const q = await loadQuestionnaire().catch(() => null);
    if (q && !q.submitted) { go("#/questions/0"); return false; }
  }
  return true;
}

// ------------------------------------------------------------------ SCR-01 onboarding
function scrWelcome() {
  if (store.get("tokens")) { go("#/home"); return; }
  const cards = [["🍽️", "ob1Title", "ob1Body"], ["🗓️", "ob2Title", "ob2Body"], ["🛡️", "ob3Title", "ob3Body"]];
  let i = 0;
  const draw = () => {
    const [icon, t, b] = cards[i];
    view(T(t), `
      <section class="card card-raised onboard-card" aria-roledescription="carousel">
        <div class="illustration" aria-hidden="true">${icon}</div>
        <h1 class="display">${esc(T(t))}</h1>
        <p class="muted">${esc(T(b))}</p>
      </section>
      <div class="dots" role="group" aria-label="${esc(T("slide"))}">
        ${cards.map((_, j) => `<button type="button" data-i="${j}" aria-label="${esc(T("slide"))} ${j + 1} / 3" ${j === i ? 'aria-current="true"' : ""}></button>`).join("")}
      </div>
      <div class="stack">
        ${i < 2 ? `<button class="btn btn-primary btn-block" id="next">${esc(T("next"))}</button>` : `<a class="btn btn-primary btn-block" href="#/signin">${esc(T("obCta"))}</a>`}
        <a class="btn btn-secondary btn-block" href="#/signin">${esc(T("obSignin"))}</a>
      </div>`);
    $$(".dots button").forEach((b) => (b.onclick = () => { i = Number(b.dataset.i); draw(); }));
    const n = $("#next");
    if (n) n.onclick = () => { i += 1; draw(); };
  };
  draw();
}

// ------------------------------------------------------------------ SCR-02a phone, 02b OTP, 02c registration
function scrPhone() {
  view(T("phoneTitle"), `
    <h1>${esc(T("phoneTitle"))}</h1>
    <p class="muted">${esc(T("phoneHelp"))}</p>
    <form id="f" class="stack" novalidate>
      <div class="field">
        <label class="label" for="phone">${esc(T("phoneLabel"))}</label>
        <div class="phone"><span class="prefix">+974</span>
          <input class="input" id="phone" inputmode="numeric" autocomplete="tel-national" maxlength="8" pattern="[3-7][0-9]{7}" required aria-describedby="perr" value="${esc(state.phone ? state.phone.slice(4) : "")}"></div>
        <div id="perr" class="error-text" role="alert"></div>
      </div>
      <button class="btn btn-primary btn-block" id="send" type="submit">${esc(T("sendCode"))}</button>
    </form>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const digits = $("#phone").value.replace(/\D/g, "");
    const btn = $("#send");
    btn.disabled = true;
    const r = await api("POST", "/api/v1/auth/otp:request", { phone_e164: "+974" + digits, locale, purpose: "login" }, { noAuth: true });
    btn.disabled = false;
    if (!r.ok) { $("#phone").setAttribute("aria-invalid", "true"); $("#perr").textContent = r.data.message || T("errGeneric"); return; }
    state.phone = "+974" + digits;
    state.challenge = r.data;
    go("#/otp");
  };
}

function scrOtp() {
  if (!state.challenge) { go("#/signin"); return; }
  const ch = state.challenge;
  view(T("otpTitle"), `
    <h1>${esc(T("otpTitle"))}</h1>
    <p class="muted">${esc(T("otpHelp"))} ${num(state.phone)}</p>
    ${ch.dev_code ? `<div class="banner banner-warning"><div>${esc(T("devCode"))} ${num(ch.dev_code)}</div></div>` : ""}
    <form id="f" class="stack" novalidate>
      <div class="field">
        <label class="label" for="code">${esc(T("otpLabel"))}</label>
        <input class="input otp" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required aria-describedby="oerr">
        <div id="oerr" class="error-text" role="alert"></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit" id="ver">${esc(T("verify"))}</button>
      <button class="link-btn" type="button" id="resend" disabled></button>
    </form>`);
  let left = ch.resend_after;
  const rs = $("#resend");
  const tick = () => { if (left > 0) { rs.textContent = T("resendIn", { s: left }); rs.disabled = true; left -= 1; } else { rs.textContent = T("resend"); rs.disabled = false; } };
  tick(); every(1000, tick);
  rs.onclick = () => go("#/signin");
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    $("#ver").disabled = true;
    const r = await api("POST", "/api/v1/auth/otp:verify", { challenge_id: ch.challenge_id, code: $("#code").value.trim(), locale, device: { platform: "web" } }, { noAuth: true });
    $("#ver").disabled = false;
    if (!r.ok) {
      const d = r.data.details && r.data.details[0];
      $("#code").setAttribute("aria-invalid", "true");
      $("#oerr").textContent = (r.data.message || T("errGeneric")) + (d && d.attempts_remaining != null ? ` · ${T("attemptsLeft", { n: d.attempts_remaining })}` : "");
      return;
    }
    store.set("tokens", { access_token: r.data.access_token, refresh_token: r.data.refresh_token });
    state.challenge = null;
    renderTopbar();
    go(r.data.user.registration_status === "complete" ? "#/home" : "#/register");
  };
}

async function scrRegister() {
  if (!store.get("tokens")) { go("#/welcome"); return; }
  loadingView();
  const [meR, legalR] = await Promise.all([api("GET", "/api/v1/users/me"), api("GET", "/api/v1/legal/current", undefined, { noAuth: true })]);
  if (meR.ok && meR.data.user.registration_status === "complete") { go("#/home"); return; }
  const L = legalR.data || {};
  const consent = (type, labelKey, req) => L[type] ? `
    <label class="check"><input type="checkbox" name="c" value="${type}" ${req ? "required" : ""}>
      <span>${esc(T(labelKey))} ${req ? `<span class="caption">(${esc(T("required"))})</span>` : ""}
      <details><summary class="caption">${esc(T("readDoc"))} · ${num(L[type].document_version)}</summary><p class="caption">${esc(L[type].text)}</p></details></span></label>` : "";
  view(T("regTitle"), `
    <h1>${esc(T("regTitle"))}</h1>
    <form id="f" class="stack" novalidate>
      <div class="field"><label class="label" for="name">${esc(T("nameLabel"))}</label>
        <input class="input" id="name" maxlength="30" autocomplete="given-name" aria-describedby="nh"><span id="nh" class="caption">${esc(T("nameHelp"))}</span></div>
      <fieldset class="card">
        <label class="check"><input type="checkbox" id="age" required><span>${esc(T("ageLabel"))} <span class="caption">(${esc(T("required"))})</span></span></label>
        ${consent("terms", "termsLabel", true)}${consent("conduct", "conductLabel", true)}${consent("privacy_notice", "privacyLabel", true)}${consent("marketing", "marketingLabel", false)}
      </fieldset>
      <div id="err" role="alert"></div>
      <button class="btn btn-primary btn-block" type="submit" id="go">${esc(T("continue"))}</button>
    </form>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const checked = new Set($$("input[name=c]:checked").map((i) => i.value));
    const body = {
      display_name: $("#name").value.trim() || null, locale, age_eligibility_confirmed: $("#age").checked,
      consents: Object.keys(L).filter((t) => ["terms", "conduct", "privacy_notice", "marketing"].includes(t))
        .map((t) => ({ type: t, document_version: L[t].document_version, granted: checked.has(t) })),
    };
    $("#go").disabled = true;
    const r = await api("POST", "/api/v1/users/me/registration", body);
    $("#go").disabled = false;
    if (!r.ok) { $("#err").innerHTML = errorBanner(r.data); return; }
    state.me = r.data.user;
    go("#/questions/0");
  };
}

// ------------------------------------------------------------------ SCR-03 questionnaire
async function scrQuestions(idxStr) {
  if (!(await guard({ needQuestionnaire: false }))) return;
  const q = await loadQuestionnaire();
  const qs = q.questions;
  const i = Math.max(0, Math.min(Number(idxStr || 0), qs.length - 1));
  const qq = qs[i];
  const sel = state.qAnswers[qq.id] || new Set();
  const single = ["single", "tier", "contact_request"].includes(qq.answer_type);
  const pct = Math.round(((i + 1) / qs.length) * 100);
  view(qq.text, `
    <p class="caption">${esc(T("qProgress", { i: i + 1, n: qs.length }))}</p>
    <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${qs.length}" aria-valuenow="${i + 1}" aria-label="${esc(T("qProgress", { i: i + 1, n: qs.length }))}"><span style="width:${pct}%"></span></div>
    <form id="f" class="stack" novalidate>
      <fieldset>
        <legend><h1>${esc(qq.text)}</h1></legend>
        <p class="caption"><span aria-hidden="true">ℹ️</span> ${esc(T("whyAsk"))}: ${esc(qq.purpose)}</p>
        ${!qq.is_required ? `<p class="caption">${esc(T("optional"))}</p>` : ""}
        ${qq.max_selections ? `<p class="caption" id="maxnote">${esc(T("chooseUpTo", { n: qq.max_selections }))}</p>` : ""}
        <div class="options">
          ${qq.options.map((o) => `
            <label class="option ${single ? "radio" : ""}">
              <input type="${single ? "radio" : "checkbox"}" name="o" value="${o.id}" data-key="${esc(o.key)}" data-excl="${o.is_exclusive}" ${sel.has(o.id) ? "checked" : ""}>
              <span class="tick" aria-hidden="true"></span><span>${esc(o.label)}</span></label>`).join("")}
        </div>
      </fieldset>
      <div id="note" aria-live="polite"></div>
      <div class="row between">
        ${i > 0 ? `<a class="btn btn-secondary" href="#/questions/${i - 1}">${esc(T("back"))}</a>` : "<span></span>"}
        <button class="btn btn-primary" type="submit" id="nx">${esc(i === qs.length - 1 ? T("continue") : T("next"))}</button>
      </div>
      <button type="button" class="link-btn" id="draft">${esc(T("saveExit"))}</button>
    </form>`);
  const inputs = $$("input[name=o]");
  const sync = (changed) => {
    if (changed && !single && changed.checked) {
      if (changed.dataset.excl === "true") inputs.forEach((x) => { if (x !== changed) x.checked = false; });
      else inputs.forEach((x) => { if (x.dataset.excl === "true") x.checked = false; });
    }
    const chosen = inputs.filter((x) => x.checked);
    if (qq.max_selections) inputs.forEach((x) => { x.disabled = !x.checked && chosen.length >= qq.max_selections; });
    state.qAnswers[qq.id] = new Set(chosen.map((x) => x.value));
    $("#nx").disabled = qq.is_required && chosen.length === 0;
    const keys = chosen.map((x) => x.dataset.key);
    $("#note").innerHTML = qq.key === "Q01" && keys.length === 1 && keys[0] === "lang_other" ? `<div class="banner banner-info"><div>${esc(T("q01Note"))}</div></div>`
      : qq.key === "Q07" && keys.includes("private_contact") ? `<div class="banner banner-info"><div>${esc(T("q07Note"))}</div></div>` : "";
  };
  inputs.forEach((x) => (x.onchange = () => sync(x)));
  sync(null);
  $("#f").onsubmit = (e) => { e.preventDefault(); go(i === qs.length - 1 ? "#/summary" : `#/questions/${i + 1}`); };
  $("#draft").onclick = async () => {
    await api("POST", "/api/v1/questionnaire-responses", { questionnaire_version_id: q.questionnaire_version_id, status: "draft", answers: answersPayload() });
    toast(T("save"));
    go("#/home");
  };
}

function answersPayload() {
  return Object.entries(state.qAnswers || {}).map(([question_id, set]) => ({ question_id, option_ids: [...set] }));
}

async function scrSummary() {
  if (!(await guard({ needQuestionnaire: false }))) return;
  const q = await loadQuestionnaire();
  view(T("summaryTitle"), `
    <h1>${esc(T("summaryTitle"))}</h1>
    <ul class="list">
      ${q.questions.map((qq, i) => {
        const chosen = qq.options.filter((o) => (state.qAnswers[qq.id] || new Set()).has(o.id)).map((o) => o.label);
        return `<li class="card"><div class="row between"><strong>${esc(qq.text)}</strong><a href="#/questions/${i}" aria-label="${esc(T("edit"))}: ${esc(qq.text)}">${esc(T("edit"))}</a></div>
          <div class="${chosen.length ? "" : "muted"}">${esc(chosen.join(" · ") || T("noAnswer"))}</div></li>`;
      }).join("")}
    </ul>
    <div id="err" role="alert"></div>
    <button class="btn btn-primary btn-block" id="save">${esc(T("saveAnswers"))}</button>`);
  $("#save").onclick = async () => {
    $("#save").disabled = true;
    const r = await api("POST", "/api/v1/questionnaire-responses", { questionnaire_version_id: q.questionnaire_version_id, status: "submitted", answers: answersPayload() });
    $("#save").disabled = false;
    if (!r.ok) {
      const bad = (r.data.details || []).map((d) => `${d.question_key || ""} ${d.code}`).join(", ");
      $("#err").innerHTML = errorBanner({ message: `${r.data.message || ""} ${bad}` });
      return;
    }
    if (r.data.derived && r.data.derived.private_contact_case_id) toast(T("q07Note"));
    await loadQuestionnaire(true);
    go("#/sessions");
  };
}

// ------------------------------------------------------------------ SCR-04 sessions
async function scrSessions() {
  if (!(await guard())) return;
  const exp = store.get("exp") || "dinner";
  loadingView();
  const r = await api("GET", `/api/v1/sessions?experience=${exp}`);
  if (!r.ok) { view(T("sessionsTitle"), `<h1>${esc(T("sessionsTitle"))}</h1>${errorBanner(r.data)}`); return; }
  const all = r.data.sessions;
  const ok = all.filter((s) => s.language_match);
  const card = (s) => `
    <label class="option radio" style="align-items:flex-start">
      <input type="radio" name="s" value="${s.id}" ${s.is_full || s.my_booking_id ? "disabled" : ""}>
      <span class="tick" aria-hidden="true"></span>
      <span class="stack" style="flex:1">
        <span class="row between"><strong>${esc(fmtDate(s.starts_at))}</strong>
          ${s.my_booking_id ? `<span class="badge badge-success">${esc(T("alreadyBooked"))}</span>` : s.is_full ? `<span class="badge badge-danger">${esc(T("full"))}</span>` : `<span class="badge badge-info">${esc(T("seatsLeft", { n: s.seats_left }))}</span>`}</span>
        <span class="caption">${esc(s.district)} · ${esc(T(s.conversation_language === "ar" ? "langAr" : "langEn"))} · ${esc(T("groupSize"))} · ${esc(s.price.display)}</span>
      </span></label>
    ${s.is_full && !s.my_booking_id ? `<button class="btn btn-secondary" data-wait="${s.id}">${esc(T("joinWaitlist"))}</button>` : ""}`;
  view(T("sessionsTitle"), `
    <h1>${esc(T("sessionsTitle"))}</h1>
    <div class="segmented" role="group" aria-label="${esc(T("experience"))}">
      <button type="button" data-exp="dinner" aria-pressed="${exp === "dinner"}">${esc(T("dinner"))}</button>
      <button type="button" data-exp="coffee" aria-pressed="${exp === "coffee"}">${esc(T("coffee"))}</button>
    </div>
    <form id="f" class="stack" novalidate>
      ${ok.length ? `<fieldset><legend class="sr-only">${esc(T("sessionsTitle"))}</legend><div class="options">${ok.map(card).join("")}</div></fieldset>`
        : `<div class="banner banner-info"><div>${esc(T("noSessions"))} <a href="#/questions/0">${esc(T("editLanguages"))}</a></div></div>`}
      <fieldset id="alts" hidden><legend class="label">${esc(T("alternatesLegend"))}</legend><p class="caption">${esc(T("alternatesHelp"))}</p><div class="options" id="altlist"></div></fieldset>
      <div id="err" role="alert"></div>
    </form>
    <div class="sticky-bar"><div>
      <span class="caption">${esc(T("priceStrip", { fee: (ok[0] || all[0] || { price: { display: "" } }).price.display }))}</span>
      <button class="btn btn-primary btn-block" id="go" disabled>${esc(T("continueToPay"))}</button></div></div>`);
  $$("[data-exp]").forEach((b) => (b.onclick = () => { store.set("exp", b.dataset.exp); scrSessions(); }));
  $$("[data-wait]").forEach((b) => (b.onclick = async () => {
    const w = await api("POST", `/api/v1/sessions/${b.dataset.wait}/waitlist`);
    toast(w.ok ? T("onWaitlist", { n: w.data.position }) : (w.data.message || T("errGeneric")));
  }));
  const radios = $$("input[name=s]");
  radios.forEach((x) => (x.onchange = () => {
    $("#go").disabled = false;
    const others = ok.filter((s) => s.id !== x.value && !s.my_booking_id);
    $("#alts").hidden = !others.length;
    $("#altlist").innerHTML = others.slice(0, 6).map((s) => `<label class="option"><input type="checkbox" name="alt" value="${s.id}"><span class="tick" aria-hidden="true"></span><span>${esc(fmtDate(s.starts_at))} · ${esc(s.district)}</span></label>`).join("");
    $$("input[name=alt]").forEach((a) => (a.onchange = () => {
      const n = $$("input[name=alt]:checked").length;
      $$("input[name=alt]").forEach((y) => { y.disabled = !y.checked && n >= 3; });
    }));
  }));
  $("#go").onclick = async () => {
    const chosen = radios.find((x) => x.checked);
    if (!chosen) return;
    $("#go").disabled = true;
    const r2 = await api("POST", "/api/v1/bookings", { session_id: chosen.value, alternate_session_ids: $$("input[name=alt]:checked").map((a) => a.value) });
    $("#go").disabled = false;
    if (!r2.ok) {
      $("#err").innerHTML = errorBanner(r2.data) + (r2.data.waitlist_href ? `<button class="btn btn-secondary" id="wl">${esc(T("joinWaitlist"))}</button>` : "");
      const wl = $("#wl");
      if (wl) wl.onclick = async () => { const w = await api("POST", r2.data.waitlist_href); toast(w.ok ? T("onWaitlist", { n: w.data.position }) : w.data.message); };
      return;
    }
    go(`#/booking/${r2.data.booking_id}/review`);
  };
}

// ------------------------------------------------------------------ SCR-05 review & pay, SCR-05P processing
async function scrReview(id) {
  if (!(await guard())) return;
  loadingView();
  const [bR, eR] = await Promise.all([api("GET", `/api/v1/bookings/${id}`), api("GET", `/api/v1/bookings/${id}/event-details`)]);
  if (!bR.ok || !eR.ok) { view(T("reviewTitle"), `<h1>${esc(T("reviewTitle"))}</h1>${errorBanner(bR.data || eR.data)}`); return; }
  const b = bR.data, e = eR.data;
  if (b.status !== "payment_pending") { go(`#/booking/${id}`); return; }
  const expired = !b.hold_expires_at || new Date(b.hold_expires_at) <= new Date();
  view(T("reviewTitle"), `
    <h1>${esc(T("reviewTitle"))}</h1>
    <section class="card"><dl class="facts">
      <dt>${esc(T("experience"))}</dt><dd>${esc(T(e.session.experience))}</dd>
      <dt>${esc(T("dateTime"))}</dt><dd>${esc(fmtDate(e.session.starts_at))}</dd>
      <dt>${esc(T("district"))}</dt><dd>${esc(e.session.district)}</dd>
      <dt>${esc(T("tableLanguage"))}</dt><dd>${esc(T(e.session.conversation_language === "ar" ? "langAr" : "langEn"))}</dd>
      <dt>${esc(T("groupSizeLabel"))}</dt><dd>${esc(T("groupSize"))}</dd></dl></section>
    <section class="card">
      <div class="kv"><span>${esc(T("feeNow"))}</span><strong>${esc(b.amount.display)}</strong></div>
      <div class="kv"><span>${esc(T("foodAtVenue"))}</span><span class="muted">${esc(T("foodBand", { band: e.session.food_price_band.display }))}</span></div>
    </section>
    <div class="banner banner-info"><span class="icon" aria-hidden="true">ℹ️</span><div>${esc(T("policyBox", { deadline: fmtDate(e.booking.cancellation.full_refund_until) }))}</div></div>
    ${b.payment && b.payment.status === "failed" ? `<div class="banner banner-warning" role="alert"><div>${esc(T("paymentFailed"))} ${esc(T("noDoubleCharge"))}</div></div>` : ""}
    <p class="label" id="hold">${expired ? "" : `${esc(T("holdTimer"))} <span class="num" id="clock"></span>`}</p>
    <p class="sr-only" aria-live="polite" id="holdlive"></p>
    <div id="err" role="alert">${expired ? errorBanner({ message: T("holdExpired") }) : ""}</div>
    ${expired ? `<a class="btn btn-primary btn-block" href="#/sessions">${esc(T("chooseAgain"))}</a>`
      : `<button class="btn btn-primary btn-block" id="pay">${esc(T("pay", { fee: b.amount.display }))}</button>`}
    <button class="link-btn" id="change">${esc(T("changeSession"))}</button>`);
  if (!expired) {
    const end = new Date(b.hold_expires_at).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      $("#clock").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      if (s === 120 || s === 30) $("#holdlive").textContent = `${T("holdTimer")} ${$("#clock").textContent}`;
      if (s === 0) { clearTimers(); scrReview(id); }
    };
    tick(); every(1000, tick);
    $("#pay").onclick = async () => {
      $("#pay").disabled = true;
      let url = b.checkout_url;
      if (!url) {
        const c = await api("POST", `/api/v1/bookings/${id}/checkout`);
        if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); $("#pay").disabled = false; return; }
        url = c.data.checkout_url;
      }
      main.innerHTML = `<div class="center"><div class="spinner" aria-hidden="true"></div><h1>${esc(T("redirecting"))}</h1></div>`;
      location.assign(url);
    };
  }
  $("#change").onclick = async () => { await api("POST", `/api/v1/bookings/${id}/cancel`, {}); go("#/sessions"); };
}

async function scrPayReturn(id) {
  if (!(await guard())) return;
  const started = Date.now();
  const draw = (phase, b) => {
    if (phase === "success") {
      view(T("paidTitle"), `<div class="center"><div class="success-check" aria-hidden="true">✓</div><h1>${esc(T("paidTitle"))}</h1>
        <p>${esc(T("bookingRef"))} ${num(b.ref)}</p><a class="btn btn-primary" href="#/home">${esc(T("goDashboard"))}</a></div>`);
    } else if (phase === "failed") {
      view(T("paymentFailed"), `<div class="center"><h1>${esc(T("paymentFailed"))}</h1><p class="muted">${esc(T("noDoubleCharge"))}</p>
        <a class="btn btn-primary" href="#/booking/${id}/review">${esc(T("payNow"))}</a></div>`);
    } else if (phase === "slow") {
      view(T("confirming"), `<div class="center"><div aria-hidden="true" class="illustration">⏳</div><h1>${esc(T("slowConfirm"))}</h1><a class="btn btn-secondary" href="#/home">${esc(T("backHome"))}</a></div>`);
    } else {
      view(T("confirming"), `<div class="center" aria-busy="true"><div class="spinner" aria-hidden="true"></div><h1>${esc(T("confirming"))}</h1></div>`);
    }
  };
  draw("confirming");
  const poll = async () => {
    const r = await api("GET", `/api/v1/bookings/${id}`);
    if (!r.ok) return;
    if (r.data.status !== "payment_pending") { clearTimers(); draw(r.data.status === "paid_awaiting_group" ? "success" : "other", r.data); if (r.data.status !== "paid_awaiting_group") go(`#/booking/${id}`); return; }
    if (r.data.payment && r.data.payment.status === "failed") { clearTimers(); draw("failed", r.data); return; }
    if (Date.now() - started > 60000 && !scrPayReturn.slow) { scrPayReturn.slow = true; clearTimers(); draw("slow"); every(10000, poll); }
  };
  scrPayReturn.slow = false;
  await poll();
  if (!state.timers.length && location.hash.includes("/pay/return/")) every(2000, poll);
}

// ------------------------------------------------------------------ SCR-06 dashboard
const ACTIVE = ["payment_pending", "paid_awaiting_group", "group_locked", "revealed", "checked_in"];
function statusBadge(b) {
  const map = { payment_pending: ["badge-warning", "stPending"], paid_awaiting_group: ["badge-info", "step2"], group_locked: ["badge-success", "step3"],
    revealed: ["badge-success", "step4"], checked_in: ["badge-success", "checkedIn"], completed: ["badge-muted", "stCompleted"],
    cancelled_by_user: ["badge-muted", "stCancelled"], cancelled_by_organizer: ["badge-danger", "stCancelled"], expired: ["badge-muted", "stCancelled"], payment_failed: ["badge-muted", "stCancelled"] };
  const [cls, key] = map[b.status] || ["badge-muted", b.status];
  return `<span class="badge ${cls}">${esc(T(key))}</span>`;
}

function countdown(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? T("inDays", { d, h }) : T("inHours", { h, m });
}

async function scrHome() {
  if (!(await guard())) return;
  loadingView();
  const r = await api("GET", "/api/v1/bookings");
  const bookings = r.ok ? r.data.bookings : [];
  const upcoming = bookings.filter((b) => ACTIVE.includes(b.status)).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const choice = bookings.find((b) => b.status === "cancelled_by_organizer" && new Date(b.starts_at) > new Date(Date.now() - 2 * 86400000));
  const next = upcoming[0];
  const done = bookings.find((b) => b.status === "completed" && b.phase === "completed");
  let hero = "";
  if (next) {
    const steps = ["step1", "step2", "step3", "step4", "step5"];
    const cur = { payment_pending: 0, paid_awaiting_group: 1, group_locked: 2, revealed: 3, checked_in: 4 }[next.status] ?? 1;
    const phaseLine = next.phase === "pending_payment" ? T("stPending") : next.phase === "forming" ? T("stForming", { lock_at: fmtTime(next.lock_at) })
      : next.phase === "locked" ? T("stLocked", { n: next.confirmed_count || "4–6", reveal_at: fmtTime(next.reveal_at) })
      : next.phase === "day_of" ? T("stDayOf") : T("viewDetails");
    hero = `<section class="card card-raised hero stack" aria-labelledby="nexth">
      <div class="row between"><h2 id="nexth">${esc(T("nextEvent"))}</h2>${statusBadge(next)}</div>
      <div><strong>${esc(T(next.experience))} · ${esc(fmtDate(next.starts_at))}</strong><div class="caption">${esc(next.district)} · <span aria-live="off">${esc(countdown(next.starts_at))}</span></div></div>
      <p>${esc(phaseLine)}</p>
      <ol class="stepper">${steps.map((s, i) => `<li class="${i < cur ? "done" : i === cur ? "current" : ""}" ${i === cur ? 'aria-current="step"' : ""}><span class="dot" aria-hidden="true"></span><span>${esc(T(s))}</span></li>`).join("")}</ol>
      <a class="btn btn-primary btn-block" href="${next.status === "payment_pending" ? `#/booking/${next.id}/review` : `#/booking/${next.id}`}">${esc(next.phase === "day_of" ? T("imHere") : T("viewDetails"))}</a>
    </section>`;
  }
  const name = state.me && state.me.display_name;
  view(T("hiAnon"), `
    <h1>${esc(name ? T("hi", { name }) : T("hiAnon"))}</h1>
    ${state.suspended ? `<div class="banner banner-danger" role="alert"><div>${esc(T("suspended"))} <a href="#/cases">${esc(T("casesTitle"))}</a></div></div>` : ""}
    ${choice ? `<div class="banner banner-danger"><div>${esc(T("stOrganizer"))} <a href="#/booking/${choice.id}/choose">${esc(T("chooseNow"))}</a></div></div>` : ""}
    ${done ? `<div class="banner banner-info"><div>${esc(T("stCompleted"))} <a href="#/booking/${done.id}/feedback">${esc(T("rateIt"))}</a></div></div>` : ""}
    ${hero || `<section class="card center"><p>${esc(T("noBookings"))}</p><a class="btn btn-primary" href="#/sessions">${esc(T("bookFirst"))}</a></section>`}
    ${bookings.length > (next ? 1 : 0) ? `<h2>${esc(T("otherBookings"))}</h2><ul class="list">${bookings.filter((b) => b !== next).map((b) => `
      <li><a class="card card-link" href="#/booking/${b.id}"><div class="row between"><span>${esc(T(b.experience))} · ${esc(fmtDate(b.starts_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</span>${statusBadge(b)}</div>
      <span class="caption">${num(b.ref)} · ${esc(b.district)}</span></a></li>`).join("")}</ul>` : ""}
    ${next ? `<a class="btn btn-secondary btn-block" href="#/sessions">${esc(T("bookAnother"))}</a>` : ""}
    <section class="card sunken"><p class="caption">${esc(T("help"))}</p></section>`);
}

// ------------------------------------------------------------------ SCR-07 event details
async function scrDetails(id) {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const r = await api("GET", `/api/v1/bookings/${id}/event-details`);
  if (!r.ok) { view(T("detailsTitle"), `<h1>${esc(T("detailsTitle"))}</h1>${errorBanner(r.data)}`); return; }
  const e = r.data, ph = e.reveal.phase, act = (t) => e.actions.find((a) => a.type === t);
  if (ph === "pending_payment") { go(`#/booking/${id}/review`); return; }
  if (e.resolution) { go(`#/booking/${id}/choose`); return; }
  const acc = e.session.accessibility ? Object.entries(e.session.accessibility).filter(([, v]) => v).map(([k]) => k).join(" · ") : "";
  view(T("detailsTitle"), `
    <div class="row between"><h1>${esc(T("detailsTitle"))}</h1>${statusBadge(e.booking)}</div>
    <p class="caption">${num(e.booking.ref)} · ${esc(countdown(e.session.starts_at))}</p>
    <section class="card"><h2>${esc(T("essentials"))}</h2><dl class="facts">
      <dt>${esc(T("experience"))}</dt><dd>${esc(T(e.session.experience))}</dd>
      <dt>${esc(T("dateTime"))}</dt><dd>${esc(fmtDate(e.session.starts_at))} <span class="caption">(Asia/Qatar)</span></dd>
      <dt>${esc(T("tableLanguage"))}</dt><dd>${esc(T(e.session.conversation_language === "ar" ? "langAr" : "langEn"))}</dd>
      <dt>${esc(T("district"))}</dt><dd>${esc(e.session.district)}</dd>
      <dt>${esc(T("foodBandLabel"))}</dt><dd>${esc(e.session.food_price_band.display)}</dd>
      ${acc ? `<dt>${esc(T("accessibility"))}</dt><dd>${esc(acc)}</dd>` : ""}</dl></section>
    ${e.table ? `<section class="card"><h2>${esc(T("yourTable"))}</h2><p>${esc(T("confirmedCount", { n: e.table.confirmed_count }))}</p><p class="caption">${esc(T("introTip"))}</p>
      ${e.table.members ? `<h3 class="label">${esc(T("tablemates"))}</h3><p>${esc(e.table.members.map((m) => m.display_name || T("unnamed")).join("، "))}</p>` : ""}</section>` : ""}
    ${!e.venue && ["forming", "locked"].includes(ph) ? `<div class="banner banner-info"><div>${esc(T("venueHidden", { reveal_at: fmtDate(e.reveal.reveal_at) }))}</div></div>` : ""}
    ${e.venue ? `<section class="card stack"><h2>${esc(e.venue.name)}</h2><p>${esc(e.venue.address)} · ${esc(e.venue.district)}</p>
      <a class="btn btn-secondary" href="${esc(e.venue.map_url)}" target="_blank" rel="noopener">${esc(T("openMaps"))}</a>
      <div><strong>${esc(T("arrival"))}</strong><p>${esc(e.venue.arrival_instructions)}</p></div>
      <div><span class="label">${esc(T("tableCode"))}</span><div class="table-code">${esc(e.table.code)}</div><p class="caption">${esc(T("mentionCode"))}</p></div>
      <p class="caption">${esc(e.venue.bill_policy)}</p></section>` : ""}
    <div id="msg" role="status"></div>
    ${act("check_in") ? `<button class="btn btn-primary btn-block" id="ci">${esc(T("imHere"))}</button>` : ""}
    ${e.booking.status === "checked_in" ? `<div class="banner banner-success"><div>✓ ${esc(T("checkedIn"))}</div></div>` : ""}
    ${act("feedback") ? `<a class="btn btn-primary btn-block" href="#/booking/${id}/feedback">${esc(T("rateIt"))}</a>` : ""}
    ${e.refund ? `<section class="card"><div class="kv"><span>${esc(T("refundLabel"))}</span><strong>${esc(T({ requested: "rfRequested", processing: "rfProcessing", refunded: "rfRefunded", failed: "rfFailed", none: "rfNone" }[e.refund.status]))}${e.refund.amount ? ` · ${esc(e.refund.amount.display)}` : ""}</strong></div></section>` : ""}
    ${e.rebooked_into ? `<div class="banner banner-success"><div>${esc(T("rebookedInto", { ref: e.rebooked_into.ref }))} <a href="#/booking/${e.rebooked_into.booking_id}">${esc(T("viewDetails"))}</a></div></div>` : ""}
    <section class="card sunken stack"><p class="caption">${esc(T("support"))}</p>
      ${act("report") || ["revealed", "locked", "forming"].includes(ph) ? `<a class="btn btn-secondary" href="#/report/${id}">${esc(T("privateReport"))}</a>` : ""}</section>
    ${act("cancel") ? `<a class="btn btn-danger btn-block" href="#/booking/${id}/cancel">${esc(T("cancelBooking"))}</a>
      <p class="caption">${esc(e.booking.cancellation.refund_if_cancelled_now === "full" ? T("policyBox", { deadline: fmtDate(e.booking.cancellation.full_refund_until) })
        : T("refundNone", { deadline: fmtDate(e.booking.cancellation.full_refund_until) }))}</p>` : ""}`);
  const ci = $("#ci");
  if (ci) ci.onclick = async () => { ci.disabled = true; const c = await api("POST", `/api/v1/bookings/${id}/check-in`); if (c.ok) scrDetails(id); else { $("#msg").innerHTML = errorBanner(c.data); ci.disabled = false; } };
}

// ------------------------------------------------------------------ SCR-08a cancel, SCR-08b organizer choice
async function scrCancel(id) {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const r = await api("GET", `/api/v1/bookings/${id}/event-details`);
  if (!r.ok) { view(T("cancelTitle"), `<h1>${esc(T("cancelTitle"))}</h1>${errorBanner(r.data)}`); return; }
  const e = r.data;
  const fee = e.payment ? e.payment.amount.display : "";
  const outcome = e.reveal.phase === "pending_payment" ? T("refundNoPayment")
    : e.booking.cancellation.refund_if_cancelled_now === "full" ? T("refundFull", { fee, days: 10 }) : T("refundNone", { deadline: fmtDate(e.booking.cancellation.full_refund_until) });
  view(T("cancelTitle"), `
    <h1>${esc(T("cancelTitle"))}</h1>
    <section class="card"><strong>${esc(fmtDate(e.session.starts_at))}</strong><div class="caption">${esc(e.session.district)}</div></section>
    <div class="banner ${e.booking.cancellation.refund_if_cancelled_now === "full" ? "banner-info" : "banner-warning"}"><div>${esc(outcome)}</div></div>
    <form id="f" class="stack">
      <fieldset><legend class="label">${esc(T("reasonLegend"))}</legend><div class="options">
        ${[["schedule_changed", "rScheduled"], ["illness", "rIll"], ["other", "rOther"]].map(([v, k]) => `<label class="option radio"><input type="radio" name="r" value="${v}"><span class="tick" aria-hidden="true"></span><span>${esc(T(k))}</span></label>`).join("")}
      </div></fieldset>
      <div id="err" role="alert"></div>
      <button class="btn btn-danger btn-block" type="submit" id="go" ${e.booking.cancellation.can_cancel ? "" : "disabled"}>${esc(T("confirmCancel"))}</button>
      <a class="btn btn-ghost btn-block" href="#/booking/${id}">${esc(T("back"))}</a>
    </form>`);
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    $("#go").disabled = true;
    const sel = $$("input[name=r]:checked")[0];
    const c = await api("POST", `/api/v1/bookings/${id}/cancel`, sel ? { reason_code: sel.value } : {});
    if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); $("#go").disabled = false; return; }
    const rf = c.data.refund;
    view(T("cancelled"), `<div class="center"><h1>${esc(T("cancelled"))}</h1>
      ${rf.eligible ? `<section class="card"><div class="kv"><span>${esc(rf.amount.display)}</span><strong>${esc(T({ requested: "rfRequested", processing: "rfProcessing", refunded: "rfRefunded", failed: "rfFailed", none: "rfNone" }[rf.status]))}</strong></div></section>` : ""}
      <a class="btn btn-primary" href="#/home">${esc(T("backHome"))}</a></div>`);
  };
}

async function scrChoose(id) {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const r = await api("GET", `/api/v1/bookings/${id}/event-details`);
  if (!r.ok) { view(T("orgTitle"), `<h1>${esc(T("orgTitle"))}</h1>${errorBanner(r.data)}`); return; }
  const e = r.data;
  if (!e.resolution) { go(`#/booking/${id}`); return; }
  const rb = e.resolution.options.find((o) => o.type === "rebook");
  const rf = e.resolution.options.find((o) => o.type === "refund");
  view(T("orgTitle"), `
    <h1>${esc(T("orgTitle"))}</h1>
    <p>${esc(T("orgBody"))}</p>
    <form id="f" class="stack">
      <fieldset><legend class="label">${esc(T("chooseNow"))}</legend><div class="options">
        ${rb.sessions.map((s) => `<label class="option radio" style="align-items:flex-start"><input type="radio" name="c" value="rebook:${s.session_id}"><span class="tick" aria-hidden="true"></span>
          <span><strong>${esc(T("optRebook"))}: ${esc(fmtDate(s.starts_at))}</strong><br><span class="caption">${esc(s.district)} · ${esc(T("seatsLeft", { n: s.seats_left }))} · ${esc(T("optRebookHelp"))}${s.is_alternate ? ` · ${esc(T("alternateTag"))}` : ""}</span></span></label>`).join("")}
        <label class="option radio" style="align-items:flex-start"><input type="radio" name="c" value="refund"><span class="tick" aria-hidden="true"></span>
          <span><strong>${esc(T("optRefund"))}</strong><br><span class="caption">${esc(T("optRefundHelp", { fee: rf.amount.display, days: 10 }))}</span></span></label>
      </div></fieldset>
      <p class="caption">${esc(T("defaultRefund", { deadline: fmtDate(e.resolution.choice_deadline) }))}</p>
      <div id="err" role="alert"></div>
      <button class="btn btn-primary btn-block" type="submit" id="go">${esc(T("confirmChoice"))}</button>
    </form>`);
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    const sel = $$("input[name=c]:checked")[0];
    if (!sel) return;
    $("#go").disabled = true;
    const body = sel.value === "refund" ? { choice: "refund" } : { choice: "rebook", session_id: sel.value.split(":")[1] };
    const c = await api("POST", `/api/v1/bookings/${id}/resolution`, body);
    if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); $("#go").disabled = false; return; }
    if (c.data.booking) go(`#/booking/${c.data.booking.id}`); else go(`#/booking/${id}`);
  };
}

// ------------------------------------------------------------------ SCR-09 feedback
async function scrFeedback(id) {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const [r, q] = await Promise.all([api("GET", `/api/v1/bookings/${id}/event-details`), loadQuestionnaire().catch(() => null)]);
  if (!r.ok) { view(T("fbTitle"), `<h1>${esc(T("fbTitle"))}</h1>${errorBanner(r.data)}`); return; }
  const e = r.data;
  const q08 = q && q.questions.find((x) => x.key === "Q08");
  const mutualOpt = q08 && q08.options.find((o) => o.key === "mutual_consent");
  const contacts = !!(mutualOpt && state.qAnswers[q08.id] && state.qAnswers[q08.id].has(mutualOpt.id));
  const stars = (name, label, required) => `<fieldset><legend class="label">${esc(label)}</legend><div class="stars">
    ${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="${name}" value="${v}" ${required ? "required" : ""}><span>${v}</span><span class="sr-only">/ 5</span></label>`).join("")}</div></fieldset>`;
  view(T("fbTitle"), `
    <h1>${esc(T("fbTitle"))}</h1>
    <form id="f" class="stack" novalidate>
      ${stars("overall", T("overall"), true)}${stars("comfort", T("comfort"), true)}${stars("venue", T("venueRating"), false)}
      <label class="check"><input type="checkbox" id="again"><span>${esc(T("wouldBookAgain"))}</span></label>
      <div class="field"><label class="label" for="cm">${esc(T("commentLabel"))}</label><textarea class="input" id="cm" maxlength="500" aria-describedby="cmh"></textarea><span id="cmh" class="caption">${esc(T("commentHelp"))}</span></div>
      ${contacts && e.table && e.table.members && e.table.members.length ? `<fieldset class="card"><legend class="label">${esc(T("contactLegend"))}</legend><p class="caption">${esc(T("contactHelp"))}</p>
        ${e.table.members.map((m, i) => `<div class="row between" style="padding:8px 0"><span>${esc(m.display_name || T("unnamed"))}</span>
          <span class="segmented" role="radiogroup" aria-label="${esc(m.display_name || T("unnamed"))}">
            <label class="option radio" style="min-height:40px"><input type="radio" name="m${i}" value="yes" data-seat="${esc(m.seat)}"><span class="tick" aria-hidden="true"></span><span>${esc(T("wantContact"))}</span></label>
            <label class="option radio" style="min-height:40px"><input type="radio" name="m${i}" value="no" data-seat="${esc(m.seat)}" checked><span class="tick" aria-hidden="true"></span><span>${esc(T("noContact"))}</span></label></span></div>`).join("")}</fieldset>` : ""}
      <div id="err" role="alert"></div>
      <button class="btn btn-primary btn-block" type="submit" id="go">${esc(T("send"))}</button>
    </form>
    <a class="btn btn-ghost btn-block" href="#/report/${id}">${esc(T("reportSeparate"))}</a>`);
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    const val = (n) => { const x = $$(`input[name=${n}]:checked`)[0]; return x ? Number(x.value) : null; };
    const connections = $$("input[value=yes], input[value=no]").filter((x) => x.checked && x.dataset.seat).map((x) => ({ seat: x.dataset.seat, choice: x.value === "yes" }));
    const c = await api("POST", `/api/v1/bookings/${id}/feedback`, { overall_rating: val("overall"), comfort_rating: val("comfort"), venue_rating: val("venue"),
      would_book_again: $("#again").checked, comment: $("#cm").value.trim() || null, connections });
    if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); return; }
    view(T("fbThanks"), `<div class="center"><div class="success-check" aria-hidden="true">✓</div><h1>${esc(T("fbThanks"))}</h1>
      ${c.data.mutual.length ? `<p>${esc(T("mutualWith", { names: c.data.mutual.join("، ") }))}</p>` : ""}
      <a class="btn btn-primary" href="#/sessions">${esc(T("bookAnother"))}</a></div>`);
  };
}

// ------------------------------------------------------------------ SCR-10 private report + 999 screen
function emergencyScreen(onContinue) {
  const el = document.createElement("div");
  el.className = "emergency";
  el.setAttribute("role", "alertdialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "emh");
  el.innerHTML = `<div class="inner"><h1 id="emh">${esc(T("emTitle"))}</h1><p>${esc(T("emBody"))}</p>
    <a class="call" href="tel:999">📞 ${esc(T("emCall"))}</a><button class="btn btn-block" id="emc">${esc(T("emContinue"))}</button></div>`;
  document.body.appendChild(el);
  el.querySelector("a.call").focus();
  el.querySelector("#emc").onclick = () => { el.remove(); onContinue && onContinue(); };
}

async function scrReport(id) {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const r = await api("GET", `/api/v1/bookings/${id}/event-details`);
  const members = r.ok && r.data.table && r.data.table.members ? r.data.table.members : [];
  const ph = r.ok ? r.data.reveal.phase : "completed";
  const cats = [["harassment", "cHarassment"], ["threat_violence", "cThreat"], ["photo_without_consent", "cPhoto"], ["stalking_unwanted_contact", "cStalking"], ["fraud", "cFraud"], ["disruptive", "cDisruptive"]];
  view(T("reportTitle"), `
    <h1>${esc(T("reportTitle"))}</h1>
    <p class="muted">${esc(T("reportIntro"))}</p>
    <form id="f" class="stack" novalidate>
      <label class="option" style="border-color:var(--c-danger)"><input type="checkbox" id="danger"><span class="tick" aria-hidden="true"></span><strong>${esc(T("dangerLabel"))}</strong></label>
      <fieldset><legend class="label">${esc(T("category"))}</legend><div class="options">
        ${cats.map(([v, k]) => `<label class="option radio"><input type="radio" name="cat" value="${v}" required><span class="tick" aria-hidden="true"></span><span>${esc(T(k))}</span></label>`).join("")}</div></fieldset>
      <fieldset><legend class="label">${esc(T("whenLegend"))}</legend><div class="options">
        <label class="option radio"><input type="radio" name="when" value="during" ${ph === "day_of" ? "checked" : ""}><span class="tick" aria-hidden="true"></span><span>${esc(T("during"))}</span></label>
        <label class="option radio"><input type="radio" name="when" value="after" ${ph !== "day_of" ? "checked" : ""}><span class="tick" aria-hidden="true"></span><span>${esc(T("afterEv"))}</span></label></div></fieldset>
      ${members.length ? `<div class="field"><label class="label" for="who">${esc(T("whoLegend"))}</label><select class="input" id="who"><option value="">${esc(T("notSure"))}</option>
        ${members.map((m) => `<option value="${esc(m.seat)}">${esc(m.display_name || T("unnamed"))}</option>`).join("")}</select></div>` : ""}
      <div class="field"><label class="label" for="d">${esc(T("describe"))}</label><textarea class="input" id="d" maxlength="2000"></textarea></div>
      <div id="err" role="alert"></div>
      <button class="btn btn-danger-solid btn-block" type="submit" id="go">${esc(T("submitReport"))}</button>
    </form>`);
  $("#danger").onchange = () => { if ($("#danger").checked) emergencyScreen(() => $("#danger").focus()); };
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    const cat = $$("input[name=cat]:checked")[0];
    if (!cat) { $("#err").innerHTML = errorBanner({ message: T("category") }); return; }
    $("#go").disabled = true;
    const who = $("#who");
    const c = await api("POST", "/api/v1/reports", { booking_id: id, category: cat.value, timing: $$("input[name=when]:checked")[0].value,
      immediate_danger: $("#danger").checked, reported_seat: who && who.value ? who.value : undefined, description: $("#d").value.trim() || undefined });
    if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); $("#go").disabled = false; return; }
    const done = () => view(T("reportTitle"), `<div class="center"><div class="success-check" aria-hidden="true">✓</div><h1>${esc(T("reportSent", { case: c.data.case_ref }))}</h1><a class="btn btn-primary" href="#/home">${esc(T("backHome"))}</a></div>`);
    if (c.data.emergency && c.data.emergency.show) { done(); emergencyScreen(); } else done();
  };
}

// ------------------------------------------------------------------ inbox, profile, cases
async function scrInbox() {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const r = await api("GET", "/api/v1/notifications");
  const list = r.ok ? r.data.notifications : [];
  view(T("inbox"), `<h1>${esc(T("inbox"))}</h1>${list.length ? `<ul class="list">${list.map((n) => `
    <li class="card"><p>${esc(n.text)}</p><div class="row between"><span class="caption">${esc(fmtDate(n.created_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</span>
    ${n.booking_id ? `<a href="#/booking/${n.booking_id}">${esc(T("viewDetails"))}</a>` : ""}</div></li>`).join("")}</ul>` : `<p class="muted">${esc(T("noNotifications"))}</p>`}`);
}

async function scrProfile() {
  if (!(await guard({ needQuestionnaire: false }))) return;
  const me = state.me;
  view(T("profile"), `
    <h1>${esc(T("profile"))}</h1>
    <section class="card"><div class="kv"><span>${esc(T("nameLabel").split("(")[0])}</span><strong>${esc(me.display_name || "—")}</strong></div>
      <div class="kv"><span>${esc(T("language"))}</span><button class="btn btn-ghost" id="lng">${esc(T("langToggle"))}</button></div></section>
    <ul class="list">
      <li><a class="card card-link" href="#/summary">${esc(T("myAnswers"))}</a></li>
      <li><a class="card card-link" href="#/cases">${esc(T("casesTitle"))}</a></li>
    </ul>
    <button class="btn btn-secondary btn-block" id="out">${esc(T("signOut"))}</button>
    <button class="btn btn-danger btn-block" id="del">${esc(T("deleteAccount"))}</button>`);
  $("#lng").onclick = () => setLocale(locale === "ar" ? "en" : "ar");
  $("#out").onclick = async () => { const t = store.get("tokens"); await api("POST", "/api/v1/auth/logout", { refresh_token: t && t.refresh_token }); store.del("tokens"); state.me = null; state.q = null; state.qAnswers = null; renderTopbar(); go("#/welcome"); };
  $("#del").onclick = async () => { if (!confirm(T("deleteConfirm"))) return; await api("DELETE", "/api/v1/users/me"); store.del("tokens"); renderTopbar(); go("#/welcome"); };
}

async function scrCases() {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const r = await api("GET", "/api/v1/cases/mine");
  const cases = r.ok ? r.data.cases : [];
  view(T("casesTitle"), `<h1>${esc(T("casesTitle"))}</h1>${cases.length ? `<ul class="list">${cases.map((c) => `
    <li class="card stack"><div class="row between"><strong>${num(c.case_ref)}</strong><span class="badge badge-warning">${esc(c.decision)}</span></div>
    <p class="caption">${esc(fmtDate(c.event_date))} · ${esc(c.category)}</p>
    ${c.can_appeal ? `<p class="caption">${esc(T("appealUntil", { date: fmtDate(c.appeal_until) }))}</p><button class="btn btn-secondary" data-ref="${esc(c.case_ref)}">${esc(T("appeal"))}</button>` : ""}</li>`).join("")}</ul>`
    : `<p class="muted">—</p>`}<div id="msg" role="status"></div>`);
  $$("[data-ref]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const a = await api("POST", `/api/v1/cases/${encodeURIComponent(b.dataset.ref)}/appeal`);
    $("#msg").innerHTML = a.ok ? `<div class="banner banner-success"><div>${esc(T("appealSent"))}</div></div>` : errorBanner(a.data);
  }));
}

// ------------------------------------------------------------------ router
const ROUTES = [
  [/^#\/welcome$/, scrWelcome], [/^#\/signin$/, scrPhone], [/^#\/otp$/, scrOtp], [/^#\/register$/, scrRegister],
  [/^#\/questions\/(\d+)$/, scrQuestions], [/^#\/summary$/, scrSummary], [/^#\/sessions$/, scrSessions],
  [/^#\/booking\/([\w-]+)\/review$/, scrReview], [/^#\/pay\/return\/([\w-]+)$/, scrPayReturn], [/^#\/home$/, scrHome],
  [/^#\/booking\/([\w-]+)\/cancel$/, scrCancel], [/^#\/booking\/([\w-]+)\/choose$/, scrChoose], [/^#\/booking\/([\w-]+)\/feedback$/, scrFeedback],
  [/^#\/booking\/([\w-]+)$/, scrDetails], [/^#\/report\/([\w-]+)$/, scrReport], [/^#\/inbox$/, scrInbox], [/^#\/profile$/, scrProfile], [/^#\/cases$/, scrCases],
];

async function route() {
  clearTimers();
  const hash = location.hash || (store.get("tokens") ? "#/home" : "#/welcome");
  for (const [re, fn] of ROUTES) {
    const m = re.exec(hash);
    if (m) {
      try { await fn(...m.slice(1)); } catch (e) { view(T("errGeneric"), `<h1>${esc(T("errGeneric"))}</h1>${errorBanner(e)}`); }
      return;
    }
  }
  go(store.get("tokens") ? "#/home" : "#/welcome");
}

window.addEventListener("hashchange", route);
document.documentElement.lang = locale;
document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
document.querySelector(".skip").textContent = T("skip");
renderTopbar();
route();
