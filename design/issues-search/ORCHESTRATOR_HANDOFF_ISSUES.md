# Superkick — orchestrator handoff (Issues + Search rework)

You are the orchestrator. Your job is to deliver the **Issues + global search** redesign by routing work to coding subagents and verifying their output against the design canvas + spec.

This is a follow-up to the main redesign (`ORCHESTRATOR_HANDOFF.md`, tickets SUP-217 → SUP-223). It assumes those foundations have landed — tokens, primitives (`Pill`, `Btn`, `Icon`, `Avatar`, `Kbd`, `Dot`), and shell (`Sidebar`, `Topbar`, `Page`) already exist in the codebase.

## What you have

Three source-of-truth artifacts:

1. **`Issues + Search rework.html`** — the design canvas. Open it in a browser to see every artboard at real size. Each is labeled (e.g. `Default · My open work · grouped`, `⌘K · typing "webhook"`). The canvas is the visual contract.
2. **`SUPERKICK_ISSUES_HANDOFF.md`** — the implementation spec. New primitives (`StatusIcon`, `PriorityIcon`, `TaskBadge`), lifecycle bucket logic, file map, ticket dependencies, acceptance criteria, non-goals.
3. **`screens-v2/*.jsx`** — the canvas screen sources. Use these to lift exact paddings, sizes, and copy when implementing. They are *reference designs*, not code to be pasted — port the styles, keep the API names listed in the spec.

Treat the canvas as a screenshot reference. Treat the markdown as the rulebook.

## Surfaces in scope

| Surface | File area in repo |
|---|---|
| `/issues` list (grouped + flat) | `ui/src/components/issues/IssuesListView.tsx` + `IssueListRow.tsx` + `IssueRow.tsx` |
| `/issues` kanban | `ui/src/components/issues/IssuesKanbanView.tsx` + `Kanban*.tsx` |
| Issue filters + saved views | `ui/src/components/issues/IssueFilters.tsx`, `IssuesToolbar.tsx`, `ActiveFiltersBar.tsx`, `FilterDropdown*.tsx` |
| Issue hover preview | `ui/src/components/issues/HoverCard.tsx`, `IssuePreview.tsx` |
| Global ⌘K | wherever the current command palette lives (rebuild if it doesn't) |

**Out of scope — refuse if asked:** Issue Workspace / Issue Detail, Launch Task feed, Chat drawer, Terminal, Settings, Inbox, Run Detail. Those surfaces are either already designed (canvas v1) or untouched by this round.

## Ticket order — dependency chain

1. **SUP-224** — Foundations: `StatusIcon`, `PriorityIcon`, `TaskBadge`, lifecycle bucket types + API contract. **Blocks everything below.**
2. **SUP-225** — `IssueRowV2` replaces `IssueListRow` + `IssueRow`. Density change to 32px.
3. **SUP-226** — Lifecycle grouping + `My open work` default view + Done-hidden behaviour.
4. **SUP-227** — Saved view tabs + new FilterBar (compound chips, Sort/Group/View toggle).
5. **SUP-228** — `IssueHoverCard` rework (body + last comment + linked run/PR).
6. **SUP-229** — Kanban triage interactions (drag, ghost placeholder, drop target tint).
7. **SUP-230** — Global ⌘K rework: scope chips, cross-type results, comment snippets, quick actions + needs-you empty state.

SUP-224 must merge before any other ticket opens. SUP-225 → SUP-228 may parallelise with care if subagents stay in separate files. SUP-229 and SUP-230 are independent of each other and of SUP-225 → SUP-228.

## How to route work

For each ticket:

1. **Spin a coding subagent** with this prompt template:
   > Implement <TICKET>. The canonical design is in `Issues + Search rework.html`, artboard(s) `<list>`. The spec is in `SUPERKICK_ISSUES_HANDOFF.md` §<N>. Touch only the files listed in that section. Do not introduce new tokens or primitives — `Pill`/`Btn`/`Icon`/`Avatar`/`Kbd`/`Dot` already exist. Open PR against `main`.

2. **Give the subagent the canvas HTML, the markdown spec, and the relevant repo subtree.** The `ui/src/components/issues/` folder already has the right scaffolding — most tickets are rework rather than greenfield. Read the existing files before writing.

3. **Verify before merge:**
   - Pixel-diff a screenshot of the implemented screen against the canvas artboard. Tolerate ±4px on layout, zero tolerance on color/type tokens.
   - Grep raw hex codes in changed files. Zero matches outside `tokens.css`.
   - Grep inline `<svg>` in screen-level files. The only new icons are `StatusIcon`/`PriorityIcon` — those live in `src/ui/` (or `src/components/issues/` for issue-specific ones). Everything else uses `<Icon name>`.
   - Run the acceptance criteria checklist in the spec section for that ticket.
   - Confirm `assignee = me` default works against a real Linear-synced fixture.
   - Confirm Done is hidden by default and revealable with one click.

4. **Block merge on any of:**
   - New tokens introduced (palette must stay locked).
   - New primitive component invented when the design uses one that already exists.
   - Raw hex outside `tokens.css`.
   - Inline SVG icons outside `StatusIcon` / `PriorityIcon`.
   - Lifecycle bucket logic computed client-side per-row (it must be a single derived view-model — see §3 of the spec).
   - Done issues visible in the default view.
   - ⌘K only finding routes — it must find issues by body + comments.

## Decisions that need a human

Surface these to the user before having a subagent implement them. Do not let a subagent guess:

- **Comment indexing window** — spec says "last 90d". Confirm before SUP-230 lands; cheaper / heavier are both defensible.
- **Comment snippet truncation** — spec says ±40 chars around the match. Could be ±80 if matches are sparse.
- **Launchable bucket assignment rule** — spec maps it to Linear `in_progress + no active run + assignee = me`. If the team uses `triage` or a different in-flight signal, confirm.
- **Saved views authoring UX** — the canvas shows the tabs but not the "Save current as view…" dialog. Get that designed before SUP-227 ships.
- **Drag-and-drop persistence** — kanban triage moves an issue across Linear statuses. Confirm the backend mutation path before SUP-229.
- **Keyboard shortcuts collision** — spec proposes `g i`, `g b`, `c`, `v`, `l`. Reconcile with whatever the rest of the app already binds before SUP-230 lands.

## Out of scope — refuse if asked

- Issue Workspace / Issue Detail rework.
- Launch Task composer or feed changes (those are SUP-219 / SUP-220 territory).
- Inbox redesign (SUP-218).
- Settings, Agents, Chat, Terminal.
- Mobile / responsive < 1024px.
- Linear concepts that aren't already synced server-side (cycles, projects roadmap, sub-issue rollup graphs).
- Bulk-select multi-edit on the list (deferred — flag as a follow-up if a subagent asks).

## Reporting back to the user

After each ticket merges, post:

- Link to the merged PR.
- Screenshot of the implemented screen next to its canvas artboard.
- The next ticket and your ETA.
- Any "needs a human" decision now blocking.

If a subagent stalls more than one retry on the same step, escalate: ticket id, what's stuck, what you tried, what you propose.

## When all 7 tickets are done

Open a follow-up round with the user on: bulk-select, error states for /issues (Linear sync down, search backend offline), keyboard cheat-sheet overlay, and mobile read-only. Don't pick these up unilaterally — they need product decisions.
