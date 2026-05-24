# Task / Run / Drawer — Design Audit

Audit-only. No code changes. Scope: `/tasks/:id`, `/runs/:id`, and the
Execution drawer launched from Issue Detail. Companion to
[`issue-detail-audit.md`](./issue-detail-audit.md).

## Method

Read in this order:

- [`README.md`](./README.md) — artboard lock
- [`artifacts/task-and-run-rework.html`](./artifacts/task-and-run-rework.html)
  artboards `cockpit-running` / `cockpit-needs` / `cockpit-done` /
  `run-running` / `run-needs` / `run-done` / `split-closed` / `split-open`
- [`artifacts/issue-detail-with-execution-log.html`](./artifacts/issue-detail-with-execution-log.html)
  artboards `drawer-activity` / `drawer-tools` / `drawer-files` /
  `drawer-logs` / `drawer-terminal` / `drawer-done` (drawer pattern only —
  not Issue Detail baseline)
- [`visual-parity.md`](./visual-parity.md)
- [`ui/visual-parity/manifest.mjs`](../../../ui/visual-parity/manifest.mjs)

Implementation cross-checked against:

- [`ui/src/components/task-cockpit/`](../../../ui/src/components/task-cockpit/)
- [`ui/src/components/run-inspector/`](../../../ui/src/components/run-inspector/)
- [`ui/src/components/run-detail/`](../../../ui/src/components/run-detail/)
- [`ui/src/components/issue-detail/run-drawer/`](../../../ui/src/components/issue-detail/run-drawer/)
- [`ui/src/components/issue-detail/ExecutionStatusCard.tsx`](../../../ui/src/components/issue-detail/ExecutionStatusCard.tsx)

The HTML artifacts ship pre-rendered React; component bodies live in
sha384-pinned external bundles and are not readable as text. Design intent
was extracted from in-page artboard labels, design canvas Post-It notes, and
Playwright captures of each artboard.

## Posture check — does the surface hierarchy still feel right?

- **Issue Detail is the operator's anchor.** ✔ The Run page literally says
  *"Decisions for this run live on its issue"* and links back via
  [`RunInspectorParentBanner.tsx:19`](../../../ui/src/components/run-inspector/RunInspectorParentBanner.tsx#L19).
- **Task Cockpit is anchored to its issue.** ✔ Topbar back falls back to
  `/issues/{identifier}`
  ([`TaskCockpit.tsx:58`](../../../ui/src/components/task-cockpit/TaskCockpit.tsx#L58)).
- **Drawer is an overlay, not a route.** ✔ `SideDrawer width="compact"`
  ([`RunDrawer.tsx:11-19`](../../../ui/src/components/issue-detail/run-drawer/RunDrawer.tsx#L11-L19)),
  reuses the same `ActivityTab` body as the Run page so the operator learns
  one mental model
  ([`RunDrawerContent.tsx:77-81`](../../../ui/src/components/issue-detail/run-drawer/RunDrawerContent.tsx#L77-L81)).

But the conviction breaks down inside each surface. The frames are right;
the contents still leak the old chat-first / terminal-first metaphors that
the mockups explicitly remove. See [Top 10 gaps](#top-10-gaps-ordered-by-product-impact).

## Top 10 gaps (ordered by product impact)

### 1. Task Cockpit's "Now" panel always hosts a chat composer
**Defect.** The mockup's `INTERVENE` block is a set of typed buttons —
`Pause run` / `Nudge` in running, `Approve` / `Reject` in needs-human,
`Run on another branch` / `View PR` in done. The current `NowPanel` instead
renders an always-on `InterventionComposer` textarea
([`TaskCockpitNowPanel.tsx:91-103`](../../../ui/src/components/task-cockpit/TaskCockpitNowPanel.tsx#L91-L103)).
The design's most explicit Post-It is *"Dropped the RunChat composer (the
chat metaphor)"* — the cockpit reintroduces it under a different name.

**Surgical fix.** Replace the composer with a single state-dependent action
row inside `NowPanel`. Running → `Pause` + `Cancel`. Needs-human →
`Approve` / `Reject` (driven by the existing `AttentionRequestPanel`
backend), with a small "Add note" toggle that only expands a textarea when
the operator opts in. Free-form nudging stays a power-user affordance, not
the default chrome.

### 2. Run Detail decision affordances contradict its own banner
**Defect.**
[`RunInspectorParentBanner.tsx`](../../../ui/src/components/run-inspector/RunInspectorParentBanner.tsx)
says *"Decisions for this run live on its issue"*, but two rows below it,
the `NeedsHumanBanner` renders `InterruptPanel` + `AttentionRequestPanel` +
`RaiseAttentionRequestForm` — all decision UIs
([`RunStatusBanner.tsx:94-119`](../../../ui/src/components/run-detail/RunStatusBanner.tsx#L94-L119)).
The mockup's `run-needs` artboard shows a single banner with an `Open Task
→` CTA and nothing else.

**Surgical fix.** Collapse `NeedsHumanBanner` to {icon, one-line reason,
`Open Task →`}. Move the `InterruptPanel` / `AttentionRequestPanel` /
`RaiseAttentionRequestForm` rendering out of `/runs/:id` entirely (they
already live on Task Cockpit and Issue Detail). The Run page becomes a
read-only inspector, which is what the mockup is asking for.

### 3. Task Cockpit "Now" panel is missing half its canonical sections
**Defect.** The mockup's right rail is six sections in a fixed order:
`NOW` → `RUN` (id + agent + model + cost) → `WORKTREE` (sandbox + branch +
path + PR) → `HOW TO TEST` (command + `Run` button) → `FILES CHANGED` →
`INTERVENE`. Today's `NowPanel`
([`TaskCockpitNowPanel.tsx:30-104`](../../../ui/src/components/task-cockpit/TaskCockpitNowPanel.tsx#L30-L104))
ships only `NOW` + `RUN` (no cost) + `WORKTREE` (no PR) + an optional
`Files changed` + the composer. `HOW TO TEST` and a real `INTERVENE` block
are absent.

**Surgical fix.** Add two `<section>` blocks between `Worktree` and the
files list:

- `HOW TO TEST` — populated from `task.structured_result.test_command` or
  the playbook's declared verify step; collapses gracefully when nothing is
  known. Single mono row + a `Copy` glyph; the `Run` button is post-MVP.
- `INTERVENE` — the typed-button replacement for gap 1.

Add a `PR` row inside `Worktree` when the linked run resolves a PR
(`detail.pr` is already loaded in `useLaunchTaskFeedState`-adjacent code).
Cost belongs in `RUN` and can read from the same source as
`RunBudgetCard`.

### 4. Drawer header has no run-identity strip
**Defect.** The mockup's drawer header is a 5-column metadata strip below
the title: `AGENT / MODEL / SANDBOX / BRANCH / COST` in small-caps labels
with the value below each. The current drawer header
([`RunDrawerContent.tsx:57-73`](../../../ui/src/components/issue-detail/run-drawer/RunDrawerContent.tsx#L57-L73))
shows only `issue_identifier` Pill + state badge + short run id +
`Detail →` link. An operator opening the drawer cannot tell at a glance
which agent / model / branch they are inspecting.

**Surgical fix.** Extract `RunInspectorMetaStrip`'s five columns into a
shared `RunMetaStrip` and render it inside `RunDrawerContent`, between the
header bar and `RunDrawerTabs`. Same component, narrower padding (`px-4
py-2.5` instead of `px-6 py-3`). This is the single highest-leverage change
to make the drawer feel useful from Issue Detail.

### 5. Drawer has no event filter chips or search
**Defect.** Every drawer artboard sits below a sub-filter row:
`All N / Tools N / Edits N / Tests N / Flags N` chips on the left + a
`Search events` input on the right. The current `RunDrawerTabs` is just the
five-tab bar; the body of each tab is an unbroken scroll. For the *debug
inspector* role the mockup is selling, this is the biggest reason the
drawer feels long rather than compact.

**Surgical fix.** Introduce a `RunDrawerFilterBar` rendered between
`RunDrawerTabs` and the tab body. Even a no-op v1 with `All / Tools /
Edits / Tests` (no `Flags`, no search) and counts derived from the same
`events` array would close most of the perceived gap. Push search to a
follow-up.

### 6. Drawer header has no mutation actions
**Defect.** The mockup's drawer header pairs the close button with two
explicit actions: `Re-run` and `Bundle` (re-run as a new attempt on the
same task, bundle with prior runs into a single PR). These are the only
mutations the drawer is supposed to host. Today the drawer offers zero
actions on the run — only navigation away (`Detail →`).

**Surgical fix.** Add two ghost-button actions to the right of the header
title, before the close `×`. `Re-run` calls the existing
`POST /runs/{id}/retry` (or whatever the runtime exposes). `Bundle` can
ship as a stub linking to the parent Task Cockpit if the bundler API isn't
ready; the affordance teaches the model before the backend lands.

### 7. Task Cockpit's "Now" panel has no direct link to Run Detail
**Defect.** Mockup `cockpit-running` ends the `NOW` block with a small
right-aligned `Run detail →` link. Current `NowPanel` shows
`linkedRunId` only as a `Fact` value
([`TaskCockpitNowPanel.tsx:58`](../../../ui/src/components/task-cockpit/TaskCockpitNowPanel.tsx#L58))
— not interactive. The operator has to dig out the URL or use the drawer
from Issue Detail.

**Surgical fix.** Wrap `linkedRunId` in a `<Link to="/runs/$runId">` when
non-null. Bonus: add an `Open drawer` action that calls the same
`useRunDrawerStore.openDrawer(runId, 'activity')` the Issue Detail Tasks
card uses — that wires the Task Cockpit into the same overlay the Issue
Detail uses, reinforcing the drawer's "always one keystroke away" promise.

### 8. Meta strip labels "Mode" where the design wants "Model"
**Defect.** `RunInspectorMetaStrip`'s second column shows `Mode` (the
domain enum `execution_mode`)
([`RunInspectorMetaStrip.tsx:40-57`](../../../ui/src/components/run-inspector/RunInspectorMetaStrip.tsx#L40-L57)).
The mockup reserves that slot for `MODEL` (the LLM identifier — `opus-4.7`,
`sonnet-4.6`, etc.). On a run-inspector surface, an operator reading the
strip primarily wants to know which model produced the output; the
execution mode is plumbing.

**Surgical fix.** Add a `MODEL` column (read from the active session's
model field, same source `TaskCockpitNowPanel` uses) and demote
`execution_mode` to a small pill inside the `Workspace` rail section.
Keep the meta strip's grid template, swap one column.

### 9. Meta strip is too narrow vs. the Codex-style density it copies
**Defect.** The mockup strip is dense — 7 chips packed left-to-right:
`AGENT / MODEL / SANDBOX / BRANCH / FILES CHANGED / TESTS / COST`. The
current strip is 5 columns and lacks the at-a-glance impact numbers
(`+49 −3`, `3,419 passed`, `$0.42`) that make the Run page feel like a
build inspector.

**Surgical fix.** After fix 8, append three computed pills to the strip:
- `FILES CHANGED` — `+{added} −{removed}` from the already-computed
  `changedFiles` in `RunInspectorFacts`
  ([`RunInspectorFacts.tsx:29-40`](../../../ui/src/components/run-inspector/RunInspectorFacts.tsx#L29-L40))
- `TESTS` — pulled from the same event payloads `ToolsTab` already
  inspects; render only when present, otherwise omit the column (no fake
  zeros)
- `COST` — from `RunBudgetCard`'s underlying calculation

Each chip stays optional. The strip must not invent values for runs that
don't have them.

### 10. `NeedsHumanBanner` has no "Open Task →" action
**Defect.** Even after gap 2 strips the decision UI out of the banner, the
mockup expects the banner itself to carry an `Open Task →` button as its
sole CTA. The current banner has no CTA at all — the operator has to use
the topbar back button.

**Surgical fix.** Inside the stripped-down `NeedsHumanBanner`, render an
inline `<Link to="/tasks/$taskId">` button using the run's `launch_task_id`
(or fall back to the parent issue if no task is linked). Use the same
right-aligned ghost-button styling `RunInspectorParentBanner` already uses
for its issue chip.

---

## Real defects vs. acceptable data/story mismatch

The mockups contain mock copy and mock values that **do not** count as
gaps. The audit deliberately does not propose to invent runtime data.
Anything in this column is fine to ignore in implementation.

| Mockup detail | Status |
|---|---|
| Specific cost figures (`$0.42 of $5.00`) | **Acceptable mismatch.** Render only when the budget is known; otherwise omit the chip. |
| Specific PR number (`#1483 · merged`) | **Acceptable mismatch.** Render only when `pr` resolves; do not invent. |
| Specific test counts (`3,419 passed`) | **Acceptable mismatch.** Omit the column when no test events are present. |
| Mock activity rows ("Generating PR description from 4 commits…") | **Acceptable mismatch.** Real events drive the timeline. |
| Specific terminal output (`go test … PASS`) | **Acceptable mismatch.** The Terminal tab streams real shell output via `ShellTab` / `TerminalTakeover`. |
| Operator names ("launched by Léa") | **Acceptable mismatch.** Show the real launcher or omit. |
| Sandbox naming (`ephemeral-2`) | **Acceptable mismatch.** Reuse whatever `run.worktree_path` resolves to. |
| Mock tool-call durations / counts | **Acceptable mismatch.** Real durations come from events. |
| Free-form `nav-memo` / `nav-memo-light` artboards | **Out of scope.** Drawer reference artifact only; `README.md` excludes these. |
| Narrow `deps` / `reco` / `tickets` panels (780×1080) | **Out of scope.** `README.md` excludes these explicitly. |

---

## Watch items (not in top 10, but worth noticing)

These are quieter risks that may or may not be real depending on data
shape. Flagged for the next review pass.

- **Activity row uniformity.** `StructuredActivityList` and `LedgerList`
  both render each event as a row with an icon + title + delta. If every
  row ends up using the same icon variant in practice (because most events
  fall into the same `activity_kind`), the timeline regresses to "chat
  log". The mockup distinguishes tool-call rows, edit/write rows,
  test-result rows, and PR/merge rows by icon and inline data shape.
  Confirm with a fixture-loaded screenshot before declaring this fine.
- **Drawer trigger affordance is undersold.** The `Open run` button inside
  `TaskRunRow`
  ([`ExecutionStatusCard.tsx:89-99`](../../../ui/src/components/issue-detail/ExecutionStatusCard.tsx#L89-L99))
  is a 24px-tall full-width button tucked inside the Tasks card. The
  drawer is the primary debug surface from Issue Detail; the trigger
  should feel as natural as opening an issue thread. Consider promoting it
  to a top-level action in the Issue Detail rail (or a `⌘E` shortcut), or
  let the entire `TaskRunRow` body be clickable.
- **`split-open` / `split-closed` hint.** Those cross-reference artboards
  show the host page simplifying when the drawer opens (right rail
  collapses, page padding tightens). Verify `SideDrawer` doesn't
  *additionally* dim or layer over the page in a way that fights the host
  content — and consider whether the host should explicitly shed
  non-essential chrome when the drawer is open. Low priority; depends on
  whether the parity captures show daily friction.
- **Terminal tab always-mounted.** The mockup intentionally keeps Terminal
  collapsed at the footer of Run Detail because it's an *escape hatch*.
  Today it's a top-level tab equal to Activity / Tools / Files / Logs.
  This is acceptable — five tabs is the mockup's drawer pattern too — but
  watch for the temptation to default the Run page to Terminal for any
  run that emitted shell output.

---

## Cross-surface coherence check

The mockup teaches a single mental model that the operator learns once and
reuses three times:

1. The five tabs (`Activity / Tools / Files / Logs / Terminal`) appear in
   the same order on Task Cockpit, Run Detail, and the drawer.
2. The activity row shape (icon + title + duration + status pill +
   optional inline diff/log card) is identical across the three.
3. Run identity (`AGENT / MODEL / SANDBOX / BRANCH / COST` strip) appears
   on Run Detail and (per mockup) the drawer.

Today the codebase honours #1 ✔ and partially honours #2 (shared
`ActivityTab`) ✔. It breaks #3 — the meta strip exists only on Run Detail
([`RunInspectorMetaStrip.tsx`](../../../ui/src/components/run-inspector/RunInspectorMetaStrip.tsx)),
and uses the wrong second column. Extracting one shared `RunMetaStrip` and
fixing the second column (gaps 4 + 8) closes both halves at once.

## Suggested implementation order

If a follow-up ticket batches the surgical fixes, this order minimises
churn and maximises perceived improvement per merge:

1. Gap 2 (strip decisions out of Run Detail) — biggest credibility win,
   smallest diff.
2. Gap 4 + Gap 8 + Gap 9 — share one `RunMetaStrip` extraction.
3. Gap 1 + Gap 3 + Gap 7 — one `NowPanel` rework that replaces the
   composer, adds `HOW TO TEST` + typed `INTERVENE`, and links to the run.
4. Gap 5 + Gap 6 — one drawer-chrome pass that adds the filter chips and
   the `Re-run` / `Bundle` actions.
5. Gap 10 — drop-in addition to the slim banner from step 1.
