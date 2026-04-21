# Superkick — Agent Instructions

Local-first tool: Linear issue → worktree → playbook → review swarm → PR.
Rust workspace backend + React 19 dashboard UI.

The source of truth for this repository is [`CLAUDE.md`](./CLAUDE.md) and the
`docs/conventions/` files it points to. This file exists for agents (Codex,
Cursor, Gemini…) that read `AGENTS.md` by convention — its contents are a
subset of `CLAUDE.md`, kept minimal to avoid drift.

**Codex-specific:** see [`docs/codex-workflow.md`](./docs/codex-workflow.md) for the Codex ↔ Claude ticket-dispatch contract (thin orchestrator role, `Invoke ticket-triage on SUP-XXX` handoff, invariants).

## Conventions — read before editing

- **Rust** — `docs/conventions/rust.md`
- **Frontend** — `docs/conventions/frontend.md`
- **Testing** — `docs/conventions/testing.md`
- **Workflow** (branches, commits, Linear, PRs) — `docs/conventions/workflow.md`

Each rule carries its rationale; apply them with judgment at the edges.

## Write-time defaults

See `CLAUDE.md § Write-time defaults` — the ten highest-leverage rules.

## Stack

- **Backend**: Rust workspace (edition 2024, MSRV 1.85) — axum, tokio, sqlx/sqlite, thiserror, anyhow. Crates: `superkick-api`, `superkick-core`, `superkick-config`, `superkick-runtime`, `superkick-storage`, `superkick-integrations`.
- **Frontend**: React 19 in `ui/` — Vite, Tailwind v4, TanStack, zustand, shadcn / base-ui.

## Commands

`just check` · `just fmt` · `just lint` · `just dev` · `just build`
