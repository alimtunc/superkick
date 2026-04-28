# Visual Design — Superkick

Linear/Multica-inspired direction. Calm, dense, monochrome with semantic accents.
This file is the source of truth for tokens, surfaces, density, typography, icons and
interactive states across the V1 surfaces (`shell/`, `inbox/`, `issues/`,
`issue-detail/`, `runs/`, `run-detail/`, `dashboard/`).

Reviewed alongside [frontend.md](./frontend.md). Every rule below carries its rationale
so edge cases can be reasoned about — when in doubt, follow the rationale, not the rule.

## Tokens

All tokens live in [ui/src/index.css](../../ui/src/index.css) under `@theme`. **Never
hardcode hex colours, `bg-zinc-*`, `bg-neutral-*`, `bg-gray-*` or arbitrary
`text-zinc-*` in components.** If a colour is not in the palette it does not belong on
the surface.

### Surfaces

| Token | Use |
|---|---|
| `bg-void` (`#0b0c0e`) | Page background, root behind everything else. |
| `bg-carbon` (`#111214`) | Secondary / debug surfaces — RunDock, terminal embeds, watch rails. Visually recessed. |
| `bg-graphite` (`#181a1e`) | Primary panel and card surface — Sidebar, list rows, KanbanCard, IssuePropertiesPanel, RunCard. |
| `bg-slate-deep` (`#1f2228`) | Nested / hovered / selected surface — sidebar item hover, kanban card hover, focused panel. |
| `bg-panel` (`#252830`) | Overlays — popovers, dropdowns, hover cards, dialogs. |

**Why this hierarchy:** the eye reads four discrete elevations. Adding a fifth
(`bg-zinc-800`, `bg-neutral-900`, etc.) breaks the rhythm and forces the operator to
reparse the layout.

### Borders

| Token | Use |
|---|---|
| `border-edge` (`#2e323b`) | Default border on cards, rows, panels at rest. |
| `border-edge-bright` (`#363a45`) | Hover, focus-within, "this row is interactive". |
| `ring-mineral/30` | `focus-visible` ring for keyboard nav. |
| `border-mineral/40` + `bg-mineral-dim` | Selected / active row. |

### Text

| Token | Use |
|---|---|
| `text-fog` (`#e8e6e1`) | Primary content — issue titles, run titles, body copy. |
| `text-silver` (`#b0ada6`) | Secondary content — meta, descriptions, IDs. |
| `text-ash` (`#7a7770`) | Tertiary content — timestamps, hints, labels at rest. |
| `text-dim` (`#55524c`) | Quaternary — disabled, placeholders, decorative dots. |

### Status accents

Six semantic tones. **Always use the dim variant for backgrounds and the solid for text/border.**

| Tone | Solid | Dim | Meaning |
|---|---|---|---|
| `mineral` | `text-mineral` / `border-mineral/40` | `bg-mineral-dim` | Success, ready, primary action. |
| `oxide` | `text-oxide` / `border-oxide/40` | `bg-oxide-dim` | Failure, blocker, attention required. |
| `gold` | `text-gold` / `border-gold/40` | `bg-gold-dim` | Warning, waiting, capacity at limit. |
| `cyan` | `text-cyan` / `border-cyan/40` | `bg-cyan-dim` | In-flight, planning, info. |
| `violet` | `text-violet` / `border-violet/40` | `bg-violet-dim` | Review, PR, secondary state. |
| `neon-green` | `text-neon-green` | `bg-neon-green/10` | Live / pulsing — reserved for live runs and merged PRs. |

`neutral` is not an accent: use `text-silver` + `bg-slate-deep/60` + `border-edge` for non-status
chips (counts, dispatch positions, generic IDs).

## Density

Three row heights. Pick one per surface and stay consistent inside it.

| Class | Use |
|---|---|
| `h-7` (28px) | Compact rows — Sidebar nav items, IssuePropertyRow, watch chips, filter chips. |
| `h-8` (32px) | Standard — Issue list rows, Inbox rows, Run group rows. |
| `h-9` (36px) | Spacious — toolbar, page headers, RunCard primary row. |

Padding: rows use `px-3` standard, `px-2` compact, `px-4` spacious. Vertical padding is
controlled by the row height — do not double up `py-*` on a row that already has `h-*`.

## Typography

| Use | Class |
|---|---|
| Page / card titles | `text-base font-medium text-fog` |
| Row primary (issue title, run title) | `text-sm font-medium text-fog` |
| Row secondary (meta, description) | `text-sm text-silver` |
| Meta uppercase labels (section headers, button labels in chrome) | `text-xs uppercase tracking-wider text-ash` |
| Numeric / IDs / state names | `font-data text-xs text-silver` (scale to `text-[10px]` for compact pills) |
| Timestamps | `font-data text-xs text-ash` |

`font-data` (DM Mono) is reserved for: numeric values, identifiers (`SUP-93`, run IDs,
PR numbers), state literals (`OPEN`, `MERGED`), and durations. Do not use it for prose.

## Icons

Use [lucide-react](https://lucide.dev/) icons everywhere. **Never substitute emoji or
inline SVG.** Two sizes:

- `size={14}` — inside compact pills, h-7 rows.
- `size={16}` — inside standard / spacious rows, buttons, headers.

Default `strokeWidth={1.75}` for the lucide weight to match the type. Always pair with
`aria-hidden="true"` when decorative; otherwise provide a label via the parent's
`aria-label`.

## Interactive states

Every clickable row, card or chip must declare four states. Hover-as-text-recolor is
banned — the eye must see the surface change.

| State | Recipe |
|---|---|
| Rest | `bg-graphite border border-edge` (or `bg-slate-deep` for cards). |
| Hover | `hover:bg-slate-deep/40 hover:border-edge-bright` (cards: `hover:border-edge-bright + hover:bg-slate-deep`). |
| Selected / active | `bg-mineral-dim border-mineral/40` (or current-route in shell: `bg-slate-deep border-l-2 border-l-mineral`). |
| Focus-visible | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mineral/40` |
| Disabled | `disabled:opacity-50 disabled:cursor-not-allowed` |

A row that is not a `<button>` or `<a>` but is clickable must carry `tabIndex={0}` and a
`role` (typically `role="button"`) and listen to `onKeyDown` for `Enter`/`Space`.

## Empty / loading / error

Three shared primitives — see [ui/src/components/ui/state-empty.tsx](../../ui/src/components/ui/state-empty.tsx),
`state-loading.tsx`, `state-error.tsx`. Every list view (Inbox sections, Issues list,
Issues kanban, Runs, Issue Detail activity, Issue Detail comments) must render one of
these in place of a placeholder string.

Anatomy: muted lucide icon (`size={20}` `text-ash`), title `text-sm font-medium
text-silver`, secondary line `text-xs text-ash`. Optional action button via the
`action` slot.

## What this pass is not

- Not a behaviour change. No new flow, no new IA. Cosmetic and primitive consolidation only.
- Not a light-mode introduction. Superkick is dark-only at root.
- Not a colour reshuffle. Tokens already exist — we propagate them.
