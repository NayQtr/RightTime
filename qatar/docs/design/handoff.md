# HerZone: design handoff (web and Flutter app)

For the developers. Written 5 Nov 2026 from the code as it stands (`web/tokens.css`, `web/styles.css`,
`app/lib/design/herzone_tokens.dart`, `app/lib/ui`), not from a mock-up. Tokens are generated from
`design/tokens.json` (`build_tokens_css.py`, `build_tokens_dart.py`); change the JSON, never the generated files.
Why-decisions are in `herzone.app.md` (design map and taste principles).

## 1. Principles that decide edge cases

1. **Arabic first, right to left.** Every layout is built with logical properties (`inline-start`, `inset-inline`);
   English is the same layout mirrored, not a second design.
2. **One column, one accent.** A 560 px column on every screen size; wine `--c-primary` is the only accent and marks
   the next action. Exception: the welcome screen is two columns from 1024 px.
3. **The table drawing replaces photos.** Members are never pictured (web welcome and interstitials, app `TableArt`).
4. **Facts as rows.** Dates, places and refund rules are label/value rows, never prose.
5. **Honest numbers.** No invented counts or ratings; figures come from the API.

## 2. Tokens

### Colour (light / dark)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--c-bg` | `#FAF4EC` | `#140C0B` | page |
| `--c-surface` | `#FFFCF9` | `#3A2E2C` | inputs, tab bar |
| `--c-surfaceSunken` | `#F3EAE1` | `#2D2221` | cards, notices |
| `--c-text` / `--c-textMuted` | `#251615` / `#60514F` | `#F0EAE3` / `#B5ACA5` | text |
| `--c-textDisabled` | `#8F837F` | `#8E837E` | disabled controls only |
| `--c-primary` (= `--c-cta`) | `#7E1E35` | `#E88794` | buttons, selection, one headline word |
| `--c-primarySubtle` | `#FBE0E2` | `#3E1E22` | selected row, hold pill |
| `--c-onPrimary` | `#FDF9F4` | `#150D0C` | text on primary |
| `--c-border` / `--c-borderStrong` | `#D6CCC4` / `#857772` | `#73625F` / `#95867F` | dividers / field outlines |
| `--c-success` `--c-warning` `--c-danger` `--c-info` | `#196632` `#8A5600` `#AF2B25` `#345A73` | `#76C788` `#EBB25F` `#F47C6E` `#88B8DA` | status |
| `--c-seat` | `#DA915F` | `#EBA66D` | the table drawing only |

Contrast (measured): muted text 6.9:1 on the page and 6.3:1 on cards; text on primary 9.4:1. Disabled text is exempt.
Never use a colour as the only signal (a done step has a tick, an unread item a "new" tag).

### Type
Fonts: Alexandria (display: headings, buttons), IBM Plex Sans Arabic (text). Unit `--u`: `1rem`; on iOS the root follows
Dynamic Type (`font: -apple-system-body`, `--u` = 16/17 rem). Spacing in `rem`/tokens, never fixed px, so large text scales.

| Role | Size (×`--u`) | Line height | Weight | Notes |
|---|---|---|---|---|
| Display | 2 (max 14vw) | 1.3 (en 1.15) | 600 | welcome title; en tracking -0.02em |
| H1 | 1.625 (en 1.5) | 1.35 (en 1.2) | 600 | one per screen, `text-wrap: balance` |
| H2 | 1.25 (en 1.1875) | 1.4 | 600 | |
| Body | 1 | 1.65 (en 1.5) | 400 | |
| Label | 0.9375 | 1.5 | 500 | |
| Caption | 0.8125 | 1.55 | 400 | |
| Tab bar, week ribbon, badge | 0.75 (12 px) | | 500 / 700 | **minimum text size: 12 px** |

Numbers use Western digits everywhere (web `fmtDate`, app `latinDigits`); prices, dates and counts use
`font-variant-numeric: tabular-nums`. A time keeps its period on the same line (no-break space between "7:30" and "م").

### Spacing, radius, motion
Spacing `--s-1..12` = 4, 8, 12, 16, 20, 24, 32, 40, 48 px (Flutter `HzSpace.s1..s12`). Gutter 16–20 px.
Radius: 10 (fields), 16 (cards, buttons), 24, pill. Elevation is flat: cards have no border and no shadow; only the top
and tab bars have a soft scroll-edge shadow. Motion: 120 ms (press), 200 ms, 320 ms (page entrance), ease `cubic-bezier(0.2, 0, 0, 1)`. Headings stay light and modest (Alexandria 600; display 32 px, h1 26 px): the owner asked on 30 Oct for less weight and size, so
visual emphasis comes from colour blocks and motion, not from larger headings.

## 3. Layout and breakpoints

| Width | Behaviour |
|---|---|
| < 640 px (phone) | one column `--col` 560 px with 20 px padding; tab bar full width |
| ≥ 640 px | tab bar and top bar align to the column (`--col`) |
| ≥ 1024 px | **welcome only**: `--col` 1040 px, two columns (words and buttons | table drawing), vertically centred |

Bottom space: `96px + safe-area` above the tab bar, `128px + safe-area` above a fixed action bar (`.quiz-foot`,
`.sticky-bar`). Test widths: 360 and 390 px phones, 1440 px desktop. No horizontal scroll at 360 px (tested).

## 4. Components

| Component | Spec (web class / app widget) | States |
|---|---|---|
| Button | `.btn` min-height 52, radius 16, Alexandria 700; `FilledButton` min 52 | primary (wine), secondary (outline 1.5 px), danger (outline), ghost (text; 44 px wide in the top bar); pressed scale 0.98 at 0 ms; disabled = sunken fill + disabled text |
| Field | `.input` min-height 52, 1.5 px inset outline; focus = 2 px inset text-colour ring | numeric fields `inputmode`, `autocomplete` set (`tel-national`, `one-time-code`, `given-name`) |
| Option row | `.option` min-height 64, tick right (radio round, checkbox 7 px radius) | hover, checked (subtle fill + 2 px primary ring), disabled |
| Chip | `.chip` min-height 46, pill | unchecked sunken, checked wine; at the pick limit the rest are disabled (hint line above says "up to N") |
| Card | `.card` sunken fill, radius 16, padding 16×20; app `CardThemeData` same | `.card-link` adds pressed state |
| Banner / note | `.banner` icon + text, sunken; info, warning, success, danger | `role="alert"` only for errors |
| Segmented toggle | `.segmented button` min 44 × 96 | pressed = text-colour fill |
| Week ribbon | `.week`: 7 columns, gap 2 px, each ≥ 44 px wide, 64 px tall | pressed day filled; day with a session has a dot |
| Progress (4 steps) | `.track` / app `_Tracker`: bar + label; done = ✓ (web glyph, app check icon), current bold wine | bars level when a label wraps |
| Tab bar | 4 items, 56 px tall, icon 24 + 12 px label, badge 12 px | selected = wine; the inbox badge shows the unread count (hidden at 0) |
| Accordion | `.faq details` summary 52 px; consent-update accordions 44 px | open = "+" rotates 45° |
| Hold pill | `#hold` pill above the pay button, MM:SS | expired = row replaced by "choose again" |
| Next-meetup card | web `.next-card` (home) and `.card.hero` (My events); app `_NextMeetupCard` (My events). Fill `--c-primary`, text `--c-onPrimary` (88% for secondary lines, 80% for stepper labels), radius 24, the button is inverted (on-colour fill, brand text) | the only filled card on its screen; contrast 6.5-9.4:1 light, 5.5-7.6:1 dark (a web test checks every text on it) |
| Date leaf | web `.event-card .d`; app session card (`fmtDay`, `fmtWeekday`) | 60 px square, `--c-primarySubtle` fill, day in `--c-primary` 800; decoration only (the date line beside it is read out) |
| Loading skeleton | web `.skel`; app `SkeletonList` | a title bar and three cards in the page's rhythm, slow 1.4 s fade (opacity 1 to 0.5); still under reduced motion; a "loading" label for screen readers |
| List entrance | web `main .list > li`; app `RiseIn(index)` | each item 50 ms (web) / 8% of 600 ms (app) after the one before, fade + 10 px lift, 360 ms, ease-out; none under reduced motion |
| Contact sheet | web `#contact-open` + `dialog.contact-sheet` (native modal dialog); app `_CoordinatorButtons` + `showContactSheet` | one button «طلب تواصل» / "Request contact"; pressing it blurs the screen (14 px). Level 1: «اتصال هاتفي» / "Phone call" and «محادثة واتساب» / "WhatsApp chat" one above the other. «اتصال هاتفي» replaces them with level 2: «طلب تواصل» (hint «شرح بسيط للمشكلة/الطلب قبل التواصل») and «اتصل بنا الان» (hint «سوف تتصل بنا هاتفيا فوراً»; dials the coordinator at once). «طلب تواصل» opens the form: note (max 500), «تأكيد هاتف التواصل» (prefilled with her number; sent only if changed), «الوقت المناسب للاتصال» chips «الان / بعد 10 دقايق / بعد ساعة / غدا», send; then «وصلنا طلبك. سيتم الاتصال بكِ من قبلنا.» (one open request per member: sending again updates it). WhatsApp opens the coordinator's chat with «مرحباً ، انا {first name} #RT-XXXXXX ، لدي مشكلة/طلب» (booking number of the meetup on screen, else her soonest active one; no membership number exists). Closes with the button, Escape / Back, or a tap outside; focus returns to the button. Reduced transparency or high contrast: near-solid backdrop, no blur. Reduced motion: no scale/fade |
| Table drawing | web `tableSvg`, app `TableArt(seats, filled, size)` | filled seat solid `--c-seat`, open seat dashed |

### Edge cases
- **Long text:** headings wrap (`text-wrap: balance`); label/value rows stack under 400 px; the Arabic welcome phrase
  «تعرّفي على ناس..» never splits.
- **Empty states** state what is missing and what to do (no sessions in her language; no notifications).
- **Errors** appear next to the control (`aria-describedby`), the first invalid field is focused; global errors use a banner.
- **Offline:** booking details keep the last copy; a banner says so.
- **Large text:** the app welcome scrolls; the web column grows with `rem`.

## 5. Right to left
- Logical CSS only; the page-slide direction follows `--dir` (forward slides toward the end side in both languages).
- Phone numbers, codes, promo codes, emails and booking refs are `dir="ltr"` inside RTL text and use bidi isolation.
- Language switch changes `lang` and `dir` on `<html>` and redraws; the choice is remembered on the device.
- Icons that imply direction (back arrow, chevron) mirror; others (phone, calendar, flag) do not.

## 6. Accessibility (all tested or measured)
- Targets ≥ 44 px (the week ribbon, toggles, accordions, buttons); inline links in a sentence are exempt (≥ 24 px).
- Visible focus on every control (`:focus-visible`); the heading takes focus after each screen change.
- Content has bottom padding above the tab bar and action bars (section 3), so a focused control is not hidden behind them.
- `prefers-reduced-motion` replaces slides with a short fade; `prefers-reduced-transparency` makes the top and tab bars
  solid; `prefers-contrast: more` gives the top and tab bars a strong border; dark mode is a second token set, not an inversion.
- Venue page: the page is not a live region; after a tap the focus moves to the redrawn card; the 60 s refresh redraws
  only when the list changed.

## 7. Copy rules (Arabic first; English mirrors)
- Arabic is addressed to a woman (feminine forms); the venue page addresses the restaurant.
- Buttons name the action; errors say what happened and what to do next.
- One term per thing: **طاولة** (table), **مقعد** (seat), **لقاء** (the meetup she attends), **موعد** (date and time),
  **حجز** (booking), **رسم التنظيم** (the fee), **المنسق** (the coordinator; one spelling, see open items).
- Owner-approved wording (venue request message, refund and cancellation rules) is changed only on his instruction.

## 8. Open items (need the owner)
- Spelling of the coordinator: «المنسق» (5 uses) or «منسّق» (3 uses): one form everywhere.
- Next-step lines for: payment failed, generic error, refund failed.
- Venue decline uses the browser's own OK/Cancel dialog (cannot be labelled in Arabic): replace with an in-page confirmation.
- Unread inbox items are marked by the "new" tag only (the side stripe was removed).
