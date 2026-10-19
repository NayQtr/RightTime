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
