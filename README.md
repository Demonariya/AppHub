# AppHub

**AppHub** is a Windows-first desktop package manager powered by Microsoft's WinGet CLI. It combines a compact graphite interface with a Rust/Tauri backend and delegates package installation and removal to WinGet.

> **Development status — 0.1.0 foundation.** AppHub currently provides WinGet detection, package search, installed-package and update discovery, install/uninstall/upgrade operations, source listing, and a locally persisted favorites library. It is an early development build, not yet a feature-complete replacement for Microsoft Store. Live process streaming/cancellation, advanced source editing, tray integration, richer package metadata, and verified release artifacts remain outstanding.

## Stack

- Rust stable, Tokio, Tauri 2
- React, TypeScript, Vite, Tailwind CSS
- WinGet CLI / Microsoft App Installer
- Local JSON persistence in the Tauri application data directory for saved packages

## Requirements

- Windows 10 1809+ or Windows 11
- Microsoft App Installer with WinGet available
- Rust stable and the MSVC C++ build tools
- Node.js 20+ and npm
- WebView2 Runtime

Tauri's Windows build prerequisites are documented at [Tauri prerequisites](https://tauri.app/start/prerequisites/). WinGet command behavior is documented by [Microsoft Learn](https://learn.microsoft.com/windows/package-manager/winget/).

## Development

~~~powershell
npm install
npm run tauri dev
~~~

## Build

~~~powershell
npm run tauri build
~~~

The Tauri bundle configuration targets NSIS. MSI packaging can be enabled in src-tauri/tauri.conf.json on a Windows build host with the required WiX components.

## Safety model

- WinGet is invoked with std::process::Command argument arrays; no shell command concatenation.
- Package IDs are validated before mutating operations and before storing favorites.
- No arbitrary shell execution API is exposed to the frontend.
- Installs and removals are user-initiated.
- WinGet output is treated as untrusted text, not executable metadata.
- AppHub does not claim progress percentages that WinGet does not provide.

## Current capabilities

| Capability | Status |
|---|---|
| WinGet detection and version | Implemented |
| Search and installed package listing | Implemented (table-output parser) |
| Update scan and individual update | Implemented |
| Install / uninstall / upgrade all | Implemented |
| Source listing | Implemented |
| Persistent package favorites | Implemented (local JSON file) |
| Home, Discover, Installed, Updates, Downloads, Library, Sources, Settings navigation | UI foundation |
| Structured package metadata, categories, pagination | Planned |
| Operation history and download/operation queue | Planned |
| Live output streaming and process cancellation | Planned |
| Tray, startup, notifications and global shortcuts | Planned |
| Import/export, pin, configure and source mutations | Planned |

WinGet's human-readable table output varies by locale and version. AppHub requests an English output locale where supported and keeps parsing defensive; unrecognized rows are omitted rather than fabricated.

## Project layout

~~~
src/                 React UI
src-tauri/src/       Rust commands and WinGet adapter
src-tauri/capabilities/
.github/workflows/   CI and Windows release
~~~

## License

MIT. See LICENSE.
