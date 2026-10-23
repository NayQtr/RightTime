# Track 2 — UX research and design system

## 2.1 Design tokens (Figma-ready)

The source of truth is `qatar/design/tokens.json`, written in the W3C Design Tokens format. Import it with Tokens Studio, or map it to Figma Variables collections `color/light`, `color/dark`, `type/ar`, `type/en`, `space`, `radius`, `elevation` and `motion`. The full file is in Appendix A.4. `qatar/design/contrast_check.py` recomputes every contrast ratio below from the file.

### 2.1.1 Colour (light / dark) with measured contrast

| Token | Light | Dark | Use | Contrast (light / dark) |
|---|---|---|---|---|
| `bg` | `#FBF8F4` | `#141210` | App background | — |
| `surface` | `#FFFFFF` | `#1E1B18` | Cards, inputs, sheets | — |
| `text` | `#1C1A17` | `#F3EEE7` | Body and headings | 17.36 / 14.85 on surface |
| `textMuted` | `#5C554C` | `#B9B0A4` | Helper text, purposes | 7.35 / 8.01 on surface |
| `textDisabled` | `#8F877C` | `#7D756B` | Disabled labels | 3.54 / 3.78 (disabled is exempt; kept ≥ 3:1) |
| `primary` | `#7A1F3D` | `#E7A3B8` | Primary action, selection | 10.04 / 8.43 on surface |
| `onPrimary` | `#FFFFFF` | `#3A0A1A` | Label on primary | 10.04 / 8.34 |
| `primarySubtle` | `#F6E7EC` | `#3A1A25` | Selected option-card fill | (paired with `text`) |
| `borderStrong` | `#8C8478` | `#8A8176` | Input and option-card boundary | 3.69 / 4.47 (UI ≥ 3:1) |
| `border` | `#D9D2C7` | `#423C35` | Decorative divider only | 1.50 / 1.57 (not a UI boundary) |
| `focus` | `#1F4FA8` | `#8DB4FF` | 2 px focus ring + 2 px offset | 7.66 / 8.25 |
| `success` / `warning` / `danger` / `info` | `#1F6B45` / `#8A5A00` / `#B3261E` / `#1F4FA8` | `#7FD3A7` / `#F2C46D` / `#FF9A8F` / `#8DB4FF` | Status text and icons | all ≥ 5.9 / ≥ 8.2 |

Status is never shown by colour alone: every badge carries a word and an icon.

### 2.1.2 Type scale — RTL (Arabic) and LTR (English)

| Role | Arabic (IBM Plex Sans Arabic) size / line-height / weight | English (IBM Plex Sans) size / line-height / weight | Notes |
|---|---|---|---|
| display | 32 / 1.40 / 700 | 30 / 1.20 / 700 | Onboarding hero only |
| h1 | 26 / 1.45 / 700 | 24 / 1.25 / 700 | One per screen |
| h2 | 21 / 1.50 / 600 | 20 / 1.30 / 600 | Card titles, section heads |
| body | 17 / 1.70 / 400 | 16 / 1.50 / 400 | Arabic needs taller line-height for diacritics and descenders |
| label | 16 / 1.50 / 500 | 15 / 1.40 / 500 | Buttons, inputs, options |
| caption | 14 / 1.60 / 400 | 13 / 1.45 / 400 | Purpose lines, timestamps |

RTL rules:

- Use logical properties everywhere (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`), so one stylesheet mirrors itself.
- Mirror direction icons: back, forward and chevrons. Do **not** mirror clocks, media controls, checkmarks or brand marks.
- Never letter-space Arabic.
- Prices, times, booking refs (`RT-7KQ4M2`) and OTP digits use the numeric family with tabular figures and Western digits (v0.3 `DIGIT_STYLE`). Wrap them in `<bdi>` (or `unicode-bidi: isolate`) so `59 ر.ق` and `RT-…` don't reorder.
- In AR mode, an English token inside an Arabic sentence (for example a district name typed by ops) is isolated the same way.

### 2.1.3 Spacing, radius, elevation, motion

| Group | Tokens |
|---|---|
| Space (4 px base) | 0, 4, 8, 12, 16, 20, 24, 32, 40, 48 · `gutter` 16 · `touchTarget` 48 |
| Radius | `sm` 6 (badges) · `md` 10 (inputs, buttons) · `lg` 16 (cards, option cards) · `xl` 24 (sheet top corners) · `pill` |
| Elevation | 0 flat (cards use a border) · 1 raised card / sticky price strip · 2 menus, toasts · 3 sheets, dialogs + 40 % scrim. Dark theme: lighten the surface one step instead of using shadows. |
| Motion | fast 120 ms · base 200 ms · slow 320 ms · easing `cubic-bezier(0.2, 0, 0, 1)`. Reduced motion: transitions 0 ms, except opacity fades ≤ 120 ms; the success check is static. |

### 2.1.4 Component state matrix (SCR-01 … SCR-10)

States: **D** default · **H/P** hover / pressed · **F** focus-visible · **X** disabled · **L** loading · **E** error · **Ø** empty · **S** success. ✓ = must be designed and built; — = not applicable.

| Screen | Component | D | H/P | F | X | L | E | Ø | S | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| SCR-01 Onboarding | Card carousel + dots | ✓ | ✓ | ✓ | — | — | — | — | — | Dots are buttons with `aria-label "3 / 1"`; swipe mirrors in RTL |
| | Language toggle ع / EN | ✓ | ✓ | ✓ | — | — | — | — | — | Switches `dir` and `lang` on `<html>` |
| | Primary CTA | ✓ | ✓ | ✓ | — | — | — | — | — | |
| SCR-02a Phone | Phone input (+974 fixed) | ✓ | — | ✓ | ✓ | — | ✓ | — | — | E: `UNSUPPORTED_COUNTRY`, invalid length |
| | Send-code button | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | X until valid; L while requesting; E rate-limited with countdown |
| SCR-02b OTP | 6-cell OTP | ✓ | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | `autocomplete="one-time-code"`; E wrong code (attempts left), expired (E-OTP-1..3) |
| | Resend link | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | X with visible timer |
| SCR-02c Consents | Eligibility checkbox (18+) | ✓ | ✓ | ✓ | — | — | ✓ | — | — | No DOB field anywhere |
| | Consent rows (terms, conduct, privacy; marketing optional) | ✓ | ✓ | ✓ | — | — | ✓ | — | — | Each links the document version |
| | Continue | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | E: `CONSENT_REQUIRED`, `DOCUMENT_VERSION_OUTDATED` |
| SCR-03 Questionnaire | Progress (`n / 6`) | ✓ | — | — | — | — | — | — | — | `role="progressbar"` with values |
| | Option card (radio / checkbox) | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | Selected = `primarySubtle` fill + `primary` border + check icon; X when max 3 is reached (Q05) |
| | Exclusive "لا تفضيل" | ✓ | ✓ | ✓ | — | — | — | — | — | Clears the others; announced via live region |
| | Purpose line | ✓ | — | — | — | — | — | — | — | `textMuted` caption under each question |
| | Summary + edit links | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | E: `VALIDATION_FAILED` highlights the cards |
| SCR-04 Session pick | Experience toggle (coffee / dinner) | ✓ | ✓ | ✓ | ✓ | — | — | — | — | |
| | Session card | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | Ø: E-LANG-1 (no session in your language); "Full" badge (E-FULL-1) |
| | Alternates checklist (Q02) | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | |
| | Sticky price strip | ✓ | — | — | — | — | — | — | — | `رسم التنظيم 59 ر.ق · الطعام يُدفع للمكان` |
| | Continue to payment | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | E: 409 `SESSION_FULL`, 422 `LANGUAGE_CONFLICT` / `BUDGET_CONFLICT` |
| SCR-05 Summary & checkout | Price breakdown | ✓ | — | — | — | — | — | — | — | Fee now · food at venue · expected total range |
| | Policy box (absolute deadline) | ✓ | — | ✓ | — | — | — | — | — | Expandable; shows version `cxl-qa-1` |
| | Hold timer | ✓ | — | — | — | — | ✓ | — | — | `aria-live="polite"` at 2 min and 30 s only; E = E-PAY-4 |
| | Pay button | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | Idempotent; L after tap ("don't close"); E-PAY-1..3 |
| SCR-05P Processing | Status panel | — | — | — | — | ✓ | ✓ | — | ✓ | S: static check if reduced motion |
| SCR-06 Dashboard | Next-event hero card | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | One card per booking status (v0.3 status table); Ø: "Book your first table" |
| | Countdown | ✓ | — | — | — | — | — | — | — | `aria-live="off"` |
| | Action banners (0–2) | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ | Rebook offer, refund tracker, feedback request |
| SCR-07 Event details | Status badge + timeline stepper | ✓ | — | — | — | ✓ | — | — | — | Lock and reveal times are exact |
| | Venue block | ✓ | ✓ | ✓ | — | — | — | ✓ | — | Ø before reveal: district + price band + accessibility only |
| | Check-in "أنا هنا" | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | X before `check_in_opens_at` |
| | Support / private report links | ✓ | ✓ | ✓ | — | — | — | — | — | Report is always reachable, never hidden behind ratings |
| SCR-08a/b Cancel | Outcome panel | ✓ | — | — | — | ✓ | — | — | — | Computed by server from policy + time |
| | Choice cards (rebook / refund) | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | Ø: no eligible session → refund only |
| | Destructive confirm | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | Red outline, not filled |
| | Refund tracker | ✓ | — | — | — | ✓ | ✓ | — | ✓ | requested → processing → refunded / failed |
| SCR-09 Feedback | Star rows (overall, comfort, venue) | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ | Radio group semantics, not icons only |
| | Contact picker per tablemate (Q08) | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | Ø if Q08 = no sharing; "no" is never shown to others |
| SCR-10 Private report | Category radios | ✓ | ✓ | ✓ | — | — | ✓ | — | — | |
| | Immediate-danger toggle → 999 screen | ✓ | ✓ | ✓ | — | — | — | — | — | Full-screen, call button first, then "continue report" |
| | Submit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | S: `REPORT_RECEIVED` with the case ref |
