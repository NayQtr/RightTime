# Screenshots not blocked (item 10)

**Date:** 4 Nov 2026 (recommendation), kept on 10 Nov 2026. **Status:** recommended, not built.

**Context.** The app security review (`qatar/docs/security/2026-11-04-app-security-review.md`, finding 2, decision B)
asked whether the app should block screenshots and screen recording (`FLAG_SECURE` on Android).

**Decision.** Do not block them. What is in place: on Android 13 and later the recent-apps preview is blank
(`setRecentsScreenshotEnabled(false)` in `MainActivity.kt`), and the app draws a privacy cover when it goes to the
background.

**Why.** Blocking would stop members from saving their own booking (venue, time, table code), which they may need on
the day. A screenshot shows only what the member herself can already see; blocking does not stop a photo of the screen.

**Revisit when** a member reports her details shared without consent, or a store review or legal advice asks for it.
Then: `FLAG_SECURE` on the meetup details screen only (it also blanks the preview on older Android).
