// Venue portal (016): sign in with the registered email and a one-time code, then HerZone's hosting requests (accept or
// decline), the tables on the day, first names from 3 hours before, and arrivals. Arabic first, English on request.
// Kept out of the HTML so the CSP can forbid inline scripts. The sign-in lasts 12 hours, in this tab only.
import { announce, askConfirm } from "/dialogs.js";

const CFG = Object.assign({ apiBase: "" }, window.QATAR_CONFIG || {});
const api = (p) => CFG.apiBase + p + (CFG.apiRegion ? `${p.includes("?") ? "&" : "?"}forceFunctionRegion=${CFG.apiRegion}` : "");
const main = document.getElementById("main");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* private mode */ } } };

const TEXT = {
  ar: {
    signInTitle: "صفحة المطاعم الشريكة", signInIntro: "أدخل البريد الإلكتروني المسجّل لدى HerZone، وسنرسل لك رمز دخول.",
    email: "البريد الإلكتروني", next: "التالي", codeTitle: "أدخل الرمز", codeSent: "أرسلنا رمزًا من 6 أرقام إلى بريدك إن كان مسجّلًا لدينا.",
    code: "الرمز", enter: "دخول", devCode: "بيئة تجريبية: الرمز", back: "رجوع", signOut: "خروج",
    requests: "طلبات الاستضافة", none: "لا توجد طلبات حاليًا. سنرسل لك الطلب قبل الموعد بثلاثة أيام.",
    women: (n) => `${n} سيدات`, expected: (n) => `حجز لعدد ${n} أشخاص (سيدات)`,
    pending: "بانتظار ردّكم", confirmed: "مؤكد", declined: "معتذر", accept: "قبول الحجز", decline: "اعتذار",
    declineReason: "سبب الاعتذار (اختياري):", declineSure: "هل تريد الاعتذار عن هذا الحجز؟ سنبلغ منسق HerZone.",
    tables: "الطاولات", noTables: "تظهر الطاولات ورموزها بعد ترتيب المجموعات، قبل الموعد بيوم تقريبًا.",
    table: "طاولة", namesFrom: (t) => `تظهر الأسماء الأولى ابتداءً من ${t}.`, arrived: "وصلت", markArrived: "تأكيد الوصول",
    lang: "English", error: "تعذّر الاتصال. حاول مرة أخرى.", wrongCode: "الرمز غير صحيح أو انتهت صلاحيته.",
    tooMany: "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.", unavailable: "إرسال الرموز غير متاح الآن. تواصل مع منسق HerZone.",
    mentionCode: "يذكر الضيوف «HerZone» ورمز الطاولة عند الاستقبال.",
    // provisional (plan A2 / 13d-3, 13d-4, 10 Nov): the in-page confirmation's keep button and what a screen reader says
    keep: "إبقاء الطلب", saidAccepted: "تم قبول الحجز.", saidDeclined: "تم الاعتذار عن الحجز.",
    saidArrived: (n) => (n ? `تم تأكيد وصول ${n}.` : "تم تأكيد الوصول."),
  },
  en: {
    signInTitle: "Partner venues", signInIntro: "Enter the email address registered with HerZone and we will send you a sign-in code.",
    email: "Email", next: "Next", codeTitle: "Enter the code", codeSent: "We sent a 6-digit code to your email if it is registered with us.",
    code: "Code", enter: "Sign in", devCode: "Test environment: the code is", back: "Back", signOut: "Sign out",
    requests: "Hosting requests", none: "No requests at the moment. We send each request 3 days before the meetup.",
    women: (n) => `${n} women`, expected: (n) => `Booking for ${n} people (women)`,
    pending: "Waiting for your answer", confirmed: "Confirmed", declined: "Declined", accept: "Accept the booking", decline: "Decline",
    declineReason: "Reason for declining (optional):", declineSure: "Decline this booking? We will tell the HerZone coordinator.",
    tables: "Tables", noTables: "Tables and their codes appear once the groups are formed, about a day before.",
    table: "Table", namesFrom: (t) => `First names appear from ${t}.`, arrived: "Arrived", markArrived: "Mark arrived",
    lang: "العربية", error: "Could not connect. Please try again.", wrongCode: "The code is wrong or has expired.",
    tooMany: "Too many attempts. Please wait a little and try again.", unavailable: "Codes cannot be sent right now. Contact the HerZone coordinator.",
    mentionCode: "Guests say \"HerZone\" and their table code at the door.",
    keep: "Keep the request", saidAccepted: "Booking accepted.", saidDeclined: "Booking declined.",
    saidArrived: (n) => (n ? `${n} marked as arrived.` : "Arrival marked."),
  },
};
let lang = store.get("vp_lang") === "en" ? "en" : "ar";
const T = (k, ...a) => (typeof TEXT[lang][k] === "function" ? TEXT[lang][k](...a) : TEXT[lang][k]);
const locale = () => (lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB");
const when = (iso, opts) => new Intl.DateTimeFormat(locale(), { timeZone: "Asia/Qatar", ...opts }).format(new Date(iso))
  .replace(/(\d)[  ](م|ص|AM|PM)/g, "$1 $2");
const fullDate = (iso) => when(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

async function call(method, path, body) {
  const headers = { "Content-Type": "application/json", "Accept-Language": lang };
  const token = store.get("vp_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try { res = await fetch(api(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { return { ok: false, status: 0, data: {} }; }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401 && token) { store.set("vp_token", null); renderEmail(); }
  return { ok: res.ok, status: res.status, data };
}

function setLang(l) {
  lang = l;
  store.set("vp_lang", l);
  document.documentElement.lang = l;
  document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  document.getElementById("vp-lang").textContent = T("lang");
  document.getElementById("vp-out").textContent = T("signOut");
  route();
}

const errorText = (r) => (r.status === 429 ? T("tooMany") : r.status === 503 ? T("unavailable") : r.data && r.data.code === "OTP_INVALID" ? T("wrongCode") : T("error"));

function renderEmail(prefill = "") {
  document.getElementById("vp-out").hidden = true;
  document.getElementById("vp-venue").textContent = "";
  main.innerHTML = `<h1>${esc(T("signInTitle"))}</h1><p class="caption">${esc(T("signInIntro"))}</p>
    <form id="f" class="stack" novalidate>
      <div class="field"><label class="label" for="email">${esc(T("email"))}</label>
        <input class="input" id="email" type="email" autocomplete="email" inputmode="email" dir="ltr" required value="${esc(prefill)}"></div>
      <p id="err" class="vp-error" role="alert"></p>
      <button class="btn btn-primary btn-block" id="go">${esc(T("next"))}</button></form>`;
  document.getElementById("f").onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    if (!email) return;
    document.getElementById("go").disabled = true;
    const r = await call("POST", "/api/venue/v1/auth/code:request", { email });
    document.getElementById("go").disabled = false;
    if (!r.ok) { document.getElementById("err").textContent = errorText(r); return; }
    renderCode(email, r.data.dev_code);
  };
}

function renderCode(email, devCode) {
  main.innerHTML = `<h1>${esc(T("codeTitle"))}</h1><p class="caption">${esc(T("codeSent"))}</p>
    ${devCode ? `<div class="banner banner-warning" role="note"><div>${esc(T("devCode"))} <span class="vp-dev" id="dev">${esc(devCode)}</span></div></div>` : ""}
    <form id="f" class="stack" novalidate>
      <div class="field"><label class="label" for="code">${esc(T("code"))}</label>
        <input class="input" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr" required></div>
      <p id="err" class="vp-error" role="alert"></p>
      <button class="btn btn-primary btn-block" id="go">${esc(T("enter"))}</button>
      <button type="button" class="btn btn-ghost" id="back">${esc(T("back"))}</button></form>`;
  document.getElementById("back").onclick = () => renderEmail(email);
  document.getElementById("f").onsubmit = async (e) => {
    e.preventDefault();
    document.getElementById("go").disabled = true;
    const r = await call("POST", "/api/venue/v1/auth/code:verify", { email, code: document.getElementById("code").value.trim() });
    document.getElementById("go").disabled = false;
    if (!r.ok) { document.getElementById("err").textContent = errorText(r); return; }
    store.set("vp_token", r.data.access_token);
    renderRequests({ force: true });
  };
}

const STATUS_BADGE = { pending: "badge-warning", confirmed: "badge-success", declined: "badge-danger" };

function requestCard(q) {
  const tables = q.status !== "confirmed" ? "" : q.tables.length ? q.tables.map((t) => `
    <div class="vp-table stack">
      <div class="vp-row"><span>${esc(T("table"))}</span> <span class="vp-code">${esc(t.code)}</span> <span class="caption">${esc(T("women", t.women))}</span></div>
      ${t.guests ? `<ul class="vp-guests">${t.guests.map((g) => `<li><span>${esc(g.first_name || "—")}</span>
        ${g.arrived ? `<span class="vp-ok">✓ ${esc(T("arrived"))}</span>` : `<button class="btn btn-secondary" data-arrive="${esc(g.id)}">${esc(T("markArrived"))}</button>`}</li>`).join("")}</ul>`
        : `<p class="caption">${esc(T("namesFrom", when(q.names_from, { weekday: "long", hour: "numeric", minute: "2-digit" })))}</p>`}
    </div>`).join("") + `<p class="caption">${esc(T("mentionCode"))}</p>` : `<p class="caption">${esc(T("noTables"))}</p>`;
  return `<article class="vp-card stack" id="req-${esc(q.session_id)}" tabindex="-1">
    <div class="vp-row"><h2>${esc(fullDate(q.starts_at))}</h2><span class="badge ${STATUS_BADGE[q.status] || "badge-muted"}">${esc(T(q.status))}</span></div>
    <p>${esc(T("expected", q.women_expected))}</p>
    ${q.can_answer ? `<div class="vp-row"><button class="btn btn-primary" data-accept="${esc(q.session_id)}">${esc(T("accept"))}</button>
      <button class="btn btn-danger" data-decline="${esc(q.session_id)}">${esc(T("decline"))}</button></div>` : ""}
    ${q.status === "confirmed" ? `<h3>${esc(T("tables"))}</h3>${tables}` : ""}
  </article>`;
}

let timer = null;
let lastJson = "";
// force: draw even if nothing changed (after a tap, a language switch or sign-in); focus: id of the element to put the
// keyboard focus on afterwards. The timed refresh draws only when the list changed, so it never resets where the keyboard is.
async function renderRequests({ force = false, focus = null } = {}) {
  clearTimeout(timer);
  const r = await call("GET", "/api/venue/v1/requests");
  if (!r.ok) { if (r.status !== 401) main.innerHTML = `<p class="vp-error" role="alert">${esc(T("error"))}</p>`; return; }
  const json = JSON.stringify(r.data);
  if (!force && json === lastJson) { timer = setTimeout(renderRequests, 60000); return; }
  lastJson = json;
  document.getElementById("vp-venue").textContent = r.data.venue.name;
  document.getElementById("vp-out").hidden = false;
  main.innerHTML = `<h1>${esc(T("requests"))}</h1>
    ${r.data.requests.length ? r.data.requests.map(requestCard).join("") : `<p class="caption">${esc(T("none"))}</p>`}`;
  // after each answer the card is redrawn with the keyboard on it, and a screen reader hears the result (13d-4)
  const answered = (r, said) => announce(r.ok ? said : T("error"));
  main.querySelectorAll("[data-accept]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const r = await call("POST", `/api/venue/v1/requests/${b.dataset.accept}:accept`);
    await renderRequests({ force: true, focus: `req-${b.dataset.accept}` });
    answered(r, T("saidAccepted"));
  }));
  // declining asks first, in the page itself, with the optional reason in the same box (13d-3)
  main.querySelectorAll("[data-decline]").forEach((b) => (b.onclick = async () => {
    const yes = await askConfirm({ question: T("declineSure"), confirm: T("decline"), cancel: T("keep"),
      field: { label: T("declineReason"), maxlength: 300 } });
    if (!yes) return;
    b.disabled = true;
    const r = await call("POST", `/api/venue/v1/requests/${b.dataset.decline}:decline`, { reason: yes.value });
    await renderRequests({ force: true, focus: `req-${b.dataset.decline}` });
    answered(r, T("saidDeclined"));
  }));
  main.querySelectorAll("[data-arrive]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const card = b.closest("article") && b.closest("article").id;
    const name = (b.closest("li")?.querySelector("span")?.textContent || "").trim().replace(/^—$/, "");
    const r = await call("POST", `/api/venue/v1/guests/${encodeURIComponent(b.dataset.arrive)}:arrived`);
    await renderRequests({ force: true, focus: card });
    answered(r, T("saidArrived", name));
  }));
  if (focus) { const el = document.getElementById(focus) || main.querySelector("h1"); if (el) { if (!el.hasAttribute("tabindex")) el.tabIndex = -1; el.focus({ preventScroll: true }); } }
  timer = setTimeout(renderRequests, 60000); // new requests and arrivals without reloading
}

function route() { if (store.get("vp_token")) renderRequests({ force: true }); else renderEmail(); }

document.getElementById("vp-lang").onclick = () => setLang(lang === "ar" ? "en" : "ar");
document.getElementById("vp-out").onclick = async () => {
  await call("POST", "/api/venue/v1/auth/logout");
  store.set("vp_token", null);
  renderEmail();
};
setLang(lang);
