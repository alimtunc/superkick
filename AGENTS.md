# Superkick — Agent Instructions

## Project

Local-first tool: Linear issue → local run → playbook → review swarm → PR.
Rust workspace backend + React 19 dashboard UI.

## Stack

- **Backend**: Rust workspace (edition 2024, MSRV 1.85) — axum, tokio, sqlx/sqlite
  - Crates: superkick-api, superkick-core, superkick-config, superkick-runtime, superkick-storage, superkick-integrations
- **Frontend**: React 19 in `ui/` — Vite, Tailwind v4, TanStack (Router, Query, Form), zustand, shadcn/base-ui
- **No** Next.js, no server components, no react-router-dom

## Before you code

- Read the issue/spec fully before starting
- Run `just check` to confirm the workspace compiles
- Stay within scope of the impacted crates/packages

## Conventions

- Rust: `docs/conventions/rust.md`
- Frontend: `docs/conventions/frontend.md`

## Module boundaries

- No business logic in `superkick-api` → `superkick-core`
- No direct DB in `superkick-core` → `superkick-storage`
- No circular dependencies between crates
- `superkick-integrations` stays thin

## Review process

When asked to review code (full app or specific files):

1. Read `docs/conventions/rust.md` and `docs/conventions/frontend.md`
2. Identify files to review:
   - Full review: all `.rs` files in `crates/` + all `.ts`/`.tsx` files in `ui/src/`
   - Branch review: `git diff main --name-only`
3. For each file, check against conventions and module boundaries above
4. Report issues — do NOT auto-fix unless explicitly asked

Output format:

```
## Critical issues (X)
- [file:line] - **[Category]** Description → Fix

## Suggested improvements (X)
- [file:line] - **[Category]** Description → Fix

## Positive points
- Concise list
```

Categories: `Error Handling`, `Ownership`, `Async`, `API Design`, `SQL`, `Clean Code`, `DRY`, `SOC`, `React 19`, `Composition`, `Tailwind`.

## Commands

| Action | Command |
|--------|---------|
| Compile check | `just check` |
| Format | `just fmt` |
| Lint | `just lint` |
| Dev | `just dev` |
| Build | `just build` |
