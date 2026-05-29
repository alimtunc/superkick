# Superkick — Visual redesign reference (2026-05)

**Coded reference, not images.** Every value engineering needs lives in
`tokens.css` as a CSS custom property. Read it straight; do not pixel-sample.

## How to read this

Open **`index.html`** — the System Legend. It is the anchor: full token table,
the explicit **elevation & color map** (which surface uses which tier), the
status/priority glyph geometry, the fixed per-entity avatar palette, type scale,
spacing/radii/shadows, motion specs, z-index, and the real-data **sparsity rule**.
Everything the previous round left ambiguous is decided there.

Then the five surface pages, in priority order.

## Files

| File | What it is |
|------|------------|
| `tokens.css`   | **Source of truth.** All design tokens as CSS custom properties. Maps 1:1 to `ui/src/styles/tokens.css`. Dark is `:root`; light is a 1:1 override stub. |
| `app.css`      | Product components, part 1 — primitives (glyphs, avatars, chips, buttons, inputs, states), app shell, issues list, kanban. |
| `detail.css`   | Product components, part 2 — issue detail, ExecutionLog, operator banner, activity feed + connector, composer, properties rail, run drawer, inspector. |
| `docs.css`     | Deliverable presentation chrome only (index, artboards, legend tables). **Not product UI** — do not ship. |
| `index.html`       | 00 · System Legend |
| `issues-list.html` | 01 · Issues list — groups, pinned “Needs you”, tabs, filter bar + dropdown, hover preview, board, empty/loading |
| `issue-detail.html`| 02 · Issue detail — description → ExecutionLog → operator banner → activity feed → composer + rail; states: needs-human / active / idle-empty / done / loading |
| `app-shell.html`   | 03 · Sidebar anatomy, nav states, topbar action clusters, ⌘K command bar |
| `run-drawer.html`  | 04 · Slide-in drawer over the issue; tabs: activity / tool calls / files / logs / terminal |
| `run-inspector.html`| 05 · Deep-link run cockpit; active + failed |
| `launch.html`       | 06 · **LaunchComposer** dialog — per-step agent picker, execution mode, worktree, instructions; semi-auto / launching / queue |
| `agents.html`       | 07 · Agents list (`AgentSummary` — runs, success, sparkline) + Settings (daemon, Linear, launch profile, **live theme toggle**) |
| `patterns.html`     | 08 · Cross-cutting: focus & keyboard, rail edit pickers, connection/daemon states, toasts, destructive confirm, full activity/history vocabulary + threaded comments |
| `icons.js` `shell.js` `glyphs.js` `detail.js` `scale.js` | Reference-only helpers: an SVG icon sprite, the shared sidebar, glyph/row/rail renderers, and the artboard scale-to-fit. They document the data→DOM mapping; the *values* still come from the CSS files. |

## Decisions made explicit (the churn-killers)

- **Elevation map** — flat & border-delineated. Floor (tier 0) carries the
  sidebar, topbar, list rows, issue body **and** the properties rail (rail is
  border-separated, not raised). Elevation is spent only on ExecutionLog,
  comment cards, kanban cards, the drawer, popovers, the hover preview. Code
  blocks are the one surface darker than the floor. Full table in the legend.
- **Activity-feed connector** — yes. A single vertical gutter line links both
  comment cards (tier 2) and inline system events.
- **Inputs** — always one notch *above* their surface (`--bg-input`), never a
  hole; accent focus ring.
- **Per-entity colors** — fixed avatar palette, never hashed. Humans render as
  circles, agents (`claude`/`codex`) as rounded-squares with a state dot.
- **Sparsity** — omitted fields collapse in rows/cards; in the rail every
  property is always shown with a dim actionable placeholder.

## Scope

Design reference only. No files under `ui/src/` were touched.
Fonts: **Geist** (UI) + **Geist Mono** (mono); `--font-mono` maps cleanly to
JetBrains Mono if you prefer the existing stack. Dark is primary; a complete
**light** override ships in `tokens.css` (toggle it live on the Settings page).
A token crosswalk to the existing `@theme` names is in the legend (§12).
