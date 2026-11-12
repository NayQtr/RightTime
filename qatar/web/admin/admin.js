// HerZone admin panel (v0.3 §4): role-based navigation, maker-checker, P4 reason prompt. English UI for the ops team.
import { askConfirm } from "/dialogs.js";
import { esc } from "/esc.js";
import { CFG, apiUrl } from "/api-url.js";

const A = "/api/admin/v1";
const ss = {
  get: (k) => { try { return JSON.parse(sessionStorage.getItem("qa_" + k)); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem("qa_" + k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  del: (k) => { try { sessionStorage.removeItem("qa_" + k); } catch { /* storage blocked */ } },
};
const main = document.getElementById("main");
const nav = document.getElementById("nav");
let timers = [];
const $ = (s, r = main) => r.querySelector(s);
const $$ = (s, r = main) => [...r.querySelectorAll(s)];
const dt = (iso) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

async function api(method, path, body) {
  const headers = { "Accept-Language": "en" };
  const t = ss.get("token");
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["Idempotency-Key"] = uuid();
  let res;
  try { res = await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { return { ok: false, status: 0, data: { message: "Network error" } }; }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (res.status === 401 && t) { ss.del("token"); ss.del("admin"); go("#/login"); }
  return { ok: res.ok, status: res.status, data };
}

// A screen opened from the menu puts the keyboard on its heading. A redraw after an action, a filter or a timed refresh
// (quietly) leaves it where it is, so the 30-second refresh never pulls the page back to the top on a phone.
// Quiet belongs to that one redraw call (passed down to view), so a refresh still in flight never keeps the focus off
// the heading of a screen she opens meanwhile.
const quietly = (draw) => draw({ quiet: true });
function view(title, html, opts) {
  main.innerHTML = html;
  document.title = `${title} · HerZone Admin`;
  const h = main.querySelector("h1");
  if (h && !(opts && opts.quiet)) { h.tabIndex = -1; h.focus(); }
}
const msg = (r, okText) => r.ok ? `<div class="banner banner-success" role="status"><div>${esc(okText || "Done")}${r.status === 202 ? " — sent for approval (maker-checker)." : ""}</div></div>`
  : `<div class="banner banner-danger" role="alert"><div><strong>${esc(r.data.code || "Error")}</strong> ${esc(r.data.message || "")}${r.data.retry_after ? ` Try again in ${Math.ceil(r.data.retry_after / 60)} min.` : ""} ${r.data.details ? `<code>${esc(JSON.stringify(r.data.details))}</code>` : ""}</div></div>`;
function flash(html) { const el = document.getElementById("flash"); el.innerHTML = html; el.scrollIntoView({ block: "nearest" }); }
// After an action on a list (plan A1): the list is redrawn at once, then the result shows above it and takes the keyboard
// focus (the button that was pressed may be gone from the new list). A failed action leaves the list as it was.
async function actThen(res, okText, redraw) {
  if (res.ok) await quietly(redraw);
  flash(msg(res, okText));
  const el = document.getElementById("flash");
  if (el) { el.tabIndex = -1; el.focus({ preventScroll: true }); }
}

// Saved filters (plan A1, provisional 10 Nov): one row of buttons above a list; the choice is remembered in this
// browser (localStorage), per list. The first filter of each list is its default. Change the lists here.
const FILTERS = {
  sessions: [["all", "All"], ["today", "Today"]],
  "venue-requests": [["all", "All"], ["pending", "Pending"]],
  "call-requests": [["requested", "Open"], ["called", "Called"], ["closed", "Closed"]],
  support: [["all", "All"], ["open", "Open"], ["celebrations", "Celebrations"]],
  alerts: [["open", "Open"], ["all", "All"]],
};
const saved = {
  get: (k) => { try { return localStorage.getItem("qa_filter_" + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem("qa_filter_" + k, v); } catch { /* storage blocked: the filter still works on this screen */ } },
};
const filterOf = (list) => { const v = saved.get(list); return FILTERS[list].some(([k]) => k === v) ? v : FILTERS[list][0][0]; };
const filterBar = (list) => `<div class="row filters" role="group" aria-label="Filter">${FILTERS[list].map(([k, l]) =>
  `<button class="btn ${filterOf(list) === k ? "btn-primary" : "btn-secondary"}" data-filter="${k}" aria-pressed="${filterOf(list) === k}">${esc(l)}</button>`).join("")}</div>`;
function bindFilters(list, redraw) {
  $$("[data-filter]").forEach((b) => (b.onclick = async () => {
    const k = b.dataset.filter;
    saved.set(list, k);
    await quietly(redraw);
    $(`[data-filter="${k}"]`)?.focus();
  }));
}
const qatarDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

const NAV = [
  ["#/sessions", "Sessions & Matching", ["owner", "ops", "analyst", "finance"]],
  ["#/live", "Tonight", ["owner", "ops"]],
  ["#/alerts", "Alerts", ["owner", "ops"]],
  ["#/venues", "Venues", ["owner", "ops"]],
  ["#/venue-requests", "Venue requests", ["owner", "ops"]],
  ["#/call-requests", "Call requests", ["owner", "ops"]],
  ["#/failed-notifications", "Failed notifications", ["owner", "ops"]],
  ["#/refunds", "Refunds & Payments", ["owner", "finance"]],
  ["#/cases", "Trust & Safety", ["trust_safety"]],
  ["#/identity", "Identity checks", ["owner", "trust_safety"]],
  ["#/approvals", "Approvals", ["owner", "ops", "finance", "trust_safety", "analyst"]],
  ["#/support", "Support requests", ["owner", "ops"]],
  ["#/feedback", "Feedback", ["owner", "ops"]],
  ["#/promo-codes", "Promo codes", ["owner"]],
  ["#/audit", "Audit log", ["owner"]],
  ["#/funnel", "Step counter", ["owner", "ops", "analyst"]],
];

function renderNav() {
  const a = ss.get("admin");
  nav.innerHTML = a ? `<span class="brand"><span class="brand-mark" aria-hidden="true">H</span>HerZone Admin</span>
    <ul>${NAV.filter(([, , roles]) => roles.includes(a.role)).map(([h, l]) => `<li><a href="${h}" ${location.hash.startsWith(h) ? 'aria-current="page"' : ""}>${esc(l)}</a></li>`).join("")}</ul>
    <span class="spacer"></span><span class="caption">${esc(a.name)} · <strong>${esc(a.role)}</strong></span>
    <button class="btn btn-ghost kb-btn" id="kb" aria-haspopup="dialog">Shortcuts</button><button class="btn btn-ghost" id="logout">Sign out</button>`
    : `<span class="brand"><span class="brand-mark" aria-hidden="true">H</span>HerZone Admin</span>`;
  alertStrip();
  if (a && ["owner", "ops"].includes(a.role)) { callBadge(); failedBadge(); }
  const kb = document.getElementById("kb");
  if (kb) kb.onclick = shortcutHelp;
  const lo = document.getElementById("logout");
  // sign-out ends the session on the server too (NMX-63); the browser copy is cleared whatever the answer
  if (lo) lo.onclick = async () => { await api("POST", "/api/admin/v1/auth/logout").catch(() => null); ss.del("token"); ss.del("admin"); renderNav(); go("#/login"); };
}

// ------------------------------------------------------------------ keyboard shortcuts (plan A1, provisional 10 Nov)
// "g" then a letter opens a section (only the sections her role has); "?" lists them. They can be turned off in that
// list, remembered in this browser (WCAG 2.1.4: single-character shortcuts must be switchable off); the "Shortcuts"
// button in the menu opens the list either way. Never while typing in a field or while a dialog is open.
const SHORTCUTS = [["s", "#/sessions"], ["t", "#/live"], ["a", "#/alerts"], ["v", "#/venue-requests"], ["c", "#/call-requests"],
  ["u", "#/support"], ["p", "#/approvals"], ["i", "#/identity"], ["r", "#/refunds"], ["k", "#/cases"]];
const shortcutsOn = () => { try { return localStorage.getItem("qa_shortcuts") !== "off"; } catch { return true; } };
const myShortcuts = () => {
  const a = ss.get("admin");
  return a ? SHORTCUTS.map(([k, h]) => [k, NAV.find(([nh]) => nh === h)]).filter(([, n]) => n && n[2].includes(a.role)) : [];
};
function shortcutHelp() {
  if (!ss.get("admin") || document.querySelector("dialog[open]")) return;
  const opener = document.activeElement;
  const d = document.createElement("dialog");
  d.className = "confirm-dialog kb-help";
  d.setAttribute("aria-labelledby", "kb-h");
  d.innerHTML = `<form method="dialog" class="stack"><h2 id="kb-h">Keyboard shortcuts</h2>
    <dl class="facts kb-list"><dt><kbd>?</kbd></dt><dd>Show this list</dd>
      ${myShortcuts().map(([k, n]) => `<dt><kbd>g</kbd> <kbd>${k}</kbd></dt><dd>${esc(n[1])}</dd>`).join("")}</dl>
    <label class="check"><input type="checkbox" id="kb-on"${shortcutsOn() ? " checked" : ""}>Keyboard shortcuts on</label>
    <div class="cd-actions"><button class="btn btn-primary" value="close">Close</button></div></form>`;
  document.body.appendChild(d);
  d.querySelector("#kb-on").onchange = (e) => { try { localStorage.setItem("qa_shortcuts", e.target.checked ? "on" : "off"); } catch { /* storage blocked */ } };
  d.addEventListener("close", () => { d.remove(); if (opener && opener.isConnected && opener.focus) opener.focus(); }, { once: true });
  d.showModal();
  d.querySelector("button").focus();
}
let gPressedAt = 0;
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !ss.get("token") || !ss.get("admin")) return;
  const t = e.target;
  if (t instanceof Element && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
  if (document.querySelector("dialog[open]") || !shortcutsOn()) return;
  if (e.key === "?") { e.preventDefault(); shortcutHelp(); return; }
  if (e.key === "g" && !gPressedAt) { gPressedAt = Date.now(); return; }
  const within = gPressedAt && Date.now() - gPressedAt < 1500;
  gPressedAt = 0;
  if (!within) return;
  const hit = myShortcuts().find(([k]) => k === e.key.toLowerCase());
  if (hit) { e.preventDefault(); go(hit[1][0]); }
});

// ------------------------------------------------------------------ auth
function scrLogin() {
  view("Sign in", `<h1>Sign in</h1><form id="f" class="stack card narrow">
    <div class="field"><label class="label" for="em">Email</label><input class="input" id="em" type="email" autocomplete="username" required></div>
    <div class="field"><label class="label" for="code">Authenticator code (TOTP)</label><input class="input otp" id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></div>
    <div id="err" role="alert"></div><button class="btn btn-primary" type="submit">Sign in</button>
    <a href="#/enroll">First time? Enrol your authenticator</a></form>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const r = await api("POST", `${A}/auth/login`, { email: $("#em").value.trim(), totp_code: $("#code").value.trim() });
    if (!r.ok) { $("#err").innerHTML = msg(r); return; }
    ss.set("token", r.data.access_token); ss.set("admin", r.data.admin);
    renderNav();
    go(NAV.find(([, , roles]) => roles.includes(r.data.admin.role))[0]);
  };
}

function scrEnroll() {
  view("Enrol MFA", `<h1>Enrol your authenticator</h1><p class="muted">Use the one-time enrolment token issued by an owner (valid 24 h). Every admin must use MFA.</p>
    <form id="f" class="stack card narrow">
      <div class="field"><label class="label" for="em">Email</label><input class="input" id="em" type="email" required></div>
      <div class="field"><label class="label" for="tok">Enrolment token</label><input class="input" id="tok" required autocomplete="off"></div>
      <div id="err" role="alert"></div><button class="btn btn-primary" type="submit">Enrol</button></form><div id="out"></div>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const r = await api("POST", `${A}/auth/enroll`, { email: $("#em").value.trim(), enroll_token: $("#tok").value.trim() });
    if (!r.ok) { $("#err").innerHTML = msg(r); return; }
    $("#out").innerHTML = `<section class="card stack"><h2>Add this to your authenticator app</h2>
      <p>Secret: <code class="num">${esc(r.data.secret)}</code></p><p class="caption">otpauth URI: <code>${esc(r.data.otpauth_uri)}</code></p>
      <p class="caption">This secret is shown once. Store it in your authenticator, then sign in.</p><a class="btn btn-primary" href="#/login">Go to sign in</a></section>`;
  };
}

// ------------------------------------------------------------------ sessions & matching cockpit
async function scrSessions(opts) {
  const r = await api("GET", `${A}/sessions`);
  const role = ss.get("admin").role;
  const canEdit = ["owner", "ops"].includes(role);
  const today = qatarDay(new Date());
  const sessions = (r.data.sessions || []).filter((s) => filterOf("sessions") !== "today" || qatarDay(s.starts_at) === today);
  view("Sessions", `<h1>Sessions & Matching</h1><div id="flash"></div>
    ${canEdit ? `<details class="card"><summary class="label">Create a session (draft)</summary><form id="f" class="grid-form">
      <label>Experience<select class="input" name="experience"><option>dinner</option><option>coffee</option></select></label>
      <label>Table language<select class="input" name="conversation_language"><option value="ar">ar</option><option value="en">en</option></select></label>
      <label>Starts at (Asia/Qatar)<input class="input" type="datetime-local" name="starts_at" required></label>
      <label>Duration (min)<input class="input" type="number" name="duration_minutes" value="120" min="30" max="360"></label>
      <label>Max seats<input class="input" type="number" name="max_seats" value="18" min="4"></label>
      <label>District (ar)<input class="input" name="district_hint_ar" required></label>
      <label>District (en)<input class="input" name="district_hint_en" required></label>
      <button class="btn btn-primary" type="submit">Create draft</button></form></details>` : ""}
    ${filterBar("sessions")}
    <div class="table-wrap"><table><thead><tr><th>Starts</th><th>Exp.</th><th>Lang</th><th>Area</th><th>Status</th><th>Sold</th><th>Paid, unseated</th><th>Tables</th><th></th></tr></thead><tbody>
    ${sessions.map((s) => `<tr><td>${dt(s.starts_at)}</td><td>${esc(s.experience)}</td><td>${esc(s.language)}</td><td>${esc(s.district)}</td>
      <td><span class="badge badge-${s.status === "on_sale" ? "success" : s.status === "draft" ? "warning" : "muted"}">${esc(s.status)}</span></td>
      <td>${s.seats_sold}/${s.max_seats}</td><td>${s.paid_waiting}</td><td>${s.tables} (${s.locked_tables} locked)</td>
      <td><a href="#/sessions/${s.id}">Open</a>${canEdit && s.status === "draft" ? ` · <button class="link-btn" data-open="${s.id}">Open sale</button>` : ""}</td></tr>`).join("")
      || `<tr><td colspan="9">Nothing here.</td></tr>`}
    </tbody></table></div>`, opts);
  bindFilters("sessions", scrSessions);
  const f = $("#f");
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f));
    fd.starts_at = new Date(fd.starts_at + ":00+03:00").toISOString();
    fd.duration_minutes = Number(fd.duration_minutes); fd.max_seats = Number(fd.max_seats);
    const c = await api("POST", `${A}/sessions`, fd);
    await actThen(c, "Draft session created", scrSessions);
  };
  $$("[data-open]").forEach((b) => (b.onclick = async () => {
    const c = await api("POST", `${A}/sessions/${b.dataset.open}:open-sale`);
    // 202: sent for approval, nothing changes in the list yet
    if (c.ok && c.status === 200) await actThen(c, "Session is on sale", scrSessions); else flash(msg(c, "Session is on sale"));
  }));
}

async function scrSession(id) {
  const r = await api("GET", `${A}/sessions/${id}`);
  if (!r.ok) { view("Session", `<h1>Session</h1>${msg(r)}`); return; }
  const d = r.data, s = d.session;
  const role = ss.get("admin").role;
  const ops = ["owner", "ops"].includes(role);
  // engine flag (matching rules, 10 Nov): the table scored below the low-match threshold; members are still seated
  const lowMatch = (on, score) => (on ? ` <span class="badge badge-warning"${score === null || score === undefined ? "" : ` title="Score ${Math.round(score * 100)}%"`}>Low match</span>` : "");
  view("Session", `<a href="#/sessions">← Sessions</a><h1>${esc(s.experience)} · ${esc(s.language)} · ${esc(s.district)} · ${dt(s.starts_at)}</h1><div id="flash"></div>
    <div class="grid3">
      <section class="card"><h2>Timeline</h2><dl class="facts"><dt>Booking closes</dt><dd>${dt(s.booking_closes_at)}</dd><dt>Lock</dt><dd>${dt(s.lock_at)}</dd>
        <dt>Reveal</dt><dd>${dt(s.reveal_at)}</dd><dt>Check-in opens</dt><dd>${dt(s.check_in_opens_at)}</dd><dt>Ends</dt><dd>${dt(s.ends_at)}</dd><dt>Status</dt><dd>${esc(s.status)}</dd></dl></section>
      <section class="card"><h2>Pool</h2><p>Seats ${s.seats_sold}/${s.max_seats} · holds in progress ${d.holds} · waitlist ${d.waitlist} · blocked pairs in pool ${d.blocks_in_pool}</p>
        <table><thead><tr><th>Language</th><th>Tier</th><th>Paid, awaiting group</th></tr></thead><tbody>${d.pool.map((p) => `<tr><td>${esc(p.language)}</td><td>${p.tier_rank}</td><td>${p.n}</td></tr>`).join("") || `<tr><td colspan="3">—</td></tr>`}</tbody></table></section>
      <section class="card"><h2>Matching</h2><form id="mf" class="grid-form">
        <label>Rule version<select class="input" name="rule_version"><option value="r2-personality">r2-personality · all answers (default)</option><option value="r1-interest">r1-interest · shared interests only</option><option value="r1-baseline">r1-baseline · random</option></select></label>
        <p class="caption">r2 seats similar women together: values 32% · personality 28% · social 18% · interests 12% · lifestyle 10%, with energy (introvert ↔ extrovert) mixed at each table.</p>
        <label>Seed<input class="input" name="seed" type="number" value="${Math.floor(Math.random() * 1e6)}"></label>
        <label>Packing<select class="input" name="packing_mode"><option>min_leftovers</option><option>greedy_6</option></select></label>
        <label>Max tables (blank = venue tables)<input class="input" name="max_tables" type="number" min="0"></label>
        <div class="row"><button class="btn btn-secondary" type="submit" value="dry">Dry run</button>${ops ? `<button class="btn btn-primary" type="button" id="pub">Publish</button>` : ""}</div></form></section>
    </div>
    <div id="explain"></div>
    <h2>Tables</h2>
    ${ops ? `<div class="row"><button class="btn btn-secondary" id="rev">Reveal locked tables</button><button class="btn btn-secondary" id="cmp">Complete session (after end)</button></div>` : ""}
    <div class="grid3">${d.tables.map((t) => `<section class="card stack"><div class="row between"><h3>${esc(t.code)} · ${esc(t.venue || "no venue")}</h3>
      <span class="badge badge-${t.status === "locked" ? "success" : t.status.startsWith("cancelled") ? "danger" : "info"}">${esc(t.status)}</span></div>
      <p>${t.confirmed_count}/${t.capacity} confirmed ${t.confirmed_count < 4 && t.status === "forming" ? `<span class="badge badge-danger">below quorum</span>` : ""}${lowMatch(t.low_match, t.match_score)} · venue confirmed: ${t.venue_confirmed_at ? "✓" : "✗"}</p>
      <ul class="plain">${t.members.map((m) => `<li><span class="num">${esc(m.ref)}</span> ${esc(m.display_name || "—")} · ${esc(m.status)}${m.checked_in ? " ✓" : ""}
        ${ops && t.status === "forming" ? ` <select class="input inline" data-move="${m.booking_id}"><option value="">move to…</option>${d.tables.filter((x) => x.id !== t.id && x.status === "forming").map((x) => `<option value="${x.id}">${esc(x.code)}</option>`).join("")}</select>` : ""}</li>`).join("")}</ul>
      ${ops ? `<div class="row">${t.status === "forming" ? `<button class="btn btn-primary" data-lock="${t.id}">Lock</button><button class="btn btn-danger" data-cq="${t.id}">Cancel (quorum)</button>` : ""}
        <button class="btn btn-ghost" data-vc="${t.id}">Venue confirmed (T-3h)</button></div>` : ""}</section>`).join("") || "<p class='muted'>No tables yet — run matching.</p>"}</div>
    ${d.unassigned.length ? `<section class="card"><h2>${d.tables.length ? "Paid but not seated (leftovers)" : "Paid, waiting for matching"}</h2><p>${d.unassigned.map((u) => `<span class="num">${esc(u.ref)}</span> ${esc(u.display_name || "")}`).join(" · ")}</p></section>` : ""}
    ${ops ? `<h2>Venues for this session</h2><section class="card stack" id="sv"><p class="caption">Loading…</p></section>` : ""}
    <h2>Matching runs</h2><table><thead><tr><th>When</th><th>Mode</th><th>Rule</th><th>Seed</th><th>Summary</th></tr></thead><tbody>
    ${d.runs.map((x) => `<tr><td>${dt(x.created_at)}</td><td>${esc(x.mode)}</td><td>${esc(x.rule_version)}</td><td class="num">${esc(x.seed)}</td><td><code>${esc(JSON.stringify(x.result_summary))}</code></td></tr>`).join("")}</tbody></table>`);
  const body = () => { const fd = Object.fromEntries(new FormData($("#mf"))); return { rule_version: fd.rule_version, seed: Number(fd.seed), packing_mode: fd.packing_mode, ...(fd.max_tables !== "" ? { max_tables: Number(fd.max_tables) } : {}) }; };
  // r2-personality: the same explanation in words an operator can act on (all values are 0..1 from the engine)
  const pct = (v) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);
  const personalityTable = (ex) => {
    const w = ex.weights.dimensions;
    return `<p class="caption">Weights: values ${pct(w.values)} · personality ${pct(w.personality)} · social ${pct(w.social)} · interests ${pct(w.interests)} · lifestyle ${pct(w.lifestyle)} · energy mix ${pct(ex.weights.energy_balance)} of the score.
      Answers ignored (unknown or "prefer not to say"): ${ex.answers_dropped}.</p>
      <table><thead><tr><th>Table</th><th>Lang</th><th>Tier</th><th>Size</th><th>Answered</th><th title="average similarity of every pair at the table">Closeness</th>
        <th title="the member least similar to the others">Least-matched member</th><th title="100% = every energy level present">Energy mix</th><th>Score</th><th>Checks</th><th>Warnings</th></tr></thead><tbody>
      ${ex.tables.map((t) => `<tr><td>${esc(t.table_code)}${lowMatch(t.low_match, t.score)}</td><td>${esc(t.language)}</td><td>${t.tier_rank}</td><td>${t.size}</td><td>${t.answered}/${t.size}</td>
        <td>${pct(t.interest)}</td><td>${pct(t.cohesion)}</td><td>${pct(t.energy_balance)}</td><td>${pct(t.score)}</td>
        <td>${Object.values(t.checks).every(Boolean) ? "✓ all" : "✗"}</td><td>${esc(t.warnings.join("; "))}</td></tr>`).join("")}</tbody></table>`;
  };
  const showRun = (res) => {
    if (!res.ok) { $("#explain").innerHTML = msg(res); return; }
    const ex = res.data.explanations;
    $("#explain").innerHTML = `<section class="card"><h2>${esc(res.data.mode)} · seed ${res.data.seed} · inputs ${esc(res.data.inputs_hash.slice(0, 12))}…</h2>
      <p><code>${esc(JSON.stringify(res.data.summary))}</code></p>
      ${ex.algorithm === "personality_v1" ? personalityTable(ex) : `<table><thead><tr><th>Table</th><th>Lang</th><th>Tier</th><th>Size</th><th>I</th><th>C</th><th>Score</th><th>Pseudonymous seats</th><th>Checks</th><th>Warnings</th></tr></thead><tbody>
      ${ex.tables.map((t) => `<tr><td>${esc(t.table_code)}${lowMatch(t.low_match, t.score)}</td><td>${esc(t.language)}</td><td>${t.tier_rank}</td><td>${t.size}</td><td>${t.interest ?? "—"}</td><td>${t.cohesion ?? "—"}</td><td>${t.score ?? "—"}</td>
        <td class="caption">${t.seats.map(esc).join(" ")}</td><td>${Object.values(t.checks).every(Boolean) ? "✓ all" : "✗"}</td><td>${esc(t.warnings.join("; "))}</td></tr>`).join("")}</tbody></table>`}
      <p>Leftovers: ${ex.leftovers.map((l) => `${esc(l.seat)} (${esc(l.reason)})`).join(", ") || "none"} · Ineligible: ${ex.ineligible.length} · Venue warnings: ${esc(ex.venue_warnings.join("; ") || "none")}</p></section>`;
  };
  $("#mf").onsubmit = async (e) => { e.preventDefault(); showRun(await api("POST", `${A}/sessions/${id}/matching:dry-run`, body())); };
  const pub = $("#pub");
  if (pub) pub.onclick = async () => { const res = await api("POST", `${A}/sessions/${id}/matching:publish`, body()); showRun(res); if (res.ok) setTimeout(() => scrSession(id), 1200); };
  const act = async (path, ok) => { const res = await api("POST", path); flash(msg(res, ok)); if (res.ok) setTimeout(() => scrSession(id), 900); };
  $$("[data-lock]").forEach((b) => (b.onclick = () => act(`${A}/tables/${b.dataset.lock}:lock`, "Table locked; members notified")));
  $$("[data-cq]").forEach((b) => (b.onclick = async () => {
    if (await askConfirm({ question: "Cancel this table for quorum? Members get QUORUM_FAIL_CHOICE.", confirm: "Cancel table", cancel: "Keep table" })) act(`${A}/tables/${b.dataset.cq}:cancel-quorum`, "Table cancelled");
  }));
  $$("[data-vc]").forEach((b) => (b.onclick = () => act(`${A}/tables/${b.dataset.vc}:venue-confirmed`, "Venue confirmation recorded")));
  $$("[data-move]").forEach((sel) => (sel.onchange = async () => {
    if (!sel.value) return;
    const reason = prompt("Reason code: quorum_merge, friend_request_separate, accessibility_fit, ops_balance, other", "quorum_merge");
    if (!reason) return;
    const res = await api("POST", `${A}/bookings/${sel.dataset.move}:move`, { to_table_id: sel.value, reason });
    flash(msg(res, "Member moved; MOVED_TABLE sent")); if (res.ok) setTimeout(() => scrSession(id), 900);
  }));
  if (ops) await sessionVenues(id);
  const rev = $("#rev"); if (rev) rev.onclick = () => act(`${A}/sessions/${id}:reveal`, "Venue revealed to locked tables");
  const cmp = $("#cmp"); if (cmp) cmp.onclick = () => act(`${A}/sessions/${id}:complete`, "Session completed (no-shows marked)");
}

// ------------------------------------------------------------------ tonight live board
// Below 640 px (plan A3) each table is a card instead of an eight-column row, red alerts first, then amber; the same
// data and the same 30-second refresh. The wide table and the cards are both drawn; admin.css shows one of them.
const liveLevel = (t) => (t.alerts.some((a) => a.level === "red") ? 0 : t.alerts.length ? 1 : 2);
async function scrLive() {
  const draw = async (opts) => {
    const r = await api("GET", `${A}/live/tonight`);
    if (!location.hash.startsWith("#/live")) return;
    const tables = (r.data && r.data.tables) || [];
    const incidents = (t) => (t.incidents.open_s1_s2 ? `<span class="badge badge-danger">S1/S2 · ${esc(t.incidents.categories.join(", "))}</span>` : "—");
    const alerts = (t) => t.alerts.map((a) => `<span class="badge badge-${a.level === "red" ? "danger" : "warning"}">${esc(a.code)}</span>`).join(" ") || "✓";
    const cards = tables.map((t, i) => [t, i]).sort(([a, i], [b, j]) => liveLevel(a) - liveLevel(b) || i - j).map(([t]) => t);
    view("Tonight", `<h1>Tonight board</h1><p class="caption">Auto-refresh every 30 s · generated ${dt(r.data && r.data.generated_at)} · ops sees incident category only, never the narrative.</p>
      <div class="live-wide"><table><thead><tr><th>Start</th><th>Area</th><th>Venue · table</th><th>Confirmed</th><th>Checked in</th><th>Late cancels</th><th>Incidents</th><th>Alerts</th></tr></thead><tbody>
      ${tables.map((t) => `<tr class="${["row-red", "row-amber", ""][liveLevel(t)]}"><td>${dt(t.starts_at)}</td><td>${esc(t.district)}</td><td>${esc(t.venue)} · ${esc(t.table_code)}</td>
        <td>${t.confirmed}</td><td>${t.checked_in}</td><td>${t.late_cancellations}</td><td>${incidents(t)}</td>
        <td>${alerts(t)}</td></tr>`).join("") || `<tr><td colspan="8">No locked tables in the next 30 hours.</td></tr>`}
      </tbody></table></div>
      <ul class="live-cards plain">${cards.map((t) => `<li class="card live-card ${["live-red", "live-amber", ""][liveLevel(t)]}">
        <div class="row between"><h2>${esc(t.venue)} · ${esc(t.table_code)}</h2><span class="num">${dt(t.starts_at)}</span></div>
        <div class="live-alerts">${alerts(t)}</div>
        <dl class="facts"><dt>Area</dt><dd>${esc(t.district)}</dd><dt>Confirmed</dt><dd>${t.confirmed}</dd><dt>Checked in</dt><dd>${t.checked_in}</dd>
          <dt>Late cancels</dt><dd>${t.late_cancellations}</dd><dt>Incidents</dt><dd>${incidents(t)}</dd></dl></li>`).join("")
        || `<li class="caption">No locked tables in the next 30 hours.</li>`}</ul>`, opts);
  };
  await draw();
  timers.push(setInterval(() => quietly(draw), 30000));
}

// ------------------------------------------------------------------ venue portal (016): hosting requests per session
const SV_BADGE = { pending: "warning", confirmed: "success", declined: "danger", withdrawn: "muted" };
const svState = (x) => `<span class="badge badge-${SV_BADGE[x.status] || "muted"}">${esc(x.status)}</span>${x.needs_attention ? ` <span class="badge badge-danger">needs attention</span>` : ""}`;
const svSent = (x) => (x.notified_at ? `${dt(x.notified_at)}${x.reminded_at ? ` · reminder ${dt(x.reminded_at)}` : ""}${x.escalated_at ? ` · coordinator alerted ${dt(x.escalated_at)}` : ""}` : "Goes out 3 days before");

async function sessionVenues(id) {
  const box = $("#sv");
  if (!box) return;
  const [r, vs] = await Promise.all([api("GET", `${A}/sessions/${id}/venues`), api("GET", `${A}/venues`)]);
  if (!r.ok) { box.innerHTML = msg(r); return; }
  const rows = r.data.venues || [];
  const active = ((vs.data && vs.data.venues) || []).filter((v) => v.is_active);
  box.innerHTML = `<p class="caption">The venue is asked 3 days before the meetup, on its own page (email + code). No answer in 2 hours: a reminder; still none 2 hours later: you are alerted.
    Once a venue is planned, matching uses only the venues that accepted. If one declines, plan another contracted venue.</p>
    <table><thead><tr><th>Venue</th><th>Women expected</th><th>Status</th><th>Request</th><th>Answer</th><th></th></tr></thead><tbody>
    ${rows.map((x) => `<tr class="${x.needs_attention ? "row-red" : ""}"><td>${esc(x.venue)}</td><td>${x.planned_guests}</td><td>${svState(x)}</td><td>${svSent(x)}</td>
      <td>${x.decided_at ? dt(x.decided_at) : "—"}${x.decline_reason ? ` · ${esc(x.decline_reason)}` : ""}</td>
      <td>${x.status === "withdrawn" ? "" : `<button class="btn btn-ghost" data-svw="${x.venue_id}">Withdraw</button>`}</td></tr>`).join("") || `<tr><td colspan="6" class="caption">No venue planned: matching uses every active venue, as before.</td></tr>`}
    </tbody></table>
    <form id="svf" class="grid-form"><label>Venue<select class="input" name="venue_id" required>${active.map((v) => `<option value="${v.id}">${esc(v.name)} · ${esc(v.district_en)}</option>`).join("")}</select></label>
      <label>Women expected<input class="input" name="planned_guests" type="number" min="4" max="120" value="6" required></label>
      <button class="btn btn-primary" type="submit">Plan this venue</button></form>`;
  $("#svf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData($("#svf")));
    const res = await api("POST", `${A}/sessions/${id}/venues`, { venue_id: fd.venue_id, planned_guests: Number(fd.planned_guests) });
    flash(msg(res, "Venue planned")); if (res.ok) await sessionVenues(id);
  };
  $$("[data-svw]", box).forEach((b) => (b.onclick = async () => {
    if (!(await askConfirm({ question: "Withdraw this venue from the session? Its request is cancelled.", confirm: "Withdraw venue", cancel: "Keep venue" }))) return;
    const res = await api("DELETE", `${A}/sessions/${id}/venues/${b.dataset.svw}`);
    flash(msg(res, "Venue withdrawn")); if (res.ok) await sessionVenues(id);
  }));
}

async function scrVenueRequests(opts) {
  const [r, o] = await Promise.all([api("GET", `${A}/venue-requests`), api("GET", `${A}/venue-outbox`)]);
  const reqs = ((r.data && r.data.requests) || []).filter((x) => filterOf("venue-requests") !== "pending" || x.status === "pending");
  const out = (o.data && o.data.messages) || [];
  view("Venue requests", `<h1>Venue requests</h1><div id="flash"></div>
    <h2>Messages to send (${out.length})</h2>
    <p class="caption">WhatsApp is not connected yet: copy each message, send it yourself, then mark it sent. Venue messages go to its day-of contact; "coordinator" ones are alerts for you.</p>
    ${o.ok ? "" : msg(o)}
    <div class="stack">${out.map((m) => `<section class="card stack" id="msg-${esc(m.id)}"><div class="row between"><strong>${esc(m.venue)} · ${dt(m.starts_at)}</strong>
      <span class="badge badge-${m.to === "coordinator" ? "danger" : "info"}">${m.to === "coordinator" ? "coordinator" : esc(m.kind)}</span></div>
      <p dir="rtl" lang="ar">${esc(m.text)}</p>
      <div class="row"><button class="btn btn-secondary" data-copy="${esc(m.id)}">Copy</button><button class="btn btn-primary" data-sent="${esc(m.id)}">Mark sent</button></div></section>`).join("") || `<p class="caption">Nothing to send.</p>`}</div>
    <h2>Requests</h2>${r.ok ? "" : msg(r)}
    ${filterBar("venue-requests")}
    <table><thead><tr><th>Meetup</th><th>Venue</th><th>Women expected</th><th>Status</th><th>Request</th><th>Answer</th><th></th></tr></thead><tbody>
    ${reqs.map((x) => `<tr class="${x.needs_attention ? "row-red" : ""}"><td>${dt(x.starts_at)}</td><td>${esc(x.venue)}</td><td>${x.planned_guests}</td><td>${svState(x)}</td><td>${svSent(x)}</td>
      <td>${x.decided_at ? dt(x.decided_at) : "—"}${x.decline_reason ? ` · ${esc(x.decline_reason)}` : ""}</td><td><a href="#/sessions/${esc(x.session_id)}">Session</a></td></tr>`).join("")
      || `<tr><td colspan="7" class="caption">${filterOf("venue-requests") === "pending" ? "Nothing here." : "No requests. Plan venues from a session's page."}</td></tr>`}
    </tbody></table>`, opts);
  bindFilters("venue-requests", scrVenueRequests);
  const texts = Object.fromEntries(out.map((m) => [m.id, m.text]));
  $$("[data-copy]").forEach((b) => (b.onclick = async () => {
    try { await navigator.clipboard.writeText(texts[b.dataset.copy]); b.textContent = "Copied"; }
    catch { flash(msg({ ok: false, data: { code: "COPY_FAILED", message: "Select the text and copy it by hand." } })); }
  }));
  $$("[data-sent]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const res = await api("POST", `${A}/venue-outbox/${b.dataset.sent}:sent`);
    await actThen(res, "Marked sent", scrVenueRequests);
    if (!res.ok) b.disabled = false;
  }));
}

// ------------------------------------------------------------------ venues
async function scrVenues() {
  const r = await api("GET", `${A}/venues`);
  view("Venues", `<h1>Venues</h1><div id="flash"></div>
    <table><thead><tr><th>Name</th><th>District</th><th>Type</th><th>Tables × seats</th><th>Tier</th><th>Noise</th><th>Separate bills</th><th>Contract</th><th>Active</th><th>Rating (n≥5)</th><th>Day-of contacts</th><th></th></tr></thead><tbody>
    ${(r.data.venues || []).map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.district_en)}</td><td>${esc(v.venue_type)}</td><td>${v.total_bookable_tables} × ${v.seats_per_table_max}</td>
      <td>${v.tier_rank}</td><td>${v.noise_level}</td><td>${v.separate_bills_confirmed ? "✓" : "✗"}</td><td>${esc(v.contract_status)}</td>
      <td><button class="link-btn" data-toggle="${v.id}" data-active="${v.is_active}">${v.is_active ? "Pause" : "Activate"}</button></td><td>${v.avg_venue_rating ?? "—"}</td>
      <td>${v.day_of_contacts}</td><td><button class="link-btn" data-contacts="${v.id}">Contacts</button>
        <button class="link-btn" data-portal="${v.id}" data-name="${esc(v.name)}">Portal emails</button></td></tr>`).join("")}</tbody></table>
    <div id="contacts"></div>`);
  const portal = async (vid, name) => {
    const u = await api("GET", `${A}/venues/${vid}/portal-users`);
    $("#contacts").innerHTML = `<section class="card stack"><h2>Venue page sign-in · ${esc(name)}</h2>
      <p class="caption">The venue signs in at <code>${esc(location.origin)}/venue</code> with one of these emails (from the partnership agreement) and a 6-digit code.
      Until an email provider is connected, the code is shown on screen (staging only).</p>${u.ok ? "" : msg(u)}
      <ul class="plain">${((u.data && u.data.users) || []).map((x) => `<li><span class="num">${esc(x.email)}</span> · ${esc(x.status)} · last sign-in ${dt(x.last_login_at)}
        ${x.status === "active" ? ` <button class="link-btn" data-pud="${esc(x.id)}">Disable</button>` : ""}</li>`).join("") || "<li>None yet</li>"}</ul>
      <form id="puf" class="grid-form"><label>Email<input class="input" name="email" type="email" required autocomplete="off"></label><button class="btn btn-primary">Add email</button></form></section>`;
    $("#puf").onsubmit = async (e) => {
      e.preventDefault();
      const res = await api("POST", `${A}/venues/${vid}/portal-users`, { email: new FormData($("#puf")).get("email") });
      flash(msg(res, "Email added")); if (res.ok) await portal(vid, name);
    };
    $$("[data-pud]").forEach((b) => (b.onclick = async () => {
      if (!(await askConfirm({ question: "Disable this email? Its open sign-ins end now.", confirm: "Disable email", cancel: "Keep email" }))) return;
      const res = await api("POST", `${A}/venue-portal-users/${b.dataset.pud}:disable`);
      flash(msg(res, "Disabled")); if (res.ok) await portal(vid, name);
    }));
  };
  $$("[data-portal]").forEach((b) => (b.onclick = () => portal(b.dataset.portal, b.dataset.name)));
  $$("[data-toggle]").forEach((b) => (b.onclick = async () => { const res = await api("PATCH", `${A}/venues/${b.dataset.toggle}`, { is_active: b.dataset.active !== "true" }); flash(msg(res, "Updated")); if (res.ok) setTimeout(scrVenues, 700); }));
  $$("[data-contacts]").forEach((b) => (b.onclick = async () => {
    const vid = b.dataset.contacts;
    const c = await api("GET", `${A}/venues/${vid}/contacts`);
    $("#contacts").innerHTML = `<section class="card stack"><h2>Contacts (phones masked)</h2><ul class="plain">${(c.data.contacts || []).map((x) => `<li>${esc(x.name)} · ${esc(x.role || "")} · <span class="num">${esc(x.phone_masked)}</span>${x.is_day_of_contact ? " · day-of" : ""}</li>`).join("") || "<li>None</li>"}</ul>
      <form id="cf" class="grid-form"><label>Name<input class="input" name="name" required></label><label>Phone (E.164)<input class="input" name="phone_e164" placeholder="+974…" required></label>
      <label>Role<input class="input" name="role"></label><label class="check"><input type="checkbox" name="is_day_of_contact">Day-of contact</label><button class="btn btn-primary">Add contact</button></form></section>`;
    $("#cf").onsubmit = async (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData($("#cf"))); fd.is_day_of_contact = !!fd.is_day_of_contact;
      const res = await api("POST", `${A}/venues/${vid}/contacts`, fd); flash(msg(res, "Contact added")); };
  }));
}

// ------------------------------------------------------------------ refunds & payments
async function scrRefunds() {
  const role = ss.get("admin").role;
  const [req, all, pays] = await Promise.all([api("GET", `${A}/refunds?status=requested`), api("GET", `${A}/refunds`), api("GET", `${A}/payments`)]);
  view("Refunds", `<h1>Refunds & Payments</h1><div id="flash"></div>
    <section class="card stack"><h2>Batch refunds awaiting finance approval</h2>
      <form id="bf"><table><thead><tr><th><span class="sr-only">Select</span></th><th>Booking</th><th>Reason</th><th>Cancel reason</th><th>Amount</th><th>Created</th></tr></thead><tbody>
      ${(req.data.refunds || []).map((x) => `<tr><td><input type="checkbox" name="r" value="${x.id}" checked aria-label="Select ${esc(x.booking_ref)}"></td><td class="num">${esc(x.booking_ref)}</td><td>${esc(x.reason)}</td><td>${esc(x.cancel_reason || "")}</td><td>${esc(x.amount.display)}</td><td>${dt(x.created_at)}</td></tr>`).join("") || `<tr><td colspan="6">Nothing waiting.</td></tr>`}</tbody></table>
      <div class="row">${role === "finance" ? `<button class="btn btn-primary" type="submit">Approve selected → PSP</button>` : `<span class="caption">Only finance approves batches.</span>`}
        <button class="btn btn-secondary" type="button" id="auto">Create refunds for unresolved choices past deadline</button></div></form></section>
    <section class="card"><h2>Goodwill refund (needs a second approver)</h2><form id="gf" class="grid-form"><label>Booking ID<input class="input" name="booking_id" required></label>
      <label>Amount (minor units, e.g. 2000 = QAR 20)<input class="input" name="amount_minor" type="number" min="1" required></label><button class="btn btn-secondary">Propose</button></form></section>
    <h2>All refunds</h2><table><thead><tr><th>Booking</th><th>Reason</th><th>Status</th><th>Amount</th><th>PSP ref</th><th>Completed</th></tr></thead><tbody>
    ${(all.data.refunds || []).map((x) => `<tr><td class="num">${esc(x.booking_ref)}</td><td>${esc(x.reason)}</td><td>${esc(x.status)}</td><td>${esc(x.amount.display)}</td><td class="caption">${esc(x.psp_refund_id || "")}</td><td>${dt(x.completed_at)}</td></tr>`).join("")}</tbody></table>
    <h2>Payments</h2><table><thead><tr><th>Booking</th><th>PSP</th><th>Intent</th><th>Status</th><th>Failure</th><th>Amount</th><th>Created</th></tr></thead><tbody>
    ${(pays.data.payments || []).map((p) => `<tr><td class="num">${esc(p.booking_ref)}</td><td>${esc(p.psp)}</td><td class="caption">${esc(p.psp_payment_intent_id)}</td><td>${esc(p.status)}</td><td>${esc(p.failure_code || "")}</td><td>${esc(p.amount.display)}</td><td>${dt(p.created_at)}</td></tr>`).join("")}</tbody></table>`);
  $("#bf").onsubmit = async (e) => { e.preventDefault(); const ids = $$("input[name=r]:checked").map((x) => x.value); const res = await api("POST", `${A}/refund-batches:approve`, { refund_ids: ids });
    flash(msg(res, `Approved ${res.data && res.data.approved} refund(s)`)); if (res.ok) setTimeout(scrRefunds, 900); };
  $("#auto").onclick = async () => { const res = await api("POST", `${A}/refunds:auto-unresolved`); flash(msg(res, `Created ${res.data && res.data.created} automatic refund(s)`)); if (res.ok) setTimeout(scrRefunds, 900); };
  $("#gf").onsubmit = async (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData($("#gf"))); fd.amount_minor = Number(fd.amount_minor); flash(msg(await api("POST", `${A}/refunds:goodwill`, fd), "Proposed")); };
}

// ------------------------------------------------------------------ identity checks (card name vs registered name, 015)
async function scrIdentity(opts) {
  const r = await api("GET", `${A}/identity-reviews`);
  const rows = (r.data && r.data.reviews) || [];
  view("Identity checks", `<h1>Identity checks</h1>
    <p class="caption">Bookings where the name on the payment card did not match the member's registered first name (or she has no name).
    She has paid, but the venue and table code stay hidden from her until you decide. Reading this list is recorded in the audit log.</p>
    <p class="caption"><strong>Gemini</strong> gives a second opinion on different names (first name only, no number). When it is confident the name is the same (a nickname or another spelling) it clears the check by itself; a card name that is usually male is listed first. Gemini never rejects anyone.</p>
    <p class="caption"><strong>Approve</strong>: the venue shows (a relative paying for her is a common reason).
    <strong>Reject</strong>: the booking is cancelled <strong>without a refund</strong> and the account is suspended for 30 days; she can appeal under "Decisions about you", and an upheld appeal refunds the fee.</p>
    <div id="flash"></div>
    <table><thead><tr><th>Booking</th><th>Meetup</th><th>Registered name</th><th>Name on card</th><th>Result</th><th>Gemini</th><th>Account</th><th></th></tr></thead><tbody>
    ${rows.map((x) => `<tr><td class="num">${esc(x.booking_ref)}</td><td>${dt(x.starts_at)}</td><td>${esc(x.registered_name || "—")}</td>
      <td>${esc(x.card_name || "—")}</td><td>${x.result === "no_name" ? "No registered name" : "Different name"}</td>
      <td>${x.ai ? `${x.ai.same_name ? "Same name" : "Different name"} · card name ${x.ai.card_name_gender === "male" ? `<span class="badge badge-danger">usually male</span>` : esc(x.ai.card_name_gender)} · ${Math.round(x.ai.confidence * 100)}%` : "—"}</td>
      <td>${esc(x.member_status)}</td>
      <td class="row"><button class="btn btn-primary" data-ok="${x.id}">Approve</button>
        <button class="btn btn-danger" data-no="${x.id}">Reject…</button></td></tr>`).join("") || `<tr><td colspan="8">Nothing to review.</td></tr>`}
    </tbody></table>`, opts);
  $$("[data-ok]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const res = await api("POST", `${A}/identity-reviews/${b.dataset.ok}:decide`, { decision: "approve" });
    await actThen(res, "Approved: the venue now shows for her", scrIdentity);
    if (!res.ok) b.disabled = false;
  }));
  // one in-page box: the question as before, the reason in the same box (it used to be a second browser prompt)
  $$("[data-no]").forEach((b) => (b.onclick = async () => {
    const yes = await askConfirm({ question: "Cancel this booking WITHOUT a refund and suspend the account for 30 days?",
      field: { label: "Reason for rejecting (kept encrypted, shown in the case):" }, confirm: "Reject booking", cancel: "Keep booking" });
    if (!yes) return;
    b.disabled = true;
    const res = await api("POST", `${A}/identity-reviews/${b.dataset.no}:decide`, { decision: "reject", rationale: yes.value });
    await actThen(res, "Rejected: booking cancelled without refund, account suspended", scrIdentity);
    if (!res.ok) b.disabled = false;
  }));
}

// ------------------------------------------------------------------ trust & safety
const REASONS = [["case_triage", "Case triage"], ["investigation", "Investigation"], ["second_approval", "Second approval"], ["appeal_review", "Appeal review"], ["legal_request", "Legal request"]];

async function scrCases() {
  const r = await api("GET", `${A}/cases`);
  view("Trust & Safety", `<h1>Trust & Safety queue</h1><p class="caption">Sorted by severity, then SLA. Opening a case reads P4 data: you must give a reason, and every read is audited.</p>
    <table><thead><tr><th>Case</th><th>Sev</th><th>Category</th><th>When</th><th>Danger</th><th>Status</th><th>SLA due</th><th></th></tr></thead><tbody>
    ${(r.data.cases || []).map((c) => `<tr class="${c.severity === 1 ? "row-red" : ""}"><td class="num">${esc(c.case_ref)}</td><td>S${c.severity}</td><td>${esc(c.category)}</td><td>${esc(c.timing)}</td>
      <td>${c.immediate_danger ? `<span class="badge badge-danger">999</span>` : ""}</td><td>${esc(c.status)}</td><td>${dt(c.sla_due_at)}</td><td><button class="btn btn-secondary" data-open="${c.id}">Open…</button></td></tr>`).join("") || `<tr><td colspan="8">Queue empty.</td></tr>`}
    </tbody></table>${reasonDialog()}`);
  $$("[data-open]").forEach((b) => (b.onclick = () => askReason((reason) => go(`#/cases/${b.dataset.open}?reason=${reason}`))));
}

function reasonDialog() {
  return `<dialog id="rd"><form method="dialog" class="stack"><h2>Why are you opening this case?</h2><p class="caption">P4 data. Your read is recorded in the audit log with this reason.</p>
    <select class="input" id="rs">${REASONS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>
    <div class="row"><button class="btn btn-primary" value="ok">Open case</button><button class="btn btn-ghost" value="cancel">Cancel</button></div></form></dialog>`;
}
function askReason(cb) {
  const d = $("#rd");
  d.showModal();
  d.onclose = () => { if (d.returnValue === "ok") cb($("#rs").value); };
}

async function scrCase(id, query) {
  const reason = new URLSearchParams(query || "").get("reason");
  if (!reason) { view("Case", `<h1>Case</h1>${reasonDialog()}`); askReason((r) => go(`#/cases/${id}?reason=${r}`)); return; }
  const r = await api("GET", `${A}/cases/${id}?reason=${encodeURIComponent(reason)}`);
  if (!r.ok) { view("Case", `<a href="#/cases">← Queue</a><h1>Case</h1>${msg(r)}`); return; }
  const c = r.data.case;
  const role = ss.get("admin").role;
  view(`Case ${c.case_ref}`, `<a href="#/cases">← Queue</a><h1>Case <span class="num">${esc(c.case_ref)}</span> · S${c.severity} · ${esc(c.status)}</h1><div id="flash"></div>
    <div class="grid3">
      <section class="card"><h2>Report</h2><dl class="facts"><dt>Category</dt><dd>${esc(c.category)}</dd><dt>When</dt><dd>${esc(c.timing)}</dd><dt>Immediate danger</dt><dd>${c.immediate_danger ? "YES" : "no"}</dd>
        <dt>Created</dt><dd>${dt(c.created_at)}</dd><dt>SLA due</dt><dd>${dt(c.sla_due_at)}</dd></dl><h3>Reporter's words (P4)</h3><blockquote>${esc(c.description || "—")}</blockquote></section>
      <section class="card"><h2>People</h2><p>Reporter: ${esc(c.reporter.display_name || "—")}</p>
        <p>Reported: ${c.reported ? `${esc(c.reported.display_name || "—")} · account ${esc(c.reported.status)} · earlier cases: ${c.reported.earlier_cases}` : "not identified"}</p>
        <p class="caption">Never reveal the reporter's identity to the reported person. Authorities' requests go to legal.</p></section>
      <section class="card"><h2>Actions taken</h2><ul class="plain">${c.actions.map((a) => `<li>${dt(a.effective_from)} · <strong>${esc(a.action)}</strong>${a.effective_to ? ` (until ${dt(a.effective_to)})` : ""}${a.rationale ? ` — ${esc(a.rationale)}` : ""}</li>`).join("")}</ul></section>
    </div>
    ${role === "trust_safety" && ["new", "triaged", "investigating"].includes(c.status) ? `<section class="card stack"><h2>Triage & decide</h2>
      <div class="row"><button class="btn btn-secondary" data-tri="triaged">Mark triaged</button><button class="btn btn-secondary" data-tri="investigating">Investigating</button></div>
      <form id="af" class="grid-form"><label>Decision<select class="input" name="action"><option value="warning">Warning</option><option value="suspension">Suspension</option>
        <option value="ban">Permanent ban (needs second approver)</option><option value="no_action">No action</option><option value="referral_authorities">Referral to authorities (legal-reviewed)</option></select></label>
        <label>Suspension days<input class="input" name="effective_days" type="number" value="30" min="1"></label><label class="wide">Rationale (encrypted)<textarea class="input" name="rationale"></textarea></label>
        <button class="btn btn-primary">Record decision</button></form></section>` : ""}
    ${c.status === "appealed" ? `<section class="card stack"><h2>Appeal review</h2><p class="caption">The person who decided cannot review. The owner may review even after approving (MVP rule).</p>
      <form id="pf" class="grid-form"><label>Decision<select class="input" name="decision"><option value="rejected">Reject appeal (decision stands)</option><option value="upheld">Uphold appeal (lift sanction)</option></select></label>
      <label class="wide">Rationale<textarea class="input" name="rationale"></textarea></label><button class="btn btn-primary">Record appeal decision</button></form></section>` : ""}`);
  $$("[data-tri]").forEach((b) => (b.onclick = async () => { const res = await api("POST", `${A}/cases/${id}:triage`, { status: b.dataset.tri }); flash(msg(res, "Updated")); }));
  const af = $("#af");
  if (af) af.onsubmit = async (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(af)); fd.effective_days = Number(fd.effective_days);
    const res = await api("POST", `${A}/cases/${id}/actions`, fd); flash(msg(res, "Decision recorded")); };
  const pf = $("#pf");
  if (pf) pf.onsubmit = async (e) => { e.preventDefault(); const res = await api("POST", `${A}/cases/${id}/appeal-decision`, Object.fromEntries(new FormData(pf))); flash(msg(res, "Appeal decided")); };
}

// ------------------------------------------------------------------ approvals, support, audit
async function scrApprovals(opts) {
  const r = await api("GET", `${A}/approvals`);
  view("Approvals", `<h1>Approvals (maker-checker)</h1><div id="flash"></div>
    <table><thead><tr><th>Action</th><th>Payload</th><th>Proposed by</th><th>When</th><th></th></tr></thead><tbody>
    ${(r.data.approvals || []).map((a) => `<tr><td>${esc(a.action)}</td><td><code>${esc(JSON.stringify(a.payload))}</code></td><td>${esc(a.proposed_by.name)} (${esc(a.proposed_by.role)})</td><td>${dt(a.created_at)}</td>
      <td>${a.can_approve ? `<button class="btn btn-primary" data-ap="${a.id}">Approve</button> <button class="btn btn-ghost" data-rj="${a.id}">Reject</button>` : `<span class="caption">Another role must approve</span>`}</td></tr>`).join("") || `<tr><td colspan="5">Nothing pending.</td></tr>`}</tbody></table>`, opts);
  $$("[data-ap]").forEach((b) => (b.onclick = async () => actThen(await api("POST", `${A}/approvals/${b.dataset.ap}:approve`), "Approved and executed", scrApprovals)));
  $$("[data-rj]").forEach((b) => (b.onclick = async () => actThen(await api("POST", `${A}/approvals/${b.dataset.rj}:reject`), "Rejected", scrApprovals)));
}

const CASE_TYPES = { practical_arrangement_Q07: "Q07 private contact", occasion_celebration: "Celebration", payment: "Payment", refund: "Refund", general: "General" };
const OCCASION_LABELS = { birthday: "birthday", other: "other occasion" };

// "Open": not yet resolved or closed. "Celebrations": the occasion requests (018), whatever their status.
const SUPPORT_FILTER = { all: () => true, open: (c) => !["resolved", "closed"].includes(c.status), celebrations: (c) => c.type === "occasion_celebration" };
async function scrSupport(opts) {
  const r = await api("GET", `${A}/support-cases`);
  const cases = (r.data.cases || []).filter(SUPPORT_FILTER[filterOf("support")]);
  view("Support requests", `<h1>Support requests</h1><p class="caption">Q07 private contact: only the request is stored — never the reason (Article 16 Option A). Call the person, offer direct contact with the venue, and record only the outcome.<br>Celebration: she celebrates an occasion at this booking. Arrange the small preparations with the venue before the date.</p><div id="flash"></div>
    ${filterBar("support")}
    <table><thead><tr><th>Created</th><th>Request</th><th>Name</th><th>Lang</th><th>Booking</th><th>Status</th><th></th></tr></thead><tbody>
    ${cases.map((c) => `<tr><td>${dt(c.created_at)}</td><td>${esc(CASE_TYPES[c.type] || c.type)}${c.occasion ? ` · ${esc(OCCASION_LABELS[c.occasion] || c.occasion)}` : ""}</td><td>${esc(c.display_name || "—")}</td><td>${esc(c.locale)}</td>
      <td>${c.booking_ref ? `<span class="num">${esc(c.booking_ref)}</span> · ${esc(c.experience || "")} ${c.starts_at ? dt(c.starts_at) : ""}` : "—"}</td><td>${esc(c.status)}</td>
      <td><select class="input inline" data-sc="${c.id}"><option value="">set status…</option><option>in_progress</option><option>waiting_user</option><option>resolved</option><option>closed</option></select></td></tr>`).join("") || `<tr><td colspan="7">Nothing here.</td></tr>`}</tbody></table>`, opts);
  bindFilters("support", scrSupport);
  $$("[data-sc]").forEach((s) => (s.onchange = async () => { if (!s.value) return; actThen(await api("PATCH", `${A}/support-cases/${s.dataset.sc}`, { status: s.value }), "Updated", scrSupport); }));
}

async function scrAudit() {
  const r = await api("GET", `${A}/audit`);
  view("Audit", `<h1>Audit log</h1><table><thead><tr><th>At</th><th>Actor</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead><tbody>
    ${(r.data.entries || []).map((e) => `<tr class="${e.action === "read_p4" ? "row-amber" : ""}"><td>${dt(e.at)}</td><td>${esc(e.actor)}</td><td>${esc(e.action)}</td><td>${esc(e.entity)} <span class="caption">${esc(e.entity_id || "")}</span></td><td>${esc(e.reason_code || "")}</td></tr>`).join("")}</tbody></table>`);
}

// Promo codes (migration 012). Plans are display-only for now: members can check a code and see the discounted
// price, nothing is redeemed, so "Uses" stays 0 until purchases exist.
async function scrPromoCodes() {
  const r = await api("GET", `${A}/promo-codes`);
  const rows = r.ok ? r.data.promo_codes : [];
  const state = (c) => !c.is_active ? "Deactivated" : c.expires_at && new Date(c.expires_at) <= new Date() ? "Expired"
    : c.max_uses !== null && c.uses >= c.max_uses ? "Used up" : "Active";
  view("Promo codes", `<h1>Promo codes</h1>
    <p class="caption">Plans are display-only for now: members can check a code on the plans page and see the discounted price. Nothing is charged or redeemed yet.</p>
    <div id="flash"></div>
    <form id="f" class="card stack narrow">
      <div class="field"><label class="label" for="code">Code</label><input class="input" id="code" required maxlength="24" pattern="[A-Za-z0-9]{3,24}" autocomplete="off" aria-describedby="code-h">
        <span class="caption" id="code-h">3–24 letters or digits; stored in capitals.</span></div>
      <div class="field"><label class="label" for="pct">Discount (%)</label><input class="input" id="pct" type="number" min="1" max="100" step="1" required></div>
      <div class="field"><label class="label" for="exp">Expires (optional)</label><input class="input" id="exp" type="datetime-local"></div>
      <div class="field"><label class="label" for="max">Usage limit (optional)</label><input class="input" id="max" type="number" min="1" step="1"></div>
      <button class="btn btn-primary" type="submit">Create code</button></form>
    ${r.ok ? "" : msg(r)}
    <table><thead><tr><th>Code</th><th>For</th><th>Discount</th><th>Expires</th><th>Uses</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((c) => `<tr><td><code>${esc(c.code)}</code></td><td>${c.member_only ? "One member (compensation)" : "Everyone"}</td><td>${c.percent_off}%</td><td>${dt(c.expires_at)}</td>
      <td>${c.uses}${c.max_uses !== null ? ` / ${c.max_uses}` : ""}</td><td>${state(c)}</td>
      <td>${c.is_active ? `<button class="btn btn-ghost" data-off="${esc(c.id)}">Deactivate</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="caption">No codes yet.</td></tr>`}</tbody></table>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const exp = $("#exp").value;
    const body = { code: $("#code").value.trim(), percent_off: Number($("#pct").value),
      expires_at: exp ? new Date(exp + ":00+03:00").toISOString() : null, max_uses: $("#max").value ? Number($("#max").value) : null };
    const res = await api("POST", `${A}/promo-codes`, body);
    if (res.ok) scrPromoCodes(); else flash(msg(res));
  };
  $$("[data-off]").forEach((b) => (b.onclick = async () => {
    if (!(await askConfirm({ question: "Deactivate this code? Members will no longer be able to use it.", confirm: "Deactivate code", cancel: "Keep code" }))) return;
    const res = await api("POST", `${A}/promo-codes/${b.dataset.off}:deactivate`, {});
    if (res.ok) scrPromoCodes(); else flash(msg(res));
  }));
}

// ------------------------------------------------------------------ ratings (023, provisional): reasons and compensation
// Private ratings after a meetup. Low ones show the reasons the member picked; at the compensation threshold a discount
// code for her next booking is suggested, and a coordinator issues it by typing the discount and approving (one click).
const REASON_LABELS = { table_fit: "Fit with the table", venue: "Venue", food_service: "Food or service", organisation: "Organisation and timing",
  no_shows: "Some guests didn't come", other: "Other reason" };
let fbScope = "low";
async function scrFeedback() {
  const r = await api("GET", `${A}/feedback${fbScope === "all" ? "?scope=all" : ""}`);
  const d = r.data || {};
  const rows = d.feedback || [];
  view("Feedback", `<h1>Feedback</h1><div id="flash"></div>
    <p class="caption">Private ratings after a meetup (never shown to the table or the venue). Ratings of ${esc(d.low_rating_max ?? 3)} stars or less show the reasons she picked.
    At ${esc(d.compensation_max_rating ?? 2)} stars or less a discount code for her next booking is suggested: type the discount and approve. The code works once, only for her,
    and she is notified. Nothing is sent without you. Reading this list is recorded in the audit log.</p>
    <div class="row">${[["low", "Low ratings"], ["all", "All ratings"]].map(([k, l]) =>
      `<button class="btn ${fbScope === k ? "btn-primary" : "btn-secondary"}" data-scope="${k}" aria-pressed="${fbScope === k}">${l}</button>`).join("")}</div>
    ${r.ok ? "" : msg(r)}
    <div class="table-wrap"><table><thead><tr><th>Meetup</th><th>Booking</th><th>Member</th><th>Overall</th><th>Comfort</th><th>Venue</th><th>Book again</th><th>Reasons</th><th>Comment</th><th>Compensation</th></tr></thead><tbody>
    ${rows.map((f) => `<tr class="${f.compensation_suggested ? "row-amber" : ""}"><td>${esc(f.experience)} · ${dt(f.starts_at)}</td><td class="num">${esc(f.booking_ref)}</td>
      <td>${esc(f.member || "—")}</td><td><strong>${esc(f.overall_rating)}</strong>/5</td><td>${esc(f.comfort_rating)}/5</td><td>${f.venue_rating ? `${esc(f.venue_rating)}/5` : "—"}</td>
      <td>${f.would_book_again === null ? "—" : f.would_book_again ? "Yes" : "No"}</td>
      <td>${f.low_rating_reasons.map((k) => esc(REASON_LABELS[k] || k)).join(", ") || "—"}</td><td class="cr-note" dir="auto">${esc(f.comment || "—")}</td>
      <td>${f.compensation ? `<code>${esc(f.compensation.code)}</code> · ${esc(f.compensation.percent_off)}%<br><span class="caption">${esc(f.compensation.issued_by || "")} · ${dt(f.compensation.issued_at)}</span>`
        : f.compensation_suggested ? `<form class="row" data-comp="${esc(f.id)}"><span class="badge badge-warning">Suggested</span>
            <label class="sr-only" for="pct-${esc(f.id)}">Discount for her next booking (%)</label>
            <input class="input inline" id="pct-${esc(f.id)}" type="number" min="1" max="100" step="1" required placeholder="%">
            <button class="btn btn-primary" type="submit">Approve and send code</button></form>` : "—"}</td></tr>`).join("")
      || `<tr><td colspan="10">Nothing here.</td></tr>`}
    </tbody></table></div>`);
  $$("[data-scope]").forEach((b) => (b.onclick = () => { fbScope = b.dataset.scope; scrFeedback(); }));
  $$("form[data-comp]").forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("button", f);
    btn.disabled = true;
    const res = await api("POST", `${A}/feedback/${f.dataset.comp}:compensate`, { percent_off: Number($("input", f).value) });
    flash(msg(res, res.ok ? `Code ${res.data.code} (${res.data.percent_off}%) sent to the member` : ""));
    if (res.ok) setTimeout(scrFeedback, 600); else btn.disabled = false;
  }));
}

// ------------------------------------------------------------------ call requests (017)
// Members who pressed "Request Call". Open count on the menu (a count only: no numbers are read, nothing is audited).
async function callBadge() {
  const r = await api("GET", `${A}/call-requests?count=1`);
  const link = nav.querySelector('a[href="#/call-requests"]');
  if (link && r.ok && r.data.open_count) link.insertAdjacentHTML("beforeend", ` <span class="badge badge-danger"><span class="sr-only">waiting: </span>${r.data.open_count}</span>`);
  return r.ok ? r.data.open_count : null;
}
const CR_WHEN = { now: "Now", "10min": "In 10 minutes", "1h": "In an hour", tomorrow: "Tomorrow" };
async function scrCallRequests(opts) {
  const crStatus = filterOf("call-requests");
  const r = await api("GET", `${A}/call-requests?status=${crStatus}`);
  const rows = (r.data && r.data.requests) || [];
  view("Call requests", `<h1>Call requests</h1><div id="flash"></div>
    <p class="caption">Members who asked to be called: what the problem or request is, the number to call and when. Call her, then mark it.
    Reading the notes and numbers is recorded in the audit log. Rows shaded amber are due now.</p>
    ${filterBar("call-requests")}
    ${r.ok ? "" : msg(r)}
    <table><thead><tr><th>When to call</th><th>Name</th><th>Call on</th><th>Note</th><th>Meetup</th><th>Handled</th><th></th></tr></thead><tbody>
    ${rows.map((x) => { const to = x.contact_phone || x.phone; const due = x.due_at && x.status === "requested" && new Date(x.due_at) <= new Date();
      return `<tr class="${due ? "row-amber" : ""}"><td><strong>${esc(CR_WHEN[x.callback_when] || x.callback_when)}</strong>${x.due_at ? `<br><span class="caption">${dt(x.due_at)}</span>` : ""}<br><span class="caption">sent ${dt(x.sent_at)}${x.submissions > 1 ? ` · edited ${x.submissions - 1}×` : ""}</span></td>
      <td>${esc(x.name || "—")}</td>
      <td>${to ? `<a href="tel:${esc(to)}" dir="ltr" class="num">${esc(to)}</a>` : "—"}${x.contact_phone && x.phone ? `<br><span class="caption">signed up with <bdi dir="ltr" class="num">${esc(x.phone)}</bdi></span>` : ""}</td>
      <td class="cr-note" dir="auto">${esc(x.message || "—")}</td>
      <td>${x.booking_ref ? `${esc(x.booking_ref)} · ${dt(x.starts_at)}` : "—"}</td>
      <td>${x.handled_at ? `${esc(x.handled_by || "")} · ${dt(x.handled_at)}` : ""}</td>
      <td class="row">${x.status === "requested" ? `<button class="btn btn-primary" data-called="${esc(x.id)}">Called</button><button class="btn btn-secondary" data-closed="${esc(x.id)}">Close</button>` : ""}</td></tr>`; }).join("")
      || `<tr><td colspan="7">Nothing here.</td></tr>`}</tbody></table>`, opts);
  bindFilters("call-requests", scrCallRequests);
  const mark = async (b, id, status) => {
    b.disabled = true;
    const res = await api("POST", `${A}/call-requests/${id}:handle`, { status });
    await actThen(res, status === "called" ? "Marked as called" : "Closed", scrCallRequests);
    if (!res.ok) b.disabled = false;
  };
  $$("[data-called]").forEach((b) => (b.onclick = () => mark(b, b.dataset.called, "called")));
  $$("[data-closed]").forEach((b) => (b.onclick = () => mark(b, b.dataset.closed, "closed")));
  // a new request shows up without reloading: every 30 s the open count is compared (a count, so nothing is audited).
  // One timer per screen: a redraw (filter, action) clears the previous one first.
  timers.forEach(clearInterval); timers = [];
  if (crStatus === "requested" && r.ok) {
    const shown = r.data.open_count;
    timers.push(setInterval(async () => {
      if (location.hash !== "#/call-requests" || filterOf("call-requests") !== "requested") return;
      const now = await api("GET", `${A}/call-requests?count=1`);
      if (now.ok && now.data.open_count !== shown) quietly(scrCallRequests);
    }, 30000));
  }
}

// ------------------------------------------------------------------ coordinator alerts (019, plan T13)
// S1/S2 reports during a meetup and "I am in danger now". Owner and ops see the open ones above every screen, checked
// every 30 s, with Acknowledge (who and when are recorded). #/alerts lists them and turns alerts on for this browser.
const COORDINATORS = ["owner", "ops"];
const ALERT_KIND = { immediate_danger: "Immediate danger", report_during: "Report during a meetup" };
const alertWhat = (x) => `${ALERT_KIND[x.kind] || x.kind} · S${x.severity} · <span class="num">${esc(x.case_ref)}</span>`;
const alertWhere = (x) => [x.venue, x.table_code].filter(Boolean).map(esc).join(" · ");
let alertTimer = null;

async function ackAlert(id, btn) {
  btn.disabled = true;
  const r = await api("POST", `${A}/coordinator-alerts/${id}:acknowledge`, {});
  const out = document.getElementById("alerts-msg");
  if (out) out.innerHTML = r.ok ? "" : msg(r);
  if (!r.ok && r.status !== 409) { btn.disabled = false; return; }
  await alertStrip(true);
  if (location.hash === "#/alerts") scrAlerts();
}

async function alertStrip(force = false) {
  const box = document.getElementById("alerts");
  const a = ss.get("admin");
  if (!box) return;
  if (!a || !COORDINATORS.includes(a.role) || !ss.get("token")) { box.innerHTML = ""; box.dataset.sig = ""; return; }
  if (!alertTimer) alertTimer = setInterval(() => alertStrip(), 30000);
  const r = await api("GET", `${A}/coordinator-alerts`);
  if (!r.ok) return;
  const open = r.data.alerts || [];
  // the count on the menu, which stays in sight on a phone (the menu is redrawn on every screen)
  const link = nav.querySelector('a[href="#/alerts"]');
  if (link) {
    link.querySelector(".alert-count")?.remove();
    if (open.length) link.insertAdjacentHTML("beforeend", ` <span class="badge badge-danger alert-count"><span class="sr-only">not acknowledged: </span>${open.length}</span>`);
  }
  // redrawn only when the open alerts change, so a screen reader announces each new alert once
  const sig = open.map((x) => `${x.id}${x.escalated_at ? "+" : ""}`).join(",");
  if (!force && box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.innerHTML = open.length ? `<div class="alert-strip" role="alert">${open.slice(0, 3).map((x) => `<div class="banner banner-danger">
      <div><strong>Safety alert</strong> · ${alertWhat(x)}${alertWhere(x) ? ` · ${alertWhere(x)}` : ""}<br><span class="caption">Raised ${dt(x.created_at)}${x.escalated_at ? ` · not acknowledged, sent again ${dt(x.escalated_at)}` : ""}</span></div>
      <button class="btn btn-primary" data-ack="${esc(x.id)}">Acknowledge</button></div>`).join("")}
    ${open.length > 3 ? `<p><a href="#/alerts">See all ${open.length} alerts</a></p>` : ""}</div><div id="alerts-msg"></div>` : "";
  box.querySelectorAll("[data-ack]").forEach((b) => (b.onclick = () => ackAlert(b.dataset.ack, b)));
}

// This browser: alerts arrive as notifications through the site's service worker (the same as members' notifications).
// Turning them off only tells the server to stop; the browser's subscription stays, in case it also serves the member app.
const pushReady = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function browserSub() {
  try { const reg = await navigator.serviceWorker.getRegistration("/"); return reg && reg.pushManager ? await reg.pushManager.getSubscription() : null; }
  catch { return null; }
}
const keyBytes = (s) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "=".repeat((4 - (t.length % 4)) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function alertsOnHere() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, data: { code: "NOTIFICATIONS_BLOCKED", message: "Allow notifications for this site in the browser settings, then try again." } };
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const k = await api("GET", "/api/v1/push/key");
  if (!k.ok) return k;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.data.public_key) });
  const j = sub.toJSON();
  return api("POST", `${A}/push/subscriptions`, { endpoint: j.endpoint, keys: j.keys });
}

async function scrAlerts(opts) {
  const alertFilter = filterOf("alerts");
  const [r, mine] = await Promise.all([api("GET", `${A}/coordinator-alerts?status=${alertFilter}`), api("GET", `${A}/push/subscriptions`)]);
  const rows = (r.data && r.data.alerts) || [];
  const ch = (r.data && r.data.channels) || { push_devices: 0, sms: false, sms_numbers: 0 };
  const sub = pushReady() ? await browserSub() : null;
  const here = Boolean(sub && mine.ok && (mine.data.devices || []).some((d) => d.endpoint === sub.endpoint));
  const device = !pushReady() ? "This browser cannot receive alerts."
    : Notification.permission === "denied" ? "Notifications are blocked for this site. Allow them in the browser settings."
    : here ? "Alerts are on for this device." : "Alerts are off for this device.";
  const sent = (x) => `Push ${x.push.delivered}/${x.push.devices} · SMS ${ch.sms || x.sms.numbers ? `${x.sms.delivered}/${x.sms.numbers}` : "off"}`;
  view("Alerts", `<h1>Alerts</h1><div id="flash"></div>
    <p class="caption">Safety reports that must reach a coordinator at once: S1 or S2 during a meetup, and every "I am in danger now".
    Each alert goes to every coordinator device with alerts on${ch.sms ? " and by SMS to the coordinators' numbers" : ""}.
    If nobody acknowledges it within ${esc(r.data && r.data.escalate_after_minutes || 5)} minutes, it is sent again, once. The case itself is in Trust &amp; Safety.</p>
    <section class="card stack"><h2>This device</h2><p id="dev-state">${esc(device)}</p>
      ${pushReady() && Notification.permission !== "denied" ? `<div class="row">${here ? `<button class="btn btn-secondary" id="dev-off">Turn off alerts on this device</button>`
        : `<button class="btn btn-primary" id="dev-on">Turn on alerts on this device</button>`}</div>` : ""}
      <p class="caption">Alerts now reach ${ch.push_devices} coordinator ${ch.push_devices === 1 ? "device" : "devices"} · SMS: ${ch.sms ? `${ch.sms_numbers} ${ch.sms_numbers === 1 ? "number" : "numbers"}` : "not set up"}</p></section>
    ${filterBar("alerts")}
    ${r.ok ? "" : msg(r)}
    <div class="table-wrap"><table><thead><tr><th>Raised</th><th>Alert</th><th>Venue · table</th><th>Sent</th><th>Sent again</th><th>Acknowledged</th><th></th></tr></thead><tbody>
    ${rows.map((x) => `<tr class="${x.acknowledged_at ? "" : "row-red"}"><td>${dt(x.created_at)}</td><td>${alertWhat(x)}</td><td>${alertWhere(x) || "—"}</td>
      <td>${sent(x)}</td><td>${x.escalated_at ? `${dt(x.escalated_at)}<br><span class="caption">Push ${x.escalation.push_delivered} · SMS ${x.escalation.sms_delivered}</span>` : "—"}</td>
      <td>${x.acknowledged_at ? `${esc(x.acknowledged_by || "")} · ${dt(x.acknowledged_at)}` : "Not yet"}</td>
      <td>${x.acknowledged_at ? "" : `<button class="btn btn-primary" data-ack="${esc(x.id)}">Acknowledge</button>`}</td></tr>`).join("")
      || `<tr><td colspan="7">${alertFilter === "open" ? "No open alerts." : "No alerts yet."}</td></tr>`}</tbody></table></div>`, opts);
  bindFilters("alerts", scrAlerts);
  $$("[data-ack]").forEach((b) => (b.onclick = () => ackAlert(b.dataset.ack, b)));
  const on = $("#dev-on");
  if (on) on.onclick = async () => {
    on.disabled = true;
    let res;
    try { res = await alertsOnHere(); } catch (e) { res = { ok: false, data: { code: "ERROR", message: String(e && e.message || e) } }; }
    flash(msg(res, "Alerts are on for this device"));
    if (res.ok) setTimeout(scrAlerts, 600); else on.disabled = false;
  };
  const off = $("#dev-off");
  if (off) off.onclick = async () => {
    off.disabled = true;
    const res = await api("POST", `${A}/push/subscriptions:delete`, { endpoint: sub.endpoint });
    flash(msg(res, "Alerts are off for this device"));
    if (res.ok) setTimeout(scrAlerts, 600); else off.disabled = false;
  };
}

// ------------------------------------------------------------------ failed phone notifications (021, provisional)
// Phone notifications no device accepted after every retry. The coordinator reaches the member another way (call or
// WhatsApp; the message in her language can be copied), then marks it handled. Open count on the menu (a count only).
async function failedBadge() {
  const r = await api("GET", `${A}/notifications/failed?count=1`);
  const link = nav.querySelector('a[href="#/failed-notifications"]');
  if (link && r.ok && r.data.open_count) link.insertAdjacentHTML("beforeend", ` <span class="badge badge-danger"><span class="sr-only">open: </span>${r.data.open_count}</span>`);
}
let fnStatus = "open";
async function scrFailedNotifications() {
  const r = await api("GET", `${A}/notifications/failed${fnStatus === "handled" ? "?status=handled" : ""}`);
  const rows = (r.data && r.data.notifications) || [];
  view("Failed notifications", `<h1>Failed notifications</h1><div id="flash"></div>
    <p class="caption">Phone notifications no device accepted, after 3 retries (2, 10 and 30 minutes later). The message is in the member's inbox,
    but she may not have seen it: reach her another way (call or WhatsApp), then mark it handled. Reading the numbers is recorded in the audit log.</p>
    <div class="row">${[["open", "Open"], ["handled", "Handled"]].map(([k, l]) =>
      `<button class="btn ${fnStatus === k ? "btn-primary" : "btn-secondary"}" data-fn-filter="${k}" aria-pressed="${fnStatus === k}">${l}</button>`).join("")}</div>
    ${r.ok ? "" : msg(r)}
    <div class="table-wrap"><table><thead><tr><th>Queued</th><th>Name</th><th>Call on</th><th>Message</th><th>Meetup</th><th>Tries</th><th></th></tr></thead><tbody>
    ${rows.map((x, i) => `<tr><td>${dt(x.created_at)}</td><td>${esc(x.name || "—")}${x.member_status !== "active" ? `<br><span class="caption">${esc(x.member_status)}</span>` : ""}</td>
      <td>${x.phone ? `<a href="tel:${esc(x.phone)}" dir="ltr" class="num">${esc(x.phone)}</a>` : "—"}</td>
      <td class="cr-note">${esc(x.text_en)}${x.locale !== "en" ? `<br><button class="btn btn-ghost" data-fn-copy="${i}">Copy in her language</button>` : ""}</td>
      <td>${x.booking_ref ? `${esc(x.booking_ref)} · ` : ""}${x.starts_at ? dt(x.starts_at) : "—"}</td>
      <td>${x.attempts}<br><span class="caption">last ${dt(x.last_try_at)}${x.last_error ? ` · ${esc(x.last_error)}` : ""}</span></td>
      <td>${x.handled_at ? `${esc(x.handled_by || "")} · ${dt(x.handled_at)}` : `<button class="btn btn-primary" data-fn-done="${esc(x.id)}">Handled</button>`}</td></tr>`).join("")
      || `<tr><td colspan="7">Nothing here.</td></tr>`}</tbody></table></div>`);
  $$("[data-fn-filter]").forEach((b) => (b.onclick = () => { fnStatus = b.dataset.fnFilter; scrFailedNotifications(); }));
  $$("[data-fn-copy]").forEach((b) => (b.onclick = async () => {
    try { await navigator.clipboard.writeText(rows[Number(b.dataset.fnCopy)].text); b.textContent = "Copied"; } catch { b.textContent = "Copy failed"; }
  }));
  $$("[data-fn-done]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const res = await api("POST", `${A}/notifications/${b.dataset.fnDone}:handled`, {});
    flash(msg(res, "Marked as handled"));
    if (res.ok) setTimeout(scrFailedNotifications, 600); else b.disabled = false;
  }));
}

// ------------------------------------------------------------------ step counter (021, item 44, provisional)
// How many times each sign-up and booking step was reached, per day: counts only (no member, address or device).
const FUNNEL_LABELS = { signup_welcome: "Welcome", signup_quiz: "Quiz", signup_phone: "Phone", signup_code: "Code", signup_register: "Register",
  signup_done: "Signed up", booking_sessions: "Sessions", booking_review: "Review", booking_checkout: "Checkout", booking_paid: "Paid" };
let funnelPlatform = "all";
async function scrFunnel() {
  const r = await api("GET", `${A}/funnel?days=30`);
  if (!r.ok) { view("Step counter", `<h1>Step counter</h1>${msg(r)}`); return; }
  const { enabled, steps, platforms, rows } = r.data;
  const days = [...new Set(rows.map((x) => x.day))];
  const count = (day, step) => rows.filter((x) => x.day === day && x.step === step && (funnelPlatform === "all" || x.platform === funnelPlatform))
    .reduce((n, x) => n + x.count, 0);
  view("Step counter", `<h1>Step counter</h1>
    <p class="caption">How many times each sign-up and booking step was reached, per day (Qatar time), last 30 days. Counts only: no member, address or device is recorded.</p>
    ${enabled ? "" : `<div class="banner banner-warning"><div>The counter is off (FUNNEL_COUNTER_ENABLED). Turn it on only after the privacy notice has a line for it.</div></div>`}
    <div class="row">${[["all", "All"], ...platforms.map((p) => [p, p === "ios" ? "iOS" : p === "android" ? "Android" : "Web"])].map(([k, l]) =>
      `<button class="btn ${funnelPlatform === k ? "btn-primary" : "btn-secondary"}" data-fp="${k}" aria-pressed="${funnelPlatform === k}">${l}</button>`).join("")}</div>
    <div class="table-wrap"><table><thead><tr><th>Day</th>${steps.map((s) => `<th>${esc(FUNNEL_LABELS[s] || s)}</th>`).join("")}</tr></thead><tbody>
    ${days.map((d) => `<tr><td class="num">${esc(d)}</td>${steps.map((s) => `<td class="num">${count(d, s) || "—"}</td>`).join("")}</tr>`).join("")
      || `<tr><td colspan="${steps.length + 1}">No counts yet.</td></tr>`}</tbody></table></div>`);
  $$("[data-fp]").forEach((b) => (b.onclick = () => { funnelPlatform = b.dataset.fp; scrFunnel(); }));
}

// ------------------------------------------------------------------ router
const ROUTES = [
  [/^#\/login$/, scrLogin, false], [/^#\/enroll$/, scrEnroll, false], [/^#\/sessions$/, scrSessions, true], [/^#\/sessions\/([\w-]+)$/, scrSession, true],
  [/^#\/live$/, scrLive, true], [/^#\/venues$/, scrVenues, true], [/^#\/refunds$/, scrRefunds, true], [/^#\/cases$/, scrCases, true],
  [/^#\/cases\/([\w-]+)(?:\?(.*))?$/, scrCase, true], [/^#\/approvals$/, scrApprovals, true], [/^#\/support$/, scrSupport, true], [/^#\/audit$/, scrAudit, true],
  [/^#\/promo-codes$/, scrPromoCodes, true], [/^#\/identity$/, scrIdentity, true],
  [/^#\/venue-requests$/, scrVenueRequests, true], [/^#\/call-requests$/, scrCallRequests, true], [/^#\/alerts$/, scrAlerts, true],
  [/^#\/failed-notifications$/, scrFailedNotifications, true], [/^#\/funnel$/, scrFunnel, true],
  [/^#\/feedback$/, scrFeedback, true],
];
async function route() {
  timers.forEach(clearInterval); timers = [];
  const h = location.hash || "#/login";
  renderNav();
  for (const [re, fn, auth] of ROUTES) {
    const m = re.exec(h);
    if (!m) continue;
    if (auth && !ss.get("token")) { go("#/login"); return; }
    try { await fn(...m.slice(1)); } catch (e) { view("Error", `<h1>Error</h1><pre>${esc(e && e.message)}</pre>`); }
    return;
  }
  go(ss.get("token") ? NAV.find(([, , roles]) => roles.includes(ss.get("admin").role))[0] : "#/login");
}
window.addEventListener("hashchange", route);
route();
