## 🛠️ Reverse Engineering Environment (REA + Ghidra Setup)

This repository includes a pre-configured Model Context Protocol (MCP) server integration for **REA** (`rea-agents`) paired with the **Ghidra 12.1** decompiler backend.

### Prerequisites
- **Node.js**: v22.19+ or v24.11+
- **Java**: JDK 21+ (required for Ghidra headless analysis)

### Quick Start
1. **MCP Configuration**: The `.mcp.json` file in the root directory automatically registers the `rea` MCP server with a pinned version and configures `GHIDRA_INSTALL_DIR`.
2. **Ghidra Provisioning**: The automated setup script handles provisioning Ghidra into `/opt`:
   ```bash
   bash scripts/install-ghidra.sh
   ```

### REA analysis backends

`rea-agents` exposes three analysis providers; each needs a caller-supplied backend that REA never
downloads itself. `.mcp.json` points the `rea` server's env at the paths below, and the SessionStart
hook provisions them (ephemeral `/opt` is rebuilt every session):

| Provider | Purpose | Backend | env var |
|---|---|---|---|
| Ghidra | native (ELF/.so) decompile | `scripts/install-ghidra.sh` → `/opt/ghidra_12.1_PUBLIC` | `GHIDRA_INSTALL_DIR` |
| pwntools-elf | ELF layout / mitigations | `scripts/install-rea-backends.sh` → `/opt/rea-pwntools` | `REA_PWNTOOLS_PYTHON` |
| JADX | APK/DEX class inspection | **manual** — drop a trusted `jadx-headless-mcp 0.7.1` JAR at `/opt/rea-jadx/` | `REA_JADX_MCP_JAR` |

```bash
bash scripts/install-rea-backends.sh
```

The JADX provider is optional and left as a manual step: there is no canonical public JAR to pin with
a verified hash, and the standalone `jadx` CLI already covers DEX decompilation. Env vars only take
effect when the `rea` MCP server (re)starts, i.e. on a fresh session.
