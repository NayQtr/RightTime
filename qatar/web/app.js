// HerZone user web app — SCR-01 … SCR-10 (v0.3 §1). Vanilla ES modules, hash router, RTL-first.
import { STRINGS } from "./strings.js";
import { INTERSTITIALS, QUIZ_STORE_KEY, buildSteps, firstOpenStep, toPayload, vibeOf, energyOf } from "./quiz-flow.js";
import { icon } from "./icons.js";
import { DEFAULT_PLAN, GUARANTEE_DAYS, PLANS, planPrices } from "./plans.js";
import { brandMark, tableSvg, vibeTable } from "./motif.js";

const CFG = Object.assign({ apiBase: "", staging: true }, window.QATAR_CONFIG || {});
// Supabase runs the function next to the database when apiRegion is set (forceFunctionRegion: no extra CORS header needed).
const apiUrl = (path) => CFG.apiBase + path + (CFG.apiRegion ? `${path.includes("?") ? "&" : "?"}forceFunctionRegion=${CFG.apiRegion}` : "");
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("q_" + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("q_" + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem("q_" + k); } catch { /* private mode */ } },
};
// Survives a reload of the tab but not closing it: the pending OTP challenge (valid for minutes only).
const tabStore = {
  get(k) { try { return JSON.parse(sessionStorage.getItem("q_" + k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem("q_" + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { sessionStorage.removeItem("q_" + k); } catch { /* private mode */ } },
};
// Progress kept on this device before sign-up (privacy notice §3): answers, last step, first name, phone.
const DEVICE_PROGRESS = [QUIZ_STORE_KEY, "quizName", "phone", "resume"];
function clearDeviceProgress() { DEVICE_PROGRESS.forEach((k) => store.del(k)); tabStore.del("challenge"); }
let locale = store.get("locale") || "ar";
const state = { me: null, q: null, qAnswers: null, quiz: null, phone: null, challenge: null, timers: [] };
const main = document.getElementById("main");
// Widths computed at render (the quiz progress bar) are set through the CSSOM, which the CSP allows, instead of style
// attributes, which it would block without 'unsafe-inline' (NMX-31).
new MutationObserver(() => main.querySelectorAll("[data-w]").forEach((e) => { e.style.width = `${Number(e.dataset.w) || 0}%`; }))
  .observe(main, { childList: true, subtree: true });

// ------------------------------------------------------------------ helpers
const T = (k, vars = {}) => String(STRINGS[locale][k] ?? STRINGS.ar[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (vars[n] ?? `{${n}}`));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (s) => `<bdi class="num">${esc(s)}</bdi>`;
// a numeric range such as "18–24" is reordered to "24–18" inside Arabic text; keep it left to right
const optLabel = (s) => (/^\d+\s*[–-]\s*\d+$/.test(s) ? `<bdi dir="ltr">${esc(s)}</bdi>` : esc(s));
const intlLocale = () => (locale === "ar" ? "ar-QA-u-nu-latn" : "en-GB");
// The time and its "م" / "PM" never split across lines (no-break space), as in the app.
const fmtDate = (iso, opts = { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) =>
  iso ? new Intl.DateTimeFormat(intlLocale(), { timeZone: "Asia/Qatar", ...opts }).format(new Date(iso)).replace(/(\d)[ \u202F](م|ص|AM|PM)/g, "$1\u00A0$2") : "";
const fmtTime = (iso) => fmtDate(iso, { weekday: "short", hour: "numeric", minute: "2-digit" });
const $ = (sel, root = main) => root.querySelector(sel);
const $$ = (sel, root = main) => [...root.querySelectorAll(sel)];
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function clearTimers() { state.timers.forEach((t) => clearInterval(t)); state.timers = []; }
function every(ms, fn) { const t = setInterval(fn, ms); state.timers.push(t); return t; }

// Toasts hide after 4 s and can be dismissed by tapping so they never keep covering content. A toast survives the one
// navigation that usually follows the action it confirms (e.g. quiz -> what you get), and is cleared on the next.
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.onclick = () => { clearTimeout(toast.t); el.textContent = ""; };
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.textContent = ""; }, 4000);
  toast.navs = 1;
}
function toastOnNavigate() {
  if (toast.navs > 0) { toast.navs--; return; }
  clearTimeout(toast.t);
  document.getElementById("toast").textContent = "";
}

// Direction of the last navigation: quiz steps enter from the reading direction going forward and from the other
// side going back (the same path in reverse); every other screen fades in. Set by route().
let navDir = "fade", lastHash = null;
const ENTER = ["enter-forward", "enter-back", "enter-fade"];

function view(title, html) {
  main.inert = false;
  main.removeAttribute("aria-busy");
  main.innerHTML = html;
  main.classList.remove(...ENTER);
  void main.offsetWidth; // restart the entrance animation
  main.classList.add(`enter-${navDir}`);
  document.title = `${title} · ${T("brand")}`;
  const h = main.querySelector("h1");
  if (h) { h.tabIndex = -1; h.focus({ preventScroll: false }); }
  window.scrollTo(0, 0);
}

function errorBanner(err) {
  const msg = (err && err.message) || T("errGeneric");
  return `<div class="banner banner-danger" role="alert"><span class="icon">${icon("triangle-alert")}</span><div>${esc(msg)}</div></div>`;
}

function loadingView() { main.innerHTML = `<div class="center" aria-busy="true"><div class="spinner" role="img" aria-label="${esc(T("loading"))}"></div></div>`; }

// ------------------------------------------------------------------ session (NMX-17, MASVS-STORAGE/AUTH)
// The access token lives in memory only; storage keeps just the refresh token, which the server rotates on every use and
// revokes on sign-out (the access token then stops working at once). Refreshes run one at a time across tabs (Web Locks),
// so two tabs never present the same refresh token, which the server would treat as theft and end the session.
let accessToken = null;
let refreshing = null;
const session = {
  save(t) { accessToken = t.access_token; store.set("tokens", { refresh_token: t.refresh_token }); },
  clear() { accessToken = null; store.del("tokens"); store.del("trips"); store.del("inboxSeen"); },
};
// Upcoming bookings kept on this device so the venue, arrival notes and table code open without a connection (NMX-16).
// Only the member's own event details, only until the meetup is over; removed on sign-out.
const trips = {
  all() {
    const t = store.get("trips") || {};
    const live = Object.entries(t).filter(([, v]) => v && v.data && new Date(v.data.session.starts_at).getTime() > Date.now() - 6 * 3600000);
    return Object.fromEntries(live);
  },
  save(id, data) {
    const t = this.all();
    if (["cancelled", "completed"].includes(data.reveal.phase)) delete t[id]; else t[id] = { saved_at: new Date().toISOString(), data };
    const keep = Object.entries(t).sort((a, b) => new Date(a[1].data.session.starts_at) - new Date(b[1].data.session.starts_at)).slice(0, 5);
    store.set("trips", Object.fromEntries(keep));
  },
  get(id) { return this.all()[id] || null; },
};
function refreshAccess() {
  if (refreshing) return refreshing;
  const run = async () => {
    const tok = store.get("tokens");
    if (!tok || !tok.refresh_token) return "signed_out";
    const r = await fetch(apiUrl("/api/v1/auth/token:refresh"), { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tok.refresh_token }) }).catch(() => null);
    if (r && r.ok) { session.save(await r.json()); return "ok"; }
    // only the server saying the session is over signs the member out; no network or a server error keeps her signed in
    if (r && r.status === 401) { session.clear(); return "signed_out"; }
    return "offline";
  };
  const locked = navigator.locks && navigator.locks.request ? () => navigator.locks.request("hz-refresh", run) : run;
  refreshing = locked().finally(() => { refreshing = null; });
  return refreshing;
}

// ------------------------------------------------------------------ API client (bearer token, Idempotency-Key, refresh rotation)
async function api(method, path, body, opts = {}) {
  const headers = { "Accept-Language": locale };
  const tok = store.get("tokens");
  if (tok && !opts.noAuth && !accessToken && (await refreshAccess()) === "offline")
    return { ok: false, status: 0, data: { code: "OFFLINE", message: T("offline") } };
  if (accessToken && !opts.noAuth) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["Idempotency-Key"] = opts.idem || uuid();
  // One automatic retry on a dropped connection (and on a gateway error for reads). The retry reuses the same
  // Idempotency-Key, so a write the server already applied is replayed, never done twice.
  const send = () => fetch(apiUrl(path), { method, headers, keepalive: !!opts.keepalive, body: body === undefined ? undefined : JSON.stringify(body) });
  const pause = () => new Promise((r) => setTimeout(r, 1200));
  let res;
  try {
    res = await send();
  } catch {
    await pause();
    try { res = await send(); } catch { return { ok: false, status: 0, data: { code: "OFFLINE", message: T("offline") } }; }
  }
  if (method === "GET" && [502, 503, 504].includes(res.status)) { await pause(); res = await send().catch(() => res); }
  if (res.status === 401 && tok && tok.refresh_token && !opts.retried && !opts.noAuth) {
    accessToken = null;
    const again = await refreshAccess();
    if (again === "ok") return api(method, path, body, { ...opts, retried: true });
    if (again === "offline") return { ok: false, status: 0, data: { code: "OFFLINE", message: T("offline") } };
    session.clear();
    go("#/welcome");
  }
  if (res.status >= 500 && window.hzMonitor) window.hzMonitor.report(new Error(`API ${res.status} ${method} ${path.split("?")[0]}`), { request_id: res.headers.get("x-request-id") || "" });
  const text = res.status === 304 ? "" : await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  // the server is still running an earlier attempt with this key: wait and ask again (it replays the stored answer)
  if (res.status === 409 && data && data.code === "IDEMPOTENCY_IN_PROGRESS" && (opts.waits || 0) < 3) {
    await new Promise((r) => setTimeout(r, 2000));
    return api(method, path, body, { ...opts, idem: headers["Idempotency-Key"], waits: (opts.waits || 0) + 1 });
  }
  if (res.status === 403 && data && data.code === "ACCOUNT_SUSPENDED") state.suspended = true;
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

// ------------------------------------------------------------------ shell
function renderTopbar() {
  const signedIn = !!store.get("tokens");
  document.getElementById("topbar").innerHTML = `
    <a class="brand" href="${signedIn ? "#/home" : "#/welcome"}">${brandMark()}<span>${esc(T("brand"))}</span></a>
    ${CFG.staging ? `<span class="env-badge">${esc(T("staging"))}</span>` : ""}
    <span class="spacer"></span>
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
  state.quiz = null;
  renderTopbar();
  route();
}

// The signed-in user is cached per access token for 60 s (audit F7): every screen's guard used to refetch it.
// The server still enforces status and registration on every call, so a short cache cannot widen access.
async function loadMe(force = false) {
  const tok = accessToken;
  if (!force && tok && state.me && state.meToken === tok && Date.now() - state.meAt < 60000) return state.me;
  const r = await api("GET", "/api/v1/users/me");
  state.meOffline = r.status === 0;
  if (!r.ok) return null;
  state.me = r.data.user;
  state.meToken = accessToken;
  state.meAt = Date.now();
  syncPush().catch(() => {});
  return state.me;
}

async function loadQuestionnaire(force = false) {
  if (state.q && !force) return state.q;
  const r = await api("GET", "/api/v1/questionnaires/current");
  if (!r.ok) throw r.data;
  state.q = r.data;
  const src = r.data.submitted || r.data.draft;
  if (!state.qAnswers || force) {
    state.qAnswers = {};
    for (const a of (src ? src.answers : [])) state.qAnswers[a.question_id] = new Set(a.option_ids);
  }
  return state.q;
}

// Step where a signed-in user picks the quiz up again: first unanswered question of their draft / carried answers.
function resumeStepFor(q) {
  const src = q.draft || q.submitted || q.carried;
  const answers = Object.fromEntries((src ? src.answers : []).map((a) => [a.question_id, a.option_ids]));
  return firstOpenStep(buildSteps(q.questions), q.questions, answers);
}

// gate: signed in -> registered -> questionnaire submitted
async function guard({ needQuestionnaire = true, offlineOk = false } = {}) {
  if (!store.get("tokens")) { go("#/welcome"); return false; }
  const me = await loadMe();
  // no connection: say so and offer a retry, never send a signed-in member to the welcome screen (which would bounce back)
  if (!me && state.meOffline) {
    if (offlineOk) return "offline";
    const saved = Object.entries(trips.all());
    main.innerHTML = `<div class="stack">${errorBanner({ message: T("offline") })}<button class="btn btn-secondary" id="retry-me">${esc(T("retry"))}</button>
      ${saved.length ? `<h2>${esc(T("savedTrips"))}</h2><ul class="list">${saved.map(([id, v]) => `<li><a class="card card-link" href="#/booking/${esc(id)}">
        ${esc(T(v.data.session.experience))} · ${esc(fmtDate(v.data.session.starts_at, { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</a></li>`).join("")}</ul>` : ""}</div>`;
    $("#retry-me").onclick = () => route();
    return false;
  }
  if (!me) { go("#/welcome"); return false; }
  if (me.status === "suspended" || me.status === "banned") { state.suspended = true; }
  if (me.registration_status !== "complete") { go("#/register"); return false; }
  if (needQuestionnaire && !state.suspended) {
    const q = await loadQuestionnaire().catch(() => null);
    if (q && !q.submitted && !q.has_submitted_any) { go(`#/quiz/${q.draft ? resumeStepFor(q) : 0}`); return false; }
  }
  return true;
}

// ------------------------------------------------------------------ welcome (spec 2026-10-28 §3)
function scrWelcome() {
  if (store.get("tokens")) { go("#/home"); return; }
  const saved = store.get(QUIZ_STORE_KEY);
  const resume = store.get("resume");
  const answered = saved ? Object.values(saved.answers || {}).filter((a) => a && a.length).length : 0;
  const canResume = Boolean(resume && /^#\/(quiz\/\d+|name|signin|otp)$/.test(resume) && (answered || store.get("quizName")));
  view(T("welcomeHeroPlain"), `
    <section class="hero-welcome">
      <h1>${esc(T("welcomeHero")).replace("{em}", `<em>${esc(T("welcomeHeroEm"))}</em>`)}</h1>
      <p>${esc(T("welcomeSub"))}</p>
      <div class="welcome-table">${tableSvg({ seats: 6, filled: 4 })}</div>
      ${canResume ? `<div class="resume-card stack" id="resume-card"><p><strong>${esc(T("resumeTitle"))}</strong></p><p class="caption">${esc(T("resumeBody", { n: answered }))}</p>
        <a class="btn btn-primary btn-block" id="resume" href="${esc(resume)}">${esc(T("resumeCta"))}</a>
        <button class="link-btn" type="button" id="over">${esc(T("startOver"))}</button></div>` : ""}
      <div class="stack">
        ${canResume ? "" : `<a class="btn btn-primary btn-block" id="start" href="#/quiz/0">${esc(T("getStarted"))}</a>
        <p class="caption quiz-length">${esc(T("quizLength"))}</p>`}
        <a class="btn btn-secondary btn-block" href="#/signin">${esc(T("haveAccount"))}</a>
      </div>
      <p class="caption device-note">${esc(T("deviceNote"))}</p>
    </section>`);
  if (canResume) $("#over").onclick = () => { clearDeviceProgress(); state.quiz = null; go("#/quiz/0"); };
}

// ------------------------------------------------------------------ SCR-02a phone, 02b OTP, 02c registration
function scrPhone() {
  if (!signedIn()) store.set("resume", "#/signin");
  if (!state.phone && store.get("phone")) state.phone = store.get("phone");
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
    if (store.get(QUIZ_STORE_KEY) || store.get("quizName")) store.set("phone", state.phone);
    tabStore.set("challenge", { ch: r.data, phone: state.phone, until: Date.now() + r.data.expires_in * 1000 });
    go("#/otp");
  };
}

function scrOtp() {
  const kept = tabStore.get("challenge");
  if (!state.challenge && kept && kept.until > Date.now()) { state.challenge = kept.ch; state.phone = kept.phone; }
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
    session.save(r.data);
    state.challenge = null;
    tabStore.del("challenge");
    renderTopbar();
    if (r.data.user.registration_status !== "complete") go("#/register");
    else if (store.get(QUIZ_STORE_KEY)) await finishQuiz();
    else { clearDeviceProgress(); go("#/home"); }
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
      <details><summary class="caption">${esc(T("readDoc"))}</summary><p class="caption">${esc(L[type].text)}</p></details></span></label>` : "";
  const quizName = store.get("quizName");
  view(T("regTitle"), `
    <h1>${esc(T("regTitle"))}</h1>
    <form id="f" class="stack" novalidate>
      ${quizName ? "" : `<div class="field"><label class="label" for="name">${esc(T("nameLabel"))}</label>
        <input class="input" id="name" maxlength="30" autocomplete="given-name" aria-describedby="nh"><span id="nh" class="caption">${esc(T("nameHelp"))}</span></div>`}
      <fieldset class="card">
        <p class="caption">${esc(T("womenOnly"))}</p>
        <label class="check"><input type="checkbox" id="woman" required><span>${esc(T("womanLabel"))} <span class="caption">(${esc(T("required"))})</span></span></label>
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
      display_name: quizName || ($("#name") ? $("#name").value.trim() : "") || null, locale, age_eligibility_confirmed: $("#age").checked, woman_confirmed: $("#woman").checked,
      consents: Object.keys(L).filter((t) => ["terms", "conduct", "privacy_notice", "marketing"].includes(t))
        .map((t) => ({ type: t, document_version: L[t].document_version, granted: checked.has(t) })),
    };
    $("#go").disabled = true;
    const r = await api("POST", "/api/v1/users/me/registration", body);
    $("#go").disabled = false;
    if (!r.ok) { $("#err").innerHTML = errorBanner(r.data); return; }
    state.me = r.data.user;
    store.del("quizName");
    if (store.get(QUIZ_STORE_KEY)) await finishQuiz();
    else go("#/quiz/0");
  };
}

// ------------------------------------------------------------------ quiz-first questionnaire (spec 2026-10-28 §3–§5)
const signedIn = () => Boolean(store.get("tokens"));
const arrowBack = () => (locale === "ar" ? "→" : "←");

// Signed out: the public preview plus answers kept on this device. Signed in: the user's own answers
// (draft, submitted, or carried over from an older version), with newer answers from this device on top.
async function loadQuiz() {
  if (state.quiz && state.quiz.locale === locale && state.quiz.signedIn === signedIn()) return state.quiz;
  let q;
  let answers = {};
  if (signedIn()) {
    q = await loadQuestionnaire(true);
    const src = q.draft || q.submitted || q.carried;
    for (const a of (src ? src.answers : [])) answers[a.question_id] = [...a.option_ids];
  } else {
    const r = await api("GET", "/api/v1/questionnaires/preview", undefined, { noAuth: true });
    if (!r.ok) throw r.data;
    q = r.data;
  }
  const saved = store.get(QUIZ_STORE_KEY);
  if (saved && saved.version_id === q.questionnaire_version_id) answers = { ...answers, ...saved.answers };
  state.quiz = { q, answers, steps: buildSteps(q.questions), locale, signedIn: signedIn() };
  return state.quiz;
}

function saveQuizLocal() {
  store.set(QUIZ_STORE_KEY, { version_id: state.quiz.q.questionnaire_version_id, answers: state.quiz.answers });
}

// Signed in: answers are also saved as a server draft (debounced), so the user can continue on any device.
function saveDraftSoon(delay = 700) {
  clearTimeout(saveDraftSoon.t);
  saveDraftSoon.t = setTimeout(flushDraft, delay);
}
function flushDraft(keepalive = false) {
  if (!saveDraftSoon.t) return;
  clearTimeout(saveDraftSoon.t);
  saveDraftSoon.t = null;
  const quiz = state.quiz;
  if (!quiz || !signedIn()) return;
  saveDraftSoon.inflight = api("POST", "/api/v1/questionnaire-responses", { questionnaire_version_id: quiz.q.questionnaire_version_id, status: "draft", answers: toPayload(quiz.answers) }, { keepalive })
    .finally(() => { saveDraftSoon.inflight = null; });
}
document.addEventListener("visibilitychange", () => { if (document.hidden) flushDraft(true); });

function answersByKey() {
  const out = {};
  for (const qq of state.quiz.q.questions) {
    out[qq.key] = (state.quiz.answers[qq.id] || []).map((id) => (qq.options.find((o) => o.id === id) || {}).key).filter(Boolean);
  }
  return out;
}

// Step index of a question key in the quiz (used by "edit your languages" links); first question when absent.
function stepOfKey(key) {
  const i = state.q ? buildSteps(state.q.questions).findIndex((s) => s.kind === "q" && s.key === key) : -1;
  return i >= 0 ? i : INTERSTITIALS.start.length;
}

function quizHead(back, section, progress) {
  return `<div class="quiz-head"><a class="icon-btn" href="${back}" aria-label="${esc(T("back"))}"><span aria-hidden="true">${arrowBack()}</span></a>
      <span class="section">${esc(section || "")}</span><span></span></div>
    ${progress ? `<div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${progress.n}" aria-valuenow="${progress.i}" aria-label="${esc(T("qOf", progress))}"><span data-w="${Math.round((progress.i / progress.n) * 100)}"></span></div>` : ""}`;
}

async function scrQuiz(stepStr) {
  if (signedIn() && !(await guard({ needQuestionnaire: false }))) return;
  const quiz = await loadQuiz();
  const i = Math.max(0, Math.min(Number(stepStr || 0), quiz.steps.length - 1));
  const step = quiz.steps[i];
  if (!signedIn()) store.set("resume", `#/quiz/${i}`);
  const back = i > 0 ? `#/quiz/${i - 1}` : (signedIn() ? "#/home" : "#/welcome");
  if (step.kind === "inter") { scrInter(step.id, i, back); return; }
  const qq = quiz.q.questions[step.index];
  const n = quiz.q.questions.length;
  const chosen = new Set(quiz.answers[qq.id] || []);
  const single = ["single", "tier", "contact_request"].includes(qq.answer_type);
  const input = (o) => `<input type="${single ? "radio" : "checkbox"}" name="o" value="${o.id}" data-key="${esc(o.key)}" data-excl="${o.is_exclusive}" ${chosen.has(o.id) ? "checked" : ""}>`;
  let body;
  if (qq.layout === "scale") {
    const last = qq.options.length - 1;
    body = `<div class="scale" role="radiogroup" aria-labelledby="qh">${qq.options.map((o, j) => `<label>${input(o).replace("<input ", `<input aria-label="${esc(o.label)}${j === 0 && qq.scale_low ? ` · ${esc(qq.scale_low)}` : ""}${j === last && qq.scale_high ? ` · ${esc(qq.scale_high)}` : ""}" `)}<span aria-hidden="true">${esc(o.label)}</span></label>`).join("")}</div>
      <div class="scale-ends caption" aria-hidden="true"><span>${esc(qq.scale_low || "")}</span><span>${esc(qq.scale_high || "")}</span></div>`;
  } else if (qq.layout === "chips") {
    body = `<div class="chips" role="group" aria-labelledby="qh">${qq.options.map((o) => `<label class="chip">${input(o)}<span>${optLabel(o.label)}</span></label>`).join("")}</div>`;
  } else {
    body = `<div class="options" role="${single ? "radiogroup" : "group"}" aria-labelledby="qh">${qq.options.map((o) => `
      <label class="option ${single ? "radio" : ""}">${input(o)}<span class="txt">${optLabel(o.label)}</span><span class="tick" aria-hidden="true"></span></label>`).join("")}</div>`;
  }
  view(qq.text, `${quizHead(back, qq.section, { i: step.index + 1, n })}
    <form id="f" class="quiz-q" novalidate>
      <p class="step-k">${esc(T("qStep", { i: step.index + 1, n }))}</p>
      <h1 id="qh">${esc(qq.text)}</h1>
      <p class="caption why">${qq.max_selections ? `${esc(T("chooseUpTo", { n: qq.max_selections }))} · ` : ""}${esc(qq.purpose)}</p>
      ${body}
      <div id="note" aria-live="polite"></div>
      <div class="quiz-foot"><div><button class="btn btn-primary btn-block" type="submit" id="nx">${esc(T("continue"))}</button></div></div>
    </form>`);
  const inputs = $$("input[name=o]");
  const sync = (changed) => {
    if (changed && !single && changed.checked) {
      if (changed.dataset.excl === "true") inputs.forEach((x) => { if (x !== changed) x.checked = false; });
      else inputs.forEach((x) => { if (x.dataset.excl === "true") x.checked = false; });
    }
    const picked = inputs.filter((x) => x.checked);
    if (qq.max_selections) inputs.forEach((x) => { x.disabled = !x.checked && picked.length >= qq.max_selections; });
    quiz.answers[qq.id] = picked.map((x) => x.value);
    saveQuizLocal();
    if (changed && signedIn()) saveDraftSoon();
    $("#nx").disabled = qq.is_required && picked.length === 0;
    $("#nx").textContent = !qq.is_required && picked.length === 0 ? T("skipQ") : T("continue");
    const keys = picked.map((x) => x.dataset.key);
    $("#note").innerHTML = qq.key === "Q01" && keys.length === 1 && keys[0] === "lang_other" ? `<div class="banner banner-info"><div>${esc(T("q01Note"))}</div></div>`
      : qq.key === "Q07" && keys.includes("private_contact") ? `<div class="banner banner-info"><div>${esc(T("q07Note"))}</div></div>` : "";
  };
  inputs.forEach((x) => (x.onchange = () => sync(x)));
  // A tap on a single-choice answer moves on, like a card deck; keyboard users (detail 0) use the Continue button.
  if (single) {
    const here = location.hash;
    inputs.forEach((x) => x.addEventListener("click", (e) => {
      if (e.detail > 0 && !$("#note").innerHTML) setTimeout(() => { if (location.hash === here) go(`#/quiz/${i + 1}`); }, 250);
    }));
  }
  sync(null);
  $("#f").onsubmit = (e) => { e.preventDefault(); go(`#/quiz/${i + 1}`); };
}

function scrInter(id, i, back) {
  const last = i === state.quiz.steps.length - 1;
  const done = () => { if (!last) go(`#/quiz/${i + 1}`); else if (signedIn()) finishQuiz(); else go("#/name"); };
  const vibe = id === "vibe" ? vibeOf(answersByKey()) : null;
  const energy = id === "energy" ? energyOf(answersByKey()) : null;
  const screens = {
    doha: () => `<div class="art">${icon("map-pin")}</div><h1>${esc(T("dohaTitle"))}</h1><p class="lead">${esc(T("dohaBody"))}</p>`,
    community: () => `<div class="art">${icon("users")}</div><h1>${esc(T("communityTitle"))}</h1><p class="lead">${esc(T("communityBody"))}</p>`,
    how: () => `<h1>${esc(T("howTitle"))}</h1><ol class="steps">${["how1", "how2", "how3", "how4"].map((k, j) => `<li><span class="n" aria-hidden="true">${j + 1}</span><span>${esc(T(k))}</span></li>`).join("")}</ol>`,
    science: () => `<div class="art">${icon("book-open")}</div><h1>${esc(T("scienceTitle"))}</h1><div class="quote"><p>${esc(T("scienceBody"))}</p><p class="caption">${esc(T("scienceSource"))}</p></div>`,
    vibe: () => `<p class="caption">${esc(T("vibeTitle"))}</p><div class="vibe-card">${vibeTable(vibe)}</div>
      <h1>${esc(T(`vibe_${vibe}`))}</h1><p class="lead">${esc(T(`vibe_${vibe}Body`))}</p><p class="caption">${esc(T("vibeNote"))}</p>`,
    curating: () => `<div class="dots-loader">${tableSvg({ seats: 6, filled: 0 })}<b id="pct" class="num">0%</b></div>
      <h1>${esc(T("curatingTitle"))}</h1><ul class="checklist" id="cl">${["cur1", "cur2", "cur3"].map((k) => `<li>${esc(T(k))}</li>`).join("")}</ul>`,
    ready: () => `<h1>${esc(T("readyTitle"))}</h1><p class="lead">${esc(T("readyBody"))}</p>
      <div class="choice-stack"><button type="button" class="option plain" id="yes">${esc(T("readyYes"))}</button><a class="option plain" id="unsure" href="#/what-you-get">${esc(T("readyNo"))}</a></div>`,
    energy: () => `<div class="art">${icon("sparkle")}</div><h1>${esc(T(`energy_${energy}`))}</h1><p class="lead">${esc(T(`energy_${energy}Body`))}</p>`,
    data: () => `<div class="art">${icon("lock")}</div><h1>${esc(T("dataTitle"))}</h1><p class="lead">${esc(T("dataIntro"))}</p>
      <ul class="benefits">${[["phone", "data1t", "data1b"], ["circle-user-round", "data2t", "data2b"], ["sparkle", "data3t", "data3b"], ["calendar-days", "data4t", "data4b"]]
        .map(([ic, t, b]) => `<li><span class="bi">${icon(ic)}</span><span><strong>${esc(T(t))}</strong><br><span class="muted">${esc(T(b))}</span></span></li>`).join("")}</ul>
      <div class="banner banner-info"><span class="icon">${icon("info")}</span><div>${esc(T("dataShare"))} <a href="#/privacy">${esc(T("dataFull"))}</a></div></div>`,
    safety: () => `<div class="art">${icon("shield-check")}</div><h1>${esc(T("safetyTitle"))}</h1><ul class="benefits">${["safe1", "safe2", "safe3", "safe4"]
      .map((k) => `<li><span class="bi">${icon("check")}</span><span>${esc(T(k))}</span></li>`).join("")}</ul>`,
  };
  view(T(id === "vibe" ? `vibe_${vibe}` : id === "energy" ? `energy_${energy}` : `${id}Title`), `${quizHead(back, "", null)}<section class="inter" data-inter="${id}">${screens[id]()}</section>
    ${id === "ready" ? "" : `<div class="quiz-foot"><div><button class="btn btn-primary btn-block" id="nx">${esc(T("continue"))}</button></div></div>`}`);
  if (id === "ready") {
    state.quizReturn = i;
    $("#yes").onclick = done;
    return;
  }
  $("#nx").onclick = done;
  if (id === "curating") {
    const items = $$("#cl li");
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pct = reduce ? 100 : 0;
    const seats = $$(".dots-loader .seat");
    const paint = () => {
      $("#pct").textContent = `${pct}%`;
      seats.forEach((s, k) => s.setAttribute("class", `seat ${pct >= ((k + 1) * 100) / seats.length - 1 ? "on" : "off"}`));
      items.forEach((li, k) => li.classList.toggle("done", pct >= ((k + 1) * 100) / items.length - 1));
    };
    paint();
    if (!reduce) {
      every(80, () => {
        pct = Math.min(100, pct + 4);
        paint();
        if (pct >= 100) { clearTimers(); setTimeout(() => { if (location.hash === `#/quiz/${i}`) done(); }, 400); }
      });
    }
  }
}

function scrName() {
  store.set("resume", "#/name");
  const steps = state.quiz ? state.quiz.steps.length : 0;
  view(T("nameTitle"), `${quizHead(`#/quiz/${Math.max(0, steps - 1)}`, "", null)}
    <form id="f" class="stack quiz-q" novalidate>
      <h1>${esc(T("nameTitle"))}</h1>
      <div class="field"><label class="label" for="fname">${esc(T("firstName"))}</label>
        <input class="input" id="fname" maxlength="30" autocomplete="given-name" aria-describedby="nh" value="${esc(store.get("quizName") || "")}">
        <span id="nh" class="caption">${esc(T("nameHelp"))}</span></div>
      <div class="quiz-foot"><div><button class="btn btn-primary btn-block" type="submit" id="nx">${esc(T("next"))}</button></div></div>
    </form>`);
  const sync = () => { $("#nx").disabled = !$("#fname").value.trim(); };
  $("#fname").oninput = sync;
  sync();
  $("#f").onsubmit = (e) => { e.preventDefault(); if (!$("#fname").value.trim()) return; store.set("quizName", $("#fname").value.trim()); go("#/signin"); };
}

// Submits the quiz once the user is signed in; a missing required answer reopens the quiz at that question.
async function finishQuiz() {
  loadingView();
  clearTimeout(saveDraftSoon.t);
  saveDraftSoon.t = null;
  if (saveDraftSoon.inflight) await saveDraftSoon.inflight.catch(() => {});
  state.quiz = null;
  const quiz = await loadQuiz();
  const hadAny = Boolean(quiz.q.has_submitted_any);
  const r = await api("POST", "/api/v1/questionnaire-responses", { questionnaire_version_id: quiz.q.questionnaire_version_id, status: "submitted", answers: toPayload(quiz.answers) });
  if (!r.ok) {
    const miss = (r.data.details || []).find((d) => d.question_key);
    const idx = miss ? quiz.steps.findIndex((st) => st.kind === "q" && st.key === miss.question_key) : -1;
    toast(r.data.message || T("errGeneric"));
    go(`#/quiz/${idx >= 0 ? idx : 0}`);
    return;
  }
  clearDeviceProgress();
  state.quiz = null;
  toast(r.data.derived && r.data.derived.private_contact_case_id ? T("q07Note") : T("answersSaved"));
  await loadQuestionnaire(true);
  go(hadAny ? "#/home" : store.get("pushAsked") ? "#/what-you-get" : "#/notify?next=wyg");
}

// ------------------------------------------------------------------ phone notifications (Web Push, migration 013)
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
// ok | ios_install (iPhone: works only from the home-screen app) | denied | unsupported
function pushSupport() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return isIOS() && !isStandalone() ? "ios_install" : "unsupported";
  return Notification.permission === "denied" ? "denied" : "ok";
}
async function devicePushSub() {
  try { const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/") : null; return reg && reg.pushManager ? await reg.pushManager.getSubscription() : null; }
  catch { return null; }
}
const b64uBytes = (s) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "=".repeat((4 - (t.length % 4)) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function saveSub(sub) {
  const j = sub.toJSON();
  return api("POST", "/api/v1/push/subscriptions", { endpoint: j.endpoint, keys: j.keys });
}
// Must start from a tap: iPhone only shows the permission prompt for a user gesture.
async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm;
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const k = await api("GET", "/api/v1/push/key", undefined, { noAuth: true });
  if (!k.ok) return "error";
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(k.data.public_key) });
  return (await saveSub(sub)).ok ? "granted" : "error";
}
async function disablePush() {
  const sub = await devicePushSub();
  if (!sub) return;
  await api("POST", "/api/v1/push/subscriptions:delete", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
// Once per page load when signed in: if this device already allowed notifications, make sure the server has it.
async function syncPush() {
  if (syncPush.done || !signedIn() || !("Notification" in window) || Notification.permission !== "granted") return;
  syncPush.done = true;
  const sub = await devicePushSub();
  if (sub) await saveSub(sub);
}

// "Enable notifications" (after sign-up, and from Profile): a sample notification, then what this device can do.
async function scrNotify(next) {
  if (!(await guard({ needQuestionnaire: false }))) return;
  store.set("pushAsked", true);
  const done = () => go(next === "profile" ? "#/profile" : next === "home" ? "#/home" : "#/what-you-get");
  const support = pushSupport();
  const on = support === "ok" && Notification.permission === "granted" && Boolean(await devicePushSub());
  const sample = `<div class="push-sample" aria-hidden="true"><span class="app-ic">H</span>
    <span><strong>HerZone</strong><br><span>${esc(T("pushSample"))}</span></span></div>
    <p class="caption">${esc(T("pushSampleNote"))}</p>`;
  const body = on ? `<div class="banner banner-success"><div>${esc(T("pushOn"))}</div></div>`
    : support === "ios_install" ? `<h2>${esc(T("pushIosTitle"))}</h2><ol class="next-steps">${["pushIos1", "pushIos2", "pushIos3"].map((k) => `<li>${esc(T(k))}</li>`).join("")}</ol>`
    : support === "denied" ? `<div class="banner banner-info"><div>${esc(T("pushDenied"))}</div></div>`
    : support === "unsupported" ? `<div class="banner banner-info"><div>${esc(T("pushUnsupported"))}</div></div>` : "";
  view(T("pushTitle"), `<div class="quiz-head"><span></span><span></span><button type="button" class="link-btn" id="skip-push">${esc(T(next === "profile" ? "back" : "skipQ"))}</button></div>
    <section class="inter" data-screen="notify"><h1>${esc(T("pushTitle"))}</h1><p class="lead">${esc(T("pushLead"))}</p>${sample}${body}<div id="push-msg" aria-live="polite"></div></section>
    <div class="quiz-foot"><div>${support === "ok" && !on ? `<button class="btn btn-primary btn-block" id="push-go">${esc(T("pushEnable"))}</button>`
      : on && next === "profile" ? `<button class="btn btn-secondary btn-block" id="push-off">${esc(T("pushDisable"))}</button>`
      : `<button class="btn btn-primary btn-block" id="push-next">${esc(T("continue"))}</button>`}</div></div>`);
  $("#skip-push").onclick = done;
  if ($("#push-next")) $("#push-next").onclick = done;
  if ($("#push-off")) $("#push-off").onclick = async () => { await disablePush(); toast(T("pushOffDone")); scrNotify(next); };
  if ($("#push-go")) $("#push-go").onclick = async () => {
    $("#push-go").disabled = true;
    let r;
    try { r = await enablePush(); } catch { r = "error"; }
    if (r === "granted") { toast(T("pushOnDone")); done(); return; }
    $("#push-go").disabled = false;
    $("#push-msg").innerHTML = `<div class="banner banner-info"><div>${esc(T(r === "denied" ? "pushDenied" : r === "default" ? "pushLater" : "errGeneric"))}</div></div>`;
  };
}

// "What you get" (spec §6): per-seat today; `plan.kind` is where a subscription would render its plan cards.
async function scrWhatYouGet() {
  const authed = signedIn();
  let s = null;
  if (authed) {
    if (!(await guard())) return;
    loadingView();
    const r = await api("GET", "/api/v1/sessions");
    s = r.ok ? r.data.sessions[0] || null : null;
  }
  const plan = { kind: "per_seat", fee: s ? s.price.display : null, hours: s ? s.full_refund_until_hours : null };
  const benefits = [["users", "wyg1t", "wyg1b"], ["map-pin", "wyg2t", "wyg2b"], ["message-circle", "wyg3t", "wyg3b"], ["shield-check", "wyg4t", "wyg4b"], ["hand-heart", "wyg5t", "wyg5b"]];
  view(T("wygTitle"), `
    <h1 class="display-title">${esc(T("wygTitle"))}</h1>
    <section class="card stack" id="plan" data-kind="${plan.kind}">
      <p class="label">${esc(plan.fee ? T("wygPrice", { fee: plan.fee }) : T("wygPriceNoFee"))}</p>
      <ul class="benefits">${benefits.map(([ic, t, b]) => `<li><span class="bi">${icon(ic)}</span><span><strong>${esc(T(t))}</strong><br><span class="muted">${esc(T(b))}</span></span></li>`).join("")}</ul>
    </section>
    <div class="banner banner-info"><span class="icon">${icon("info")}</span><div>${esc(plan.hours ? T("wygRefund", { h: plan.hours }) : T("wygRefundGeneric"))}</div></div>
    ${authed ? `<a class="card card-link plans-link" href="#/plans"><span><strong>${esc(T("plansTitle"))}</strong><br><span class="muted">${esc(T("plansTeaser"))}</span></span></a>` : ""}
    <h2>${esc(T("faqTitle"))}</h2>
    <div class="faq">${[1, 2, 3, 4].map((k) => `<details><summary>${esc(T(`faq${k}q`))}</summary><p class="muted">${esc(T(`faq${k}a`))}</p></details>`).join("")}</div>
    <div class="quiz-foot"><div>${plan.fee ? `<p class="caption foot-price" id="wyg-sum">${esc(T("wygSum", { fee: plan.fee }))}</p>` : ""}<a class="btn btn-primary btn-block" id="wyg-go" href="${authed ? "#/home" : `#/quiz/${state.quizReturn ?? 0}`}">${esc(authed ? T("wygCta") : T("continue"))}</a></div></div>`);
}

// Subscription plans (display-only, owner decision 2026-10-31): plan cards with placeholder QAR prices from plans.js,
// a nudge from 1 to 3 months, a promo code check (codes are created in admin, never redeemed yet), the 14-day
// guarantee, one-off payment with no auto-renewal, and a disabled "coming soon" button.
async function scrPlans() {
  if (!(await guard())) return;
  let selected = DEFAULT_PLAN, pct = 0;
  // the amount alone is isolated left to right; the currency stays in the sentence direction, and the pair never wraps
  const qar = (n) => `<span class="money">${locale === "ar" ? `${num(n.toFixed(2))} ر.ق` : `QAR ${num(n.toFixed(2))}`}</span>`;
  const nameOf = (p) => T(`plan_${p.id}`);
  view(T("plansTitle"), `
    <h1 class="display-title">${esc(T("plansTitle"))}</h1>
    <p class="lead">${esc(T("plansSub"))}</p>
    <h2>${esc(T("plansChoose"))}</h2>
    <div class="plans" role="radiogroup" aria-label="${esc(T("plansChoose"))}" id="plans"></div>
    <div id="nudge"></div>
    <section class="card stack promo">
      <label class="label" for="promo">${esc(T("promoLabel"))}</label>
      <div class="row promo-row"><input class="input" id="promo" maxlength="24" autocomplete="off" autocapitalize="characters" dir="ltr">
        <button type="button" class="btn btn-secondary" id="promo-go">${esc(T("promoCheck"))}</button></div>
      <div id="promo-msg" aria-live="polite"></div>
    </section>
    <section class="card guarantee"><span class="bi">${icon("shield-check")}</span>
      <span><strong>${esc(T("guaranteeTitle", { d: GUARANTEE_DAYS }))}</strong><br><span class="muted">${esc(T("guaranteeBody", { d: GUARANTEE_DAYS }))}</span></span></section>
    <p class="caption">${esc(T("plansOneOff"))}</p>
    <div class="quiz-foot"><div><p class="caption foot-price" id="plan-sum"></p>
      <button class="btn btn-primary btn-block" type="button" disabled id="plan-go">${esc(T("plansSoon"))}</button>
      <p class="caption foot-price">${esc(T("plansNow"))}</p></div></div>`);
  const paint = () => {
    $("#plans").innerHTML = PLANS.map((p) => {
      const v = planPrices(p, pct);
      return `<label class="plan ${p.id === selected ? "on" : ""}" data-plan="${p.id}">
        ${p.popular ? `<span class="plan-flag">${esc(T("planPopular"))}</span>` : ""}
        <input type="radio" name="plan" value="${p.id}" ${p.id === selected ? "checked" : ""}>
        <span class="plan-main"><strong>${esc(nameOf(p))}</strong>
          ${v.full > v.price ? `<s class="muted">${qar(v.full)}</s>` : ""}<span class="plan-price">${qar(v.price)}</span></span>
        <span class="plan-side">${v.save ? `<span class="badge badge-success">${esc(T("planSave", { n: v.save }))}</span>` : ""}
          <span>${esc(T("planPerWeek", { p: "\u0000" })).replace("\u0000", qar(v.perWeek))}</span></span></label>`;
    }).join("");
    $$("input[name=plan]").forEach((x) => (x.onchange = () => { selected = x.value; paint(); }));
    const cur = PLANS.find((p) => p.id === selected);
    const v = planPrices(cur, pct);
    $("#plan-sum").innerHTML = esc(T("planSum", { p: "\u0000", plan: nameOf(cur) })).replace("\u0000", qar(v.price));
    const up = PLANS.find((p) => p.popular);
    $("#nudge").innerHTML = cur.months === 1 && up ? `<div class="banner banner-info nudge"><span class="icon">${icon("sparkle")}</span><div>
      <strong>${esc(T("nudgeTitle", { n: planPrices(up).save, plan: nameOf(up) }))}</strong>
      <button type="button" class="link-btn" id="nudge-go">${esc(T("nudgeCta", { plan: nameOf(up) }))}</button></div></div>` : "";
    if ($("#nudge-go")) $("#nudge-go").onclick = () => { selected = up.id; paint(); };
  };
  paint();
  $("#promo-go").onclick = async () => {
    const code = $("#promo").value.trim();
    if (!code) return;
    $("#promo-go").disabled = true;
    const r = await api("POST", "/api/v1/promo-codes:check", { code });
    $("#promo-go").disabled = false;
    if (!r.ok) { $("#promo-msg").innerHTML = errorBanner(r.data); return; }
    pct = r.data.valid ? r.data.percent_off : 0;
    $("#promo-msg").innerHTML = r.data.valid ? `<div class="banner banner-success"><div>${esc(T("promoOk", { n: pct }))}</div></div>`
      : `<div class="banner banner-danger"><div>${esc(T("promoBad"))}</div></div>`;
    paint();
  };
}

// ------------------------------------------------------------------ SCR-04 sessions
async function scrSessions(preselect) {
  if (!(await guard())) return;
  loadingView();
  const r = await api("GET", "/api/v1/sessions");
  if (!r.ok) { view(T("sessionsTitle"), `<h1>${esc(T("sessionsTitle"))}</h1>${errorBanner(r.data)}`); return; }
  const pre = preselect && r.data.sessions.find((x) => x.id === preselect);
  if (pre) store.set("exp", pre.experience);
  const exp = store.get("exp") || "dinner";
  const all = r.data.sessions.filter((x) => x.experience === exp);
  const ok = all.filter((s) => s.language_match);
  const card = (s) => `
    <label class="option radio" data-u="start">
      <input type="radio" name="s" value="${s.id}" ${s.is_full || s.my_booking_id ? "disabled" : ""}>
      <span class="tick" aria-hidden="true"></span>
      <span class="stack" data-u="flex1">
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
        : `<div class="banner banner-info"><div>${esc(T("noSessions"))} <a href="#/quiz/${stepOfKey("Q01")}">${esc(T("editLanguages"))}</a></div></div>`}
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
  const preRadio = pre && radios.find((x) => x.value === pre.id && !x.disabled);
  if (preRadio) { preRadio.checked = true; preRadio.onchange(); }
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
  const needAck = e.booking.cancellation.acknowledgement_required === "late_no_refund";
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
    ${policyHtml(e.booking.cancellation, b.amount.display)}
    ${b.payment && b.payment.status === "failed" ? `<div class="banner banner-warning" role="alert"><div>${esc(T("paymentFailed"))} ${esc(T("noDoubleCharge"))}</div></div>` : ""}
    <p class="label" id="hold">${expired ? "" : `${esc(T("holdTimer"))} <span class="num" id="clock"></span>`}</p>
    <p class="sr-only" aria-live="polite" id="holdlive"></p>
    <div id="err" role="alert">${expired ? errorBanner({ message: T("holdExpired") }) : ""}</div>
    ${expired ? `<a class="btn btn-primary btn-block" href="#/sessions">${esc(T("chooseAgain"))}</a>`
      : `<button class="btn btn-primary btn-block" id="pay" ${needAck ? "disabled" : ""}>${esc(T("pay", { fee: b.amount.display }))}</button>`}
    <button class="link-btn" id="change">${esc(T("changeSession"))}</button>`);
  if (!expired) {
    const end = new Date(b.hold_expires_at).getTime();
    const tick = () => {
      if (!$("#clock")) return;
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      $("#clock").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      if (s === 120 || s === 30) $("#holdlive").textContent = `${T("holdTimer")} ${$("#clock").textContent}`;
      if (s === 0) { clearTimers(); scrReview(id); }
    };
    tick(); every(1000, tick);
    if (needAck) $("#ack").onchange = () => { $("#pay").disabled = !$("#ack").checked; };
    $("#pay").onclick = async () => {
      if (needAck && !$("#ack").checked) return;
      $("#pay").disabled = true;
      let url = b.checkout_url;
      if (!url) {
        const c = await api("POST", `/api/v1/bookings/${id}/checkout`, needAck ? { acknowledge_late_no_refund: true } : undefined);
        if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); $("#pay").disabled = false; return; }
        url = c.data.checkout_url;
      }
      clearTimers();   // the hold clock must not tick into the replaced view while the browser navigates
      main.innerHTML = `<div class="center"><div class="spinner" aria-hidden="true"></div><h1>${esc(T("redirecting"))}</h1></div>`;
      location.assign(url);
    };
  }
  $("#change").onclick = async () => { await api("POST", `/api/v1/bookings/${id}/cancel`, {}); go("#/sessions"); };
}

// Coordinator on duty (audit F10): real call / WhatsApp buttons when configured, loaded once per page load.
async function loadContact() {
  if (state.contact !== undefined) return state.contact;
  const r = await api("GET", "/api/v1/support/contact", undefined, { noAuth: true });
  // the coordinator's number is public; keep the last one so "call" still works with no data connection
  if (r.ok) store.set("contact", r.data.coordinator);
  state.contact = r.ok ? r.data.coordinator : r.data && r.data.code === "OFFLINE" ? store.get("contact") : null;
  return state.contact;
}
function contactButtons(c) {
  if (!c) return "";
  return `<div class="row contact-actions"><a class="btn btn-secondary" id="call-coord" href="${esc(c.tel_url)}">${icon("phone")}<span>${esc(T("callCoordinator"))}</span><bdi dir="ltr" class="num">${esc(c.phone_display)}</bdi></a>
    ${c.whatsapp_url ? `<a class="btn btn-secondary" id="wa-coord" href="${esc(c.whatsapp_url)}" target="_blank" rel="noopener noreferrer">${icon("message-circle")}${esc(T("whatsappCoordinator"))}</a>` : ""}</div>`;
}

// Cancellation terms before paying (audit F1): never promise a refund deadline that has already passed.
function policyHtml(c, fee) {
  if (c.full_refund_window_open !== false) {
    return `<div class="banner banner-info"><span class="icon">${icon("info")}</span><div>${esc(T("policyBox", { deadline: fmtDate(c.full_refund_until) }))}</div></div>`;
  }
  const partial = c.refund_if_cancelled_after_payment === "partial";
  return `<div class="banner banner-warning" id="late"><span class="icon">${icon("triangle-alert")}</span><div>
      <strong>${esc(T("lateTitle", { hours: c.full_refund_until_hours }))}</strong><br>
      ${esc(T(partial ? "latePartial" : "lateNone", { fee, pct: c.late_cancel_refund_pct }))} ${esc(T("lateQuorum"))}</div></div>
    ${c.acknowledgement_required === "late_no_refund" ? `<label class="option"><input type="checkbox" id="ack" aria-describedby="late"><span class="tick" aria-hidden="true"></span>
      <span>${esc(T(partial ? "lateAckPartial" : "lateAck", { pct: c.late_cancel_refund_pct }))}</span></label>` : ""}`;
}

async function scrPayReturn(id) {
  if (!(await guard())) return;
  const started = Date.now();
  const draw = (phase, b) => {
    if (phase === "success") {
      const it = b.item;
      view(T("allSetTitle"), `<div class="center all-set"><div class="success-check">${icon("check")}</div><h1>${esc(T("allSetTitle"))}</h1>
        <p class="lead">${esc(T("paidTitle"))}</p>
        ${it ? `<div class="card booking-peek"><span class="bi">${icon(it.experience === "coffee" ? "coffee" : "utensils")}</span>
          <span><strong>${esc(T(it.experience))}</strong><br><span>${esc(fmtDate(it.starts_at))}</span>${it.district ? `<br><span class="muted">${esc(it.district)}</span>` : ""}</span></div>` : ""}
        <ol class="next-steps">${["allSet1", "allSet2", "allSet3"].map((k) => `<li>${esc(T(k))}</li>`).join("")}</ol>
        <p class="caption">${esc(T("bookingRef"))} ${num(b.ref)}</p><a class="btn btn-primary btn-block" href="#/home">${esc(T("goDashboard"))}</a></div>`);
    } else if (phase === "failed") {
      view(T("paymentFailed"), `<div class="center"><h1>${esc(T("paymentFailed"))}</h1><p class="muted">${esc(T("noDoubleCharge"))}</p>
        <a class="btn btn-primary" href="#/booking/${id}/review">${esc(T("payNow"))}</a></div>`);
    } else if (phase === "slow") {
      view(T("confirming"), `<div class="center"><div class="illustration">${icon("hourglass")}</div><h1>${esc(T("slowConfirm"))}</h1><a class="btn btn-secondary" href="#/home">${esc(T("backHome"))}</a></div>`);
    } else {
      view(T("confirming"), `<div class="center" aria-busy="true"><div class="spinner" aria-hidden="true"></div><h1>${esc(T("confirming"))}</h1></div>`);
    }
  };
  draw("confirming");
  const poll = async () => {
    const r = await api("GET", `/api/v1/bookings/${id}`);
    if (!r.ok) return;
    if (r.data.status === "paid_awaiting_group") {
      const list = await api("GET", "/api/v1/bookings");
      r.data.item = list.ok ? list.data.bookings.find((x) => x.id === id) || null : null;
    }
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
  const map = { payment_pending: ["badge-warning", "stPending"], paid_awaiting_group: ["badge-primary", "step2"], group_locked: ["badge-success", "step3"],
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

// Calendar weeks start on Sunday in Qatar (UTC+3, no DST): 0 = this week, 1 = next week, 2+ = later.
function weekOffset(iso) {
  const day = (ms) => Math.floor((ms + 3 * 3600000) / 86400000);
  const weekStart = (ms) => day(ms) - new Date(ms + 3 * 3600000).getUTCDay();
  return Math.round((weekStart(new Date(iso).getTime()) - weekStart(Date.now())) / 7);
}

// Calendar day in Asia/Qatar (UTC+3, no DST) as YYYY-MM-DD.
const qatarDay = (iso) => new Date(new Date(iso).getTime() + 3 * 3600000).toISOString().slice(0, 10);

// Seven days from today; a dot marks days that have sessions, tapping one scrolls to its first card.
function weekRibbon(sessions) {
  const days = new Set(sessions.map((s) => qatarDay(s.starts_at)));
  const today = Date.now();
  return `<div class="week" role="group" aria-label="${esc(T("weekLabel"))}">${Array.from({ length: 7 }, (_, k) => {
    const iso = new Date(today + k * 86400000).toISOString();
    const key = qatarDay(iso);
    const has = days.has(key);
    return `<button type="button" class="${has ? "has" : ""}" data-day="${key}" aria-pressed="false" ${has ? "" : "disabled"}
      aria-label="${esc(fmtDate(iso, { weekday: "long", day: "numeric", month: "long" }))}"><span>${esc(fmtDate(iso, { weekday: "short" }))}</span><b>${esc(fmtDate(iso, { day: "numeric" }))}</b><i></i></button>`;
  }).join("")}</div>`;
}

function sessionCard(s) {
  const href = s.my_booking_id ? `#/booking/${s.my_booking_id}` : `#/sessions?s=${s.id}`;
  const status = s.my_booking_id ? T("alreadyBooked") : s.is_full ? T("full") : T("seatsLeft", { n: s.seats_left });
  const lang = T(s.conversation_language === "ar" ? "langAr" : "langEn");
  return `<li><a class="event-card" href="${href}" data-session="${s.id}" data-day="${qatarDay(s.starts_at)}"
      aria-label="${esc(`${T(s.experience)} · ${fmtDate(s.starts_at)} · ${s.district} · ${status}`)}">
    <span class="d" aria-hidden="true"><b>${esc(fmtDate(s.starts_at, { day: "numeric" }))}</b><span>${esc(fmtDate(s.starts_at, { weekday: "long" }))}</span></span>
    <span class="t" aria-hidden="true"><strong>${esc(T(s.experience))} · ${esc(lang)}</strong>
      <span class="m"><span>${icon("map-pin")}${esc(s.district)}</span><span>${icon("clock")}<span class="num">${esc(fmtDate(s.starts_at, { hour: "numeric", minute: "2-digit" }))}</span></span></span>
      <span class="m"><span class="${s.my_booking_id ? "mine" : s.is_full ? "full" : ""}">${icon("users")}${esc(status)}</span></span></span>
    <span class="go" aria-hidden="true">${icon(locale === "ar" ? "chevron-left" : "chevron-right")}</span></a></li>`;
}

async function scrHome() {
  if (!(await guard())) return;
  loadingView();
  // required documents updated since the user accepted them (terms, conduct, privacy notice): read and accept on home
  const outdated = (state.me && state.me.outdated_consents) || [];
  // accounts registered before HerZone became women-only confirm once before their next booking
  const askWoman = Boolean(state.me && state.me.woman_confirmed === false);
  const [sR, bR, contact, legalR] = await Promise.all([api("GET", "/api/v1/sessions"), api("GET", "/api/v1/bookings"), loadContact(),
    outdated.length ? api("GET", "/api/v1/legal/current", undefined, { noAuth: true }) : null]);
  const docs = legalR && legalR.ok ? outdated.filter((k) => legalR.data[k]).map((k) => ({ type: k, ...legalR.data[k] })) : [];
  const onlyPrivacy = docs.length === 1 && docs[0].type === "privacy_notice";
  const DOC_NAME = { terms: "docTerms", conduct: "docConduct", privacy_notice: "privacyTitle" };
  const sessions = sR.ok ? sR.data.sessions.filter((x) => x.language_match !== false) : [];
  const bookings = bR.ok ? bR.data.bookings : [];
  const next = bookings.filter((b) => ACTIVE.includes(b.status)).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
  const choice = bookings.find((b) => b.status === "cancelled_by_organizer" && new Date(b.starts_at) > new Date(Date.now() - 2 * 86400000));
  const done = bookings.find((b) => b.status === "completed" && b.phase === "completed");
  const q = state.q;
  const groups = [["thisWeek", (w) => w <= 0], ["nextWeek", (w) => w === 1], ["later", (w) => w >= 2]]
    .map(([k, f]) => [k, sessions.filter((x) => f(weekOffset(x.starts_at)))]).filter(([, list]) => list.length);
  view(T("city"), `
    <div class="home-head"><h1 class="display-title">${esc(T("city"))}</h1></div>
    ${sessions[0] ? `<p class="home-sub">${esc(T("homeSub", { fee: sessions[0].price.display }))}</p>` : ""}
    ${state.suspended ? `<div class="banner banner-danger" role="alert"><div>${esc(T("suspended"))} <a href="#/cases">${esc(T("casesTitle"))}</a></div></div>` : ""}
    ${choice ? `<div class="banner banner-danger"><div>${esc(T("stOrganizer"))} <a href="#/booking/${choice.id}/choose">${esc(T("chooseNow"))}</a></div></div>` : ""}
    ${done ? `<div class="banner banner-info"><div>${esc(T("stCompleted"))} <a href="#/booking/${done.id}/feedback">${esc(T("rateIt"))}</a></div></div>` : ""}
    ${docs.length ? `<section class="banner banner-warning" id="consent-upd"><div class="stack"><p><strong>${esc(T(onlyPrivacy ? "privacyUpdTitle" : "docsUpdTitle"))}</strong></p>
      <p>${esc(T(onlyPrivacy ? "privacyUpdBody" : "docsUpdBody"))}</p>
      ${docs.map((d) => `<details><summary>${esc(T(DOC_NAME[d.type]))}</summary><p class="caption legal-text">${esc(d.text)}</p></details>`).join("")}
      <button class="btn btn-primary" id="pv-ok">${esc(T("privacyAccept"))}</button><div id="pv-err" role="alert"></div></div></section>` : ""}
    ${askWoman ? `<section class="banner banner-warning" id="woman-upd"><div class="stack"><p><strong>${esc(T("womanUpdTitle"))}</strong></p>
      <p>${esc(T("womanUpdBody"))}</p><button class="btn btn-primary" id="woman-ok">${esc(T("womanLabel"))}</button><div id="woman-err" role="alert"></div></div></section>` : ""}
    ${q && !q.submitted && q.has_submitted_any ? `<div class="banner banner-info" id="complete-card"><div>${esc(T("completeCard"))} <a href="#/quiz/${resumeStepFor(q)}">${esc(T("completeCardCta"))}</a></div></div>` : ""}
    ${next ? `<a class="next-card" id="next-booking" href="${next.status === "payment_pending" ? `#/booking/${next.id}/review` : `#/booking/${next.id}`}">
      <span class="row between"><span class="caption">${esc(T("nextEvent"))}</span>${statusBadge(next)}</span>
      <span class="when">${esc(T(next.experience))} · ${esc(fmtDate(next.starts_at, { weekday: "long", hour: "numeric", minute: "2-digit" }))}</span>
      <span class="row"><span>${esc(next.district)}</span>${countdown(next.starts_at) ? `<span>· ${esc(countdown(next.starts_at))}</span>` : ""}</span></a>` : ""}
    <h2>${esc(T("allSessions"))}</h2>
    ${sessions.length ? weekRibbon(sessions) : ""}
    ${groups.length ? groups.map(([k, list]) => `<section class="week-group" aria-labelledby="wg-${k}"><h2 id="wg-${k}">${esc(T(k))}</h2><ul class="list">${list.map(sessionCard).join("")}</ul></section>`).join("")
      : `<div class="empty">${tableSvg({ seats: 6 })}<p class="muted">${esc(T("noUpcoming"))}</p></div>`}
    <section class="stack" data-u="mt8"><p class="caption">${esc(T("help"))}</p>${contactButtons(contact)}</section>`);
  $$(".week button[data-day]").forEach((b) => (b.onclick = () => {
    $$(".week button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const card = $(`.event-card[data-day="${b.dataset.day}"]`);
    if (card) { card.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); card.focus({ preventScroll: true }); }
  }));
  if (askWoman) {
    $("#woman-ok").onclick = async () => {
      $("#woman-ok").disabled = true;
      const r = await api("POST", "/api/v1/users/me/consents", { consents: [], woman_confirmed: true });
      if (!r.ok) { $("#woman-ok").disabled = false; $("#woman-err").innerHTML = errorBanner(r.data); return; }
      await loadMe(true);
      toast(T("womanConfirmed"));
      scrHome();
    };
  }
  if (docs.length) {
    $("#pv-ok").onclick = async () => {
      $("#pv-ok").disabled = true;
      const r = await api("POST", "/api/v1/users/me/consents", { consents: docs.map((d) => ({ type: d.type, document_version: d.document_version, granted: true })) });
      if (!r.ok) { $("#pv-ok").disabled = false; $("#pv-err").innerHTML = errorBanner(r.data); return; }
      await loadMe(true);
      toast(T("privacyAccepted"));
      scrHome();
    };
  }
}

// Current privacy notice, readable signed in or out.
async function scrPrivacy() {
  loadingView();
  const r = await api("GET", "/api/v1/legal/current", undefined, { noAuth: true });
  const n = r.ok ? r.data.privacy_notice : null;
  view(T("privacyTitle"), `<h1>${esc(T("privacyTitle"))}</h1>${n ? `<div class="card"><p class="legal-text">${esc(n.text)}</p></div>` : errorBanner(r.data)}
    ${history.length > 1 ? `<button type="button" class="btn btn-secondary btn-block" id="pv-back">${esc(T("back"))}</button>` : ""}`);
  if ($("#pv-back")) $("#pv-back").onclick = () => history.back();
}

async function scrEvents() {
  if (!(await guard())) return;
  loadingView();
  const [r, contact] = await Promise.all([api("GET", "/api/v1/bookings"), loadContact()]);
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
    hero = `<section class="card hero stack" aria-labelledby="nexth">
      <div class="row between"><h2 id="nexth">${esc(T("nextEvent"))}</h2>${statusBadge(next)}</div>
      <div><strong>${esc(T(next.experience))} · ${esc(fmtDate(next.starts_at))}</strong><div class="caption">${esc(next.district)} · <span aria-live="off">${esc(countdown(next.starts_at))}</span></div></div>
      <p>${esc(phaseLine)}</p>
      <ol class="stepper">${steps.map((s, i) => `<li class="${i < cur ? "done" : i === cur ? "current" : ""}" ${i === cur ? 'aria-current="step"' : ""}><span class="dot" aria-hidden="true"></span><span>${esc(T(s))}</span></li>`).join("")}</ol>
      <a class="btn btn-primary btn-block" href="${next.status === "payment_pending" ? `#/booking/${next.id}/review` : `#/booking/${next.id}`}">${esc(next.phase === "day_of" ? T("imHere") : T("viewDetails"))}</a>
    </section>`;
  }
  view(T("eventsTitle"), `
    <h1 class="display-title">${esc(T("eventsTitle"))}</h1>
    ${state.suspended ? `<div class="banner banner-danger" role="alert"><div>${esc(T("suspended"))} <a href="#/cases">${esc(T("casesTitle"))}</a></div></div>` : ""}
    ${choice ? `<div class="banner banner-danger"><div>${esc(T("stOrganizer"))} <a href="#/booking/${choice.id}/choose">${esc(T("chooseNow"))}</a></div></div>` : ""}
    ${done ? `<div class="banner banner-info"><div>${esc(T("stCompleted"))} <a href="#/booking/${done.id}/feedback">${esc(T("rateIt"))}</a></div></div>` : ""}
    ${hero || `<div class="empty">${tableSvg({ seats: 6 })}<h2>${esc(T("noEventsTitle"))}</h2><p class="muted">${esc(T("noEventsBody"))}</p><a class="btn btn-primary" href="#/home">${esc(T("bookSeat"))}</a></div>`}
    ${bookings.length > (next ? 1 : 0) ? `<h2>${esc(T("otherBookings"))}</h2><ul class="list">${bookings.filter((b) => b !== next).map((b) => `
      <li><a class="card card-link" href="#/booking/${b.id}"><div class="row between"><span>${esc(T(b.experience))} · ${esc(fmtDate(b.starts_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</span>${statusBadge(b)}</div>
      <span class="caption">${num(b.ref)} · ${esc(b.district)}</span></a></li>`).join("")}</ul>` : ""}
    ${next ? `<a class="btn btn-secondary btn-block" href="#/home">${esc(T("bookAnother"))}</a>` : ""}
    <section class="stack" data-u="mt8"><p class="caption">${esc(T("help"))}</p>${contactButtons(contact)}</section>`);
}

// ------------------------------------------------------------------ SCR-07 event details
async function scrDetails(id) {
  const g = await guard({ needQuestionnaire: false, offlineOk: true });
  if (!g) return;
  loadingView();
  const [r, contact] = g === "offline" ? [{ ok: false, data: { code: "OFFLINE" } }, store.get("contact")] : await Promise.all([api("GET", `/api/v1/bookings/${id}/event-details`), loadContact()]);
  // no connection: show the copy saved on this device, read-only (no check-in, cancel or contacts until back online)
  const saved = !r.ok && r.data && r.data.code === "OFFLINE" ? trips.get(id) : null;
  if (!r.ok && !saved) {
    view(T("detailsTitle"), `<h1>${esc(T("detailsTitle"))}</h1>${errorBanner(r.data)}${r.data && r.data.code === "OFFLINE" ? `<button class="btn btn-secondary" id="retry-me">${esc(T("retry"))}</button>` : ""}`);
    if ($("#retry-me")) $("#retry-me").onclick = () => route();
    return;
  }
  if (r.ok) trips.save(id, r.data);
  const e = saved ? { ...saved.data, actions: [] } : r.data, ph = e.reveal.phase, act = (t) => e.actions.find((a) => a.type === t);
  const offlineNote = saved ? `<div class="banner banner-warning" id="offline-copy"><span class="icon">${icon("info")}</span><div>${esc(T("offlineCopy", { at: fmtDate(saved.saved_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) }))}</div></div>` : "";
  if (ph === "pending_payment") { go(`#/booking/${id}/review`); return; }
  if (e.resolution) { go(`#/booking/${id}/choose`); return; }
  const acc = e.session.accessibility ? Object.entries(e.session.accessibility).filter(([, v]) => v).map(([k]) => k).join(" · ") : "";
  const cd = countdown(e.session.starts_at);
  // tracker: paid · forming · confirmed · revealed (spec §3); cancelled/completed bookings show no tracker
  const stage = { forming: 1, locked: 2, revealed: 3, day_of: 3, completed: 4 }[ph];
  const track = stage === undefined ? "" : `<ol class="track" aria-label="${esc(T("essentials"))}">${["step1", "step2", "step3", "step4"].map((k, j) =>
    `<li class="${j < stage ? "done" : j === stage ? "current" : ""}" ${j === stage ? 'aria-current="step"' : ""}>${esc(T(k))}</li>`).join("")}</ol>`;
  view(T("detailsTitle"), `${offlineNote}
    <header class="det-head">${statusBadge(e.booking)}
      <h1>${esc(T("detailsHead", { exp: T(e.session.experience), day: fmtDate(e.session.starts_at, { weekday: "long" }) }))}</h1>
      <span class="when num">${esc(fmtDate(e.session.starts_at, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }))}</span>
      <span class="ref">${num(e.booking.ref)}${cd ? ` · ${esc(cd)}` : ""}</span></header>
    ${track}
    <ul class="facts-list" aria-label="${esc(T("essentials"))}">
      <li>${icon("map-pin")}<span>${esc(e.session.district)}</span><span class="k">${esc(T("district"))}</span></li>
      <li>${icon("languages")}<span>${esc(T(e.session.conversation_language === "ar" ? "langAr" : "langEn"))}</span><span class="k">${esc(T("tableLanguage"))}</span></li>
      <li>${icon("wallet")}<span>${esc(e.session.food_price_band.display)}</span><span class="k">${esc(T("foodBandLabel"))}</span></li>
      <li>${icon("clock")}<span class="num">${esc(fmtDate(e.session.starts_at, { hour: "numeric", minute: "2-digit" }))}</span><span class="k">${esc(T("dateTime"))} · Asia/Qatar</span></li>
      ${acc ? `<li>${icon("info")}<span>${esc(acc)}</span><span class="k">${esc(T("accessibility"))}</span></li>` : ""}</ul>
    ${e.table ? `<section class="card stack"><div class="table-figure">${tableSvg({ seats: e.table.capacity, filled: e.table.confirmed_count,
        label: T("tableSeats", { n: e.table.confirmed_count, cap: e.table.capacity }) })}
      <div><h2>${esc(T("yourTable"))}</h2><p class="label">${esc(T("confirmedCount", { n: e.table.confirmed_count }))}</p></div></div>
      ${e.table.shared_themes && e.table.shared_themes.length ? `<p class="shared-themes">${icon("sparkle")}<span>${esc(T("sharedThemes", { list: e.table.shared_themes.join(T("listSep")) }))}</span></p>` : ""}
      <p class="caption">${esc(T("introTip"))}</p>
      ${e.table.members ? `<h3 class="label">${esc(T("tablemates"))}</h3><p>${esc(e.table.members.map((m) => m.display_name || T("unnamed")).join("، "))}</p>` : ""}</section>`
      : ph === "forming" ? `<section class="card"><div class="table-figure">${tableSvg({ seats: 6 })}<p class="label">${esc(T("tableForming"))}</p></div></section>` : ""}
    ${!e.venue && ["forming", "locked"].includes(ph) ? `<div class="note note-primary"><span class="icon">${icon("lock")}</span><div>${esc(T("venueHidden", { reveal_at: fmtDate(e.reveal.reveal_at) }))}</div></div>` : ""}
    ${e.venue ? `<section class="card stack"><h2>${esc(e.venue.name)}</h2><p>${esc(e.venue.address)} · ${esc(e.venue.district)}</p>
      <a class="btn btn-secondary" href="${esc(e.venue.map_url)}" target="_blank" rel="noopener">${esc(T("openMaps"))}</a>
      <div><strong>${esc(T("arrival"))}</strong><p>${esc(e.venue.arrival_instructions)}</p></div>
      <div><span class="label">${esc(T("tableCode"))}</span><div class="table-code">${esc(e.table.code)}</div><p class="caption">${esc(T("mentionCode"))}</p></div>
      <p class="caption">${esc(e.venue.bill_policy)}</p></section>` : ""}
    <div id="msg" role="status"></div>
    ${act("check_in") ? `<button class="btn btn-primary btn-block" id="ci">${esc(T("imHere"))}</button>` : ""}
    ${e.booking.status === "checked_in" ? `<div class="banner banner-success"><span class="icon">${icon("circle-check")}</span><div>${esc(T("checkedIn"))}</div></div>` : ""}
    ${act("feedback") ? `<a class="btn btn-primary btn-block" href="#/booking/${id}/feedback">${esc(T("rateIt"))}</a>` : ""}
    ${ph === "completed" ? `<section class="card stack" id="contacts" aria-labelledby="contacts-h"><h2 id="contacts-h">${esc(T("contactLegend"))}</h2>
      <p class="caption">${esc(T("contactHelp"))}</p><div id="contacts-list" aria-live="polite"></div></section>` : ""}
    ${e.refund ? `<section class="card"><div class="kv"><span>${esc(T("refundLabel"))}</span><strong>${esc(T({ requested: "rfRequested", processing: "rfProcessing", refunded: "rfRefunded", failed: "rfFailed", none: "rfNone" }[e.refund.status]))}${e.refund.amount ? ` · ${esc(e.refund.amount.display)}` : ""}</strong></div></section>` : ""}
    ${e.rebooked_into ? `<div class="banner banner-success"><div>${esc(T("rebookedInto", { ref: e.rebooked_into.ref }))} <a href="#/booking/${e.rebooked_into.booking_id}">${esc(T("viewDetails"))}</a></div></div>` : ""}
    <section class="stack" data-u="mt6"><p class="caption">${esc(T("support"))}</p>${contactButtons(contact)}
      ${!saved && (act("report") || ["revealed", "locked", "forming"].includes(ph)) ? `<a class="btn btn-secondary btn-block" href="#/report/${id}">${icon("flag")}${esc(T("privateReport"))}</a>` : ""}</section>
    ${act("cancel") ? `<a class="btn btn-danger btn-block" href="#/booking/${id}/cancel">${esc(T("cancelBooking"))}</a>
      <p class="caption">${esc(e.booking.cancellation.refund_if_cancelled_now === "full" ? T("policyBox", { deadline: fmtDate(e.booking.cancellation.full_refund_until) })
        : T("refundNone", { deadline: fmtDate(e.booking.cancellation.full_refund_until) }))}</p>` : ""}`);
  const ci = $("#ci");
  if (ci) ci.onclick = async () => { ci.disabled = true; const c = await api("POST", `/api/v1/bookings/${id}/check-in`); if (c.ok) scrDetails(id); else { $("#msg").innerHTML = errorBanner(c.data); ci.disabled = false; } };
  if (ph === "completed") renderContacts(id);
}

// Contact requests after the meetup (migration 010): ask a tablemate; on acceptance both get a WhatsApp button.
// A refusal or no answer is never shown: the sender only ever sees "Request sent".
async function renderContacts(id, note = "") {
  const box = $("#contacts-list");
  if (!box) return;
  const r = await api("GET", `/api/v1/bookings/${id}/contacts`);
  if (!$("#contacts-list")) return;
  if (!r.ok) { box.innerHTML = errorBanner(r.data); return; }
  const c = r.data;
  const row = (m) => {
    const name = esc(m.display_name || T("unnamed"));
    const action = m.state === "connected" ? `<a class="btn btn-primary" href="${esc(m.whatsapp_url)}" target="_blank" rel="noopener" data-wa>${icon("phone")}${esc(T("contactWhatsapp"))}</a>`
      : m.state === "incoming" ? `<span class="row"><button class="btn btn-primary" data-accept="${esc(m.request_id)}">${esc(T("contactAccept"))}</button>
          <button class="btn btn-secondary" data-decline="${esc(m.request_id)}">${esc(T("contactDecline"))}</button></span>`
      : m.state === "sent" ? `<span class="caption">${esc(T("contactSent"))}</span>`
      : m.can_send ? `<button class="btn btn-secondary" data-seat="${esc(m.seat)}">${esc(T("contactSend"))}</button>` : "";
    return `<li class="row between contact-row" data-u="wrap8"><span><strong>${name}</strong>${m.state === "incoming"
      ? `<br><span class="caption">${esc(T("contactIncoming"))}</span>` : ""}</span>${action}</li>`;
  };
  box.innerHTML = `${note ? `<div class="banner banner-success" role="status"><div>${esc(note)}</div></div>` : ""}
    ${c.members.length ? `<ul class="list" data-u="gap0">${c.members.map(row).join("")}</ul>` : ""}
    <p class="caption">${esc(c.open ? T("contactUntil", { date: fmtDate(c.closes_at) }) : T("contactClosed"))}</p>
    <div id="contacts-err" role="alert"></div>`;
  const act = async (btn, method, path, body, done) => {
    btn.disabled = true;
    const x = await api(method, path, body);
    if (!x.ok) { btn.disabled = false; $("#contacts-err").innerHTML = errorBanner(x.data); return; }
    renderContacts(id, done(x.data));
  };
  $$("#contacts-list [data-seat]").forEach((b) => (b.onclick = () => act(b, "POST", "/api/v1/contact-requests", { booking_id: id, seat: b.dataset.seat },
    (d) => (d.state === "connected" ? T("contactAccepted") : ""))));
  $$("#contacts-list [data-accept]").forEach((b) => (b.onclick = () => act(b, "POST", `/api/v1/contact-requests/${b.dataset.accept}:accept`, {}, () => T("contactAccepted"))));
  $$("#contacts-list [data-decline]").forEach((b) => (b.onclick = () => act(b, "POST", `/api/v1/contact-requests/${b.dataset.decline}:decline`, {}, () => T("contactDeclined"))));
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
        ${rb.sessions.map((s) => `<label class="option radio" data-u="start"><input type="radio" name="c" value="rebook:${s.session_id}"><span class="tick" aria-hidden="true"></span>
          <span><strong>${esc(T("optRebook"))}: ${esc(fmtDate(s.starts_at))}</strong><br><span class="caption">${esc(s.district)} · ${esc(T("seatsLeft", { n: s.seats_left }))} · ${esc(T("optRebookHelp"))}${s.is_alternate ? ` · ${esc(T("alternateTag"))}` : ""}</span></span></label>`).join("")}
        <label class="option radio" data-u="start"><input type="radio" name="c" value="refund"><span class="tick" aria-hidden="true"></span>
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
  const r = await api("GET", `/api/v1/bookings/${id}/event-details`);
  if (!r.ok) { view(T("fbTitle"), `<h1>${esc(T("fbTitle"))}</h1>${errorBanner(r.data)}`); return; }
  const stars = (name, label, required) => `<fieldset><legend class="label">${esc(label)}</legend><div class="stars">
    ${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="${name}" value="${v}" ${required ? "required" : ""}><span>${v}</span><span class="sr-only">/ 5</span></label>`).join("")}</div></fieldset>`;
  view(T("fbTitle"), `
    <h1>${esc(T("fbTitle"))}</h1>
    <form id="f" class="stack" novalidate>
      ${stars("overall", T("overall"), true)}${stars("comfort", T("comfort"), true)}${stars("venue", T("venueRating"), false)}
      <label class="check"><input type="checkbox" id="again"><span>${esc(T("wouldBookAgain"))}</span></label>
      <div class="field"><label class="label" for="cm">${esc(T("commentLabel"))}</label><textarea class="input" id="cm" maxlength="500" aria-describedby="cmh"></textarea><span id="cmh" class="caption">${esc(T("commentHelp"))}</span></div>
      <div id="err" role="alert"></div>
      <button class="btn btn-primary btn-block" type="submit" id="go">${esc(T("send"))}</button>
    </form>
    <a class="btn btn-ghost btn-block" href="#/report/${id}">${esc(T("reportSeparate"))}</a>`);
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    const val = (n) => { const x = $$(`input[name=${n}]:checked`)[0]; return x ? Number(x.value) : null; };
    const c = await api("POST", `/api/v1/bookings/${id}/feedback`, { overall_rating: val("overall"), comfort_rating: val("comfort"), venue_rating: val("venue"),
      would_book_again: $("#again").checked, comment: $("#cm").value.trim() || null });
    if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); return; }
    view(T("fbThanks"), `<div class="center"><div class="success-check">${icon("check")}</div><h1>${esc(T("fbThanks"))}</h1>
      <a class="btn btn-secondary" href="#/booking/${id}">${esc(T("contactGo"))}</a>
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
    <a class="call" href="tel:999">${icon("phone")}${esc(T("emCall"))}</a><button class="btn btn-block" id="emc">${esc(T("emContinue"))}</button></div>`;
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
  const cats = Object.entries(REPORT_CATS);
  view(T("reportTitle"), `
    <h1>${esc(T("reportTitle"))}</h1>
    <p class="muted">${esc(T("reportIntro"))}</p>
    <form id="f" class="stack" novalidate>
      <label class="option" data-u="bdanger"><input type="checkbox" id="danger"><span class="tick" aria-hidden="true"></span><strong>${esc(T("dangerLabel"))}</strong></label>
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
    const done = () => view(T("reportTitle"), `<div class="center"><div class="success-check">${icon("check")}</div><h1>${esc(T("reportSent", { case: c.data.case_ref }))}</h1><a class="btn btn-primary" href="#/home">${esc(T("backHome"))}</a></div>`);
    if (c.data.emergency && c.data.emergency.show) { done(); emergencyScreen(); } else done();
  };
}

// ------------------------------------------------------------------ inbox, profile, cases
async function scrInbox() {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const r = await api("GET", "/api/v1/notifications");
  const list = r.ok ? r.data.notifications : [];
  const seen = store.get("inboxSeen");
  const isNew = (n) => !seen || new Date(n.created_at) > new Date(seen);
  if (r.ok) { if (list.length) store.set("inboxSeen", list[0].created_at); inboxFetch = null; showInboxBadge(0); }
  view(T("inbox"), `<h1 class="display-title">${esc(T("inbox"))}</h1>${list.length ? `<ul class="list">${list.map((n) => `
    <li class="card${isNew(n) ? " is-new" : ""}">${isNew(n) ? `<span class="badge badge-info new-tag">${esc(T("newTag"))}</span>` : ""}<p>${esc(n.text)}</p><div class="row between"><span class="caption">${esc(fmtDate(n.created_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</span>
    ${n.booking_id ? `<a href="#/booking/${n.booking_id}">${esc(T("viewDetails"))}</a>` : ""}</div></li>`).join("")}</ul>` : `<div class="empty"><div class="face" aria-hidden="true"></div><h2>${esc(T("noNotifications"))}</h2><p class="muted">${esc(T("inboxEmptyBody"))}</p></div>`}`);
}

async function scrProfile() {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const [bR, contact] = await Promise.all([api("GET", "/api/v1/bookings"), loadContact()]);
  const me = state.me;
  const name = me.display_name || T("unnamed");
  const count = bR.ok ? bR.data.bookings.filter((b) => b.status === "completed").length : 0;
  view(T("profile"), `
    <h1 class="display-title">${esc(T("profile"))}</h1>
    <section class="row"><span class="avatar" aria-hidden="true">${esc([...name][0])}</span>
      <span><strong>${esc(name)}</strong><br><span class="caption">${esc(T("eventsCount", { n: count }))}</span></span></section>
    <p class="section-label">${esc(T("secAccount"))}</p>
    <ul class="settings"><li><a class="chev" href="#/quiz/${INTERSTITIALS.start.length}"><span>${esc(T("myAnswers"))}</span></a></li>
      <li><a class="chev" href="#/plans"><span>${esc(T("plansTitle"))}</span></a></li>
      <li><a class="chev" href="#/notify?next=profile"><span>${esc(T("pushSettings"))}</span></a></li>
      <li><a class="chev" href="#/cases"><span>${esc(T("casesTitle"))}</span></a></li>
      <li><a class="chev" href="#/privacy"><span>${esc(T("privacyTitle"))}</span></a></li>
      <li><button class="chev" id="mydata"><span>${esc(T("myData"))}</span></button></li></ul>
    <p class="section-label">${esc(T("secPrefs"))}</p>
    <ul class="settings"><li><div class="static"><span>${esc(T("cityLabel"))}</span><span class="muted">${esc(T("cityFull"))}</span></div></li>
      <li><button class="chev" id="lng"><span>${esc(T("language"))}</span><span class="muted">${esc(T("langToggle"))}</span></button></li></ul>
    <p class="section-label">${esc(T("secHelp"))}</p>
    <section class="stack"><p class="caption">${esc(T("help"))}</p>${contactButtons(contact)}</section>
    <div class="stack" data-u="mt6">
      <button class="btn btn-secondary btn-block" id="out">${esc(T("signOut"))}</button>
      <button class="btn btn-danger btn-block" id="del">${esc(T("deleteAccount"))}</button></div>`);
  const forget = () => { session.clear(); clearDeviceProgress(); state.me = null; state.q = null; state.qAnswers = null; state.quiz = null; renderTopbar(); go("#/welcome"); };
  $("#lng").onclick = () => setLocale(locale === "ar" ? "en" : "ar");
  // a copy of her data (right of access, NMX-38): saved as a JSON file on the device, nothing kept in the page
  $("#mydata").onclick = async () => {
    const r = await api("GET", "/api/v1/users/me/export");
    if (!r.ok) return toast((r.data && r.data.message) || T("errGeneric"));
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `herzone-my-data-${(r.data.exported_at || "").slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(T("myDataDone"));
  };
  $("#out").onclick = async () => { const t = store.get("tokens"); await disablePush(); await api("POST", "/api/v1/auth/logout", { refresh_token: t && t.refresh_token }); forget(); };
  $("#del").onclick = async () => { if (!confirm(T("deleteConfirm"))) return; await disablePush(); await api("DELETE", "/api/v1/users/me"); forget(); };
}

// report categories and their labels (report form and "Decisions about you")
const REPORT_CATS = { harassment: "cHarassment", threat_violence: "cThreat", photo_without_consent: "cPhoto", stalking_unwanted_contact: "cStalking", fraud: "cFraud", disruptive: "cDisruptive" };

async function scrCases() {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const r = await api("GET", "/api/v1/cases/mine");
  const cases = r.ok ? r.data.cases : [];
  view(T("casesTitle"), `<h1>${esc(T("casesTitle"))}</h1>${cases.length ? `<ul class="list">${cases.map((c) => `
    <li class="card stack"><div class="row between"><strong>${num(c.case_ref)}</strong><span class="badge badge-warning">${esc(c.decision_label || c.decision)}</span></div>
    <p class="caption">${esc(fmtDate(c.event_date))} · ${esc(T(REPORT_CATS[c.category] || "cDisruptive"))}</p>
    ${c.can_appeal ? `<p class="caption">${esc(T("appealUntil", { date: fmtDate(c.appeal_until) }))}</p><button class="btn btn-secondary" data-ref="${esc(c.case_ref)}">${esc(T("appeal"))}</button>` : ""}</li>`).join("")}</ul>`
    : `<p class="muted">—</p>`}<div id="msg" role="status"></div>`);
  $$("[data-ref]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const a = await api("POST", `/api/v1/cases/${encodeURIComponent(b.dataset.ref)}/appeal`);
    $("#msg").innerHTML = a.ok ? `<div class="banner banner-success"><div>${esc(T("appealSent"))}</div></div>` : errorBanner(a.data);
  }));
}

// ------------------------------------------------------------------ router
const TABS = [["#/home", "tabHome", "house"], ["#/events", "tabEvents", "calendar-days"], ["#/inbox", "tabInbox", "bell"], ["#/profile", "tabProfile", "circle-user-round"]];
function renderTabbar(hash) {
  const nav = document.getElementById("tabbar");
  const active = TABS.find(([h]) => h === hash);
  nav.hidden = !(active && store.get("tokens"));
  if (nav.hidden) { nav.innerHTML = ""; return; }
  nav.setAttribute("aria-label", T("tabsLabel"));
  nav.innerHTML = TABS.map(([h, k, ic]) => `<a href="${h}" ${h === hash ? 'aria-current="page"' : ""}>${h === "#/inbox"
    ? `<span class="ti-wrap">${icon(ic, "ti")}<span class="tab-badge" id="inbox-badge" hidden></span></span>` : icon(ic, "ti")}<span>${esc(T(k))}</span></a>`).join("");
  if (hash !== "#/inbox") refreshInboxBadge();
}

// Unread count on the Notifications tab (NMX-18): notifications newer than the last time the inbox was opened on this
// device. Also shown on the home-screen app icon where the phone supports it (Badging API).
let inboxFetch = null;
async function refreshInboxBadge() {
  if (!inboxFetch || Date.now() - inboxFetch.at > 60000) inboxFetch = { at: Date.now(), p: api("GET", "/api/v1/notifications") };
  const r = await inboxFetch.p;
  if (!r.ok) return;
  showInboxBadge(unreadOf(r.data.notifications));
}
function unreadOf(list) {
  const seen = store.get("inboxSeen");
  return list.filter((n) => !seen || new Date(n.created_at) > new Date(seen)).length;
}
function showInboxBadge(n) {
  const b = document.getElementById("inbox-badge");
  if (b) {
    b.hidden = n === 0;
    b.textContent = n > 9 ? "9+" : String(n);
    b.closest("a").setAttribute("aria-label", n ? `${T("tabInbox")}، ${T("unreadCount", { n })}` : T("tabInbox"));
  }
  try { if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => null); } catch { /* unsupported */ }
}

const ROUTES = [
  [/^#\/welcome$/, scrWelcome], [/^#\/quiz\/(\d+)$/, scrQuiz], [/^#\/name$/, scrName], [/^#\/what-you-get$/, scrWhatYouGet],
  [/^#\/signin$/, scrPhone], [/^#\/otp$/, scrOtp], [/^#\/register$/, scrRegister],
  [/^#\/(?:questions\/\d+|summary)$/, () => go(`#/quiz/${INTERSTITIALS.start.length}`)], [/^#\/sessions(?:\?s=([\w-]+))?$/, scrSessions], [/^#\/events$/, scrEvents],
  [/^#\/booking\/([\w-]+)\/review$/, scrReview], [/^#\/pay\/return\/([\w-]+)$/, scrPayReturn], [/^#\/home$/, scrHome],
  [/^#\/booking\/([\w-]+)\/cancel$/, scrCancel], [/^#\/booking\/([\w-]+)\/choose$/, scrChoose], [/^#\/booking\/([\w-]+)\/feedback$/, scrFeedback],
  [/^#\/booking\/([\w-]+)$/, scrDetails], [/^#\/report\/([\w-]+)$/, scrReport], [/^#\/inbox$/, scrInbox], [/^#\/profile$/, scrProfile], [/^#\/cases$/, scrCases], [/^#\/privacy$/, scrPrivacy], [/^#\/plans$/, scrPlans], [/^#\/notify(?:\?next=(\w+))?$/, scrNotify],
];

async function route() {
  clearTimers();
  toastOnNavigate();
  const hash = location.hash || (store.get("tokens") ? "#/home" : "#/welcome");
  const quizStep = (h) => { const m = /^#\/quiz\/(\d+)$/.exec(h || ""); return m ? Number(m[1]) : null; };
  const from = quizStep(lastHash), to = quizStep(hash);
  navDir = from !== null && to !== null && from !== to ? (to > from ? "forward" : "back") : "fade";
  lastHash = hash;
  renderTabbar(hash);
  // the old screen must not take taps while the next one loads (audit F7/F16); view() re-enables it
  main.inert = true;
  main.setAttribute("aria-busy", "true");
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
// iOS Safari applies :active (the press feedback) only when the page listens for touches
document.addEventListener("touchstart", () => {}, { passive: true });
window.addEventListener("scroll", () => document.getElementById("topbar").classList.toggle("scrolled", window.scrollY > 4), { passive: true });
document.documentElement.lang = locale;
document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
document.querySelector(".skip").textContent = T("skip");
renderTopbar();
route();
// offline copy of the app's own files (sw.js, NMX-16); registering asks nothing of the member
if ("serviceWorker" in navigator && location.protocol === "https:") window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null));
