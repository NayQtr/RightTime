# «سُفرة» Visual Redesign Implementation Plan

> **For executors:** Use a task-by-task execution approach (subagent-driven or inline batch execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the look of the Rightime user web app to the approved «سُفرة» system without changing content, routes or the API.

**Architecture:**
- Token values change in `qatar/design/tokens.json`, and `tokens.css` is regenerated from it.
- Fonts and icons become local assets: `web/fonts/` and a generated `web/icons.js`.
- The table motif is a pure module (`web/motif.js`), unit-tested in Node.
- `styles.css` is rewritten on the same class names, so the 35 tests keep their selectors.
- `app.js` changes only in markup: icons instead of emoji, and the new welcome, home, details and interstitial layouts.

**Tech Stack:** Vanilla ES modules, CSS custom properties, Node test runner, Playwright (installed), Python 3 for the token and font build scripts.

**Spec:** `docs/specs/2026-10-29-sufra-visual-redesign.md`. Mockups: `docs/specs/2026-10-29-design-directions.html`, direction A.

## Global Constraints
- **Colours:** only from tokens (spec §2.1). No gradients, no blue outlines, no hex literals in `styles.css` except `transparent` and `currentColor`.
- **Fonts:** Alexandria 700/800 (display) and IBM Plex Sans Arabic 400/500/600 (body), self-hosted woff2 in Arabic and Latin subsets. No `fonts.googleapis.com` anywhere in `qatar/web`.
- **Icons:** Lucide 0.460.0, stroke 2, inline SVG with `aria-hidden="true"`. No emoji characters in any UI string built by `app.js`.
- **Text:** headings are never italic and are start-aligned in the quiz and interstitials. Numbers use `tabular-nums`.
- **Motif:** the table seats show only real numbers. Filled = `table.confirmed_count`, capacity = `table.capacity`; anything else uses dashed seats.
- **Touch and contrast:** targets of 44px or more; `contrast_check.py` passes in both themes; no horizontal scroll at 360px.
- **Tests:** existing test selectors are kept, including `.hero-welcome h1`, `#start`, `#resume-card`, `#resume`, `#over`, `.device-note`, `[data-inter]`, `#nx`, `#yes`, `label.option`, `.chip`, `.chips`, `.scale`, `.scale label`, `.why`, `#fname`, `#phone`, `#send`, `#code`, `#ver`, `#age`, `#go`, `#plan[data-kind]`, `#wyg-go`, `.event-card`, `#tabbar a[aria-current]`, `#call-coord`, `#wa-coord`, `input[name=s]`, `#pay`, `#late`, `#ack`, `.hero`, `.hero a.btn-primary`, `.avatar`, `#privacy-upd`, `#pv-ok`, `.legal-text` and `#complete-card`.

---

### Task 1: Tokens and contrast

**Files:**
- Modify: `qatar/design/tokens.json`, `qatar/design/build_tokens_css.py`, `qatar/design/contrast_check.py` (pairs live in tokens.json)
- Generated: `qatar/web/tokens.css`

- [ ] **Step 1:** Replace every colour `$value` in `tokens.json` (light and dark) with the hex values from spec §2.1. Add `seat` and `seatInk` to both themes, and set `focus` equal to `text`.
- [ ] **Step 2:** Add these pairs to `$contrastPairs`:
  - `["seatInk","seat",4.5]`
  - `["primary","surfaceSunken",4.5]`
  - `["primary","primarySubtle",4.5]`
  - `["text","primarySubtle",4.5]`
  - `["borderStrong","bg",3.0]`
- [ ] **Step 3:** Change the font families:
  - `ar` = `["IBM Plex Sans Arabic", "Noto Sans Arabic", "system-ui", "sans-serif"]`;
  - `en` = `["IBM Plex Sans Arabic", "system-ui", "sans-serif"]`;
  - `numeric` = `en`;
  - `displayAr` = `displayEn` = `["Alexandria", "IBM Plex Sans Arabic", "sans-serif"]`.
- [ ] **Step 4:** Change radii to `sm 10px`, `md 16px`, `lg 16px`, `xl 24px` and `pill 999px`. Set the type scale from spec §2.2.
- [ ] **Step 5:** Run `python3 qatar/design/contrast_check.py qatar/design/tokens.json`. Expected: every line PASS, exit 0.
- [ ] **Step 6:** Run `python3 qatar/design/build_tokens_css.py`; `web/tokens.css` is regenerated.

### Task 2: Self-hosted fonts

**Files:**
- Create: `qatar/design/build_fonts.py`, `qatar/web/fonts/*.woff2`, `qatar/web/fonts/fonts.css`, `qatar/web/fonts/OFL-*.txt`
- Modify: `qatar/web/index.html`, `qatar/web/admin/index.html`, `qatar/web/checkout-mock.html`

- [ ] **Step 1:** `build_fonts.py <fontsource_dir>` copies Alexandria 700/800 and IBM Plex Sans Arabic 400/500/600, Arabic and Latin subsets (`*-arabic-W-normal.woff2`, `*-latin-W-normal.woff2`), into `web/fonts/`.
- [ ] **Step 2:** It writes `fonts.css` with one `@font-face` per file, using the `unicode-range` copied from the matching fontsource `arabic-W.css` / `latin-W.css`, and `font-display: swap`.
- [ ] **Step 3:** It copies each package's `LICENSE` to `OFL-<family>.txt`.
- [ ] **Step 4:** Replace the Google Fonts `<link>`s in the three HTML files with `<link rel="stylesheet" href="/fonts/fonts.css">`. Preload two files: `alexandria-arabic-800-normal.woff2` and `ibm-plex-sans-arabic-arabic-400-normal.woff2`.
- [ ] **Step 5:** Run `grep -rn "fonts.googleapis" qatar/web`. Expected: no output.

### Task 3: Icons module and emoji guard

**Files:**
- Create: `qatar/design/build_icons.mjs`, `qatar/web/icons.js`
- Test: `qatar/api/test/design.test.mjs`

**Interfaces:**
- Produces `icon(name: string, cls = "i"): string`, which returns `<svg class="i" aria-hidden="true" ...>`. It throws for unknown names.
- Names: `arrow-right`, `arrow-left`, `chevron-left`, `chevron-right`, `calendar-days`, `clock`, `map-pin`, `users`, `utensils`, `coffee`, `languages`, `wallet`, `phone`, `message-circle`, `house`, `bell`, `circle-user-round`, `check`, `info`, `triangle-alert`, `shield-check`, `lock`, `hand-heart`, `book-open`, `hourglass`, `x`, `ticket`, `sparkle`.

- [ ] **Step 1:** Write the failing test, `design.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { icon, ICON_NAMES } from "../../web/icons.js";
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23F0}-\u{23FF}]/u;
test("icons: every name renders an aria-hidden svg; unknown names throw", () => {
  for (const n of ICON_NAMES) assert.match(icon(n), /^<svg class="i" aria-hidden="true"[^>]*viewBox="0 0 24 24"/);
  assert.throws(() => icon("nope"));
});
test("no emoji in the user app's markup or strings", () => {
  for (const f of ["../../web/app.js", "../../web/strings.js"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    const hit = src.split("\n").findIndex((l) => EMOJI.test(l));
    assert.equal(hit, -1, `${f}:${hit + 1} contains an emoji`);
  }
});
```

- [ ] **Step 2:** Run `node --test test/design.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3:** `build_icons.mjs <lucide-static/icons dir>` reads each SVG and strips the comment and the width/height attributes. It writes `web/icons.js` with:
  - a header naming `lucide-static 0.460.0` and the ISC licence;
  - `const ICONS = {name: "<inner svg>"}`;
  - `export const ICON_NAMES = Object.keys(ICONS)`;
  - `export function icon(name, cls = "i")`, which returns `<svg class="${cls}" aria-hidden="true" xmlns=... viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>` and throws on an unknown name.
- [ ] **Step 4:** The icon test passes. The emoji test still fails until Task 6.

### Task 4: Table motif module

**Files:**
- Create: `qatar/web/motif.js`
- Test: `qatar/api/test/design.test.mjs`

**Interfaces:**
- Produces `tableSvg({ seats = 6, filled = 0, dashed = true, label = "" }): string`. It returns an SVG with viewBox `0 0 100 100`, a table circle of r=27 and `seats` seat circles at radius 41, starting at the top and going clockwise. The first `filled` seats are drawn solid (class `seat on`), the rest dashed (`seat off`) or plain. With a label it carries `role="img"` and `aria-label`; without one, `aria-hidden="true"`.
- Produces `brandMark(): string`, the 24px mark: a ring plus 6 dots.
- Produces `vibeTable(vibe): string`, which returns a different filled pattern per vibe: playful 6/6, calm 2/6, warm 4/6 adjacent, curious 3/6 alternating.

- [ ] **Step 1:** Add this test:

```js
import { brandMark, tableSvg, vibeTable } from "../../web/motif.js";
test("motif: seats drawn from real numbers only", () => {
  const s = tableSvg({ seats: 6, filled: 4, label: "4 من 6" });
  assert.equal((s.match(/class="seat on"/g) || []).length, 4);
  assert.equal((s.match(/class="seat off"/g) || []).length, 2);
  assert.match(s, /role="img" aria-label="4 من 6"/);
  assert.match(tableSvg({}), /aria-hidden="true"/);
  assert.equal((tableSvg({ seats: 4, filled: 9 }).match(/seat on/g) || []).length, 4, "filled is capped at seats");
  assert.match(brandMark(), /<svg/);
  assert.notEqual(vibeTable("calm"), vibeTable("playful"));
});
```

- [ ] **Step 2:** Implement `motif.js`. Seat colour comes from CSS: `.seat.on { fill: var(--c-seat) }` and `.seat.off { fill: none; stroke: var(--c-borderStrong); stroke-dasharray: 3 2.4 }`.
- [ ] **Step 3:** The test passes.

### Task 5: styles.css on the new system

**Files:**
- Modify: `qatar/web/styles.css` (rewritten; same class names)

- [ ] **Step 1: Base**
  - `body` on `--c-bg`, font `--font-body`; headings use `--font-display`, weight 800 (h1) / 700 (h2), start-aligned.
  - `.num` uses tabular-nums.
  - Focus ring: 2px `--c-focus`, offset 2px.
- [ ] **Step 2: Buttons** — 52px high, radius `--r-md`.
  - `.btn-primary`: `--c-primary` fill, `--c-onPrimary` text, hover `--c-primaryHover`, no gradient. Remove the RTL gradient rule.
  - `.btn-secondary`: transparent fill with an inset 1.5px `--c-border` ring.
  - `.btn-ghost`: text only.
  - Disabled: `--c-surfaceSunken` fill, `--c-textDisabled` text.
- [ ] **Step 3: Surfaces**
  - `.card` is a `--c-surfaceSunken` fill, radius 16, no border.
  - `.card.hero` adds a `--c-primarySubtle` fill and a 1.5px inset ring of `--c-primary`.
  - `.banner` is a sunken fill with an icon coloured by variant; no border.
  - `.badge` is a tinted pill with a leading 6px dot in `currentColor`.
- [ ] **Step 4: Quiz**
  - `.quiz-q h1`: 30px, start-aligned. `.why` is start-aligned.
  - `.option`: 64px high, sunken fill, radius 16, no shadow. Checked: `--c-primarySubtle` fill plus a 2px `--c-primary` inset ring.
  - `.chip`: a sunken pill. `.scale label`: a sunken square.
  - `.progress`: segmented bar, 4px.
  - `.inter`: start-aligned; `.inter .art` is a 56px `--c-primarySubtle` square with a 28px icon in `--c-primary`.
- [ ] **Step 5: Layout and overlap fix**

```css
main { padding-bottom: calc(var(--s-6) + env(safe-area-inset-bottom)); }
body:has(.tabbar:not([hidden])) main { padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
body:has(.quiz-foot) main, body:has(.sticky-bar) main { padding-bottom: calc(120px + env(safe-area-inset-bottom)); }
.quiz-foot, .sticky-bar { background: var(--c-bg); border-block-start: 1px solid var(--c-border); }
```

- [ ] **Step 6: Home and details**
  - `.week` ribbon (7 day cells, `.has` dot, `.on` ink fill).
  - `.event-card` ticket: a 64px date block, a hairline, then the details.
  - `.track` four-step bars.
  - `.facts-list` rows with icon, value and muted label, separated by hairlines.
  - `.note` (sunken or subtle) with an icon.
  - `.tabbar` uses `--c-surface` with a hairline; active tab in `--c-primary`.
  - `.avatar` is `--c-primarySubtle` with `--c-primary` text.
- [ ] **Step 7: Welcome**
  - `.hero-welcome` is content-height, start-aligned, on `--c-bg` (no gradient, no hex). Title 40px Alexandria 800, with the `em` in `--c-primary` and `font-style: normal`.
  - `.welcome-table` is 220px.
  - `.resume-card` is a sunken card.
- [ ] **Step 8:** Run `grep -nE "#[0-9A-Fa-f]{3,8}\b|gradient|rgba" qatar/web/styles.css`. Expected: no output.

### Task 6: app.js markup

**Files:**
- Modify: `qatar/web/app.js`, `qatar/web/strings.js` (welcome title and the new labels: weekday short names come from Intl, so no new strings for them)

- [ ] **Step 1:** Import `{ icon }` from `./icons.js` and `{ brandMark, tableSvg, vibeTable }` from `./motif.js`.
- [ ] **Step 2: Top bar.** The brand uses `brandMark()`; the language button stays.
- [ ] **Step 3: Welcome.**
  - Title: `T("welcomeHero")` with the `welcomeHeroEm` word wrapped in `<em>`.
  - `ar`: welcomeHero «عشاء مع {em}، قد يصبحون أصدقاء.», welcomeHeroEm «غرباء».
  - `en`: «Dinner with {em} who might become friends.», em «strangers».
  - `tableSvg({ seats: 6, filled: 4 })` inside `.welcome-table`; buttons and the resume card stay.
- [ ] **Step 4: Quiz and interstitials.**
  - Options and chips no longer render `o.emoji`.
  - Interstitial art uses `icon()`: doha `map-pin`, community `users`, science `book-open`, safety `shield-check`; the safety list uses `icon("check")`.
  - Vibe uses `vibeTable(vibe)`.
  - Curating uses `tableSvg` seats filling with `pct`: filled = `Math.round(pct / 100 * 6)`.
- [ ] **Step 5: Banners.** `errorBanner` and the late warning use `icon("triangle-alert")`; info banners use `icon("info")`.
- [ ] **Step 6: Home.**
  - Title «الدوحة» without the 📍; the inbox button uses `icon("bell")`.
  - A `.week` ribbon of 7 days starting today: weekday from Intl `weekday: "short"` in `intlLocale()`, the day number, `.has` when any session falls on that day. Tapping a cell scrolls to the first card of that day; cards carry `data-day="YYYY-MM-DD"` in Asia/Qatar.
  - `sessionCard`: a date block (day number, short weekday) plus details (experience · language, `map-pin` district, `clock` time, `users` seats-left text). It keeps `class="event-card"` and the same href.
- [ ] **Step 7: What you get.** Benefits use the icons `users`, `map-pin`, `message-circle`, `shield-check`, `hand-heart`.
- [ ] **Step 8: Details.**
  - Status badge plus a title of experience and weekday, then the date and time in `.num`.
  - The ref line shows the ref only, and adds « · countdown» only when the countdown is non-empty.
  - `.track` of 4 steps from `e.reveal.phase`.
  - A `.facts-list` with icons.
  - When `e.table` exists: `tableSvg({ seats: e.table.capacity, filled: e.table.confirmed_count, label: T("confirmedCount", ...) })`.
  - The venue note uses `icon("lock")`.
  - Contact buttons use `icon("phone")` and `icon("message-circle")`.
- [ ] **Step 9: Tab bar.** `TABS` icons become `house`, `calendar-days`, `bell`, `circle-user-round` via `icon()`.
- [ ] **Step 10: Remaining emoji.** Paid and feedback-done screens use `icon("check")` in `.success-check`; slow-confirm uses `icon("hourglass")`; the emergency call link uses `icon("phone")`.
- [ ] **Step 11:** Run `node --test test/design.test.mjs`. Expected: all pass, including no emoji.

### Task 7: Overlap regression test

**Files:**
- Test: `qatar/api/test/ui.test.mjs` (in the existing journey, right after `05-what-you-get` is captured)

- [ ] **Step 1:** Add this check:

```js
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
const [lastBottom, footTop] = await page.evaluate(() => {
  const items = [...document.querySelectorAll("main > *:not(.quiz-foot)")];
  return [Math.max(...items.map((e) => e.getBoundingClientRect().bottom)), document.querySelector(".quiz-foot").getBoundingClientRect().top];
});
assert.ok(lastBottom <= footTop + 1, `content (${lastBottom}) hidden under the bottom button (${footTop})`);
```

- [ ] **Step 2:** It must FAIL on the old CSS (verify by stashing styles.css) and PASS after Task 5.

### Task 8: Verify, document, deploy
- [ ] **Step 1:** `cd qatar/api && npm test`. Expected: 38 tests, 0 failures (35 existing plus 2 design plus the overlap check inside the journey).
- [ ] **Step 2:** `NO_FONTS=` the capture script to `after/`, then contact sheets light and dark. Review every screen against the spec §1 audit list.
- [ ] **Step 3:** Run `UI_SHOTS=docs npm test` to refresh `docs/qatar-phase4/screens`. In the README: fonts, icons, motif, and the design-system section.
- [ ] **Step 4:** Commit and push, promote the Vercel preview to production, run `live_quiz.mjs` and capture live screenshots on a phone viewport.
