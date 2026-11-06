// Runs before the page paints: a theme the member chose (q_theme) is applied at once, so there is no flash of the other one.
(function () {
  try {
    var t = JSON.parse(localStorage.getItem("q_theme"));
    if (t !== "light" && t !== "dark") return;
    document.documentElement.setAttribute("data-theme", t);
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.removeAttribute("media"); m.setAttribute("content", t === "dark" ? "#3A2C39" : "#F2D9ED"); });
  } catch (e) { /* private mode: the device setting applies */ }
})();
