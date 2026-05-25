# Superkick · Issue-centered v1 — design system spec

**Status:** approved · source-of-truth for implementation
**Round:** Issues redesign + Task/Run rework + Issue Detail with Execution log
**Owner:** design (Léa) · implementation (orchestrator)

This folder is the implementation contract for the three approved artifacts. If
the implementation deviates from these documents, the implementation is wrong —
not the docs. Bring questions back here before guessing from screenshots.

---

## What's in here

```
docs/design/issue-centered-v1/
├── README.md                ← you are here. orientation only.
├── ORCHESTRATOR_HANDOFF.md  ← short one-pager for the orchestrator. READ FIRST if you're dispatching work.
├── SPEC.md                  ← THE spec. tokens + every component anatomy.
├── COMPONENT_MAPPING.md     ← app surface → spec component table.
├── PARITY_CHECKLIST.md      ← P0 / P1 / P2 drift bugs to fix first (v2, verified against codebase).
├── PARITY_CHECKLIST.v1.md   ← preserved heuristic version, kept for diff only.
└── IMPLEMENTATION_EXTRAS.md ← features the app has that the spec doesn't — hide list (decision: strict spec alignment).
```

## Source artifacts (do not edit — these are the visual ground truth)

Three approved HTML canvases are archived under
`docs/design/issue-centered-v1/artifacts/`. Open them in a browser to see the
live, layout-accurate target:

| Artifact                               | Archived file                                 | Covers                                                    |
|----------------------------------------|-----------------------------------------------|-----------------------------------------------------------|
| **A1** Issues redesign · Linear-like   | `artifacts/issues-redesign-linear-like.html`  | List, hover preview, filters, kanban, list-mode detail.   |
| **A2** Task and Run rework             | `artifacts/task-and-run-rework.html`          | Task Cockpit, Now panel, Run Inspector (simplified).      |
| **A3** Issue Detail with Execution log | `artifacts/issue-detail-with-execution-log.html` | The current target: inline ExecutionLog + Run Drawer.  |

When SPEC.md says **"see A3 / detail-running"**, open A3 and find the artboard
labeled "Detail · dark · task in flight". Every artboard is labeled.

> **Important precedence rule.** A3 supersedes A1's `IssueDetailV3` and A2's
> standalone Task Cockpit on the issue surface. A2 still defines Run Inspector
> as a deep-link page, but on the issue page itself you embed `ExecutionLog`
> (A3) and open `RunDrawer` (A3) — **not** a Task Cockpit. The referenced
> `screens-v4/sk-v4-nav-memo.jsx` name comes from the design canvas source; in
> this repository, use A3 plus this spec as the implementation contract.

## Source code (extracted from artifacts — also do not edit; reference only)

The design canvas was generated from these JSX source modules. They are listed
as source names for traceability, but the standalone HTML artifacts and
`SPEC.md` are the checked-in implementation contract.

```
design-canvas.jsx                       canvas runtime
screens/sk-tokens.jsx                   colors, type, radii, spacing
screens/sk-primitives.jsx               Btn, Pill, Avatar, Kbd, Dot, Icon
screens/sk-shell.jsx                    Sidebar, Topbar, Page
screens-v2/sk-icons.jsx                 StatusIcon, PriorityIcon, Label
screens-v3/sk-v3-row.jsx                IssueRowV3, GroupHeaderV3, TaskDot, EstimateChip, SubCountChip
screens-v3/sk-v3-chrome.jsx             ViewTabsV3, FilterBarV3, FilterChipV3, FilterDropdownV3
screens-v3/sk-v3-list.jsx               list states + IssueHoverV3
screens-v3/sk-v3-kanban.jsx             KCardV3, KColV3
screens-v3/sk-v3-detail.jsx             PropRow, Comment, TimelineEvent (issue-page variant), TaskLinkTile
screens-rework/sk-task-shared.jsx       PhaseTracker, TimelineEvent (run-page variant), CodeBlock, KV, FileChangeRow
screens-rework/sk-task-cockpit*.jsx     Task Cockpit (variant A) + Now panel + timeline
screens-rework/sk-run-simplified.jsx    Run Inspector (deep-link page)
screens-v4/sk-v4-exec-log.jsx           ExecutionLog (inline section on issue page) ← current
screens-v4/sk-v4-issue-detail.jsx       IssueDetailWithExec (composition) ← current
screens-v4/sk-v4-run-drawer.jsx         RunDrawer (640px slide-in) ← current
screens-v4/sk-v4-nav-memo.jsx           Navigation rationale (Tasks/Runs not in sidebar)
```

## How implementation agents should use this

1. **Read SPEC.md cover to cover before writing any component.** Don't pattern-match from screenshots — the spec carries the exact pixel intent.
2. **For each PR, attach the artboard reference** (e.g. "matches A3 / detail-needs"). Reviewers check against that artboard.
3. **When SPEC.md disagrees with the running app, the spec wins.** Open a PR against the app.
4. **When SPEC.md disagrees with the artifact, the artifact wins.** Open a PR against this folder.
5. **When you're unsure, do NOT invent fake data to make a layout look full.** Check `PARITY_CHECKLIST.md` § "Data gaps" to see whether the gap is a missing component (your job) or missing data (not your job).

## Out of scope for this round

- Inbox redesign.
- Launch Task composer / launch flow surfaces.
- Settings / Agents config surfaces.
- Chat drawer, global terminal.
- Bulk-select multi-edit on `/issues`.
- Mobile / <1024px responsive.
- Light theme is defined in tokens but not exhaustively designed; if a dark→light translation isn't obvious, ask before shipping.
