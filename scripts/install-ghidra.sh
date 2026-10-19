#!/usr/bin/env bash
# Install Ghidra 12.1 (the REA decompiler backend) into /opt.
#
# Cloud session containers are ephemeral, so /opt is wiped between sessions.
# Run this from the environment's Setup script so every new session has the
# Ghidra release that the `rea` MCP server (see .mcp.json) expects at
# GHIDRA_INSTALL_DIR=/opt/ghidra_12.1_PUBLIC.
#
# Idempotent: exits early if a working install is already present.
set -euo pipefail

VERSION="12.1"
RELEASE_TAG="Ghidra_12.1_build"
ASSET="ghidra_12.1_PUBLIC_20260513.zip"
INSTALL_DIR="/opt/ghidra_12.1_PUBLIC"
URL="https://github.com/NationalSecurityAgency/ghidra/releases/download/${RELEASE_TAG}/${ASSET}"

# Optional supply-chain hardening: paste the official SHA-256 from the GitHub
# release page here to enforce it. Left empty = structural validation only.
SHA256=""

if [ -x "${INSTALL_DIR}/support/analyzeHeadless" ]; then
  echo "Ghidra already installed at ${INSTALL_DIR}; skipping."
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
zip="${tmp}/ghidra.zip"

echo "Downloading Ghidra ${VERSION} ..."
for i in 1 2 3 4; do
  if curl -sSL --max-time 600 -o "${zip}" "${URL}"; then break; fi
  echo "download attempt ${i} failed; retrying" >&2
  sleep "$((2 ** i))"
done

if [ -n "${SHA256}" ]; then
  echo "${SHA256}  ${zip}" | sha256sum -c -
fi

# Structural sanity check even without a pinned hash.
unzip -l "${zip}" >/dev/null

echo "Extracting to /opt ..."
unzip -q "${zip}" -d /opt

if [ ! -x "${INSTALL_DIR}/support/analyzeHeadless" ]; then
  echo "ERROR: analyzeHeadless missing after extraction" >&2
  exit 1
fi

echo "Ghidra ${VERSION} installed at ${INSTALL_DIR}"
