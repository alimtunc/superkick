# Superkick — Issues + Search rework · implementation spec

This is the bridge between the design canvas (`Issues + Search rework.html`) and the codebase. Read it before opening any of SUP-224 → SUP-230.

The canvas is the source of truth for **what the screens look like**. This doc is the source of truth for **what to build, in what order, with what primitives, and where each piece lives in the existing code**.

This spec assumes the foundations from `SUPERKICK_HANDOFF.md` (SUP-217) have already landed: tokens, `Pill`/`Btn`/`Icon`/`Avatar`/`Kbd`/`Dot`/`Spark` primitives, `Sidebar`/`Topbar`/`Page` shell.

---

## 0 · Goals & principles

**Goal.** The user opens an issue, launches an autonomous Plan → Implement → Review workflow, then monitors evidence. Today /issues shows every Linear issue with no opinion; search finds routes; both surfaces are noisy. We rework them so:

- The default feels like **My open work**, not "every Linear issue".
- **Done is hidden** by default (one click to reveal).
- Issues that are **launchable / active / needs-human** are visually prioritized.
- **Search finds issues** — by id, title, body, and comment — not just routes.

**Direction.** Linear-style UX patterns (filter chips, status icons, hover preview, 32px rows, sticky group headers), rendered in Superkick's voice (tokens, typography, calm chrome).

**Principles.**

1. **Lifecycle ≠ Linear status.** Linear status lives in the row icon. The grouping above the rows is about *where the agent is in the task lifecycle*: Needs you · Active · Launchable · Open · (Done hidden).
2. **One default that's right.** "My open work" is the only mandatory view. Saved views are an extension.
3. **The row tells the agent story.** A new `TaskBadge` between title and labels says: needs you · running · review · shipped. If there's no badge, there's no agent activity on this issue. That single addition is half the value of this redesign.
4. **Search is product, not navigation.** Routes are a fallback section, not the headline.

---

## 1 · New primitives (SUP-224)

Build these once. All other tickets consume them. They live alongside the existing primitives in `src/ui/` unless noted.

### 1.1 `StatusIcon`

Linear-style status circle. Kinds: `backlog · todo · progress · needs · review · done · cancelled`. 14px default. Color wired to `--sk-{tone}` tokens.

```tsx
type StatusKind = 'backlog' | 'todo' | 'progress' | 'needs' | 'review' | 'done' | 'cancelled';
<StatusIcon kind="progress" size={14} color="var(--sk-info)" />
```

| Kind | Visual | Tone |
|---|---|---|
| `backlog` | dashed outline circle | `fgDim` |
| `todo` | empty outline circle | `fgMuted` |
| `progress` | quarter-filled pie | `info` |
| `needs` | half-filled pie | `warn` |
| `review` | filled circle + check overlay (low-opacity fill) | `accent` |
| `done` | filled circle + check | `success` |
| `cancelled` | filled circle + x | `fgDim` |

Replaces both the current `StatusIcon` and the colored `IssueStatePill` in row contexts. The pill stays valid for non-row surfaces (filter chips, hover card header).

### 1.2 `PriorityIcon`

Linear's bar stack. Kinds: `none · urgent · high · medium · low`. 14px default.

| Kind | Visual |
|---|---|
| `none` | 3 dim dots |
| `urgent` | filled danger square with `!` glyph |
| `high` / `medium` / `low` | 3 bars, fill count = priority (3 / 2 / 1) |

Replaces the existing `PriorityIcon`. The existing one currently keys off `value` — wrap it so callers pass `kind` and the wrapper maps Linear's integer priority field.

### 1.3 `TaskBadge` — Superkick-specific, **the headline addition**

Sits in row, hover card, kanban card, search result. Inline pill, 18px tall.

```tsx
type TaskKind = 'needs' | 'running' | 'review' | 'shipped';
<TaskBadge kind="running" label="implement · 2m" mono />
```

| Kind | Tone | Default label | Pulse |
|---|---|---|---|
| `needs` | `warn` | `needs you` | no |
| `running` | `info` | current step name + elapsed (mono) | **yes** |
| `review` | `accent` | `PR #82` | no |
| `shipped` | `success` | `shipped` | no |

Pulse animation: `@keyframes sk-pulse { 0%,100% { opacity: 1 } 50% { opacity: .4 } }`, 1.6s ease-in-out infinite, on the inner dot only.

If `kind` is falsy → render nothing. Do not render a `neutral` "open" state — empty is the signal.

### 1.4 Lifecycle bucket logic

This is **shared types + a single derived view-model**, not per-row computation. Live in `ui/src/lib/lifecycle.ts`.

```ts
type LifecycleBucket = 'needs' | 'active' | 'launchable' | 'open' | 'done';

function bucketFor(issue: IssueWithRun, viewerId: string): LifecycleBucket {
  const r = issue.active_run;
  if (r && (r.state === 'waiting_human' || r.state === 'paused'))            return 'needs';
  if (r && ['planning','coding','running_commands','reviewing'].includes(r.state)) return 'active';
  if (issue.linear_status === 'in_progress' && !r && issue.assignee_id === viewerId) return 'launchable';
  if (['todo','backlog'].includes(issue.linear_status))                              return 'open';
  return 'done';
}
```

The list view groups by bucket. **The default view filters to `assignee = me` and `bucket ≠ 'done'`.** Done becomes a "Show N done this week" affordance at the bottom.

### Acceptance criteria — SUP-224

- [ ] `<StatusIcon>` ships with all 7 kinds; storybook-style fixture page renders them all.
- [ ] `<PriorityIcon>` ships with all 5 kinds; integer-priority wrapper maps Linear's field.
- [ ] `<TaskBadge>` ships with all 4 kinds + `null` no-op case + pulse animation.
- [ ] `bucketFor()` has unit tests covering every state combination; coverage ≥ 95% on the function.
- [ ] No raw hex in the new files.
- [ ] No inline SVG outside `StatusIcon` / `PriorityIcon` source files.

---

## 2 · `IssueRowV2` (SUP-225)

Replaces `IssueListRow` and `IssueRow` (delete both after migration).

### Anatomy

```
┌─ 24px gutter ─────────────────────────────────────────────────────────────┐
│ [prio14][ID 60 mono][status14][title flex      ][TaskBadge][labels][proj↪][@18][age36]│
└──────────────────────────────────────────────────────── 24px gutter ──────┘
```

| Column | Width | Notes |
|---|---|---|
| Priority | 14px | `<PriorityIcon kind={mapPrio(issue.priority.value)} size={12}/>` |
| ID | 60px | DM Mono 11px `var(--sk-fgDim)` |
| Status | 14px | `<StatusIcon kind={mapStatus(issue.status)} size={13}/>` |
| Title | flex 1 | DM Sans 13px `var(--sk-fg)`, truncate single line |
| Task badge | inline | `<TaskBadge>` — render only if `issue.active_run` or `issue.shipped_at` |
| Labels | inline | up to 2 `<LabelChip>` (existing) |
| Project | inline | chev + name in mono `var(--sk-fgDim)` |
| Assignee | 22px (centred) | 18px Avatar; bot icon when assignee is an agent; dashed circle when unassigned |
| Age | 36px right | DM Mono 11px `var(--sk-fgDim)`, relative |

### Geometry

- Height: **32px** (h-8).
- Horizontal padding: 24px (matches page gutter).
- Gap between columns: 8px.
- Hover: `background: var(--sk-raised)`. No border change.
- No `mb-*` between rows — `border-bottom: 1px solid var(--sk-border)` on every row.

### Behaviour

- Click → Issue Detail.
- Long-press / contextmenu → row action menu (future ticket, leave a TODO).
- Keyboard: `j`/`k` focus next/prev, `↵` opens, `l` (lowercase L) triggers Launch Task on the focused issue.

### Acceptance criteria — SUP-225

- [ ] Replaces `IssueListRow.tsx` and `IssueRow.tsx`. Both old files deleted.
- [ ] All existing `IssuesListView` usages migrated. No callsite uses the deprecated rows.
- [ ] Row is exactly 32px tall in fixture screenshots.
- [ ] `<TaskBadge>` never renders when there's no agent activity (don't fill it with "open").
- [ ] Keyboard `j`/`k`/`↵`/`l` wired and visible in a `?` cheat sheet (the cheat sheet itself can be a stub).
- [ ] Pixel diff vs canvas artboard `iss-default` ≤ ±4px on column widths.

---

## 3 · Lifecycle grouping + "My open work" default (SUP-226)

### View-model

A single derived list, **server-side or in a TanStack Query hook** (not per-row):

```ts
type IssuesView = {
  groups: { bucket: LifecycleBucket; rows: IssueWithRun[] }[]; // order: needs, active, launchable, open
  doneCountThisWeek: number; // for the "Show N done" affordance
};
```

The hook lives in `ui/src/hooks/useIssuesView.ts`. It consumes the existing issue + run streams and the current view's filter set. It is the only place that calls `bucketFor()`.

### List render order

```
GroupHeader  Needs you      · N (danger tone dot)
  rows…
GroupHeader  Active         · N (info tone dot)
  rows…
GroupHeader  Launchable     · N (accent tone dot)  · [Launch all] (ghost btn, opens composer with N prefills)
  rows…
GroupHeader  Open           · N (neutral tone dot)
  rows…

[footer]  ✓ N done this week · hidden by default · [Show]
```

### Group header

32px row, sticky to the top of the scroll region, `var(--sk-surface)` bg, border-bottom hairline. Chev (open/closed) + 8px tone dot + 12.5px label + 11px mono count + spacer + optional action.

### Default view

- Filter applied on first load: `assignee = viewerId` AND `bucket ≠ 'done'`.
- Persisted in URL: `/issues?view=mine`.
- "Open" bucket means Linear's `todo`/`backlog` (assigned to me, no agent activity yet).
- "Launchable" bucket gets a primary-tinted **Launch all** action in its header — opens the composer pre-filled with the bucket as a batch hint. If the composer doesn't support batching yet, the action is hidden behind a feature flag.

### Done-hidden affordance

Persistent footer row, 12px sans, `var(--sk-fgDim)`. "Show" link → expands a 5th group with the same row component. State persisted in localStorage under `superkick.issues.showDone`.

### Acceptance criteria — SUP-226

- [ ] `useIssuesView()` exists; called from a single place; tested with fixtures covering all 5 buckets.
- [ ] Default route `/issues` opens with `view=mine`.
- [ ] Groups render in the order: needs → active → launchable → open. Empty groups hidden (no zero-count headers).
- [ ] `<GroupHeader>` is sticky and renders the tone dot per spec.
- [ ] Done is hidden by default; "Show" reveals; preference persisted across reloads.
- [ ] "Launchable" action behind feature flag if composer batching isn't ready — never broken.

---

## 4 · Saved view tabs + new FilterBar (SUP-227)

Replaces `IssueFilters.tsx` (status segmented strip) and `IssuesToolbar.tsx`.

### View tabs (above the filter bar)

```
[★ My open work · 7]   All open · 27   Recently shipped · 12   + New view
```

- Underline accent on active, no background fill.
- The pinned default ("My open work") gets a small `star` icon in accent color.
- "+ New view" opens a "Save current filter set as view" dialog (out of scope for SUP-227 — link to a stub).
- Lives in `ui/src/components/issues/IssueViewTabs.tsx`.

### Filter bar

```
[+ Filter]  [Assignee: Léa M ×]  [Status ≠ Done ×]      Sort: Updated ↓  |  Group: Lifecycle ↓  |  [List | Board]
```

- "+ Filter" is a dashed-border ghost button. Click → dropdown menu (see below).
- Chips are compound: each chip is `{key} {op} {value} [×]`. Default op is `:`; allow `≠` for negation.
- Chip background: `var(--sk-raised)` neutral. Use semantic tone (warn / accent / etc.) only for state-typed filters (e.g. `Status: ≠ Done` in danger tone is overkill — leave neutral).
- Right side: sort, group, and view toggle. Sort and group are select-like buttons (chev). View toggle is a 2-state segmented control (`List` / `Board`).
- Lives in `ui/src/components/issues/IssueFilterBar.tsx`.

### "+ Filter" dropdown

240px wide, `var(--sk-overlay)` bg. Items:

```
FILTER BY
  Assignee
  Priority
  Label
  Project
  Repo
  Task state              running · needs · review · shipped
  Created                 last 24h · last 7d · …
─────────
  Save current as view…
```

Each row 6×8 padding, 13px sans, 13px icon in `var(--sk-fgMuted)`. Hover row → `var(--sk-raised)`.

### Bucket grouping is the default

`Group: Lifecycle` is the default; the alternatives are `Status` (Linear's grouping), `Priority`, `Project`, `Assignee`, `None`. Switching the group changes the headers, not the rows.

### Acceptance criteria — SUP-227

- [ ] `IssueViewTabs` renders the 3 views, defaults to "My open work" with a starred indicator.
- [ ] `IssueFilterBar` renders the dashed "+ Filter" button, compound chips, and right-side controls.
- [ ] Adding a filter is keyboard-driven: `f` opens dropdown, arrows + `↵` add.
- [ ] Removing a chip via `×` updates URL.
- [ ] Sort/Group/View toggle each persist in URL (`?sort=updated&group=lifecycle&view=list`).
- [ ] Old `IssueFilters.tsx` and `IssuesToolbar.tsx` deleted after migration.
- [ ] Pixel diff vs canvas artboard `iss-allopen` (with dropdown open) ≤ ±4px.

---

## 5 · `IssueHoverCard` rework (SUP-228)

Replaces `HoverCard.tsx` + `IssuePreview.tsx` content. The wrapper component stays; the inner panel gets rebuilt.

### Anatomy

```
┌─ 460px ─────────────────────────────────────────────────┐
│ [prio] [status] [ID]                  opened 5h ago     │
│ Issue title — single line, wraps if very long           │
│ Body excerpt, 3-line clamp, var(--sk-fgMuted)           │
│ [label] [label] [label]                                 │
├─────────────────────────────────────────────────────────┤
│ [@] fix-bot · last comment · 12m ago                    │
│      "Comment excerpt, 2-line clamp."                   │
├─────────────────────────────────────────────────────────┤
│ [run-7af2 · running] [PR #82 · open]                    │
├─────────────────────────────────────────────────────────┤
│                              [Open]   [▸ Launch task]   │
└─────────────────────────────────────────────────────────┘
```

- Surface: `var(--sk-overlay)`, radius 10, border + heavy drop shadow (`0 20px 48px rgba(0,0,0,.55)`).
- The card is positioned by the existing `HoverCard` wrapper — keep its open/close behaviour.
- Header row: priority + status + ID in mono + spacer + "opened {relative}".
- Body excerpt: pulled from Linear's `issue.description`, 3-line CSS clamp.
- Labels row: omit if empty.
- Comment row: omit if there are no comments. Pull last comment regardless of who authored it. 2-line clamp.
- Linked items row: chips for active run (with pulse dot) and PR (with `pr` icon). Omit if both empty.
- Action row: ghost `Open` + primary `Launch task` (icon `zap`).

### Behaviour

- Open delay: 350ms (Linear-like, not jumpy).
- Closes on row blur, ESC, or click outside.
- Click `Open` → navigates to Issue Detail. Click `Launch task` → opens the Launch composer pre-filled with this issue. **Do not** launch directly from the hover card — always go through the composer (consistent with SUP-219).

### Acceptance criteria — SUP-228

- [ ] Hover preview renders body excerpt + last comment + linked run/PR + actions.
- [ ] Body and comment use CSS line-clamp (no JS truncation).
- [ ] No render if there's no extra data beyond what the row already shows — keep the card meaningful.
- [ ] Click `Launch task` → navigates to composer with prefill (do not call `useCreateRun` directly).
- [ ] 350ms open delay; closes on ESC.
- [ ] `IssuePreview.tsx` is the canonical inner panel; `HoverCard.tsx` wrapper unchanged.

---

## 6 · Kanban triage (SUP-229)

Replaces `IssuesKanbanView.tsx`. Cards stay similar; the page logic changes.

### Behaviour

- Columns: Open · In progress · Needs human · Review · Done. (Linear status, not lifecycle bucket — kanban is about transitions.)
- Drag-and-drop persists the Linear status transition through the existing backend mutation.
- During drag:
  - Source row dims (opacity 0.5).
  - Dragging card visually offsets and rotates: `transform: rotate(-1.3deg)`, `box-shadow: 0 12px 28px rgba(0,0,0,.45)`, border `var(--sk-accent)`.
  - Target column tints background `var(--sk-accentSoft)`, transition 120ms.
  - Ghost placeholder card in the target column shows the landing slot: dashed border, 65% opacity, real row height.
- Drop with no movement = no-op. Drop on the same column = no-op (don't fire the mutation).

### Card

Reuse `KanbanIssueCard.tsx`. Add the `TaskBadge` in the top-right of the card (replacing the legacy `tag` pill).

### Done column

Already virtual-scrolled per the original spec. Keep the "Show all 143 →" link at the bottom.

### Acceptance criteria — SUP-229

- [ ] Drag from any column to any other persists the status via the existing mutation.
- [ ] Drop on the source column = no-op (no network call).
- [ ] Drop target tint + ghost placeholder render as in canvas artboard `kanban-drag`.
- [ ] `<TaskBadge>` renders on the card.
- [ ] Reduced-motion users get no rotation, no shadow ramp — drag is a flat colour swap.
- [ ] Keyboard fallback: `space` picks up a card, arrows move between columns, `space` drops, `esc` cancels.

---

## 7 · Global ⌘K rework (SUP-230)

Lives at `ui/src/components/command/CommandBar.tsx` (create if it doesn't exist).

### Trigger

Globally bound `⌘K` (Mac) / `Ctrl K` (Win/Linux). The Sidebar's search row triggers the same modal.

### Layout

```
┌─ 580px modal, top 50px from viewport ────────────────────────┐
│ [search] [scope chip?] [text or placeholder]    [esc]        │
├──────────────────────────────────────────────────────────────┤
│  All · 9   Issues · 3   Comments · 2   Files · 2   Runs · 1  │  ← scope tabs
├──────────────────────────────────────────────────────────────┤
│  ACTIONS                                                     │
│  > zap Launch task on "<q>"…                  ⌘ ↵            │
│  NEEDS YOU · 2     (when query is empty)                     │
│  …                                                           │
│  ISSUES · 3        (with query)                              │
│  > [prio][status] ISS-217 · …<mark>webhook</mark>…           │
│    match in body / comment with mark highlight               │
│  COMMENTS · 2                                                │
│  FILES · 2                                                   │
│  RUNS · 1                                                    │
├──────────────────────────────────────────────────────────────┤
│  ↑↓ navigate   ↵ open   ⌘↵ launch   tab scope   9 results    │
└──────────────────────────────────────────────────────────────┘
```

### Three states (all in canvas)

| State | When | Top section |
|---|---|---|
| **Empty** | Modal opened, nothing typed | "Needs you" group (first 2 rows) + Quick actions (Launch task, New issue, Switch view, Switch repo) + "Jump to" (Inbox, Issues, Tasks) |
| **Typing** | Query present, `All` scope | First section: 1 Action ("Launch task on '\<q\>'…") with `⌘↵` hint, selected by default. Then Issues, Comments, Files, Runs in that order. |
| **Scoped** | Scope chip active (e.g. `Issues only`) | Single type, grouped by status (Open · N, Done · N · hidden). Done is hidden by default in the scoped issues view too — same rule as the list. |

### Result row

- Issue row: leading `<PriorityIcon>` + `<StatusIcon>` (replaces the generic icon), title with `<mark>`-highlighted match, sub-line with bucket / project / age, trailing `<TaskBadge>` or `<Avatar>`.
- Comment row: leading `comment` icon, title is "{author} on {ID} · {age}", body is `"…snippet with <mark>highlight</mark>…"` (±40 chars).
- File row: leading `doc` icon, title is path in mono, sub-line is `{repo} · {N} lines · last edit {age}`.
- Run row: leading `loop` icon in info color, title is `{run-id} · {summary}`, sub-line is `{agent} · {step} · {elapsed} · {issue}`, trailing pulse pill.
- Action row: leading icon in accent color, title in sentence case, kbd hint on the right.

### Search index (server-side)

Backend additions:

| Source | Fields | Notes |
|---|---|---|
| Issues | id, identifier, title, body, labels, linked PRs | Use existing index. |
| Comments | comment body | Window: last 90d (confirm with PM before merge). Return `±40 chars` snippet around match. |
| Repo files | path | No full-text on file body in V1 (perf cost). |
| Runs | id, linked issue, step name, status | Existing. |
| Actions | hardcoded list | `launch-task`, `new-issue`, `switch-view`, `switch-repo`, `open-inbox`. Fuzzy-matched. |
| Routes | hardcoded list | Lowest-priority section ("Jump to"). Never appears with a query. |

### Keyboard

- `⌘K` open · `esc` close
- `↑` / `↓` navigate · `↵` open · `⌘↵` launch task on selection
- `tab` cycle scope chips
- Type `i:` (or click the Issues chip) → scoped to issues. Same for `c:`, `f:`, `r:`.

### Acceptance criteria — SUP-230

- [ ] `⌘K` opens the modal from anywhere; `esc` closes.
- [ ] Empty state shows Needs you + Quick actions; never shows zero results.
- [ ] Typing returns Issue / Comment / File / Run / Action sections; each cap 5 items + "View all" link.
- [ ] Comment matches return body snippets with `<mark>` around the match.
- [ ] Scope `Issues only` hides Done by default with a one-click reveal.
- [ ] `tab` cycles scope chips; `i:` prefix narrows to issues.
- [ ] First Action row is selected by default when typing (Launch task on "<q>").
- [ ] Pixel diff vs canvas artboards `search-empty` / `search-typing` / `search-scoped` ≤ ±4px.
- [ ] No raw hex; routes / SVGs through existing primitives only.

---

## 8 · File map

```
ui/src/
├── components/issues/
│   ├── IssueViewTabs.tsx          new (SUP-227)
│   ├── IssueFilterBar.tsx         new (SUP-227)
│   ├── IssueFilterDropdown.tsx    new (SUP-227) — replaces FilterDropdown* family
│   ├── IssueRow.tsx               REWORK (SUP-225) — was IssueListRow + IssueRow
│   ├── IssueGroupHeader.tsx       new (SUP-226)
│   ├── IssuesListView.tsx         rework (SUP-226) — groups by lifecycle bucket
│   ├── IssueHoverCard.tsx         REWORK (SUP-228) — was IssuePreview
│   ├── HoverCard.tsx              unchanged (wrapper)
│   ├── IssuesKanbanView.tsx       rework (SUP-229) — drag interactions
│   ├── KanbanIssueCard.tsx        small rework (SUP-229) — TaskBadge
│   └── … existing supporting components untouched except where noted
├── components/command/
│   └── CommandBar.tsx             new (SUP-230)
├── hooks/
│   └── useIssuesView.ts           new (SUP-226)
├── lib/
│   └── lifecycle.ts               new (SUP-224)
└── ui/
    ├── StatusIcon.tsx             rework (SUP-224)
    ├── PriorityIcon.tsx           rework (SUP-224)
    └── TaskBadge.tsx              new (SUP-224)
```

Files to **delete** after migration:

- `IssueListRow.tsx` (replaced by `IssueRow.tsx` rework).
- `IssueFilters.tsx` (replaced by `IssueFilterBar.tsx`).
- `IssuesToolbar.tsx` (replaced by `IssueFilterBar.tsx`).
- `IssuePreview.tsx` (folded into `IssueHoverCard.tsx`).
- `FilterDropdown.tsx`, `FilterDropdownCategoryRow.tsx`, `FilterDropdownLabelsSubMenu.tsx`, `FilterDropdownPrioritySubMenu.tsx`, `FilterDropdownProjectSubMenu.tsx` (replaced by `IssueFilterDropdown.tsx`).
- `IssueStatePill.tsx` if no callsite remains outside the (out-of-scope) Issue Detail surface.
- `SearchBar.tsx` (replaced by ⌘K).

---

## 9 · Cross-cutting patterns

### Status pills (recap from main spec)

In rows we use `<StatusIcon>`, not pills. Pills survive for filter chips and hover-card headers. Tone vocabulary unchanged from `SUPERKICK_HANDOFF.md` §12.

### Density

- Row padding: 0 vertical (height 32) / 24 horizontal.
- Group header padding: 6 vertical / 24 horizontal.
- Kanban card padding: 8 / 10.
- Hover card padding: 12 / 14.
- ⌘K row padding: 7 / 16.

### Motion

- Pulse animation only on `TaskBadge` kind `running` and on live status dots in ⌘K results.
- Drag-and-drop in kanban: 120ms ease bg, no spring rotation.
- Hover card open: 350ms delay before mount, 150ms ease-out fade-in.
- `prefers-reduced-motion`: kill pulse, kill rotate-on-drag, kill fade.

### Numbers

- IDs (`ISS-217`, `run-7af2`, `PR #82`) → DM Mono, tabular nums on.
- Counts (`27`, `9 results`, `3/8`) → DM Mono.
- Relative times (`1h`, `3d`, `12m ago`) → DM Sans.

### What never appears in these surfaces

- Emoji as UI affordance.
- Drop shadows except on the ⌘K modal and the hover card.
- Gradient backgrounds.
- More than one primary button per surface.
- Rounded-corner left-accent containers ("AI tip" style).
- A list row taller than 32px in the default density.
- A search result with no scope label.

---

## 10 · Implementation order (recap)

| Week | Ticket | Title |
|---|---|---|
| 1 | **SUP-224** | Foundations: StatusIcon · PriorityIcon · TaskBadge · lifecycle bucket |
| 1 | **SUP-225** | IssueRowV2 (replaces IssueListRow + IssueRow) |
| 2 | **SUP-226** | Lifecycle grouping + "My open work" default + Done-hidden |
| 2 | **SUP-227** | View tabs + new FilterBar + filter dropdown |
| 3 | **SUP-228** | Hover preview rework |
| 3 | **SUP-229** | Kanban triage interactions |
| 4 | **SUP-230** | Global ⌘K rework |

SUP-224 strictly first. The rest can interleave if subagents stay in separate files.

---

## 11 · What's not in this pass

Out of scope, but worth flagging so they don't accidentally regress:

- Issue Workspace / Issue Detail (already designed in canvas v1).
- Launch Task composer or feed (SUP-219 / SUP-220).
- Inbox redesign (SUP-218).
- Bulk-select multi-edit on the list — deferred.
- Mobile / responsive < 1024px — operator workflow is desktop-first.
- Saved views authoring dialog (the tabs exist; the "+ New view" dialog needs its own design round).
- Drag-and-drop on the list view itself (kanban only in V1).
- Comment full-text search beyond the last 90 days (perf budget; revisit later).
- Repo file full-text search (paths only in V1).

Anything in this list comes back in a separate design round.
