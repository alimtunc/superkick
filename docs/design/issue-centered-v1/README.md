# Issue-centered V1 — Design Handoff

This folder is the **frozen source of truth** for the Issue-centered V1 UI work
(parent epic [SUP-125]). Coding agents implementing follow-up tickets must read
this file before touching any UI route.

The three Claude Design HTML artifacts in [`artifacts/`](artifacts/) are
**reference assets**, not a spec. They contain many artboards — only the ones
listed under [Use these artboards](#use-these-artboards) are approved. Anything
not listed here is either out of scope or explicitly excluded.

> No production UI changes belong on this branch. This is a docs-only handoff.

## Archive index

| File | Subject | Authoritative for |
|---|---|---|
| [`artifacts/issues-redesign-linear-like.html`](artifacts/issues-redesign-linear-like.html) | `/issues` list + kanban + Issue Detail | List, kanban, **and Issue Detail page** |
| [`artifacts/task-and-run-rework.html`](artifacts/task-and-run-rework.html) | `/tasks/:id` cockpit + `/runs/:id` detail | Task Cockpit and Run Detail screens |
| [`artifacts/issue-detail-with-execution-log.html`](artifacts/issue-detail-with-execution-log.html) | Issue Detail with Execution log drawer | **Drawer pattern only** — not the Issue Detail page itself |

The original filenames in `~/Downloads` were:

- `Issues redesign Linear-like _standalone_ (1).html`
- `Task and Run rework _standalone_.html`
- `Issue Detail with Execution log _standalone_.html`

Renamed on commit to slug-form to keep paths shell-friendly. Hashes are stable
once landed — do **not** edit the archived HTML; replace the whole file via a
new handoff branch if Design ships a new revision.

## Use these artboards

Route-by-route lock. Numbers in parentheses are the operator's artboard
numbering from the rendered HTML grid (count top-to-bottom). The `id="…"`
tokens are the literal `<Artboard id>` strings inside each file so a coding
agent can `grep` them.

### `/issues` — list view

**File:** [`artifacts/issues-redesign-linear-like.html`](artifacts/issues-redesign-linear-like.html)

**Approved artboards (02–06 in the rendered grid):**

- `list-default-dark`, `list-default-light` — default list rows, density, status pills
- `hover-dark`, `hover-light` — row hover, quick-action affordances
- `filter-dark`, `filter-light` — filter dropdown anatomy
- `empty-dark`, `empty-light` — empty state
- `loading-dark` — skeleton/loading state
- `shipped-dark`, `shipped-light` — shipped/archived rows

Dark mode is the implementation baseline. Light artboards are reference only
unless the route already supports light mode in production.

### `/issues` — kanban view

**File:** [`artifacts/issues-redesign-linear-like.html`](artifacts/issues-redesign-linear-like.html)

**Approved artboard (08 in the rendered grid):**

- `kanban-dark`, `kanban-light` — column layout, card density
- `kanban-drag` — drag ghost + drop tint behaviour

### `/issues/:id` — Issue Detail page

**File:** [`artifacts/issues-redesign-linear-like.html`](artifacts/issues-redesign-linear-like.html) — **this file**, not the execution-log one.

**Approved artboard (07 in the rendered grid) as the visual baseline:**

- `detail-idle` — no task running
- `detail-light` — task in flight, light theme
- `detail-running` — task in flight, dark theme
- `detail-diff` — what-changes panel

The Issue Detail page **stays inside the Issues HTML's artboard 07 visual
language**. The execution-log file's full-page issue mockups
(`issue-running`, `issue-needs`, `issue-done`, `issue-light`) are **not** the
baseline — see [Do not implement](#do-not-implement-as-is).

### `/tasks/:id` — Task Cockpit

**File:** [`artifacts/task-and-run-rework.html`](artifacts/task-and-run-rework.html)

**Approved artboards:**

- `cockpit-running` — running state
- `cockpit-needs` — needs-human state
- `cockpit-done` — completed state

### `/runs/:id` — Run Detail (simplified)

**File:** [`artifacts/task-and-run-rework.html`](artifacts/task-and-run-rework.html)

**Approved artboards:**

- `run-running`, `run-needs`, `run-done` — simplified Run Detail across states

`split-closed` and `split-open` show the same layout with a side drawer
collapsed/open; reuse only as cross-reference for the drawer (see below).

### Execution-log drawer (compact)

**File:** [`artifacts/issue-detail-with-execution-log.html`](artifacts/issue-detail-with-execution-log.html)

**Approved artboards — drawer only:**

- `drawer-activity` — Activity tab (running)
- `drawer-done` — Activity tab (completed run)
- `drawer-tools` — Tools tab (tool calls, expandable, copiable)
- `drawer-files` — Files tab (diff preview)
- `drawer-logs` — Logs tab (raw stdout/stderr)
- `drawer-terminal` — Terminal tab (sandbox shell)

Tab order is fixed: **Activity / Tools / Files / Logs / Terminal**.

The drawer is a **compact overlay** on top of Issue Detail (or Task Cockpit /
Run Detail). It is not a separate route.

## Adapt — patterns to lift, not pixel-copy

These are useful conventions in the artifacts that should inform implementation
but **must be adapted** to our actual data shape and existing tokens:

- **Visual baseline (typography, spacing, color tokens).** Inherit from the
  Issues HTML's Linear-faithful pass. Where it diverges from
  [`docs/conventions/visual-design.md`](../../conventions/visual-design.md),
  the conventions file wins.
- **Status pill / priority chip vocabulary** from the list artboards. Map to
  our existing issue status enum, do not invent new statuses.
- **Drawer entry/exit behaviour and tab anatomy** from the execution-log
  drawer artboards. Implementation lives wherever Issue Detail / Task Cockpit
  needs it.
- **Run-state transitions** (running → needs human → done) from the
  `cockpit-*` and `run-*` artboards. Use as visual reference; the actual state
  machine is owned by `superkick-runtime`.

## Do not implement as-is

These are explicit non-goals. A coding agent that implements any of these is
off-spec.

- ❌ **Do not** use `artifacts/issue-detail-with-execution-log.html` as the
  Issue Detail **page** baseline. Its `issue-running`, `issue-needs`,
  `issue-done`, `issue-light`, `issue-drawer-running`, `issue-drawer-needs`,
  `nav-memo`, `nav-memo-light` artboards are **reference for the drawer
  overlay only**.
- ❌ **Do not** replace the Issue Detail artboard 07 (the `detail-*` artboards
  in the Issues HTML) with anything from the execution-log file.
- ❌ **Do not** promote Tasks or Runs to top-level sidebar destinations. The
  primary navigation remains Issue-centered.
- ❌ **Do not** remove or demote existing Task/Run deep links outside the ticket
  that explicitly owns navigation. Keep existing routes reachable.
- ❌ **Do not** move the run/execution workflow out of Issue Detail.
  Task Cockpit and Run Detail are zoom-in views; the orchestration entry point
  stays on the issue.
- ❌ **Do not** treat the `deps`, `reco`, `tickets` artboards in
  `task-and-run-rework.html` (the 780×1080 narrow boards) as UI. Those are
  design-doc panels, not screens to build.
- ❌ **Do not** edit the archived HTML files in place. If Design ships a new
  rev, open a new handoff branch that bumps the file and links the diff.

## Follow-up tickets

Implementation tickets that consume this handoff **must** link back to
`docs/design/issue-centered-v1/README.md` (this file) in their description and
name the specific artboards they target. Parent epic: [SUP-125].

Known consumers:

- [SUP-164] — `/issues` list, filters, hover, shipped, empty/loading, and kanban
  using Issues artboards 02–06 and 08. Must not touch Issue Detail.
- [SUP-165] — Issue Detail using Issues artboard 07, plus the compact Run drawer
  from the execution-log artifact. Owns issue-centered execution integration.
- [SUP-166] — `/tasks/:id` and `/runs/:id` deep-link redesign using Task Cockpit
  and Run Detail simplified. Runs after or alongside SUP-165 depending on scope.

[SUP-125]: https://linear.app/superkick/issue/SUP-125
[SUP-164]: https://linear.app/superkick/issue/SUP-164
[SUP-165]: https://linear.app/superkick/issue/SUP-165
[SUP-166]: https://linear.app/superkick/issue/SUP-166
