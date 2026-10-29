# Rightime user app: «سُفرة» visual redesign

- **Date:** 2026-10-29
- **Status:** direction A «سُفرة» chosen by the owner from three mockups (`docs/specs/2026-10-29-design-directions.html`)
- **Scope:** the look of the user web app (`qatar/web`). Content, routes, the API and the flow stay the same. The admin panel and the mock checkout share `tokens.css` and `styles.css`, so they pick up the new colours and fonts but are not redesigned.

## 1. Why: audit of the current design

Taken from screenshots of every screen in light and dark (`capture.mjs`) and from the owner's two phone screenshots (event details and "What you get", dark mode).

| Severity | Finding | Where |
|---|---|---|
| Critical | **Overlap.** The fixed bottom button covers the last content (the refund note on "What you get" is cut off under «متابعة»). | `.quiz-foot`, `.sticky-bar` |
| Critical | **Emoji used as icons** everywhere: tab bar, welcome art 🍽️☕✨, interstitials 🏙️🤝📖🛡️, benefits 👥📍❓🛡️🤝, banners ⚠️ℹ️, the event-card tiles, the "vibe" card 🎉🌙💗🌀, and question options. | app.js, `question_options.emoji` |
| Critical | **Template hero:** full-height, centred, with a purple-orange gradient blob behind it. | `.hero-welcome` |
| Critical | **Display font clash:** Amiri (naskh calligraphy) next to DM Serif Display for "Rightime" at 40–44px; the title wraps badly. | `.display-title` |
| Major | **Blue outlines** (info badge, info banners, focus) clash with the warm palette, and there are too many outlined boxes, nested one inside another. | `.badge-info`, `.banner-info`, card-in-card on details |
| Major | **Rainbow loader** (six unrelated colours) and a pink-yellow avatar gradient that belong to no system. | `.dots-loader`, `.avatar` |
| Major | **Everything centred:** question titles, interstitials, welcome. | quiz, inter |
| Minor | Stray separator «· RT-…» when the countdown is empty, and inconsistent radii (6/10/16/24). | details |

## 2. Direction «سُفرة»

Calm and premium, like a good restaurant menu. A warm paper background, Qatar maroon as the one accent, and a second warm "seat" tone used only in the brand motif.

**Signature: the table.** A circle with six seats around it, drawn in SVG. It appears in:
- the brand mark;
- the welcome screen;
- the "preparing" loader, where the seats fill in;
- the "your card" screen;
- event details, where the filled seats are the **real** `table.confirmed_count` out of `table.capacity`.

While the table is still forming, the seats are dashed. The motif never shows a number the API did not return.

### 2.1 Colour tokens (OKLCH source, hex in `tokens.json`)

| Token | Light | Dark |
|---|---|---|
| `bg` | oklch(97% 0.012 75) `#FAF4EC` | oklch(16.5% 0.014 25) `#140C0B` |
| `surface` | oklch(99.3% 0.005 75) `#FFFCF9` | oklch(24% 0.016 25) `#261C1B` |
| `surfaceSunken` | oklch(94.2% 0.016 70) `#F3EAE1` | oklch(21% 0.016 25) `#1F1615` |
| `text` | oklch(22% 0.025 25) `#251615` | oklch(94% 0.012 75) `#F0EAE3` |
| `textMuted` | oklch(45% 0.02 30) `#60514F` | oklch(75% 0.015 60) `#B5ACA5` |
| `textDisabled` | oklch(62% 0.015 40) `#8F837F` | oklch(54% 0.012 40) `#756C69` |
| `primary` | oklch(40% 0.13 12) `#7E1E35` | oklch(73% 0.12 12) `#E88794` |
| `primaryHover` | oklch(34% 0.12 12) `#671027` | oklch(79% 0.11 12) `#F89DA8` |
| `primarySubtle` | oklch(93% 0.03 12) `#FBE0E2` | oklch(28% 0.05 12) `#3E1E22` |
| `onPrimary` | oklch(98.5% 0.008 75) `#FDF9F4` | oklch(17% 0.014 25) `#150D0C` |
| `border` | oklch(85% 0.016 60) `#D6CCC4` | oklch(36.5% 0.016 25) `#473B3A` |
| `borderStrong` | oklch(58% 0.02 40) `#857772` | oklch(56% 0.02 40) `#7F716C` |
| `focus` | = `text` (ring 2px, offset 2px) | = `text` |
| `success` | oklch(45% 0.11 150) `#196632` | oklch(76% 0.12 150) `#76C788` |
| `warning` | oklch(50% 0.11 70) `#8A5600` | oklch(80% 0.12 75) `#EBB25F` |
| `danger` | oklch(50% 0.17 28) `#AF2B25` | oklch(72% 0.15 28) `#F47C6E` |
| `info` | oklch(45% 0.06 240) `#345A73` | oklch(76% 0.07 240) `#88B8DA` |
| `cta` = `ctaEnd` = `primary`, `onCta` = `onPrimary` | | |
| `seat` (motif only) | oklch(72% 0.11 55) `#DA915F` | oklch(78% 0.11 60) `#EBA66D` |
| `seatInk` | oklch(30% 0.06 50) `#45240F` | oklch(20% 0.03 50) `#211209` |

**Rules:**
- Elevation is lightness, not shadow: cards sit on `surfaceSunken` fills, and sheets and inputs on `surface`.
- No gradients, and no blue outlines.
- Status is shown by a dot plus a word, never by colour alone.
- All 54 contrast pairs pass, including `seatInk` on `seat`, `primary` on `surfaceSunken` and `primarySubtle`, and `borderStrong` on `bg` (3:1). `contrast_check.py` gains these pairs.

### 2.2 Type
- **Display:** Alexandria, weights 700 and 800, for titles and large numerals (dates, prices, times).
- **Body:** IBM Plex Sans Arabic, weights 400, 500 and 600.
- **Both locales:** both families include Latin, so English uses the same two. Amiri, DM Serif Display and IBM Plex Sans are removed.
- **Self-hosted:** the fonts are served as `woff2` from `qatar/web/fonts/` (Arabic and Latin subsets, with `unicode-range`), with no Google Fonts request. This is faster, and no third party sees the visitor's IP, which matches the privacy notice. Licence: SIL OFL 1.1, and the licence files ship next to the fonts.
- **Scale (Arabic):**
  - display: 40 / 1.2 / 800;
  - h1: 30 / 1.25 / 800;
  - h2: 20 / 1.4 / 700;
  - body: 16 / 1.65 / 400;
  - label: 15 / 1.5 / 500;
  - caption: 13 / 1.55 / 400.
  - English uses the same steps, with line-height reduced by about 0.1.
- **Text rules:** headings are never italic and are right-aligned in Arabic (start-aligned), not centred. Numbers use `tabular-nums`.

### 2.3 Icons
- **Library:** Lucide (ISC licence), 24px grid, stroke 2, inlined as SVG from `qatar/web/icons.js`. That file is generated from `lucide-static@0.460.0` by `qatar/design/build_icons.mjs` and carries the licence header.
- **One family only.** No emoji anywhere in the UI.
- **Question options:** the `emoji` column in `question_options` stays in the database but is no longer rendered. Options carry their meaning in words.

### 2.4 Shape, space, motion
- **Radii:** 10 (inputs, small), 16 (buttons, options, cards), 24 (sheets). The pill shape is kept only for chips and badges.
- **Spacing:** the existing 4px scale.
- **Motion:** 120 / 200 / 320 ms with `cubic-bezier(0.2, 0, 0, 1)`, on transform and opacity only. Nothing bounces. A single entrance per screen: the title fades and rises 8px. All motion is off under `prefers-reduced-motion`.

## 3. Screens

| Screen | Change |
|---|---|
| Top bar | Brand mark (table motif) and «Rightime» in Alexandria; staging pill in a neutral fill; language as a text button. No bottom border; a hairline appears only after scroll. |
| Welcome | Content-height layout, not full-viewport. Start-aligned title «عشاء مع غرباء، قد يصبحون أصدقاء.» with «غرباء» in maroon, lede, the table drawing, then «ابدأ» (primary) and «لديّ حساب» (outline). The device-save note stays. The resume card becomes a sunken card above the buttons. |
| Quiz question | Back button, section name and a segmented progress bar (one segment per section). «السؤال 2 من 22» in maroon, then a 30px start-aligned title and a muted purpose line. Options are 64px sunken rows; selected rows get a maroon ring, a subtle fill and a filled radio or check. Chips are sunken pills without emoji. The scale becomes 5 squares with the end labels underneath. |
| Interstitials | Start-aligned. A Lucide icon in a 56px maroon-subtle square replaces the emoji (doha: `map-pin`, community: `users`, science: `book-open`, safety: `shield-check`). «How it works» becomes a numbered list with hairlines. The research quote gets a maroon rule on the start side (a hairline, not a 4–6px stripe). |
| Your card (vibe) | A large table drawing whose seat colours and arrangement differ per vibe. The emoji go. |
| Preparing | The table motif with seats filling one by one, plus the percentage. |
| Name, phone, OTP, register | Start-aligned titles, 52px inputs with labels, the phone prefix as a sunken segment, consents as rows separated by hairlines. |
| What you get | Title in Alexandria (no Amiri). Benefits become a list with Lucide icons (`users`, `map-pin`, `message-circle`, `shield-check`, `hand-heart`). Refund note as a sunken note with an `info` icon. FAQ as hairline accordions. **The bottom button reserves its own space** (fixes the overlap). |
| Home | «الدوحة» with a week ribbon: seven day cells, a dot under days that have sessions, the selected day in an ink fill. Tapping a day scrolls to that day's group. Sessions are «ticket» cards: a date block (big day number and weekday) separated by a hairline from the details (type and language, district, time, seats-left text). The next-booking card is a maroon-subtle card with a status dot. The coordinator section is a plain block with two outline buttons. |
| Sessions, review | Same ticket vocabulary; selected session with a maroon ring. The price summary is a sunken card with hairline rows, and the late-cancel warning is a warning note with an icon. |
| Events, details | Status as a dot and word. Title «عشاء الخميس» with the date and time in Alexandria numerals. A four-step tracker (paid, forming, confirmed, venue revealed) as bars. Facts as a list with icons (`map-pin`, `languages`, `wallet`, `users`) separated by hairlines, with no card-in-card. The venue-reveal note as a maroon-subtle note with `lock`. The coordinator shows as two outline buttons. The stray «·» is removed when the countdown is empty. |
| Cancel, inbox, profile | Hairline lists. The avatar is the initial on `primarySubtle` with `primary` text (no gradient). Settings rows end in a chevron icon. |
| Tab bar | Lucide icons `house`, `calendar-days`, `bell`, `circle-user-round` with labels; active tab in maroon. Surface colour with a top hairline. |
| Banners and badges | Banners are sunken fills with an icon in the semantic colour, without coloured outlines. Badges are a dot and text on a tinted pill. |
| Toast | Ink pill above the tab bar or bottom button, never covering them. |

## 4. Layout rules that fix the overlap
- **Space for fixed bars:** when a fixed bottom bar (`.quiz-foot`, `.sticky-bar`) or the tab bar is present, `main` gets bottom padding equal to the bar's height plus the safe area. This uses `body:has(...)` selectors, with an 8px gap.
- **Solid bars:** bottom bars have a solid `bg` fill (no fade gradient that lets text show through) and a top hairline.
- **Line length:** text is capped at about 60 characters on large screens.

## 5. Out of scope
The admin panel and the mock checkout are not redesigned; they only inherit the tokens. Copy changes are limited to the welcome title shown in the mockup. No new features.

## 6. Done when
- The 35 existing tests pass, with the selectors they use kept.
- `contrast_check.py` passes both themes.
- No emoji remain in `app.js` output.
- No horizontal scroll at 360px.
- Before and after screenshots show every screen in light and dark.
- `docs/qatar-phase4/screens` is refreshed, and staging is redeployed and checked live.
