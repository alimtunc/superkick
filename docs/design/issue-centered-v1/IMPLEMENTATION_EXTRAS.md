# Implementation extras — features present in the build but not in the spec

> **Decision (logged 2026-05-25):** Strict alignment with the approved mockups (A1 / A2 / A3).
> When the implementation does more than the spec, the implementation hides
> the extra — it does **not** force a spec amendment.
>
> Each item below is a feature that exists in `superkick/ui/src/**` today but
> has no anatomy in the approved artifacts. The default disposition is **hide**.
> "Hide" means: keep the code (so we don't lose work), but gate it behind a
> default-off feature flag or remove its callsite, until design re-approves
> it in a future round.

For each item: where it lives in code · what to do · the spec section that
defines what should be on that surface instead.

---

## EX-01 · Priority displayed as `P1` / `P2` text pill

- **Where:** Kanban cards (`KanbanIssueCard.tsx` / `KanbanCard.tsx`) — red pill
  for P1, amber pill for P2, etc. Visible top-left of every kanban card.
- **Action:** **replace** with `<PriorityIcon>` from `@/ui` (the Linear
  bar-stack glyph). Same component already used in `IssueRow.tsx`.
- **Spec:** §5.3 / §12.1. Kanban card meta row is
  `<PriorityIcon size=11> + <ID mono>` — no text "P1".
- **Notes:** the P1..P5 vocabulary is fine for filter chips and dropdowns
  (Linear itself uses it textually in pickers). It's only the **inline
  visual indicator on cards/rows** that must be the glyph.

## EX-02 · `Ready · #1` status pill inside kanban card body

- **Where:** `KanbanIssueCard.tsx`. Green pill on cards that have an active
  task in "ready" state. Visible on SUP-139 in screenshot.
- **Action:** **hide.** The kanban card anatomy (§12.1) has no body-level
  status pill — task state is encoded by the small **TaskDot** in the meta
  row only.
- **If the orchestrator needs to expose ready-state more strongly:** route it
  through the TaskDot's tone — `ready` becomes a fifth state in a future
  round, designed properly.

## EX-03 · `Dispatch` pill at the bottom of kanban cards

- **Where:** `KanbanIssueCard.tsx`. Grey/raised pill bottom-left of some
  cards (SUP-139, etc).
- **Action:** **hide.** Not in §12.1.
- **Suspected intent:** indicates "this card has been dispatched to an
  agent". This information already exists in the TaskDot color — duplicating
  it as text is noise.

## EX-04 · `Run` button on kanban cards

- **Where:** `KanbanIssueCard.tsx`. Right side of SUP-66 card in the
  "In Progress" column. Looks like an inline action affordance.
- **Action:** **hide.** Cards are click-to-open-issue surfaces. Launch is not
  a card-level action.
- **Spec:** §12.1 lists exactly: priority + ID + estimate + spacer + TaskDot
  on the meta row; nothing else.
- **Where to do the action instead:** the issue detail topbar already has
  `Launch task` / `Launch new run` (spec §13.2). That is the single launch
  affordance.

## EX-05 · `auto` tag on kanban columns

- **Where:** `KanbanColumn.tsx` (or wherever the column header renders).
  Trailing small "auto" text on the "Needs Human" and "In Review" columns.
- **Action:** **hide.**
- **Suspected intent:** these columns are auto-populated from agent state
  rather than from manual status moves. This is a useful piece of info for
  operators but it doesn't belong in the column header — it belongs in a
  group-header tooltip or column settings menu (out of scope for this round).

## EX-06 · Star icon prefix on "My open work" view tab

- **Where:** `IssueViewTabs.tsx` line ~38.
- **Action:** **keep but recolor.** The star is a reasonable "this is your
  pinned default" cue. Just **don't render it in `--sk-accent`** — use
  `--sk-fgMuted`. Accent stays sparse (§0 Foundation 3).
- **Spec:** §10.1 says the tab is just `<label> <count>`. The star is
  pragmatic; cobalt-violet on it is the bug.

## EX-07 · `Step summaries` tab in Task Cockpit

- **Where:** `TaskCockpit.tsx` (or `CockpitTabs.tsx`).
- **Action:** **rename to `Step summaries` → `Tool calls`** AND move the
  current "Step summaries" content into the "Tool calls" tab's expanded
  bodies (each tool call's args + output).
- **Spec:** §19.3 tab order is `Activity · Files changed · Tool calls · Raw logs`.
- **Notes:** if "Step summaries" is fundamentally different content
  (planner-level summaries vs raw tool calls), it can survive as a hidden
  drawer until design defines an anatomy for it. Don't keep it as a primary
  tab.

## EX-08 · `Retry` as the primary CTA on a needs-human run

- **Where:** Task Cockpit needs-human banner, "Open run" page banner. Visible
  in screenshot 3 of the verification round ("Agent stopped and asked for
  help" with `Retry` + `Open run`).
- **Action:** **replace with the spec's three-button triad on the issue
  page.** On the cockpit / run page, keep `Open issue` as the **primary**
  affordance to send the user where the decision belongs.
- **Spec:** §17.3 — NeedsBanner on the issue page has `Approve` (primary) /
  `Reject` (secondary) / `Comment` (ghost) and a small line "Decision logs
  to the run."
- **Notes:** `Retry` is a different concept (the agent retries from current
  state without operator intent). It can live as a secondary option inside
  the Run Drawer or on the cockpit, but it is **not** the operator decision
  mechanism the design intends.

## EX-09 · Terminal "Direct Terminal Access · primary + takeover" mode

- **Where:** `TerminalTakeover.tsx`, `TerminalTakeoverModeButton.tsx`, wired
  into the Run Drawer's Terminal tab and the Run Inspector's Terminal panel.
- **Action:** **hide in the Run Drawer Terminal tab.** The drawer's Terminal
  tab matches §18.9 — context row, live `<pre>` stream, input row. No
  takeover dialog.
- **For the Run Inspector / `/runs/<id>` page:** the takeover UI can stay,
  but **only as a secondary panel** below the activity timeline. The
  bottom-of-page collapsed-terminal strip in §20.1 remains the default;
  takeover is reached from "Open shell" actions, not pre-displayed.
- **Notes:** primary/takeover semantics may be a real product capability the
  design didn't cover. Filed for the next design round; for v1 visual parity
  it's hidden from the default flow.

## EX-10 · `StatusChip` pill in the issue detail rail

- **Where:** `IssuePropertiesBlock.tsx` line ~38, `Row label="Status"`.
- **Action:** **replace** with the spec's icon + text pattern. (Same as
  PARITY_CHECKLIST P0-13.)
- **Spec:** §13.4 — Status row is `<StatusIcon size=13> <span text 12.5 fg>`.
- **Notes:** `StatusChip` itself is fine in places that need a chip (kanban
  card not-the-only-place, tasks tile, etc). Just not the rail.

## EX-11 · `ChatDrawer` on the issue detail page

- **Where:** `IssueDetail.tsx` line ~99 — `<ChatDrawer subject={…}>` is
  always mounted.
- **Action:** **hide the trigger.** Don't unmount the component (the
  ChatDrawer probably has multi-surface usage), but ensure no UI on the
  issue page opens it. Drop any "ask the agent" button / shortcut hint that
  surfaces here.
- **Spec:** §17.10 — agents don't have a chat surface on the issue page.
  Operator interventions are Approve / Reject / Comment via NeedsBanner; the
  Comment composer is human-only.

## EX-12 · `AttentionRequestPanel` on the run page

- **Where:** `run-detail/AttentionRequestPanel.tsx`,
  `PendingAttentionRequest.tsx`, `ResolvedAttentionRequest.tsx`.
- **Action:** **hide on `/runs/<id>` for the operator-facing path.** The
  resolved-attention-request history can stay as a read-only log entry
  inside the run timeline; the *active* decision UI should not appear on
  the run page.
- **Spec:** §0 Foundation 5 + §17.3. Operator decisions happen on the issue.
- **Notes:** if engineers debugging a run need to see the unresolved
  attention request inline, render it as a `<TimelineEvent kind=stuck>` row
  in the run timeline. No approve/reject buttons here.

## EX-13 · `needs_human` / `Needs Human` / `needs you` vocabulary drift

- **Where:** various — `needs_human` (snake_case) in cockpit state badge,
  `Needs Human` (title-case two words) in kanban column, `needs you`
  (lower) in inbox pill, etc.
- **Action:** **standardize on `Needs you`** everywhere it's user-facing.
- **Spec:** §6.7, §9, §17.2. The state token internally can be `needs`; the
  display label is always `Needs you`.
- **Implementation hint:** centralize in a single
  `lib/domain/labels.ts` map: `{ taskState: { needs: 'Needs you', running: 'Running', review: 'In review', shipped: 'Shipped' } }` and import everywhere.

## EX-14 · "Open issue ↗" at the bottom of cockpit INTERVENE section

- **Where:** `TCNowPanel.tsx` (or equivalent) — INTERVENE block, link out.
- **Action:** **keep, but reposition as the primary INTERVENE affordance.**
  Currently it sits at the bottom of a stack of debug actions, with no
  visual weight. Per spec, it should be the **first and most-prominent**
  CTA in the panel:
  ```
  INTERVENE  (eyebrow)
  ┌─ primary button:  Open issue · take decision  ────────────────────┐
  └─ secondary buttons (Retry, Pause, etc.) below ─────────────────────┘
  ```
- **Spec:** §0 Foundation 5 — issue is the anchor. The cockpit is a debug
  surface and must always offer a clear path back to the place where the
  user makes the call.

## EX-15 · Kanban column grouping by "lifecycle bucket"

- **Where:** `IssuesKanbanView.tsx`, column set generation. Today: `Open / In
  Progress / Needs Human / In Review / Done`.
- **Action:** **regroup by Linear status with `Needs you` pinned first.**
- **Spec:** §12.3 — `Needs you (pinned, warn-tinted) → Backlog → Todo → In
  Progress → In Review → Done`. "Open" is not a Linear status — it's a
  bucket. Drop it.
- **Notes:** the same grouping question applies to the list view
  (`IssuesListView.tsx` + `IssueGroupHeader.tsx`). This is a paired change.

## EX-16 · "Ready · #1" inline numbering on kanban cards

- See EX-02. The `#1` part appears to be a queue position. Same disposition:
  hide. If queue position matters operationally, surface it in the issue
  detail topbar or the kanban column header — not on every card.

---

## How to implement the "hide" disposition

Two patterns, both acceptable. Pick one and stay consistent:

### Pattern A — feature flag

```ts
// ui/src/lib/features.ts
export const FEATURES = {
  kanbanPriorityPill: false,     // EX-01
  kanbanReadyPill: false,        // EX-02
  kanbanDispatchPill: false,     // EX-03
  kanbanRunButton: false,        // EX-04
  kanbanColumnAutoTag: false,    // EX-05
  cockpitRetryAsPrimary: false,  // EX-08
  drawerTerminalTakeover: false, // EX-09 (drawer only)
  issuePageChatDrawer: false,    // EX-11
  runPageAttentionPanel: false,  // EX-12
}
```

Then `if (!FEATURES.kanbanPriorityPill) return <PriorityIcon …/>` at the
relevant render sites. Flags default false; design opens specific ones in
future rounds if a feature graduates.

### Pattern B — straight delete with code preserved in git history

Faster, cleaner runtime, easier to audit visually — but you have to fish
the work back out of git if a feature is later re-approved. Acceptable
when the feature is small and the call site is well-isolated.

**Recommendation:** use Pattern A for EX-08, EX-09, EX-12 (real product
capabilities that may come back); Pattern B for EX-01..EX-05, EX-11
(visual noise that should just go).

## Things that are NOT extras — they're missing primaries

These came up during the comparison and don't go in this list — they're
real spec components that don't exist yet, tracked in
`PARITY_CHECKLIST.md`:

- **ExecutionLog** (the whole inline section on issue) → P0-08
- **NeedsBanner** with Approve / Reject / Comment → P0-08 / P0-09
- **PhaseStrip** compact variant → §17.4
- **ExecRow / ExecFileRow / WorktreeMini / PastRunRow** → §17.5–8

Build those first; then hiding the extras above stops being a regression risk.
