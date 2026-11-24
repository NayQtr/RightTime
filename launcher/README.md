# RightTime launcher — WORK IN PROGRESS

**This does not build yet.** See `../HANDOFF.md` section 5 for exactly what is
missing (HomeActivity, SettingsActivity, theme, icon/banner resources).

An Android TV launcher for the TCL described in `../cleantcl/docs/TCL-NOTES.md`.

Two design commitments worth keeping:

- **No Gradle dependencies.** `dependencies { }` is empty on purpose, so every
  line that runs on the TV is in this repo.
- **No `android.permission.INTERNET`.** The launcher cannot phone home, fetch
  an ad, or report what you watch, because the OS will not let it open a
  socket. Adding that permission would defeat the point of the project.

Build target notes: the TV is `armv7l`, so `armeabi-v7a` must stay in
`abiFilters`. minSdk 21 means no `String.join`, `List.of`, or `java.time`.
