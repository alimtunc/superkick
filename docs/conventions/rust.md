# Rust Conventions — Superkick

Source of truth for Rust code in the Superkick workspace.
Applies during implementation and review.

## Module boundaries

- `superkick-api` holds no business logic — handlers are thin adapters to `superkick-core`.
- `superkick-core` holds no direct DB access — goes through `superkick-storage` repositories.
- `superkick-integrations` stays thin — it adapts Linear/GitHub to core interfaces, nothing else.
- No circular dependencies between crates.

**Why:** the run state machine is in core; when logic leaks into the HTTP or DB layer it becomes untestable without spinning up axum + sqlite, and a retry/replay of the same domain action produces different outcomes depending on the entry point.

## Error handling

- `anyhow::Result` in applications (bin crates, runtime wiring), `thiserror` for domain/library errors in `superkick-core` and `superkick-storage`.
  - **Why:** `anyhow` erases the error type (fine at the edge), `thiserror` keeps it typed so callers can `match` on failure modes.
- Propagate with `?` and add context: `.context("loading run")` or `.with_context(|| format!("run {id}"))`.
  - **Why:** without context, an error surfacing in the UI reads "no such file or directory" with zero trail. Context chains turn that into an actionable breadcrumb.
- **No `.unwrap()` or `panic!` in production paths.** `.expect("bug: …")` only for invariants that would indicate a programming error.
  - **Why:** a panic in a tokio task crashes the whole supervisor; the operator sees the run vanish with no state update.
- Exhaustive `match` on `Result`/`Option` — no catch-all `_ => ()` for error arms.

## Error → HTTP mapping

- Domain errors in `superkick-core` implement `thiserror::Error` and carry a stable variant name.
- `superkick-api` has a single `AppError` enum that wraps domain errors and implements `IntoResponse`. Map variants to status codes in one place, not per-handler.
  - **Why:** per-handler mapping drifts — the same "not found" becomes 404 in one route and 500 in another. Centralising the mapping keeps the HTTP contract consistent.
- Never return raw `anyhow::Error` from a handler — always wrap it so the body is sanitised (no internal paths, no SQL fragments).

## Ownership & borrowing

- Prefer `&str` over `String`, `&[T]` over `&Vec<T>` in function signatures when the callee does not need to own the data.
  - **Why:** forces a `.clone()` at the callsite only when ownership is actually needed, and accepts more input shapes.
- Avoid unnecessary `.clone()` — check if a reference or a move suffices.
- Explicit lifetime annotations only when the compiler cannot infer them. Lifetime elision is preferred.

## Async patterns (tokio)

- No `.block_on()` inside async code.
- `tokio::spawn` for independent concurrent tasks; prefer structured concurrency (`tokio::join!`, `futures::try_join_all`) when tasks are related.
- Use `tokio::sync::Mutex`, not `std::sync::Mutex`, when the lock is held across an `.await` point.
  - **Why:** a `std::sync::Mutex` held across `.await` blocks the whole runtime thread — one slow future freezes the executor.
- Avoid `.await` in tight loops — batch with `futures::join_all` or `stream::buffer_unordered`.

## API (axum)

- Handlers return `Result<impl IntoResponse, AppError>` — never `impl IntoResponse` alone.
- Extractor order matters: `Path` before `Query` before `State`/`Extension` before `Json`/`Body` (body extractors consume the request).
- Shared state via `State<Arc<…>>` or `Extension`. No globals, no `OnceCell` in application code.

## SQL (sqlx)

- Use typed macros (`query!`, `query_as!`) when the query is static. Dynamic queries go through `QueryBuilder` with bound parameters.
- **Never** format SQL strings with user input. Bind parameters always.
  - **Why:** SQL injection, obviously, but also sqlx's compile-time verification only fires on macros.
- Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, guarded alterations).

## Clean code

- Functions split when they juggle multiple concerns — not at a line count. A 60-line function doing one thing is fine; a 15-line function doing three is not.
- No unused imports, no dead or commented-out code. Delete it; git remembers.
- `snake_case` for items, `SCREAMING_SNAKE_CASE` for consts, `CamelCase` for types. (Clippy enforces this with `-D warnings`.)
- Descriptive names: `issue`, not `i`; `label`, not `l`. Single-letter names are fine only for generic type parameters (`T`, `K`, `V`) and tight iterator closures (`.map(|x| x + 1)`).
- Prefer iterator chains (`.map`, `.filter`, `.collect`) when they read more clearly than a manual loop. Don't force them onto imperative logic that has early returns or mutable accumulators.
- `#[must_use]` on functions whose return value carries meaning the caller must handle (new handles, builders, `Result` wrappers).
- Derive the standard traits when appropriate (`Debug`, `Clone`, `PartialEq`, `Eq`, `Hash`) — but skip `Clone` on types that should not be copied (DB handles, file locks).

## DRY

- Shared logic across crates → extract. Shared *shape* that happens to look alike → leave it; convergence is not duplication.
- Utility code lives in the crate whose domain it belongs to: domain types in `superkick-core`, process/worktree helpers in `superkick-runtime`, adapters in `superkick-integrations`.
