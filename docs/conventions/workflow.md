# Workflow Conventions — Superkick

Operational rules for contributors (human or agent). Applies to every session.

## Worktree initialization

Feature work happens in a git worktree under `.worktrees/`, never on `main`.

After creating a worktree, run these three steps **before** any code change:

1. `cp examples/superkick.yaml superkick.yaml`
2. Copy `.env` from the main worktree root
3. `cd ui && pnpm install`

**Why:** the `superkick` CLI fails to start without `superkick.yaml` and `.env`, and the UI workspace needs its own `node_modules` (pnpm is not hoisted across worktrees).

## Linear status

- Move the issue to **In Progress** when starting implementation — use `mcp__linear-superkick__save_issue`.
- **Do not** move it to Done — the operator controls that state, typically after manual verification.

## Commits

- **Never commit on `main`.** Always work on a branch or worktree.
- **Do not commit unless the user explicitly asks.** A passing `just check` is not an invitation to commit.
- **Never** add `Co-Authored-By`, `Generated with Claude`, or any AI credit line.
- **Never** pass `--no-verify`, `--no-gpg-sign`, or any hook-skipping flag. If a hook fails, fix the underlying issue.
- Create new commits rather than amending — `--amend` after a hook failure modifies the *previous* commit.
- Commit messages: lowercase, imperative, match the style of `git log --oneline -10`.

## Pull requests

- One PR per Linear issue. Title under 70 chars. Body: `## Summary` (1–3 bullets) + `## Test plan` (checklist).
- Use `/pr-description` to draft the body from the branch diff.
- After merging, close the Linear issue manually (again: operator controls "Done").

## Pre-commit / pre-PR review

- `/pre-commit-review` — review + auto-fix for the small stuff, before you commit.
- `/pre-pr-review` — two parallel reviews (Rust + frontend) before opening a PR.
- Both are **user-invoked** — Claude does not trigger them automatically.

## Hooks

- `lefthook pre-commit` runs `rustfmt --check`, `clippy -D warnings`, `oxlint`, `oxfmt`, and `tsc --noEmit`.
- Claude Code blocks `Edit`/`Write` on any `.env*` file (sensitive data guard).
