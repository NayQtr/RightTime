// Escaping text for HTML. One copy, because five identical ones and a sixth that behaved differently is how the
// website, the admin console, the partner portal, the shared dialogs, the brand mark and the public-page builder
// drifted apart: ops/build-about-page.mjs left the apostrophe alone, which is safe only while every attribute is
// written with double quotes.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
