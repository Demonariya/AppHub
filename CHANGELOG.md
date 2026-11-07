# Changelog

All notable changes to **AppHub** will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Initial Production Release

### Added
- **Core Architecture**:
  - Rust & Tokio async backend with Tauri 2 desktop runtime integration.
  - SQLite persistent database engine with migrations for package cache, history, and collections.
  - Safe WinGet CLI wrapper using argument vectors (`WinGetExecutor`) eliminating shell interpolation risks.
- **Storefront & Navigation**:
  - Home dashboard with featured spotlight, popular apps, recent updates, and recommended power tools.
  - Comprehensive Discover page with real-time fuzzy search across name, ID, publisher, and tags.
  - Multi-axis filtering for Architecture (x64, arm64, x86), Source (`winget`, `msstore`), and Status.
  - 11 verified category catalogs with curated descriptions.
  - Grid and tabular list view modes with tabular figure alignment (`tabular-nums`).
- **Package Management**:
  - Dedicated package details modal with installer hashes, architecture specs, and live CLI command preview.
  - Multi-task sequential installation queue with live log output streaming and cancelation.
  - Dedicated Update Center supporting selective updates, `winget upgrade --all`, and version pinning (`winget pin`).
  - Package Source Manager supporting add, remove, reset, and validation of custom repositories.
- **Library & Enterprise Workflows**:
  - Custom collections for machine provisioning (*Developer Workstation*, *Privacy & Security Suite*).
  - Official Microsoft WinGet JSON manifest export (`winget export`) and import (`winget import`).
  - Full application backup and restoration with JSON schema validation.
- **Fluent UI & Ergonomics**:
  - Windows 11 Fluent dark graphite theme with optional light theme support.
  - Global Ctrl+K instant search modal and keyboard shortcut navigation.
  - Windows User Account Control (UAC) elevation dialog explaining system privileges.
  - Floating and expandable live CLI execution terminal drawer with log download.
