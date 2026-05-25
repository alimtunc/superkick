# Orchestrator handoff — Superkick · Issue-centered v1

**From:** design
**To:** orchestrator
**Date:** 2026-05-25
**Status:** approved, ready to dispatch

## TL;DR

The implementation has drifted from the approved mockups on every surface
touched in this round (Issues list, Issue Detail, Run Drawer, Task Cockpit).
This folder is the implementation contract. **Hand it to every agent before
they touch a related file.** No more guessing from screenshots.

The headline gap: **ExecutionLog (the inline agent-status section on the
issue page) doesn't exist in code yet.** Building it is the unblock for
~60% of the rest.

## What's in this payload

Four documents + the archived source-of-truth artifacts. Read in this order:

```
1.  README.md                      orientation, decision log, source artifacts list
2.  SPEC.md                        THE spec. 22 sections, every component anatomy.
3.  COMPONENT_MAPPING.md           app surface → spec component → known drift signals
4.  PARITY_CHECKLIST.md            P0 / P1 / P2 confirmed drifts (with file:line)
5.  IMPLEMENTATION_EXTRAS.md       16 features the app has that the spec doesn't — hide list
6.  PARITY_CHECKLIST.v1.md         old heuristic version, kept for diff only — ignore at first read
```

The three approved HTML canvases (open in a browser to see the live target):

```
docs/design/issue-centered-v1/artifacts/issues-redesign-linear-like.html        A1 — list / hover / filter / kanban / list-mode detail
docs/design/issue-centered-v1/artifacts/task-and-run-rework.html                A2 — Task Cockpit + Now panel + Run Inspector
docs/design/issue-centered-v1/artifacts/issue-detail-with-execution-log.html    A3 — the current target (supersedes A1's detail)
```

A3 wins where A3 and A1 disagree (Tasks/Runs out of sidebar, ExecutionLog
inline, NeedsBanner on issue not in drawer).

## Decision logged this round

> When the implementation does something the spec doesn't cover, **the
> implementation hides the extra** — the spec doesn't absorb the addition.
> Hidden features are tracked in `IMPLEMENTATION_EXTRAS.md`, kept behind a
> default-off flag (or removed outright), and only graduate back into the UI
> once a future design round approves their anatomy.

This applies to: priority pills, "Ready / Dispatch" pills on kanban cards,
"Run" buttons on cards, "auto" tags, the terminal takeover modal in the
drawer, ChatDrawer on issue page, AttentionRequestPanel on run page, etc.
Full list in `IMPLEMENTATION_EXTRAS.md`.

## Suggested dispatch order

One PR per item, one agent per PR. Items 1–6 are unblocked today; items 7+
need a product call first.

| #  | Item                                                                   | File(s)                                                                                              | Size       |
|----|------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|------------|
| 1  | **Issue row geometry** (P0-02 / P0-03 / P0-06 / P0-12)                  | `components/issues/IssueRow.tsx`                                                                     | ~80 lines  |
| 2  | **Rail width + Status row + PropRow hit area** (P0-13 / P1-10 / P1-11)  | `components/issue-detail/IssueDetailRail.tsx`, `IssuePropertiesBlock.tsx`                            | ~50 lines  |
| 3  | **Remove Tasks tile from rail** (P0-07)                                 | `components/issue-detail/IssueDetailRail.tsx` + mark `ExecutionStatusCard.tsx` deprecated            | ~20 lines  |
| 4  | **Sidebar + ViewTabs polish** (P1-01 / P1-02)                          | `shell/Sidebar.tsx`, `components/issues/IssueViewTabs.tsx`                                            | ~40 lines  |
| 5  | **Implementation extras sweep (visual-only)** — EX-01 to EX-06, EX-10, EX-13, EX-16 | mainly `KanbanIssueCard.tsx`, `IssueGroupHeader.tsx`, `IssueViewTabs.tsx`, label maps           | ~120 lines |
| 6  | **Kanban regrouping by Linear status** (EX-15 / P1-30)                  | `components/issues/IssuesKanbanView.tsx`, `IssueGroupHeader.tsx`                                      | ~60 lines  |
| 7  | **ExecutionLog — the big one** (P0-08 / P0-09)                          | new dir `components/issue-detail/execution-log/**` + insertion into `IssueDetail.tsx`                 | ~600 lines (scaffold + visuals; data wiring follows) |
| 8  | **Drawer Terminal tab — hide takeover modal** (EX-09)                   | `RunDrawerTabs.tsx`, gate `TerminalTakeover` behind `FEATURES.drawerTerminalTakeover`                 | ~30 lines  |
| 9  | **Cockpit INTERVENE order + Open issue primary** (EX-14)                | `task-cockpit/TCNowPanel.tsx`                                                                        | ~30 lines  |
| 10 | **Tailwind tokens mirror the spec** (CW-01)                             | `tailwind.config.ts` add `spacing.sk-*` and `borderRadius.sk-*`                                       | ~30 lines  |
| 11 | **Visual-parity manifest wired to artifacts** (CW-03)                   | `ui/visual-parity/manifest.mjs` add one entry per spec artboard                                       | ~100 lines |

Items 7 and 11 take the longest. Item 7 should be one agent for the whole
component family (don't split `<PhaseStrip>` across PRs from different
agents); item 11 can run in parallel with 1–6.

## Items that need a product call before dispatch

These showed up during the audit; they are real product decisions, not
parity bugs. Don't dispatch until they're answered:

- **Q1 — Terminal takeover semantics.** EX-09. The build added explicit
  primary/takeover modes for the run terminal. Spec doesn't model this.
  → Either amend the spec to cover the feature, or keep it hidden.
  Recommended path: hide for v1, schedule a follow-up design round.
- **Q2 — Approve / Reject button placement.** P0-09 / EX-08. The build's
  current decision UI is `Retry` only, sometimes via `AttentionRequestPanel`.
  Spec wants Approve / Reject / Comment in `NeedsBanner` on the issue.
  → Confirm the operator flow is "operator approves on issue, retry happens
  inside the run", not "operator retries from run page".
- **Q3 — `/tasks/<id>` URL gating.** P1-29. Spec says debug-only
  (`?debug=task`). Implementation has it as a primary URL.
  → Confirm: gate or amend?
- **Q4 — Kanban "lifecycle bucket" vs "Linear status" grouping.** EX-15 /
  P1-30. Today's grouping (Open / Active / Launchable / Needs Human / Done)
  pre-dates the Linear-faithful redesign. Spec calls for Linear statuses
  with "Needs you" pinned.
  → Confirm the grouping change is on; if yes, both list and kanban regroup
  together.

## Rules of engagement for the agents

1. **Read the spec section cited in your PARITY_CHECKLIST item before opening
   the file.** Every drift item carries a §-reference; the §-reference
   carries the artboard reference; the artboard is the source of truth.
2. **Cite the artboard in your PR description.** Example: "matches A3 /
   `detail-running`". Reviewers compare against that artboard.
3. **One drift item per PR for P0s, batch by surface for P1s.** Easy to
   review, easy to revert.
4. **Don't invent fake data to make a layout look full.** If a field isn't
   wired up, file a D-XX data gap (see PARITY_CHECKLIST § "Data gaps") and
   render the affordance empty per spec (spacer, not "—").
5. **When the spec is unclear, ask before guessing.** Ping me with the
   §-reference. I'd rather amend the spec than discover guesswork in a PR.
6. **Don't unify the four TimelineEvent shapes into one polymorphic
   component.** See COMPONENT_MAPPING § "Two TimelineEvent components" —
   each variant has its own anatomy. Polymorphism here = drift later.

## Verification plan

- **Per PR:** reviewer opens the artboard cited in the description, eyeballs
  the diff.
- **Per surface:** when a surface is "done" (all related P0s + P1s + EX-* in
  scope cleared), run the visual-parity harness
  (`pnpm visual-parity capture <surface>`) and diff against the artboard.
- **End of round:** sweep the ❓ items in PARITY_CHECKLIST v2 (about 11 of
  them) — 90-min audit with spec + running app side by side.

## Open communication channel

Questions, ambiguities, "the spec says X but the data is Y" cases → loop
design back in. Don't paper over silently; we'll either fix the spec or fix
the implementation, but the contract has to stay clean.

— Léa, design
