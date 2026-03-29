# Launch Execution Context

This document describes the immediate execution context for the Launch phase.

## Goal of Launch

The Launch phase establishes the first credible end-to-end control-center loop inside Superkick for a single repo connected to Linear.

The product claim at the end of Launch should be:

`we can see Linear issues, inspect them in product, start a run from an issue, and see the result in the dashboard`

## What Launch proves

- the Linear-backed intake model is real
- issue detail is usable in-product
- the dashboard shell can host the product surfaces coherently
- `Start` from issue detail is a real product action
- issue and run context begin to connect in a trustworthy way

## What Launch does not finish

- full session recovery depth
- full attention and reliability depth
- full settings depth
- orchestrator intelligence
- desktop or multi-repo expansion

## Launch lanes

### Lane A — Linear Intake

- `[01] SUP-15` Linear issue list query and sync contract
- `[03] SUP-16` Issue detail model and API surface
- `[08] SUP-17` Issue comments and review context ingestion
- `[09] SUP-18` Linear status mapping and issue filters

### Lane B — App Shell

- `[02] SUP-23` App shell layout and sidebar navigation
- `[04] SUP-24` Top-level routes for product surfaces
- `[07] SUP-25` Issues and Runs page foundations
- `[10] SUP-26` Sessions, Attention, and Settings page foundations

### Lane C — Launch Flow

- `[05] SUP-19` Start run action from issue detail
- `[06] SUP-20` Duplicate active run guard for issue launches
- `[11] SUP-21` Run history and latest run card on issue
- `[12] SUP-22` Issue and run state synchronization rules

## Recommended execution order

### If there is one execution thread

1. `[01] SUP-15`
2. `[02] SUP-23`
3. `[03] SUP-16`
4. `[04] SUP-24`
5. `[05] SUP-19`
6. `[06] SUP-20`
7. `[07] SUP-25`
8. `[08] SUP-17`
9. `[09] SUP-18`
10. `[10] SUP-26`
11. `[11] SUP-21`
12. `[12] SUP-22`

### If there are two execution threads

Thread 1:

- `[01] SUP-15`
- `[03] SUP-16`
- `[08] SUP-17`
- `[09] SUP-18`

Thread 2:

- `[02] SUP-23`
- `[04] SUP-24`
- `[07] SUP-25`
- `[10] SUP-26`

Then converge on:

- `[05] SUP-19`
- `[06] SUP-20`
- `[11] SUP-21`
- `[12] SUP-22`

## Handoff rule for Claude

When executing a Launch ticket:

1. Read the ticket first.
2. If the issue is not fully self-sufficient, read `docs/product-context.md` and this file.
3. Restate the product goal of the ticket before planning technical work.
4. Produce a codebase-specific execution plan.
5. Implement without reopening product scope unless a real contradiction appears.

## Handoff rule for human review

When reviewing Claude output:

- reject plans that redesign the product scope of the ticket
- reject plans that drift toward backlog replacement inside Superkick
- prefer plans that preserve the single-repo, Linear-first, operator-controlled model
- prefer incremental delivery that makes the control center more real immediately
