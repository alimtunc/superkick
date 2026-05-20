# Issues + Search rework — Linear tickets

Copy-pasteable bodies for the orchestrator. Each ticket is one PR, in order. Read `SUPERKICK_ISSUES_HANDOFF.md` for the full spec; the bodies below are the short version.

---

## SUP-224 — Foundations: StatusIcon · PriorityIcon · TaskBadge · lifecycle bucket

**Type:** Foundation · **Estimate:** 2–3 days · **Blocks:** SUP-225, SUP-226, SUP-227, SUP-228, SUP-229, SUP-230

### Why
The Issues + Search rework needs three new primitives and one shared derivation. They are consumed by every subsequent ticket. Land them first.

### Scope
- `<StatusIcon kind size color/>` — 7 kinds (`backlog · todo · progress · needs · review · done · cancelled`), Linear-style fills.
- `<PriorityIcon kind size/>` — 5 kinds (`none · urgent · high · medium · low`), Linear-style bar stack, urgent gets the danger square.
- `<TaskBadge kind label mono/>` — Superkick-only. 4 kinds (`needs · running · review · shipped`). Pulse on `running`. Renders nothing when `kind` is falsy.
- `bucketFor(issue, viewerId)` in `ui/src/lib/lifecycle.ts`. Returns `'needs' | 'active' | 'launchable' | 'open' | 'done'`. Pure function, fully unit-tested.

### Non-goals
- No callsite migration yet (SUP-225 does that).
- No new tokens or palette extension.
- No new icon bank entries — `StatusIcon` and `PriorityIcon` live in their own files and are not added to `Icon`'s name map.

### Acceptance
- [ ] All three components ship with a fixture page demonstrating every variant.
- [ ] `bucketFor()` covered ≥ 95% by unit tests.
- [ ] Zero raw hex in new files (uses `var(--sk-*)` tokens).
- [ ] No inline SVG outside `StatusIcon.tsx` / `PriorityIcon.tsx` source files.
- [ ] Pulse keyframe respects `prefers-reduced-motion`.

### Design reference
Canvas artboard `01 · The brief` shows the visual language. Spec §1.

---

## SUP-225 — IssueRowV2 (replaces IssueListRow + IssueRow)

**Type:** Rework · **Estimate:** 3 days · **Blocks:** SUP-226 · **Depends:** SUP-224

### Why
Two row components diverged. The new design unifies them and adds the `TaskBadge` slot — the single addition that says "where is the agent on this issue".

### Scope
- New `ui/src/components/issues/IssueRow.tsx` — 32px height, 24px gutter, columns: priority · ID · status · title · TaskBadge · labels · project · assignee · age. See spec §2 for exact widths.
- Migrate all callsites in `IssuesListView.tsx`.
- Delete `IssueListRow.tsx`.
- Keyboard: `j`/`k`/`↵`/`l` on focused row.

### Non-goals
- No lifecycle grouping yet (SUP-226).
- No drag from the list view.
- No bulk-select.

### Acceptance
- [ ] Row is 32px tall in screenshots.
- [ ] `TaskBadge` renders only when there's agent activity.
- [ ] `IssueListRow.tsx` deleted.
- [ ] All `IssuesListView` usages migrated.
- [ ] `j`/`k` move focus; `↵` opens detail; `l` opens Launch composer prefilled.
- [ ] Pixel diff vs canvas `iss-default` ≤ ±4px on column widths.

### Design reference
Canvas artboard `Default · My open work · grouped`. Spec §2.

---

## SUP-226 — Lifecycle grouping + "My open work" default + Done-hidden

**Type:** Behavior · **Estimate:** 4 days · **Depends:** SUP-224, SUP-225

### Why
`/issues` currently shows every Linear issue with no priority on what's actionable. Default it to my open work, hide Done, group by lifecycle stage.

### Scope
- New `useIssuesView()` hook in `ui/src/hooks/`. Single derivation; calls `bucketFor()`. Returns `{ groups, doneCountThisWeek }`.
- New `IssueGroupHeader.tsx` — 32px sticky row with tone dot, label, count, optional trailing action.
- `IssuesListView.tsx` rewritten to render groups in order: needs → active → launchable → open.
- Default route `/issues` loads with `view=mine` (`assignee = viewerId`, `bucket ≠ done`).
- Done footer: "Show N done this week" — reveals 5th group. Persisted in localStorage.
- "Launchable" group header has a `Launch all` ghost action (feature-flagged if composer batch not ready).

### Non-goals
- No new view types (only "My open work" is mandatory; the other tabs come in SUP-227).
- No saved-view authoring dialog.
- No re-ordering of group buckets (lifecycle order is fixed).

### Acceptance
- [ ] `useIssuesView()` is the only consumer of `bucketFor()`.
- [ ] Default load = `My open work`, Done hidden.
- [ ] Empty groups have no header.
- [ ] `<GroupHeader>` is sticky.
- [ ] "Show N done" toggles correctly and persists across reloads.
- [ ] Pixel diff vs canvas `iss-default` ≤ ±4px on header heights.

### Design reference
Canvas artboards `Default · My open work · grouped` and `Default · light theme`. Spec §3.

---

## SUP-227 — View tabs + new FilterBar + filter dropdown

**Type:** Rework · **Estimate:** 4 days · **Depends:** SUP-226

### Why
Today's filter strip is segmented status only. Linear-style compound filter chips + saved view tabs make the surface composable.

### Scope
- New `IssueViewTabs.tsx` — pinned default + 2 sample saved views + "+ New view" stub.
- New `IssueFilterBar.tsx` — dashed "+ Filter" button, compound chips with `×`, Sort/Group/View toggle on the right.
- New `IssueFilterDropdown.tsx` — replaces the existing `FilterDropdown*` family.
- URL persistence: `?view=…&sort=…&group=…&list/board`.
- Delete: `IssueFilters.tsx`, `IssuesToolbar.tsx`, `FilterDropdown.tsx`, `FilterDropdownCategoryRow.tsx`, `FilterDropdownLabelsSubMenu.tsx`, `FilterDropdownPrioritySubMenu.tsx`, `FilterDropdownProjectSubMenu.tsx`.

### Non-goals
- No saved-view authoring dialog (just the stub).
- No filter by free-text body match (that's ⌘K).
- No drag-and-drop reordering of chips.

### Acceptance
- [ ] Tabs render 3 sample views; default starred.
- [ ] `+ Filter` dropdown shows the 7 filter dimensions per spec §4.
- [ ] Chips compound, support `≠` op, and update URL.
- [ ] Sort/Group/View controls persist in URL.
- [ ] Keyboard: `f` opens dropdown.
- [ ] Old filter files deleted.
- [ ] Pixel diff vs canvas `iss-allopen` ≤ ±4px.

### Design reference
Canvas artboard `All open · + Filter dropdown`. Spec §4.

---

## SUP-228 — Hover preview rework (body + last comment + linked run/PR)

**Type:** Rework · **Estimate:** 2–3 days · **Depends:** SUP-224

### Why
The current `IssuePreview` shows title and metadata. Make it the place where you decide "do I need to open this issue, or can I act from here". Body excerpt + last comment + linked run/PR.

### Scope
- Rewrite `IssuePreview.tsx` → `IssueHoverCard.tsx`. Wrapper `HoverCard.tsx` unchanged.
- 460px wide, sections per spec §5: header · title · body excerpt (3-line clamp) · labels · last comment (2-line clamp) · linked run/PR chips · actions.
- Action `Launch task` → navigates to composer with prefill (do **not** call `useCreateRun` directly).
- 350ms open delay; closes on ESC, row blur, outside click.

### Non-goals
- No inline reply composer (chat drawer is a separate surface).
- No diff preview.
- No drag handle on the card.

### Acceptance
- [ ] All sections render conditionally; no empty zones.
- [ ] CSS line-clamp on body + comment (no JS truncation).
- [ ] `Launch task` routes through composer.
- [ ] 350ms delay; ESC closes.
- [ ] Pixel diff vs canvas `iss-hover` ≤ ±4px.

### Design reference
Canvas artboard `Hover preview · body + last comment + linked run`. Spec §5.

---

## SUP-229 — Kanban triage interactions

**Type:** Behavior · **Estimate:** 3 days · **Depends:** SUP-224

### Why
The kanban view exists but the drag feels mechanical. Make it the triage surface — drag-to-transition with proper drop targets.

### Scope
- `IssuesKanbanView.tsx` rewired with drag-and-drop persistence through the existing status mutation.
- During drag:
  - Source row dims to 0.5 opacity.
  - Dragging card gets `rotate(-1.3deg)` + heavy shadow + accent border.
  - Target column tints `var(--sk-accentSoft)` (120ms ease).
  - Ghost placeholder card shows landing slot (dashed border, 65% opacity).
- Drop on source column = no-op.
- Add `<TaskBadge>` to `KanbanIssueCard.tsx`.
- Keyboard fallback: `space` lifts, arrows move, `space` drops, `esc` cancels.

### Non-goals
- No multi-card drag.
- No drag-to-archive.
- No column reorder.

### Acceptance
- [ ] Drag persists status correctly.
- [ ] Drop-on-source = no network call.
- [ ] Ghost placeholder renders in target column.
- [ ] `<TaskBadge>` on cards.
- [ ] `prefers-reduced-motion` users get flat colour swap.
- [ ] Keyboard drag works end-to-end.
- [ ] Pixel diff vs canvas `kanban-drag` ≤ ±4px.

### Design reference
Canvas artboard `Kanban · mid-drag`. Spec §6.

---

## SUP-230 — Global ⌘K rework (scope chips, cross-type results, comment snippets)

**Type:** Greenfield · **Estimate:** 5–6 days · **Depends:** SUP-224

### Why
Search currently finds routes. It should find issues, comments, files, runs, and actions. With an empty state that's actually useful (needs you + quick actions).

### Scope
- New `ui/src/components/command/CommandBar.tsx`.
- Global `⌘K` / `Ctrl K` trigger from anywhere. Sidebar "Search" row triggers the same modal.
- Scope chips bar: All · Issues · Comments · Files · Runs · Actions. `tab` cycles.
- Three states per spec §7:
  - **Empty** → Needs you + Quick actions + Jump to.
  - **Typing** → Actions first (selected by default with `⌘↵`), then Issues / Comments / Files / Runs.
  - **Scoped** → single type, grouped, Done hidden in `Issues` scope.
- Result rows per type with `<mark>` match highlighting.
- Backend index additions: comment body (last 90d window), action list, route list.

### Non-goals
- No file body full-text search in V1 (paths only).
- No comment search beyond 90d in V1.
- No multi-workspace search.

### Acceptance
- [ ] `⌘K` opens from anywhere; `esc` closes.
- [ ] Empty state never empty.
- [ ] Comment matches return body snippets with `<mark>`.
- [ ] Scope `Issues` hides Done by default; one-click reveal.
- [ ] `tab` cycles scope; `i:`/`c:`/`f:`/`r:` prefix narrows.
- [ ] First action row selected by default when typing.
- [ ] No raw hex.
- [ ] Pixel diff vs canvas `search-empty` / `search-typing` / `search-scoped` ≤ ±4px each.

### Design reference
Canvas section `06 · ⌘K global search`. Spec §7.

---

## Decisions blocking merge

The orchestrator must surface these to the user before the relevant ticket lands:

| Blocking | Decision | Default if no answer |
|---|---|---|
| SUP-227 | "+ New view" dialog UX | Ship as stub linking to a placeholder route |
| SUP-227 | "Launchable" rule (does the team use a different in-flight signal than Linear `in_progress`?) | Use Linear `in_progress` + `no active_run` + `assignee = me` |
| SUP-229 | Backend mutation path for drag-to-transition | Use existing status mutation, fail-loud if missing |
| SUP-230 | Comment indexing window | 90 days |
| SUP-230 | Comment snippet length | ±40 chars |
| SUP-230 | Keyboard binding collisions with existing app shortcuts | Reconcile with whatever wins; document in the cheat sheet |

---

## Out of scope — refuse if asked

- Issue Detail rework.
- Launch Task composer / feed.
- Inbox rework.
- Chat drawer, Terminal, Settings, Agents.
- Bulk-select multi-edit.
- Mobile responsive < 1024px.
- Drag-and-drop on the list view itself (kanban only in V1).
