# Contributing to AppHub

Thank you for your interest in contributing to **AppHub — Premium Windows Package Store**! We welcome bug reports, feature requests, documentation enhancements, and pull requests.

## Development Workflow

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/apphub.git
   cd apphub
   ```
3. Create a descriptive feature branch:
   ```bash
   git checkout -b feat/package-dependencies-tree
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Run the test and lint suites before submitting:
   ```bash
   npm run lint
   npm test
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

## Pull Request Guidelines

- Ensure all TypeScript types are strictly declared (no `any` in core models).
- Process calls to WinGet must utilize argument arrays via `WinGetExecutor::execute` to eliminate command injection vectors.
- Maintain the zero-pill typography and single-elevation card architecture described in the design specifications.
- Submit PRs against the `main` branch with a clear title and list of changes.

## Security Disclosures

If you discover a security vulnerability, please do not file a public issue. Email security concerns to `security@apphub.internal` or disclose via GitHub Private Security Advisories.
