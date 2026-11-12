// The «سُفرة» table motif (spec 2026-10-29 §2): a round table with seats around it. Pure string builders, no DOM.
// Seats only ever show numbers the API returned (e.g. table.confirmed_count of table.capacity); everything else is dashed.

const R_SEAT = 41;
const pt = (k, n, r) => {
  const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
  return [(50 + r * Math.cos(a)).toFixed(1), (50 + r * Math.sin(a)).toFixed(1)];
};
import { esc as escAttr } from "./esc.js";

// pattern: optional array of booleans (one per seat) for decorative arrangements; otherwise the first `filled` seats are on.
export function tableSvg({ seats = 6, filled = 0, dashed = true, label = "", pattern = null, cls = "table" } = {}) {
  const n = Math.max(1, Math.min(12, Math.round(seats)));
  const on = Math.max(0, Math.min(n, Math.round(filled)));
  const a11y = label ? `role="img" aria-label="${escAttr(label)}"` : 'aria-hidden="true"';
  let out = `<svg class="${cls}" ${a11y} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle class="top" cx="50" cy="50" r="27"/>`;
  for (let k = 0; k < n; k += 1) {
    const [x, y] = pt(k, n, R_SEAT);
    const lit = pattern ? Boolean(pattern[k]) : k < on;
    out += `<circle class="seat ${lit ? "on" : dashed ? "off" : "empty"}" cx="${x}" cy="${y}" r="${lit ? 7.5 : 7}"/>`;
  }
  return out + "</svg>";
}

// 24px brand mark: a small table ring with six seats.
export function brandMark() {
  let dots = "";
  for (let k = 0; k < 6; k += 1) {
    const a = -Math.PI / 2 + (k * Math.PI) / 3;
    dots += `<circle cx="${(12 + 9 * Math.cos(a)).toFixed(1)}" cy="${(12 + 9 * Math.sin(a)).toFixed(1)}" r="2.2"/>`;
  }
  return `<svg class="mark" aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle class="ring" cx="12" cy="12" r="5"/>${dots}</svg>`;
}

// "Your card" art: the same table, a different seating per light summary (quiz-flow.js vibeOf). Decorative.
const VIBES = {
  playful: [1, 1, 1, 1, 1, 1],
  calm: [1, 0, 0, 1, 0, 0],
  warm: [1, 1, 1, 1, 0, 0],
  curious: [1, 0, 1, 0, 1, 0],
};
export function vibeTable(vibe) {
  return tableSvg({ seats: 6, pattern: VIBES[vibe] || VIBES.curious, cls: "table vibe-table" });
}
