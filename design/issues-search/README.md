# Issues + Search rework — branch payload

This folder is a self-contained drop for a `design/issues-search` branch on `alimtunc/superkick`. It contains the design canvas, the orchestrator handoff, the implementation spec, and the ticket bodies.

## What's in here

```
.
├── README.md                          this file
├── Issues + Search rework.html        the design canvas — open in a browser
├── design-canvas.jsx                  canvas runtime (DCSection / DCArtboard / DCPostIt)
├── screens/                           shared primitives reused from v1 (tokens, Pill, Btn, Sidebar…)
├── screens-v2/                        new screens for this round
│   ├── sk-icons.jsx                   StatusIcon · PriorityIcon · TaskBadge · Label · SubCount
│   ├── sk-issues-bits.jsx             ViewTabs · FilterBar · GroupHeader · IssueRowV2 · IssueHoverCard
│   ├── sk-issues-list.jsx             /issues list — 3 variants
│   ├── sk-issues-kanban.jsx           /issues kanban — drag triage
│   ├── sk-search.jsx                  ⌘K — 3 states
│   └── sk-proposal.jsx                proposal / IA / component notes / non-goals
├── ORCHESTRATOR_HANDOFF_ISSUES.md     read first if you are the orchestrator
├── SUPERKICK_ISSUES_HANDOFF.md        the implementation spec — read before opening tickets
└── TICKETS.md                         copy-pasteable Linear ticket bodies (SUP-224 → SUP-230)
```

## How to use

1. **Push this folder to a branch.** The repo doesn't ship the design canvas itself today; we suggest putting these files under `design/issues-search/` on a `design/issues-search` branch so they don't pollute `main` build artifacts. Adjust to taste.
2. **Open the canvas locally.** Open `Issues + Search rework.html` in a browser — no build step needed. Each artboard is labeled. Use the canvas to settle visual questions before tickets ship.
3. **Hand the orchestrator three things:** this folder, the existing `SUPERKICK_HANDOFF.md` (foundations from v1), and write access to the repo. The orchestrator reads `ORCHESTRATOR_HANDOFF_ISSUES.md` first.
4. **Create the Linear tickets.** Paste the bodies in `TICKETS.md` into Linear, in order. SUP-224 must merge before any other ticket opens.

## Reading order

If you have 5 minutes: open the canvas, scroll through artboards.

If you have 20 minutes: canvas → `ORCHESTRATOR_HANDOFF_ISSUES.md` → `TICKETS.md`.

If you're implementing: `SUPERKICK_ISSUES_HANDOFF.md` cover to cover, then the canvas artboard for the ticket you're on.

## What this round covers

| Surface | Decision |
|---|---|
| `/issues` list | Default to "My open work" (assignee = me, status ≠ Done). Group by lifecycle: **Needs you → Active → Launchable → Open**. Done hidden behind "Show N" reveal. |
| Issue row | 32px Linear-density, new `TaskBadge` between title and labels showing agent state (needs / running / review / shipped). |
| Filters | Linear-style compound chips + "+ Filter" dropdown. Saved view tabs at top with a pinned default. |
| `/issues` kanban | Linear-status columns with drag-to-transition, drop-target tint, ghost placeholder. |
| Hover preview | Body excerpt + last comment + linked run/PR + Open/Launch CTAs. |
| Global ⌘K | Indexes issues (id, title, body), **comments**, repo files, runs, actions, navigation. Empty state = needs you + quick actions. Scope chips. |

## What this round does **not** cover

- Issue Workspace / Issue Detail (already designed v1).
- Launch Task composer / feed.
- Inbox redesign.
- Chat drawer, Terminal, Settings, Agents.
- Bulk-select multi-edit.
- Mobile / responsive < 1024px.

See `SUPERKICK_ISSUES_HANDOFF.md` §11 for the full non-goal list.

## Ticket dependency chain

```
SUP-224 (foundations)
  ├── SUP-225 (IssueRowV2)
  │     └── SUP-226 (lifecycle grouping + default view)
  │           └── SUP-227 (view tabs + filter bar)
  ├── SUP-228 (hover preview)
  ├── SUP-229 (kanban triage)
  └── SUP-230 (global ⌘K)
```

SUP-224 strictly blocks everything else. After it lands, the rest can interleave.
