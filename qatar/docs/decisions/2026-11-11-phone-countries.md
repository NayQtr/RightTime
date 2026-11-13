# Phone numbers: every country except Israel, with a country picker (item 38)

**Date:** 11 Nov 2026. **Status:** the owner's own decision; built. Replaces
[2026-11-10-phone-countries.md](2026-11-10-phone-countries.md).

**Context.** Sign-in accepted Qatar numbers only, with `PHONE_ALLOWED_COUNTRY_CODES` to widen it. The owner decided
that numbers are open to every country in the world except Israel (+972), and that nothing anywhere may say "Qatar
only" any more.

**Decision.**

* The server accepts a number from any country. `PHONE_ALLOWED_COUNTRY_CODES` is now `*` (every calling code in
  `api/src/lib/countries.js`); a comma-separated list still narrows it deliberately. `PHONE_BLOCKED_COUNTRY_CODES`
  can block further codes. **+972 is refused whatever any setting says** — it is in the code, not in a setting, so a
  wrong value can never open it. A blocked or unknown calling code answers 422 `UNSUPPORTED_COUNTRY`.
* Qatar keeps its strict pattern (`+974` then 8 digits starting 3–7). Any other country takes any valid E.164 number
  and the server has the last word. The hourly cap per country (`OTP_COUNTRY_HOURLY_CAP`, default 20, Qatar exempt)
  still buckets by calling code, now read from the built-in table, longest code first.
* The website and the app show the calling code as its own control: it starts on **+974**, opens a list of every
  country, and she can type a name (Arabic or English) or a code to find hers. The number goes in the box beside it.
  Israel is not in the list at all.
* The wording "Qatar numbers only" is gone: `qatarOnly` deleted from `web/strings.js` and both `.arb` files and from
  the two welcome screens, `phoneHelp` now reads only «نرسل لكِ رمزًا من 6 أرقام.» / "We'll send you a 6-digit code.",
  and the server's `UNSUPPORTED_COUNTRY` message says the country is not accepted instead of naming Qatar. No sentence
  of similar meaning was put anywhere else.

**One source for the lists.** `api/src/lib/countries.js` holds every country (ISO code, calling code, Arabic and
English name). `node qatar/ops/build-countries.mjs` writes `web/countries.js` and `app/lib/data/countries.dart` from
it, and `api/test/countries.test.mjs` fails if the two are not what the source produces, so they cannot drift apart.
Country names are factual data (ISO 3166 short names), not copy.

**Migration.** `024_phone_countries.sql` sets the `app_config` row to `*` and adds the (empty)
`PHONE_BLOCKED_COUNTRY_CODES` row. It has to be run in both Supabase projects.

**Revisit** if paid SMS abroad turns out to cost more than expected: the hourly cap per country is the lever, or the
owner can narrow `PHONE_ALLOWED_COUNTRY_CODES` to a list without a release.

## 13 Nov 2026: one box with flags (owner)

The owner sent a reference image and approved a mockup («نعم، كما في الصورة»): the number field is now one box —
the country's flag, a down arrow and the calling code, a thin divider, then the number (left to right in both languages).
The code opens a list under the box with every country's flag, its name and code, the chosen one marked ✓. Alphabetical
only (owner's choice; no Gulf group on top), Qatar chosen to begin with, still no search box. On the website the list is
an ARIA listbox (arrows, Home/End, Enter or Space, Escape; typing letters or digits jumps to a name or code); flags show only
where the device draws flag emoji (Windows draws two letters, so there the flag is left out). Same design in the app.
