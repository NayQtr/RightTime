// Mock hosted checkout (test_psp, staging only). Kept out of the HTML so the CSP can forbid inline scripts (audit F9).
const CFG = Object.assign({ apiBase: "" }, window.QATAR_CONFIG || {});
const apiUrl = (path) => CFG.apiBase + path + (CFG.apiRegion ? `${path.includes("?") ? "&" : "?"}forceFunctionRegion=${CFG.apiRegion}` : "");
const pi = new URLSearchParams(location.search).get("pi");
const box = document.getElementById("box");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function load() {
  const r = await fetch(apiUrl(`/api/mock-psp/checkout/${encodeURIComponent(pi)}`));
  const d = await r.json();
  if (!r.ok) { box.innerHTML = `<h1>Error</h1><p>${esc(d.message)}</p>`; return; }
  box.removeAttribute("aria-busy");
  box.innerHTML = `
    <h1>${esc(d.merchant)}</h1>
    <div class="kv"><span>المبلغ · Amount</span><strong class="num">${esc(d.amount.display)}</strong></div>
    <div class="kv"><span>الحجز · Booking</span><span class="num">${esc(d.booking_ref)}</span></div>
    <div class="kv"><span>البطاقة · Card</span><span class="num">4242 4242 4242 4242 · 3-D Secure</span></div>
    <div class="field"><label class="label" for="card-name">الاسم على البطاقة · Name on card</label>
      <input class="input" id="card-name" maxlength="100" autocomplete="cc-name" dir="ltr" placeholder="NOUR A ALI"></div>
    <div class="stack">
      <button class="btn btn-primary btn-block" data-o="success">ادفع (نجاح) · Pay (success)</button>
      <button class="btn btn-secondary btn-block" data-o="declined">رفض البطاقة · Card declined</button>
      <button class="btn btn-secondary btn-block" data-o="3ds_failed">فشل 3-D Secure · 3-D Secure failed</button>
      <button class="btn btn-ghost btn-block" data-o="cancel">إلغاء والعودة · Cancel and return</button>
    </div>`;
  box.querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => pay(b.dataset.o, d.return_url)));
}
async function pay(outcome, fallback) {
  box.setAttribute("aria-busy", "true");
  box.querySelectorAll("button").forEach((b) => (b.disabled = true));
  const r = await fetch(apiUrl(`/api/mock-psp/checkout/${encodeURIComponent(pi)}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome, cardholder_name: (document.getElementById("card-name") || {}).value || undefined }) });
  const d = await r.json().catch(() => ({}));
  location.assign(d.return_url || fallback);
}
load();
