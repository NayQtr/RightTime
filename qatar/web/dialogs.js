// Shared by the venue page and the admin console (plan A2 / 13d-3, 13d-4, A1): an in-page confirmation instead of the
// browser's confirm() and prompt(), and a polite announcement for screen readers after an action.
// The confirmation is a real <dialog> opened with showModal(): the keyboard stays inside it, Escape cancels, and the
// focus goes back to the button that opened it. Its buttons are named for the action ("Decline" / "Keep the request"),
// and it is written in the page's own language, which the browser's dialogs cannot do.
import { esc } from "/esc.js";

// one polite live region per page, outside <main>, so redrawing the page never announces the whole of it again
const live = document.createElement("div");
live.id = "sr-announce";
live.className = "sr-only";
live.setAttribute("role", "status");
live.setAttribute("aria-live", "polite");
document.body.appendChild(live);
let liveTimer = null;

/** Says `text` to screen readers once (the same text twice in a row is said twice). Nothing is shown on screen. */
export function announce(text) {
  clearTimeout(liveTimer);
  live.textContent = "";
  liveTimer = setTimeout(() => { live.textContent = text; }, 60);
}

/**
 * Asks before an action. Resolves to null when she keeps things as they are (the cancel button, Escape), or to
 * { value } when she confirms; value is the optional text field's content ("" without a field).
 * question: the question as the page asked it before; confirm / cancel: button labels named for the action;
 * field: { label, maxlength } for an optional free-text answer (a reason); danger: the confirm button is red.
 */
export function askConfirm({ question, confirm, cancel, field = null, danger = true }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const d = document.createElement("dialog");
    d.className = "confirm-dialog";
    d.setAttribute("role", "alertdialog");
    d.setAttribute("aria-labelledby", "cd-q");
    d.innerHTML = `<form method="dialog" class="stack">
      <h2 id="cd-q">${esc(question)}</h2>
      ${field ? `<div class="field"><label class="label" for="cd-f">${esc(field.label)}</label>
        <textarea class="input" id="cd-f" rows="3"${field.maxlength ? ` maxlength="${Number(field.maxlength)}"` : ""}></textarea></div>` : ""}
      <div class="cd-actions"><button class="btn btn-secondary" value="cancel" id="cd-no">${esc(cancel)}</button>
        <button class="btn ${danger ? "btn-danger-solid" : "btn-primary"}" value="ok" id="cd-yes">${esc(confirm)}</button></div></form>`;
    document.body.appendChild(d);
    d.addEventListener("close", () => {
      const ok = d.returnValue === "ok";
      const value = field ? d.querySelector("#cd-f").value.trim() : "";
      d.remove();
      if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
      resolve(ok ? { value } : null);
    }, { once: true });
    d.showModal();
    // the safe choice has the focus first; with a reason field, the field does (typing is the next step)
    (field ? d.querySelector("#cd-f") : d.querySelector("#cd-no")).focus();
  });
}
