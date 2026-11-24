# Running it

## 0. On your computer

Install Android platform-tools (this gives you `adb`):

```bash
# macOS
brew install --cask android-platform-tools
# Debian/Ubuntu
sudo apt install adb
# Windows: download SDK Platform-Tools from developer.android.com, add to PATH
```

Check: `adb version`. If `adb` is not on your PATH, set `ADB=/full/path/to/adb`.

## 1. Enable ADB on the TV

See `docs/TCL-NOTES.md`. Short version: Settings → Device Preferences → About
→ click **Build** 7 times → Developer options → **Network debugging** on.

## 2. Connect

```bash
./bin/ct connect 192.168.1.50      # your TV's IP
```

Accept the **Allow debugging?** prompt **on the TV screen**, then run it again.

## 3. Snapshot — do not skip

```bash
./bin/ct inventory
```

This is your undo. `debloat` refuses to run without it.

Read the vendor report it writes:

```bash
cat snapshots/latest/vendor-review.txt
```

Anything marked `REVIEW` is a TCL package the tool does not recognise. It will
not be touched. If you can tell a line is advertising junk, add it to
`packages/30-vendor-review.txt`. **When unsure, leave it.** A TCL package you
cannot identify is more likely to be driving the panel or HDMI than serving you
an ad.

## 4. Dry run

```bash
./bin/ct debloat
```

Prints exactly what would be disabled and what the guard blocked. Nothing
changes. Read this list properly before step 5.

## 5. Apply

```bash
./bin/ct debloat --apply
```

Then **use the TV for a day.** Check the things you said you cared about:
Play Store, the Assistant mic button, casting from your phone, and HDMI
switching to your console or soundbar. If anything is off: `./bin/ct restore`.

## 6. Replace the home screen

Install a launcher **on the TV, from the Play Store** — Projectivy Launcher
(`com.spocky.projengmenu`) or FLauncher (`me.efesser.flauncher`). Installing
from the TV's own Play Store means you are getting a signed build from the
developer rather than a random APK.

Then:

```bash
./bin/ct inventory                              # re-scan so ct sees the new app
./bin/ct launcher list                          # confirm it registered as a launcher
./bin/ct launcher set com.spocky.projengmenu
```

`ct` verifies the swap actually took and refuses to continue if it did not.
**Press Home on the remote now** and confirm you land on the new launcher.

## 7. Kill the stock launcher

Only once step 6 is confirmed working:

```bash
./bin/ct debloat --tier2 --apply
```

This refuses to run if a replacement is not already resolving as HOME.

## If something breaks

```bash
./bin/ct restore
```

Re-enables every package and puts the original home screen back.

**If the TV has no home screen and you cannot navigate:** ADB still works, and
that is the whole point of never disabling `com.android.shell`. Run
`./bin/ct restore` from your computer. If ADB is somehow also gone, a factory
reset (Settings → Device Preferences → Reset, or the pinhole/button combo on
the TV) re-enables everything. You lose app logins, not the TV.

## Flags

- `--yes` — skip confirmation prompts (for scripting)
- `--apply` — actually make changes; without it everything is a dry run
- `--tier2` — include the stock launcher; guarded
