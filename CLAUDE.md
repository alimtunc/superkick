# Superkick — Development Rules

## Project

Local-first tool that turns Linear issues into reviewed PRs.
Rust workspace backend + React 19 dashboard UI.

## Stack

- **Backend**: Rust workspace (edition 2024, MSRV 1.85) — axum, tokio, sqlx/sqlite, serde, thiserror/anyhow
  - `superkick-api` — HTTP (axum). No business logic here.
  - `superkick-core` — Domain logic, run state machine, application services
  - `superkick-config` — Config parsing (superkick.yaml)
  - `superkick-runtime` — Async runtime, subprocess supervision, worktree lifecycle
  - `superkick-storage` — SQLite persistence, repository implementations
  - `superkick-integrations` — Linear/GitHub adapters (keep thin)
- **Frontend**: React 19 in `ui/` — Vite, Tailwind v4, TanStack (Router, Query, Form), zustand, shadcn/base-ui
- **No** Next.js, no server components, no react-router-dom

## Worktree initialization

After creating a git worktree for feature work, always run:

1. `cp examples/superkick.yaml superkick.yaml`
2. `cd ui && pnpm install`

This is a mandatory prerequisite before any other work in a worktree.

## Before you code

- Read the issue/spec fully before starting
- Run `just check` to confirm the workspace compiles
- Identify which crates/packages are impacted — stay within scope
- Do not commit unless explicitly asked

## Conventions

Follow these strictly during implementation AND review:
- Rust rules: `docs/conventions/rust.md`
- Frontend rules: `docs/conventions/frontend.md`

## Module boundaries (SOC)

- No business logic in `superkick-api` → must be in `superkick-core`
- No direct DB access in `superkick-core` → go through `superkick-storage`
- No circular dependencies between crates
- `superkick-integrations` adapts external systems to core interfaces — keep it thin

## Commands

| Action | Command |
|--------|---------|
| Compile check | `just check` |
| Format | `just fmt` |
| Lint | `just lint` |
| Dev (api + ui) | `just dev` |
| Build all | `just build` |

## Review skills

- `/pre-commit-review` — auto-fix + report before commit
- `/pre-pr-review` — full review before PR
- `/pr-description` — generate PR description
