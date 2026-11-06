# AppHub

**AppHub** is a Windows-first desktop package manager interface powered by Microsoft's WinGet CLI. It combines a compact, graphite UI with a Rust/Tauri backend and never downloads or executes installers outside WinGet.

> **Development status — 0.1.0 foundation.** This repository contains a working WinGet integration foundation (detection, search, installed packages, updates, install, uninstall, upgrade and source listing) and a navigable desktop UI. It is not yet a feature-complete replacement for Microsoft Store: persistent library workflows, live process streaming/cancellation, advanced source editing, tray integration and signed release artifacts remain planned and are not represented as implemented.

## Stack

- Rust stable, Tokio, Tauri 2
- React, TypeScript, Vite, Tailwind CSS
- WinGet CLI / App Installer
- SQLite-ready modular backend (operation history migration is planned)

## Requirements

- Windows 10 1809+ or Windows 11
- Microsoft App Installer with WinGet available
- Rust stable and the MSVC C++ build tools
- Node.js 20+ and npm
- WebView2 Runtime

Tauri's Windows build prerequisites are documented at [Tauri prerequisites](https://tauri.app/start/prerequisites/). WinGet command behavior is documented by [Microsoft Learn](https://learn.microsoft.com/windows/package-manager/winget/).

## Development

```powershell
npm install
npm run tauri dev
```

## Build

```powershell
npm run tauri build
```

The Tauri bundle configuration targets NSIS. MSI packaging can be enabled in `src-tauri/tauri.conf.json` on a Windows build host with the required WiX/VBScript components.

## Safety model

- WinGet is invoked with `std::process::Command` argument arrays; no shell command concatenation.
- Package IDs are validated before mutating operations.
- No arbitrary shell execution API is exposed to the frontend.
- Installs are user-initiated and do not silently elevate AppHub itself.
- WinGet output is treated as untrusted text, not executable metadata.
- AppHub does not claim progress percentages that WinGet does not provide.

## Current capabilities

| Capability | Status |
|---|---|
| WinGet detection and version | Implemented |
| Search and installed package listing | Implemented (table-output parser) |
| Update scan and individual update | Implemented |
| Install / uninstall | Implemented |
| Source listing | Implemented |
| Home, Discover, Installed, Updates, Downloads, Library, Sources, Settings navigation | UI foundation |
| Structured manifest metadata, categories, pagination | Planned |
| Persistent favorites, collections and operation history | Planned |
| Live output streaming and process cancellation | Planned |
| Tray, startup, notifications and global shortcuts | Planned |
| Import/export, pin, configure and source mutations | Planned |

WinGet's human-readable table output varies by locale and version. AppHub requests a stable output locale where supported and keeps parsing defensive; unrecognized rows are omitted rather than fabricated.

## Project layout

```
src/                 React UI
src-tauri/src/       Rust commands and WinGet adapter
src-tauri/capabilities/
.github/workflows/   CI and Windows release
```

## License

MIT. See [LICENSE](LICENSE).
