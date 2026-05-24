# /issues List Audit - Codex

Date: 2026-05-24

Scope audited: `/issues` list, kanban, hover preview, filters, shipped/done reveal, and the related visual parity harness. Excluded: Issue Detail, Task Detail, Run Detail, drawer, Inbox, Settings, Agents.

Read first:

- `docs/design/issue-centered-v1/README.md`
- `docs/design/issue-centered-v1/artifacts/issues-redesign-linear-like.html`
- `docs/design/issue-centered-v1/visual-parity.md`
- `ui/visual-parity/manifest.mjs`

Focused parity run:

```bash
pnpm --dir ui visual:parity -- --states issues-list-default,issues-list-hover,issues-list-filter,issues-list-empty,issues-list-loading,issues-list-shipped,issues-kanban-default,issues-kanban-drag --output /private/tmp/superkick-issues-audit-parity
```

Results were all `review`: default list 5.20%, hover 4.36%, filter 4.30%, empty 1.18%, loading 2.22%, shipped 1.32%, kanban 3.13%, kanban drag 3.29%. These percentages are useful as smoke signals only; several diffs include shell and fixture mismatches outside the `/issues` surface.

## P0

### P0-1 - Kanban ignores `/issues` tab, filters, and done visibility

Mockup expectation: `/issues` remains the same saved-view surface in list and board modes. Default is `My open work`; filters, active tab, and Done-hidden semantics still apply. Kanban columns should reflect the approved `/issues` view, with Done hidden unless explicitly surfaced.

Current app behavior: `IssuesPage` derives the filtered list view through `useIssuesView`, but board mode bypasses that result and passes raw `data.queueItems` into `IssuesKanbanView`. `IssuesKanbanView` then groups the complete launch queue, independent of `resolved.tab`, `resolved.filters`, `resolved.showDone`, and `viewerId`. A user can be on `My open work` with filters applied and still see unrelated queue cards in board mode.

Likely files:

- `ui/src/routes/_shell/issues.tsx` lines 60-68, 180-181
- `ui/src/components/issues/IssuesKanbanView.tsx` lines 12-22, 44-56
- `ui/src/hooks/useIssuesView.ts` if a board-compatible view model is added
- `ui/src/hooks/useIssueKanbanDnd.ts` and `ui/src/hooks/useUpdateIssueState.tsx` if drag remains wired to filtered board cards

Data-driven vs real defect: real defect. This is route-state correctness, not a mockup-data issue.

Disposition: ticket. Acceptance should require board mode to honor `tab`, URL filters, default `mine`, and Done-hidden/reveal rules.

### P0-2 - Completed/opening PR runtime state is treated as issue Done

Mockup expectation: Done/shipped rows are terminal Linear issues. Runtime state can add a quiet task-state dot, but it must not fake shipped/done issue state. This matches the handoff warning not to fake runtime state and the product rule that run completion does not move Linear to Done.

Current app behavior: `bucketFor` returns `done` when the linked run is `completed`, `failed`, `cancelled`, or `opening_pr` before checking the Linear issue state. `useIssuesView` then hides those rows from default open tabs, increments shipped counts if the issue `updated_at` is recent, and can surface them in the shipped tab even when Linear still says `started`.

Likely files:

- `ui/src/lib/lifecycle.ts` lines 11-24
- `ui/src/hooks/useIssuesView.ts` lines 84-118, 155-172
- `ui/src/lib/issues/taskBadge.ts`
- `ui/src/lib/lifecycle.test.ts` currently pins this behavior
- `docs/product/issue-run-state.md` for the intended source-of-truth wording

Data-driven vs real defect: real defect. It can hide open work and produce fake shipped counts from runtime state.

Disposition: ticket. Separate Linear terminal state from task/run badge state; do not use terminal run state as issue Done.

## P1

### P1-1 - Recently shipped is not grouped by completion window

Mockup expectation: `Recently shipped` groups done issues by completion windows such as `Last 3 days` and `Last 7 days`; controls switch to completed-oriented grouping/sorting, and the active filter reads as `Status is Done`.

Current app behavior: shipped tab is just a single `Done` group when grouping by lifecycle/status, and it uses `issue.updated_at` as the shipped timestamp. The toolbar still shows `Group Status` and `Sort Priority`. There is no completion-window grouping and no completion timestamp in the list contract.

Likely files:

- `ui/src/hooks/useIssuesView.ts` lines 130-166, 242-366
- `ui/src/components/issues/IssuesListView.tsx` lines 51-83
- `ui/src/components/issues/IssueFilterBar.tsx` lines 22-36, 81-94
- `ui/src/types/issues.ts`
- `crates/superkick-integrations/src/linear/client.rs` list query if `completedAt` or equivalent is added

Data-driven vs real defect: mixed. The grouping behavior is a real UI defect, but the correct timestamp requires a real data contract. Do not fake completion dates from mockups.

Disposition: ticket. Add a real completion timestamp or explicitly document a fallback before implementing window groups.

### P1-2 - Filter dropdown is not Linear-complete

Mockup expectation: the filter picker includes Linear-like axes: Assignee, Creator, Priority, Status, Label, Project, Repo, Milestone, Cycle, Estimate, Created, Updated, Completed, Has sub-issues, and Superkick-specific Task state with an `SK` marker. Existing chips can express negative operators such as `Status is not Done / Canceled`.

Current app behavior: the dropdown exposes only Assignee, Status, Priority, Label, Project, Repo, Task state, and Created. Negative operators exist only after an include chip is created. There are no axes for creator, milestone, cycle, estimate, updated, completed, or sub-issue presence. The filter state/schema also lacks these fields.

Likely files:

- `ui/src/components/issues/IssueFilterDropdown.tsx` lines 10-46, 241-266
- `ui/src/components/issues/IssueFilterBar.tsx` lines 100-252
- `ui/src/lib/issues/searchParams.ts` lines 14-30, 43-53, 80-90
- `ui/src/types/issuesView.ts` lines 27-38
- `ui/src/routes/_shell/issues.tsx` lines 206-233
- `ui/src/types/issues.ts` and Linear query fields for axes not currently present

Data-driven vs real defect: mixed. Missing axes whose data already exists (`children`, `cycle` on detail only, project, labels, assignee) are real implementation gaps. Axes absent from list data need backend/data-contract tickets. Do not add dummy counts or mock options.

Disposition: ticket. Split into frontend-only axes versus data-contract axes.

### P1-3 - Hover preview is under-specified and parity target is wrong

Mockup expectation: after roughly 350ms, a quiet 480px preview shows title, status/priority/ID, body excerpt, labels plus project, assignee/sub-issues/estimate strip, last comment, and linked run. The approved `hover-dark` artboard previews `ISS-216`.

Current app behavior: the preview only renders body/last comment/PR/run when the detail query succeeds. It omits project in the preview body, assignee, sub-issue count, estimate, and richer linked-run copy. The parity manifest hovers `ISS-201`, while the mockup artboard previews `ISS-216`; fixtures only answer detail for `SUP-169`, so the hovered list row can 404 its detail request and still produce an app screenshot with a sparse card.

Likely files:

- `ui/src/components/issues/HoverCard.tsx` lines 15-34
- `ui/src/components/issues/IssuePreview.tsx` lines 21-137
- `ui/src/components/issues/IssueRow.tsx` line 30
- `ui/visual-parity/manifest.mjs` lines 23-32
- `ui/visual-parity/fixtures.mjs` lines 62-93, 679-724
- `ui/src/types/issues.ts` if preview needs list-level estimate/cycle fields

Data-driven vs real defect: mixed. Missing preview sections are real defects when backed by real data. The current parity miss is a harness defect. Accept lack of comments/PRs only when the API genuinely has none; do not invent them to match the mockup.

Disposition: ticket. Fix the manifest target/fixtures first, then implement only preview fields backed by real API data.

## P2

### P2-1 - Empty and loading states do not model the approved route states

Mockup expectation: empty state is the `My open work` empty state with tabs/filter chrome and clear actions such as switching to all open or creating an issue. Loading keeps group headers and 36px row geometry aligned with the final list.

Current app behavior: the parity `issues-empty` fixture returns no issues at all, so `IssuesPage` hides the `/issues` tabs and filters and renders the global `No issues yet` state. The real `IssuesListView` empty copy mentions `Browse All open` and `create an issue`, but those are plain text, not actions. Loading in visual parity renders only ungrouped skeleton rows under the toolbar.

Likely files:

- `ui/src/routes/_shell/issues.tsx` lines 127-159, 178-179
- `ui/src/components/issues/IssuesListView.tsx` lines 36-48, 117-136
- `ui/src/components/issues/IssueRowSkeleton.tsx`
- `ui/visual-parity/manifest.mjs` lines 43-60
- `ui/visual-parity/fixtures.mjs` lines 647-671

Data-driven vs real defect: mixed. The global no-issues state is acceptable for a truly empty workspace. Missing scoped-empty actions and grouped loading skeletons are real UI gaps. The parity fixture should add a `mine-empty` style case instead of using no issues at all for the approved empty artboard.

Disposition: ticket, but lower priority than route/filter correctness.

### P2-2 - Row anatomy still lacks real metadata columns from the mockup

Mockup expectation: dense rows include priority/status/ID/title, labels, sub-issue progress where real, project, estimate where real, assignee, age, and the small Superkick task-state dot. Done is hidden by default and revealable.

Current app behavior: rows are dense and quiet, but they show only two labels, project, assignee, updated age, and task dot. They do not show sub-issue progress or estimate. The top filter chip defaults from the mockup (`Assignee is me`, `Status is not Done/Canceled`) are not represented as URL state or visible default chips.

Likely files:

- `ui/src/components/issues/IssueRow.tsx` lines 22-99
- `ui/src/components/issues/IssueGroupHeader.tsx`
- `ui/src/types/issues.ts`
- `crates/superkick-integrations/src/linear/client.rs` lines 35-70 for list fields

Data-driven vs real defect: mostly data-driven. Children exist on list items, but estimates do not. It is acceptable for rows to omit unavailable metadata until the API carries it; it is not acceptable to fake progress, estimates, or counts.

Disposition: ticket only after deciding which metadata fields are product requirements versus visual-reference examples.

### P2-3 - Visual parity harness compares too much shell and too little behavior

Mockup expectation: parity should help reviewers isolate `/issues` surface mismatches for list, hover, filter, shipped, empty/loading, and kanban.

Current app behavior: screenshots are full-page for `/issues` states, so global shell differences inflate pixel diffs even when outside this audit scope. The harness records console/request diagnostics only on thrown capture failures; a hover-detail 404 can still result in a captured sparse preview. Existing manifest tests assert state IDs but not fixture coverage for the hovered issue, shipped window data, scoped empty data, or board filter semantics.

Likely files:

- `ui/visual-parity/capture.mjs` lines 133-165, 175-216, 247-287
- `ui/visual-parity/manifest.mjs` lines 13-88
- `ui/visual-parity/fixtures.mjs` lines 647-724
- `ui/visual-parity/manifest.test.mjs`
- `ui/visual-parity/fixtures.test.mjs`

Data-driven vs real defect: harness defect. The current screenshots remain useful for manual review, but they should not be used as proof of implementation parity.

Disposition: ticket. Add targeted fixture assertions and consider clipping to the route content where practical.

## Acceptable Data Mismatches

- Mockup counts, comments, PRs, labels, assignees, sub-issue progress, estimates, and runtime state should not be faked. If production data lacks a field, the UI should omit it or use a real empty state.
- The mockup's high counts and sidebar/pinned content are visual context, not acceptance criteria for this `/issues` audit.
- Global no-issues behavior can differ from the `My open work` empty artboard, as long as a scoped My-open-empty state exists and matches the approved behavior.
- Visual parity diffs above 1% are expected while the redesign is incomplete; each mismatch still needs an explanation or follow-up ticket.

## Ticket Candidates

1. Board mode route-state correctness: apply tab, filters, showDone, and viewer scope before rendering kanban.
2. Lifecycle semantics: stop classifying terminal/opening PR runs as issue Done.
3. Shipped view: add real completion timestamp and group by completion windows.
4. Filter dropdown completion: add missing axes with real data contracts only.
5. Hover preview parity: correct target fixture and implement backed fields.
6. Empty/loading parity: split global-empty from My-open-empty and add grouped skeletons.
7. Visual parity hardening: fixture assertions, route-content clipping, and diagnostics for unexpected 4xx requests.
