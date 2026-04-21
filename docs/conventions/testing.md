# Testing Conventions — Superkick

Source of truth for how tests are written in this workspace.
Applies during implementation and review.

## Mock policy

- **Integration tests hit a real SQLite database** — use a tempdir `sqlite://:memory:` or a temp file via `tempfile::NamedTempFile`. Never mock the `superkick-storage` layer.
  - **Why:** mocked storage has diverged from prod before (migrations passed in mock, failed on real DB). A real SQLite is cheap and catches migration bugs at write-time.
- Mock only at external boundaries: Linear API, GitHub API, subprocess (`tokio::process::Command`). Prefer trait-based seams in `superkick-integrations`.

## Unit vs integration

- **Unit tests** live in `#[cfg(test)] mod tests` at the bottom of the file they cover. Pure logic only (no I/O, no DB).
- **Integration tests** live in `crates/<crate>/tests/`. They touch the DB, filesystem, or spawn subprocesses.
- Prefer integration tests for anything that crosses a module boundary — they catch contract drift that unit tests miss.

## Async & tokio

- Use `#[tokio::test]` (not `#[test]` + `block_on`).
- Use `tokio::test(flavor = "multi_thread")` when the test spawns tasks that must make progress concurrently.
- Never sleep to "wait for something" — use `tokio::sync::Notify`, channels, or poll a condition with a bounded retry.

## SSE / streaming

- When testing a route that emits SSE, assert on the sequence of event types, not raw bytes.
- Drop the receiver explicitly before the test exits to avoid "receiver dropped" log noise.

## Frontend

- Component tests go in `ui/src/**/*.test.tsx` next to the component.
- Prefer behavior-level assertions (`getByRole`, `findByText`) over structure (`container.querySelector`).
  - **Why:** structural assertions break on any layout refactor; role-based ones survive.
- No snapshot tests for interactive components — they rot fast and rubber-stamp regressions.

## What not to test

- Getters, setters, and thin delegations. Test the behavior they enable, not the wiring.
- Third-party library behavior (axum routing, sqlx query parsing). Trust the dep; test *your* composition of it.
