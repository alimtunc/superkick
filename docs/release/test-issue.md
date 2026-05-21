# V1 Canonical Test Issue

The single Linear issue the operator pastes into Linear before running the
V1 release validation by hand. Pairs with the Rust fixture at
[`crates/superkick-runtime/tests/fixtures/canonical_issue.rs`](../../crates/superkick-runtime/tests/fixtures/canonical_issue.rs).
**If you change one, change the other in the same PR** — the harness asserts
on the Rust fixture's shape, but the manual checklist asks the operator to
launch this template.

## Why a canonical issue

The release-validation harness needs *one* issue it can drive through the
full V1 recipe (Plan → Implement → Review) without ambiguity. A
deliberately small, deterministic ask lets the assertions sit on structural
events (a `StepFinished` for each kind, ≥1 modified file after Implement, a
non-empty `summary` per step) rather than on text content — real agents
produce varying output and asserting on prose is flaky.

## How to use it

1. **Automated.** The harness loads the equivalent Rust fixture; no Linear
   call. Run via `just release-check`.
2. **Manual UI walkthrough.** Open Linear, create a new issue with the
   title and body below, move it to **In Progress**. Open the Superkick
   dashboard and confirm:
   - The issue appears in the issues panel.
   - "Launch Task" opens the create modal pre-filled with the three V1
     roles.
   - Submitting launches Plan → Implement → Review, with the feed updating
     without manual refresh.
   - The implement step modifies at least one file in the worktree.
   - The review step posts a summary on the feed.

The manual walkthrough is part of [checklist.md](./checklist.md);
this file owns just the pasteable template.

---

## Title

```
Add a pub fn hello() -> &'static str
```

## Description

```markdown
## Goal

Add a tiny, deterministic Rust function to the canonical-test-issue repo so
the V1 launch-task recipe has something predictable to plan, implement, and
review.

## Task

1. Edit `src/lib.rs` in the worktree.
2. Add `pub fn hello() -> &'static str { "world" }` at the bottom of the
   file.
3. Do not introduce other changes.

## Acceptance

- The file diff contains exactly one added function.
- The plan summarises the change in one sentence.
- The review confirms the diff matches the task description.
```

## Expected outcome

After Launch Task finishes:

- Status: **Completed** (green chip on the task header).
- Plan, Implement, Review each show a one-line summary in the feed.
- `git diff` in the worktree shows exactly one added function in
  `src/lib.rs`.
- No `NeedsHuman` chip on any step.
