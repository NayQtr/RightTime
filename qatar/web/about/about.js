// W1 public page: the member app opens in the language of the page she came from (same device setting the app's own
// language switch writes, q_locale). Nothing else: the page works without this script.
document.querySelectorAll("a[data-locale]").forEach((a) => a.addEventListener("click", () => {
  try { localStorage.setItem("q_locale", JSON.stringify(a.dataset.locale)); } catch (e) { /* private mode: the app's default applies */ }
}));
