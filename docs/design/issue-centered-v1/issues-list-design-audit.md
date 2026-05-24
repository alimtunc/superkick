# `/issues` — list, kanban, hover, filters — design audit

**Scope.** Implementation vs. the approved Issue-centered V1 mockup. Surfaces in scope:
`/issues` list (default, hover, filter, empty, loading, shipped) and `/issues?view=board` kanban.

**Out of scope** (per [`README.md`](README.md)): Issue Detail, Task Cockpit, Run Detail, execution drawer, Inbox, Settings, Agents.

**Audit source of truth.** [`artifacts/issues-redesign-linear-like.html`](artifacts/issues-redesign-linear-like.html)
artboards 02–06 and 08 (the V3 React components extracted from the bundled
artboard payload — `IssuesV3Default`, `IssuesV3Hover`, `IssuesV3Filters`,
`IssuesV3Shipped`, `IssuesV3Empty`, `IssuesV3Loading`, `IssuesV3Kanban`,
`IssueRowV3`, `GroupHeaderV3`, `IssueHoverV3`, `KCardV3`, `KColV3`,
`FilterBarV3`, `FilterDropdownV3`, `ViewTabsV3`).

Implementation files audited:
[ui/src/routes/_shell/issues.tsx](../../../ui/src/routes/_shell/issues.tsx),
[ui/src/components/issues/](../../../ui/src/components/issues/),
[ui/src/hooks/useIssuesView.ts](../../../ui/src/hooks/useIssuesView.ts),
[ui/src/lib/issues/searchParams.ts](../../../ui/src/lib/issues/searchParams.ts),
[ui/src/lib/domain/issueState.ts](../../../ui/src/lib/domain/issueState.ts).

---

## Headline read

The page is *structurally* on-spec — three tabs, a filter bar, a 36px row,
status/priority Linear glyphs, a hover popover, a kanban toggle, a Done reveal
footer. The bones are there.

What it loses is **rhythm**: the row is shorter than the spec (two metadata
columns dropped), the group headers and shipped/kanban groupings use a
different vocabulary than the mockup, and the surface that most defines the
operator's job — the **pinned "Needs you" band on top of `/issues`** — is
silently absent in both list and kanban. The hover preview is the right shape
but is missing the run-id footer that connects it to the rest of the
issue-centered model.

The single highest-impact correction is **restoring the pinned "Needs you"
band/column**. Every other defect is downstream of how Linear-faithful
each surface reads.

---

## Top 10 gaps ordered by product impact

1. **Pinned "Needs you" band is missing from the default list.** Mockup
   `IssuesV3Default` lifts `needsYou` rows out of their status group and
   renders them under a `tone="warn" pinned` `GroupHeaderV3` at the top —
   this band is the spine of the design ("Default view. *Needs you band
   pinned on top when reviews exist*."). Implementation:
   [useIssuesView.ts:283-307](../../../ui/src/hooks/useIssuesView.ts#L283-L307)
   uses `group=status` by default, so needs-you rows are scattered across
   the standard status buckets. The warn-tinted pinned header
   (`IssueGroupHeader.tsx` already supports `bucket === 'needs'` and renders
   the right warn-soft surface) is wired but never reached in the default
   grouping path. **Operator impact: the "what wants me first" wall the
   redesign is built around does not exist on default load.**

2. **Kanban column set is wrong and "Needs you" is not pinned first.**
   Mockup `IssuesV3Kanban` columns left → right:
   `Needs you (pinned) · Backlog · Todo · In Progress · In Review · Done`.
   Implementation
   [issueState.ts:28-34](../../../ui/src/lib/domain/issueState.ts#L28-L34)
   ships 5 columns: `open · in_progress · needs_human · in_review · done` —
   Backlog and Todo are collapsed into a single "Open" column, and
   `needs_human` sits in the middle rather than being pinned at the
   leftmost edge as a Superkick-specific lane with warn-tinted header.
   The kanban no longer reads as the Linear board the mockup defined.

3. **Row is missing Sub-issue tally and Estimate columns.**
   Mockup `IssueRowV3` column order:
   `Priority · Status · ID · Title · Labels · Sub · Project · Est · Assignee · Updated · TaskDot`.
   Implementation
   [IssueRow.tsx:30-99](../../../ui/src/components/issues/IssueRow.tsx#L30-L99)
   ships:
   `Priority · Status · ID · Title · Labels · Project · Assignee · Updated · TaskDot`.
   The two Linear-tally chips (`3/5` sub-issue glyph + `5` estimate chip)
   are absent. Without them the row reads thinner than Linear and the
   "Linear-faithful 36px" promise of the spec is not delivered.

4. **Group header uses a colored dot instead of the matching status glyph.**
   Mockup `GroupHeaderV3` renders the same `StatusIcon` as the rows below
   it (`statusIcon={<StatusIcon kind={g.id} size={13}/>}`), so the eye
   tracks each group by *icon shape*. Implementation
   [IssueGroupHeader.tsx:13-50](../../../ui/src/components/issues/IssueGroupHeader.tsx#L13-L50)
   renders an `inline-block size-2 rounded-full` colored dot only. Rhythm
   is lost on every section break — particularly visible at Needs / In
   Progress / In Review / Done where the icon is the point of the visual
   vocabulary.

5. **Shipped tab does not bucket by completion window.** Mockup
   `IssuesV3Shipped` groups Done issues into "Last 3 days" / "Last 7 days"
   buckets with a `done` status glyph, and the filter bar shows
   `Group: Completed · Sort: Completed` display chips. Implementation
   [useIssuesView.ts:155-178](../../../ui/src/hooks/useIssuesView.ts#L155-L178)
   filters to Done within 7d but then falls into the default
   `group=status` flow, rendering a single "Done" group; the filter bar
   keeps showing `Group: Status · Sort: Priority`. The shipped tab loses
   its temporal story.

6. **Hover preview is missing the linked-run footer.**
   Mockup `IssueHoverV3` ends with a `void`-surface footer band:
   `🔵 run-9c1f · implement · 2m elapsed   [Open]`. This is the
   issue-centered hand-off back to the run. Implementation
   [IssuePreview.tsx:99-118](../../../ui/src/components/issues/IssuePreview.tsx#L99-L118)
   renders two small `Pill`s (run state + PR) in a thin row — no run id, no
   phase, no elapsed, no surface contrast, no `Open` affordance. The
   preview no longer connects an issue to *the* live run; it just says
   "something is running."

7. **Hover preview is missing the assignee · sub · estimate strip.**
   Per the mockup spec for artboard 03: hover card contains
   "assignee · sub-issues · estimate strip, last comment, linked run."
   Implementation has assignee only inside the `Pill`s on detail page,
   not on the hover card; sub-issues and estimate never appear on the
   card. The hover-card body is missing one entire band — between labels
   and last comment.

8. **Project tag uses a chevron glyph instead of the spec'd folder.**
   Mockup `ProjectTag` and the `FilterDropdownV3` Project facet both use
   `Icon name="folder"`. Implementation
   [IssueRow.tsx:79-83](../../../ui/src/components/issues/IssueRow.tsx#L79-L83)
   uses `Icon name="chev"`. The mockup's small folder glyph is part of
   the shared vocabulary with the filter dropdown — swapping it for a
   chevron makes the row's project cell visually ambiguous (a chev next
   to text usually reads as "expandable" or "click for more").

9. **Filter dropdown does not flag "Task state" with the SK accent badge.**
   Mockup `FilterDropdownV3` gives the Task state row a `highlight=true`
   treatment: raised background + a small `SK` accent pill, with the meta
   text `running · needs · review · shipped`. Implementation
   [IssueFilterDropdown.tsx:44](../../../ui/src/components/issues/IssueFilterDropdown.tsx#L44)
   already carries the `meta` string, but the SK badge and the
   `highlight` background never render — the operator loses the explicit
   "this is the only Superkick-specific facet" cue, and Task state looks
   like just another Linear facet.

10. **Kanban Done column is uncollapsed.** Mockup `IssuesV3Kanban` shows
    ~2 done cards in the Done column with a `Show all 143 →` link below.
    Implementation
    [KanbanColumn.tsx:79-99](../../../ui/src/components/issues/KanbanColumn.tsx#L79-L99)
    streams the full done set. On a real workspace the Done column will
    dominate the kanban's horizontal real-estate; the spec keeps it
    quiet by intent (Done lives on the Shipped tab; the kanban just
    confirms recent ones exist).

---

## Smallest surgical corrections (no scope creep)

These are the minimal, targeted edits to take each gap from broken to
matching the mockup — no refactors, no architecture moves.

### 1 — Pinned "Needs you" band

`useIssuesView.buildGroups` already produces correct status groups; before
they are returned, partition `needsYou` rows (rows whose
`bucketByIdentifier === 'needs'`) into a synthetic `IssueGroup` keyed
`needs`, `bucket: 'needs'`, `label: 'Needs you'`, `tone: 'warn'`. Render
it first. `IssueGroupHeader` already styles the `pinned` band correctly
(`border-t-warn/25`, `bg-warn-soft`, "Pinned" uppercase chip) — no
component change needed. Only required surface: list + kanban renderers.

### 2 — Kanban column set

Two changes, both in [issueState.ts](../../../ui/src/lib/domain/issueState.ts):

- Add `backlog` and `todo` as distinct `IssueState` lanes (use Linear
  `state_type=backlog` and `state_type=unstarted` respectively in
  `LINEAR_STATE_TO_ISSUE_STATE` / `LAUNCH_QUEUE_TO_ISSUE_STATE`).
  `ISSUE_STATE_ORDER` becomes `['needs_human', 'backlog', 'todo',
  'in_progress', 'in_review', 'done']` with `needs_human` styled
  `pinned` (warn border) in `KanbanColumn`.
- In `KanbanColumn`, when `state === 'needs_human'` render the column
  header with the warn-tinted border-bottom + warn `StatusIcon` to
  match `GroupHeaderV3 pinned`.

This keeps the existing DnD wiring intact (already only droppable
states persist).

### 3 — Row gets Sub + Estimate

Add two cells to [IssueRow.tsx](../../../ui/src/components/issues/IssueRow.tsx)
between Labels and Project:

```
<SubCountChip done={…} total={…} />
<ProjectTag name={…} />
<EstimateChip n={…} />
```

The mockup component definitions (`SubCountChip` width-42, `EstimateChip`
width-22, both already specified in
[/tmp/mockup-0c0031fd.jsx](#) — extracted from the V3 row file) are
trivially portable. **Data caveat (see §"Real defects vs. data mismatch"
below):** these fields aren't in `LinearIssueListItem` yet — render the
columns as fixed-width placeholders for now so the row geometry already
matches; populate them when the Linear hydrator exposes
`subIssueSummary` and `estimate`.

### 4 — Group header uses StatusIcon

In [IssueGroupHeader.tsx](../../../ui/src/components/issues/IssueGroupHeader.tsx)
take an optional `statusKind` prop (mapped from `bucket` or from the
group's status name in `buildGroups`). When provided, render
`<StatusIcon kind={statusKind} size={13}/>` in place of the colored dot.
Keep the dot fallback for non-status groupings (group=priority,
group=project, etc.).

### 5 — Shipped tab bucketed by completion window

In `useIssuesView.buildGroups`, branch on `tab === 'shipped'`: produce
two synthetic groups `last-3d` (label "Last 3 days") and `last-7d`
(label "Last 7 days"), partitioning the already-windowed done rows by
age vs. `now`. Both groups carry `bucket: 'done'`, `tone: 'success'`,
and the existing `IssueGroupHeader` renders them correctly once #4 is
landed (status glyph = `done`).

Also: when `tab === 'shipped'`, force the `IssueFilterBar` to display
`Group: Completed · Sort: Completed` as its display chips (the
underlying URL state need not change — these are display labels only,
the operator never reaches the dropdown on this tab).

### 6 — Hover preview run footer

In [IssuePreview.tsx](../../../ui/src/components/issues/IssuePreview.tsx)
replace the current "linked run + PR pills" row (lines 99-118) with a
distinct footer band on `bg-canvas` (the `--sk-void` token):

```
[pulse dot] run-9c1f  · phase · {elapsed}      [Open ↗]
```

Phase comes from the run's current event (`implement`, `review`, etc. —
the existing `useRunLifecycle` exposes this). Elapsed from
`fmtRelativeShort(run.started_at)`. The "Open" link routes to
`/runs/$runId`. This restores the issue → run hand-off the
issue-centered model relies on.

### 7 — Hover preview assignee/sub/est strip

Insert one row above "last comment" in `IssuePreview`:

```
👤 Assigned to {avatar} {name}    {SubCountChip}    {EstimateChip}
```

Same component lifts from the row work in #3 — the data caveats apply
(estimate/sub-issues need Linear hydration).

### 8 — Project glyph

[IssueRow.tsx:80](../../../ui/src/components/issues/IssueRow.tsx#L80):
swap `<Icon name="chev" size={11} />` for `<Icon name="folder" size={11} />`.
One-line edit.

### 9 — Filter dropdown Task state highlight

In [IssueFilterDropdown.tsx:125-148](../../../ui/src/components/issues/IssueFilterDropdown.tsx#L125-L148)
when rendering the Task state axis, add a `bg-raised` background to the
row and an inline accent badge: `<span class="text-accent border border-accent">SK</span>`.
The mockup spec is in
`FilterDropdownV3` (`x.highlight && (<span … SK</span>)`).

### 10 — Kanban Done collapse

In [KanbanColumn.tsx](../../../ui/src/components/issues/KanbanColumn.tsx)
when `state === 'done'`, slice the rendered items to the first 2 (or
3) and render a single muted link row beneath: `Show all {n} →` that
navigates the operator to `/issues?tab=shipped`. No DnD change (done is
already non-droppable for fresh writes).

---

## Lower-impact polish (still real defects, not data)

These don't change the headline experience but each is a pixel-level
mismatch with the approved mockup:

- **Filter bar Group/Sort use native `<select>`** instead of the
  `DisplayChip` popover pattern. The native chrome clashes with the
  dashed `+ Filter` chip and the segmented LayoutToggle.
  ([IssueFilterBar.tsx:330-357](../../../ui/src/components/issues/IssueFilterBar.tsx#L330-L357))
  Surgical fix: wrap each in a `Popover` with the same look as the
  shadcn dropdown menu already in the codebase.

- **Tabs prepend a `star` icon on "My open work"**
  ([IssueViewTabs.tsx:37](../../../ui/src/components/issues/IssueViewTabs.tsx#L37));
  the mockup has no leading icon on any tab. Remove the icon.

- **Tab counts render as plain mono digits**, not as the raised pill
  the mockup uses (`bg-raised, min-w-16, sk-mono, rounded`). One CSS
  swap in `IssueViewTabs.tsx`.

- **"New view" affordance is disabled with `opacity-60`**, reading as
  broken. Mockup renders it as a subtle interactive `+ New view` row
  (no opacity dampening, hover-only highlight). Either remove the
  `disabled` or hide the entire button until saved views ship.

- **Empty state never receives a CTA action.**
  [issues.tsx:152-159](../../../ui/src/routes/_shell/issues.tsx#L152-L159)
  renders `IssuesEmptyState` with `title` + `description` only — the
  `action` slot is unused. The mockup `IssuesV3Empty` ships
  `[Switch to All open] [New issue]` as primary actions plus an inline
  link to All open inside the body. The operator currently has no
  one-click escape from the empty `mine` tab.

- **Loading skeleton geometry has no Sub or Estimate columns**
  ([IssueRowSkeleton.tsx:32-47](../../../ui/src/components/issues/IssueRowSkeleton.tsx#L32-L47))
  and no staggered shimmer delay. Once #3 lands, mirror the new
  columns and add a `style={{ animationDelay: …}}` per row to match
  `SkRow`'s `delay * 0.08s` pattern.

- **Hover preview width**: `w-115` (460px) vs. mockup 480px.
  ([IssuePreview.tsx:54](../../../ui/src/components/issues/IssuePreview.tsx#L54))
  Change `w-115` → `w-120` once #6–#7 add vertical content; otherwise
  the silhouette feels cramped.

- **Filter dropdown ordering and icons don't match.** Mockup order:
  Assignee · Creator · Priority · Status · Label · Project · Repo ·
  Milestone · Cycle · Estimate · Created · Updated · Completed ·
  Has sub-issues · Task state. Implementation
  [IssueFilterDropdown.tsx:37-46](../../../ui/src/components/issues/IssueFilterDropdown.tsx#L37-L46)
  ships Assignee · Status · Priority · Label · Project · Repo · Task
  state · Created. Reorder + add the missing facets only when their
  data is actually wired (see "data mismatch" section).

- **`IssueGroupHeader` has a `chev` rotation animation but no trailing
  `+ / ⋯` icons.** Mockup `GroupHeaderV3` puts a small `plus` and
  `more` icon at the right edge of every group header. Add the
  trailing icon cluster (purely visual; clicks can be no-ops for V1).

- **`KanbanIssueCard` body uses `SeverityPill` (P0–P4) instead of
  `PriorityIcon` (bar-stack glyph).**
  ([KanbanIssueCard.tsx:156-161](../../../ui/src/components/issues/KanbanIssueCard.tsx#L156-L161))
  The 36px row uses `PriorityIcon` already — the kanban card should
  too, for vocabulary consistency. The mockup `KCardV3` uses
  `PriorityIcon kind={row.priority} size={11}`.

- **Kanban card is missing the estimate inline chip** (mockup
  `KCardV3` header row puts `5` inside a bordered mono chip next to
  the identifier).

- **Kanban "auto" tag on derived columns** (`needs_human`, `in_review`)
  is a Superkick concept absent from the mockup vocabulary; consider
  surfacing it as a tooltip on the column header instead of inline
  text to avoid breaking the Linear visual.

---

## Real defects vs. acceptable data / story mismatch

Splitting the gap list so the implementation team can focus on **what
the code is failing to render** vs. **what the mockup shows that we
don't have data for yet**.

### Real defects (data exists or none needed — fix the code)

- Pinned "Needs you" band on default list (#1) — `bucketByIdentifier`
  already produces a `needs` bucket; the renderer just doesn't pull it
  out.
- Pinned "Needs you" + Backlog + Todo columns in kanban (#2) —
  `LinearIssueListItem.status.state_type` already distinguishes
  `backlog` vs. `unstarted`; we deliberately collapsed them.
- Group header status glyph (#4) — `StatusIcon` exists, `bucket` is
  already passed through.
- Shipped bucketed by completion window (#5) — `updated_at` is
  available; we already use it to gate the shipped window.
- Hover preview run-id footer (#6) — `wrapper.linkedRun.run.id`,
  `state`, and `started_at` are already in the wrapper.
- Project glyph swap chev → folder (#8) — one-line CSS.
- Filter dropdown Task state SK highlight (#9) — purely presentational.
- Kanban Done collapse to "Show all → /issues?tab=shipped" (#10) —
  data is there; we render too much of it.
- Tabs: star icon, count pill, "New view" opacity (polish list) — all
  presentational.
- Empty state CTA actions (polish list) — `IssuesEmptyState` already
  accepts an `action` slot.

### Acceptable data / story mismatch (don't fake it)

- **Sub-issue tally (`3/5`)** — `LinearIssueListItem` does not
  currently carry a `subIssueSummary`. Mockup renders synthetic
  `sub: { done: 1, total: 4 }` per row. **Do not** invent fake
  counts. Ship the column geometry (reserved 42px slot from the
  mockup) so the row's pixel rhythm matches *now*, and populate when
  the Linear hydrator surfaces sub-issue children. Same applies to
  `estimate` (22px slot).

- **Assignee variety on rows** — mockup uses bot avatars (`fix-bot`,
  `senior-bot`, `review-bot`) for some rows. These are story fixtures
  for visual richness; do not invent bot assignees just to match the
  mockup texture. Render the real Linear assignee or the dashed empty
  ring (already shipped in `AssigneeAvatar`).

- **Linked-run footer phase (`implement`, `review`)** — phase strings
  in the mockup are illustrative. Use whatever phase string the actual
  run lifecycle exposes (or omit the `· phase ·` segment) — do not
  hard-code mockup-style phases.

- **PR pill** — mockup hover card does *not* surface a PR pill
  ([IssuePreview.tsx:113-115](../../../ui/src/components/issues/IssuePreview.tsx#L113-L115)
  adds one). Either remove it (faithful to mockup) or treat it as an
  intentional Superkick extension — but call it out as a deliberate
  deviation rather than a defect.

- **Cycle / Milestone / Creator / Has sub-issues / Completed-date
  facets** in the filter dropdown — Linear exposes most of these, but
  the hydration is not wired. Don't add the facet entries until the
  data is present; an empty dropdown facet is worse than a missing one.

- **Group headers' `+` and `⋯` trailing icons** — purely cosmetic in
  the mockup; both are no-ops there. Add them only when there is a
  real menu to hang on them, otherwise they're vestigial chrome.

- **Recent-shipped counts ("12 done this week")** in the footer —
  `useIssuesView.doneCountThisWeek` already computes this; the footer
  reads from real data. No defect.

---

## Suggested ticket split

To keep PRs scoped to one visual concern each (matches `/ticket-triage`
defaults for medium tickets):

| Ticket | Surface | Files |
|---|---|---|
| A | Needs-you band on list + status glyph in group headers (#1, #4) | `useIssuesView.ts`, `IssuesListView.tsx`, `IssueGroupHeader.tsx` |
| B | Row: Sub + Estimate slots + folder glyph (#3, #8) | `IssueRow.tsx`, `IssueRowSkeleton.tsx`, new `SubCountChip` + `EstimateChip` in `components/issues/` |
| C | Hover preview parity (#6, #7) | `IssuePreview.tsx`, `useRunLifecycle` (read-only) |
| D | Shipped tab completion-window grouping (#5) | `useIssuesView.ts` only |
| E | Kanban column set + Done collapse + needs-pinned header (#2, #10) | `issueState.ts`, `IssuesKanbanView.tsx`, `KanbanColumn.tsx`, `KanbanIssueCard.tsx` |
| F | Filter dropdown SK badge + dropdown polish (#9 + polish list) | `IssueFilterDropdown.tsx`, `IssueFilterBar.tsx`, `IssueViewTabs.tsx`, `IssuesEmptyState` wiring in `issues.tsx` |

Each ticket is one PR. None depend on the others except B → C (the
`SubCountChip` / `EstimateChip` components are shared between row and
hover card).
