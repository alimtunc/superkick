# Superkick — Codex Instructions

## Project Stack

- **Backend**: Rust workspace (edition 2024, MSRV 1.85)
  - `superkick-api` — HTTP API (axum)
  - `superkick-core` — Domain logic
  - `superkick-config` — Configuration parsing
  - `superkick-runtime` — Async runtime (tokio)
  - `superkick-storage` — Persistence (sqlx/sqlite)
  - `superkick-integrations` — External integrations
- **Frontend**: React 19 UI in `ui/` (Vite, Tailwind v4, react-router-dom)
- **No** Next.js, no server components

## Commands

When the user says `pre-pr-review`, follow the Pre-PR Review process below.
When the user says `pre-commit-review`, follow the Pre-Commit Review process below.
When the user says `pr-description`, follow the PR Description process below.

---

## Pre-PR Review

Review all files modified compared to `main` branch. Report issues — do NOT auto-fix.

### Step 1 — Identify modified files

```bash
git diff main --name-only
```

Separate Rust files (`*.rs`, `Cargo.toml`) from frontend files (`ui/**`).

### Step 2 — Rust Review (if .rs files changed)

Review modified Rust files against these rules:

**Error Handling:**
- `anyhow::Result` for application functions, `thiserror` for domain errors
- No `.unwrap()` in production code (tests only)
- No `panic!` in production — use `Result`
- Errors must propagate with `?` and have context (`.context()` or `.with_context()`)
- Exhaustive `match` on `Result`/`Option`

**Ownership & Borrowing:**
- Prefer `&str` over `String` in function signatures when ownership is not needed
- Avoid unnecessary `.clone()` — check if a reference suffices
- Explicit lifetime annotations when the compiler cannot infer

**Async Patterns (tokio):**
- No `.block_on()` in async code
- Use `tokio::spawn` for independent concurrent tasks
- Use `tokio::sync::Mutex` for async code, not `std::sync::Mutex`
- Avoid `.await` in tight loops — prefer `futures::join_all` or `tokio::join!`

**API (axum):**
- Handlers must return `Result` types with `IntoResponse`
- Extractors ordered correctly (`Path` before `Body`)
- Shared state via `Extension` or `State`, no globals

**SQL (sqlx):**
- Use typed query macros (`query!`, `query_as!`) when possible
- No SQL string formatting — always use bound parameters
- Migrations must be idempotent

**Clean Code:**
- Functions > 30 lines → suggest split
- Modules > 300 lines → suggest split into submodules
- Unused imports → report
- Dead/commented code → report
- Non-idiomatic names (camelCase instead of snake_case) → report
- Prefer iterators (`.map`, `.filter`, `.collect`) over manual `for` loops when appropriate
- Use `#[must_use]` for functions whose result should not be ignored
- Derive standard traits when appropriate (`Debug`, `Clone`, `PartialEq`)

**DRY:**
- Duplicated logic across crates → identify and suggest extraction
- Similar types/structs → unify or use generics
- Utility code → should be in the right crate (core for domain, runtime for infra)

**SOC (Separation of Concerns):**
- No business logic in `superkick-api` → must be in `superkick-core`
- No direct DB access in `superkick-core` → go through `superkick-storage`
- No circular dependencies between crates

### Step 3 — Frontend Review (if ui/ files changed)

Review modified frontend files against these rules:

**React 19:**
- `forwardRef` is BANNED → ref is a standard prop
- `React.FC` / `React.FunctionComponent` are BANNED → use typed functions directly
- `JSX.Element` → use `ReactNode` for rendered props
- `defaultProps` is BANNED → use ES6 default values
- Prefer `use(MyContext)` over `useContext(MyContext)` for new components

**Clean Code:**
- Named exports only — no `export default`
- Conditional rendering: ternary `condition ? <X /> : null`, NEVER `condition && <X />`
- Empty returns: `return null`, NEVER `return <></>`
- Unused imports → report
- Dead/commented code → report
- `any` types → report with precise type suggestion
- Components > 150 lines → suggest split

**DRY/SOC:**
- Duplicated logic → suggest extraction into a hook or utility
- Business logic in components → must be in hooks
- No direct fetch — use separate API functions

**Tailwind v4:**
- No custom CSS classes if a Tailwind utility exists
- Consistent responsive design

### Step 4 — Output format

```markdown
# Pre-PR Review — Superkick

## Critical issues (X)

- [file:line] - **[Category]** Description → Fix

## Suggested improvements (X)

- [file:line] - **[Category]** Description → Fix

## Positive points

- Concise list

---

PR ready
OR
X critical issues to fix before PR
X improvements to consider
```

Categories: `Error Handling`, `Ownership`, `Async`, `API Design`, `SQL`, `Clean Code`, `DRY`, `SOC`, `React 19`, `Composition`, `Bundle`, `Tailwind`.

---

## Pre-Commit Review

Review modified and staged files. Auto-fix what can be fixed, report the rest.

### Step 1 — Identify modified files

```bash
git diff --name-only && git diff --cached --name-only
```

### Step 2 — Review and auto-fix

**Auto-fix immediately:**
- Remove unused imports (Rust + TS)
- Remove dead/commented code
- Replace `any` with precise types (if obvious)
- Remove `forwardRef` → refactor to ref-as-prop
- Remove `React.FC` → typed function
- Replace `JSX.Element` → `ReactNode`

**Report only (do not auto-fix):**

For Rust files:
- `.unwrap()` in production code
- Non-idiomatic names
- Functions > 30 lines
- Duplicated logic across crates
- Business logic in wrong crate (SOC violations)

For frontend files:
- `any` types that need context to fix
- Components > 150 lines
- Business logic in components
- Duplicated logic

### Step 3 — Output format

```markdown
## Auto-fixes applied (X)

- [file:line] - What was fixed

## Suggested refactoring (X)

- [file:line] - **Issue** → Suggested fix

## Positive points

- Concise list

---

Code validated
OR
X suggested refactorings to consider
```

---

## PR Description

Generate a short, concise PR description in English.

### Step 1 — Analyze

```bash
git log origin/main..HEAD --oneline
git diff origin/main...HEAD --stat
git diff origin/main...HEAD
```

### Step 2 — Generate

Rules:
- Ultra-concise: 1-2 sentences max for "What", 3-5 bullet points max for "Changes"
- Focus on what actually changed, not implementation details
- List relevant test scenarios
- Format for direct copy-paste into GitHub/Linear

Template:

```markdown
## What

[1-2 sentence description of the feature or fix]

## Changes

- [Main change 1]
- [Main change 2]
- [Main change 3]

## Tests

- [ ] [Test scenario 1]
- [ ] [Test scenario 2]
- [ ] [Test scenario 3]
```
