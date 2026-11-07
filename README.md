# AppHub — Premium Windows Package Store

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2011%20%7C%2010-0078D6.svg)](https://microsoft.com/windows)
[![WinGet](https://img.shields.io/badge/Powered%20By-Microsoft%20WinGet-005FB8.svg)](https://github.com/microsoft/winget-cli)
[![Tauri](https://img.shields.io/badge/Desktop-Tauri%202%20%2B%20Rust-FFC131.svg)](https://tauri.app)

**AppHub** is a production-ready, minimalist, commercial-grade Windows application store powered by **Microsoft WinGet CLI**. Designed with a dark graphite aesthetic inspired by Microsoft Store, Steam, Raycast, and Linear, AppHub provides power users, system administrators, and developers with a fast, transparent, and uncluttered desktop software management experience.

---

## Key Features

- **Direct WinGet CLI Integration**:
  Full native wrapper executing `winget search`, `show`, `install`, `uninstall`, `upgrade`, `list`, `source`, `pin`, `import`, and `export`.
- **Sequential Installation Queue**:
  Multi-task queue supporting automatic sequential package installation, download progress telemetry, cancelation, and live console process output streaming.
- **Dedicated Update Center**:
  Batch scan installed applications against official repositories, perform one-click `winget upgrade --all`, exclude selected utilities, or pin critical versions with `winget pin`.
- **11 Verified Software Categories**:
  Curated taxonomy for Browsers, Development, Gaming, Multimedia, Communication, Security, Productivity, Utilities, System Tools, Compression, and Drivers.
- **Enterprise Library & Manifest Sync**:
  Create custom software collections (e.g. *Developer Workstation*, *Privacy Suite*), generate official `winget-packages.schema.2.0.json` exports, and import machine configurations.
- **Security & Privilege Transparency**:
  Safe argument array vectors preventing shell injection, strict package ID format validation, and clear Windows User Account Control (UAC) elevation dialogs.
- **Dark Graphite & Fluent Styling**:
  Zero-pill typographic hierarchy, tabular numerals for version telemetry, single-elevation surfaces, and smooth transitions.

---

## Architecture Overview

```
apphub/
├── src-tauri/                 # Native Rust Backend (Tauri 2)
│   ├── src/
│   │   ├── commands/          # IPC command handlers (search, install, sources)
│   │   ├── database/          # SQLite persistence & migration engine
│   │   ├── errors.rs          # Typed error handling with thiserror
│   │   ├── models/            # Package & task serialization models
│   │   ├── security/          # Argument sanitization & package ID regex
│   │   ├── winget/            # WinGet CLI detection, process wrapper, and parser
│   │   ├── lib.rs             # Tauri app builder & plugin registration
│   │   └── main.rs            # Windows subsystem entry point
│   ├── Cargo.toml             # Rust dependencies (tokio, rusqlite, serde)
│   └── tauri.conf.json        # Frameless window & NSIS/MSI release targets
├── src/                       # Frontend Presentation Layer
│   ├── components/            # Fluent titlebar, sidebar, AppCard, live terminal
│   ├── pages/                 # All 9 functional pages (Home, Discover, Updates, etc.)
│   ├── services/              # WinGet engine, installation queue, and local cache
│   ├── tests/                 # Automated validation test suite
│   ├── types/                 # Strict TypeScript contracts
│   └── App.tsx                # Application shell & keyboard shortcut dispatcher
```

---

## Getting Started

### Prerequisites

- **Windows 10 (version 1809+) or Windows 11**
- **Microsoft WinGet CLI** (included with [App Installer](https://aka.ms/getwinget))
- **Node.js 18+** and **npm**
- **Rust Stable** (for building desktop binary):
  ```bash
  winget install Rustlang.Rustup
  ```

### Development Mode

1. Clone repository and install dependencies:
   ```bash
   git clone https://github.com/apphub-windows/apphub.git
   cd apphub
   npm install
   ```

2. Run the Vite web development server:
   ```bash
   npm run dev
   ```

3. Launch via Tauri 2 desktop runner:
   ```bash
   npm run tauri dev
   ```

---

## Building Installers

To compile production Windows installers (`.msi` and `.exe` via NSIS):

```bash
npm run tauri build
```

Compiled binaries will be generated at:
`src-tauri/target/release/bundle/nsis/AppHub_0.1.0_x64-setup.exe`
`src-tauri/target/release/bundle/msi/AppHub_0.1.0_x64_en-US.msi`

---

## Global Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + K` | Open instant package search overlay |
| `Ctrl + R` | Sync repository metadata with WinGet |
| `Ctrl + \`` / `Ctrl + T` | Toggle live WinGet CLI terminal console |
| `Ctrl + 1`–`5` | Navigate store views (Home, Discover, Categories, etc.) |
| `Esc` | Dismiss modals, search overlay, or terminal |

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
