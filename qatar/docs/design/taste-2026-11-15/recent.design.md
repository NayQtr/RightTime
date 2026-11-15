# Design Map

Source: https://recent.design/ (single page, 1440x900, captured 15 Nov 2026; page height 2173px)

## Spacing Scale
- Base unit: 4px
- Values by frequency: 12px (41), 4px (29), 2px (19), 6px (15), 16px (8), 8px (8), 32px (3), 10px (2), 20px, 24px
- Negative 1-2px margins (26) for avatar overlap
- Method: flex `gap` (section 4px, article 10px, nav 4px, footer 12px); masonry gutter 12px

## Font Hierarchy
| Role | Size / line-height | Weight |
|---|---|---|
| Page title "Design" | 16px / 22.4px | 500 |
| Everything else (nav, pills, jobs, body, captions) | 13px / 18.2px | 400 |
| Job title, active nav | 13px | 500 |
| Micro label | 12px | 400 |

One family: Inter. 57 of 60 sampled text nodes are 13px. Button letter-spacing -0.041px.

## Color Palette
- `#FFFFFF` page background, 58.3%
- `#F5F5F5` (oklch 0.97 0 0) panels, inactive pills, card wells, 37.6%
- `#0B0B0B` (oklch 0.15 0 0) text primary and active pill fill
- `#838383` text secondary (black at 48.6% alpha), `#BBBBBB` tertiary (26.7% alpha)
- `rgba(0,0,0,0.447)` round overlay buttons on images
- `#F900A3` (oklch 0.64 0.28 350) the single accent: the word "new" in the nav, once
- Neutrals: pure gray, zero chroma throughout

## Image Ratios
- Masonry thumbnails at 276px wide, native ratios kept: 0.56:1, 0.67:1, 0.80:1, 0.88:1, 0.91:1, 1.33:1, 1.55:1, 1.79:1

## Component Tokens
- Radius: 8px (94, cards and panels), 9999px (84, pills and buttons), 50% (5, avatars), 2px (3)
- Shadow, overlay button: `inset 0 0 0 1px rgba(255,255,255,0.16)`
- Shadow, card/pill ring: `0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.05)` (2 layers)
- Shadow, raised control: 3 layers, 0.5px ring + 1px contact + 2px blur
- Grid: left sidebar about 236px; 4 masonry columns of 276px, 12px gap; the 4th column opens with a jobs panel
- Filter pill: 13px, height about 28px, padding 0 12px, radius 9999px; active `#0B0B0B` fill with white text
- Card: radius 8px, 28px round arrow button at bottom-end, 24px count badge at top-end for multi-image posts
- Motion: 120ms `cubic-bezier(0.2, 0, 0, 1)` on background, border, shadow, colour; opacity 180ms
- `:focus-visible` present; `prefers-reduced-motion` handled

---

# Taste DNA

### One size, three inks
- **Trigger**: When ranking nav, filters, job listings and captions on a page whose images are loud
- **Decision**: A single 13px Inter size for 57 of 60 text nodes, ranked by black opacity (`#0B0B0B` / 48.6% / 26.7%), over a multi-step type scale
- **Reason**: Every size step is a new thing for the eye to land on; holding size constant keeps the interface a single quiet label layer under the work
- **Evidence**: sizes 13px x57, 12px x2, 16px x1; weights 400 x49, 500 x11; secondary ink used 31 times

### Colour is spent once
- **Trigger**: When the chrome needs a highlight for a new section
- **Decision**: One hot pink (`#F900A3`) on the single word "new" over a brand accent on buttons, pills and links
- **Reason**: A colour that appears only once is read as news; spread across controls it becomes decoration and loses that meaning
- **Evidence**: pink text count 1; active pill is `#0B0B0B`, inactive `#F5F5F5`; surfaces are `#FFFFFF` 58.3% + `#F5F5F5` 37.6%

### Feedback in 120 ms, always the same curve
- **Trigger**: When pills, rows and image buttons change on hover and focus
- **Decision**: One 120ms `cubic-bezier(0.2,0,0,1)` for colour, border and shadow, 180ms for opacity, with `:focus-visible` and reduced motion handled, over per-component timing or no transitions
- **Reason**: A response that lands within the moment of the pointer arriving reads as the control reacting, not as an animation playing
- **Evidence**: six transition declarations all on the same curve; focusVisible true; reducedMotion true

### Community proof as a dated count
- **Trigger**: When asking a visitor to sign up from the sidebar
- **Decision**: An exact, time-stamped number with real avatars ("Join 31,832 members, including 270 who signed up yesterday") over a rounded claim or a logo strip
- **Reason**: A figure tied to yesterday proves the place is alive now; a round claim could have been written years ago
- **Evidence**: 13px `#838383` line under a `#0B0B0B` pill button; five overlapping 20px avatars; 24px count badges (3, 4) on multi-image cards
