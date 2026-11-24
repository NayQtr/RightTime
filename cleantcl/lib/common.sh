#!/usr/bin/env bash
# common.sh - shared helpers. Sourced by bin/ct. Not executable on its own.

set -o pipefail

CT_ROOT="${CT_ROOT:?CT_ROOT must be set by the entrypoint}"
CT_SNAPSHOT_DIR="$CT_ROOT/snapshots"
CT_PKG_DIR="$CT_ROOT/packages"

# ---------- output ----------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'
  C_BLU=$'\033[34m'; C_DIM=$'\033[2m';  C_BLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=; C_GRN=; C_YEL=; C_BLU=; C_DIM=; C_BLD=; C_OFF=
fi

info()  { printf '%s\n' "${C_BLU}==>${C_OFF} $*"; }
ok()    { printf '%s\n' "${C_GRN} ok${C_OFF} $*"; }
warn()  { printf '%s\n' "${C_YEL} !!${C_OFF} $*" >&2; }
err()   { printf '%s\n' "${C_RED}ERR${C_OFF} $*" >&2; }
dim()   { printf '%s\n' "${C_DIM}$*${C_OFF}"; }
die()   { err "$*"; exit 1; }

# A prominent yes/no prompt. Returns 0 on yes.
confirm() {
  local prompt="$1" reply
  if [ "${CT_ASSUME_YES:-0}" = "1" ]; then
    dim "    (--yes given, auto-confirming: $prompt)"
    return 0
  fi
  if [ ! -r /dev/tty ]; then
    err "Need to ask: ${prompt}"
    err "No terminal available to read the answer. Re-run with --yes to accept in advance."
    return 1
  fi
  printf '%s' "${C_BLD}${C_YEL}?${C_OFF} ${prompt} ${C_DIM}[y/N]${C_OFF} "
  read -r reply </dev/tty || return 1
  case "$reply" in [yY]|[yY][eE][sS]) return 0;; *) return 1;; esac
}

# ---------- adb ----------
# Resolve an adb binary: explicit env, then PATH, then common SDK locations.
ct_find_adb() {
  if [ -n "${ADB:-}" ] && [ -x "${ADB}" ]; then printf '%s' "$ADB"; return 0; fi
  if command -v adb >/dev/null 2>&1; then command -v adb; return 0; fi
  local c
  for c in "$HOME/Library/Android/sdk/platform-tools/adb" \
           "$HOME/Android/Sdk/platform-tools/adb" \
           "$ANDROID_HOME/platform-tools/adb" \
           "$ANDROID_SDK_ROOT/platform-tools/adb" \
           "/usr/local/bin/adb" "/opt/homebrew/bin/adb"; do
    [ -n "$c" ] && [ -x "$c" ] && { printf '%s' "$c"; return 0; }
  done
  return 1
}

ct_require_adb() {
  ADB="$(ct_find_adb)" || die "adb not found. Install Android platform-tools, or set ADB=/path/to/adb"
  export ADB
}

# The target device serial, e.g. 192.168.1.50:5555
ct_target() {
  [ -n "${CT_SERIAL:-}" ] || die "No TV connected. Run: ct connect <tv-ip>"
  printf '%s' "$CT_SERIAL"
}

# Run an adb shell command against the target. Trailing CR is stripped because
# Android's shell emits CRLF, which silently corrupts string comparisons.
ash() {
  "$ADB" -s "$(ct_target)" shell "$@" 2>/dev/null | tr -d '\r'
}

# Same, but surface stderr and the real exit code (for state-changing calls).
ash_strict() {
  "$ADB" -s "$(ct_target)" shell "$@" 2>&1 | tr -d '\r'
  return "${PIPESTATUS[0]}"
}

# Load a previously saved connection (so each subcommand doesn't need the IP).
ct_load_session() {
  local f="$CT_ROOT/.session"
  [ -f "$f" ] && . "$f"
  if [ -n "${CT_SERIAL:-}" ]; then
    # Confirm it is actually still connected and authorised.
    local state
    state="$("$ADB" -s "$CT_SERIAL" get-state 2>/dev/null | tr -d '\r')"
    if [ "$state" != "device" ]; then
      warn "Saved target $CT_SERIAL is not reachable (state: ${state:-offline})."
      warn "Re-run: ct connect <tv-ip>"
      unset CT_SERIAL
    fi
  fi
}

ct_save_session() {
  printf 'CT_SERIAL=%s\n' "$1" > "$CT_ROOT/.session"
}

# ---------- package list files ----------
# Read a package list file: strips comments, blank lines, inline whitespace.
read_pkg_list() {
  local f="$1"
  [ -f "$f" ] || return 0
  sed -e 's/#.*$//' -e 's/[[:space:]]//g' "$f" | grep -v '^$' || true
}
