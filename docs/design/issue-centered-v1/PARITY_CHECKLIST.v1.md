# Parity checklist — Issue-centered v1

A prioritized punch list. Read top-to-bottom; fix in priority order. Each item
is phrased as "the current implementation is doing X / not doing Y" so it's
trivial to verify against a running build.

The checklist below is a **visual / component contract**. Data gaps (a field
not wired up, an API not returning the right shape) are kept separate at the
end — they're not in scope for the design parity sweep.

Each item carries:

- **Surface** — which screen / component it appears on
- **Symptom** — what the implementation does today (likely / suspected)
- **Expected** — what the spec says
- **Spec §** — section reference in `SPEC.md`
- **Artboard** — which artboard proves the expected behavior

Items are numbered so we can reference them in PRs and tickets
(`fix(parity): P0-04 — list row hover background`).

---

## P0 · breaks the design language

These are the bugs that make the implementation feel like a different product
than what was approved. They violate one of the five Foundations (SPEC §0) or
a load-bearing geometry rule. Fix these before anything else.

### P0-01 · Sidebar still surfaces Tasks and Runs

- **Surface:** App shell sidebar
- **Symptom:** Sidebar shows `Tasks` and `Runs` as primary nav entries.
- **Expected:** Both removed. `/tasks/<id>` reachable only via `?debug=task`;
  `/runs/<id>` only via the drawer's "Open full page" and `⌘K → Recent runs`.
- **Spec §:** §0 (Foundation 5), §7.1
- **Artboard:** A3 / `nav-memo` (proposed sidebar sketch)

### P0-02 · Issue row height is not 36px

- **Surface:** `/issues` list, all variants
- **Symptom:** Rows are 32px (too dense) or 40+ (too tall, sometimes from
  label wrap).
- **Expected:** Exactly 36px, single line, ellipsis on title.
- **Spec §:** §8.1
- **Artboard:** A1 / `list-default-dark`

### P0-03 · Issue row column order or widths are wrong

- **Surface:** `/issues` list rows
- **Symptom:** Columns reordered (e.g. assignee before labels), or labels
  cell is `flex: 1` instead of title.
- **Expected:** Fixed widths per §8.2; only title flexes.
- **Spec §:** §8.2
- **Artboard:** A1 / `list-default-dark`

### P0-04 · Row hover uses accent or overlay color

- **Surface:** `/issues` list rows
- **Symptom:** Row hover background is tinted accent, or an overlay color.
- **Expected:** `--sk-raised` (#1c2026). Applied via global
  `.sk-row-v3:hover` rule, not JS state.
- **Spec §:** §8.3, §3
- **Artboard:** A1 / `list-hover-dark`

### P0-05 · TaskDot rendered as text badge or omitted

- **Surface:** `/issues` list rows and kanban cards
- **Symptom:** "needs you" rendered as text, or the dot is missing entirely
  on rows with no active run.
- **Expected:** 8px dot (7 on kanban). Hidden = invisible spacer of the
  same width so column alignment doesn't shift. Tooltip only — never text.
- **Spec §:** §6.7, §8.2
- **Artboard:** A1 / `list-default-dark`, `kanban-dark`

### P0-06 · Group headers not sticky, or wrong "Needs you" treatment

- **Surface:** `/issues` list
- **Symptom:** Group headers scroll away with content, or "Needs you" pinned
  band looks identical to other group headers.
- **Expected:** `position: sticky; top: 0; z-index: 2`. "Needs you" band has
  warn-tinted bg and top border + a `pinned` mini tag.
- **Spec §:** §9
- **Artboard:** A1 / `list-default-dark`

### P0-07 · Issue Detail right rail still contains a Tasks tile

- **Surface:** `/issues/<id>`
- **Symptom:** Right rail includes a "Tasks · N" tile that lists runs and a
  "Launch task" button.
- **Expected:** Remove the tile. ExecutionLog (§17) lives inline on the left
  column instead, with a header "Launch new run" button in the topbar right
  cluster. The right rail is properties-only.
- **Spec §:** §13.5
- **Artboard:** A3 / `detail-running` (no Tasks tile)

### P0-08 · ExecutionLog missing or replaced by a Task Cockpit embed

- **Surface:** `/issues/<id>` left column
- **Symptom:** The current implementation either has no inline execution
  section, or it embeds the full Task Cockpit shape (with its tab bar, body
  tabs, Now panel) into the issue page.
- **Expected:** The dedicated `ExecutionLog` section (§17). It is NOT the
  Cockpit. It is its own component, with the compact `PhaseStrip` (18px discs).
- **Spec §:** §17, §19
- **Artboard:** A3 / `detail-running`

### P0-09 · Needs-human Approve / Reject is in the drawer, not the issue

- **Surface:** `/issues/<id>` when run state = `needs`
- **Symptom:** The Approve / Reject controls are shown on the run page or
  inside the drawer.
- **Expected:** Approve / Reject / Comment live in the `NeedsBanner` at the
  top of ExecutionLog (§17.3). The drawer is read-only for decisions.
- **Spec §:** §0 (Foundation 5), §17.3, §18.10
- **Artboard:** A3 / `detail-needs`

### P0-10 · Issue Detail body has a chat composer with the agent

- **Surface:** `/issues/<id>` body
- **Symptom:** A "talk to the agent" textarea is rendered alongside or instead
  of the Comment composer.
- **Expected:** Only the human-comment composer exists on the issue page. The
  agent does not have a chat surface — interventions are Approve / Reject /
  Comment in the NeedsBanner. See §17.10.
- **Spec §:** §17.10
- **Artboard:** A3 / `detail-running`

### P0-11 · Linear status / priority glyphs replaced with library icons

- **Surface:** All `/issues` and `/issues/<id>` surfaces
- **Symptom:** Heroicons / Lucide / Phosphor icons used in place of the
  Linear-style status disc or priority bar-stack.
- **Expected:** The exact `<StatusIcon>` and `<PriorityIcon>` glyphs from
  `screens-v2/sk-icons.jsx`. Seven status kinds, five priority kinds.
- **Spec §:** §5.2, §5.3
- **Artboard:** A1 / any list artboard

### P0-12 · Accent color used as a row / list background

- **Surface:** `/issues` list and detail
- **Symptom:** Selected row uses solid accent fill, or a "highlighted"
  background uses accent at full opacity.
- **Expected:** Selected row uses `--sk-accentSoft` + inset 2px accent left
  rail. Hover never uses accent.
- **Spec §:** §0 (Foundation 3), §2.3, §8.3
- **Artboard:** A1 / `list-hover-dark`

---

## P1 · high-impact visual mismatches

Each P1 alone doesn't break the language, but the *combination* of any 3+
makes the implementation feel like a draft. Fix after P0 is clean.

### P1-01 · Sidebar item active rail color or width wrong

- **Surface:** Sidebar
- **Symptom:** Active item underline / border uses fg or is wider than 2px.
- **Expected:** 2px wide accent rail, positioned at `left: -10, top: 6, bottom: 6, radius: 2`.
- **Spec §:** §7.1

### P1-02 · ViewTabs underline color uses accent

- **Surface:** ViewTabs on /issues
- **Symptom:** Active tab underline is `--sk-accent`.
- **Expected:** Underline is `--sk-fg`.
- **Spec §:** §10.1

### P1-03 · Filter "+ Filter" button uses a solid border

- **Surface:** Filter bar
- **Symptom:** Solid 1px border around the button.
- **Expected:** **Dashed** 1px border, `--sk-border`.
- **Spec §:** §10.2

### P1-04 · Filter chip "is / is not" operator missing or styled like a value

- **Surface:** Filter bar
- **Symptom:** Chips read `Status: Done · Canceled` without the operator, or
  the operator is in the value color.
- **Expected:** Three-part chip: `key fgMuted`, `op fgDim`, `value fg / weight 500`.
- **Spec §:** §10.2

### P1-05 · Filter dropdown missing the SK tag on "Task state"

- **Surface:** Filter dropdown
- **Symptom:** Task state facet looks identical to the other facets, OR is
  missing entirely.
- **Expected:** Highlighted row (bg raised) with a trailing **SK** tag (accent
  border + accent text).
- **Spec §:** §10.3

### P1-06 · Hover card width or delay wrong

- **Surface:** Issue list / kanban hover
- **Symptom:** Card is 360 or 520 wide; or opens immediately on hover.
- **Expected:** **480 wide**, **350ms** delay.
- **Spec §:** §11

### P1-07 · Hover card last-comment section uses overlay bg

- **Surface:** Issue hover card
- **Symptom:** The last-comment block has the same bg as the rest of the card.
- **Expected:** Steps down to `--sk-surface`. The linked-run footer steps down
  again to `--sk-void`.
- **Spec §:** §11.2

### P1-08 · Kanban card height grows past ~80 because title wraps

- **Surface:** /issues kanban
- **Symptom:** Long-title cards are 96+ tall.
- **Expected:** Title is single-line ellipsis; card hovers around 70px.
- **Spec §:** §12.1

### P1-09 · Kanban drop target tint missing

- **Surface:** /issues kanban during drag
- **Symptom:** No visual feedback when dragging over a column.
- **Expected:** Column bg transitions to `--sk-accentSoft` (120ms ease) +
  ghost placeholder card with dashed borderStrong border.
- **Spec §:** §12.2

### P1-10 · Issue Detail rail width wrong

- **Surface:** /issues/<id>
- **Symptom:** Right rail is 280 / 320 / 360.
- **Expected:** **308**. Left border 1px.
- **Spec §:** §13.1

### P1-11 · Property rail rows missing the click-affordance radius

- **Surface:** /issues/<id> right rail
- **Symptom:** Property rows are flush with rail bg, no hit area.
- **Expected:** Each row has padding 5/8, radius 5, cursor pointer; rows
  invite click-to-edit.
- **Spec §:** §13.4

### P1-12 · Property rail uses card chrome around the whole list

- **Surface:** /issues/<id> right rail
- **Symptom:** Properties are wrapped in a bordered card.
- **Expected:** No outer card. Sections are separated by horizontal
  `PropDivider` lines only.
- **Spec §:** §13.4

### P1-13 · Sub-issues card progress bar missing

- **Surface:** /issues/<id> body
- **Symptom:** Sub-issues card has count but no mini progress bar.
- **Expected:** 80×5 bar in the header, fill = `--sk-success`.
- **Spec §:** §14.2

### P1-14 · Comment card has too much top padding

- **Surface:** /issues/<id> activity feed
- **Symptom:** Comment body has explicit top padding, creating extra space
  between the meta row and the body.
- **Expected:** Header bottom padding (5) doubles as the gap. Body
  `padding: 0 12 10`.
- **Spec §:** §15.1

### P1-15 · "agent" / "SK" provenance tag styled like a chip

- **Surface:** Various — comment cards, filter dropdown
- **Symptom:** Provenance tags rendered with regular case + heavier padding.
- **Expected:** 9.5/600 / uppercase / letter-spacing 0.3 / padding 0 5 /
  radius 3 / bg `accentSoft` / color accent.
- **Spec §:** §15, §10.3

### P1-16 · ExecutionLog header missing the state chip

- **Surface:** /issues/<id> ExecutionLog header
- **Symptom:** "Execution" label without the colored chip showing
  running/paused/shipped state.
- **Expected:** Inline chip with pulsing dot (when not done), state label,
  tone-tinted bg/color.
- **Spec §:** §17.2

### P1-17 · NeedsBanner uses full-tone warn background

- **Surface:** ExecutionLog needs state
- **Symptom:** Solid yellow background or full-opacity warn fill.
- **Expected:** Subtle color-mix: 10% warn over surface bg, 30% warn in border.
- **Spec §:** §17.3

### P1-18 · PhaseStrip uses the big PhaseTracker shape

- **Surface:** ExecutionLog
- **Symptom:** 22px discs, taller labels, the variant used in Task Cockpit.
- **Expected:** **Compact** variant: 18px discs, 12px labels, 12 padding-y.
- **Spec §:** §17.4, §19.2

### P1-19 · ExecRow timestamps not in mono font

- **Surface:** ExecutionLog recent activity
- **Symptom:** Timestamps render in DM Sans.
- **Expected:** JetBrains Mono, tabular-nums.
- **Spec §:** §17.5

### P1-20 · "Open run" button is primary or secondary

- **Surface:** ExecutionLog header + "All in drawer" links
- **Symptom:** Primary accent button or bordered secondary.
- **Expected:** Ghost button. The drawer is a navigation, not a commit.
- **Spec §:** §17.2, §17.5

### P1-21 · File-change diff bar uses one color

- **Surface:** ExecutionLog + Drawer Files
- **Symptom:** Single green or single grey progress bar.
- **Expected:** Stacked: success-tone for adds %, danger-tone for dels %.
- **Spec §:** §17.6, §18.7

### P1-22 · Drawer width ≠ 640

- **Surface:** Run drawer
- **Symptom:** Drawer is 480 / 560 / 720.
- **Expected:** **640** fixed.
- **Spec §:** §18.1

### P1-23 · Drawer is opened as a separate URL stack instead of `?run=`

- **Surface:** Run drawer
- **Symptom:** Clicking "Open run" navigates to `/runs/<id>` and replaces the
  issue page.
- **Expected:** Drawer overlays `/issues/<id>` with `?run=<id>` in the query
  string; close returns to the issue cleanly.
- **Spec §:** §18.10

### P1-24 · Drawer tab bar reordered or missing tabs

- **Surface:** Run drawer
- **Symptom:** Tabs in different order, or missing "Terminal" / "Raw".
- **Expected:** Exactly: Activity · Tool calls · Files · Logs · Terminal · (spacer) · Raw.
- **Spec §:** §18.4

### P1-25 · ToolCallRow index column not zero-padded

- **Surface:** Drawer Tool calls tab
- **Symptom:** "1", "2"… instead of "01", "02"…
- **Expected:** Zero-padded to 2 digits. Width 24.
- **Spec §:** §18.6

### P1-26 · Run Inspector includes a chat composer

- **Surface:** /runs/<id>
- **Symptom:** Bottom of the page is a chat textarea.
- **Expected:** Collapsed terminal strip escape-hatch (footer row, "Expand
  terminal" ghost link).
- **Spec §:** §20.1

### P1-27 · Empty state uses an illustration

- **Surface:** /issues empty
- **Symptom:** Custom SVG illustration or character art.
- **Expected:** Simple round badge (56×56 bg `--sk-raised` with a `check`
  glyph), heading, body, two buttons. No illustration.
- **Spec §:** §21.1

### P1-28 · Loading list uses a single spinner instead of skeleton rows

- **Surface:** /issues loading
- **Symptom:** Centered spinner replaces the list.
- **Expected:** Skeleton rows matching the 36px geometry, with shimmer
  animation staggered across columns.
- **Spec §:** §21.2

---

## P2 · polish

Below the visual-fidelity bar; these are last-mile. None of them block the
release of the issue-centered v1.

### P2-01 · Avatar colors generated from a hash function

- **Surface:** wherever avatars render
- **Symptom:** Two different users get visually similar colors.
- **Expected:** Hand-assigned per-agent / per-person palette (see §6.3).
  Implementation should treat the color as a server-driven property.

### P2-02 · Filter chips and DisplayChips don't share a 26px height baseline

- **Surface:** Filter bar
- **Symptom:** Heights between 24 and 28 px.
- **Expected:** All chips/buttons in the filter bar are exactly 26 tall.

### P2-03 · Kbd shortcuts not in mono / wrong height

- **Surface:** Composer footer, hover card, drawer terminal
- **Symptom:** Kbd elements render in DM Sans or are >18 tall.
- **Expected:** 18 tall, JetBrains Mono, raised bg with border.

### P2-04 · Sidebar workspace tile uses primary color from elsewhere

- **Surface:** Sidebar header
- **Symptom:** "S" tile uses a different color than `--sk-accent`.
- **Expected:** `--sk-accent` background, white "S".

### P2-05 · Hover card description not clamped

- **Surface:** Hover card
- **Symptom:** Long descriptions push the card past its anchor.
- **Expected:** `-webkit-line-clamp: 3` on body excerpt.

### P2-06 · No pulse on active phase / running TaskDot

- **Surface:** ExecutionLog, list rows, hover card linked-run footer
- **Symptom:** Active indicators are static.
- **Expected:** `sk-pulse 1.6s ease-in-out infinite` (opacity 1 → 0.45 → 1).
  Plus the 3–4px outer ring on phase discs and task dots.

### P2-07 · Underline on links shown by default

- **Surface:** Any text using `.sk-link`
- **Symptom:** Links underlined at rest.
- **Expected:** No underline at rest; underline on hover only. Color = accent.

### P2-08 · Code blocks lack the `lang` header

- **Surface:** Drawer Files tab diff preview, ExecutionLog code snippets
- **Symptom:** `<CodeBlock>` rendered without the small "verify.go · L41–47"
  eyebrow.
- **Expected:** When `lang` prop is set, show the 10.5px / 0.3-letter / mono
  header row above the pre.

### P2-09 · Sub-issue rows are 36px (same as list rows)

- **Surface:** Sub-issues card
- **Symptom:** Sub-issue rows reuse the list row height.
- **Expected:** **30px**, denser font (12.5).

### P2-10 · Drawer Terminal tab has no live cursor

- **Surface:** Drawer Terminal tab
- **Symptom:** Static text without a blinking cursor.
- **Expected:** Trailing `█` (or CSS-animated block) at the prompt — purely
  cosmetic but signals "live shell".

### P2-11 · Light theme is approximated

- **Surface:** Anywhere a light variant exists
- **Symptom:** Light surfaces use neutral greys.
- **Expected:** Warm paper aesthetic (`--sk-void: #ebe7df`,
  `--sk-raised: #f6f3ec`). When in doubt about a light translation, ask before
  shipping.

---

## Data gaps (not visual parity — separate fix track)

These are fields the artifacts assume exist but the orchestrator may not have
wired up yet. **Treat each as a separate ticket against the data layer**, not
against the visual implementation.

| #     | Field                                             | Where it's needed                              |
|-------|----------------------------------------------------|-------------------------------------------------|
| D-01  | `taskState` per issue (`needs / running / review / shipped / null`) | Issue row, kanban card, sidebar count for "Needs you" group |
| D-02  | `sub: { done, total }` per issue                  | Issue row sub-count, kanban footer              |
| D-03  | `estimate` per issue                              | Issue row + kanban card chips                   |
| D-04  | `lastComment: { author, age, body }` per issue    | Hover card section 6                            |
| D-05  | `linkedRun: { id, state, phase, elapsed }`        | Hover card footer; ExecutionLog header           |
| D-06  | Run `phases: [{ id, label, status, meta? }]`      | ExecutionLog PhaseStrip; Cockpit PhaseTracker    |
| D-07  | Run `recentActivity: [{ kind, title, meta, badge? }]` | ExecutionLog recent activity; drawer Activity tab |
| D-08  | Run `files: [{ path, adds, dels, active? }]`      | ExecutionLog files; drawer Files tab             |
| D-09  | Run `worktree: { branch, sandbox, sandboxState, path, prId?, prState? }` | ExecutionLog worktree section + drawer header |
| D-10  | Run `toolCalls: [{ idx, tool, summary, durationMs, ok, args, output }]` | Drawer Tool calls tab |
| D-11  | Run `pastRuns: [{ id, state, agent, label, when }]` per issue | ExecutionLog past runs section |
| D-12  | `cycle`, `cycleDaysLeft`, `milestone`, `dueDate` per issue | Issue Detail right rail |
| D-13  | Run `cost` running total, `costCap`               | Now panel KV; drawer context strip               |
| D-14  | `needsHumanReason` (rule name + summary) per paused run | ExecutionLog NeedsBanner                        |

**Rule of thumb:** if you're tempted to render `—` or `Unknown` for any of the
above, that means D-* is open. File it; do not paper over.

---

## How to use this checklist

1. **Sweep P0 in one PR per item.** No "fix three P0s in one PR" — they're
   each visible enough that a reviewer should be able to validate one against
   the artboard in 30 seconds.
2. **Bundle P1s by surface.** All filter-bar P1s in one PR, all ExecutionLog
   P1s in another. Reviewers compare against one artboard per PR.
3. **P2 only after P0 + P1 are clean.** Don't trade a P0 fix for a P2 fix —
   the build doesn't improve.
4. **When you fix an item, check the box here in your PR description.**
   ```
   parity: fixes P0-04 (row hover background)
   parity: fixes P1-08, P1-09 (kanban card height + drop tint)
   ```
5. **If you find drift not on this list, add a row.** This file is the
   running ledger.
