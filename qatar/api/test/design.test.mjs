// «سُفرة» design system guards (spec 2026-10-29): icon module, table motif, no emoji in the user app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { icon, ICON_NAMES } from "../../web/icons.js";
import { brandMark, tableSvg, vibeTable } from "../../web/motif.js";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23F0}-\u{23FF}]/u;

test("icons: every name renders an aria-hidden 24px svg; unknown names throw", () => {
  assert.ok(ICON_NAMES.length >= 25);
  for (const n of ICON_NAMES) assert.match(icon(n), /^<svg class="i" aria-hidden="true"[^>]*viewBox="0 0 24 24"/, n);
  assert.match(icon("house", "ti"), /^<svg class="ti"/);
  assert.throws(() => icon("nope"), /unknown icon/);
});

test("motif: seats are drawn from real numbers only", () => {
  const s = tableSvg({ seats: 6, filled: 4, label: "4 من 6" });
  assert.equal((s.match(/class="seat on"/g) || []).length, 4);
  assert.equal((s.match(/class="seat off"/g) || []).length, 2);
  assert.match(s, /role="img" aria-label="4 من 6"/);
  assert.match(tableSvg({}), /aria-hidden="true"/);
  assert.equal((tableSvg({ seats: 4, filled: 9 }).match(/seat on/g) || []).length, 4, "filled is capped at seats");
  assert.equal((tableSvg({ seats: 5, filled: -2 }).match(/seat on/g) || []).length, 0);
  assert.match(brandMark(), /^<svg class="mark"/);
  assert.notEqual(vibeTable("calm"), vibeTable("playful"));
  assert.equal(vibeTable("unknown"), vibeTable("curious"));
});

test("no emoji in the user app's markup or strings", () => {
  for (const f of ["../../web/app.js", "../../web/strings.js", "../../web/dialogs.js"]) {
    const lines = readFileSync(new URL(f, import.meta.url), "utf8").split("\n");
    const hit = lines.findIndex((l) => EMOJI.test(l));
    assert.equal(hit, -1, `${f}:${hit + 1} contains an emoji: ${lines[hit]?.trim().slice(0, 80)}`);
  }
});
