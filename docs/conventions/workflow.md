# Workflow Conventions — Superkick

Operational rules for contributors (human or agent). Applies to every session.

## Ticket lifecycle

Superkick tickets go through an explicit lifecycle, operator-driven at every step:

1. **Codex** picks the next ticket with the operator.
2. Operator runs `/ticket-triage` in Claude — Claude fetches the issue and emits a next-step prompt.
3. Depending on the path, operator runs `/ticket-plan` (non-trivial or cross-stack) or goes directly to `/ticket-execute` (one-shot).
4. `/ticket-execute` runs in a worktree (see "Worktree initialization" below), stops at the handoff.
5. Operator runs `/test-instructions`, `/pre-pr-review`, commits, then `/ship`.

No skill auto-chains. See [docs/codex-workflow.md](../codex-workflow.md) for the Codex ↔ Claude contract and [the ticket skills](../../.claude/skills/) for details.

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

## Pre-PR review

- `/pre-pr-review` — auto-fix DRY/SOC + two parallel reviews (Rust + frontend) before opening a PR. User-invoked; Claude never triggers it automatically.

## Hooks

- `lefthook pre-commit` runs `rustfmt --check`, `clippy -D warnings`, `oxlint`, `oxfmt`, and `tsc --noEmit`.
- Claude Code blocks `Edit`/`Write` on any `.env*` file (sensitive data guard).
