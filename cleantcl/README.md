# CleanTCL

Strip the ads and bloat from a TCL Android TV and replace the home screen,
over ADB. No root, no bootloader unlock, no firmware flashing. Every change
is reversible with one command.

Built for the TV identified in `docs/TCL-NOTES.md`:
TCL Android TV 9, Realtek RT2851, build `V8-R851T02-LF1V722.000038`.

## Why not custom firmware

This started as a request to replace the TV's software outright, using
[CleanFrame](https://github.com/nthnclrk/CleanFrame) as a reference.

CleanFrame targets Samsung The Frame, which runs **Tizen**, and installs a
signed `.wgt` web widget. This TV runs **Android TV 9**. None of that code
ports; its *idea* — a quiet home screen you control — is what this borrows.

Replacing the firmware itself was rejected on the evidence:

- No confirmed bootloader unlock or custom ROM exists for the RT2851 platform.
- TCL ships `authboot`, a fastboot fork that requires authorisation from
  TCL's own servers for bootloader operations.
- Flashing unsigned firmware forfeits the Widevine L1 keys, which would cap
  any DRM streaming at 480p or break it entirely.

The launcher-and-package layer below gets you the actual goal — no ads, no
bloat, your own home screen — with a working TV at the end.

## What it does

| Command | Effect |
|---|---|
| `ct connect <ip>` | Connect over network ADB |
| `ct inventory` | Snapshot every package's state. **Run first.** |
| `ct debloat` | Dry-run the removals |
| `ct debloat --apply` | Disable ad / telemetry / preloaded-streaming packages |
| `ct launcher set <pkg>` | Make a replacement launcher the home screen, and verify it |
| `ct debloat --tier2 --apply` | Disable the stock launcher — only once a replacement is verified |
| `ct restore` | Put everything back |

Packages are **disabled** (`pm disable-user`), never uninstalled. Nothing is
deleted; `ct restore` re-enables from the snapshot.

## Safety design

Three independent things have to fail before this can break your TV:

1. **A protected list that cannot be overridden.** `packages/00-protected.txt`
   shields the framework, SystemUI, the network stack, Bluetooth (your remote),
   the keyboard, `com.android.shell` (ADB itself — disable it and you lose all
   remote access), and everything you asked to keep: Play Store, Assistant,
   Chromecast, HDMI-CEC. The guard runs on every package, every time, even if
   you add it to a removal list by hand.
2. **Launcher ordering is enforced.** `--tier2` refuses to disable the stock
   launcher unless a replacement is already resolving as HOME. This is the step
   that otherwise leaves a TV booting to a black screen.
3. **Inventory is mandatory.** `debloat` will not run until a snapshot exists.

Vendor (`com.tcl.*`, `com.realtek.*`) packages are **never** auto-removed.
Package names vary between TCL builds and the same prefix covers both ad junk
and the code driving HDMI-CEC and input switching. `ct inventory` writes a
`vendor-review.txt` listing what was found and what the guard already shields;
you classify the rest by hand.

## Status

Logic verified end-to-end against a simulated TCL Android TV 9 (see
`docs/TESTING.md`): connect, inventory, dry run, guard veto, tier-2 refusal,
apply, launcher swap, idempotent re-run, and restore to a byte-identical
package set.

**Not yet run against real hardware.** Do that with a snapshot in hand.
