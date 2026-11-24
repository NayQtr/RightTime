#!/usr/bin/env bash
# guard.sh - the veto layer. Nothing gets disabled without passing through here.

# Cache of protected glob patterns.
CT_PROTECTED_PATTERNS=()

guard_load() {
  local line
  CT_PROTECTED_PATTERNS=()
  while IFS= read -r line; do
    [ -n "$line" ] && CT_PROTECTED_PATTERNS+=("$line")
  done < <(read_pkg_list "$CT_PKG_DIR/00-protected.txt")
  [ "${#CT_PROTECTED_PATTERNS[@]}" -gt 0 ] \
    || die "Protected list is empty or missing ($CT_PKG_DIR/00-protected.txt). Refusing to run."
}

# guard_is_protected <pkg> -> 0 if protected, and echoes the pattern that matched.
guard_is_protected() {
  local pkg="$1" pat
  for pat in "${CT_PROTECTED_PATTERNS[@]}"; do
    # shellcheck disable=SC2053  # glob match on the right is intentional
    if [[ "$pkg" == $pat ]]; then
      printf '%s' "$pat"
      return 0
    fi
  done
  return 1
}

# A package is also protected if it is the currently resolved HOME launcher,
# regardless of what any list says. Prevents disabling the only home screen.
guard_current_home() {
  ash cmd package resolve-activity -c android.intent.category.HOME --user 0 \
    | sed -n 's/.*packageName=\([a-zA-Z0-9._]*\).*/\1/p' | head -1
}

# guard_check <pkg> -> prints a reason and returns 1 if the package must not
# be touched; returns 0 if it is safe to proceed.
guard_check() {
  local pkg="$1" pat home
  if pat="$(guard_is_protected "$pkg")"; then
    printf 'protected by rule: %s' "$pat"
    return 1
  fi
  home="${CT_CURRENT_HOME:-}"
  if [ -n "$home" ] && [ "$pkg" = "$home" ]; then
    printf 'is the TV'"'"'s current home launcher'
    return 1
  fi
  return 0
}
