// HerZone user web app — SCR-01 … SCR-10 (v0.3 §1). Vanilla ES modules, hash router, RTL-first.
import { STRINGS } from "./strings.js";
import { COUNTRIES, DEFAULT_COUNTRY, countryByIso } from "./countries.js";
import { INTERSTITIALS, QUIZ_STORE_KEY, buildSteps, firstOpenStep, minutesLeft, toPayload, vibeOf, energyOf } from "./quiz-flow.js";
import { icon } from "./icons.js";
import { DEFAULT_PLAN, GUARANTEE_DAYS, PLANS, planPrices } from "./plans.js";
import { brandMark, tableSvg, vibeTable } from "./motif.js";
import { esc } from "./esc.js";
import { CFG, apiUrl } from "./api-url.js";

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
const DEVICE_PROGRESS = [QUIZ_STORE_KEY, "quizName", "phone", "country", "resume"];
function clearDeviceProgress() { DEVICE_PROGRESS.forEach((k) => store.del(k)); tabStore.del("challenge"); }
let locale = store.get("locale") || "ar";
const state = { me: null, q: null, qAnswers: null, quiz: null, phone: null, country: null, challenge: null, timers: [] };
const main = document.getElementById("main");
// Widths computed at render (the quiz progress bar) are set through the CSSOM, which the CSP allows, instead of style
// attributes, which it would block without 'unsafe-inline' (NMX-31).
new MutationObserver(() => main.querySelectorAll("[data-w]").forEach((e) => { e.style.width = `${Number(e.dataset.w) || 0}%`; }))
  .observe(main, { childList: true, subtree: true });

// ------------------------------------------------------------------ helpers
const T = (k, vars = {}) => String(STRINGS[locale][k] ?? STRINGS.ar[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (vars[n] ?? `{${n}}`));
const num = (s) => `<bdi class="num">${esc(s)}</bdi>`;
// a numeric range such as "18–24" is reordered to "24–18" inside Arabic text; keep it left to right
const optLabel = (s) => (/^\d+\s*[–-]\s*\d+$/.test(s) ? `<bdi dir="ltr">${esc(s)}</bdi>` : esc(s));
const intlLocale = () => (locale === "ar" ? "ar-QA-u-nu-latn" : "en-GB");
// The time and its "م" / "PM" never split across lines (no-break space), as in the app. Times are 12-hour in both
// languages, like the app ("6:47 PM", «6:47 م»), never "06:47" or "18:47".
const fmtDate = (iso, opts = { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) =>
  iso ? new Intl.DateTimeFormat(intlLocale(), { timeZone: "Asia/Qatar", ...opts, ...(opts.hour ? { hour12: true } : {}) }).format(new Date(iso))
    .replace(/(\d)[ \u202F](م|ص|am|pm|AM|PM)/g, (_, d, m) => `${d}\u00A0${m.toUpperCase()}`) : "";
const fmtTime = (iso) => fmtDate(iso, { weekday: "short", hour: "numeric", minute: "2-digit" });
const $ = (sel, root = main) => root.querySelector(sel);
const $$ = (sel, root = main) => [...root.querySelectorAll(sel)];
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function clearTimers() { state.timers.forEach((t) => clearInterval(t)); state.timers = []; }
function every(ms, fn) { const t = setInterval(fn, ms); state.timers.push(t); return t; }

// Toasts hide after 4 s and can be dismissed by tapping so they never keep covering content. A toast survives the one
// navigation that usually follows the action it confirms (e.g. quiz -> what you get), and is cleared on the next.
const lessMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Exits run 20% shorter than entrances (styles.css: in 220 ms, out 176 ms).
const EXIT_MS = 176;
function toast(msg) {
  const el = document.getElementById("toast");
  clearTimeout(toast.outT);
  el.classList.remove("out");
  el.textContent = msg;
  el.onclick = () => { clearTimeout(toast.t); hideToast(el); };
  clearTimeout(toast.t);
  toast.t = setTimeout(() => hideToast(el), 4000);
  toast.navs = 1;
}
function hideToast(el) {
  if (!el.textContent || lessMotion()) { el.textContent = ""; return; }
  el.classList.add("out");
  toast.outT = setTimeout(() => { el.textContent = ""; el.classList.remove("out"); }, EXIT_MS);
}
function toastOnNavigate() {
  if (toast.navs > 0) { toast.navs--; return; }
  clearTimeout(toast.t);
  clearTimeout(toast.outT);
  const el = document.getElementById("toast");
  el.classList.remove("out");
  el.textContent = "";
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

// The generic error (ours or the server's INTERNAL, same words) gets a next step (provisional, 13d-2).
const withNext = (msg) => (msg === T("errGeneric") ? `${msg} ${T("errGenericNext")}` : msg);
function errorBanner(err) {
  const msg = withNext((err && err.message) || T("errGeneric"));
  return `<div class="banner banner-danger" role="alert"><span class="icon">${icon("triangle-alert")}</span><div>${esc(msg)}</div></div>`;
}

// A failed load never looks like an empty list (a member with a paid booking must not read "no upcoming meetups"):
// the error and a retry that re-runs the screen. Spec v0.3 E-NET; the app's Loader does the same.
function failedView(title, r, again) {
  view(title, `<h1>${esc(title)}</h1><div class="stack">${errorBanner(r && r.data)}<button type="button" class="btn btn-secondary" id="retry-load">${esc(T("retry"))}</button></div>`);
  $("#retry-load").onclick = again;
}

// A request in flight: the button keeps its width and shows a spinner (styles.css .btn[aria-busy]); re-enabling clears both.
function setBusy(el, on) { el.disabled = on; if (on) el.setAttribute("aria-busy", "true"); else el.removeAttribute("aria-busy"); }
function loadingView() { main.innerHTML = `<div class="skel" role="status" aria-busy="true" aria-label="${esc(T("loading"))}"><span class="skel-title"></span><span class="skel-card"></span><span class="skel-card"></span><span class="skel-card short"></span></div>`; }

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
  const dark = isDark();
  document.getElementById("topbar").innerHTML = `
    <a class="brand" href="${signedIn ? "#/home" : "#/welcome"}">${brandMark()}<span class="brand-name">${esc(T("brand"))}${CFG.staging ? `<small class="env-badge">${esc(T("staging"))}</small>` : ""}</span></a>
    <span class="spacer"></span>
    <button class="icon-btn" id="theme" type="button" aria-label="${esc(T(dark ? "themeToLight" : "themeToDark"))}" title="${esc(T(dark ? "themeToLight" : "themeToDark"))}">${icon(dark ? "sun" : "moon")}</button>
    <button class="btn btn-ghost" id="lang" lang="${locale === "ar" ? "en" : "ar"}">${esc(T("langToggle"))}</button>`;
  document.getElementById("lang").onclick = () => setLocale(locale === "ar" ? "en" : "ar");
  document.getElementById("theme").onclick = () => setTheme(dark ? "light" : "dark");
}

// Light or dark: follows the device until she picks one; the choice is remembered on this device (q_theme, applied early by theme-init.js).
function isDark() {
  return (document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
}
// The new colours are revealed through a circle growing from the switch (a mask, not a fade) where the browser has View
// Transitions and motion is welcome; otherwise they change at once.
function setTheme(t) {
  const root = document.documentElement;
  const apply = () => {
    store.set("theme", t);
    root.setAttribute("data-theme", t);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.removeAttribute("media"); m.setAttribute("content", t === "dark" ? "#241620" : "#F7EDE3"); });
    renderTopbar();
    const sw = document.getElementById("theme");
    sw.classList.add("icon-swap");
    sw.focus();
  };
  const from = document.getElementById("theme");
  if (!document.startViewTransition || lessMotion() || !from) { apply(); return; }
  const r = from.getBoundingClientRect();
  root.style.setProperty("--vt-x", `${Math.round(r.left + r.width / 2)}px`);
  root.style.setProperty("--vt-y", `${Math.round(r.top + r.height / 2)}px`);
  root.classList.add("theme-reveal");
  document.startViewTransition(apply).finished.finally(() => root.classList.remove("theme-reveal"));
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
  funnel("signup_welcome");
  const saved = store.get(QUIZ_STORE_KEY);
  const resume = store.get("resume");
  const answered = saved ? Object.values(saved.answers || {}).filter((a) => a && a.length).length : 0;
  const canResume = Boolean(resume && /^#\/(quiz\/\d+|name|signin|otp)$/.test(resume) && (answered || store.get("quizName")));
  view(T("welcomeHeroPlain"), `
    <section class="hero-welcome">
      <h1>${esc(T("welcomeHero")).replace(/^(.+?)\s*\{em\}/, (_, lead) => `<span class="lead-in">${lead}</span> <em>${esc(T("welcomeHeroEm"))}</em>`)}</h1>
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
    </section>`);
  if (canResume) $("#over").onclick = () => { clearDeviceProgress(); state.quiz = null; go("#/quiz/0"); };
}

// ------------------------------------------------------------------ SCR-02a phone, 02b OTP, 02c registration
// The calling code is its own control: tapping it opens the list of every country we accept (Israel is not in it), which
// she can filter by name or by code. Qatar is the choice it starts on. Arrows move, Enter chooses, Escape closes.
const countryName = (c) => (locale === "en" ? c.en : c.ar);
const byName = () => [...COUNTRIES].sort((a, b) => countryName(a).localeCompare(countryName(b), locale === "en" ? "en" : "ar"));
const localPattern = (dial) => (dial === "974" ? "[3-7][0-9]{7}" : "[0-9]{4,15}");

function scrPhone() {
  if (!signedIn()) store.set("resume", "#/signin");
  funnel("signup_phone");
  if (!state.phone && store.get("phone")) state.phone = store.get("phone");
  if (!state.country) state.country = store.get("country") || DEFAULT_COUNTRY;
  let country = countryByIso(state.country);
  // the number kept on this device belongs to the country kept beside it
  const kept = state.phone && state.phone.startsWith(`+${country.dial}`) ? state.phone.slice(country.dial.length + 1) : "";
  view(T("phoneTitle"), `
    <h1>${esc(T("phoneTitle"))}</h1>
    <p class="muted">${esc(T("phoneHelp"))}</p>
    <form id="f" class="stack" novalidate>
      <div class="field">
        <label class="label" for="phone">${esc(T("phoneLabel"))}</label>
        <div class="phone">
          <select class="prefix" id="cc">
            ${byName().map((c) => `<option value="${esc(c.iso)}" ${c.iso === country.iso ? "selected" : ""}>+${esc(c.dial)} ${esc(countryName(c))}</option>`).join("")}
          </select>
          <input class="input" id="phone" inputmode="numeric" autocomplete="tel-national" maxlength="${country.dial === "974" ? 8 : 15}"
                 pattern="${localPattern(country.dial)}" required aria-describedby="perr" value="${esc(kept)}"></div>
        <div id="perr" class="error-text" role="alert"></div>
      </div>
      <button class="btn btn-primary btn-block" id="send" type="submit">${esc(T("sendCode"))}</button>
    </form>`);
  const sel = $("#cc"), input = $("#phone");
  // one dropdown, Qatar by default (owner, 11 Nov): no label text, no search box
  sel.onchange = () => {
    country = countryByIso(sel.value);
    state.country = country.iso;
    if (store.get("country")) store.set("country", country.iso);
    input.maxLength = country.dial === "974" ? 8 : 15;
    input.pattern = localPattern(country.dial);
    input.removeAttribute("aria-invalid");
    $("#perr").textContent = "";
    input.focus();
  };
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const digits = input.value.replace(/\D/g, "");
    const phone = `+${country.dial}${digits}`;
    const send = $("#send");
    setBusy(send, true);
    const r = await api("POST", "/api/v1/auth/otp:request", { phone_e164: phone, locale, purpose: "login" }, { noAuth: true });
    setBusy(send, false);
    if (!r.ok) { input.setAttribute("aria-invalid", "true"); $("#perr").textContent = withNext(r.data.message || T("errGeneric")); return; }
    state.phone = phone;
    state.challenge = r.data;
    if (store.get(QUIZ_STORE_KEY) || store.get("quizName")) { store.set("phone", phone); store.set("country", country.iso); }
    tabStore.set("challenge", { ch: r.data, phone, until: Date.now() + r.data.expires_in * 1000 });
    go("#/otp");
  };
}

function scrOtp() {
  const kept = tabStore.get("challenge");
  if (!state.challenge && kept && kept.until > Date.now()) { state.challenge = kept.ch; state.phone = kept.phone; }
  if (!state.challenge) { go("#/signin"); return; }
  funnel("signup_code");
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
    setBusy($("#ver"), true);
    const r = await api("POST", "/api/v1/auth/otp:verify", { challenge_id: ch.challenge_id, code: $("#code").value.trim(), locale, device: { platform: "web" } }, { noAuth: true });
    setBusy($("#ver"), false);
    if (!r.ok) {
      const d = r.data.details && r.data.details[0];
      $("#code").setAttribute("aria-invalid", "true");
      $("#oerr").textContent = withNext(r.data.message || T("errGeneric")) + (d && d.attempts_remaining != null ? ` · ${T("attemptsLeft", { n: d.attempts_remaining })}` : "");
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
  funnel("signup_register");
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
        <input class="input" id="name" maxlength="30" autocomplete="given-name" aria-describedby="nh" required><span id="nh" class="caption">${esc(T("nameHelp"))}</span></div>`}
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
    const name = quizName || ($("#name") ? $("#name").value.trim() : "");
    if (!name) { $("#err").innerHTML = `<div class="banner banner-danger" role="alert"><div>${esc(T("nameRequired"))}</div></div>`; $("#name").focus(); return; }
    const body = {
      display_name: name, locale, age_eligibility_confirmed: $("#age").checked, woman_confirmed: $("#woman").checked,
      consents: Object.keys(L).filter((t) => ["terms", "conduct", "privacy_notice", "marketing"].includes(t))
        .map((t) => ({ type: t, document_version: L[t].document_version, granted: checked.has(t) })),
    };
    setBusy($("#go"), true);
    const r = await api("POST", "/api/v1/users/me/registration", body);
    setBusy($("#go"), false);
    if (!r.ok) { $("#err").innerHTML = errorBanner(r.data); return; }
    funnel("signup_done");
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

// "About 3 min left" for the questions still to answer, this one included (U3, provisional).
// The owner's wording (11 Nov): one minute, two minutes, then "a few minutes". The longest questionnaire is about
// four minutes, so no larger number is reached. The app says the same (quiz_screen.dart).
function timeLeftText(remaining) {
  const m = minutesLeft(remaining);
  return T(m === 0 ? "timeLeftUnder" : m === 1 ? "timeLeftOne" : m === 2 ? "timeLeftTwo" : "timeLeftFew");
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
  if (!signedIn() && i === 0) funnel("signup_quiz");
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
      <p class="step-k">${esc(T("qStep", { i: step.index + 1, n }))}<span class="time-left"> · ${esc(timeLeftText(n - step.index))}</span></p>
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
    ready: () => `<div class="done-art">${tableSvg({ seats: 6, filled: 6 })}</div><h1>${esc(T("readyTitle"))}</h1><p class="lead">${esc(T("readyBody"))}</p>
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
    toast(withNext(r.data.message || T("errGeneric")));
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
// ok | denied | unsupported (an iPhone Safari tab counts as unsupported: no home-screen steps, owner's decision 5 Nov)
function pushSupport() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
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
    setBusy($("#push-go"), true);
    let r;
    try { r = await enablePush(); } catch { r = "error"; }
    if (r === "granted") { toast(T("pushOnDone")); done(); return; }
    setBusy($("#push-go"), false);
    $("#push-msg").innerHTML = `<div class="banner banner-info"><div>${esc(withNext(T(r === "denied" ? "pushDenied" : r === "default" ? "pushLater" : "errGeneric")))}</div></div>`;
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
  // Item 41 (owner, 11 Nov): nothing about money is said before the last step, so while the launch offer is on this
  // page carries no fee at all. The amount still exists and is shown, with the offer, on the booking review.
  const launchFree = Boolean(s && s.launch_free);
  const plan = { kind: "per_seat", fee: s && !launchFree ? s.price.display : null, hours: s ? s.full_refund_until_hours : null };
  const benefits = [["users", "wyg1t", "wyg1b"], ["map-pin", "wyg2t", "wyg2b"], ["message-circle", "wyg3t", "wyg3b"], ["shield-check", "wyg4t", "wyg4b"], ["hand-heart", "wyg5t", "wyg5b"]];
  view(T("wygTitle"), `
    <h1 class="display-title">${esc(T("wygTitle"))}</h1>
    <section class="card stack" id="plan" data-kind="${plan.kind}">
      ${launchFree ? "" : `<p class="label">${esc(plan.fee ? T("wygPrice", { fee: plan.fee }) : T("wygPriceNoFee"))}</p>`}
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
    setBusy($("#promo-go"), true);
    const r = await api("POST", "/api/v1/promo-codes:check", { code });
    setBusy($("#promo-go"), false);
    if (!r.ok) { $("#promo-msg").innerHTML = errorBanner(r.data); return; }
    pct = r.data.valid ? r.data.percent_off : 0;
    $("#promo-msg").innerHTML = r.data.valid ? `<div class="banner banner-success pulse"><div>${esc(T("promoOk", { n: pct }))}</div></div>`
      : `<div class="banner banner-danger"><div>${esc(T("promoBad"))}</div></div>`;
    paint();
  };
}

// ------------------------------------------------------------------ SCR-04 sessions
// Waitlist offer (021): a seat kept for her for a while (h:mm left), and the offer text of v0.3 §4.3 in her language.
const offerOf = (s) => (s.waitlist && s.waitlist.status === "offered" ? s.waitlist : null);
const offerLeft = (o) => { const m = Math.max(0, Math.ceil((new Date(o.offer_expires_at) - Date.now()) / 60000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
const offerText = (s) => T("waitlistOffer", { date: fmtDate(s.starts_at), window: offerOf(s).window_text });

// Day and area filters appear on the session list only when more sessions than this are listed (item 43, provisional).
const FILTERS_ABOVE = 8;

// "Notify me when a session is available" (v0.3 E-LANG-1, migration 023): shown with "no sessions in your languages".
function notifyMeBox(active) {
  return active ? `<p class="caption" role="status" id="nm-on">${esc(T("notifyMeOn"))}</p>`
    : `<button type="button" class="btn btn-secondary" id="notify-me">${icon("bell")}<span>${esc(T("notifyMe"))}</span></button>`;
}
function wireNotifyMe() {
  const b = $("#notify-me");
  if (!b) return;
  b.onclick = async () => {
    setBusy(b, true);
    const r = await api("POST", "/api/v1/session-alerts", {});
    // a failure keeps the button (one error under it, not one per try)
    if (!r.ok) { $("#nm").innerHTML = notifyMeBox(false) + errorBanner(r.data); wireNotifyMe(); return; }
    $("#nm").innerHTML = notifyMeBox(true);
  };
}

async function scrSessions(preselect) {
  if (!(await guard())) return;
  loadingView();
  funnel("booking_sessions");
  const r = await api("GET", "/api/v1/sessions");
  if (!r.ok) { view(T("sessionsTitle"), `<h1>${esc(T("sessionsTitle"))}</h1>${errorBanner(r.data)}`); return; }
  const pre = preselect && r.data.sessions.find((x) => x.id === preselect);
  if (pre) store.set("exp", pre.experience);
  const exp = store.get("exp") || "dinner";
  const all = r.data.sessions.filter((x) => x.experience === exp);
  const ok = all.filter((s) => s.language_match);
  const card = (s) => `<div class="sess" data-id="${s.id}">
    <label class="option radio" data-u="start">
      <input type="radio" name="s" value="${s.id}" ${s.is_full || s.my_booking_id ? "disabled" : ""}>
      <span class="tick" aria-hidden="true"></span>
      <span class="stack" data-u="flex1">
        <span class="row between"><strong>${esc(fmtDate(s.starts_at))}</strong>
          ${s.my_booking_id ? `<span class="badge badge-success">${esc(T("alreadyBooked"))}</span>` : offerOf(s) ? `<span class="badge badge-warning">${esc(T("holdTimer"))} <span class="num">${esc(offerLeft(offerOf(s)))}</span></span>` : s.is_full ? `<span class="badge badge-danger">${esc(T("full"))}</span>` : `<span class="badge badge-info">${esc(T("seatsLeft", { n: s.seats_left }))}</span>`}</span>
        <span class="caption">${esc(s.district)} · ${esc(T(s.conversation_language === "ar" ? "langAr" : "langEn"))} · ${esc(T("groupSize"))} · ${esc(s.price.display)}</span>
        ${offerOf(s) ? `<span class="caption offer-note">${esc(offerText(s))}</span>` : ""}
      </span></label>
    ${s.is_full && !s.my_booking_id ? (s.waitlist ? `<p class="caption">${esc(T("onWaitlist", { n: s.waitlist.position }))}</p>`
      : `<button class="btn btn-secondary" data-wait="${s.id}">${esc(T("joinWaitlist"))}</button>`) : ""}</div>`;
  // a long list gets day and area chips; "All" in each group shows everything again
  const days = [...new Set(ok.map((s) => qatarDay(s.starts_at)))];
  const areas = [...new Set(ok.map((s) => s.district))];
  const chip = (name, value, label) => `<label class="chip"><input type="radio" name="${name}" value="${esc(value)}" ${value === "" ? "checked" : ""}><span>${esc(label)}</span></label>`;
  const filters = ok.length > FILTERS_ABOVE ? `<div class="filters" id="filters">
      <fieldset><legend class="label">${esc(T("filterDay"))}</legend><div class="chips">${chip("fday", "", T("filterAll"))}${days.map((d) =>
        chip("fday", d, fmtDate(ok.find((s) => qatarDay(s.starts_at) === d).starts_at, { weekday: "short", day: "numeric" }))).join("")}</div></fieldset>
      <fieldset><legend class="label">${esc(T("district"))}</legend><div class="chips">${chip("farea", "", T("filterAll"))}${areas.map((a, k) => chip("farea", String(k), a)).join("")}</div></fieldset>
    </div>` : "";
  view(T("sessionsTitle"), `
    <h1>${esc(T("sessionsTitle"))}</h1>
    <div class="segmented" role="group" aria-label="${esc(T("experience"))}">
      <button type="button" data-exp="dinner" aria-pressed="${exp === "dinner"}">${esc(T("dinner"))}</button>
      <button type="button" data-exp="coffee" aria-pressed="${exp === "coffee"}">${esc(T("coffee"))}</button>
    </div>
    ${filters}
    <form id="f" class="stack" novalidate>
      ${ok.length ? `<fieldset><legend class="sr-only">${esc(T("sessionsTitle"))}</legend><div class="options">${ok.map(card).join("")}</div>
        <p class="caption" id="no-match" role="status" hidden>${esc(T("noFilterMatch"))}</p></fieldset>`
        : `<div class="banner banner-info" id="no-sessions"><div class="stack"><p>${esc(T("noSessions"))} <a href="#/quiz/${stepOfKey("Q01")}">${esc(T("editLanguages"))}</a></p>
          <div id="nm">${notifyMeBox(r.data.notify_me_active)}</div></div></div>`}
      <fieldset id="alts" hidden><legend class="label">${esc(T("alternatesLegend"))}</legend><p class="caption">${esc(T("alternatesHelp"))}</p><div class="options" id="altlist"></div></fieldset>
      <fieldset id="occ" hidden><legend class="label">${esc(T("occasionLegend"))}</legend><div class="options">
        ${[["birthday", "occasionBirthday"], ["other", "occasionOther"], ["", "occasionNo"]].map(([v, k]) => `<label class="option radio"><input type="radio" name="occasion" value="${v}" ${v ? "" : "checked"}><span class="tick" aria-hidden="true"></span><span>${esc(T(k))}</span>${v === "birthday" ? icon("cake") : ""}</label>`).join("")}
      </div></fieldset>
      <p class="caption occ-note" id="occ-note" hidden></p>
      <div id="err" role="alert"></div>
    </form>
    <div class="sticky-bar"><div>
      ${(ok[0] || all[0] || {}).launch_free ? "" : `<span class="caption">${esc(T("priceStrip", { fee: (ok[0] || all[0] || { price: { display: "" } }).price.display }))}</span>`}
      <button class="btn btn-primary btn-block" id="go" disabled>${esc(T("continueToPay"))}</button></div></div>`);
  $$("[data-exp]").forEach((b) => (b.onclick = () => { store.set("exp", b.dataset.exp); scrSessions(); }));
  wireNotifyMe();
  // filters hide whole rows; a chosen session that gets hidden is let go, so "Continue" never books one she cannot see
  $$("#filters input").forEach((x) => (x.onchange = () => {
    const day = ($$("input[name=fday]").find((i) => i.checked) || {}).value || "";
    const k = ($$("input[name=farea]").find((i) => i.checked) || {}).value || "";
    let shown = 0;
    for (const s of ok) {
      const row = $(`.sess[data-id="${s.id}"]`);
      row.hidden = Boolean((day && qatarDay(s.starts_at) !== day) || (k !== "" && s.district !== areas[Number(k)]));
      if (!row.hidden) shown += 1;
      const radio = $("input[name=s]", row);
      if (row.hidden && radio.checked) { radio.checked = false; $("#go").disabled = true; $("#alts").hidden = true; $("#occ").hidden = true; }
    }
    $("#no-match").hidden = shown > 0;
  }));
  $$("[data-wait]").forEach((b) => (b.onclick = async () => {
    const w = await api("POST", `/api/v1/sessions/${b.dataset.wait}/waitlist`);
    toast(w.ok ? T("onWaitlist", { n: w.data.position }) : withNext(w.data.message || T("errGeneric")));
  }));
  const radios = $$("input[name=s]");
  // Item 32 (provisional): a celebration needs notice (server: CELEBRATION_NOTICE_HOURS); for a sooner session the
  // question is hidden, the answer goes back to "No" and a short note says why.
  const occasionFor = (allowed, hours) => {
    $("#occ").hidden = !allowed;
    $("#occ-note").hidden = allowed;
    if (allowed) return;
    $$("input[name=occasion]").forEach((o) => { o.checked = !o.value; });
    $("#occ-note").textContent = T("occasionNotice", { days: Math.ceil(hours / 24) });
  };
  radios.forEach((x) => (x.onchange = () => {
    setBusy($("#go"), false);
    const others = ok.filter((s) => s.id !== x.value && !s.my_booking_id);
    $("#alts").hidden = !others.length;
    const picked = ok.find((s) => s.id === x.value) || {};
    occasionFor(picked.occasion_allowed !== false, picked.occasion_notice_hours);
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
    setBusy($("#go"), true);
    const occasion = $("#occ").hidden ? null : ($$("input[name=occasion]").find((o) => o.checked) || {}).value || null;
    const r2 = await api("POST", "/api/v1/bookings", { session_id: chosen.value, alternate_session_ids: $$("input[name=alt]:checked").map((a) => a.value), occasion });
    setBusy($("#go"), false);
    const late = !r2.ok && (r2.data.details || []).find((d) => d.field === "occasion" && d.code === "NOTICE_TOO_SHORT");
    if (late) { $("#err").innerHTML = ""; occasionFor(false, late.min_notice_hours); return; }   // the date came closer while she chose
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
  if (!expired) funnel("booking_review");
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
      <div class="kv"><span>${esc(T("feeNow"))}</span>${b.launch_free
        ? `<span class="fee-offer"><s class="num">${esc(b.amount.display)}</s> <strong>${esc(T("feeLaunchFree"))}</strong></span>`
        : `<strong>${esc(b.amount.display)}</strong>`}</div>
      ${b.launch_free ? `<p class="caption" id="launch-note">${esc(T("feeLaunchNote"))}</p>` : ""}
      <div class="kv"><span>${esc(T("foodAtVenue"))}</span><span class="muted">${esc(T("foodBand", { band: e.session.food_price_band.display }))}</span></div>
    </section>
    ${policyHtml(e.booking.cancellation, b.amount.display)}
    ${b.payment && b.payment.status === "failed" ? `<div class="banner banner-warning" role="alert"><div>${esc(T("paymentFailed"))} ${esc(T("payFailedNext"))} ${esc(T("noDoubleCharge"))}</div></div>` : ""}
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
      // a seat kept from the waitlist (021) is held for up to hours: h:mm:ss then
      $("#clock").textContent = s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
        : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      if (s === 120 || s === 30) $("#holdlive").textContent = `${T("holdTimer")} ${$("#clock").textContent}`;
      if (s === 0) { clearTimers(); scrReview(id); }
    };
    tick(); every(1000, tick);
    if (needAck) $("#ack").onchange = () => { $("#pay").disabled = !$("#ack").checked; };
    $("#pay").onclick = async () => {
      if (needAck && !$("#ack").checked) return;
      setBusy($("#pay"), true);
      let url = b.checkout_url;
      if (!url) {
        const c = await api("POST", `/api/v1/bookings/${id}/checkout`, needAck ? { acknowledge_late_no_refund: true } : undefined);
        if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); setBusy($("#pay"), false); return; }
        url = c.data.checkout_url;
      }
      funnel("booking_checkout", { keepalive: true }); // the page is about to be left for the payment page
      clearTimers();   // the hold clock must not tick into the replaced view while the browser navigates
      main.innerHTML = `<div class="center"><div class="spinner" aria-hidden="true"></div><h1>${esc(T("redirecting"))}</h1></div>`;
      location.assign(url);
    };
  }
  $("#change").onclick = async () => { await api("POST", `/api/v1/bookings/${id}/cancel`, {}); go("#/sessions"); };
}

// Coordinator on duty (audit F10): real call / WhatsApp buttons when configured, loaded once per page load.
// The same answer carries the public setting funnel_counter (021): whether to send step pings.
async function loadContact() {
  if (state.contact !== undefined) return state.contact;
  const r = await api("GET", "/api/v1/support/contact", undefined, { noAuth: true });
  // the coordinator's number is public; keep the last one so "call" still works with no data connection
  if (r.ok) store.set("contact", r.data.coordinator);
  state.contact = r.ok ? r.data.coordinator : r.data && r.data.code === "OFFLINE" ? store.get("contact") : null;
  state.funnelOn = Boolean(r.ok && r.data.funnel_counter === true);
  return state.contact;
}

// Step counter (021, item 44, provisional; off unless the server says it is on): one ping per sign-up or booking step per
// page load, carrying only the step and "web". No sign-in token, cookie or device id is sent, and nothing is kept here.
const funnelSent = new Set();
async function funnel(step, opts = {}) {
  if (funnelSent.has(step)) return;
  funnelSent.add(step);
  await loadContact();
  if (!state.funnelOn) return;
  api("POST", "/api/v1/funnel/steps", { step, platform: "web" }, { noAuth: true, keepalive: !!opts.keepalive }).catch(() => null);
}
function contactButtons(c, bookingId = "") {
  if (!c) return "";
  return `<button type="button" class="btn btn-secondary btn-block" id="contact-open" data-contact-open data-booking="${esc(bookingId)}" data-tel="${esc(c.tel_url)}" data-wa="${esc(c.whatsapp_url || "")}">${icon("message-circle")}<span>${esc(T("contactRequest"))}</span></button>`;
}
// "Request contact" (owner's design, 5 Nov): the page blurs and a sheet offers
//   level 1  Phone call | WhatsApp chat
//   level 2  (Phone call) Request contact: a note, the number, when | Call us now: dials the coordinator at once
//   level 3  the request form; then a confirmation.
// WhatsApp opens the coordinator's chat with a first message carrying her name and her next booking's number (no membership
// number exists). A native modal <dialog> gives the focus trap, Escape and the inert page behind it; focus returns to the button.
const WHEN_CHOICES = [["now", "csWhenNow"], ["10min", "csWhen10"], ["1h", "csWhen60"], ["tomorrow", "csWhenTomorrow"]];
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-contact-open]");
  if (!b) return;
  const { tel, wa, booking: bookingId } = b.dataset;
  const me = state.me || {};
  let bk = null; // her next booking: the one on this screen, or the soonest active one
  const who = () => [me.display_name, bk ? `#${bk.ref}` : ""].filter(Boolean).join(" ");
  const waLink = () => `${wa}?text=${encodeURIComponent(who() ? T("waHello", { who: who() }) : T("waHelloAnon"))}`;
  const dlg = document.createElement("dialog");
  dlg.className = "contact-sheet";
  dlg.setAttribute("aria-labelledby", "cs-title");
  const title = (k) => `<h2 id="cs-title" class="sr-only">${esc(T(k))}</h2>`;
  const levels = {
    top: () => `${title("contactRequest")}
      <button type="button" class="btn btn-primary" data-go="phone">${icon("phone")}<span>${esc(T("csPhone"))}</span></button>
      ${wa ? `<a class="btn btn-secondary" id="wa-coord" href="${esc(waLink())}" target="_blank" rel="noopener noreferrer">${icon("message-circle")}<span>${esc(T("csChat"))}</span></a>` : ""}
      <button type="button" class="btn btn-ghost" data-close>${esc(T("close"))}</button>`,
    phone: () => `${title("csPhone")}
      <div class="cs-group"><button type="button" class="btn btn-primary" data-go="form"><span>${esc(T("csRequest"))}</span></button><p class="cs-hint">${esc(T("csRequestSub"))}</p></div>
      <div class="cs-group"><a class="btn btn-secondary" id="call-coord" href="${esc(tel)}"><span>${esc(T("csCallNow"))}</span></a><p class="cs-hint">${esc(T("csCallNowSub"))}</p></div>
      <button type="button" class="btn btn-ghost" data-go="top">${esc(T("back"))}</button>`,
    form: () => `${title("csRequest")}
      <form class="cs-form" novalidate>
        <label class="label" for="cs-msg">${esc(T("csMessageLabel"))}</label>
        <textarea id="cs-msg" class="input" rows="4" maxlength="500" required></textarea>
        <label class="label" for="cs-phone">${esc(T("csPhoneLabel"))}</label>
        <input id="cs-phone" class="input" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" value="${esc(me.phone_e164 || "")}" required>
        <fieldset class="cs-when"><legend class="label">${esc(T("csWhenLabel"))}</legend>
          ${WHEN_CHOICES.map(([v, k], n) => `<label class="chip"><input type="radio" name="cs-when" value="${v}"${n === 0 ? " checked" : ""}><span>${esc(T(k))}</span></label>`).join("")}
        </fieldset>
        <div id="cs-err" data-call-msg></div>
        <button type="submit" class="btn btn-primary">${esc(T("csSend"))}</button>
        <button type="button" class="btn btn-ghost" data-go="phone">${esc(T("back"))}</button>
      </form>`,
    sent: () => `${title("csRequest")}
      <div class="banner banner-success pulse" role="status"><div>${esc(T("callRequested"))}</div></div>
      <button type="button" class="btn btn-ghost" data-close>${esc(T("close"))}</button>`,
  };
  const show = (level) => {
    dlg.innerHTML = levels[level]();
    if (dlg.open) { dlg.classList.remove("level-in"); void dlg.offsetWidth; dlg.classList.add("level-in"); } // the new level fades in
    const first = dlg.querySelector("textarea, button, a");
    if (first) first.focus();
  };
  // it shrinks back into the button that opened it, a little faster than it came out
  const closeSheet = () => {
    if (!dlg.open || dlg.classList.contains("closing")) return;
    if (lessMotion()) { dlg.close(); return; }
    dlg.classList.add("closing");
    setTimeout(() => dlg.close(), EXIT_MS);
  };
  dlg.addEventListener("cancel", (ev) => { ev.preventDefault(); closeSheet(); }); // Escape
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", (ev) => {
    if (ev.target === dlg) { closeSheet(); return; }
    const go = ev.target.closest("[data-go]");
    if (go) { show(go.dataset.go); return; }
    if (ev.target.closest("[data-close], a")) closeSheet(); // WhatsApp and "Call us now" open, and the sheet closes
  });
  dlg.addEventListener("input", () => { const m = dlg.querySelector("#cs-err"); if (m) m.innerHTML = ""; }); // typing clears the message
  dlg.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = dlg.querySelector("#cs-msg").value.trim();
    const phone = dlg.querySelector("#cs-phone").value.trim();
    const err = dlg.querySelector("#cs-err");
    if (!msg) { err.innerHTML = errorBanner({ message: T("csMessageNeeded") }); dlg.querySelector("#cs-msg").focus(); return; }
    if (!phone) { err.innerHTML = errorBanner({ message: T("csPhoneBad") }); dlg.querySelector("#cs-phone").focus(); return; }
    const body = { message: msg, callback_when: dlg.querySelector("input[name=cs-when]:checked").value };
    if (phone.replace(/[\s-]/g, "") !== (me.phone_e164 || "")) body.contact_phone = phone; // only when it is not the number she signed up with
    const bid = bookingId || (bk && bk.id);
    if (bid) body.booking_id = bid;
    const send = dlg.querySelector("button[type=submit]");
    setBusy(send, true);
    err.innerHTML = "";
    const r = await api("POST", "/api/v1/support/call-requests", body);
    if (r.ok) { show("sent"); return; }
    setBusy(send, false);
    const bad = r.status === 422 && (r.data.details || []).some((d) => d.field === "contact_phone");
    err.innerHTML = errorBanner(bad ? { message: T("csPhoneBad") } : r.data);
  });
  show("top");
  document.body.appendChild(dlg);
  dlg.showModal();
  // it grows out of the button that opened it
  const from = b.getBoundingClientRect(), at = dlg.getBoundingClientRect();
  dlg.style.transformOrigin = `${Math.round(from.left + from.width / 2 - at.left)}px ${Math.round(from.top + from.height / 2 - at.top)}px`;
  // her next booking, for the WhatsApp message and the request; the link is updated when it arrives
  api("GET", "/api/v1/bookings").then((r) => {
    const list = (r.ok && r.data.bookings) || [];
    bk = list.find((x) => x.id === bookingId) || list.filter((x) => ACTIVE.includes(x.status)).sort((p, q) => String(p.starts_at).localeCompare(String(q.starts_at)))[0] || null;
    const a = dlg.querySelector("#wa-coord");
    if (a) a.href = waLink();
  });
});

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
      funnel("booking_paid");
      const it = b.item;
      view(T("allSetTitle"), `<div class="center all-set"><div class="success-check">${icon("check")}</div><h1>${esc(T("allSetTitle"))}</h1>
        <p class="lead">${esc(T("paidTitle"))}</p>
        ${it ? `<div class="card booking-peek"><span class="bi">${icon(it.experience === "coffee" ? "coffee" : "utensils")}</span>
          <span><strong>${esc(T(it.experience))}</strong><br><span>${esc(fmtDate(it.starts_at))}</span>${it.district ? `<br><span class="muted">${esc(it.district)}</span>` : ""}</span></div>` : ""}
        <ol class="next-steps">${["allSet1", "allSet2", "allSet3"].map((k) => `<li>${esc(T(k))}</li>`).join("")}</ol>
        <p class="caption">${esc(T("bookingRef"))} ${num(b.ref)}</p><a class="btn btn-primary btn-block" href="#/home">${esc(T("goDashboard"))}</a></div>`);
    } else if (phase === "failed") {
      view(T("paymentFailed"), `<div class="center"><h1>${esc(T("paymentFailed"))}</h1><p class="muted" id="pay-next">${esc(T("payFailedNext"))} ${esc(T("noDoubleCharge"))}</p>
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
  const status = s.my_booking_id ? T("alreadyBooked") : offerOf(s) ? `${T("holdTimer")} ${offerLeft(offerOf(s))}` : s.is_full ? T("full") : T("seatsLeft", { n: s.seats_left });
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
  if (!sR.ok || !bR.ok) return failedView(T("city"), sR.ok ? bR : sR, scrHome);
  const docs = legalR && legalR.ok ? outdated.filter((k) => legalR.data[k]).map((k) => ({ type: k, ...legalR.data[k] })) : [];
  const onlyPrivacy = docs.length === 1 && docs[0].type === "privacy_notice";
  const DOC_NAME = { terms: "docTerms", conduct: "docConduct", privacy_notice: "privacyTitle" };
  const sessions = sR.ok ? sR.data.sessions.filter((x) => x.language_match !== false) : [];
  const offers = sR.ok ? sR.data.sessions.filter(offerOf) : []; // seats kept for her from the waitlist (021)
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
    ${offers.map((s) => `<div class="banner banner-info"><div>${esc(offerText(s))} <a href="#/sessions?s=${esc(s.id)}">${esc(T("bookSeat"))}</a></div></div>`).join("")}
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
      setBusy($("#woman-ok"), true);
      const r = await api("POST", "/api/v1/users/me/consents", { consents: [], woman_confirmed: true });
      if (!r.ok) { setBusy($("#woman-ok"), false); $("#woman-err").innerHTML = errorBanner(r.data); return; }
      await loadMe(true);
      toast(T("womanConfirmed"));
      scrHome();
    };
  }
  if (docs.length) {
    $("#pv-ok").onclick = async () => {
      setBusy($("#pv-ok"), true);
      const r = await api("POST", "/api/v1/users/me/consents", { consents: docs.map((d) => ({ type: d.type, document_version: d.document_version, granted: true })) });
      if (!r.ok) { setBusy($("#pv-ok"), false); $("#pv-err").innerHTML = errorBanner(r.data); return; }
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
  if (!r.ok) return failedView(T("eventsTitle"), r, scrEvents);
  const bookings = r.data.bookings;
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
  // identity check (015): the venue and table code wait for the review of the name on her card
  const idNote = e.identity_check === "pending" ? `<div class="banner banner-info" id="id-check" role="status"><span class="icon">${icon("info")}</span><div>${esc(T("idCheckPending"))}</div></div>` : "";
  view(T("detailsTitle"), `${offlineNote}${idNote}
    <header class="det-head">${track ? "" : statusBadge(e.booking)}
      <h1>${esc(T("detailsHead", { exp: T(e.session.experience), day: fmtDate(e.session.starts_at, { weekday: "long" }) }))}</h1>
      <span class="when num">${esc(fmtDate(e.session.starts_at, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }))}</span>
      <span class="ref">${num(e.booking.ref)}${cd ? ` · ${esc(cd)}` : ""}</span></header>
    ${track}
    <ul class="facts-list" aria-label="${esc(T("essentials"))}">
      <li>${icon("map-pin")}<span>${esc(e.session.district)}</span><span class="k">${esc(T("district"))}</span></li>
      <li>${icon("languages")}<span>${esc(T(e.session.conversation_language === "ar" ? "langAr" : "langEn"))}</span><span class="k">${esc(T("tableLanguage"))}</span></li>
      <li>${icon("wallet")}<span>${esc(e.session.food_price_band.display)}</span><span class="k">${esc(T("foodBandLabel"))}</span></li>
      <li>${icon("clock")}<span class="num">${esc(fmtDate(e.session.starts_at, { hour: "numeric", minute: "2-digit" }))}</span><span class="k">${esc(T("dateTime"))}</span></li>
      ${acc ? `<li>${icon("info")}<span>${esc(acc)}</span><span class="k">${esc(T("accessibility"))}</span></li>` : ""}</ul>
    ${e.table ? `<section class="card stack"><div class="table-figure">${tableSvg({ seats: e.table.capacity, filled: e.table.confirmed_count,
        label: T("tableSeats", { n: e.table.confirmed_count, cap: e.table.capacity }) })}
      <div><h2>${esc(T("yourTable"))}</h2><p class="label">${esc(T("confirmedCount", { n: e.table.confirmed_count }))}</p></div></div>
      ${e.table.shared_themes && e.table.shared_themes.length ? `<p class="shared-themes">${icon("sparkle")}<span>${esc(T("sharedThemes", { list: e.table.shared_themes.join(T("listSep")) }))}</span></p>` : ""}
      ${e.table.celebration ? `<p class="shared-themes" id="celebration">${icon(e.table.celebration === "birthday" ? "cake" : "sparkle")}<span>${esc(T(e.table.celebration === "birthday" ? "celebrationBirthday" : "celebrationOther"))}</span></p>` : ""}
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
    ${e.refund ? `<section class="card"><div class="kv"><span>${esc(T("refundLabel"))}</span><strong>${esc(T({ requested: "rfRequested", processing: "rfProcessing", refunded: "rfRefunded", failed: "rfFailed", none: "rfNone" }[e.refund.status]))}${e.refund.amount ? ` · ${esc(e.refund.amount.display)}` : ""}</strong></div>${e.refund.status === "failed" ? `<p class="caption" id="rf-next">${esc(T("rfFailedNext"))}</p>` : ""}</section>` : ""}
    ${e.rebooked_into ? `<div class="banner banner-success"><div>${esc(T("rebookedInto", { ref: e.rebooked_into.ref }))} <a href="#/booking/${e.rebooked_into.booking_id}">${esc(T("viewDetails"))}</a></div></div>` : ""}
    <section class="stack" data-u="mt6"><p class="caption">${esc(T("support"))}</p>${contactButtons(contact, id)}
      ${!saved && (act("report") || ["revealed", "locked", "forming"].includes(ph)) ? `<a class="btn btn-ghost btn-block" href="#/report/${id}">${icon("flag")}${esc(T("privateReport"))}</a>` : ""}</section>
    ${act("cancel") ? `<section class="stack" data-u="mt6"><a class="btn btn-danger btn-block" href="#/booking/${id}/cancel">${esc(T("cancelBooking"))}</a>
      <p class="caption">${esc(e.booking.cancellation.refund_if_cancelled_now === "full" ? T("policyBox", { deadline: fmtDate(e.booking.cancellation.full_refund_until) })
        : T("refundNone", { deadline: fmtDate(e.booking.cancellation.full_refund_until) }))}</p></section>` : ""}`);
  const ci = $("#ci");
  if (ci) ci.onclick = async () => { setBusy(ci, true); const c = await api("POST", `/api/v1/bookings/${id}/check-in`); if (c.ok) scrDetails(id); else { $("#msg").innerHTML = errorBanner(c.data); setBusy(ci, false); } };
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
  box.innerHTML = `${note ? `<div class="banner banner-success pulse" role="status"><div>${esc(note)}</div></div>` : ""}
    ${c.members.length ? `<ul class="list" data-u="gap0">${c.members.map(row).join("")}</ul>` : ""}
    <p class="caption">${esc(c.open ? T("contactUntil", { date: fmtDate(c.closes_at) }) : T("contactClosed"))}</p>
    <div id="contacts-err" role="alert"></div>`;
  const act = async (btn, method, path, body, done) => {
    setBusy(btn, true);
    const x = await api(method, path, body);
    if (!x.ok) { setBusy(btn, false); $("#contacts-err").innerHTML = errorBanner(x.data); return; }
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
    setBusy($("#go"), true);
    const sel = $$("input[name=r]:checked")[0];
    const c = await api("POST", `/api/v1/bookings/${id}/cancel`, sel ? { reason_code: sel.value } : {});
    if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); setBusy($("#go"), false); return; }
    const rf = c.data.refund;
    view(T("cancelled"), `<div class="center"><h1>${esc(T("cancelled"))}</h1>
      ${rf.eligible ? `<section class="card"><div class="kv"><span>${esc(rf.amount.display)}</span><strong>${esc(T({ requested: "rfRequested", processing: "rfProcessing", refunded: "rfRefunded", failed: "rfFailed", none: "rfNone" }[rf.status]))}</strong></div>${rf.status === "failed" ? `<p class="caption" id="rf-next">${esc(T("rfFailedNext"))}</p>` : ""}</section>` : ""}
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
    setBusy($("#go"), true);
    const body = sel.value === "refund" ? { choice: "refund" } : { choice: "rebook", session_id: sel.value.split(":")[1] };
    const c = await api("POST", `/api/v1/bookings/${id}/resolution`, body);
    if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); setBusy($("#go"), false); return; }
    if (c.data.booking) go(`#/booking/${c.data.booking.id}`); else go(`#/booking/${id}`);
  };
}

// ------------------------------------------------------------------ SCR-09 feedback
// Reasons she can pick when the overall rating is this or lower (Notion fix 10, provisional; the server keeps them up to
// LOW_RATING_REASONS_MAX, api/src/lib/config.js). Keys as the API expects them, with the words shown for each.
const LOW_RATING_REASONS_UP_TO = 3;
const LOW_RATING_REASONS = [["table_fit", "fbReasonTable"], ["venue", "venue"], ["food_service", "fbReasonFood"], ["organisation", "fbReasonOrg"],
  ["no_shows", "fbReasonNoShows"], ["other", "rOther"]];

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
      ${stars("overall", T("overall"), true)}
      <fieldset id="reasons" hidden><legend class="label">${esc(T("fbReasonsLegend"))}</legend><div class="chips">
        ${LOW_RATING_REASONS.map(([k, label]) => `<label class="chip"><input type="checkbox" name="reason" value="${k}"><span>${esc(T(label))}</span></label>`).join("")}</div></fieldset>
      ${stars("comfort", T("comfort"), true)}${stars("venue", T("venueRating"), false)}
      <label class="check"><input type="checkbox" id="again"><span>${esc(T("wouldBookAgain"))}</span></label>
      <div class="field"><label class="label" for="cm">${esc(T("commentLabel"))}</label><textarea class="input" id="cm" maxlength="500" aria-describedby="cmh"></textarea><span id="cmh" class="caption">${esc(T("commentHelp"))}</span></div>
      <div id="err" role="alert"></div>
      <button class="btn btn-primary btn-block" type="submit" id="go">${esc(T("send"))}</button>
    </form>
    <a class="btn btn-ghost btn-block" href="#/report/${id}">${esc(T("reportSeparate"))}</a>`);
  const val = (n) => { const x = $$(`input[name=${n}]:checked`)[0]; return x ? Number(x.value) : null; };
  // 3 stars or less: the reasons appear under the overall rating; a higher rating hides and clears them
  $$("input[name=overall]").forEach((x) => (x.onchange = () => {
    const low = val("overall") !== null && val("overall") <= LOW_RATING_REASONS_UP_TO;
    $("#reasons").hidden = !low;
    if (!low) $$("input[name=reason]").forEach((r) => { r.checked = false; });
  }));
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    const reasons = $$("input[name=reason]:checked").map((r) => r.value);
    const c = await api("POST", `/api/v1/bookings/${id}/feedback`, { overall_rating: val("overall"), comfort_rating: val("comfort"), venue_rating: val("venue"),
      would_book_again: $("#again").checked, comment: $("#cm").value.trim() || null, ...(reasons.length ? { low_rating_reasons: reasons } : {}) });
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
    setBusy($("#go"), true);
    const who = $("#who");
    const c = await api("POST", "/api/v1/reports", { booking_id: id, category: cat.value, timing: $$("input[name=when]:checked")[0].value,
      immediate_danger: $("#danger").checked, reported_seat: who && who.value ? who.value : undefined, description: $("#d").value.trim() || undefined });
    if (!c.ok) { $("#err").innerHTML = errorBanner(c.data); setBusy($("#go"), false); return; }
    const done = () => view(T("reportTitle"), `<div class="center"><div class="success-check">${icon("check")}</div><h1>${esc(T("reportSent", { case: c.data.case_ref }))}</h1><a class="btn btn-primary" href="#/home">${esc(T("backHome"))}</a></div>`);
    if (c.data.emergency && c.data.emergency.show) { done(); emergencyScreen(); } else done();
  };
}

// ------------------------------------------------------------------ inbox, profile, cases
async function scrInbox() {
  if (!(await guard({ needQuestionnaire: false }))) return;
  loadingView();
  const r = await api("GET", "/api/v1/notifications");
  if (!r.ok) return failedView(T("inbox"), r, scrInbox);
  const list = r.data.notifications;
  const seen = store.get("inboxSeen");
  const isNew = (n) => !seen || new Date(n.created_at) > new Date(seen);
  if (r.ok) { if (list.length) store.set("inboxSeen", list[0].created_at); inboxFetch = null; showInboxBadge(0); }
  view(T("inbox"), `<h1 class="display-title">${esc(T("inbox"))}</h1>${list.length ? `<ul class="list">${list.map((n) => `
    <li class="card${isNew(n) ? " is-new" : ""}">${isNew(n) ? `<span class="badge badge-info new-tag">${esc(T("newTag"))}</span>` : ""}<p>${esc(n.text)}</p><div class="row between"><span class="caption">${esc(fmtDate(n.created_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</span>
    ${n.booking_id ? `<a href="#/booking/${n.booking_id}">${esc(T("viewDetails"))}</a>` : n.session_id ? `<a href="#/sessions?s=${esc(n.session_id)}">${esc(T("bookSeat"))}</a>` : ""}</div></li>`).join("")}</ul>` : `<div class="empty"><div class="face" aria-hidden="true"></div><h2>${esc(T("noNotifications"))}</h2><p class="muted">${esc(T("inboxEmptyBody"))}</p></div>`}`);
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
    if (!r.ok) return toast(withNext((r.data && r.data.message) || T("errGeneric")));
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
  if (!r.ok) return failedView(T("casesTitle"), r, scrCases);
  const cases = r.data.cases;
  view(T("casesTitle"), `<h1>${esc(T("casesTitle"))}</h1>${cases.length ? `<ul class="list">${cases.map((c) => `
    <li class="card stack"><div class="row between"><strong>${num(c.case_ref)}</strong><span class="badge badge-warning">${esc(c.decision_label || c.decision)}</span></div>
    <p class="caption">${esc(fmtDate(c.event_date))} · ${esc(T(c.category === "identity_mismatch" ? "cIdentity" : REPORT_CATS[c.category] || "cDisruptive"))}</p>
    ${c.can_appeal ? `<p class="caption">${esc(T("appealUntil", { date: fmtDate(c.appeal_until) }))}</p><button class="btn btn-secondary" data-ref="${esc(c.case_ref)}">${esc(T("appeal"))}</button>` : ""}</li>`).join("")}</ul>`
    : `<p class="muted" id="no-cases">${esc(T("noCases"))}</p>`}<div id="msg" role="status"></div>`);
  $$("[data-ref]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const a = await api("POST", `/api/v1/cases/${encodeURIComponent(b.dataset.ref)}/appeal`);
    $("#msg").innerHTML = a.ok ? `<div class="banner banner-success pulse"><div>${esc(T("appealSent"))}</div></div>` : errorBanner(a.data);
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
