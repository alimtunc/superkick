---
name: ticket-execute
description: Implements a validated Superkick plan. Called by ticket-triage for the one-shot path (with an inline mini-plan), auto-chained from ticket-plan for small plans, or invoked directly by the operator in a fresh session to resume a plan written previously. Reads `.claude/plans/<TICKET>.md` (or an inline mini-plan), verifies alignment with current code, sets up the worktree if needed, implements criterion by criterion, emits a handoff. Never commits. Does not auto-invoke pre-pr-review.
---

# Ticket Execute — Superkick

Implementation skill. Entered three ways:
- `ticket-triage` → `ticket-execute` (one-shot path, mini-plan passed inline).
- `ticket-plan` → `ticket-execute` (plan-then-execute auto-chain when the plan is small enough — see ticket-plan's auto-chain criteria).
- Operator → `ticket-execute` directly in a fresh session, typically to resume a plan written in an earlier session.

## Preconditions

1. Either `.claude/plans/<TICKET>.md` exists (plan-then-execute path) **or** a mini-plan was passed inline by `ticket-triage` (one-shot path). If neither, ask the operator.

2. **Worktree is mandatory — create it before touching any file.** This is a hard precondition. If you edit the root working copy the change won't land on the feature branch and the operator won't see it in source control. No exception.

   - If the current working directory is already inside `.worktrees/<slug>/` → skip to step 3.
   - Otherwise, run these two commands literally (substituting `<slug>` and `<branch>`):

     ```bash
     git worktree add .worktrees/<slug> -b <branch>
     cd .worktrees/<slug>
     ```

     - `<slug>` convention: `sup-xxx-<kebab-short-title>` for Linear tickets, `<kebab-short-title>` for free-form work.
     - `<branch>` per `docs/conventions/workflow.md`.
     - Before any further tool call, verify with `pwd` that the path contains `.worktrees/<slug>/`. If not, stop.
     - Never use `Edit`/`Write` on a path that doesn't start with the worktree root. Grep/Read against the parent repo is fine; edits are not.

3. **Worktree init**, per `docs/conventions/workflow.md` — run before any code change:
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

- **No edit to the root working copy.** Every file write must happen inside the worktree directory created in preconditions step 2. If `git worktree add` was not run, do not edit anything — go back to step 2.
- Never commits, pushes, creates a PR, or moves a Linear issue.
- Never invokes `pre-pr-review`, `ship`, or `test-instructions`.
- Reminders (already in `CLAUDE.md`, restated here because Opus 4.7 is literal): no `as T`, no `any`, no `cond && <X />` in JSX, no `forwardRef`, no `React.FC`, no `export default`, no `.unwrap()` / `panic!` in production paths, no `Co-Authored-By`, no `--no-verify`.
- MCP-agnostic: never hardcode an MCP server name.
