// HerZone admin panel (v0.3 §4): role-based navigation, maker-checker, P4 reason prompt. English UI for the ops team.
const CFG = Object.assign({ apiBase: "" }, window.QATAR_CONFIG || {});
// Supabase runs the function next to the database when apiRegion is set (forceFunctionRegion: no extra CORS header needed).
const apiUrl = (path) => CFG.apiBase + path + (CFG.apiRegion ? `${path.includes("?") ? "&" : "?"}forceFunctionRegion=${CFG.apiRegion}` : "");
const A = "/api/admin/v1";
const ss = {
  get: (k) => { try { return JSON.parse(sessionStorage.getItem("qa_" + k)); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem("qa_" + k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  del: (k) => { try { sessionStorage.removeItem("qa_" + k); } catch { /* storage blocked */ } },
};
const main = document.getElementById("main");
const nav = document.getElementById("nav");
let timers = [];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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

function view(title, html) {
  main.innerHTML = html;
  document.title = `${title} · HerZone Admin`;
  const h = main.querySelector("h1");
  if (h) { h.tabIndex = -1; h.focus(); }
}
const msg = (r, okText) => r.ok ? `<div class="banner banner-success" role="status"><div>${esc(okText || "Done")}${r.status === 202 ? " — sent for approval (maker-checker)." : ""}</div></div>`
  : `<div class="banner banner-danger" role="alert"><div><strong>${esc(r.data.code || "Error")}</strong> ${esc(r.data.message || "")}${r.data.retry_after ? ` Try again in ${Math.ceil(r.data.retry_after / 60)} min.` : ""} ${r.data.details ? `<code>${esc(JSON.stringify(r.data.details))}</code>` : ""}</div></div>`;
function flash(html) { const el = document.getElementById("flash"); el.innerHTML = html; el.scrollIntoView({ block: "nearest" }); }

const NAV = [
  ["#/sessions", "Sessions & Matching", ["owner", "ops", "analyst", "finance"]],
  ["#/live", "Tonight", ["owner", "ops"]],
  ["#/venues", "Venues", ["owner", "ops"]],
  ["#/refunds", "Refunds & Payments", ["owner", "finance"]],
  ["#/cases", "Trust & Safety", ["trust_safety"]],
  ["#/identity", "Identity checks", ["owner", "trust_safety"]],
  ["#/approvals", "Approvals", ["owner", "ops", "finance", "trust_safety", "analyst"]],
  ["#/support", "Q07 private contact", ["owner", "ops"]],
  ["#/promo-codes", "Promo codes", ["owner"]],
  ["#/audit", "Audit log", ["owner"]],
];

function renderNav() {
  const a = ss.get("admin");
  nav.innerHTML = a ? `<span class="brand"><span class="brand-mark" aria-hidden="true">H</span>HerZone Admin</span>
    <ul>${NAV.filter(([, , roles]) => roles.includes(a.role)).map(([h, l]) => `<li><a href="${h}" ${location.hash.startsWith(h) ? 'aria-current="page"' : ""}>${esc(l)}</a></li>`).join("")}</ul>
    <span class="spacer"></span><span class="caption">${esc(a.name)} · <strong>${esc(a.role)}</strong></span><button class="btn btn-ghost" id="logout">Sign out</button>`
    : `<span class="brand"><span class="brand-mark" aria-hidden="true">H</span>HerZone Admin</span>`;
  const lo = document.getElementById("logout");
  // sign-out ends the session on the server too (NMX-63); the browser copy is cleared whatever the answer
  if (lo) lo.onclick = async () => { await api("POST", "/api/admin/v1/auth/logout").catch(() => null); ss.del("token"); ss.del("admin"); renderNav(); go("#/login"); };
}

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
async function scrSessions() {
  const r = await api("GET", `${A}/sessions`);
  const role = ss.get("admin").role;
  const canEdit = ["owner", "ops"].includes(role);
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
    <div class="table-wrap"><table><thead><tr><th>Starts</th><th>Exp.</th><th>Lang</th><th>Area</th><th>Status</th><th>Sold</th><th>Paid, unseated</th><th>Tables</th><th></th></tr></thead><tbody>
    ${(r.data.sessions || []).map((s) => `<tr><td>${dt(s.starts_at)}</td><td>${esc(s.experience)}</td><td>${esc(s.language)}</td><td>${esc(s.district)}</td>
      <td><span class="badge badge-${s.status === "on_sale" ? "success" : s.status === "draft" ? "warning" : "muted"}">${esc(s.status)}</span></td>
      <td>${s.seats_sold}/${s.max_seats}</td><td>${s.paid_waiting}</td><td>${s.tables} (${s.locked_tables} locked)</td>
      <td><a href="#/sessions/${s.id}">Open</a>${canEdit && s.status === "draft" ? ` · <button class="link-btn" data-open="${s.id}">Open sale</button>` : ""}</td></tr>`).join("")}
    </tbody></table></div>`);
  const f = $("#f");
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f));
    fd.starts_at = new Date(fd.starts_at + ":00+03:00").toISOString();
    fd.duration_minutes = Number(fd.duration_minutes); fd.max_seats = Number(fd.max_seats);
    const c = await api("POST", `${A}/sessions`, fd);
    flash(msg(c, "Draft session created"));
    if (c.ok) setTimeout(scrSessions, 600);
  };
  $$("[data-open]").forEach((b) => (b.onclick = async () => { const c = await api("POST", `${A}/sessions/${b.dataset.open}:open-sale`); flash(msg(c, "Session is on sale")); if (c.ok && c.status === 200) setTimeout(scrSessions, 600); }));
}

async function scrSession(id) {
  const r = await api("GET", `${A}/sessions/${id}`);
  if (!r.ok) { view("Session", `<h1>Session</h1>${msg(r)}`); return; }
  const d = r.data, s = d.session;
  const role = ss.get("admin").role;
  const ops = ["owner", "ops"].includes(role);
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
      <p>${t.confirmed_count}/${t.capacity} confirmed ${t.confirmed_count < 4 && t.status === "forming" ? `<span class="badge badge-danger">below quorum</span>` : ""} · venue confirmed: ${t.venue_confirmed_at ? "✓" : "✗"}</p>
      <ul class="plain">${t.members.map((m) => `<li><span class="num">${esc(m.ref)}</span> ${esc(m.display_name || "—")} · ${esc(m.status)}${m.checked_in ? " ✓" : ""}
        ${ops && t.status === "forming" ? ` <select class="input inline" data-move="${m.booking_id}"><option value="">move to…</option>${d.tables.filter((x) => x.id !== t.id && x.status === "forming").map((x) => `<option value="${x.id}">${esc(x.code)}</option>`).join("")}</select>` : ""}</li>`).join("")}</ul>
      ${ops ? `<div class="row">${t.status === "forming" ? `<button class="btn btn-primary" data-lock="${t.id}">Lock</button><button class="btn btn-danger" data-cq="${t.id}">Cancel (quorum)</button>` : ""}
        <button class="btn btn-ghost" data-vc="${t.id}">Venue confirmed (T-3h)</button></div>` : ""}</section>`).join("") || "<p class='muted'>No tables yet — run matching.</p>"}</div>
    ${d.unassigned.length ? `<section class="card"><h2>${d.tables.length ? "Paid but not seated (leftovers)" : "Paid, waiting for matching"}</h2><p>${d.unassigned.map((u) => `<span class="num">${esc(u.ref)}</span> ${esc(u.display_name || "")}`).join(" · ")}</p></section>` : ""}
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
      ${ex.tables.map((t) => `<tr><td>${esc(t.table_code)}</td><td>${esc(t.language)}</td><td>${t.tier_rank}</td><td>${t.size}</td><td>${t.answered}/${t.size}</td>
        <td>${pct(t.interest)}</td><td>${pct(t.cohesion)}</td><td>${pct(t.energy_balance)}</td><td>${pct(t.score)}</td>
        <td>${Object.values(t.checks).every(Boolean) ? "✓ all" : "✗"}</td><td>${esc(t.warnings.join("; "))}</td></tr>`).join("")}</tbody></table>`;
  };
  const showRun = (res) => {
    if (!res.ok) { $("#explain").innerHTML = msg(res); return; }
    const ex = res.data.explanations;
    $("#explain").innerHTML = `<section class="card"><h2>${esc(res.data.mode)} · seed ${res.data.seed} · inputs ${esc(res.data.inputs_hash.slice(0, 12))}…</h2>
      <p><code>${esc(JSON.stringify(res.data.summary))}</code></p>
      ${ex.algorithm === "personality_v1" ? personalityTable(ex) : `<table><thead><tr><th>Table</th><th>Lang</th><th>Tier</th><th>Size</th><th>I</th><th>C</th><th>Score</th><th>Pseudonymous seats</th><th>Checks</th><th>Warnings</th></tr></thead><tbody>
      ${ex.tables.map((t) => `<tr><td>${esc(t.table_code)}</td><td>${esc(t.language)}</td><td>${t.tier_rank}</td><td>${t.size}</td><td>${t.interest ?? "—"}</td><td>${t.cohesion ?? "—"}</td><td>${t.score ?? "—"}</td>
        <td class="caption">${t.seats.map(esc).join(" ")}</td><td>${Object.values(t.checks).every(Boolean) ? "✓ all" : "✗"}</td><td>${esc(t.warnings.join("; "))}</td></tr>`).join("")}</tbody></table>`}
      <p>Leftovers: ${ex.leftovers.map((l) => `${esc(l.seat)} (${esc(l.reason)})`).join(", ") || "none"} · Ineligible: ${ex.ineligible.length} · Venue warnings: ${esc(ex.venue_warnings.join("; ") || "none")}</p></section>`;
  };
  $("#mf").onsubmit = async (e) => { e.preventDefault(); showRun(await api("POST", `${A}/sessions/${id}/matching:dry-run`, body())); };
  const pub = $("#pub");
  if (pub) pub.onclick = async () => { const res = await api("POST", `${A}/sessions/${id}/matching:publish`, body()); showRun(res); if (res.ok) setTimeout(() => scrSession(id), 1200); };
  const act = async (path, ok) => { const res = await api("POST", path); flash(msg(res, ok)); if (res.ok) setTimeout(() => scrSession(id), 900); };
  $$("[data-lock]").forEach((b) => (b.onclick = () => act(`${A}/tables/${b.dataset.lock}:lock`, "Table locked; members notified")));
  $$("[data-cq]").forEach((b) => (b.onclick = () => { if (confirm("Cancel this table for quorum? Members get QUORUM_FAIL_CHOICE.")) act(`${A}/tables/${b.dataset.cq}:cancel-quorum`, "Table cancelled"); }));
  $$("[data-vc]").forEach((b) => (b.onclick = () => act(`${A}/tables/${b.dataset.vc}:venue-confirmed`, "Venue confirmation recorded")));
  $$("[data-move]").forEach((sel) => (sel.onchange = async () => {
    if (!sel.value) return;
    const reason = prompt("Reason code: quorum_merge, friend_request_separate, accessibility_fit, ops_balance, other", "quorum_merge");
    if (!reason) return;
    const res = await api("POST", `${A}/bookings/${sel.dataset.move}:move`, { to_table_id: sel.value, reason });
    flash(msg(res, "Member moved; MOVED_TABLE sent")); if (res.ok) setTimeout(() => scrSession(id), 900);
  }));
  const rev = $("#rev"); if (rev) rev.onclick = () => act(`${A}/sessions/${id}:reveal`, "Venue revealed to locked tables");
  const cmp = $("#cmp"); if (cmp) cmp.onclick = () => act(`${A}/sessions/${id}:complete`, "Session completed (no-shows marked)");
}

// ------------------------------------------------------------------ tonight live board
async function scrLive() {
  const draw = async () => {
    const r = await api("GET", `${A}/live/tonight`);
    if (!location.hash.startsWith("#/live")) return;
    view("Tonight", `<h1>Tonight board</h1><p class="caption">Auto-refresh every 30 s · generated ${dt(r.data && r.data.generated_at)} · ops sees incident category only, never the narrative.</p>
      <table><thead><tr><th>Start</th><th>Area</th><th>Venue · table</th><th>Confirmed</th><th>Checked in</th><th>Late cancels</th><th>Incidents</th><th>Alerts</th></tr></thead><tbody>
      ${(r.data.tables || []).map((t) => `<tr class="${t.alerts.some((a) => a.level === "red") ? "row-red" : t.alerts.length ? "row-amber" : ""}"><td>${dt(t.starts_at)}</td><td>${esc(t.district)}</td><td>${esc(t.venue)} · ${esc(t.table_code)}</td>
        <td>${t.confirmed}</td><td>${t.checked_in}</td><td>${t.late_cancellations}</td><td>${t.incidents.open_s1_s2 ? `<span class="badge badge-danger">S1/S2 · ${esc(t.incidents.categories.join(", "))}</span>` : "—"}</td>
        <td>${t.alerts.map((a) => `<span class="badge badge-${a.level === "red" ? "danger" : "warning"}">${esc(a.code)}</span>`).join(" ") || "✓"}</td></tr>`).join("") || `<tr><td colspan="8">No locked tables in the next 30 hours.</td></tr>`}
      </tbody></table>`);
  };
  await draw();
  timers.push(setInterval(draw, 30000));
}

// ------------------------------------------------------------------ venues
async function scrVenues() {
  const r = await api("GET", `${A}/venues`);
  view("Venues", `<h1>Venues</h1><div id="flash"></div>
    <table><thead><tr><th>Name</th><th>District</th><th>Type</th><th>Tables × seats</th><th>Tier</th><th>Noise</th><th>Separate bills</th><th>Contract</th><th>Active</th><th>Rating (n≥5)</th><th>Day-of contacts</th><th></th></tr></thead><tbody>
    ${(r.data.venues || []).map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.district_en)}</td><td>${esc(v.venue_type)}</td><td>${v.total_bookable_tables} × ${v.seats_per_table_max}</td>
      <td>${v.tier_rank}</td><td>${v.noise_level}</td><td>${v.separate_bills_confirmed ? "✓" : "✗"}</td><td>${esc(v.contract_status)}</td>
      <td><button class="link-btn" data-toggle="${v.id}" data-active="${v.is_active}">${v.is_active ? "Pause" : "Activate"}</button></td><td>${v.avg_venue_rating ?? "—"}</td>
      <td>${v.day_of_contacts}</td><td><button class="link-btn" data-contacts="${v.id}">Contacts</button></td></tr>`).join("")}</tbody></table>
    <div id="contacts"></div>`);
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
async function scrIdentity() {
  const r = await api("GET", `${A}/identity-reviews`);
  const rows = (r.data && r.data.reviews) || [];
  view("Identity checks", `<h1>Identity checks</h1>
    <p class="caption">Bookings where the name on the payment card did not match the member's registered first name (or she has no name).
    She has paid, but the venue and table code stay hidden from her until you decide. Reading this list is recorded in the audit log.</p>
    <p class="caption"><strong>Approve</strong>: the venue shows (a relative paying for her is a common reason).
    <strong>Reject</strong>: the booking is cancelled <strong>without a refund</strong> and the account is suspended for 30 days; she can appeal under "Decisions about you", and an upheld appeal refunds the fee.</p>
    <div id="flash"></div>
    <table><thead><tr><th>Booking</th><th>Meetup</th><th>Registered name</th><th>Name on card</th><th>Result</th><th>Account</th><th></th></tr></thead><tbody>
    ${rows.map((x) => `<tr><td class="num">${esc(x.booking_ref)}</td><td>${dt(x.starts_at)}</td><td>${esc(x.registered_name || "—")}</td>
      <td>${esc(x.card_name || "—")}</td><td>${x.result === "no_name" ? "No registered name" : "Different name"}</td><td>${esc(x.member_status)}</td>
      <td class="row"><button class="btn btn-primary" data-ok="${x.id}">Approve</button>
        <button class="btn btn-danger" data-no="${x.id}">Reject…</button></td></tr>`).join("") || `<tr><td colspan="7">Nothing to review.</td></tr>`}
    </tbody></table>`);
  $$("[data-ok]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const res = await api("POST", `${A}/identity-reviews/${b.dataset.ok}:decide`, { decision: "approve" });
    flash(msg(res, "Approved: the venue now shows for her"));
    if (res.ok) setTimeout(route, 800);
  }));
  $$("[data-no]").forEach((b) => (b.onclick = async () => {
    const why = prompt("Reason for rejecting (kept encrypted, shown in the case):");
    if (why === null) return;
    if (!confirm("Cancel this booking WITHOUT a refund and suspend the account for 30 days?")) return;
    b.disabled = true;
    const res = await api("POST", `${A}/identity-reviews/${b.dataset.no}:decide`, { decision: "reject", rationale: why });
    flash(msg(res, "Rejected: booking cancelled without refund, account suspended"));
    if (res.ok) setTimeout(route, 800);
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
async function scrApprovals() {
  const r = await api("GET", `${A}/approvals`);
  view("Approvals", `<h1>Approvals (maker-checker)</h1><div id="flash"></div>
    <table><thead><tr><th>Action</th><th>Payload</th><th>Proposed by</th><th>When</th><th></th></tr></thead><tbody>
    ${(r.data.approvals || []).map((a) => `<tr><td>${esc(a.action)}</td><td><code>${esc(JSON.stringify(a.payload))}</code></td><td>${esc(a.proposed_by.name)} (${esc(a.proposed_by.role)})</td><td>${dt(a.created_at)}</td>
      <td>${a.can_approve ? `<button class="btn btn-primary" data-ap="${a.id}">Approve</button> <button class="btn btn-ghost" data-rj="${a.id}">Reject</button>` : `<span class="caption">Another role must approve</span>`}</td></tr>`).join("") || `<tr><td colspan="5">Nothing pending.</td></tr>`}</tbody></table>`);
  $$("[data-ap]").forEach((b) => (b.onclick = async () => { const res = await api("POST", `${A}/approvals/${b.dataset.ap}:approve`); flash(msg(res, "Approved and executed")); if (res.ok) setTimeout(scrApprovals, 900); }));
  $$("[data-rj]").forEach((b) => (b.onclick = async () => { const res = await api("POST", `${A}/approvals/${b.dataset.rj}:reject`); flash(msg(res, "Rejected")); if (res.ok) setTimeout(scrApprovals, 900); }));
}

async function scrSupport() {
  const r = await api("GET", `${A}/support-cases`);
  view("Q07", `<h1>Q07 private-contact requests</h1><p class="caption">Only the request is stored — never the reason (Article 16 Option A). Call the person, offer direct contact with the venue, and record only the outcome.</p><div id="flash"></div>
    <table><thead><tr><th>Created</th><th>Name</th><th>Lang</th><th>Status</th><th></th></tr></thead><tbody>
    ${(r.data.cases || []).map((c) => `<tr><td>${dt(c.created_at)}</td><td>${esc(c.display_name || "—")}</td><td>${esc(c.locale)}</td><td>${esc(c.status)}</td>
      <td><select class="input inline" data-sc="${c.id}"><option value="">set status…</option><option>in_progress</option><option>waiting_user</option><option>resolved</option><option>closed</option></select></td></tr>`).join("")}</tbody></table>`);
  $$("[data-sc]").forEach((s) => (s.onchange = async () => { if (!s.value) return; const res = await api("PATCH", `${A}/support-cases/${s.dataset.sc}`, { status: s.value }); flash(msg(res, "Updated")); }));
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
    <table><thead><tr><th>Code</th><th>Discount</th><th>Expires</th><th>Uses</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((c) => `<tr><td><code>${esc(c.code)}</code></td><td>${c.percent_off}%</td><td>${dt(c.expires_at)}</td>
      <td>${c.uses}${c.max_uses !== null ? ` / ${c.max_uses}` : ""}</td><td>${state(c)}</td>
      <td>${c.is_active ? `<button class="btn btn-ghost" data-off="${esc(c.id)}">Deactivate</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="caption">No codes yet.</td></tr>`}</tbody></table>`);
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    const exp = $("#exp").value;
    const body = { code: $("#code").value.trim(), percent_off: Number($("#pct").value),
      expires_at: exp ? new Date(exp + ":00+03:00").toISOString() : null, max_uses: $("#max").value ? Number($("#max").value) : null };
    const res = await api("POST", `${A}/promo-codes`, body);
    if (res.ok) scrPromoCodes(); else flash(msg(res));
  };
  $$("[data-off]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Deactivate this code? Members will no longer be able to use it.")) return;
    const res = await api("POST", `${A}/promo-codes/${b.dataset.off}:deactivate`, {});
    if (res.ok) scrPromoCodes(); else flash(msg(res));
  }));
}

// ------------------------------------------------------------------ router
const ROUTES = [
  [/^#\/login$/, scrLogin, false], [/^#\/enroll$/, scrEnroll, false], [/^#\/sessions$/, scrSessions, true], [/^#\/sessions\/([\w-]+)$/, scrSession, true],
  [/^#\/live$/, scrLive, true], [/^#\/venues$/, scrVenues, true], [/^#\/refunds$/, scrRefunds, true], [/^#\/cases$/, scrCases, true],
  [/^#\/cases\/([\w-]+)(?:\?(.*))?$/, scrCase, true], [/^#\/approvals$/, scrApprovals, true], [/^#\/support$/, scrSupport, true], [/^#\/audit$/, scrAudit, true],
  [/^#\/promo-codes$/, scrPromoCodes, true], [/^#\/identity$/, scrIdentity, true],
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
