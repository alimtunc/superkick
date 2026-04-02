# Rust Conventions — Superkick

Source of truth for Rust code in the Superkick workspace.
Applies during implementation and review.

## Error Handling

- `anyhow::Result` for application functions, `thiserror` for domain errors
- No `.unwrap()` in production code (tests only)
- No `panic!` in production — use `Result`
- Propagate with `?` and add context (`.context()` or `.with_context()`)
- Exhaustive `match` on `Result`/`Option`

## Ownership & Borrowing

- Prefer `&str` over `String` in function signatures when ownership is not needed
- Avoid unnecessary `.clone()` — check if a reference suffices
- Explicit lifetime annotations when the compiler cannot infer

## Async Patterns (tokio)

- No `.block_on()` in async code
- `tokio::spawn` for independent concurrent tasks
- `tokio::sync::Mutex` for async code, not `std::sync::Mutex`
- Avoid `.await` in tight loops — prefer `futures::join_all` or `tokio::join!`

## API (axum)

- Handlers return `Result` types with `IntoResponse`
- Extractors ordered correctly (`Path` before `Body`)
- Shared state via `Extension` or `State`, no globals

## SQL (sqlx)

- Use typed query macros (`query!`, `query_as!`) when possible
- No SQL string formatting — always use bound parameters
- Migrations must be idempotent

## Clean Code

- Functions > 30 lines → split
- Modules > 300 lines → split into submodules
- No unused imports
- No dead/commented code
- snake_case naming (no camelCase)
- Descriptive variable names — no single-letter names (use `issue` not `i`, `label` not `l`)
- Prefer iterators (`.map`, `.filter`, `.collect`) over manual `for` loops when appropriate
- `#[must_use]` for functions whose result should not be ignored
- Derive standard traits when appropriate (`Debug`, `Clone`, `PartialEq`)

## DRY

- Duplicated logic across crates → extract
- Similar types/structs → unify or use generics
- Utility code in the right crate (core for domain, runtime for infra)
