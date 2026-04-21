# Superkick — Instructions

Local-first tool: Linear issue → worktree → playbook → review swarm → PR.
Rust workspace backend + React 19 dashboard UI.

## Stack

- **Backend**: Rust workspace (edition 2024, MSRV 1.85) — axum, tokio, sqlx/sqlite, serde, thiserror, anyhow.
  Crates: `superkick-api`, `superkick-core`, `superkick-config`, `superkick-runtime`, `superkick-storage`, `superkick-integrations`.
- **Frontend**: React 19 in `ui/` — Vite, Tailwind v4, TanStack (Router, Query, Form), zustand, shadcn / base-ui.
- **No** Next.js, no server components, no react-router-dom.

## Conventions (read these before editing)

- **Rust** — `docs/conventions/rust.md`
- **Frontend** — `docs/conventions/frontend.md`
- **Testing** — `docs/conventions/testing.md`
- **Workflow** (branches, commits, Linear, PRs) — `docs/conventions/workflow.md`

These are the source of truth. Every rule carries its rationale so edge cases can be reasoned about.

## Write-time defaults

The highest-leverage rules — violate these and the cost to rattrape is real. Full context in the convention files above.

1. **Module boundaries.** No business logic in `superkick-api`. No direct DB in `superkick-core`. `superkick-integrations` stays thin.
2. **No `.unwrap()` / `panic!`** in production paths. Use `Result` + `?` + `.context()`. A panic kills the run supervisor silently.
3. **`thiserror` for domain errors, `anyhow` at the edge.** HTTP mapping lives in one place (`AppError` in `superkick-api`), not per-handler.
4. **React 19 bans: `forwardRef`, `React.FC`, `JSX.Element`, `defaultProps`.** Ref is a standard prop; use typed functions and `ReactNode`.
5. **Conditional rendering:** `cond ? <X /> : null`. Never `cond && <X />` (falsy values render as `0` / `""`).
6. **Named exports only.** No `export default`. One component per file.
7. **Shared types in `ui/src/types/**`** via barrel import. Colocate only `*Props` and hook return types.
8. **No `any`.** Use `unknown` and narrow at boundaries.
9. **Integration tests hit a real SQLite.** Never mock the storage layer — mocked migrations have lied to us before.
10. **Never commit unless asked. Never on `main`. Never with `Co-Authored-By` or `--no-verify`.**

## Before you code

- Read the issue fully. Stay within the impacted crates/packages.
- Run `just check` to confirm the workspace is green before changing anything.
- Work on a branch or a `.worktrees/<slug>/` — never on `main`. See `docs/conventions/workflow.md` for the init checklist.

## Commands

| Action | Command |
|---|---|
| Compile check | `just check` |
| Format | `just fmt` |
| Lint | `just lint` |
| Dev (api + ui) | `just dev` |
| Build all | `just build` |

## User-invoked review skills

These do not fire on their own — the operator runs them:

### Ticket lifecycle

- `/ticket-triage` — route a Linear ticket to one-shot / plan-then-execute / split-first. Emits a next-step prompt. See [docs/codex-workflow.md](docs/codex-workflow.md).
- `/ticket-plan` — write `.claude/plans/<TICKET>.md` for operator validation. No code changes.
- `/ticket-execute` — implement a validated plan in a worktree. Never commits.

### Review & ship

- `/pre-pr-review` — auto-fix DRY/SOC + full Rust + frontend review in parallel, before opening a PR.
- `/pr-description` — generate a PR body from the branch diff.
- `/test-instructions` — emit a copy-pasteable test checklist after finishing an issue.
- `/ship` — commit + PR + Linear "Done" in one shot (after the operator has verified manually).

Quality is produced at write-time by following the conventions above. Review skills are a safety net, not the teaching mechanism.
