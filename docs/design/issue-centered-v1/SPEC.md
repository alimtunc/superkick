# Superkick · Issue-centered v1 — SPEC

> Implementation contract. Every number here is extracted from the approved
> artifacts (A1 / A2 / A3 — see README.md). When in doubt, open the artifact
> artboard cited at the end of each section.
>
> **Naming convention.** Token names use the live CSS-variable form
> (`var(--sk-surface)`) so they paste straight into code. The same names exist
> as JS keys (`SK.dark.surface`) — see `screens/sk-tokens.jsx`.

## Contents

0. [Foundations — design-language non-negotiables](#0-foundations)
1. [Typography scale](#1-typography-scale)
2. [Color roles](#2-color-roles)
3. [Surfaces, backgrounds, borders](#3-surfaces-backgrounds-borders)
4. [Spacing scale, radii, shadows](#4-spacing-radii-shadows)
5. [Icon system](#5-icon-system)
6. [Atom components](#6-atoms-pill-label-chip-avatar-kbd-btn-dot-taskdot)
7. [App shell — sidebar, topbar, page](#7-app-shell)
8. [Issue list row anatomy](#8-issue-list-row)
9. [Group header (list)](#9-group-header)
10. [View tabs + filter bar + filter dropdown](#10-view-tabs--filter-bar--filter-dropdown)
11. [Issue hover card](#11-issue-hover-card)
12. [Kanban card + column](#12-kanban-card--column)
13. [Issue Detail — body + rail](#13-issue-detail--body--rail)
14. [Sub-issues card](#14-sub-issues-card)
15. [Comment card](#15-comment-card)
16. [Activity timeline event (issue page)](#16-activity-timeline-event-issue-page)
17. [Execution log section (inline on issue)](#17-execution-log-inline-on-issue)
18. [Run drawer (640px slide-in)](#18-run-drawer)
19. [Task Cockpit (deep-link page) + Now panel](#19-task-cockpit--now-panel)
20. [Run Inspector (deep-link page)](#20-run-inspector)
21. [States — empty, loading, error](#21-states-empty-loading-error)
22. [Motion + interaction primitives](#22-motion--interaction)

---

## 0. Foundations

Five non-negotiables that define the design language. A drift on any of these
is automatically a **P0** in the parity checklist.

1. **Linear-faithful density.** List rows are 36px tall. Group headers are 32px.
   The only legal vertical rhythm at the list level is 32 / 36. Don't pad them
   "to breathe". Don't wrap titles to two lines.
2. **Four-tier surface elevation, never more.** `void → surface → raised → overlay`.
   See §3. Adding a 5th tint is an automatic P0. Do not introduce gradients,
   blur fills, or layered cards-on-cards.
3. **Cobalt-violet `#5b6ef2` is sparse.** Primary actions, active rail, view-tab
   underline (sometimes), `agent`/`SK` provenance tags. **Never** as a decorative
   background, gradient, or hover tint on lists.
4. **Semantic colors are for STATUS only, never decoration.** `success` ≠ "good
   thing", it ≠ "completed". It means: "this row/badge represents a Done /
   shipped / green-CI state." Same for warn / danger / info.
5. **The Issue is the anchor.** Tasks and Runs do not appear in the sidebar.
   Agent work renders inline on the issue (ExecutionLog) and drills into a
   right-edge **Drawer**, not a full page. The Run Inspector at `/runs/<id>`
   exists, but it is reached from the drawer's "Open full page", not from nav.

   This rule overrides historical patterns where Tasks/Runs had their own pages.

> **Alignment decision (2026-05-25).** When the implementation adds something the
> spec doesn't cover, the implementation hides it — the spec does not absorb the
> addition. Hidden features are tracked in `IMPLEMENTATION_EXTRAS.md`, kept in
> code behind a default-off flag (or removed outright), and only graduate back
> into the UI once a future design round approves their anatomy.

---

## 1. Typography scale

**Family:**

- UI: `"DM Sans", "Inter", system-ui, -apple-system, sans-serif` → `var(--sk-font)`
- Mono: `"JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace` → `var(--sk-mono)`
  Mono is loaded with `font-feature-settings: "tnum","ss01"` for all numeric content.

**Base body:** 14px / line-height 1.45. Set once on the page root, not per-component.

**Scale.** These ten sizes cover every text element across the three artifacts.
Do not introduce new sizes. If a layout needs a different size, use weight and
color instead.

| Token   | px    | Weight   | Family | Used for                                                      |
|---------|-------|----------|--------|---------------------------------------------------------------|
| `t-19`  | 19    | 600      | UI     | Memo title, navigation memo headers (one-off, not on screens) |
| `t-15`  | 15    | 500      | UI     | Empty-state primary line                                       |
| `t-14`  | 14    | 500      | UI     | "Now" panel headline, hover-card title, Issue Detail h2-ish    |
| `t-13_5`| 13.5  | 400–500  | UI     | Btn `md` label, issue description body                         |
| `t-13`  | 13    | 400      | UI     | Issue row title, view tab label, sidebar item label, comment body |
| `t-12_5`| 12.5  | 400–600  | UI     | Filter chips, group header label, comment-meta, drawer tab label |
| `t-12`  | 12    | 400–500  | UI     | Property-rail values, KV labels, breadcrumb item               |
| `t-11_5`| 11.5  | 400      | UI/mono| ID slug, updated timestamp, file path, code in body            |
| `t-11`  | 11    | 500      | UI/mono| Pill text, Label chip text, count badges                       |
| `t-10_5`| 10.5  | 600      | UI     | Section eyebrows (`PROPERTIES`, `NOW`, `RUN`), uppercase 0.8–0.9 letter-spacing |
| `t-10`  | 10    | 600      | UI     | Drawer KV label uppercase, sidebar workspace tile             |
| `t-9_5` | 9.5   | 600      | UI     | "agent" / "SK" provenance tag inside another label             |

Rules of thumb:

- **Tabular numbers everywhere** that shows counts, timestamps, IDs, costs,
  estimates, diff stats. Use `.sk-mono .sk-num` or `font-variant-numeric:
  tabular-nums`. Counts that jitter horizontally are an instant tell of bad
  implementation.
- **Eyebrow rule.** Section labels (`PROPERTIES`, `NOW`, `WORKTREE`,
  `RECENT ACTIVITY`, `FILES CHANGED`) are 10.5px / 600 / uppercase / letter-spacing
  0.8–0.9, color `var(--sk-fgDim)`. Don't make them title-case sentence labels.
- **Body line-height.** Issue description: 1.65. Comment body: 1.55. Hover
  card description: 1.55. Everything else inherits 1.45.
- **`text-wrap: pretty`** on issue titles and descriptions.

---

## 2. Color roles

Three families: surfaces, ink, accents/semantics. Defined as CSS variables for
both themes. **Do not hard-code hex anywhere outside the token file.**

### 2.1 Dark theme (default)

| Variable                 | Hex / rgba                          | Role                                                              |
|--------------------------|-------------------------------------|-------------------------------------------------------------------|
| `--sk-void`              | `#0b0d0f`                           | Page behind everything (gutters between Page and sidebar, kanban board floor). |
| `--sk-surface`           | `#15181c`                           | Primary surface: sidebar, list, cards, right rail.                |
| `--sk-raised`            | `#1c2026`                           | Raised within surface: row hover, active tab, input bg, chip bg.  |
| `--sk-overlay`           | `#23282f`                           | Popovers, command bar, hover card, dialogs.                       |
| `--sk-border`            | `#262b32`                           | Hairlines between rows, sections, panels.                         |
| `--sk-borderStrong`      | `#323843`                           | Emphasized borders: dashed avatar slot, scaffold elements.        |
| `--sk-fg`                | `#e7e9ec`                           | Primary text.                                                     |
| `--sk-fgMuted`           | `#9aa0a8`                           | Secondary text: labels, property values, tab inactive.            |
| `--sk-fgDim`             | `#6b727b`                           | Tertiary text: timestamps, IDs, sub-labels.                       |
| `--sk-accent`            | `#5b6ef2`                           | Brand accent — sparse use.                                        |
| `--sk-accentSoft`        | `rgba(91,110,242,.16)`              | Selected-row tint, agent/SK badge bg.                              |
| `--sk-accentLine`        | `rgba(91,110,242,.50)`              | Agent/SK badge border, focus rings.                                |
| `--sk-success`           | `#4ea674`                           | Done / merged / shipped / passing CI.                              |
| `--sk-successSoft`       | `rgba(78,166,116,.13)`              | Success banner bg, success pill bg.                                |
| `--sk-warn`              | `#d4a04a`                           | Needs-you / paused / stuck.                                        |
| `--sk-warnSoft`          | `rgba(212,160,74,.14)`              | Needs banner, warn pill, "Needs you" pinned band tint.             |
| `--sk-danger`            | `#cf5a55`                           | Urgent priority, failed tests, blocked.                            |
| `--sk-dangerSoft`        | `rgba(207,90,85,.13)`               | Danger pill, drop sidebar in nav memo, etc.                        |
| `--sk-info`              | `#5b8ec9`                           | In-progress, running, neutral status emphasis.                     |
| `--sk-infoSoft`          | `rgba(91,142,201,.13)`              | Info pill bg.                                                      |
| `--sk-code`              | `#0f1114`                           | Code block bg (one shade darker than void).                        |
| `--sk-codeFg`            | `#cdd2d8`                           | Code text.                                                         |

### 2.2 Light theme

Light is defined in tokens but is **not the primary surface** for this round.
Use it only where dark→light translation is obvious (1:1 token swap). Differences
of note vs dark:

- `--sk-void` is warm beige `#ebe7df`, `--sk-raised` is `#f6f3ec`. Light theme
  uses a paper aesthetic — don't replace these with pure greys.
- Accent on light is `#3d52d6` (denser/inkier).

### 2.3 Semantic-color anti-patterns (P0 if shipped)

- Using `--sk-success` to tint a "completed checkbox" outside the Done status.
- Using `--sk-accent` as a hover background on list rows. (Hover = `--sk-raised`.)
- Filling avatar backgrounds with `--sk-accent` for ordinary users.
- Using `--sk-warn` as a "highlight" color (e.g. yellow background behind
  copy). Warn means: this needs human attention.

---

## 3. Surfaces, backgrounds, borders

The elevation rules. Memorize.

```
┌──────────────────────────────────────── void  #0b0d0f  ───────┐
│  (gutters, kanban board floor, code block surroundings)        │
│                                                                │
│  ┌──── surface  #15181c  ─────────────────────────────────┐    │
│  │  (sidebar, list, card outer, rail, comment card)        │    │
│  │                                                         │    │
│  │  ┌── raised  #1c2026  ───────────────────────────┐      │    │
│  │  │  (hover state, input, filter chip, code chip)  │      │    │
│  │  │                                                │      │    │
│  │  │  ┌─ overlay  #23282f  ───────────────────┐     │      │    │
│  │  │  │  (popover, hover card, dropdown)       │     │      │    │
│  │  │  └────────────────────────────────────────┘     │      │    │
│  │  └────────────────────────────────────────────────┘      │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

Rules:

- **Never skip a tier upward.** A popover (overlay) can sit on surface; an
  input (raised) cannot sit on void.
- **Never paint two raised tiers next to each other to create depth.** Use
  borders, not extra grey.
- **Borders are always `--sk-border`** except where explicitly emphasized
  (`--sk-borderStrong` for dashed placeholders, drop targets).
- **Status banners (NeedsBanner, success/danger strips)** use a color-mixed
  tint over surface: `color-mix(in srgb, var(--sk-warn) 10%, var(--sk-surface))`
  with a border that's a color-mix of warn + border at 30%. See §17.

---

## 4. Spacing, radii, shadows

### 4.1 Spacing scale

Multiples of 4. Do not invent intermediate values.

| Token | Px  | Common use                                          |
|-------|-----|-----------------------------------------------------|
| `xs`  | 4   | Icon-to-text gap, sub-second adjustments            |
| `sm`  | 8   | Inline gap, internal control padding-y              |
| `md`  | 12  | Card padding, comment padding                       |
| `lg`  | 16  | Section padding, exec section padding-x             |
| `xl`  | 24  | Page-edge padding (list rows: `0 24 0 20`)          |
| `xxl` | 32  | Major section separation                            |

**One asymmetry to remember:** the list-row horizontal padding is **left 20 / right 24**.
This is intentional — gives the priority/status glyph cluster a 20px gutter
while the right-edge meta column (updated · taskDot) gets the 24 standard
gutter. Don't normalize it.

### 4.2 Radii

| Token | Px  | Where                                               |
|-------|-----|-----------------------------------------------------|
| —     | 3   | Tool badge in drawer, KBD-style mini chips          |
| —     | 4   | Pills, small chips, count badges                    |
| `sm`  | 5   | Filter chips, DisplayChip, FilterBar buttons, PropRow row hit-area, view toggle |
| `sm`  | 6   | Status pill 5/6, "Pinned" tag                       |
| `r`   | 7   | Btn, sidebar item, kanban card, exec section button, comment card inner sometimes |
| `md`  | 8   | Sub-issues card, comment card, NeedsBanner inner    |
| `lg`  | 10  | ExecutionLog outer, composer, hover card            |
| `xl`  | 16  | Reserved — not used in current artifacts            |
| `999` | —   | Avatars, label chips, status dots, task dot         |

### 4.3 Shadows

Only three. All include a 1px ring border (`box-shadow … , 0 0 0 1px var(--sk-border)`).

| Class           | Box-shadow                                                                    | Where                          |
|-----------------|-------------------------------------------------------------------------------|--------------------------------|
| `sk-shadow-1`   | `0 1px 0 rgba(0,0,0,.04)`                                                     | Kanban card resting state      |
| `sk-shadow-2`   | `0 8px 24px rgba(0,0,0,.28), 0 0 0 1px var(--sk-border)`                       | Popovers, hover card (light)   |
| `sk-shadow-3`   | `0 24px 60px rgba(0,0,0,.45), 0 0 0 1px var(--sk-border)`                      | Hover card (dark), drawer shell, dragging kanban card |

**Drag-state shadow override** for kanban cards: `0 14px 30px rgba(0,0,0,.5)`
+ accent border + `rotate(-1.2deg)` transform. Used only when actively
dragging.

**Drawer shadow** is special: `-12px 0 40px rgba(0,0,0,.45)` (asymmetric left).
See §18.

---

## 5. Icon system

All icons are **stroked SVGs, 1.4–1.6 stroke-width**, centered in a square
viewBox of 14 or 16, rendered through the `<Icon>` primitive in
`screens/sk-primitives.jsx`. **Never use a bitmap icon, never an emoji.**

### 5.1 Sizes

| Size | Where                                                                                |
|------|--------------------------------------------------------------------------------------|
| 10   | Inside KBD shortcuts (rare)                                                          |
| 11   | Inline meta icons (folder, clock, github, branch), list-row glyphs that aren't primary |
| 12   | Group header chevron, filter button, KV row icons, sidebar count badges              |
| 13   | View-tab icon prefix, primary button icons (`sm`), execution-log header              |
| 14   | Default — status circle, sidebar item, Btn `sm` ic                                   |
| 15   | Btn `md` ic                                                                          |
| 16   | Avatar interior icon at `size=28`                                                    |

The `<Icon>` primitive accepts `name`, `size`, `color`, `strokeWidth`. Stroke
defaults to currentColor or `var(--sk-fgMuted)`. Pass `var(--sk-fgDim)` for
glyphs that should recede (folder, clock, github inside a row).

### 5.2 Status icons — Linear vocabulary (mandatory)

In `screens-v2/sk-icons.jsx`, exported as `<StatusIcon kind size>`. **All seven
states are required.** Don't invent additional states.

| `kind`      | Glyph                                                  | Color token        |
|-------------|--------------------------------------------------------|--------------------|
| `backlog`   | dashed circle (`stroke-dasharray: 2.2 2`)              | `--sk-fgDim`       |
| `todo`      | empty circle, 1.6 stroke                                | `--sk-fgMuted`     |
| `progress`  | circle, top-right quadrant filled (Linear "in progress")| `--sk-info`        |
| `needs`     | circle, top-half filled (Superkick-specific shape)      | `--sk-warn`        |
| `review`    | circle, tinted fill at 0.18 opacity, check glyph inside | `--sk-accent`      |
| `done`      | solid disc with `void`-colored check                    | `--sk-success`     |
| `cancelled` | solid disc with `void`-colored ✕                        | `--sk-fgDim`       |

Default render size on a row: **14px** for the status column, **13px** in
property rail values, **11–12px** inside sub-issue rows.

### 5.3 Priority icons — Linear vocabulary

Exported as `<PriorityIcon kind size>`. **All five required.**

| `kind`    | Glyph                                                          |
|-----------|----------------------------------------------------------------|
| `urgent`  | Red square (border-radius 2) with white `!` glyph              |
| `high`    | 3 ascending bars (3/3 filled with `--sk-fg`)                   |
| `medium`  | 3 ascending bars (2/3 filled)                                  |
| `low`     | 3 ascending bars (1/3 filled)                                  |
| `none`    | 3 dim dots in a horizontal line                                |

Default render size on a row: **13px**.

### 5.4 Glyph anti-patterns

- **Don't use filled colored backgrounds behind status glyphs.** The glyph
  itself encodes the state.
- **Don't replace `needs` with a yellow circle.** It has a specific shape.
- **Don't use a Heroicons/Lucide check inside a "Done" status row.** Use
  `<StatusIcon kind="done">`.

---

## 6. Atoms (Pill, Label chip, Avatar, Kbd, Btn, Dot, TaskDot)

### 6.1 `<Pill>` — status indicator, **not a button**

Source: `screens/sk-primitives.jsx`.

```
height 18 / padding 1px 7px / radius 4 / fontSize 11 / fontWeight 500
gap 5 / line-height 1
optional 5×5 dot at lead (animated via .sk-pulse 1.6s when pulse=true)
```

Tones map 1:1 to semantic colors (neutral, accent, success, warn, danger,
info). Background `{tone}Soft`, foreground `{tone}`. Border `--sk-border` for
neutral only.

Used for: state badges ("running", "shipped", "paused", "1 fail"), inline
provenance tags, anywhere a value needs a colored frame.

### 6.2 `<Label>` (chip) — issue label / tag

Source: `screens-v2/sk-icons.jsx`.

```
height 18 / padding 1px 7px 1px 6px / radius 999 / border 1px var(--sk-border)
gap 5 / fontSize 11 / color var(--sk-fgMuted) / white-space nowrap
prefix dot 7×7 round, color from label hex
```

**Do not change the prefix dot size or the border.** Labels are pill-shaped,
not rounded-rectangle. Labels are always borderless when inside the hover card
body? No — they keep the border everywhere. The visual weight comes from
internal color tinting, not bg fill.

### 6.3 `<Avatar>`

```
size variable (14, 16, 18, 20, 22, 24, 26 are all used)
radius 999 / background = passed color (per-person hue) / color #fff
initials: 2-char, font-size = size × 0.42, weight 600, letter-spacing 0.2
icon variant: same disc, child icon at size × 0.55 (e.g. bot avatars)
empty/unassigned: 20px disc with dashed --sk-borderStrong border, no fill
```

**Per-agent colors are fixed.** Source: `screens-v3/sk-v3-chrome.jsx`.

| Agent / person     | Color    |
|--------------------|----------|
| `fix-bot`          | `#3a6f4e` |
| `review-bot`       | `#5b6ef2` |
| `senior-bot`       | `#a87a1f` |
| `Léa M`            | `#6f5ad9` |
| `C. Park`          | `#b06a3a` |
| `Owen`             | `#357a8a` |

When a new agent/person appears in real data, the orchestrator assigns a hue.
**Do not pull a color from a hash function** — that produces visually-similar
neighbors and confuses scan.

### 6.4 `<Kbd>` — keyboard shortcut chip

```
minWidth 18 / height 18 / padding 0 5px / radius 4
bg --sk-raised / border 1px --sk-border / color --sk-fgMuted
font-size 10.5 / font-family mono / font-weight 500
```

Always sits inside a row that has `sk-row { gap: 4 }`, e.g. `⌘ K`.

### 6.5 `<Btn>` — button

Two sizes (`sm`, `md`) × four kinds (`primary`, `secondary`, `ghost`,
`danger`). One extra `surface` variant exists in primitives but is currently
unused on these screens.

| Size | Height | Padding-x | Font-size | Icon size |
|------|--------|-----------|-----------|-----------|
| `sm` | 26     | 10        | 12.5      | 14        |
| `md` | 32     | 13        | 13.5      | 15        |

| Kind        | Bg                | Fg                  | Border               |
|-------------|-------------------|---------------------|----------------------|
| `primary`   | `--sk-accent`     | `#fff`              | transparent          |
| `secondary` | `--sk-raised`     | `--sk-fg`           | 1px `--sk-border`    |
| `ghost`     | transparent       | `--sk-fgMuted`      | transparent          |
| `danger`    | transparent       | `--sk-danger`       | 1px `--sk-border`    |

Common: `border-radius 7 / gap 7 / font-weight 500 / font-family inherit`.

**`full` prop** stretches to 100% width and centers content — used in the Now
panel intervene section and the Tasks tile.

### 6.6 `<Dot>` — bare status dot

Default 8px round, color from tone. Optional pulse via the `sk-pulse 1.6s
ease-in-out infinite` keyframe (opacity 1 → 0.45 → 1).

Sizes seen on screens: 5, 6, 7, 8.

### 6.7 `<TaskDot>` — Superkick-only

**The single Superkick-specific glyph on a list row.** Trailing-edge dot that
encodes agent state. **Never has a text label.** When nothing is in flight,
render an invisible 8px spacer to keep column alignment.

```
size 8 (rows) or 7 (kanban / past runs) / radius 999
background = tone color (warn/info/accent/success)
pulse: 'needs' and 'running' pulse with a 3px outer ring at 18% color-mix
hover title = "Superkick · {state}"
```

| `state`   | Tone           | Pulse | Meaning                         |
|-----------|----------------|-------|---------------------------------|
| `needs`   | `--sk-warn`    | yes   | Agent paused, needs the human   |
| `running` | `--sk-info`    | yes   | Agent in flight                 |
| `review`  | `--sk-accent`  | no    | PR open, waiting on review      |
| `shipped` | `--sk-success` | no    | Done                            |

---

## 7. App shell

Source: `screens/sk-shell.jsx`.

### 7.1 Sidebar

```
width 224 / height 100% / bg --sk-surface / border-right 1px --sk-border
padding 14px 12px / gap 2 between items
flex: none (never grows)
```

**Workspace tile** (top): row gap 9, padding 4 8 12; the `S` square is 26×26,
radius 7, bg `--sk-accent`, color #fff, font-size 13, weight 700. Workspace
name 13/600/fg, org name 11/fgDim.

**Search row** (below tile): gap 7, padding 6 9, radius 7, bg raised, border
1px border. margin-bottom 12.

**Nav items**:

```
gap 10 / padding 7px 10px / radius 7 / fontSize 13
on (active):  bg --sk-raised  /  color --sk-fg
off:          bg transparent  /  color --sk-fgMuted
ACTIVE RAIL: 2px wide tab pinned at left -10, top 6, bottom 6, radius 2,
             bg --sk-accent. (This is the only place accent appears in nav.)
icon size 14 / fgDim when off, currentColor when on
badge: fontSize 11 / fontWeight 600 / padding 1px 6px / radius 999
       accent: bg --sk-accent / color #fff
       muted:  bg --sk-raised / color --sk-fgMuted
```

**Required nav set (post-decision):**

```
Inbox      icon=inbox     badge=count (accent tone if >0)
Issues     icon=issue     badge=count (muted tone)
Agents     icon=agent
─────────  divider (1px border, margin 14 0 10 0)
PINNED     section header eyebrow
  · saved views go here
─────────  divider
Settings   icon=settings
```

**Removed in this round (P0 to delete from current implementation):**
`Tasks` and `Runs`. They are NOT sidebar destinations — see §5 of the
Foundations.

### 7.2 Topbar (`Page` header)

```
height 52 / padding 0 24px / border-bottom 1px --sk-border / bg --sk-surface
gap 14 / flex none
```

Left column (`sk-col gap=2 flex=1`):

- Crumbs row: gap 6, fontSize 11.5, color fgDim. Separators are `›` glyphs
  with `fgDim` color. Last crumb on a leaf page is `fgMuted`.
- Title + sub row.

Right cluster: action buttons (sm), separated by a 1×18 vertical divider in
`--sk-border` with `margin: 0 4px`.

### 7.3 Page composition

`<Page>` = `<Sidebar>` + (`<Topbar>` + content). Content area has `flex: 1`,
`min-height: 0`, `overflow: hidden`. Children manage their own scroll.

---

## 8. Issue list row

**The single most-broken component in current implementation. Read this whole
section before touching `IssueRow`.**

Source: `screens-v3/sk-v3-row.jsx` → `IssueRowV3`. Artifacts: A1 → §02/03/04/05.

### 8.1 Geometry

```
height: 36   (NOT 32, NOT 40 — exactly 36)
padding: 0 24px 0 20px
gap: 10
border-bottom: 1px solid var(--sk-border) (omit on last row only)
font-size: 13
cursor: pointer
position: relative
```

### 8.2 Column order (left→right) and exact widths

Every column has a fixed `width` or `flex: 1`. Don't change order.

| #  | Column      | Width      | Notes                                                                  |
|----|-------------|------------|------------------------------------------------------------------------|
| 1  | Priority    | 14, center | `<PriorityIcon size=13>`. Always present even for `none`.              |
| 2  | Status      | 14, center | `<StatusIcon size=14>`. Always present.                                |
| 3  | Identifier  | 64         | mono, 11.5px, `var(--sk-fgDim)`, no letter-spacing.                    |
| 4  | Title       | flex 1     | 13px, `var(--sk-fg)`, weight 400, **single line ellipsis**. `min-width: 0`. |
| 5  | Labels      | auto       | max 2 visible; if more, append `+N` (fontSize 11, fgDim). Hide entirely if zero. |
| 6  | Sub-count   | 42, right  | `<SubCountChip done total>` or empty 42-wide spacer.                   |
| 7  | Project     | 140, left  | `<ProjectTag>` (folder icon 11 + name 11.5, fgMuted, ellipsis at 140). |
| 8  | Estimate    | 22         | `<EstimateChip n>` (22×18 bordered chip, 11px mono) or empty 22-spacer.|
| 9  | Assignee    | 22, center | 20px avatar, or 20px dashed-border empty disc.                         |
| 10 | Updated     | 38, right  | mono, 11.5px, fgDim, e.g. `8m`, `3h`, `1d`, `1w`.                      |
| 11 | TaskDot     | 10, center | 8px dot or invisible spacer.                                           |

**Sum of fixed widths:** 14+14+64 + flex + 42+140+22+22+38+10, gaps included.
Don't shrink the right-side columns; let title flex.

### 8.3 States

| State     | Background           | Other                                                              |
|-----------|----------------------|--------------------------------------------------------------------|
| default   | transparent          | —                                                                  |
| hover     | `--sk-raised`        | Triggered via `.sk-row-v3:hover` CSS rule, NOT JS state.           |
| active    | `--sk-raised`        | When focused/keyboard-selected — same as hover visually.           |
| selected  | `--sk-accentSoft`    | + `box-shadow: inset 2px 0 0 var(--sk-accent)` (left accent rail)  |
| pressed   | `--sk-raised`        | (no spec change — same as hover)                                   |
| disabled  | (not specified)      | Don't use this — rows are always interactive in scope of this round.|

Hover preview opens after **350ms hover** (see §11), not immediately.

### 8.4 Do / Don't

✅ **Do** keep `min-width: 0` on the title cell. Without it the ellipsis breaks.
✅ **Do** render the priority and status columns even when the value is `none`
   — the empty glyph still occupies 14px of horizontal space.
✅ **Do** render `+N` overflow for labels (right of the visible chips, before sub-count).
✅ **Do** keep the asymmetric left/right padding (20/24).

❌ **Don't** make the row 32px tall to "match Linear". It is 36px.
❌ **Don't** add a column separator (vertical hairline) between cells.
❌ **Don't** wrap the title to two lines on long titles. Ellipsis only.
❌ **Don't** render a colored background based on priority/status. Status
   color belongs in the glyph, nowhere else.
❌ **Don't** show TaskDot as a text badge ("needs you"). It is a dot. Tooltip
   only.
❌ **Don't** show row separators inside the pinned "Needs you" band — the
   band's pinned border-top is the visual separator.

### 8.5 React/Tailwind notes

- Pure flexbox row with explicit widths on cells; do not use CSS grid here —
  the flex+min-width-0 approach handles ellipsis cleanly across browsers.
- All numeric cells use `font-variant-numeric: tabular-nums`.
- The hover state is set with `.sk-row-v3:hover { background: var(--sk-raised); }`
  in a global stylesheet, not React state, to avoid 36-row re-renders on
  pointer-move.

**Artboard proof:** A1 → `list-default-dark`, `list-hover-dark`.

---

## 9. Group header

Source: `screens-v3/sk-v3-row.jsx` → `GroupHeaderV3`. Artifact: A1.

```
height 32 / padding 0 24px 0 20px / gap 9 / flex none
border-bottom 1px --sk-border
position: sticky / top: 0 / z-index: 2
background:
  default → --sk-surface
  pinned ("Needs you") → color-mix(in srgb, var(--sk-warn) 8%, var(--sk-surface))
border-top (pinned only): 1px color-mix(in srgb, var(--sk-warn) 25%, var(--sk-border))
```

Contents in order:

1. Chevron 11px (chevDown when open, chev when collapsed) — fgDim
2. Status icon (14px) **or** 8×8 colored dot from the `tone` prop
3. Label — 12.5/600. For pinned: color `--sk-warn` and `letter-spacing: 0.2`.
4. Count — mono 11px, fgDim
5. If `pinned`: small uppercase **"pinned"** tag — fontSize 10.5/500/0.4
   letter-spacing, color warn, padding 1 6, radius 4, border 1px warn-tint
   30%, bg warn-tint 8%.
6. Flex spacer
7. Optional `action` slot (e.g. "Show 12 done" link)
8. `+` (12) and `more` (13) icons in fgDim

**Don't** add a row separator above a group header — its border-bottom plus
the previous row's border-bottom forms the divider.

**Required groups (ordered, dropping any that are empty):**

1. `Needs you` (pinned, tone=warn) — only when there are needs-human reviews
2. `In Progress` (tone=info)
3. `In Review` (tone=accent)
4. `Todo` (tone=muted)
5. `Backlog` (tone=muted)
6. `Done` is hidden by default and revealed via the inline "Show N done this
   week" affordance below the list (gap 8, padding 14 24, fontSize 12,
   color fgDim, with a `sk-link` underlined "Show").

For the **Recently shipped** tab, groups are time windows: `Last 3 days`,
`Last 7 days`, with status icon kind=`done`, tone=success.

**Artboard proof:** A1 → `list-default-dark` (all groups), `list-shipped-dark`.

---

## 10. View tabs + filter bar + filter dropdown

### 10.1 View tabs

Source: `screens-v3/sk-v3-chrome.jsx` → `ViewTabsV3`. Three tabs only.

```
container: height 38, padding 0 16, border-bottom 1px, bg surface, flex none
tab: padding 0 12px, height 100%, gap 7, font-size 13
     on:  weight 500, color fg
     off: weight 400, color fgMuted
count badge per tab: font-size 11, padding 0 5, radius 4, bg raised,
                    color fgDim, min-width 16, text-align center, line-height 16
active underline: position absolute, left 8 right 8 bottom -1, height 2,
                  background --sk-fg, radius 2
                  (note: the underline is fg, NOT accent)
right cluster: gap 6, fontSize 12.5, fgDim "+ New view" affordance
```

Tabs (in order, **don't reorder**):

1. `My open work` (default for /issues) — pinned
2. `All open`
3. `Recently shipped`

### 10.2 Filter bar

Source: `FilterBarV3`. Sits below view tabs.

```
min-height 41, padding 7 16, gap 6, border-bottom 1px, bg surface, flex none
```

Contents:

1. **+ Filter button** — dashed:
   ```
   height 26, padding 0 9, radius 5, bg transparent,
   border 1px DASHED --sk-border, color fgMuted, font-size 12, gap 5
   icon=plus size=11
   ```
2. Filter chips (`FilterChipV3`):
   ```
   height 26, padding 0 4 0 9, radius 5, bg --sk-raised,
   border 1px --sk-border, font-size 12, color fg
   key:   fgMuted        op (is / is not):  fgDim
   value: fg, weight 500. If toned (e.g. status), color = var(--sk-{tone}).
   optional accent slot before value (Avatar 14 for assignee chips)
   remove button 18×18, radius 4, ✕ icon size 10, fgDim
   ```
3. (anything else passed as `extra`)
4. Flex spacer
5. **DisplayChip("Group", "Status")** and **DisplayChip("Sort", "Priority")**:
   ```
   height 26, padding 0 8, radius 5 (no border, no bg),
   font-size 12, color fgMuted; key fgDim, value fg
   trailing chevDown 10 fgDim
   ```
6. **View toggle** (segmented):
   ```
   height 26, radius 5, bg --sk-raised, border 1px --sk-border, padding 2, gap 1
   each segment: 26×100%, radius 3
   on:  bg --sk-surface, color fg
   off: bg transparent, color fgDim
   icons: list (doc, 12), board (layers, 12)
   ```
7. Display-options gear button (26×26, radius 5, transparent, fgDim icon).

### 10.3 Filter dropdown

Source: `FilterDropdownV3`. Opens on `+ Filter` click.

```
width 240 / padding 6 / radius 8
bg --sk-overlay / border 1px --sk-border
shadow: 0 18px 40px rgba(0,0,0,.5)
position absolute, top from button bottom, left aligned to button left
zIndex 6 (above filter bar)
```

Layout:

- Search input row: gap 6, padding 4 6 6, border-bottom 1px border, marginBottom 4.
  Icon `search` size 12 fgDim + `<input placeholder="Filter…">` transparent.
- Eyebrow: padding 4 8 4, "Filter by" 10.5/600 uppercase 0.8 fgDim.
- Item rows: gap 9, padding 5 8, radius 4, fontSize 12.5, color fg. Icon 13 fgMuted.
- The **Task state** row is the only Superkick-specific facet — bg `--sk-raised`,
  trailing **SK** tag (fontSize 9.5, padding 0 4, radius 3, border 1px
  `--sk-accentLine`, color accent, uppercase 0.3 letter-spacing, weight 600).
- Divider (1px border, margin 4 0)
- "Save current as view…" row, fgMuted, icon filter 13 fgDim.

**Facet list (mandatory ordering):**

```
Assignee · Creator · Priority · Status · Label · Project · Repo ·
Milestone · Cycle · Estimate · Created · Updated · Completed ·
Has sub-issues · Task state (SK)
```

**Don't** drop any of these from the dropdown UI even if the underlying data
isn't wired up. Show the item; on click, ask the orchestrator to wire the data.

---

## 11. Issue hover card

Source: `screens-v3/sk-v3-list.jsx` → `IssueHoverV3`. Artifact: A1 → `list-hover-*`.

### 11.1 Geometry

```
width: 480 (fixed)
border-radius: 10
border: 1px --sk-border
bg: --sk-overlay
shadow: 0 24px 56px rgba(0,0,0,.55)
overflow: hidden
```

Trigger: **350ms** hover delay on a list row (or kanban card). Position: the
card floats so its top-left aligns roughly to the row's title column — see
the artboard for exact offset (`top: 32, left: 130` relative to the
group-bound container).

### 11.2 Vertical structure (5 sections, all 14px padding-x)

1. **Header row** — padding `12px 14px 6px`, gap 8.
   - Priority icon 13
   - Status icon 13
   - ID mono 11.5 fgDim
   - flex spacer
   - "updated 3h ago" 11 fgDim

2. **Title** — padding `0 14px 10px`. Font-size 14, weight 500, color fg,
   line-height 1.35.

3. **Body excerpt** — padding `0 14px 12px`. Font-size 12.5, fgMuted,
   line-height 1.55. **Max 3 lines** — implementation should clamp to 3 with
   `-webkit-line-clamp: 3`.

4. **Labels + project row** — padding `0 14px 12px`, gap 5, flex-wrap wrap.
   Labels chips + `<ProjectTag>` inline.

5. **Meta strip** — padding `10px 14px`, font-size 11.5, fgMuted,
   border-top 1px border. Gap 12. Contains:
   - `Assigned to <Avatar 14> <Name>` (user icon 11 fgDim prefix)
   - `<SubCountChip>`
   - `<EstimateChip>`

6. **Last comment** — padding `10px 14px`, gap 9, border-top 1px border,
   bg `--sk-surface` (steps down one elevation from overlay).
   - Avatar 20 with bot/person color
   - col gap 2: meta line (12.5px name + " · last comment · 12m ago") + 2-line
     clamp body (12px fgMuted line-height 1.45).

7. **Linked run footer** (only if a run is active) — padding `9px 14px`,
   gap 7, justify space-between, border-top 1px border, bg `--sk-void`.
   - Left: `<Dot tone="info" pulse size=6>` + mono run id + " · phase · elapsed"
   - Right: ghost `<Btn size=sm icon=external>Open</Btn>`

### 11.3 States

- Default — as above
- No assignee — replace avatar+name with `Unassigned` in fgDim
- No linked run — omit section 7 entirely (don't render a placeholder)
- No comments — section 6 collapses to a "No comments yet · Be the first."
  line at 12px fgMuted, single row, padding 10 14
- Loading (rare — only when the card opens before data) — show 3 skeleton bars
  in title/body/meta positions

❌ **Don't** put primary action buttons in the hover card. The footer is
   read-only except for "Open".
❌ **Don't** delay the close. The card disappears on pointer-leave with no debounce.

---

## 12. Kanban card + column

Source: `screens-v3/sk-v3-kanban.jsx`.

### 12.1 Card

```
height ~70 (content-driven, no min/max forced)
bg --sk-surface / border 1px --sk-border / radius 7
padding 8px 10px
shadow (rest): 0 1px 0 rgba(0,0,0,.03)
shadow (drag): 0 14px 30px rgba(0,0,0,.5)
border (drag): 1px --sk-accent
transform (drag): rotate(-1.2deg)
cursor: grab
```

Three rows inside (gap 6 / 7):

1. **Meta row** — gap 7, margin-bottom 6.
   - PriorityIcon 11
   - ID mono 10.5 fgDim
   - Estimate chip (compact): font-size 10, padding 0 4, radius 3, border 1px
     border, color fgMuted, line-height 13. Omit if no estimate.
   - flex spacer
   - `<TaskDot size=7>`

2. **Title** — fontSize 12.5, color fg, line-height 1.3, single-line ellipsis,
   weight 400, margin-bottom 7.

3. **Footer** — gap 5.
   - Up to **1** Label chip (kanban shows fewer labels than list rows)
   - flex spacer
   - Sub-count text mono 10.5 fgDim (e.g. `3/5`)
   - Avatar 16
   - Updated mono 10.5 fgDim

### 12.2 Ghost / drop target

When dragging over a column:

- Column bg → `--sk-accentSoft` (transition 120ms ease)
- Ghost card placeholder at insertion point: 70 height, radius 7,
  border 1px **dashed** `--sk-borderStrong`, bg `color-mix(in srgb, var(--sk-accent) 6%, transparent)`.

### 12.3 Column

```
width 268 / flex none / height 100% / border-right 1px --sk-border
```

Header:

```
padding 10px 12px 8px / gap 8 / flex none
StatusIcon 13 + label 12.5/600 + count mono 11 fgDim + spacer + plus 12 + more 13
pinned: same border-top warn-tinted as group header (§9)
```

Body:

```
gap 6 / padding 8px 10px 14px / overflow auto / flex 1
(class sk-scrollbox = hide scrollbars)
```

Columns mirror the list groups (`Needs you` pinned first, then `Backlog →
Todo → In Progress → In Review → Done`). Done column shows the first 2 cards
+ "Show all N →" link in fgDim 11.5 (link colored), padding 8 0, center.

**Artboard proof:** A1 → `kanban-dark` (normal), `kanban-drag` (mid-drag).

---

## 13. Issue Detail — body + rail

Source: `screens-v4/sk-v4-issue-detail.jsx` → `IssueDetailWithExec` (the current target — supersedes the older A1 `IssueDetailV3`). Artifact: **A3**.

### 13.1 Overall layout

```
Page > Topbar > row { flex 1, min-height 0, position relative }:
  ├─ Left:  flex 1, min-width 0, overflow auto, padding 20 28 32, gap 22
  └─ Right: width 308, flex none, border-left 1px, bg surface, padding 14 12, overflow auto
  (Run drawer overlays the entire row when open — see §18)
```

### 13.2 Topbar specifics for /issues/<id>

- Crumbs: `Issues › <project> › <Status label>`
- Title: issue title (h1, default page-title size)
- Sub: row gap 7 with `<ID mono 12 fgDim>` and a "Copy ID" affordance (gap 4,
  fgMuted 11.5, copy icon 11 fgDim).
- Right cluster:
  - ghost sm icon=star "Subscribe"
  - ghost sm icon=copy (icon-only)
  - ghost sm icon=more
  - vertical divider (1×18 border, margin 0 4)
  - **primary sm icon=zap "Launch new run"** (state=running/needs/idle) **OR** **secondary sm icon=loop "Re-launch"** (state=done)

### 13.3 Left column content order (top to bottom)

1. **Description** — fontSize 13.5, color fg, line-height 1.65, max-width 720.
   Inline `<span class="sk-mono">` for code, `<b>` for emphasis. Lists at
   margin-left 20.
2. **ExecutionLog** (see §17) — the inline section.
3. **Sub-issues card** (when sub-issues exist) — see §14.
4. **Activity header** — row gap 6, font-size 12.5 fgMuted:
   - `<Icon comment 13 fgDim>`, "Activity" (fg 500), mono " · N" count,
     flex spacer, "Newest first" cursor pointer + chevDown 10.
5. **Comments + Timeline events** — see §15 and §16. Interleaved.
6. **Composer** — see end of §15.

### 13.4 Right rail

The rail is **vertical property list, no card chrome**. Sections separated by
`PropDivider` lines.

```
Eyebrow:  padding 2 8 6 / fontSize 10.5 / weight 600 / uppercase / 0.8 letter
          color fgDim / "PROPERTIES"
PropRow:  grid 92px 1fr / gap 8 / padding 5 8 / radius 5 / min-height 28
          cursor pointer (rows are click-to-edit affordances)
PropDivider: height 1 / bg --sk-border / margin 8 0
```

**Required properties (this order — don't rearrange):**

```
PROPERTIES eyebrow
  Status     <StatusIcon 13> <text 12.5 fg>
  Priority   <PriorityIcon 13> <text 12.5 fg>
  Assignee   <Avatar 18> <name 12.5 fg>
  Labels     <Label> chips wrap + <plus 11 fgDim> to add
PropDivider
  Project    folder 11 fgMuted + name 12.5 fg
  Cycle      history 11 + cycle 12.5 + " · 4d left" fgDim 11
  Milestone  flag 11 + name 12.5
  Estimate   <EstimateChip n> + "points" 11.5 fgDim
  Due date   clock 11 + date 12.5
PropDivider
  Relations  col gap 4 — each row:
             - "Blocks <ID mono>"
             - <github icon 10> <mono PR> + " · " + title fgDim
PropDivider
  Footer block: padding 4 8, fontSize 11, fgDim, line-height 1.6
             "Created May 17 · by Léa M"
             "Updated 3h ago"
```

### 13.5 What's NOT in the right rail (anymore)

The earlier "Tasks tile" (`TaskLinkTile` from A1) is **deprecated** by A3.
ExecutionLog now lives inline above Activity instead. **Implementation should
remove the right-rail Tasks tile** — it's redundant and breaks the "Issue is
the anchor" foundation.

**Artboard proof:** A3 → `detail-running`, `detail-needs`, `detail-done`, `detail-idle`.

---

## 14. Sub-issues card

Source: `screens-v3/sk-v3-detail.jsx`. Artifact: A1, A3.

### 14.1 Outer

```
border 1px --sk-border / radius 8 / bg --sk-surface
margin-bottom 22 (between description and Activity, when present)
```

### 14.2 Header

```
padding 8 12 / gap 8 / border-bottom 1px border
- chevDown 11 fgDim
- "Sub-issues" 12.5/600 fg
- mono "3 / 5" 11 fgDim
- flex spacer
- progress bar: 80 wide × 5 tall, radius 3, bg --sk-border,
  filled portion --sk-success
- plus 12 fgDim
```

### 14.3 Sub-issue row

```
height 30 / padding 0 10 / border-bottom 1px border (omit on last) / cursor pointer
gap 9 / fontSize 12.5
columns:
  PriorityIcon 11 / StatusIcon 12 / mono ID width 60 fgDim 11 /
  title flex 1 fg ellipsis / Avatar 16 (or empty)
```

This is a **denser** variant of the list row — not the same component. Don't
reuse `IssueRowV3` here.

---

## 15. Comment card

Source: `screens-v3/sk-v3-detail.jsx` → `Comment`. Used in Activity feed and (in
slightly different paddings) in the hover card last-comment slot.

### 15.1 Geometry

```
outer wrapper: row, gap 10, align flex-start
  ├─ <Avatar size=26 (icon=bot for agents)>
  └─ card:
       bg --sk-surface / border 1px --sk-border / radius 8
       header row: padding 7 12 5, gap 7
         - Name 12.5 fg weight 500
         - (if agent) "agent" pill: fontSize 9.5, padding 0 5, radius 3,
                                    bg --sk-accentSoft, color --sk-accent,
                                    letter-spacing 0.3, uppercase, weight 600
         - " · 3h ago" 11 fgDim
         - flex spacer
         - <Icon more 13 fgDim>
       body: padding 0 12 10, fontSize 13, line-height 1.55, color fg
```

**Important:** The body has no leading padding-top — the header's bottom
padding (5) doubles as the top gutter. Don't add extra top padding to body.

### 15.2 Inline references inside comment body

- `<span class="sk-mono" style="color: fg">stripe-rust</span>` for code refs
- `<b>` for emphasis (use sparingly — it's color, not size)
- `<span class="sk-link">Sentry issue</span>` for links (color accent,
  no underline by default; underline on hover only)

### 15.3 Composer

```
border 1px --sk-border / radius 10 / bg --sk-surface
1. header row: padding 8 12 / gap 8 / border-bottom 1px
   - Avatar 20 of current user
   - "Leave a comment…" 12.5 fgMuted
2. textarea area: min-height 48-56 / padding 10 12 / fontSize 13 fgDim
   "Type your reply. Markdown supported." (placeholder)
3. footer row: padding 6 8 / gap 6 / border-top 1px
   - ghost sm icons: link, doc, terminal (attach types)
   - flex spacer
   - <Kbd>⌘</Kbd><Kbd>↵</Kbd> 11 fgDim
   - primary sm "Comment"
```

---

## 16. Activity timeline event (issue page)

**Two `TimelineEvent` components exist. Don't confuse them.**

- **Issue-page `TimelineEvent`** (this section) — from `sk-v3-detail.jsx`. Lives
  inline in the Activity feed between Comment cards. Renders a circular
  icon-frame avatar (not the bot-on-disc kind).
- **Run-page `TimelineEvent`** (§17, §18, §19) — from `sk-task-shared.jsx`. Lives
  in execution log and run inspector. Renders a small bordered dot with a
  vertical connector line.

The issue-page event:

```
row, gap 10, padding-left 2
  ├─ circle 26×26 / radius 999 / bg --sk-surface / border 1px border /
  │   centered icon size 12, color from `color` prop or fgDim
  └─ content (fontSize 12.5 fgMuted line-height 1.55 padding-top 4):
       <name 12.5 fg weight 500> {agent-pill?} {verb text}
       trailing " · 3h ago" fgDim 11

inline pill: "agent" same as comment card §15.1
inline status: <Inline> 12 / padding 0 5 / radius 4 / bg raised /
               color fg / border 1px border — used for "from Todo to In Progress"
```

Event verbs in scope:

- `linked PR <mono #1483> — <link title>`
- `changed status from <Inline>X</Inline> to <Inline>Y</Inline>`
- `launched <mono run-9c1f> · <link>open run →</link>`
- `(agent) posted on completion: <link>PR #1483 merged</link>`

**Do not** invent new verbs. If a feed needs a new event type, add it here first.

---

## 17. Execution log (inline on issue)

**The crown jewel of A3.** Source: `screens-v4/sk-v4-exec-log.jsx`. Artifact:
A3 → `detail-running`, `detail-needs`, `detail-done`, `detail-idle`.

This is the section that replaces the old Task page on the issue surface. Every
piece a follower needs ("where is the agent, what did it do, does it need me")
is here. Anything deeper opens the **Run Drawer** (§18).

### 17.1 Outer geometry

```
border-radius 10 / border 1px --sk-border / bg --sk-surface / overflow hidden
```

### 17.2 Header

```
row gap 9 / padding 12 16 / border-bottom 1px border / bg --sk-void
- Icon zap 14 accent
- "Execution" 13/600 fg
- State chip:
    row, gap 6, padding 0 7, height 19, radius 4,
    bg var(--sk-{tone}Soft), color var(--sk-{tone}), 11/500
    <Dot tone size=6 pulse={state !== 'done'}> + state label
    labels: "running" | "paused · needs you" | "shipped"
- flex spacer
- Agent meta: <Avatar 14 #3a6f4e icon=bot> "fix-bot" 11.5 fg/500
              " · sonnet-4.5" 11.5 fgDim
- " · 2m 14s elapsed" 11 fgDim
- vertical divider 1×14 border, margin 0 2
- <Btn ghost sm icon=external>Open run</Btn>  → opens the drawer
```

### 17.3 NeedsBanner (state === 'needs' only)

```
padding 10 14
bg: color-mix(in srgb, var(--sk-warn) 10%, var(--sk-surface))
border-bottom 1px color-mix(in srgb, var(--sk-warn) 30%, var(--sk-border))

row 1: gap 10, margin-bottom 6
  - Icon alert 13 warn
  - "Needs you" 12.5/600 warn
  - " · {summary}" 12 fgMuted (e.g. "Rule trip: //security constant modified…")

row 2: gap 6
  - primary sm icon=check "Approve"
  - secondary sm icon=x "Reject"
  - ghost sm icon=comment "Comment"
  - flex spacer
  - "Decision logs to the run." 11 fgDim
```

**Important: decisions happen here, NOT in the drawer.** The drawer is for
debugging; the issue page is for deciding. If the implementation puts an
"Approve" button in the drawer, that's a P0 architecture bug.

### 17.4 Phases (PhaseStrip)

```
padding 14 16 / row gap 0 align center

For each phase (Plan, Implement, Review):
  disc 18×18 round, border 1.5px:
    - done:    border + bg color (success at 20% mix), check icon 10
    - active:  border + bg color (info at 22% mix), 6px solid dot,
               + pulsing 3px ring (sk-pulse animation)
    - paused:  border + bg (warn 22%), pause icon 8
    - failed:  border + bg (danger 20%), x icon 9
    - pending: border borderStrong, transparent bg, mono index "1" / "2" / "3" 9.5
  label 12, weight 500 (600 if active/paused)
  meta " · 4 of 7" 11 fgDim

Between phases:
  connector flex 1 min-width 24 height 1.5 margin 0 12 align-self center
  - if next is pending: solid --sk-border
  - else: linear-gradient(to right, currentTone, nextTone), opacity 0.7
```

### 17.5 Recent activity (ExecSection)

```
ExecSection wrapper (used for all sub-sections below phases):
  padding 12 16 / gap 10 / border-top 1px border
  title row gap 6:
    - chevDown 11 fgDim (defaultOpen) / chev 11 (collapsed)
    - title 10.5/600 uppercase 0.9 fgDim ("RECENT ACTIVITY")
    - " · 11 events" 11 fgDim
    - flex spacer
    - action slot (e.g. ghost sm iconRight=arrowRight "All in drawer")

Body — col gap 8.

Each ExecRow:
  row gap 9 / align center / min-height 24
  - dot 14 round, border 1.5px palette.c, bg transparent (or 22% mix if active)
    icon 7, stroke 2, color palette.c
    if active: + 3px outer ring sk-pulse
  - title flex 1 12.5, ellipsis, fontWeight 400 (500 if active)
    color: fgMuted off / fg active
  - badge slot (Pill)
  - meta mono 11 fgDim min-width 50 right
```

Palette per kind:

| kind     | color           | icon     |
|----------|-----------------|----------|
| `plan`   | fgMuted         | layers   |
| `search` | fgDim           | search   |
| `tool`   | info            | terminal |
| `edit`   | accent          | doc      |
| `test`   | success         | check    |
| `pr`     | success         | pr       |
| `ask`    | warn            | comment  |
| `stuck`  | warn            | alert    |
| `note`   | fgDim           | clock    |
| `done`   | success         | check    |

**Number of rows shown inline: 3–5.** Click "All in drawer" → opens drawer.

### 17.6 Files changed (ExecSection)

```
title "FILES CHANGED" · " · 2 files"
action: ghost sm icon=external "Diff" (opens drawer Files tab)

Body — col gap 7. Each ExecFileRow:
  row gap 8 / fontSize 11.5
  - doc icon 11 fgDim
  - mono path 11, ellipsis, color fg (accent if active edit)
  - mini stacked bar: width 56, height 4, radius 999
    [adds %|dels %] — success then danger
  - "+11" mono 10.5 success min-width 22 right
  - "−3"  mono 10.5 danger  min-width 22 right
```

### 17.7 Worktree · how to test (ExecSection)

`title "WORKTREE · HOW TO TEST"` + `<WorktreeMini>`:

```
col gap 6:
  chip row, gap 14, wrap, fontSize 11.5:
    - branch icon 11 fgDim + mono branch name fg
    - layers icon 11 fgDim + mono sandbox + " · running" fgDim (sandbox state)
    - folder icon 11 fgDim + mono path fgMuted
    - pr icon 11 fgDim + mono "#1483" fg + " · merged" success (or " · draft" fgDim)
  action row, gap 6:
    - ghost sm icon=terminal "Open shell"
    - ghost sm icon=copy "Copy clone command"
    - ghost sm icon=external "Open in editor"
```

### 17.8 Past runs (ExecSection)

```
title "PAST RUNS" · meta count
defaultOpen: false
Body (when expanded) — list of PastRunRow:
  padding 7 4 / fontSize 12.5 / border-bottom 1px border (omit on last) / cursor pointer
  - <TaskDot state=run.state size=7>
  - mono id 11.5 fg
  - Avatar 16 (icon=bot)
  - label fgMuted ellipsis flex 1
  - mono when 11 fgDim
  - arrowRight 11 fgDim
  click → opens drawer scoped to that run
```

### 17.9 Idle state

When no execution has been launched on this issue:

```
border 1px border / radius 10 / bg --sk-surface / padding 16 18
row gap 9:
  - zap icon 13 fgDim
  - "No execution yet on this issue." 12.5 fgMuted
  - flex spacer
  - primary sm icon=zap "Launch task"
```

That's the whole component when idle. No empty PhaseStrip, no empty rows.

### 17.10 Do / Don't

✅ **Do** treat ExecutionLog as a single owned section in the page composition.
   Inline it once, between Description and Activity.
✅ **Do** persist defaultOpen per section across renders.
✅ **Do** make "Open run" deep-link to `?run=9c1f` so it survives reload.

❌ **Don't** put a chat composer inside ExecutionLog. There is no chat with the
   agent on the issue page — only Approve / Reject / Comment via NeedsBanner,
   and human comments via the Activity composer below.
❌ **Don't** repeat the agent's name/avatar in every recent-activity row. The
   header already says "fix-bot".
❌ **Don't** show a "stop run" button here. That lives in the drawer header
   or the deep-link Run Inspector.

---

## 18. Run drawer

Source: `screens-v4/sk-v4-run-drawer.jsx`. Artifact: A3 → `detail-drawer-*` artboards.

The drawer is **the engineer-grade view** of a single run. It opens over the
Issue Detail page (not as its own URL stack). It is sharable via `?run=<id>`.

### 18.1 Outer

```
backdrop:
  position absolute / inset 0 / z-index 7
  bg rgba(0,0,0,.40) / backdrop-filter blur(1px)

panel:
  position absolute / top 0 right 0 bottom 0 / width 640 / z-index 8
  bg --sk-surface
  border-left 1px --sk-border
  shadow: -12px 0 40px rgba(0,0,0,.45)   (asymmetric to the left)
```

### 18.2 Header

```
row gap 10 / padding 14 16 / border-bottom 1px border / bg --sk-void / flex none

- mono pill "run-9c1f": padding 2 7 / radius 4 / bg raised / border 1px border / fontSize 11 / fg
- State chip (same as ExecutionLog state chip — §17.2)
- " · for <mono ISS-216>" 12 fgMuted
- flex spacer
- ghost sm icon=loop "Re-run"
- ghost sm icon=download "Bundle"
- vertical divider 1×16 border margin 0 2
- close: 28×28 / radius 5 / fgMuted / icon x 14
```

### 18.3 Context strip

```
row padding 10 16 / gap 16 / flex-wrap wrap / border-bottom 1px / flex none

Each DKV cell:
  col gap 1
  - label 10/600/uppercase 0.7 fgDim
  - value row gap 4:
    - icon 11 fgDim
    - 12 fg, mono if mono flag

Required cells in order:
  Agent · Model · Sandbox (mono) · Branch (mono) · Cost (mono)
```

### 18.4 Tabs

```
row padding 0 16 / height 38 / border-bottom 1px / gap 0 / flex none

DrawerTab:
  row gap 6 / padding 0 12 / height 36 / margin-bottom -1
  border-bottom 2px transparent (active: 2px var(--sk-fg))
  font-size 12.5 / fontWeight 500 (active) / 400 (rest)
  color: fg (active) / fgMuted (rest)
  count badge mono 10.5: padding 0 4 / radius 3 / bg raised / fgDim /
              line-height 15 / min-width 14 / center
  optional trailing badge (e.g. <Dot tone=success size=6> on Terminal tab)
```

Tab set, in order: **Activity · Tool calls · Files · Logs · Terminal**. After
flex spacer: **Raw** (tertiary, no count).

### 18.5 Activity tab content

```
Filters strip: padding 8 16 / gap 10 / border-bottom 1px / bg --sk-void

DrawerFilters (pill row, gap 5):
  Each item: padding 0 8 / height 22 / radius 4 / fontSize 11.5
  on:  bg --sk-raised / border 1px border / color fg
  off: transparent / no border / color fgMuted
  trailing mono count 10.5 fgDim
  Items: All · Tools · Edits · Tests · Flags

Search affordance (right side of filters strip):
  gap 6 / padding 0 8 / height 22 / radius 4 / bg raised / border 1px /
  fontSize 11.5 fgMuted / icon search 11

Body: padding 16 16 20 — DrawerEvent rows.

DrawerEvent (note: different from ExecRow — has body slot AND a connector line):
  row gap 11 / align flex-start
  ├─ col align center width 18:
  │    dot 18×18 / border 1.5 palette.c / bg --sk-surface (or 22% mix if active)
  │    icon 9 palette.c stroke 2
  │    + 4px outer ring sk-pulse when active
  │    connector below: width 1.5 / bg border / min-height 14 (omit on last)
  └─ content col flex 1 padding-bottom 14 (0 on last) gap (6 if body, else 0):
       row gap 8: title 12.5 fg/500 (or fgMuted/400 if not active),
                  badge slot, flex spacer, mono meta 11 fgDim
       body slot (e.g. CodeBlock)
```

### 18.6 Tool calls tab

```
ToolCallRow per call (border-bottom 1px between rows):
  row padding 8 16 / gap 10 / min-height 32 / cursor pointer
  (expanded row gets bg --sk-raised)

  - chev/chevDown 11 fgDim
  - mono index 10.5 fgDim min-width 24 ("01")
  - tool badge: padding 1 6 / radius 3 / bg raised / border 1px /
                 fontSize 10.5 / mono / weight 500 / color fg
  - summary mono flex 1 12 fgMuted ellipsis
  - status dot 6: success | danger
  - mono duration 11 fgDim min-width 44 right
  - copy icon button: 22×22 / radius 4 / fgDim / icon copy 11

Expanded body container:
  padding 6 16 14 56 (left aligns under summary)
  bg --sk-raised
  contains a <CodeBlock> with the tool output
```

### 18.7 Files tab

```
padding 16 / col gap 12
list of <FileChangeRow> (the run-page variant, taller than ExecFileRow):
  col gap 5 / padding 7 0
  row 1: gap 8
    - doc icon 12 fgDim
    - mono path 11.5 fg ellipsis (accent if active)
    - mono +adds success 11
    - mono −dels danger 11
  row 2: stacked bar height 3 radius 999 bg raised
         success% green / rest danger

Below the list: diff preview panel
  padding 12 / radius 8 / bg --sk-void / border 1px border
  - row gap 6 marginBottom 6:
    "DIFF PREVIEW · intent.go · L142" 11/600/uppercase 0.8 fgDim
    flex spacer + ghost sm icon=copy + ghost sm icon=external "Open in editor"
  - <CodeBlock lang="go" compact>
```

### 18.8 Logs tab

```
row padding 0 16 8: "raw stdout/stderr · 4.2 KB" 11 fgDim, spacer,
                    ghost sm icon=copy, ghost sm icon=download "Download"
pre:
  margin 0 / padding 12 16 / font mono 11.5 / color --sk-codeFg /
  line-height 1.55 / bg --sk-code /
  border-top + border-bottom 1px / white-space pre-wrap
```

### 18.9 Terminal tab

```
context row: padding 8 16 / gap 8 / border-bottom 1px / fontSize 12 fgMuted
  - mono "ephemeral-2:~/sk/run-9c1f"
  - <Dot tone=success> "shell idle"
  - flex spacer
  - ghost sm icon=copy

pre output:
  margin 0 / padding 14 16 / mono 11.5 / codeFg / line-height 1.6 /
  bg --sk-code / flex 1 / overflow auto

input row: padding 8 16 / border-top 1px / fontSize 12 fgDim
  - mono "$"
  - "Type a command — runs in the sandbox" / flex 1
  - <Kbd>↵</Kbd>
```

### 18.10 Do / Don't

❌ **Don't** put an Approve/Reject pair in the drawer. Decisions on the issue
   page only (NeedsBanner, §17.3).
❌ **Don't** make the drawer a separate URL stack. It opens with `?run=<id>` on
   the issue URL; closing returns to `/issues/<id>`.
❌ **Don't** add tabs beyond the six listed (Activity, Tool calls, Files, Logs,
   Terminal, Raw). Adding a "Metrics" or "Settings" tab is a P1 drift.
❌ **Don't** make the drawer wider than 640. It's tuned to leave the right rail
   peeking on a 1280-wide canvas.

---

## 19. Task Cockpit + Now panel

Source: `screens-rework/sk-task-cockpit*.jsx`. Artifact: A2.

**Scope note.** The Task Cockpit is **not on the user's primary path** in the
issue-centered model. It exists as a deep-link debug surface at
`/tasks/<id>?debug=task`. Implementation should still match it for parity, but
do not surface it in nav.

### 19.1 Geometry

```
Page > Topbar > PhaseTracker (full width) > optional NeedsBanner > 2-col body:
  ├─ Left: flex 1, min-width 0 (body tabs + timeline)
  └─ Right: <TCNowPanel>, width 360, border-left 1px, bg surface, scrollable
```

### 19.2 PhaseTracker (taller variant)

```
row padding 14 24 / border-bottom 1px / bg --sk-surface / flex none gap 0

Each phase node:
  row gap 10:
    disc 22×22, radius 999, border 1.5px palette.c:
      done:    + bg color(20% mix), check 11 strokeWidth 2.5
      active:  + bg color(22% mix), 7×7 inner dot, + pulsing 4px ring
      paused:  + bg(22% mix), pause icon 9
      failed:  + bg(20% mix), x icon 10 strokeWidth 2.5
      pending: bg transparent, border borderStrong, mono index 10/600 fgDim
    col gap 1:
      title 13, weight 500/600 (600 if active/paused), color fg (or fgMuted if pending)
      meta 11.5 fgDim

Between phases:
  connector flex 1 height 1.5 margin 0 18, gradient as in §17.4
```

(The compact `PhaseStrip` used inside ExecutionLog (§17.4) is the same shape
with 18px discs / 14 padding-y / shorter labels. **Don't mix the two.**
PhaseTracker is for full-width pages; PhaseStrip is for cards.)

### 19.3 Body tabs (cockpit-only)

```
row padding 0 22 / border-bottom 1px / gap 22 / bg --sk-void / flex none

Each tab:
  padding 11 0 / fontSize 12.5 / weight 600 (active) / 500 (rest)
  color fg active / fgMuted off
  border-bottom 2px transparent / 2px --sk-accent if active
  margin-bottom -1
  trailing count mono 10.5 fgDim

Tabs: Activity (n=11) · Files changed (n=2) · Tool calls (n=14) · Raw logs
right cluster: ghost sm icon=terminal "Terminal"
```

Note: this is **deeper than the drawer's tab bar** because the Cockpit is a
full page. Don't shrink it.

### 19.4 Timeline (TCTimeline + PhaseGroup)

```
sk-scrollbox padding 18 22 22

PhaseGroup (collapsible per-phase wrapper):
  outer col margin-bottom 14
  header row gap 10 / padding 8 10 / radius 7 / margin-left -6
         bg --sk-raised when active, transparent otherwise / margin-bottom 4
    - chevDown 12 fgDim (rotate -90 when collapsed)
    - label 10.5/600 uppercase 0.9 (color = palette of status)
    - " · {summary}" 11 fgDim
  body padding-left 8: <TimelineEvent> rows

TimelineEvent (run-page variant, in sk-task-shared.jsx):
  row gap 12 / align flex-start
  ├─ col width 18 align center:
  │    dot 18 round / border 1.5 palette.c /
  │    bg --sk-void (or 22% mix active)
  │    icon 9 palette.c
  │    + pulsing 4px ring if active
  │    connector below: flex 1 width 1.5 bg border min-height 18 (omit on last)
  └─ col flex 1 padding-bottom 16 (0 on last) gap (6 if body else 0):
       row gap 8:
         title 12.5 fg/500 (or fgMuted/400)
         badge slot
         flex spacer
         meta mono 11 fgDim
       body slot
```

### 19.5 Now panel

```
col / width 360 / flex none / border-left 1px / bg --sk-surface / overflow auto

Top "Now" headline section:
  padding 16 16 14 / border-bottom 1px
  row gap 6 marginBottom 8:
    eyebrow "NOW" 10.5/600 uppercase 0.9 fgDim
    flex spacer
    State Pill (running/paused/shipped) with pulsing dot
  headline 14/500 fg lineHeight 1.45
  sub 11.5 fgDim (when running): "≈30s remaining · step 5 of 5 in Implement"

Then NPSection blocks (repeating):
  col gap 8 / padding 14 16 / border-bottom 1px
  row gap 6 (header):
    title 10.5/600 uppercase 0.9 fgDim
    flex spacer
    optional action (ghost sm)
  body: <KV> rows or content

KV row:
  row gap 8 / fontSize 12.5
  - optional icon 12 fgDim
  - label fgDim minWidth 64
  - mono value 12 fg flex 1 ellipsis
  - optional trailing action
```

Required NPSections (cockpit order):

```
Run         → KV id / agent / model / cost (icon zap, action ghost "Run detail")
Worktree    → KV sandbox / branch / path / PR (icon-actions where applicable)
How to test → <CodeBlock compact> + "Or: make test-webhook · 3,419 / 3,419 last run"
Files changed · N → ExecFileRow-equivalent list + action "Diff"
Intervene  → 3 full-width buttons:
              needs-state:  primary "Approve, open PR"
                            secondary "Suggest a different approach"
                            danger    "Block this change"
              running:      "Pause run", ghost "Send a nudge…", ghost "Open terminal"
              done:         "Run on another branch", ghost "View PR on GitHub"
```

### 19.6 Status banner (cockpit)

When `state === 'needs'`:

```
padding 10 22 / bg --sk-warnSoft / border-bottom 1px --sk-warn / flex none
row gap 10:
  Icon alert 15 warn
  "Paused at step 4/5 · security-tagged constant changed" 12.5/600 warn
  " · decide in the Now panel →" 12 fgMuted
  flex spacer
  ghost sm icon=external "Why this rule?"
```

---

## 20. Run Inspector

Source: `screens-rework/sk-run-simplified.jsx`. Artifact: A2.

This is the deep-link page at `/runs/<id>`. Reached from the drawer's "Open full
page" affordance and from `⌘K → Recent runs`. Most users never see it.

### 20.1 Geometry

```
Page > Topbar > context strip > optional status banner > 2-col body > footer

Context strip: row padding 12 22 / gap 24 / flex-wrap / border-bottom / bg surface
  CSCell repeated (col gap 2):
    label 10.5/600 uppercase 0.8 fgDim
    value row gap 5: icon 11 fgDim + 12 fg (mono if mono)
  Required cells: Agent · Model · Sandbox · Branch · Worktree · Started · Cost

Banner (success or warn): padding 10 22 / bg --sk-{tone}Soft / border-bottom 1px tone
Body: row flex 1
  ├─ Activity column (flex 1, border-right 1px):
  │    activity header: padding 10 22 / gap 8 / bg --sk-void / border-bottom 1px
  │      "ACTIVITY" eyebrow + count mono + flex spacer + filter Pills + filter button
  │    timeline: sk-scrollbox padding 16 22 22 — same TimelineEvent as cockpit (§19.4)
  └─ Right rail (width 340, flex none, bg surface, scrollable):
       repeated NPSection blocks:
         Tool calls · N      → ToolStat rows (icon + label + count + ms)
         Files changed · N   → FileChangeRow list + "Diff" action
         Reproduce / test    → CodeBlock + "Run in sandbox" / "Open shell" buttons
         Worktree            → KV rows + Open in editor / Bundle

Footer (escape-hatch terminal):
  row padding 8 22 / gap 12 / border-top 1px / bg surface / fontSize 12
  - terminal icon 13 fgDim
  - "$ ephemeral-2:~/sk/run-7af2-1" mono fgDim
  - <Dot tone=success>
  - "shell idle · last cmd 38s ago" fgMuted
  - flex spacer
  - ghost sm icon=chev "Expand terminal"
```

### 20.2 Differences from the Drawer

| Concern              | Drawer (§18, 640w)              | Run Inspector (full page)         |
|----------------------|---------------------------------|-----------------------------------|
| Width                | 640 fixed                        | Whatever the page gets, 2-col     |
| Header               | run-id pill + state + close      | Topbar with crumbs                |
| Context              | strip with 5 DKV cells           | strip with 7 CSCell cells         |
| Tabs                 | 6 in-place tabs                  | None — content laid out 2-col     |
| Activity body width  | ~640                             | flex 1 (~700–900)                 |
| Right-rail tools     | none (tabs cover it)             | summarized via ToolStat rows      |
| Terminal             | full tab                         | collapsed strip at bottom         |

Per the navigation memo, the Run Inspector should not be the default
destination. The drawer is. If we ever drop one, drop the Inspector.

---

## 21. States — empty, loading, error

### 21.1 Empty list

Artifact: A1 → `empty-dark`.

```
col flex 1 / align center / justify center / gap 14
- 56×56 / radius 999 / bg --sk-raised / centered icon check 24 --sk-success
- 15/500 fg "Nothing assigned to you."
- 13 fgMuted / max-width 380 / center / line-height 1.5:
  "You're clear. Browse <link>All open</link> to grab something,
   or <link>create an issue</link>."
- row gap 8 marginTop 4:
  secondary sm icon=layers "Switch to All open"
  primary   sm icon=plus   "New issue"
```

### 21.2 Loading list

Artifact: A1 → `loading-dark`.

Skeleton rows that mirror the **exact 36px row geometry** column-by-column.
Use `<Sk w h r delay>` shimmering rectangles in each cell. Required widths
match §8.2.

Animation: `sk-shimmer 1.6s ease-in-out infinite`, background gradient from
`--sk-raised` → mix(borderStrong 60%, raised) → `--sk-raised`, with
`background-size: 200% 100%`. Stagger via `animation-delay: delay * 0.08s + offset`.

**Don't** replace skeleton with a single spinner. Skeleton row count: 3 per group.

### 21.3 No execution (idle ExecutionLog)

See §17.9.

### 21.4 Error states

**Not explicitly designed** in this round. When an error happens (PR push
failure, sandbox crash, etc.) it surfaces as a TimelineEvent with `kind=stuck`
+ a `<Pill tone=danger>` badge in the ExecutionLog and drawer. Do not invent
red toast notifications or page-level error banners.

---

## 22. Motion + interaction

Two keyframes only — both in `sk-tokens.jsx`:

```css
@keyframes sk-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}

@keyframes sk-shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
```

Where each is used:

| Animation   | Element                                                  |
|-------------|----------------------------------------------------------|
| `sk-pulse`  | Active phase disc, TaskDot in `needs`/`running`, status `<Dot pulse>`, Pill `<dot pulse>` |
| `sk-shimmer`| Skeleton rectangles in the loading list                  |

Other motion notes:

- **Hover preview delay**: 350ms (before opening hover card).
- **Drop-target tint transition** (kanban column): `background 120ms ease`.
- **Drawer open/close**: slide from right, 240ms ease-out. No fade on backdrop
  beyond a fast fade-in (~120ms).
- **Tab switches**: instant. **Don't** animate tab indicator with a sliding
  underline — it pops to the active tab.

No spring physics, no parallax, no scroll-driven effects.

---

## Reading checklist before opening a PR

1. ☐ I read every section of this spec, not just my component.
2. ☐ I opened the artifact artboard cited in the section heading.
3. ☐ Every measurement in my component is sourced from this spec OR the source JSX.
4. ☐ My component does not introduce new tokens, sizes, or colors.
5. ☐ I checked PARITY_CHECKLIST.md for known drift in this surface — my PR
       either fixes one or doesn't regress any.
6. ☐ I attached the artboard reference (e.g. `A3 / detail-running`) to the PR.
7. ☐ If something is unclear in the spec, I asked, not guessed.
