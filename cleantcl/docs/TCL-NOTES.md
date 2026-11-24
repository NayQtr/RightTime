# The target TV

Read off the TV's own Product Information screen:

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

What that tells us:

- **`TCL-ME-RT2851-S1`** — Realtek RT2851 series SoC.
- **`armv7l`** — 32-bit ARM userspace. Any APK you build must include a
  32-bit ABI (`armeabi-v7a`); a 64-bit-only build will not install.
- **Netflix ESN `NFANDROID2-PRV-TCL2018UHDANDROIDTV`** — confirms Android TV
  (not Google TV, not Roku TV). The stock launcher is therefore
  `com.google.android.tvlauncher`, not `com.google.android.apps.tv.launcherx`.
- **Kernel 4.14.236, built Oct 2022** — consistent with the Android 9
  "BeyondTV" platform TCL shipped on this hardware.

## Firmware replacement: why not

- No confirmed bootloader unlock or working custom ROM for RT2851. The main
  XDA thread on this platform
  ([rooted image for TCL RT51/RT2851/BeyondTV](https://xdaforums.com/t/official-rooted-image-for-tcl-rt51-rt2851-beyondtv-android-9-plattform.4065717/page-7))
  leaves the bootloader question open; the suggested `fastboot boot boot.img`
  test has no reported result, and posters there say TCL has taken the
  firmware servers down.
- TCL's `authboot` fastboot fork requires per-device authorisation from TCL's
  servers for bootloader operations
  ([bootloader unlock tracker](https://github.com/zenfyrdev/bootloader-unlock-wall-of-shame/blob/main/brands/tcl/README.md)).
  That tracker covers TCL/BlackBerry phones rather than this TV, so treat it
  as indirect evidence of TCL's posture, not a measurement of this model.
- Unsigned firmware forfeits Widevine L1.

If you want to test the bootloader anyway, `fastboot boot` (boot, not flash)
a stock `boot.img` is the non-destructive probe — a failure changes nothing.
That is a research detour, not a path to a working daily-driver TV.

## Enabling ADB on this TV

1. **Settings → Device Preferences → About**
2. Scroll to **Build** and click it **7 times** — "You are now a developer".
3. Back out to **Device Preferences → Developer options**.
4. Turn on **Network debugging** (some builds call it **USB debugging** /
   **ADB debugging**).
5. Find the IP: **Settings → Network & Internet →** your network **→ IP address**.
6. On your computer: `ct connect <that-ip>`
7. **Look at the TV.** An *Allow debugging?* dialog appears. Tick
   **Always allow from this computer** and accept. Then run `ct connect` again.

Give the TV a DHCP reservation on your router. If its IP moves you will have
to re-authorise.

## Known Android TV 9 gotchas

- `com.android.location.fused` causes a **boot loop** if disabled. It is in
  the protected list. Leave it there.
- `com.android.shell` is ADB. Disabling it locks you out with no way back
  short of a factory reset. Protected.
- `com.android.bluetooth` is how the remote pairs. Protected.
- Disabling the only IME leaves you unable to type anything. Protected.
- `com.google.android.tungsten.setupwraith` can re-assert itself as HOME
  after an update, which is why it is in tier 2 alongside the launcher.
- A **factory reset re-enables everything.** It is the nuclear undo if
  `ct restore` is ever unavailable.
