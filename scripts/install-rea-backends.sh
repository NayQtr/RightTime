#!/usr/bin/env bash
# Provision the optional analysis backends for the `rea` MCP server (see .mcp.json).
#
# rea-agents ships three analysis providers; each needs a caller-supplied backend
# that rea itself never downloads:
#   - Ghidra (native decompile)  -> installed separately by scripts/install-ghidra.sh
#   - pwntools-elf (ELF layout)  -> a Python env, provisioned here  (REA_PWNTOOLS_PYTHON)
#   - JADX (APK/DEX)             -> a jadx-headless-mcp JAR          (REA_JADX_MCP_JAR)
#
# Cloud session containers are ephemeral, so /opt is wiped between sessions. Run
# this from the environment's Setup script (alongside install-ghidra.sh) so every
# new session has the backends the rea env block in .mcp.json points at.
#
# Idempotent: skips work that is already present. Never fails the session if an
# optional backend can't be provisioned; it logs and continues.
set -euo pipefail

# --- pwntools-elf provider -------------------------------------------------
# Exact versions the provider validates against (rea-agents 6.7.0).
PWNTOOLS_VENV="/opt/rea-pwntools"
PWNTOOLS_PY="${PWNTOOLS_VENV}/bin/python"

if [ -x "${PWNTOOLS_PY}" ] && "${PWNTOOLS_PY}" -c 'import pwnlib,elftools,unicorn' 2>/dev/null; then
  echo "rea pwntools-elf backend already present at ${PWNTOOLS_VENV}; skipping."
else
  echo "Provisioning rea pwntools-elf backend at ${PWNTOOLS_VENV} ..."
  python3 -m venv "${PWNTOOLS_VENV}"
  "${PWNTOOLS_VENV}/bin/pip" install --quiet --upgrade pip
  "${PWNTOOLS_VENV}/bin/pip" install --quiet \
    'pwntools==4.15.0' 'pyelftools==0.33' 'unicorn==2.1.2'
  "${PWNTOOLS_PY}" -c 'import pwnlib,elftools,unicorn; print("rea pwntools-elf backend ready:", pwnlib.__version__)'
fi

# --- JADX provider (optional) ----------------------------------------------
# rea wants a specific jadx-headless-mcp 0.7.1 JAR at REA_JADX_MCP_JAR. There is
# no canonical public download we can pin with a verified hash, so this script
# does NOT fetch one (running an unverified JAR would be a supply-chain risk).
# Drop a trusted JAR at the path below and it will be used on the next session.
# Note: the standalone `jadx` CLI already covers DEX decompilation regardless.
JADX_JAR="/opt/rea-jadx/jadx-headless-mcp-0.7.1.jar"
if [ -f "${JADX_JAR}" ]; then
  echo "rea JADX backend present at ${JADX_JAR}."
else
  echo "NOTE: rea JADX backend not provisioned (${JADX_JAR} absent)." >&2
  echo "      Supply a trusted jadx-headless-mcp 0.7.1 JAR there to enable it." >&2
fi

echo "rea backend provisioning complete."
