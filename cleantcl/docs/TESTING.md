# How this was verified

No real TV was available to this session, so the logic was exercised against a
mock `adb` that simulates a TCL Android TV 9: 36 packages including the real
stock-launcher, Google, Netflix/Amazon and `com.tcl.*` / `com.realtek.*` names,
with working `pm disable-user` / `pm enable` / `cmd package set-home-activity`
state that persists across calls.

The mock lives outside this repo (it is a test fixture, not a deliverable). To
rebuild it, see the commit history or ask for it to be regenerated.

## Results

| Test | Expected | Result |
|---|---|---|
| `connect` to unreachable host | clear error with the dev-mode steps | pass |
| `inventory` | captures 36 pkgs, writes vendor report | pass |
| vendor classification | `com.tcl.hdmicec`, `com.tcl.tvinput.source`, `com.realtek.tvinput` → PROTECTED; `com.tcl.ads`, `com.tcl.channel`, `com.tcl.usercenter` → REVIEW | pass |
| `debloat` with no `--apply` | changes nothing | pass |
| `debloat` with no snapshot | refuses | pass |
| guard veto: `com.android.shell` hand-added to a removal list | blocked | pass |
| guard veto: `com.google.android.gms` hand-added | blocked | pass |
| guard veto: `com.tcl.hdmicec` hand-added | blocked | pass |
| `--tier2` while stock launcher is HOME | **refuses**, exit 1 | pass |
| `launcher set` | swaps HOME and verifies it took | pass |
| `--tier2` after a verified replacement | proceeds | pass |
| second `--tier2` run | idempotent; only touches the 3 new pkgs | pass |
| `restore` | enabled-package set **byte-identical** to pre-change snapshot | pass |
| `restore` | home launcher returned to `com.google.android.tvlauncher` | pass |

## Bugs found and fixed during testing

1. `ct status` printed counts twice — `grep -c .` already emits `0` on empty
   input and exits 1, so the `|| echo 0` fallback fired as well.
2. `CT_ASSUME_YES` set in the environment was clobbered by the script's own
   initialiser, so automation could not pre-accept prompts.
3. `confirm()` crashed with a raw shell error when no TTY was attached instead
   of explaining that `--yes` was needed.
4. `debloat` read "already disabled" from the snapshot rather than live state,
   so a second run redundantly re-disabled packages and reported inflated counts.

## Not covered

Everything that needs real hardware: whether `cmd package set-home-activity`
behaves the same on this exact TCL build, whether any `com.tcl.*` package
respawns after disabling, and the real contents of `pm list packages` on the
actual TV. Run `ct inventory` first and the vendor report will tell you.
