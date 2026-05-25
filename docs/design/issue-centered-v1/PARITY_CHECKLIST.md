# Parity checklist — Issue-centered v1 (v2 · verified against codebase)

> **What changed in v2.** I compared the running build (`superkick/ui/src/**`) against
> the spec line-by-line, not just from screenshots. Every item below carries
> a **STATUS** field. The previous heuristic version is preserved at
> `PARITY_CHECKLIST.v1.md` for diffing.
>
> Status legend:
>
> - ✅ **confirmed** — drift exists in the code; file + lines cited.
> - ❌ **not a bug** — implementation already matches the spec.
> - ⚠️ **partial** — implementation does most of it right but drifts on a sub-point.
> - ❓ **could not verify** — needs eyes on a running surface I didn't reach.
>
> Citations point at paths inside the attached `superkick/` folder.

---

## P0 · breaks the design language

### P0-01 · ~~Sidebar still surfaces Tasks and Runs~~

- **STATUS: ❌ not a bug**
- Code: `superkick/ui/src/shell/Sidebar.tsx` — NAV array (around line 24) has only
  `inbox`, `issues`, `agents` (+ `settings` at the bottom). Tasks and Runs are
  already gone.
- **Action:** none. Foundation 5 is upheld on the sidebar surface.

### P0-02 · Issue row height is 32px, not 36

- **STATUS: ✅ confirmed**
- Code: `superkick/ui/src/components/issues/IssueRow.tsx` line ~37 →
  `className="group flex h-8 items-center …"`. `h-8` is **32px**.
- Spec §8.1 requires **36px** (`h-9`).
- **Action:** change `h-8` → `h-9` (and audit any keyboard scroll / virtualization that assumes 32).

### P0-03 · Issue row is missing the Sub-count, Estimate, and Task-state columns

- **STATUS: ✅ confirmed (3 missing columns)**
- Code: `IssueRow.tsx` lines 39–98 — column order is:
  Priority · Status · ID · Title · Labels · Project · Assignee · Updated · TaskDot.
- Spec §8.2 requires (between Labels and Project):
  - **Sub-count** column · 42 wide right-aligned (uses `<SubCountChip>` or 42px spacer).
  - **Estimate** column · 22 wide (uses `<EstimateChip>` or 22px spacer).
- Project column also lacks the 140-wide cap + folder glyph (see P0-06).
- **Action:** add `SubCountChip` + `EstimateChip` primitives (don't exist yet
  under `ui/src/ui/`) and slot them in. Spacer when no value, so column
  alignment is stable.
- **Data gap:** D-02 (sub `{done,total}`) and D-03 (estimate). The columns
  must render even when these are null — empty spacers, not "—".

### P0-04 · ~~Row hover background uses accent or overlay~~

- **STATUS: ❌ not a bug**
- Code: `IssueRow.tsx` line ~37 → `hover:bg-raised focus-visible:bg-raised`.
- Matches spec §8.3 (hover = `--sk-raised`).
- **Action:** none.

### P0-05 · TaskDot column geometry is wrong but glyph is correct

- **STATUS: ⚠️ partial**
- Code: `IssueRow.tsx` line ~96 → `<span className="flex w-2 shrink-0 …">`.
  `w-2` = 8px wrapper.
- Spec §8.2: TaskDot column is **10px wide** (centered 8px dot).
- The glyph itself (`<TaskDot kind=…>`) is present and conditional on
  `taskBadgeKindFor(wrapper, bucket, now)`, so the "text label" pitfall is
  avoided. Good.
- **Action:** widen wrapper to `w-2.5` (10px).
- **Data gap:** D-01 — `taskKind` derivation depends on bucket data being
  wired up; verify `taskBadgeKindFor` returns the four kinds (needs / running /
  review / shipped) and not just two.

### P0-06 · Project column uses `chev` icon and lacks a width cap

- **STATUS: ✅ confirmed (new finding — was not in v1 checklist)**
- Code: `IssueRow.tsx` line ~83 →
  ```
  <Icon name="chev" size={11} />
  {issue.project.name}
  ```
  This is the `>` chevron, not `folder`. Visible in screenshot 1 as
  `> Superkick Product` strings on every row.
- Spec §8.2: `<ProjectTag>` is `folder` glyph + name, `max-width: 140`,
  truncated.
- **Action:**
  ```diff
  - <Icon name="chev" size={11} />
  + <Icon name="folder" size={11} className="text-fg-dim" />
  ```
  and wrap the cell in `max-w-[140px] truncate`.

### P0-07 · Issue Detail right rail still embeds the deprecated Tasks tile

- **STATUS: ✅ confirmed (architecture-level drift)**
- Code: `superkick/ui/src/components/issue-detail/IssueDetailRail.tsx` line 22:
  ```
  <div className="mt-5">
    <ExecutionStatusCard issue={issue} />
  </div>
  ```
  And `ExecutionStatusCard.tsx` is a direct port of A1's deprecated
  `TaskLinkTile` (sk-v3-detail.jsx → `function TaskLinkTile`): Zap icon +
  "Tasks N" + Newest first + one `<TaskRunRow>` + "Launch task" CTA. Confirmed
  visually in screenshot 2 ("Tasks · 1 / Newest first / fa8e8b84… running just
  now / Open run / Launch another").
- Spec §13.5: **remove this tile entirely.** A3 supersedes A1 — the rail is
  properties-only.
- **Action:** delete the `<ExecutionStatusCard>` import + invocation from
  `IssueDetailRail.tsx`. Don't delete the file yet; its launch-CTA logic
  partially feeds into the topbar's `Launch task` button (verify
  `IssueDetailTopbarRight.tsx`).

### P0-08 · ExecutionLog (inline body section) does not exist

- **STATUS: ✅ confirmed (entire component missing)**
- Code: there is **no file** named `ExecutionLog.tsx` (or equivalent) under
  `ui/src/components/issue-detail/`. `IssueDetail.tsx` body composition is
  just `<IssueFeed>` + `<IssueReplyComposer>` — no execution section between
  description and activity.
- Spec §17 defines a complete component with 9 sub-anatomies: header, state
  chip, NeedsBanner, PhaseStrip, ExecSection (× recent activity / files /
  worktree / past runs), idle empty state.
- **Action:** new component file
  `ui/src/components/issue-detail/ExecutionLog/index.tsx` plus sub-components.
  Insert into `IssueDetail.tsx` between `<IssueFeed>`-description and
  `<IssueFeed>`-activity (probably needs splitting `IssueFeed` first).
- **Data gaps blocked on this:** D-06 (run.phases), D-07 (recentActivity),
  D-08 (files), D-09 (worktree), D-11 (pastRuns), D-14 (needsHumanReason).
  Visual scaffold + skeleton is shippable now; live data wiring follows.

### P0-09 · Needs-human Approve/Reject placement — UNVERIFIABLE today

- **STATUS: ❓ could not verify**
- The current build has no NeedsBanner anywhere (P0-08 not started). When it
  is built, the placement constraint applies (§17.3 + §18.10).
- Concrete risk: the Run Inspector has an `AttentionRequestPanel.tsx`
  component (`ui/src/components/run-detail/`) which suggests approval-style
  interactions live on the run page today. To validate, file a check at PR
  time: when implementing ExecutionLog, Approve/Reject must NOT call into
  `AttentionRequestPanel` from the issue page — that pattern stays on the run
  page only as legacy.

### P0-10 · ChatDrawer present in IssueDetail

- **STATUS: ✅ confirmed (minor architecture drift)**
- Code: `IssueDetail.tsx` line ~99 →
  ```
  <ChatDrawer subject={{ kind: 'issue', identifier: issue.identifier }} />
  ```
- Spec §17.10: no chat surface with the agent on the issue page. Approve /
  Reject / Comment via NeedsBanner; human comments via the regular composer.
- However — the ChatDrawer here is a Cmd+J-style overlay, not in-flow. It
  doesn't push the agent chat into the body. **Recommendation:** lower this
  to P1 ("present but dormant; remove on next pass") unless product wants
  it gone immediately.
- **Action:** discuss with product. Either remove the import, or document the
  intended trigger and ensure it never auto-opens on a needs-human run.

### P0-11 · Linear status / priority glyphs

- **STATUS: ❌ not a bug**
- Code: `IssueRow.tsx` imports `StatusIcon`, `PriorityIcon` from `@/ui` and
  uses them with `kind` derived from Linear values. `ui/src/ui/StatusIcon.tsx`
  + `PriorityIcon.tsx` exist as proper SVG glyphs (verified file list).
- **Action:** none.

### P0-12 · Selected row missing the inset accent rail

- **STATUS: ✅ confirmed (selected state only — hover is fine)**
- Code: `IssueRow.tsx` line ~40 →
  ```
  focused ? 'bg-raised ring-1 ring-accent-soft ring-inset' : null
  ```
- Spec §8.3 says **selected** = `bg --sk-accentSoft` PLUS
  `box-shadow: inset 2px 0 0 var(--sk-accent)` (left 2px accent rail).
- Current code:
  - Background uses `bg-raised` (same as hover, not accent-soft).
  - Adds a 1px accent-soft *ring around the whole row* — wrong direction.
- **Action:**
  ```diff
  - focused ? 'bg-raised ring-1 ring-accent-soft ring-inset' : null
  + focused ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--sk-accent)]' : null
  ```

### P0-13 · Status property in rail renders as a chip pill instead of icon + text

- **STATUS: ✅ confirmed (new finding — was not in v1 checklist)**
- Code: `IssuePropertiesBlock.tsx` line ~38 →
  ```
  <StatusChip status={issue.status} />
  ```
- Spec §13.4: Status row is `<StatusIcon size=13> <text 12.5 fg>`. **Not** a
  chip. Visible in screenshot 2 (the "Todo" pill on the right).
- All other status indicators in the system use `<StatusIcon>`; the rail
  alone uses the legacy `<StatusChip>`.
- **Action:** replace with `<StatusIcon kind={statusIconKindFromLinear(...)} size={13}/>`
  + `<span className="text-[12.5px] text-fg">{statusName}</span>`.
- Note: `StatusChip` is also used in `<TaskRunRow>` and the kanban card view;
  keep it for those callsites — only the rail needs the swap.

---

## P1 · high-impact visual mismatches

### P1-01 · Sidebar item icon size and font size off

- **STATUS: ✅ confirmed (was not in v1)**
- Code: `Sidebar.tsx` NavRow → `text-[13.5px]`, icons `size={16}`.
- Spec §7.1: nav items are `font-size 13`, icons `size 14`.
- The active rail itself is correct (`w-[2px] bg-accent top-[6px] bottom-[6px] rounded-[2px]`).
- **Action:** `text-[13.5px]` → `text-[13px]`; `size={16}` → `size={14}`.

### P1-02 · ViewTabs active underline uses accent + tab geometry off

- **STATUS: ✅ confirmed**
- Code: `IssueViewTabs.tsx`:
  - Container `h-10` (spec: 38), `px-6` (spec: 16), `gap-1` (spec: 0).
  - Tabs `border-accent` when active (spec: underline = `--sk-fg`).
  - Tabs `px-2` (spec: 12), `text-[12px]` (spec: 13).
  - Count badge is plain `text-[11px] text-fg-dim` — **missing the count chip
    bg/border/min-width** (spec: 11px, padding 0/5, radius 4, bg raised,
    min-width 16).
- **Action:** rework the whole component per §10.1. The accent-underline
  swap is one tiny change but the rest needs surgery.

### P1-03 · `+ Filter` button — needs check

- **STATUS: ❓ could not verify (IssueFilterBar not opened)**
- File exists at `IssueFilterBar.tsx`; spec §10.2 requires the button to be
  **dashed border**. Check at PR time.

### P1-04..P1-05 · Filter chips + dropdown — needs check

- **STATUS: ❓ could not verify**
- Files exist (`IssueFilterDropdown.tsx`) but their contents weren't read.
  Worth a quick pass: the "Task state" facet must carry the **SK tag**
  (§10.3).

### P1-06 · Hover card width/delay

- **STATUS: ⚠️ partial — delay is correct, width unverified**
- Code: `IssueRow.tsx` line 33 → `<HoverCard openDelay={350}>` — **350ms ✓**.
- Width from `HoverCard.tsx` / `IssuePreview.tsx` not read here. Check it
  renders at **480px**.

### P1-07 · Hover card layered backgrounds

- **STATUS: ❓ could not verify**
- Same files as above; need to confirm the `surface → void` step-down for
  the last-comment and linked-run sections.

### P1-08..P1-09 · Kanban card height + drop tint

- **STATUS: ❓ could not verify**
- Files: `KanbanCard.tsx`, `KanbanIssueCard.tsx`, `KanbanColumn.tsx`.

### P1-10 · Issue Detail rail width is 320, spec says 308

- **STATUS: ✅ confirmed**
- Code: `IssueDetailRail.tsx` line 14 → `w-[320px]`.
- Spec §13.1 / §13.4: **308**.
- **Action:** `w-[320px]` → `w-[308px]`.

### P1-11 · Property rail rows lack the hit area

- **STATUS: ✅ confirmed**
- Code: `IssuePropertiesBlock.tsx` `<Row>` component lines 13–20 →
  ```
  <div className="flex min-h-7 items-start gap-3 py-1.25">
  ```
  No radius, no cursor, no hover bg, no padding-x. Just `min-h-7` and a
  vertical gap.
- Spec §13.4: PropRow is `grid 92px 1fr / gap 8 / padding 5 8 / radius 5 / min-height 28 / cursor pointer`.
- **Action:** wrap the Row in:
  ```
  className="grid grid-cols-[92px_1fr] items-center gap-2 min-h-7 rounded-[5px]
             px-2 py-1.25 cursor-pointer hover:bg-raised"
  ```
  Also `gap-3` → `gap-2` (12 → 8).

### P1-12 · Property rail uses no card chrome — correct

- **STATUS: ❌ not a bug**
- The rail is a flat list; no outer card. ✓

### P1-13 · Sub-issues progress bar — needs check

- **STATUS: ❓ could not verify**
- File: `ui/src/components/issue-detail/ChildIssues.tsx`. Verify the header
  has the 80×5 progress bar with success fill.

### P1-14 · Comment card spacing — needs check

- **STATUS: ❓ could not verify**

### P1-15 · "agent" / "SK" provenance tag — needs check

- **STATUS: ❓ could not verify**

### P1-16..P1-21 · ExecutionLog details

- **STATUS: blocked by P0-08** (component doesn't exist yet)
- These become relevant once the inline section is being built. Use §17
  measurements verbatim.

### P1-22 · Drawer width

- **STATUS: ❌ not a bug**
- Code: `ui/src/components/ui/side-drawer.tsx` line 10 →
  `compact: 'w-[640px] max-w-full'`. ✓
- The drawer in screenshot 3/4 LOOKS wide because the viewport is ~2880px;
  640px ≈ 22% width is what the spec asks for.

### P1-23 · Drawer URL strategy

- **STATUS: ❓ could not verify (architectural)**
- Code: `RunDrawer.tsx` reads from `useRunDrawerStore` (Zustand). Verify the
  store also writes/reads `?run=<id>` so the URL is sharable + survives
  reload (§18.10).

### P1-24 · Drawer tab bar contents

- **STATUS: needs check vs `RunDrawerTabs.tsx`**
- The screenshot (3) shows: Activity · Tools · Files · Logs · Terminal. ✓
- The trailing "Raw" tab from the spec is missing. **Action:** add it or
  drop it from the spec — confirm with design.

### P1-25 · Drawer Terminal tab is a takeover dialog, not an output stream

- **STATUS: ✅ confirmed (significant UX drift — was not in v1 checklist)**
- Visible in screenshot 4: the Terminal tab shows "DIRECT TERMINAL ACCESS · primary + takeover"
  with INSPECT / CONTINUE / FORCE TAKEOVER cards. The spec (§18.9) defines
  Terminal as: context row (path + idle status), live pre output, input
  row. No takeover dialog.
- Code path: `ui/src/components/run-detail/TerminalTakeover.tsx` and
  `TerminalTakeoverModeButton.tsx` are wired into the drawer's Terminal tab
  (not the spec's read-only stream view).
- **Action:** this is a real product decision, not a layout bug. The current
  build adds explicit takeover semantics that the spec doesn't cover. **Take
  this to design before changing anything** — either:
  - The spec needs amending to accommodate primary/takeover (preferred — the
    feature already shipped), or
  - Implementation reverts to the simple stream + collapsed-strip pattern.
  Filed as P1 (not P0) because it doesn't break the design *language* — but
  it's a contract gap.

### P1-26 · Run Inspector chat composer

- **STATUS: ❓ could not verify**
- File: `RunInspector.tsx`; the spec says the bottom should be a collapsed
  terminal strip, not a chat box.

### P1-27..P1-28 · Empty / loading states

- **STATUS: ❓ could not verify**

### P1-29 · `/tasks/<id>` is reachable as a primary URL (not debug-gated)

- **STATUS: ✅ confirmed (new finding)**
- Code: `ui/src/routes/_shell/tasks.$taskId.tsx` is registered with no
  feature flag. Visiting `/tasks/<id>` directly works (screenshot 6).
- Spec §0 Foundation 5 + the nav memo say this should be `?debug=task` only.
- **Action:** product call. Either gate the route on a debug flag, or amend
  the spec. The Task Cockpit's existence isn't itself wrong; what's wrong is
  that it's a first-class URL.

### P1-30 · Group header uses a generic colored dot, not StatusIcon

- **STATUS: ✅ confirmed (was P0 in v1 — downgrading)**
- Code: `IssueGroupHeader.tsx` lines 14–18 → `DOT_CLASS` maps lifecycle
  buckets to `bg-warn / bg-info / bg-accent / bg-fg-dim`, then renders a
  plain colored dot.
- Spec §9: group headers use `<StatusIcon kind="…">` (the Linear glyph), not
  a flat dot.
- However: the implementation groups by **lifecycle bucket** (needs / active
  / launchable / open / done) whereas the spec groups by **status**
  (Backlog / Todo / In Progress / In Review / Done / pinned Needs you).
  These map differently. Before swapping glyphs, decide whether grouping
  changes — the current "lifecycle bucket" grouping was an earlier design
  decision and may pre-date the Linear-faithful redesign.

---

## P2 · polish

(Largely unchanged from v1 — all unverified. Most are tiny CSS adjustments
that become relevant once P0 + P1 are clean.)

The one P2 worth surfacing now:

### P2-12 · Avatar default uses bg-raised + initials, no per-person color

- **STATUS: ✅ confirmed**
- Code: `ui/src/ui/Avatar.tsx` (file exists) and `AssigneeAvatar.tsx`
  (issues) — avatars are rendered with `name` + `size` but no `color` prop.
- Spec §6.3 calls for **hand-assigned per-agent colors** (e.g. `fix-bot →
  #3a6f4e`). The current build will produce identical-looking avatars for
  different agents.
- **Action:** add a small `agentColor(name)` lookup or a server-supplied
  field. Don't hash — names that share a hash bucket end up looking the
  same.

---

## Codebase-wide findings (not surface-specific)

### CW-01 · No spacing token for the spec's `lg = 16` vs current `gap-3 = 12` mismatch

Throughout, Tailwind utilities are used directly (gap-3, py-1.25, w-[320px]).
The spec's design tokens (`s.lg = 16`, `r.md = 8`) exist in
`screens/sk-tokens.jsx` but **are not mirrored in the implementation's
Tailwind config**. Result: agents pick the nearest Tailwind utility, which
drifts.

**Recommendation:** add a small `theme.extend` block to the Tailwind config:

```js
theme: {
  extend: {
    spacing: {
      'sk-xs': '4px', 'sk-sm': '8px', 'sk-md': '12px',
      'sk-lg': '16px', 'sk-xl': '24px', 'sk-xxl': '32px',
    },
    borderRadius: {
      'sk-sm': '6px', 'sk-md': '8px', 'sk-lg': '10px', 'sk-xl': '12px',
    },
  },
}
```

Then SPEC §4 measurements paste directly as `gap-sk-sm`, `rounded-sk-lg`.

### CW-02 · Two TimelineEvent components needed; one component file likely to be created

The spec's `COMPONENT_MAPPING.md` warns about this. In the codebase today:

- `ActivityNode.tsx` (in `issue-detail/`) — used for the issue Activity feed.
- `StepTimeline.tsx` (in `run-detail/`) — used in run page.
- `LedgerRow.tsx` (in `run-detail/`) — also timeline-shaped.

Once `ExecutionLog` and `RunDrawer.DrawerActivity` get built, **don't unify
these into one component**. The four variants (ActivityFeedEvent /
RunTimelineEvent / DrawerActivityEvent / ExecActivityRow) are visually
distinct on purpose (§16 vs §17.5 vs §18.5 vs §19.4).

### CW-03 · Visual-parity harness exists — wire the spec into it

`ui/visual-parity/manifest.mjs` + `capture.mjs` + `fixtures.mjs` are already
set up. **Hook each parity item to a fixture** so regressions surface in CI
rather than in design review:

```js
// visual-parity/manifest.mjs
export const SCREENS = [
  { id: 'issues-list-default', path: '/issues',           specRef: 'A1 / list-default-dark' },
  { id: 'issue-detail-idle',   path: '/issues/SUP-66',    specRef: 'A3 / detail-idle' },
  { id: 'issue-detail-needs',  path: '/issues/SUP-216?run=needs', specRef: 'A3 / detail-needs' },
  // …
]
```

Snapshot per screen, diff against the artifact artboard at PR time.

---

## Recap — what to fix first

If we ship one PR a day for the next week, in this order:

1. **Day 1** — P0-02 + P0-03 + P0-06 + P0-12 + P0-13 (one PR: "issue row + rail status restoration"). All five edits, ≤80 lines changed.
2. **Day 2** — P0-07: rip the Tasks tile from the rail. ~20 lines deleted, one file moved or marked deprecated.
3. **Day 3..5** — P0-08: build `ExecutionLog`. This is the big one. Land the visual scaffold + skeleton against fake-but-shaped data; wire real data in a follow-up.
4. **Day 6** — P1-01, P1-02, P1-10, P1-11 (small CSS sweeps).
5. **Day 7** — P1-25 + P1-29 — the two product-decision items. Take to design.

Everything else is verification work (the ❓ items) — assign one engineer to
do a 90-minute sweep with the spec open in one tab and the running app in
another, file confirmations against this checklist.
