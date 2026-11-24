# Handoff — TCL TV debloat + custom launcher

Pick this up in a **new session running with Remote Control attached to the
Mac that is on the same network as the TV**. That is the only thing the
previous session could not do: a cloud container cannot reach a TV behind
home NAT, so every ADB step below was written and tested but never run
against real hardware.

Branch: `claude/affectionate-planck-4coh1t`

---

## 1. The goal

Get the ads and bloat off a TCL Android TV and put the owner's own software
on it. Reference the owner gave: https://github.com/nthnclrk/CleanFrame

CleanFrame is a **Tizen** `.wgt` widget for Samsung The Frame. The target here
is **Android TV 9**. No code ports. The borrowed idea is the one in its README:
"your apps, a photograph and the time, with an interface made for the TV
remote."

## 2. The TV (read off its Product Information screen — verified, do not re-guess)

| Field | Value |
|---|---|
| TCL Serial Number | 2106ELK162902C00195 |
| Software Version | V8-R851T02-LF1V722.000038 |
| TV+ OS Version | V5.2.0 (V8-2210180-MF1V520) |
| User ID | 594689573 |
| Project ID | 428 |
| Client Type | TCL-ME-RT2851-S1 |
| Wireless MAC | 7c:27:bc:06:91:dc |
| Ethernet MAC | d8:14:df:8b:00:51 |
| Kernel | Linux 4.14.236+ #2 SMP PREEMPT Thu Oct 27 19:40:59 CST 2022 armv7l |

Consequences:
- **Realtek RT2851**, Android 9 "BeyondTV".
- **`armv7l` = 32-bit ARM.** An APK without an `armeabi-v7a` slice will not install.
- Netflix ESN `NFANDROID2-PRV-TCL2018UHDANDROIDTV` confirms **Android TV**, not
  Google TV. Stock launcher is therefore `com.google.android.tvlauncher`,
  **not** `com.google.android.apps.tv.launcherx`.

## 3. Decisions already made — do not relitigate without asking

**Firmware replacement was evaluated and rejected.** No confirmed bootloader
unlock or custom ROM exists for RT2851; TCL gates fastboot behind `authboot`
(server-side authorisation); unsigned firmware forfeits Widevine L1. Sources
and reasoning: `cleantcl/docs/TCL-NOTES.md`. The owner accepted this.

**The owner's explicit choices** (from an AskUserQuestion, quote them back
before acting against any of them):

- Approach: **"Existing first, then build mine"** — get a proven third-party
  launcher working, *then* build the custom one.
- Execution: **attach their computer** and run ADB directly.
- Must keep working: **Google Play Store + Assistant**, **Chromecast casting**,
  **HDMI-CEC + soundbar/console switching**.
- **Not** selected: Netflix / Disney+ / Prime.

Interpretation applied to that last point, stated to the owner and not
corrected by them: preloaded streaming **apps** are free to remove, but the
**Widevine/DRM stack is deliberately left intact** — removing it serves no ads
and would cap any future streaming at 480p. If this comes up again, confirm
rather than assume.

## 4. Phase 1 — `cleantcl/` — DONE, committed, pushed

An ADB toolkit. Packages are **disabled** (`pm disable-user`), never
uninstalled. Everything reversible via `ct restore`.

```
./bin/ct connect <ip>    ./bin/ct inventory    ./bin/ct debloat [--apply]
./bin/ct launcher set <pkg>    ./bin/ct debloat --tier2 --apply
./bin/ct restore
```

Three safety layers, all verified working:

1. `packages/00-protected.txt` — a veto list the guard applies to every
   package, even ones added to a removal list by hand. Covers the framework,
   SystemUI, network stack, Bluetooth (the remote), the IME,
   `com.android.shell` (**ADB itself**), and the owner's four keeps.
2. `--tier2` **refuses** to disable the stock launcher unless a replacement is
   already resolving as HOME. This is the step that otherwise leaves a black
   screen.
3. `debloat` refuses to run without an inventory snapshot.

`com.tcl.*` / `com.realtek.*` are **never** auto-removed — the same prefix
covers ad junk and the HDMI/panel code. `ct inventory` writes
`vendor-review.txt` for manual classification.

**Verification status:** logic proven end-to-end against a *simulated* TCL
Android TV 9 (guard vetoes, tier-2 refusal, idempotent re-runs, restore to a
byte-identical package set). Four real bugs were found and fixed that way.
See `cleantcl/docs/TESTING.md`. **Never run against real hardware.**

## 5. Phase 2 — `launcher/` — INCOMPLETE, uncommitted, NEVER COMPILED

A from-scratch Android TV launcher, `com.nayqtr.righttime`.

Design commitments made so far:
- **Zero Gradle dependencies.** `dependencies { }` is empty on purpose.
- **No `android.permission.INTERNET`.** The launcher cannot phone home, fetch
  an ad, or report viewing, because the OS will not let it open a socket.
  This is the centrepiece — do not add the permission casually.
- `abiFilters 'armeabi-v7a', 'arm64-v8a'` — required for this 32-bit TV.
- minSdk 21 / targetSdk 28 / compileSdk 34, AGP 8.5.2.

Written:

| File | State |
|---|---|
| `settings.gradle`, `build.gradle`, `gradle.properties`, `app/build.gradle` | done |
| `app/src/main/AndroidManifest.xml` | done — HOME + LEANBACK_LAUNCHER categories |
| `Prefs.java` | done — favourites, 12/24h, wallpaper, show-inputs |
| `AppEntry.java` | done |
| `AppRepository.java` | done — merges LEANBACK_LAUNCHER **and** plain LAUNCHER, which is why sideloaded apps that the stock TCL launcher hides will appear |
| `TvInputs.java` | done — HDMI passthrough enumeration, fully defensive |
| `TileView.java` | done — focusable tile, focus scale animation |

**Still missing — the app will not build without these:**

- `HomeActivity.java` — clock, date, wallpaper background, favourites row,
  all-apps row, inputs row, D-pad focus, long-press to favourite,
  `onBackPressed` must be a **no-op** (a launcher must not exit on Back).
- `SettingsActivity.java` — 12/24h toggle, wallpaper picker, show-inputs
  toggle, favourite reordering.
- `res/values/styles.xml` — `RightTimeTheme` (referenced by the manifest).
- `res/drawable/banner.xml` and `res/mipmap-xhdpi/ic_launcher.png` — **both
  referenced by the manifest; the build fails without them.**
- Wallpaper gradient drawables.
- A debug signing config, or use Gradle's default debug keystore.

**It has never been run through `gradle assembleDebug` even once.** Expect
compile errors. Build it before claiming anything about it.

Known trap already hit once: `String.join` is API 26 and minSdk is 21 — it was
removed from `Prefs.java`. Watch for other API-level slips (`List.of`,
`Optional`, `java.time`, lambdas are fine via desugaring but not assumed here).

## 6. Environment

- Android SDK provisioned at **`/opt/android-sdk`** (cmdline-tools,
  platform-tools, platforms;android-34, build-tools;34.0.0). `ANDROID_HOME` is
  **not** exported — set it.
- Gradle 8.14.3 at `/opt/gradle`. JDK 21.
- `dl.google.com` reachable (HTTP 200), so AGP and deps resolve.
- **`/opt` is ephemeral and rebuilt each session** — the SDK will need
  reprovisioning. The command that worked is in this session's history; it is
  just `sdkmanager --licenses` then
  `sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"`.

## 7. Do this first in the new session

1. Confirm the Mac's folder is actually attached (`list_computer_folders`).
   Last seen state: folder `Claude 101` on `xnms-MacBook-Pro` listed but
   **`not_available`** to cloud sessions, cause unreported. A plausible cause
   is iCloud "Desktop & Documents" sync putting it under `~/Library`; a folder
   at a plain path such as `~/cleantcl` may work instead. **This is a
   hypothesis, not a diagnosis.**
2. `brew install --cask android-platform-tools` on the Mac if needed.
3. On the TV: Settings → Device Preferences → About → click **Build** ×7 →
   Developer options → **Network debugging** on. Get the IP from
   Settings → Network & Internet.
4. `./bin/ct connect <ip>` — **accept the prompt on the TV screen**, re-run.
5. `./bin/ct inventory` — then **read `snapshots/latest/vendor-review.txt`**.
   This is the first real data anyone has had. Classify the `REVIEW` lines
   into `packages/30-vendor-review.txt`. When unsure, leave it: an
   unidentified `com.tcl.*` package is likelier to drive the panel or HDMI
   than to serve an ad.
6. `./bin/ct debloat` (dry run) → read it properly → `--apply`.
7. Have the owner live with it for a day and check their four keeps: Play
   Store, Assistant mic, casting, HDMI switching. `ct restore` if anything is off.
8. Only then: install Projectivy (`com.spocky.projengmenu`) **from the TV's own
   Play Store**, `ct inventory`, `ct launcher set`, confirm with the remote,
   then `ct debloat --tier2 --apply`.
9. Phase 2 after that, per the owner's "existing first, then build mine".

## 8. Working agreements from this session

- The owner asked to be checked with rather than guessed at on names, titles
  and figures, and for corrections to stick for the rest of the session.
- Do not claim anything works on the TV until it has been seen working on the
  TV. Phase 1's test results are from a simulator and are labelled as such.
