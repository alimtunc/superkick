---
name: ticket-execute
description: Operator-invoked. Execute a validated Superkick plan. Reads `.claude/plans/<TICKET>.md`, verifies alignment with current code, sets up the worktree if needed, implements criterion by criterion, emits a handoff. Never commits. Does not auto-invoke pre-pr-review.
---

# Ticket Execute — Superkick

Session 2 of the plan-then-execute path (or the implementation step of a one-shot).

## Preconditions

1. `.claude/plans/<TICKET>.md` exists and the operator has validated it (for the plan path). For one-shot, the skill inlines the mini-plan from the triage prompt.
2. **Never edits the root working copy.** Either:
   - Already inside a `.worktrees/<slug>/` path → proceed.
   - Invoked from the root → create a worktree at `.worktrees/sup-xxx-<slug>/` off `origin/main` on a new branch (name per `docs/conventions/workflow.md`), then `cd` into it.
3. **Worktree init**, per `docs/conventions/workflow.md`:
   - `cp examples/superkick.yaml superkick.yaml`
   - Copy `.env` from the root working copy into the worktree root.
   - `cd ui && pnpm install`

   If any source file is missing (`examples/superkick.yaml` absent, `.env` not in root), stop and ask the operator.

## Process

1. **Re-read the plan** from `.claude/plans/<TICKET>.md`.
2. **Verify alignment** with current code. If `main` has moved and the plan's assumed files/symbols no longer match, list the deltas and stop — let the operator decide whether to adjust the plan or proceed.
3. **Implement criterion by criterion**. For each acceptance criterion:
   - State the files touched in one line.
   - Apply the change.
   - Re-check the criterion is satisfied.
4. **Run `just check`** before the handoff. Fix anything that breaks.
5. **Emit the strict handoff** (format below). Stop. Do not commit, push, or invoke any follow-up skill.

## Handoff format (strict)

```
Ticket         : SUP-XXX
Worktree       : <absolute path>
Branche        : <name>
Fichiers modifiés :
  - path — <1-line summary>
Critères couverts    : [1, 2, 3]
Critères non couverts: [] (or reasons)
Tests manuels faits  : <list or "pending">
Blockers             : <list or "aucun">

Next steps (operator invokes):
 1. /test-instructions
 2. /pre-pr-review
 3. commit & /ship
```

## Hard constraints

- Never commits, pushes, creates a PR, or moves a Linear issue.
- Never invokes `pre-pr-review`, `ship`, or `test-instructions`.
- Reminders (already in `CLAUDE.md`, restated here because Opus 4.7 is literal): no `as T`, no `any`, no `cond && <X />` in JSX, no `forwardRef`, no `React.FC`, no `export default`, no `.unwrap()` / `panic!` in production paths, no `Co-Authored-By`, no `--no-verify`.
- MCP-agnostic: never hardcode an MCP server name.
