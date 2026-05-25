# Component mapping — app surface → spec component

For each likely app component the orchestrator has in the current
implementation, this table fixes which spec component governs it and lists the
top drift signals to look for. **Read SPEC.md alongside** — the §-references
point you straight to anatomy.

> **Convention.** "Likely app component" names are written in the casing
> typical for our codebase (`IssueRow`, `RunInspector`, etc.). If your file
> uses different naming, match by responsibility, not name.

## At-a-glance table

| Likely app component         | Spec component(s)                              | Spec § | Artifact ref                              |
|------------------------------|------------------------------------------------|--------|-------------------------------------------|
| `IssueRow` / `IssuesListRow` | `IssueRowV3` + `TaskDot`                        | §8     | A1 / `list-default-dark`                  |
| `IssueListGroupHeader`       | `GroupHeaderV3`                                 | §9     | A1 / `list-default-dark`                  |
| `IssueListTabs`              | `ViewTabsV3`                                    | §10.1  | A1 / any list artboard                    |
| `IssueListFilterBar`         | `FilterBarV3` + `FilterChipV3` + `DisplayChip` + `ViewToggleV3` | §10.2 | A1 / any list artboard |
| `IssueListFilterDropdown`    | `FilterDropdownV3`                              | §10.3  | A1 / `filter-dark`                        |
| `IssueHoverCard` / `IssuePreview` | `IssueHoverV3`                              | §11    | A1 / `hover-dark`                         |
| `IssueKanbanCard`            | `KCardV3` (incl. drag/ghost states)             | §12.1  | A1 / `kanban-dark`, `kanban-drag`         |
| `IssueKanbanColumn`          | `KColV3`                                        | §12.3  | A1 / `kanban-dark`                        |
| `IssueDetailPage` (composition) | `IssueDetailWithExec`                       | §13    | **A3** / `detail-running`, …              |
| `IssueDetailBody`            | left column of §13.3                            | §13.3  | A3 / any detail artboard                  |
| `IssueDetailRail`            | right column of §13.4 (no Tasks tile)           | §13.4  | A3 / any detail artboard                  |
| `IssueDetailSubIssues`       | Sub-issues card                                 | §14    | A3 / `detail-running`                     |
| `IssueDetailComment`         | `Comment`                                       | §15    | A3 / `detail-running`                     |
| `IssueDetailComposer`        | composer at end of §15.3                        | §15.3  | A3 / any detail artboard                  |
| `IssueDetailActivityEvent`   | issue-page `TimelineEvent` (`sk-v3-detail`)     | §16    | A3 / `detail-running`                     |
| `IssueExecutionLog`          | `ExecutionLog` (+ `PhaseStrip`, `ExecRow`, `ExecFileRow`, `WorktreeMini`, `NeedsBanner`, `PastRunRow`) | §17 | **A3** / all four detail states |
| `RunDrawer`                  | `RunDrawer` (+ `DrawerTab`, `DrawerEvent`, `DrawerFilters`, `ToolCallRow`, `DKV`) | §18 | A3 / `detail-*-drawer` |
| `RunInspector` / `RunPage`   | `RunSimplified` (+ `CSCell`, `ToolStat`)        | §20    | A2 / `run-running`, `run-needs`, `run-done` |
| `TaskCockpit` / `TaskPage`   | `TaskCockpit` (+ `PhaseTracker`, `TCTimeline`, `PhaseGroup`, `TCNowPanel`) — debug surface only | §19 | A2 / `cockpit-*` |
| `Sidebar` / `AppNav`         | `Sidebar` (Tasks/Runs removed)                  | §7.1   | A1 / any list artboard                    |
| `Topbar` / `PageHeader`      | `Topbar`                                        | §7.2   | A1 / any list artboard                    |

---

## Per-component drift signals

### `IssueRow` / `IssuesListRow` — spec §8

Where current implementations most often drift:

- **Row height ≠ 36** — measure it. If the row reflows to 40+ because a label
  wraps, that's a bug.
- **Title wraps to 2 lines** — title must `overflow: hidden / text-overflow: ellipsis / white-space: nowrap`.
- **`min-width: 0` missing on title cell** — same root cause as above.
- **Missing fixed widths on the trailing meta columns** — causes the right
  edge to drift as you scroll different issues.
- **TaskDot rendered as a text badge** — must be a 8px dot, tooltip only.
- **Hover background = `var(--sk-overlay)` or accent** — must be `--sk-raised`.
- **Selected state lacks the inset 2px accent shadow** — see §8.3.
- **Padding symmetric `0 24px`** — wrong. It's `0 24px 0 20px`.

### `IssueListGroupHeader` — spec §9

- "Needs you" pinned band missing the warn-tinted background and top border.
- Label font size or weight off (must be 12.5/600).
- Count not in mono font.
- Header missing `position: sticky / top: 0 / z-index: 2`.

### `IssueListTabs` / `ViewTabsV3` — spec §10.1

- Active underline uses `--sk-accent` — wrong, must be `--sk-fg`.
- Tab order rearranged (must be `My open work · All open · Recently shipped`).
- Count badge uses pill bg/colors — must be plain `bg --sk-raised / fgDim`.

### `IssueListFilterBar` — spec §10.2

- `+ Filter` button uses a solid border — must be **dashed**.
- Filter chips use a non-raised background.
- DisplayChip ("Group", "Sort") rendered as a button with bg/border — must be
  borderless, plain text with chevron.
- View toggle (segmented) renders as two separate buttons instead of one
  segmented control.

### `IssueListFilterDropdown` — spec §10.3

- Missing the **SK tag** on the "Task state" facet.
- Facet list reordered or shortened.
- Dropdown background = surface instead of overlay (must use overlay).

### `IssueHoverCard` — spec §11

- Width ≠ 480.
- Hover delay missing or set to 0 (must be 350ms).
- Description body not clamped to 3 lines.
- Linked-run footer rendered with bg = surface instead of `--sk-void`.
- "Open" button is primary — must be ghost.

### `IssueKanbanCard` — spec §12.1

- Card height grows past ~80 because title wrapped to 2 lines.
- Drag state missing the `rotate(-1.2deg)` or accent border.
- Footer renders 2 labels — kanban shows max 1.

### `IssueDetailPage` — spec §13

- **Right rail still shows a "Tasks" tile** — must be removed in favor of
  inline ExecutionLog. See §13.5.
- Right rail width ≠ 308.
- Rail properties reordered or missing dividers.
- Left column padding ≠ 20/28/32.

### `IssueDetailActivityEvent` — spec §16

- Uses the run-page TimelineEvent shape (small dot + connector) — must be the
  issue-page shape (circle 26 with bordered icon, no connector).

### `IssueExecutionLog` — spec §17

This is where the bulk of recent drift sits.

- **Approve / Reject buttons missing or placed in the drawer instead of in
  the NeedsBanner** — P0. See §17.3 and §18.10.
- PhaseStrip uses the bigger PhaseTracker shape from the cockpit (22 discs,
  taller) — must be the compact 18-disc variant.
- Recent activity rows use timestamps in non-mono font.
- "Open run" button is primary or secondary — must be ghost.
- File diff bar uses a single color instead of stacked success/danger.
- Past runs list shows agent's name without the bot avatar.
- ExecSection eyebrow rendered in title case ("Recent activity") — must be
  uppercase / 600 / letter-spacing 0.9 ("RECENT ACTIVITY").

### `RunDrawer` — spec §18

- Width ≠ 640.
- Drawer hosted at its own URL (e.g. `/runs/<id>` as a stack) instead of
  `?run=<id>` overlay.
- Tab bar reordered or missing the trailing dot indicator on Terminal.
- Approve/Reject buttons present in the drawer — must be removed.
- Tool call row's index column not zero-padded ("1" instead of "01").

### `RunInspector` — spec §20

- Surfaces a chat composer at the bottom — must be replaced by the collapsed
  terminal escape-hatch strip.
- Right rail width ≠ 340.

### `TaskCockpit` — spec §19

- Visible from nav — should be `?debug=task` only.
- Mixes the compact PhaseStrip in place of PhaseTracker.
- Now panel width ≠ 360.

### `Sidebar` — spec §7.1

- Still shows `Tasks` and `Runs` entries — both must be removed.
- Active rail uses a different color or width (must be 2px `--sk-accent`).
- Search input rendered with `bg --sk-surface` instead of `--sk-raised`.

### `Topbar` — spec §7.2

- Height ≠ 52.
- Action divider missing between the right-cluster groups.

---

## Two TimelineEvent components — disambiguation

This is by far the most common confusion. We use the same conceptual name in
two places and they look different:

| Variant                         | Source file                          | Where it's used                                    |
|---------------------------------|--------------------------------------|----------------------------------------------------|
| Issue-page `TimelineEvent`      | `screens-v3/sk-v3-detail.jsx`        | Inside Activity feed on Issue Detail (§13.3 / §16) |
| Run-page `TimelineEvent`        | `screens-rework/sk-task-shared.jsx`  | TCTimeline (§19.4), Run Inspector (§20)            |
| Drawer activity `DrawerEvent`   | `screens-v4/sk-v4-run-drawer.jsx`    | Run Drawer Activity tab (§18.5)                    |
| Execution-log `ExecRow`         | `screens-v4/sk-v4-exec-log.jsx`      | ExecutionLog inline rows (§17.5)                   |

When you implement, give them **distinct** component names:
`ActivityFeedEvent`, `RunTimelineEvent`, `DrawerActivityEvent`, `ExecActivityRow`.
Do not collapse them into one polymorphic component — the visual rules are
genuinely different.

---

## Two PhaseTracker components — disambiguation

Same problem in motion-status land:

| Variant       | Source                              | Disc | Padding | Used in                                |
|---------------|-------------------------------------|------|---------|----------------------------------------|
| `PhaseTracker`| `screens-rework/sk-task-shared.jsx` | 22   | 14 24   | Task Cockpit (full-page header strip)  |
| `PhaseStrip`  | `screens-v4/sk-v4-exec-log.jsx`     | 18   | 14 16   | ExecutionLog inline on Issue Detail    |

Implement as **two separate components**. Don't make one with a `compact` prop.

---

## Data gaps vs visual gaps

When a layout looks empty in your implementation but full in the artifact, ask
whether the gap is **data** (orchestrator's job) or **visual** (yours).

| Surface area                       | Data fields the artifact assumes exist                                                                      |
|------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Issue row                          | `priority`, `status`, `id`, `title`, `labels[]`, `project`, `sub: { done, total } \| null`, `estimate`, `assignee`, `updated`, `taskState` |
| Hover card                         | All of the above + `bodyExcerpt` (≤ 3 lines clamp), `lastComment: { author, age, body }`, optional `linkedRun: { id, state, phase, elapsed }` |
| Sub-issues card                    | per child: `id, status, priority, title, assignee` + parent: `done / total`                                  |
| Issue Detail rail                  | `cycle`, `cycleDaysLeft`, `milestone`, `estimate`, `dueDate`, `createdAt`, `createdBy`, `updatedAt`, `relations[]` |
| ExecutionLog header                | Current run: `agent, model, elapsed`, plus computed phase array                                              |
| ExecutionLog Recent activity       | Last 3–5 activity events with kind enum + title + meta + optional badge                                      |
| ExecutionLog Files changed         | per file: `path, adds, dels`, plus an `active` flag for the file the agent is editing right now              |
| ExecutionLog Worktree              | `branch, sandbox, sandboxState, path, prId?, prState?`                                                       |
| ExecutionLog Past runs             | per run: `id, state, agent, label, when`                                                                     |
| Run Drawer Tool calls              | per call: `idx, tool, summary, durationMs, ok, args (for expanded body), output (for expanded body)`         |
| Run Inspector context strip        | `agent, model, sandbox, branch, worktree, startedAt, cost`                                                   |

**Do not fabricate any of these.** If a field isn't wired up, the rule is:

- If the **field is optional** in the spec (e.g. linked run footer, due date,
  cycle), **omit the affordance entirely**. Do not show "—" or "Unknown".
- If the **field is required** but missing, surface it to the orchestrator as
  a data gap (file an issue in this round's tracker). Do not invent a value
  to make the layout look full.

The spec is the visual contract; data fidelity is the orchestrator's contract.
The two are separate work streams.
