# Real-font layout check kept (item 47)

**Date:** 10 Nov 2026. **Status:** provisional.

**Context.** The browser tests block Google Fonts, so they lay pages out with fallback fonts. The project rule
(`CLAUDE.md`) adds a check with the real fonts after every UI change: 360, 390, 402 and 430 px wide, Arabic and English,
light and dark. The question was whether to keep it, with automatic screenshots only as an aid, or to replace it with a
permanent test.

**Decision.** Keep the rule as it is. Temporary browser scripts go in `qatar/api/test/` and are deleted afterwards;
automatic screenshots help but do not replace a look at the result.

**Why.** Arabic line breaks and overflow depend on the real fonts, and a permanent screenshot comparison would fail on
every small font or browser update, with false alarms that teach people to ignore it.

**Revisit** if layout bugs with real fonts reach staging despite the rule. The site's fonts are self-hosted
(`qatar/web/fonts/`), so a permanent real-font test could load them without the network; the cost is the false alarms
above.
