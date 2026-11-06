# Contributing

1. Open an issue describing the bug or proposal before large changes.
2. Keep WinGet process execution inside the Rust adapter. Do not add arbitrary shell execution.
3. Never hardcode production package results or fake progress.
4. Run `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `npm run lint` and `npm run build`.
5. Keep UI labels accessible and preserve keyboard navigation.
6. Include tests for parsing, validation and command behavior.

## Pull requests

Use focused commits, describe Windows versions tested, include relevant logs (redact usernames and paths), and note any WinGet version assumptions.
