# Audit de parité design — Issue-centered v1 · passe 2026-05

> Audit multi-agent (11 surfaces) du code **actuel** contre `SPEC.md` + maquettes approuvées A1/A2/A3.
> L'ancienne `PARITY_CHECKLIST.md` était périmée (vérifiée avant les passes de parité récentes) — cet audit la remplace.
>
> **182 écarts** · 25 P0 · 67 P1 · 90 P2.

## Scoreboard

| Surface | Score |
|---|---|
| Run Drawer (640px slide-in) + tabs | **34** |
| Kanban card and column | **42** |
| Run Inspector + Task Cockpit (deep-link/debug surfaces) | **42** |
| Inline ExecutionLog + NeedsBanner + PhaseStrip + ExecSections (issue detail) | **48** |
| Issue hover card / preview (IssuePreview.tsx via HoverCard.tsx) | **58** |
| Comments + activity timeline + composer + sub-issues card (issue detail Activity feed) | **58** |
| Foundations: tokens, color, border, radius, spacing, type, icons, atoms | **62** |
| View tabs + filter bar + filter dropdown + view toggle (§10) | **62** |
| App shell — sidebar + topbar + run dock | **62** |
| Issue list row + group header | **71** |
| Issue Detail — layout, topbar, body, right rail | **72** |

---


## Foundations: tokens, color, border, radius, spacing, type, icons, atoms — 62/100

**Résumé.** The atom layer (Btn, Avatar, Kbd, StatusIcon shapes, the issues-side LabelChip, TaskDot, ProjectTag/EstimateChip/SubCount) is largely faithful to the artboard JSX I decompressed from the bundle — sizes, paddings and radii on Btn/Kbd/Avatar match to the pixel. But the foundation is fractured by a dual-token problem: the spec/artboard palette lives in tokens.css as `--color-*` (correctly valued), yet index.css still defines and the page root still consumes a parallel deprecated "Graphite" palette (`--color-void #0b0c0e`, `--color-fog`, mineral/oxide/gold/cyan/violet, edge…). The page body therefore renders on the wrong void (#0b0c0e vs spec #0b0d0f) with the wrong ink, and the shared Pill atom + dozens of badges are wired to the Graphite tones, not the semantic tokens. Typography is off at the root: JetBrains Mono is declared in `--font-mono` but never loaded (only DM Mono is imported), and `.font-data` hard-codes DM Mono — so the entire mono/numeric layer renders in the wrong typeface. PriorityIcon bars use fg-dim instead of fg/borderStrong, the `review` StatusIcon is the wrong color (warn) and wrong glyph (pie wedge, no check), the canonical `sk-pulse`/`sk-shimmer` keyframes don't exist (only a 2s `live-pulse`), and the Avatar primitive can't carry a per-agent hue. Biggest gap: kill the Graphite palette and route every atom/root through the tokens.css values, then fix the mono font load and the icon/priority colors.

**Critiques UX :**

- The codebase is mid-migration between two complete design systems and it shows: tokens.css (correct issue-centered palette) and the index.css 'Graphite' @theme (void/carbon/graphite/slate-deep/panel/edge, fog/silver/ash/dim, mineral/oxide/gold/cyan/violet) coexist. ~40 components and the shared Pill/Badge still consume Graphite. Until the Graphite @theme block and the shadcn :root block are deleted, every 'fix' risks being overwritten by a stale token. Recommend a single ticket to delete the Graphite palette and run a codemod mapping edge→border, graphite→surface, slate-deep→raised, panel→overlay, fog→fg, silver→fg-muted, ash/dim→fg-dim, mineral→success, oxide→danger, gold→warn, cyan→info, violet→accent.
- The 'void' naming collision (tokens.css --color-canvas #0b0d0f vs index.css --color-void #0b0c0e) is a foot-gun that will keep producing 1-shade-off backgrounds. Pick --color-void as the canonical name and value #0b0d0f, then forbid the other. The whole 4-tier elevation contract depends on the floor being exactly right.
- The StatusIcon and PriorityIcon are drawn at viewBox 16 with r=6.25 while the artboard uses viewBox 14 with r=5.6 — geometrically equivalent so not a bug, but it means the glyphs were re-authored rather than ported. The review-glyph and priority-bar color drift suggest the re-author didn't cross-check against the artboard colors. A quick side-by-side render of all 7 status + 5 priority glyphs against detail-* artboards would catch the rest.
- Pill size xs at h-5 (20px) vs the artboard 18px is a small but pervasive density tell — pills sit one row taller than Linear, which subtly breaks the 18px rhythm shared with Kbd and Label. Aligning Pill/TaskBadge/Label/Kbd all to 18px is worth doing in one pass.
- Per-agent avatar colors being unsupported is the kind of gap that quietly degrades scannability: every bot becomes a same-colored disc, defeating the spec's explicit anti-hash stance. Even before real agents are wired, AgentCard/Comment avatars should pull from the fixed six-color table so the visual language is correct from day one.
- live-pulse (2s) vs sk-pulse (1.6s) is barely perceptible alone, but because the spec ties one keyframe to many elements (phase discs, TaskDot, Dot, Pill dot), having two competing pulse rates means motion won't feel unified across the surface. Define sk-pulse once and route everything through it.

**Écarts (16) :**

#### `FND-01` · P0 · color — Page root renders on the deprecated Graphite void/ink, not the spec tokens

- **Spec :** §2.1 (--sk-void #0b0d0f, --sk-fg #e7e9ec) / §3 elevation
- **Loc :** `ui/src/index.css:60-62 (body), :16 (--color-void #0b0c0e), :21 (--color-fog #e8e6e1)`
- **Actuel :** body sets background-color: var(--color-void) which index.css defines as #0b0c0e (Graphite), and color: var(--color-fog) = #e8e6e1. The correct void #0b0d0f lives under a different name (--color-canvas) in tokens.css and is not what the root uses.
- **Attendu :** The void floor is #0b0d0f and primary ink is #e7e9ec (artboard SK.dark.void / SK.dark.fg). The 4-tier elevation starts from this exact void.
- **Fix :** Point the body at the token values: background-color: var(--color-canvas) (or rename the token to --color-void with #0b0d0f) and color: var(--color-fg). Remove the duplicate --color-void:#0b0c0e and --color-fog from the deprecated @theme block in index.css.
- _confiance : high_

#### `FND-02` · P1 · architecture — Void token is named --color-canvas, breaking the spec's --sk-void mapping

- **Spec :** §2.1 (--sk-void), §3 (4-tier: void→surface→raised→overlay)
- **Loc :** `ui/src/styles/tokens.css:2 (--color-canvas: #0b0d0f)`
- **Actuel :** The first elevation tier is exported as --color-canvas. The Tailwind utility is bg-canvas. Meanwhile index.css redefines --color-void to a DIFFERENT value (#0b0c0e), so any code reaching for 'void' gets the wrong color, and StatusIcon/PriorityIcon glyphs reference var(--color-canvas) for their cut-out strokes (StatusIcon.tsx:120, PriorityIcon.tsx:63).
- **Attendu :** Spec calls this tier --sk-void. Having two clashing 'void' identifiers (#0b0d0f as canvas, #0b0c0e as void) is the root cause of FND-01.
- **Fix :** Rename --color-canvas → --color-void in tokens.css and update the bg-canvas usages, OR delete the conflicting index.css --color-void. One name, one value (#0b0d0f) for the first tier.
- _confiance : high_

#### `FND-03` · P1 · typography — JetBrains Mono is never loaded; mono/numeric content falls back to DM Mono

- **Spec :** §1 Mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace…
- **Loc :** `ui/src/index.css:1 (font import), :66 (.font-data DM Mono), ui/src/styles/tokens.css:28 (--font-mono)`
- **Actuel :** The Google Fonts @import loads only DM Sans + DM Mono. --font-mono lists 'JetBrains Mono','IBM Plex Mono','DM Mono'… but JetBrains/IBM Plex are not fetched, so font-mono (79 uses) falls back to DM Mono. .font-data (339 uses) hard-codes 'DM Mono','SF Mono','Fira Code'. The spec's mono typeface never renders.
- **Attendu :** All numeric/ID/mono content renders in JetBrains Mono (with tnum/ss01), per §1. The artboard SK.fontMono = '"JetBrains Mono","IBM Plex Mono",ui-monospace,Menlo,monospace'.
- **Fix :** Add JetBrains Mono to the font import (e.g. family=JetBrains+Mono:wght@400;500), drop 'DM Mono' from --font-mono, and make .font-data resolve to var(--font-mono) instead of its own DM Mono stack so there is one mono source.
- _confiance : high_

#### `FND-04` · P0 · color — Shared Pill atom is wired to the deprecated Graphite palette and wrong geometry

- **Spec :** §6.1 Pill / §2.3 semantic anti-patterns / artboard Pill (radius 999, fs 11.5, pad 2/8)
- **Loc :** `ui/src/components/ui/pill.tsx:11-29`
- **Actuel :** Pill tone variants include neutral=border-edge bg-slate-deep/60 text-silver, plus mineral/oxide/gold/cyan/violet/live mapped to Graphite colors. Size xs = h-5 (20px), rounded (4px), gap-1, px-1.5, text-[10px].
- **Attendu :** Artboard Pill: padding 2px 8px, radius 999, fontSize 11.5, weight 500, gap 6; tones map 1:1 to semantic tokens (neutral bg transparent + 1px --sk-border + fgMuted; accent/success/warn/danger/info use {tone}Soft bg + {tone} fg + transparent border). No mineral/oxide/gold/cyan/violet/silver. (Spec §6.1 text says h18/r4/fs11; artboard JSX — the priority-1 ground truth — says r999/fs11.5/pad 2-8.)
- **Fix :** Replace the Graphite tone rows with the six semantic tones from tokens (neutral→border-border bg-transparent text-fg-muted; accent→bg-accent-soft text-accent border-transparent; etc.). Set xs to h-[18px] px-2 py-[1px] rounded-full text-[11.5px] gap-1.5. Remove mineral/oxide/gold/cyan/violet tones and migrate their callers to semantic tones.
- _confiance : high_

#### `FND-05` · P1 · iconography — PriorityIcon filled bars use fg-dim instead of fg; empty bars use dim-25% instead of borderStrong

- **Spec :** §5.3 (high/medium/low = bars filled with --sk-fg) / artboard PriorityIcon (on=--sk-fg, off=--sk-borderStrong)
- **Loc :** `ui/src/ui/PriorityIcon.tsx:13-19 (TONE_CLASS), :67-90 (bar shapes)`
- **Actuel :** TONE_CLASS sets none/low/medium/high all to text-fg-dim, so filled bars render in #6b727b. Empty bars use currentColor at fillOpacity 0.25 (≈ fg-dim 25%).
- **Attendu :** Filled bars = --sk-fg (#e7e9ec, bright). Empty bars = --sk-borderStrong (#323843). Per artboard: fill={on ? 'var(--sk-fg)' : 'var(--sk-borderStrong)'}.
- **Fix :** Render filled bars with fill=var(--color-fg) and empty bars with fill=var(--color-border-strong) (don't drive both from the icon's text color). Keep urgent at text-danger.
- _confiance : high_

#### `FND-06` · P1 · iconography — StatusIcon 'review' is wrong color (warn) and wrong glyph (pie wedge, no check)

- **Spec :** §5.2 (review = tinted fill 0.18 + check glyph inside, color --sk-accent)
- **Loc :** `ui/src/ui/StatusIcon.tsx:42-44 (TONE_CLASS review:'text-warn'), :103-112 (review shape)`
- **Actuel :** review maps to text-warn, and the shape draws a stroked circle plus a 3/4-disc pie wedge (M8 1.75 A… L8 8 Z) — no check, solid fill.
- **Attendu :** review = color --sk-accent; glyph = circle filled at fillOpacity 0.18 + stroked circle + a check path inside (artboard: <circle …{filled} fillOpacity="0.18"/><circle …stroke/><path d="M4.4 7.3 L6.2 9 L9.6 5.4" check/>).
- **Fix :** Set TONE_CLASS.review to 'text-accent' and replace the wedge with: a currentColor circle at fillOpacity 0.18, a stroked circle, and a check path. Mirrors the done glyph minus the solid fill.
- _confiance : high_

#### `FND-07` · P2 · iconography — StatusIcon 'needs' wedge fills the full right half instead of the top→bottom-right wedge

- **Spec :** §5.2 (needs = top-half filled, Superkick-specific) / artboard needs path
- **Loc :** `ui/src/ui/StatusIcon.tsx:96-102`
- **Actuel :** needs path is M8 8 V 1.75 A 6.25 6.25 0 0 1 8 14.25 Z — a clean right-half fill (top point to bottom point).
- **Attendu :** Artboard needs path is M7 7 L7 1.4 A5.6 5.6 0 0 1 11.4 11.4 L7 7 Z — top → bottom-right wedge (≈ 135° sweep), distinct from the progress quadrant. Spec prose says 'top-half'.
- **Fix :** Match the artboard arc endpoint: top (8,1.75) → bottom-right (≈13,13) so the sweep covers the upper-right region rather than the exact right half. Verify against detail-needs artboard.
- _confiance : medium_

#### `FND-08` · P1 · color — Avatar primitive has no per-agent color prop — fixed agent hues cannot render

- **Spec :** §6.3 (per-agent fixed colors; "Do not pull a color from a hash function")
- **Loc :** `ui/src/ui/Avatar.tsx:8-23,36 (tone-only), ui/src/components/agents/AgentCard.tsx:49`
- **Actuel :** Avatar accepts only tone (mapped to bg-raised/accent/success/warn/danger/info). AgentCard renders <Avatar tone={tone} icon="bot"> so fix-bot/review-bot/senior-bot all collapse onto generic semantic backgrounds. No mechanism for fix-bot #3a6f4e, review-bot #5b6ef2, senior-bot #a87a1f, Léa M #6f5ad9, C. Park #b06a3a, Owen #357a8a.
- **Attendu :** Artboard Avatar takes a color prop (background: color || raised). Per-agent/person hues are a fixed lookup, not tone-derived and not hashed.
- **Fix :** Add a color?: string prop to Avatar that sets background via style (overriding TONE_BG). Add an agent→hex lookup helper in lib/ with the six fixed colors and use it for bot/person avatars instead of tone.
- _confiance : high_

#### `FND-09` · P2 · motion — TaskDot uses live-pulse and has no outer ring — diverges from artboard (sk-pulse + 3px ring)

- **Spec :** §6.7 / §22 (TaskDot needs+running: sk-pulse 1.6s + 3px outer ring at 18% color-mix)
- **Loc :** `ui/src/components/issues/TaskDot.tsx:23-37 (default size 6, live-pulse, no ring)`
- **Actuel :** TaskDot defaults to size 6, applies live-pulse (2s, opacity→0.4) on running only, and renders no outer ring. needs does not pulse at all.
- **Attendu :** Artboard TaskDot: default size 8 on rows; needs AND running get boxShadow 0 0 0 3px color-mix(--sk-{tone} 18%, transparent) + animation sk-pulse 1.6s. review/shipped: no pulse, no ring.
- **Fix :** Default size to 8; add the 3px ring (ring-[3px] with /18 tone) and sk-pulse animation for both needs and running. Define a sk-pulse keyframe (1.6s, opacity 1→0.45→1).
- _confiance : high_

#### `FND-10` · P2 · motion — Canonical sk-pulse / sk-shimmer keyframes are missing; only a 2s live-pulse exists

- **Spec :** §22 (sk-pulse: 1.6s, opacity 1→0.45→1; sk-shimmer for skeletons)
- **Loc :** `ui/src/index.css:105-116 (live-pulse 2s, opacity→0.4)`
- **Actuel :** Only @keyframes live-pulse exists (2s, opacity floor 0.4). No sk-pulse, no sk-shimmer. TaskBadge/TaskDot/Dot reuse live-pulse; skeletons use Tailwind animate-pulse (IssueRowSkeleton.tsx:64).
- **Attendu :** sk-pulse = 1.6s ease-in-out, opacity 1→0.45→1 (active phase disc, TaskDot needs/running, Dot pulse, Pill dot pulse). sk-shimmer for loading-list skeletons with the 200% gradient sweep.
- **Fix :** Add @keyframes sk-pulse and sk-shimmer to tokens/index.css with the spec timings, and replace live-pulse usages in the foundation atoms (Dot, TaskBadge, TaskDot) with sk-pulse.
- _confiance : high_

#### `FND-11` · P2 · motion — Dot pulse renders a static ring but no animation

- **Spec :** §6.6 (Dot optional pulse via sk-pulse) / §22
- **Loc :** `ui/src/ui/Dot.tsx:42-46`
- **Actuel :** When pulse is true, Dot adds ring-4 + tone ring at /25 but applies no keyframe animation — the ring is static.
- **Attendu :** Artboard Dot pulse = a 4px outer ring; spec §22 lists Dot pulse under sk-pulse, so the dot/ring should breathe at 1.6s.
- **Fix :** Add the sk-pulse animation class alongside the ring when pulse is true (and use ring at /25 ≈ the artboard's .25 alpha — that part matches).
- _confiance : medium_

#### `FND-12` · P2 · typography — LabelChip uses mono font, 6px dot, symmetric padding — drifts from artboard Label

- **Spec :** §6.2 (UI font, dot 7×7, padding 1px 7px 1px 6px, gap 5) / artboard Label
- **Loc :** `ui/src/components/issue-detail/LabelChip.tsx:9-14`
- **Actuel :** Uses font-data (DM Mono), dot size-1.5 (6px), gap-1.5 (6px), px-1.5 (symmetric 6/6). Height (h-4.5=18), radius-full, border-border, text-[11px], text-fg-muted all correct.
- **Attendu :** Label text is the UI font (not mono); prefix dot is 7×7; gap 5; padding is asymmetric 1px 7px 1px 6px (slightly more right than left).
- **Fix :** Drop font-data; set dot to size-[7px]; gap-[5px]; padding pt-px pb-px pl-1.5 pr-[7px] (or px split). Keep h-[18px] rounded-full border-border text-[11px] text-fg-muted.
- _confiance : high_

#### `FND-13` · P2 · border — Unassigned/empty avatar uses border-border, not the spec's dashed borderStrong

- **Spec :** §6.3 (empty/unassigned: 20px disc, dashed --sk-borderStrong border, no fill)
- **Loc :** `ui/src/components/issues/AssigneeAvatar.tsx:21-29`
- **Actuel :** Unassigned disc uses border-dashed border-border bg-transparent.
- **Attendu :** Dashed border in --sk-borderStrong (#323843), the emphasized line reserved for placeholders/scaffold (§3, §4.2).
- **Fix :** Change border-border → border-border-strong on the unassigned branch.
- _confiance : high_

#### `FND-14` · P2 · interaction — Hover-card open delay is 400ms and close is debounced 150ms (spec: 350ms open, no close delay)

- **Spec :** §11 / §22 (350ms hover open; "card disappears on pointer-leave with no debounce")
- **Loc :** `ui/src/components/issues/HoverCard.tsx:5-6,18`
- **Actuel :** OPEN_DELAY 400, CLOSE_DELAY 150 are passed to the popover.
- **Attendu :** Open delay 350ms; close with no debounce (immediate on pointer-leave).
- **Fix :** Set openDelay default to 350 and closeDelay to 0.
- _confiance : medium_

#### `FND-15` · P2 · color — PRIORITY_META hard-codes off-palette hexes outside the token file

- **Spec :** §2 ("Do not hard-code hex anywhere outside the token file")
- **Loc :** `ui/src/lib/domain/priorityMeta.ts:3-13`
- **Actuel :** color values #6b7280 (none/low), #ef4444 (urgent), #f97316 (high), #3b82f6 (medium) — Tailwind default hues, none of which are Superkick tokens. priorityColor() also defaults to #6b7280.
- **Attendu :** No raw hex outside tokens.css. Priority color comes from the glyph itself (urgent=--sk-danger, others fg/borderStrong bars). Any color string used should reference a token, not a Tailwind default.
- **Fix :** Drop the color field (the PriorityIcon now owns color), or replace with token-referencing values. If a color is genuinely needed, derive from var(--color-danger)/var(--color-fg)/var(--color-border-strong).
- _confiance : medium_

#### `FND-16` · P2 · typography — No tabular-nums utility; spec mandates tabular numbers on all counts/IDs/timestamps

- **Spec :** §1 ("Tabular numbers everywhere … .sk-num / font-variant-numeric: tabular-nums")
- **Loc :** `ui/src (0 matches for tabular-nums / font-variant-numeric / sk-num)`
- **Actuel :** There is no .sk-num equivalent and no tabular-nums applied. Numeric content relies on whatever the mono fallback (DM Mono) provides; non-mono UI counts are proportional.
- **Attendu :** An sk-num utility (font-variant-numeric: tabular-nums) applied to counts, timestamps, IDs, costs, estimates, diff stats so they never jitter horizontally.
- **Fix :** Add a .sk-num utility (or tabular-nums Tailwind class) and apply it to numeric cells (row IDs, updated, counts, estimate chips, diff stats). Pairs with FND-03's JetBrains Mono tnum/ss01.
- _confiance : medium_

## Issue list row + group header — 71/100

**Résumé.** The row's outer geometry is correct (36px height via h-9, asymmetric 20/24 padding via pl-5/pr-6, gap 10 via gap-2.5, 13px title single-line ellipsis), and the group header nails the pinned warn band, sticky positioning, StatusIcon glyph, 12.5/600 label, and mono count. But the column set is materially incomplete versus §8.2: the Sub-count (col 6, 42px) and Estimate (col 8, 22px) columns are entirely absent, and several columns have wrong widths/sizes (ID 60 vs 64 and 11px vs 11.5, Status icon 13 vs 14, Assignee 18 vs 20, Updated 40 vs 38, TaskDot cell 8 vs 10 and dot 6 vs 8). The biggest gaps are the selected state (§8.3 wants accent-soft fill + inset 2px accent rail; code renders bg-raised + 1px accent-soft ring) and a 36px-tall group header (should be 32px) — both foundational. Ground truth was reconstructed from the artboard's actual IssueRowV3/GroupHeaderV3 source decompressed out of the HTML bundle, which matches SPEC §8/§9 exactly.

**Critiques UX :**

- Fixed-width right-side columns are the whole point of the Linear-faithful grid: because Project, Sub-count, Estimate, Assignee, Updated and TaskDot are not pinned to fixed cells in the current row, the meta column visually jitters left/right from row to row depending on label count and project-name length. This is the single biggest 'feels off' issue beyond the missing columns — restoring the fixed cells (even as empty spacers) is what makes the list scan cleanly.
- The 'review' status is colored warn (gold) AND shaped like the 'needs' half-disc. On a list that has both an 'In Review' group and a pinned warn 'Needs you' band, this double-conflation (same hue + same shape family) actively undermines the at-a-glance status read the whole design is built around. Worth fixing the color to accent and the glyph to tinted-fill+check even though it partly lives outside this surface.
- Dimming Done-row titles to fgMuted is a reasonable instinct but it's not in the spec and duplicates info already carried by the done StatusIcon glyph; on the Recently-shipped tab where every row is done, the entire list reads greyed-out and low-contrast. I'd drop the title-dim and let the glyph do the work, matching the artboard.
- TaskDot is the one Superkick-specific glyph and it currently both under-pulses (needs doesn't animate) and lacks the soft outer ring, so the 'this needs you / this is live' signal is weaker than designed. Since it's the only proprietary affordance on the row, it should be the most faithfully rendered, not the least.
- The group header carries a Pinned tag but no trailing +/more affordances, while rows have a hover preview — the header feels comparatively inert. Even if the +/more actions aren't wired yet, rendering the glyphs (fgDim, low emphasis) would make the header read as an interactive section control rather than a static label, matching Linear's mental model.
- z-30 on the sticky group header vs the hover card's intended z-5: as written the header can paint over the 350ms hover preview when a row near a sticky boundary is hovered. Worth a quick manual check — stacking-context bugs here look like 'the preview is clipped by the header' and are easy to miss in static review.

**Écarts (23) :**

#### `ROW-01` · P0 · state — Selected state uses bg-raised + 1px ring instead of accent-soft fill + inset 2px accent rail

- **Spec :** §8.3 selected / artboard IssueRowV3 selected branch
- **Loc :** `ui/src/components/issues/IssueRow.tsx:38`
- **Actuel :** focused ? 'bg-raised ring-1 ring-accent-soft ring-inset' : null — a raised background with a 1px accent-soft (low-opacity) ring on all four sides.
- **Attendu :** Selected = background var(--sk-accentSoft) AND box-shadow: inset 2px 0 0 var(--sk-accent) (a 2px solid accent rail on the LEFT edge only). Artboard: background selected ? 'var(--sk-accentSoft)', boxShadow: selected ? 'inset 2px 0 0 var(--sk-accent)'.
- **Fix :** Replace the focused branch with `focused ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]' : null`. Hover stays bg-raised (already correct via hover:bg-raised). Do not use a ring; the rail is a left-edge inset box-shadow.
- _confiance : high_

#### `GRP-04` · P0 · geometry — Group header is 36px tall (h-9) instead of 32px

- **Spec :** §9 (height 32) / §0.1 (group headers are 32px — only legal list rhythm is 32/36) / artboard height:32
- **Loc :** `ui/src/components/issues/IssueGroupHeader.tsx:39`
- **Actuel :** className 'h-9' = 36px — the group header is the same height as a row.
- **Attendu :** 32px. Artboard GroupHeaderV3: height:32. §0.1 makes 32 vs 36 a foundational non-negotiable; a 36px header breaks the Linear density rhythm.
- **Fix :** Replace `h-9` with `h-8` (32px) on the group header button.
- _confiance : high_

#### `ROW-02` · P1 · layout — Sub-count column (col 6, 42px) is entirely missing

- **Spec :** §8.2 row #6 Sub-count / artboard SubCountChip + 42-wide cell
- **Loc :** `ui/src/components/issues/IssueRow.tsx:76-78`
- **Actuel :** No sub-count cell rendered. After the Labels block the code jumps straight to the Project tag — column #6 does not exist.
- **Attendu :** A 42px-wide, right-aligned cell holding <SubCountChip done total> (leaf glyph 11px + mono 'done/total' 11.5 fgMuted), or an empty 42px spacer when total is 0. Artboard: <div style={{width:42, justifyContent:'flex-end'}}><SubCountChip .../></div>.
- **Fix :** Add a `<div className="flex w-[42px] shrink-0 justify-end">` containing a SubCountChip (leaf SVG path 'M3 11 L3 4 L7 4 M3 7 L7 7 M7 4 L7 11 L11 11' stroke 1.3 + font-data text-[11.5px] text-fg-muted 'N/M'); empty 42px spacer when total is 0. Data gap only if sub-issue counts aren't wired — the spacer must still occupy 42px for alignment.
- _confiance : high_

#### `ROW-03` · P1 · layout — Estimate column (col 8, 22px) is entirely missing

- **Spec :** §8.2 row #8 Estimate / artboard EstimateChip + 22-wide cell
- **Loc :** `ui/src/components/issues/IssueRow.tsx:83-89`
- **Actuel :** No estimate cell rendered between Project and Assignee.
- **Attendu :** A 22px-wide cell holding <EstimateChip n> = 22×18, border 1px var(--sk-border), radius 4, mono 11px/500 fgMuted, centered; or an empty 22px spacer when no estimate. Artboard: <div style={{width:22}}><EstimateChip n={estimate}/></div>.
- **Fix :** Add `<div className="w-[22px] shrink-0">` with an EstimateChip (inline-flex h-[18px] w-[22px] items-center justify-center rounded border border-border font-data text-[11px] font-medium text-fg-muted). Empty 22px spacer when estimate is null. Data gap only if estimate isn't wired; spacer still required for alignment.
- _confiance : high_

#### `ROW-04` · P1 · iconography — Status icon rendered at 13px instead of 14px

- **Spec :** §8.2 row #2 (StatusIcon size=14) / §5.2 'status column 14px' / artboard StatusIcon size={14}
- **Loc :** `ui/src/components/issues/IssueRow.tsx:46`
- **Actuel :** <StatusIcon kind={statusIconKindFor(issue.status)} size={13} /> — 13px.
- **Attendu :** size={14}. The status column glyph is the only 14px icon on the row; the priority glyph is 13. Artboard: <StatusIcon kind={status} size={14}/>.
- **Fix :** Change `size={13}` to `size={14}` on the StatusIcon in IssueRow. (Priority stays 13.)
- _confiance : high_

#### `ROW-12` · P1 · motion — TaskDot 'needs' state does not pulse and no dot pulses with the 3px outer ring

- **Spec :** §6.7 (needs AND running pulse with 3px outer ring at 18% color-mix) / artboard TaskDot
- **Loc :** `ui/src/components/issues/TaskDot.tsx:23, 33`
- **Actuel :** Only kind==='running' gets the live-pulse class (line 33); 'needs' does not pulse. No state renders the 3px outer color-mix ring; live-pulse is a 2s opacity 1→0.4 cycle.
- **Attendu :** Both 'needs' and 'running' pulse, and the pulsing dot carries an outer ring: box-shadow 0 0 0 3px color-mix(in srgb, {tone} 18%, transparent); animation sk-pulse 1.6s (opacity 1→0.45→1). Artboard map: needs {pulse:true}, running {pulse:true}, review/shipped {pulse:false}.
- **Fix :** Pulse when kind==='needs' || kind==='running'. Add the 3px outer ring via inline box-shadow `0 0 0 3px color-mix(in srgb, var(--color-warn|info) 18%, transparent)` on the pulsing kinds. Align timing to 1.6s / opacity floor 0.45 (current live-pulse is 2s / 0.4).
- _confiance : high_

#### `ICON-01` · P1 · iconography — StatusIcon 'review' kind colored warn instead of accent

- **Spec :** §5.2 (review → color token --sk-accent, tinted fill + check glyph) / artboard StatusIcon review
- **Loc :** `ui/src/ui/StatusIcon.tsx:42, 103-112`
- **Actuel :** TONE_CLASS.review = 'text-warn' (#d4a04a) and the review shape is a half-filled disc (same family as needs) with no check glyph or 0.18-opacity tinted fill.
- **Attendu :** review color = var(--sk-accent) (#5b6ef2); glyph = circle with tinted fill at 0.18 opacity and a check inside. This icon shows in the 'In Review' group rows, so the row surface is affected. Coloring review warn makes it visually collide with the warn 'needs' state.
- **Fix :** Set TONE_CLASS.review to 'text-accent'. Ideally also rework the review shape to tinted-fill + check per §5.2 (currently a half-disc, conflating it with needs).
- _confiance : high_

#### `ROW-05` · P2 · geometry — Identifier cell is 60px wide (w-15) instead of 64px

- **Spec :** §8.2 row #3 (width 64) / artboard width:64
- **Loc :** `ui/src/components/issues/IssueRow.tsx:49`
- **Actuel :** className 'w-15' → Tailwind v4 spacing = 15 × 0.25rem = 3.75rem = 60px.
- **Attendu :** 64px fixed width. Artboard: width:64.
- **Fix :** Replace `w-15` with `w-16` (64px) on the identifier span. (SubIssueRow.tsx:27 uses w-15 too but that is the §14 60px-ID sub-issue variant and is correct there — do not change it.)
- _confiance : high_

#### `ROW-06` · P2 · typography — Identifier + Project font-size is 11px instead of 11.5px

- **Spec :** §8.2 (ID mono 11.5; Project name 11.5) / §1 t-11_5 / artboard fontSize:11.5
- **Loc :** `ui/src/components/issues/IssueRow.tsx:49, 79`
- **Actuel :** ID span text-[11px] (line 49) and Project tag text-[11px] (line 79).
- **Attendu :** Both 11.5px (t-11_5). Artboard ID and ProjectTag: fontSize:11.5. 11px (t-11) is reserved for pills/labels/count badges.
- **Fix :** Change `text-[11px]` to `text-[11.5px]` on the identifier span (49) and the project tag (79). The '+N' overflow at line 69 correctly stays 11px (count badge).
- _confiance : high_

#### `ROW-07` · P2 · color — Project name uses fgDim; folder glyph not distinguished from name color

- **Spec :** §8.2 row #7 / §5.1 (folder glyph fgDim, recedes) / artboard ProjectTag
- **Loc :** `ui/src/components/issues/IssueRow.tsx:78-83`
- **Actuel :** Whole project tag is text-fg-dim, so both the folder icon and the project name render at fgDim (#6b727b).
- **Attendu :** Project NAME = var(--sk-fgMuted) (#9aa0a8); folder glyph = var(--sk-fgDim) (#6b727b, recedes). Artboard ProjectTag: wrapper color var(--sk-fgMuted), Icon folder color=var(--sk-fgDim).
- **Fix :** Set the wrapper to text-fg-muted and give the folder Icon an explicit fgDim color (e.g. className="text-fg-dim"), so the name is fgMuted and the glyph fgDim.
- _confiance : high_

#### `ROW-08` · P2 · layout — Project has no fixed 140px cell — width is content-driven

- **Spec :** §8.2 row #7 (Project width 140, ellipsis at 140) / artboard 140-wide cell
- **Loc :** `ui/src/components/issues/IssueRow.tsx:78-83`
- **Actuel :** Project rendered as an inline `shrink-0` span with truncate but no fixed width; sizes to content, so right-edge meta columns shift horizontally per row.
- **Attendu :** A fixed 140px cell with the ProjectTag ellipsing at 140. Artboard: <div style={{width:140, justifyContent:'flex-start'}}><ProjectTag/></div>; ProjectTag maxWidth:140. Fixed widths keep right-side meta columns vertically aligned across rows.
- **Fix :** Wrap the project in `<div className="flex w-[140px] shrink-0 justify-start">` and let the inner tag truncate at max-w-[140px]. Render the empty (no-project) cell as the same 140px spacer so alignment holds.
- _confiance : high_

#### `ROW-09` · P2 · geometry — Assignee avatar rendered at 18px instead of 20px, with no fixed 22px cell

- **Spec :** §8.2 row #9 (Assignee 22 cell, 20px avatar / dashed empty disc) / artboard Avatar size 20 in 22-wide cell
- **Loc :** `ui/src/components/issues/IssueRow.tsx:85-89`
- **Actuel :** <AssigneeAvatar size={18}> rendered inline with no 22px center cell wrapper.
- **Attendu :** 20px avatar (or 20px dashed-border empty disc) centered in a 22px-wide cell. Artboard: <div style={{width:22, justifyContent:'center'}}>Avatar size 20 / 20px dashed disc</div>.
- **Fix :** Wrap the avatar in `<div className="flex w-[22px] shrink-0 justify-center">` and pass `size={20}`. AssigneeAvatar already supports size 20 (h-5 w-5) and a dashed empty disc.
- _confiance : high_

#### `ROW-10` · P2 · geometry — Updated timestamp cell is 40px wide (w-10) instead of 38px (and 11px font vs 11.5)

- **Spec :** §8.2 row #10 (Updated 38, right, mono 11.5 fgDim) / artboard width:38 fontSize:11.5
- **Loc :** `ui/src/components/issues/IssueRow.tsx:91`
- **Actuel :** className 'w-10' → 40px fixed width; text-[11px].
- **Attendu :** 38px wide, fontSize 11.5, right-aligned, mono, fgDim. Artboard: width:38, fontSize:11.5.
- **Fix :** Replace `w-10` with `w-[38px]` and `text-[11px]` with `text-[11.5px]` on the updated span (line 91). Ensure tabular-nums (font-data) applies.
- _confiance : high_

#### `ROW-11` · P2 · geometry — TaskDot cell is 8px wide (w-2) instead of 10px, and dot renders at 6px instead of 8px

- **Spec :** §8.2 row #11 (TaskDot 10 cell, 8px dot) / §6.7 (size 8 on rows) / artboard width:10 cell, TaskDot size 8
- **Loc :** `ui/src/components/issues/IssueRow.tsx:95-97; ui/src/components/issues/TaskDot.tsx:23`
- **Actuel :** Cell is `w-2` (8px); TaskDot called with no size so it defaults to size=6 (size-1.5).
- **Attendu :** 10px-wide center cell; dot at 8px. Artboard: <div style={{width:10, justifyContent:'center'}}><TaskDot size={8}/></div>, default row dot size 8.
- **Fix :** Change the cell to `w-2.5` (10px) and call `<TaskDot kind={taskKind} size={8} />`.
- _confiance : high_

#### `ROW-13` · P2 · color — Done-row title is dimmed to fg-muted; spec keeps title at fg

- **Spec :** §8.2 row #4 (Title 13px var(--sk-fg) weight 400) / artboard IssueRowV3 title always var(--sk-fg)
- **Loc :** `ui/src/components/issues/IssueRow.tsx:53-60`
- **Actuel :** isDone ? 'text-fg-muted' : 'text-fg' — Done/shipped rows render the title in fgMuted.
- **Attendu :** Title is always var(--sk-fg) regardless of bucket; the artboard IssueRowV3 hard-codes color var(--sk-fg) on the title with no done variant (status is conveyed by the StatusIcon glyph, not by dimming the title — §0.4).
- **Fix :** Drop the isDone conditional on the title; render `text-fg` always. If 'shipped is quieter' is desired, raise it in a future design round (not in spec).
- _confiance : medium_

#### `ROW-14` · P2 · typography — Row title relies on inherited font-weight rather than pinning weight 400

- **Spec :** §8.2 (Title weight 400) / §1 (text-wrap: pretty on titles)
- **Loc :** `ui/src/components/issues/IssueRow.tsx:53-60`
- **Actuel :** Title span has no explicit font-weight (inherits) and no text-wrap utility.
- **Attendu :** Weight 400 explicit; single-line ellipsis already correct. text-wrap:pretty is moot under whitespace-nowrap.
- **Fix :** Add `font-normal` to the title span to pin weight 400 (low risk). Skip text-wrap:pretty for the single-line row.
- _confiance : low_

#### `GRP-01` · P2 · iconography — Group header chevron uses 'chev' rotated 90deg instead of distinct chevDown/chev glyphs

- **Spec :** §9 contents #1 (chevDown when open, chev when collapsed) / artboard Icon name={defaultOpen ? 'chevDown' : 'chev'}
- **Loc :** `ui/src/components/issues/IssueGroupHeader.tsx:45-52`
- **Actuel :** Single Icon name="chev" rotated rotate-90 (open) / rotate-0 (collapsed).
- **Attendu :** Distinct glyphs: chevDown (open) and chev (collapsed). Artboard renders two different icon names rather than rotating one. A rotated right-chevron approximates a down-chevron so impact is minor, but it diverges from the icon-system contract.
- **Fix :** Use `<Icon name={collapsed ? 'chev' : 'chevDown'} size={11} className="text-fg-dim"/>` and drop the rotate transform, matching §9. If chevDown isn't in the Icon set, that is the real gap to close.
- _confiance : medium_

#### `GRP-02` · P2 · layout — Group header missing the trailing +/more action icons

- **Spec :** §9 contents #6-8 (flex spacer, optional action slot, then plus 12 + more 13 fgDim) / artboard GroupHeaderV3 trailing cluster
- **Loc :** `ui/src/components/issues/IssueGroupHeader.tsx:64-78`
- **Actuel :** Header renders chevron, glyph, label, count, optional Pinned tag — then stops. No flex spacer, no trailing plus/more icons.
- **Attendu :** After the count (and pinned tag): a flex spacer, optional action slot, then a right cluster Icon plus size 12 + Icon more size 13, both fgDim, gap 4. Artboard: <span style={{flex:1}}/> {action} <div className=sk-row gap:4 color:fgDim><Icon plus 12/><Icon more 13/></div>.
- **Fix :** Append `<span className="flex-1" />` then `<div className="flex items-center gap-1 text-fg-dim"><Icon name="plus" size={12}/><Icon name="more" size={13}/></div>`. Interaction may be unwired but the glyphs are part of the visual spec.
- _confiance : medium_

#### `GRP-03` · P2 · typography — Pinned label letter-spacing is 0.01em instead of 0.2px

- **Spec :** §9 contents #3 (pinned label letter-spacing: 0.2) / artboard letterSpacing: pinned ? 0.2 : 0
- **Loc :** `ui/src/components/issues/IssueGroupHeader.tsx:67`
- **Actuel :** tracking-[0.01em] on the pinned label. At 12.5px, 0.01em ≈ 0.125px.
- **Attendu :** letter-spacing 0.2px (absolute px, not em-relative). Artboard sets letterSpacing: 0.2.
- **Fix :** Change `tracking-[0.01em]` to `tracking-[0.2px]` on the pinned label span.
- _confiance : high_

#### `GRP-05` · P2 · spacing — Group header gap is 8px (gap-2) instead of 9px

- **Spec :** §9 (gap 9) / artboard gap:9
- **Loc :** `ui/src/components/issues/IssueGroupHeader.tsx:39`
- **Actuel :** className 'gap-2' = 8px between chevron/glyph/label/count.
- **Attendu :** 9px. Artboard GroupHeaderV3: gap:9. (Row gap is 10; header gap is 9 — distinct values, neither normalized to 8.)
- **Fix :** Replace `gap-2` with `gap-[9px]` on the group header.
- _confiance : high_

#### `GRP-06` · P2 · color — Pinned tag bg/border approximate via token-opacity stacking rather than color-mix-with-transparent

- **Spec :** §9 contents #5 (pinned tag: bg warn-tint 8%, border warn-tint 30%) / artboard pinned tag
- **Loc :** `ui/src/components/issues/IssueGroupHeader.tsx:73-77`
- **Actuel :** Pinned tag: border-warn/30 and bg-warn-soft/60. warn-soft is rgba(212,160,74,.14); at 60% ≈ warn ~8.4% — close. border-warn/30 = warn 30% over the band.
- **Attendu :** bg = color-mix(in srgb, var(--sk-warn) 8%, transparent); border = 1px color-mix(in srgb, var(--sk-warn) 30%, transparent). Artboard uses transparent mix targets, not soft-token opacity stacking.
- **Fix :** To be exact: bg `bg-[color-mix(in_srgb,var(--color-warn)_8%,transparent)]` and border `border-[color-mix(in_srgb,var(--color-warn)_30%,transparent)]`. Low priority — current rendering is within ~1% of target.
- _confiance : medium_

#### `GRP-07` · P2 · layout — Group header z-index is 30 (z-30) where artboard uses z-index 2

- **Spec :** §9 (z-index: 2) / artboard zIndex:2
- **Loc :** `ui/src/components/issues/IssueGroupHeader.tsx:39`
- **Actuel :** z-30 on the sticky header.
- **Attendu :** z-index 2 (just above rows, below the hover card at z-5). z-30 risks the sticky header painting over the 350ms hover preview card (artboard places the floating card at zIndex 5).
- **Fix :** Change `z-30` to `z-[2]`. Verify the hover preview (IssuePreview) sits above it; artboard uses zIndex 5 for the card vs 2 for the header.
- _confiance : medium_

#### `SKEL-01` · P2 · geometry — Skeleton header is 28px (h-7) and row bones don't mirror the real column grid

- **Spec :** §8.1/§8.2 + artboard SkRow/SkeletonGroup / §0.1
- **Loc :** `ui/src/components/issues/IssueRowSkeleton.tsx:30, 48-59`
- **Actuel :** SkeletonGroupHeader is h-7 (28px) with gap-2 and no chevron/glyph; SkeletonRow is h-9 gap-2.5 but uses a flex-1 spacer (line 53) for the title with no labels/sub-count/estimate placeholders, and bone widths don't match the artboard SkRow (which lays bones at 14/14/64/flex/[56+56 labels]/42 sub/140 proj/22 est/20 avatar/38 upd/10 dot with padding 0 24 0 20, gap 10).
- **Attendu :** Loading skeleton must match the 36/32 row geometry exactly (§0.1 / artboard SkRow): group header 32px with same gap/padding as the real header; row bones aligned to the real column grid. Current 28px header is neither 32 nor 36 — an illegal list rhythm.
- **Fix :** Bump the skeleton header to h-8 (32px) with chevron+glyph bones; rebuild SkeletonRow to mirror IssueRowV3's column cells (widths/gap/padding) per artboard SkRow.
- _confiance : medium_

## View tabs + filter bar + filter dropdown + view toggle (§10) — 62/100

**Résumé.** The surface is structurally close — the segmented view toggle is a single control (not two buttons), the +Filter button is correctly dashed, FilterChips use bg-raised, and DisplayChips are borderless. But there are several concrete divergences: the active view-tab underline is ACCENT instead of FG (explicit spec violation and a Foundations §0.3 concern), the per-tab count badge is rendered as bare text with no bg-raised chip / min-w-16 / radius, tab labels are 12px instead of 13px, and the container/tab paddings use px-6/px-2 instead of the spec's 16/12. The filter dropdown is the weakest area: it drops 4 mandatory facets (Creator, Milestone, Cycle, Estimate) despite the spec explicitly forbidding that, swaps Priority/Status order, places Task state in the wrong position, and entirely omits the Task-state SK tag + bg-raised treatment and the "Save current as view…" footer row. A systemic concern underlies everything: html{font-size:14px} makes every rem utility (h-10, h-6.5, w-66, px-4) render ~12.5% smaller than the px values the spec specifies, so even "correct" classes land short of target. The biggest single gap is the filter dropdown's incompleteness and the missing SK provenance tag.

**Critiques UX :**

- IssuesViewToggle.tsx is dead code — it's never imported anywhere (only self-references). The live segmented control is LayoutToggle inside IssueFilterBar. Worse, IssuesViewToggle renders a single ghost Btn with a text label ('List'/'Kanban'), which is the exact two-state-text-button anti-pattern the spec warns against ('one control not two buttons'). Delete IssuesViewToggle.tsx to avoid future confusion and accidental reuse.
- The filter dropdown's two-level drill-in (facet list → AxisPicker with a Back/Done header) is an interaction the spec §10.3 doesn't describe — the spec implies a flat facet list. The drill-in is actually good UX for many values, but it diverges from the mockup and adds an h-8 header bar that doesn't exist in the artboard. Worth an explicit design decision rather than silent divergence.
- The comment at IssueFilterDropdown.tsx:48-49 ('Cycle / Milestone / Creator / Estimate intentionally absent') directly contradicts the spec's explicit 'Don't drop any of these' directive. If the data genuinely can't be wired, the honest move per spec is to show a disabled/'coming soon' facet row, not to remove it — otherwise the dropdown silently looks less capable than Linear, which is the whole point of this surface.
- Across the filter bar the team mixes literal-px (Btn) and rem (h-6.5) sizing for controls that should be the same 26px height. Even setting aside the 14px-root issue, this guarantees subtle 1–3px misalignments between the +Filter button, chips, DisplayChips and the toggle. Standardize all filter-bar controls on one literal height token (h-[26px]).
- The Group and Sort DisplayChips have no visual affordance that they're interactive (no chevron, no bg, no border) until you hover. Adding the spec's trailing chevDown is not just parity — it materially improves discoverability of the group/sort menus.
- The active tab underline being accent (TAB-01) is the kind of drift that quietly erodes the design language: accent is supposed to be rare and meaningful (primary actions, active rail, SK provenance). Using it on the tab underline AND not using it where it's actually mandated (the SK tag, DROP-03) is exactly backwards from the Foundations intent.

**Écarts (18) :**

#### `TAB-01` · P1 · color — Active view-tab underline uses accent, spec mandates fg

- **Spec :** §10.1 (active underline background --sk-fg, NOT accent) + §0.3
- **Loc :** `ui/src/components/issues/IssueViewTabs.tsx:31-35`
- **Actuel :** Active tab gets `border-accent` (cobalt #5b6ef2) on a full-width 2px border-bottom.
- **Attendu :** Active underline is `background --sk-fg` (#e7e9ec), inset left 8 / right 8 / bottom -1, height 2, radius 2. The spec explicitly states 'the underline is fg, NOT accent', and §0.3 reserves accent for sparse use.
- **Fix :** Replace `border-accent` with an fg-colored underline. Either `border-fg` for the border approach, or render an absolute inset bar: `after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-[2px] after:bg-fg`. Drop the accent.
- _confiance : high_

#### `TAB-02` · P1 · layout — Per-tab count is bare text, missing the raised chip badge

- **Spec :** §10.1 (count badge: font-size 11, padding 0 5, radius 4, bg raised, color fgDim, min-width 16, text-align center, line-height 16)
- **Loc :** `ui/src/components/issues/IssueViewTabs.tsx:38`
- **Actuel :** `<span className="font-data text-[11px] text-fg-dim">{counts[value]}</span>` — no background, no padding, no min-width, no radius, no centering.
- **Attendu :** A raised chip: bg-raised, px-[5px] (padding 0 5), rounded-[4px], text-fg-dim, text-[11px], min-w-[16px], text-center, leading-4 (line-height 16).
- **Fix :** Wrap count in a chip: `<span className="inline-flex min-w-[16px] justify-center rounded-[4px] bg-raised px-[5px] text-center font-data text-[11px] leading-4 text-fg-dim">{counts[value]}</span>`.
- _confiance : high_

#### `TAB-03` · P2 · typography — View-tab label font-size is 12px, spec requires 13px

- **Spec :** §10.1 (tab font-size 13) + §1 t-13 'view tab label'
- **Loc :** `ui/src/components/issues/IssueViewTabs.tsx:31, 46`
- **Actuel :** Tab buttons and the New view button use `text-[12px]`.
- **Attendu :** Tab label font-size is 13px (t-13). The 'New view' affordance is 12.5px / fgDim (§10.1 right cluster).
- **Fix :** Change tab label class to `text-[13px]`; set 'New view' to `text-[12.5px]` (already fg-dim).
- _confiance : high_

#### `TAB-04` · P2 · spacing — View-tab container and tab paddings diverge (px-6/px-2 vs 16/12)

- **Spec :** §10.1 (container padding 0 16; tab padding 0 12px; gap 7)
- **Loc :** `ui/src/components/issues/IssueViewTabs.tsx:21, 31`
- **Actuel :** Container uses `px-6` (24px intent / 21px at 14-base) and `gap-1`; each tab uses `px-2` (8px) with `gap-1.5`.
- **Attendu :** Container px16 (`px-4`), tab padding-x 12 (`px-3`), tab inner gap 7 (`gap-[7px]`).
- **Fix :** Container: `px-4`. Tab button: `px-3 gap-[7px]`. (Note: gap-1.5 renders 5.25px at the 14px root, not 6 or 7.)
- _confiance : medium_

#### `TAB-05` · P2 · geometry — View-tab container height 38px not met (h-10 → 35/40px)

- **Spec :** §10.1 (container height 38)
- **Loc :** `ui/src/components/issues/IssueViewTabs.tsx:21, 31, 46`
- **Actuel :** `h-10` on container and tabs. At the project's html{font-size:14px} root, h-10 = 35px; at a 16px base it would be 40px. Neither is 38px.
- **Attendu :** Container height exactly 38px.
- **Fix :** Use `h-[38px]` on the container and matching `h-[38px]` on the tab buttons (literal px to escape the rem-scaling ambiguity).
- _confiance : medium_

#### `DROP-01` · P1 · architecture — Filter dropdown drops 4 mandatory facets (Creator, Milestone, Cycle, Estimate)

- **Spec :** §10.3 facet list (mandatory ordering) + 'Don\'t drop any of these from the dropdown UI even if the underlying data isn\'t wired up'
- **Loc :** `ui/src/components/issues/IssueFilterDropdown.tsx:48-62`
- **Actuel :** AXES has 11 facets; Creator, Milestone, Cycle, Estimate are omitted with a comment that the list query doesn't expose them.
- **Attendu :** All 15 facets must appear in the dropdown UI regardless of data wiring: Assignee, Creator, Priority, Status, Label, Project, Repo, Milestone, Cycle, Estimate, Created, Updated, Completed, Has sub-issues, Task state (SK). Spec says show the item; on click ask the orchestrator to wire data.
- **Fix :** Add Creator (icon user), Milestone (icon flag), Cycle (icon history), Estimate (icon hash/gauge) to AXES. Render them even when picker items are empty (e.g. with a 'Not wired yet' affordance) rather than hiding the rows.
- _confiance : high_

#### `DROP-02` · P2 · layout — Facet order wrong: Status/Priority swapped and Task state mis-positioned

- **Spec :** §10.3 (mandatory ordering: …Priority · Status… and Task state LAST after Has sub-issues)
- **Loc :** `ui/src/components/issues/IssueFilterDropdown.tsx:50-62`
- **Actuel :** Order is Assignee, Status, Priority, Label, Project, Repo, Task state, Created, Updated, Completed, Has sub-issues. Status precedes Priority, and Task state sits at index 7.
- **Attendu :** Priority precedes Status; Task state is the final row, immediately after Has sub-issues.
- **Fix :** Reorder AXES to: assignee, creator, priority, status, label, project, repo, milestone, cycle, estimate, created, updated, completed, has_sub_issues, task.
- _confiance : high_

#### `DROP-03` · P1 · iconography — Task state row missing SK provenance tag and bg-raised treatment

- **Spec :** §10.3 (Task state row: bg --sk-raised + trailing SK tag — 9.5px, padding 0 4, radius 3, border 1px --sk-accentLine, color accent, uppercase 0.3 letter-spacing, weight 600) + §0.3 (SK provenance is one of the few legit accent uses)
- **Loc :** `ui/src/components/issues/IssueFilterDropdown.tsx:57, 161-174`
- **Actuel :** Task state row is a generic facet row with `meta: 'running · needs · review · shipped'` rendered as plain fgDim text; no bg-raised, no SK badge. There is no --sk-accentLine token defined either.
- **Attendu :** The Task state row gets bg-raised and a trailing SK tag styled with accent text + accent-line border. This is the single Superkick-specific facet and must be visually flagged.
- **Fix :** Add `--color-accent-line: rgba(91,110,242,.50)` to tokens.css. Render the task row with `bg-raised` and a trailing badge: `<span className="rounded-[3px] border border-accent-line px-1 text-[9.5px] font-semibold uppercase tracking-[0.03em] text-accent">SK</span>` instead of the dot-separated meta string.
- _confiance : high_

#### `DROP-04` · P2 · layout — 'Save current as view…' footer row and bottom divider missing

- **Spec :** §10.3 (Divider 1px border margin 4 0; 'Save current as view…' row, fgMuted, icon filter 13 fgDim)
- **Loc :** `ui/src/components/issues/IssueFilterDropdown.tsx:134-179`
- **Actuel :** Facet list ends at the <ul>; there is no divider or 'Save current as view…' row at the bottom of the dropdown.
- **Attendu :** After the facet list: a 1px border divider (margin 4 0) then a 'Save current as view…' row in fgMuted with a leading filter icon (13, fgDim).
- **Fix :** Append `<div className="my-1 h-px bg-border" />` then a button row: `flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-fg-muted` with `<Icon name="filter" size={13} className="text-fg-dim" />` + 'Save current as view…'.
- _confiance : high_

#### `DROP-05` · P2 · geometry — Dropdown width 264px (w-66) not the spec 240px; radius and shadow off

- **Spec :** §10.3 (width 240, radius 8, shadow 0 18px 40px rgba(0,0,0,.5), bg overlay)
- **Loc :** `ui/src/components/issues/IssueFilterDropdown.tsx:132 + ui/src/components/ui/popover-shell.tsx:43`
- **Actuel :** popupClassName=`w-66 ... shadow-xl`; the base PopoverPopup forces `rounded-[7px]`. So width ≈ 264px (or 231px at 14-base), radius 7, and a Tailwind `shadow-xl` rather than the spec drop shadow.
- **Attendu :** Width 240px, radius 8, shadow `0 18px 40px rgba(0,0,0,.5)`, bg overlay (overlay ✓).
- **Fix :** Set `w-60` (240 at 16-base) or `w-[240px]`, add `rounded-[8px]` (overriding the base 7px), and replace `shadow-xl` with `shadow-[0_18px_40px_rgba(0,0,0,0.5)]`.
- _confiance : high_

#### `DROP-06` · P2 · typography — Facet eyebrow is 10px not 10.5; facet icon 12 not 13

- **Spec :** §10.3 (Eyebrow 'Filter by' 10.5/600 uppercase 0.8 fgDim; item icon 13 fgMuted)
- **Loc :** `ui/src/components/issues/IssueFilterDropdown.tsx:147-149, 161-165`
- **Actuel :** Eyebrow uses `text-[10px]`; facet item icon uses `size={12}`.
- **Attendu :** Eyebrow 10.5px (`text-[10.5px]`), letter-spacing ~0.8px; facet item icon size 13.
- **Fix :** Eyebrow `text-[10.5px] tracking-[0.08em]`; facet `<Icon size={13} />`.
- _confiance : medium_

#### `FB-01` · P2 · radius — Filter-bar controls use bare rounded (4px) where spec mandates radius 5

- **Spec :** §4.2 (sm = 5: Filter chips, DisplayChip, FilterBar buttons, view toggle) + §10.2
- **Loc :** `ui/src/components/issues/IssueFilterBar.tsx:66, 316, 404, 445`
- **Actuel :** +Filter button, FilterChip, DisplayChip and the view-toggle outer all use bare `rounded` = 0.25rem (3.5px at 14-base / 4px at 16).
- **Attendu :** All four use radius 5 (`rounded-[5px]`). Inner toggle segments correctly use radius 3 (rounded-[3px]).
- **Fix :** Change `rounded` to `rounded-[5px]` on lines 66, 316, 404, 445. Keep the remove-button `rounded` (spec radius 4 there) and segment `rounded-[3px]`.
- _confiance : high_

#### `FB-02` · P2 · iconography — DisplayChip (SelectControl) missing trailing chevDown

- **Spec :** §10.2 item 5 (DisplayChip: trailing chevDown 10 fgDim)
- **Loc :** `ui/src/components/issues/IssueFilterBar.tsx:399-410`
- **Actuel :** Group/Sort chips render `<span key>` + `<span value>` only — no chevron.
- **Attendu :** A trailing chevDown icon (size 10, fgDim) after the value to signal it opens a menu.
- **Fix :** Append `<Icon name="chevDown" size={10} className="text-fg-dim" />` (or chev rotated) inside the trigger button after the value span; also bump `px-1.5` to `px-2` (spec padding 0 8).
- _confiance : high_

#### `FB-03` · P2 · color — FilterChip value not toned by semantic color (status/priority)

- **Spec :** §10.2 item 2 ('value: fg, weight 500. If toned (e.g. status), color = var(--sk-{tone})')
- **Loc :** `ui/src/components/issues/IssueFilterBar.tsx:330`
- **Actuel :** Value span is always `font-medium` (inherits fg) regardless of axis.
- **Attendu :** When the chip represents a toned facet (status/priority/task), the value text takes the semantic tone color.
- **Fix :** Map chip.axis to a tone and apply `text-{tone}` to the value span (e.g. status → info/success/etc., task → warn/info/accent/success); leave neutral axes at fg.
- _confiance : medium_

#### `FB-04` · P2 · spacing — Filter bar min-height 41 and py 7 not matched; gap renders 5.25px

- **Spec :** §10.2 (min-height 41, padding 7 16, gap 6)
- **Loc :** `ui/src/components/issues/IssueFilterBar.tsx:56`
- **Actuel :** `min-h-10` (40px at 16 / 35px at 14), `py-1.5` (6px at 16 / 5.25px at 14), `px-4` (16/14), `gap-1.5` (6/5.25).
- **Attendu :** min-height 41 (`min-h-[41px]`), padding-y 7 (`py-[7px]`), padding-x 16, gap 6.
- **Fix :** Use `min-h-[41px] py-[7px] px-4 gap-1.5`; consider literal `gap-[6px]` to escape the 14px-root shrink.
- _confiance : medium_

#### `FB-05` · P2 · geometry — FilterChip remove button is 16px, spec is 18px

- **Spec :** §10.2 item 2 (remove button 18×18, radius 4, ✕ size 10, fgDim)
- **Loc :** `ui/src/components/issues/IssueFilterBar.tsx:331-338`
- **Actuel :** `size-4` (16px) remove button; spec ✕ size 10 (✓) and fgDim (✓), but it adds a `hover:bg-overlay` not in spec.
- **Attendu :** 18×18 hit-area, radius 4. The hover background is unspecified — fine as a subtle affordance but should not jump to overlay tier.
- **Fix :** Change `size-4` to `size-[18px]`. Optionally soften hover to `hover:bg-raised` to stay within elevation rules.
- _confiance : medium_

#### `FB-06` · P2 · spacing — FilterChip left padding 8 instead of 9

- **Spec :** §10.2 item 2 (padding 0 4 0 9)
- **Loc :** `ui/src/components/issues/IssueFilterBar.tsx:316`
- **Actuel :** `pr-1 pl-2` → left 8 (at 16) / 7 (at 14), right 4.
- **Attendu :** Left padding 9, right padding 4.
- **Fix :** `pr-1 pl-[9px]`.
- _confiance : low_

#### `SYS-01` · P1 · geometry — html{font-size:14px} shrinks every rem utility ~12.5% below spec px

- **Spec :** §0 Foundations (Linear-faithful density — exact px) + §4.1 spacing scale
- **Loc :** `ui/src/index.css:48-50`
- **Actuel :** Root font-size is 14px, so rem-based utilities (h-10=35px, h-6.5=22.75px, w-66=231px, px-4=14px, px-6=21px, gap-1.5=5.25px, rounded=3.5px) all render below their px-spec targets. The surface mixes these with literal-px values (Btn h-[26px]), producing inconsistent control heights.
- **Attendu :** Spec values are literal px (chips 26, dropdown 240, etc.). Either the rem base should be 16px or px-critical chrome should use bracket-px utilities so it matches the artboard exactly.
- **Fix :** Project-level decision: either restore root font-size to 16px (and re-audit text sizes) or convert px-critical chrome (heights, chip widths, paddings, radii) to literal `[NNpx]` utilities. At minimum, use literal px for the spec-pinned values on this surface (h-[26px], w-[240px], rounded-[5px]).
- _confiance : medium_

## Issue hover card / preview (IssuePreview.tsx via HoverCard.tsx) — 58/100

**Résumé.** The hover card is structurally faithful to §11.2 — header / title / 3-line body clamp / labels+project / meta strip / last-comment / linked-run footer all exist in the right order, status & priority use the correct StatusIcon/PriorityIcon glyphs, and the linked-run footer correctly steps down to void (bg-canvas). But the foundational geometry is wrong in ways a user notices: because `html { font-size: 14px }` scales every rem-based Tailwind utility by 14/16, the card renders at ~420px instead of the fixed 480px, and all spacing/padding is shrunk. The radius is 6px (rounded-lg → --radius 6) not 10, and the shadow is Tailwind's near-invisible default shadow-xl rather than the heavy §11.1 drop shadow. Two architecture violations stand out: the close is debounced 150ms (spec mandates no debounce), and the no-linked-run branch renders a placeholder footer with a primary "Launch task" button — the spec says omit section 7 entirely and bans primary actions in the card. The biggest single gap is the width/spacing scaling, which throws off the whole card's proportions.

**Critiques UX :**

- Root cause to fix first: `html { font-size: 14px }` (index.css:49) silently rescales EVERY rem-based Tailwind utility (w-*, p-*, gap-*, mt-*, h-*) by 14/16 across the whole app, not just this card. The spec's pixel values assume a 16px root. Either set the root to 16px and rely on the explicit 14px base body size, or commit to px-absolute utilities for all geometry that the spec pins in px. Auditing every surface for w-120-style mismatches is worth a dedicated pass — this is a systemic parity tax.
- The four IssueContextSections components (Snapshot, CommentExcerpts, LinkedItems, Memory) flagged in the surface brief are NOT part of the hover card — they only render in ChatPanel's rail and LaunchTaskFeedBody (IssueContextPanel). So they aren't a hover-card defect. But they ARE the 'snapshot/memory/linked-items implementation-extras' the spec's §0 alignment decision says to hide behind a default-off flag; in the workspace-context panel they're fully exposed. Worth confirming with the operator whether that panel is in-scope for the issue-centered v1 contract or is itself an extra to gate.
- Those context sections also use the deprecated Graphite palette (bg-carbon-dim, bg-graphite, border-edge, text-silver, bg-slate-deep) rather than the tokens.css surface/raised/overlay/border tokens — index.css:8 literally calls Graphite 'deprecated'. They're a second elevation/color system living next to the canonical one, which is exactly the kind of drift §3 warns against.
- The hover card's two-button no-run footer (Open + Launch task) reflects an older product intent where the card was an action surface. The redesign deliberately makes the card read-only and pushes 'launch' onto the issue page. Removing it (HOV-06) is the right call, but double-check no flow depends on launching from the list-row hover before deleting onLaunch.
- Minor inconsistency: the linked-run footer prints the raw `run.state` enum (line 144) where the spec phrasing is 'run-<id> · phase · elapsed'. The state string (e.g. 'waiting_human') will read as a machine token, not the human 'phase' label the artboard shows. A small humanize map would tighten parity.

**Écarts (14) :**

#### `HOV-01` · P0 · geometry — Card width renders ~420px, not the fixed 480px

- **Spec :** §11.1 width: 480 (fixed)
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:58`
- **Actuel :** Root div uses `w-120`. Tailwind spacing is rem-based and the app sets `html { font-size: 14px }` (ui/src/index.css:49), so `w-120` = 30rem = 30×14 = 420px.
- **Attendu :** Fixed 480px regardless of root font-size.
- **Fix :** Use a pixel-absolute width: `w-[480px]` instead of `w-120`. (Same 14px-root scaling silently shrinks every rem utility in this file — see HOV-04.)
- _confiance : high_

#### `HOV-02` · P1 · radius — Card radius is 6px, not 10px

- **Spec :** §4.2 radii: lg=10 (hover card); §11.1 border-radius: 10
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:58`
- **Actuel :** `rounded-lg`. In this theme `--radius` = 6px (ui/src/index.css:216) and `--radius-lg: var(--radius)` (index.css:192), so rounded-lg renders at 6px.
- **Attendu :** 10px corner radius.
- **Fix :** Replace `rounded-lg` with `rounded-[10px]`.
- _confiance : high_

#### `HOV-03` · P1 · elevation — Drop shadow is Tailwind default shadow-xl, far lighter than the spec dark hover shadow

- **Spec :** §11.1 shadow: 0 24px 56px rgba(0,0,0,.55) (≈ sk-shadow-3, §4.3)
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:58`
- **Actuel :** `shadow-xl` with no project override → Tailwind default `0 20px 25px -5px rgba(0,0,0,.1), 0 8px 10px -6px rgba(0,0,0,.1)`. Alpha 0.1 reads almost flat on the dark overlay.
- **Attendu :** Heavy dark drop shadow: 0 24px 56px rgba(0,0,0,.55).
- **Fix :** Replace `shadow-xl` with an arbitrary shadow `shadow-[0_24px_56px_rgba(0,0,0,0.55)]` (or define an `sk-shadow-3` utility and apply it).
- _confiance : high_

#### `HOV-04` · P1 · spacing — Section padding-x is wrong (17.5px) and asymmetric vs spec 14px

- **Spec :** §11.2 — all sections 14px padding-x; header `12px 14px 6px`; body `0 14px 12px`; meta/comment `10px 14px`; footer `9px 14px`
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:59,116,137,162`
- **Actuel :** Top block uses `px-5 pt-4 pb-4` → at 14px root px-5=17.5px, pt/pb-4=14px. Comment row `px-5 py-3` (17.5/10.5px). Run footer `px-5 py-2.5` (17.5/8.75px). No-run footer `px-4` (14px). The header has no separate 6px bottom gutter — title margin (`mt-2`) substitutes.
- **Attendu :** Uniform 14px padding-x across all sections; header 12/14/6, body bottom 12, meta/comment 10/14, footer 9/14.
- **Fix :** Use px-absolute values: header block `px-3.5 pt-3 pb-1.5` won't be exact at 14px root either — prefer arbitrary px: wrap content in `px-[14px]`, header `pt-[12px] pb-[6px]`, comment/meta `py-[10px]`, run footer `py-[9px]`. Avoid rem spacing utilities in this card given the 14px root.
- _confiance : high_

#### `HOV-05` · P1 · interaction — Close is debounced 150ms; spec forbids any close delay

- **Spec :** §11.3 — "Don't delay the close. The card disappears on pointer-leave with no debounce."
- **Loc :** `ui/src/components/issues/HoverCard.tsx:7,23`
- **Actuel :** `const CLOSE_DELAY = 150` passed to `<Popover.Trigger ... closeDelay={CLOSE_DELAY} />`.
- **Attendu :** closeDelay 0 — card dismisses immediately on pointer-leave.
- **Fix :** Set `CLOSE_DELAY = 0` (or pass `closeDelay={0}`). Open delay of 350ms (passed from IssueRow.tsx:30) is correct.
- _confiance : high_

#### `HOV-06` · P0 · architecture — No-linked-run branch renders a placeholder footer with a primary "Launch task" button

- **Spec :** §11.2.7 (footer only if a run is active) + §11.3 ("No linked run — omit section 7 entirely; don't render a placeholder" and "Don't put primary action buttons in the hover card. The footer is read-only except for Open.")
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:161-179`
- **Actuel :** When `linkedRun` is null, an `else` branch renders a bordered footer containing an "Open" button AND a primary accent "Launch task" button (bg-accent, zap icon) that navigates to /tasks/new.
- **Attendu :** When no run is linked, render nothing for section 7 — no placeholder, no Launch button. The card is read-only.
- **Fix :** Delete the entire `else` branch (lines 161-179) and the `onLaunch` handler (lines 45-49); render the footer only via `linkedRun ? (...) : null`.
- _confiance : high_

#### `HOV-07` · P1 · elevation — Last-comment section does not step down to surface elevation

- **Spec :** §11.2.6 — last comment section bg `--sk-surface` (steps down one elevation from overlay)
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:116`
- **Actuel :** Comment row is `border-t border-border px-5 py-3` with no background, so it inherits the card's `bg-overlay` (#23282f).
- **Attendu :** bg-surface (#15181c) on the last-comment section, creating the one-step elevation drop the spec calls for.
- **Fix :** Add `bg-surface` to the comment section wrapper at line 116.
- _confiance : high_

#### `HOV-08` · P2 · typography — Body excerpt is 13px / line-height 1.375 instead of 12.5px / 1.55

- **Spec :** §11.2.3 — body excerpt font-size 12.5, fgMuted, line-height 1.55 (also §1 "Hover card description: 1.55")
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:74`
- **Actuel :** `text-[13px] leading-snug` (leading-snug = 1.375).
- **Attendu :** 12.5px text, line-height 1.55.
- **Fix :** Change to `text-[12.5px] leading-[1.55]`. The 3-line clamp (line-clamp-3) is correct.
- _confiance : high_

#### `HOV-09` · P2 · typography — Last-comment body line-height is 1.375 instead of 1.45

- **Spec :** §11.2.6 (2-line clamp body 12px fgMuted line-height 1.45)
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:129`
- **Actuel :** `text-[12px] leading-snug` (1.375).
- **Attendu :** 12px / line-height 1.45.
- **Fix :** Change `leading-snug` to `leading-[1.45]`. Size 12px and 2-line clamp are correct.
- _confiance : high_

#### `HOV-10` · P1 · geometry — Last-comment avatar is 14px, spec calls for 20px

- **Spec :** §11.2.6 — "Avatar 20 with bot/person color"
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:117-120,184-201`
- **Actuel :** Comment uses the local `AssigneeAvatar` with no size prop → fixed `size-4` (= 1rem = 14px at this root). It also lacks per-person/agent color (renders a generic bg-raised initials disc).
- **Attendu :** 20px avatar tinted with the author's person/agent color (e.g. fix-bot #3a6f4e, review-bot #5b6ef2 per §6.3).
- **Fix :** Render at 20px (`size-[20px]`) and apply the per-agent hue background instead of bg-raised. The shared AssigneeAvatar (ui/src/components/issues/AssigneeAvatar.tsx) supports a size prop — use it here instead of the inline one.
- _confiance : high_

#### `HOV-11` · P2 · iconography — Meta strip uses a branch icon + text for sub-count instead of SubCountChip, and omits the estimate slot

- **Spec :** §11.2.5 — meta strip contains `Assigned to <Avatar 14> <Name>`, `<SubCountChip>`, `<EstimateChip>`
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:93-112`
- **Actuel :** Sub-count renders as `<Icon name="branch" 11>` + `"N sub-issues"` text. There is no SubCountChip/EstimateChip component anywhere in the codebase, and no estimate slot is rendered at all.
- **Attendu :** A `<SubCountChip done total>` (done/total form, e.g. 3/5) and an `<EstimateChip n>` in the meta strip.
- **Fix :** Build a SubCountChip atom (mono done/total) and use it; the assignee avatar at size-4 (14px) is correct here. Estimate is a data/component gap — if estimate data isn't wired, omitting the chip is acceptable per the optional-field rule, but the sub-count should still switch from a branch-icon label to the chip form.
- _confiance : medium_

#### `HOV-12` · P2 · typography — Header status/ID gutter and title leading slightly off spec

- **Spec :** §11.2.2 — Title font-size 14, weight 500, line-height 1.35; §11.2.1 header 6px bottom gutter
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:71`
- **Actuel :** Title is `mt-2 text-[14px] font-medium` with no explicit line-height (inherits body 1.45). Size 14/weight 500 are correct.
- **Attendu :** Title line-height 1.35; header should have a discrete 6px bottom padding rather than relying on the title's top margin.
- **Fix :** Add `leading-[1.35]` to the title and give the header block an explicit `pb-1.5`-equivalent (`pb-[6px]`) gutter as part of the HOV-04 padding rework.
- _confiance : medium_

#### `HOV-13` · P2 · motion — Linked-run footer pulse dot uses live-pulse (2s, opacity→0.4) and a plain bg dot, not the spec Dot ring-pulse

- **Spec :** §11.2.7 (`<Dot tone="info" pulse size=6>`); §6.6/§6.7 pulse = sk-pulse 1.6s, opacity 1→0.45→1, 3px outer ring at ~18% color-mix
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:139; ui/src/index.css:104-116`
- **Actuel :** Hand-rolled `<span class="live-pulse size-1.5 rounded-full bg-info">`. live-pulse runs 2s with opacity floor 0.4 and has no outer ring.
- **Attendu :** The shared `<Dot tone="info" pulse size={6}>` which renders a 6px info dot with a `ring-4 ring-info/25` pulse ring; the keyframe should be ~1.6s / 0.45 floor.
- **Fix :** Replace the inline span with `<Dot tone="info" pulse size={6} />` (ui/src/ui/Dot.tsx). Optionally align the live-pulse keyframe to 1.6s / 0.45 to match sk-pulse.
- _confiance : medium_

#### `HOV-14` · P2 · state — No-comments empty state is missing

- **Spec :** §11.3 — "No comments — section 6 collapses to a 'No comments yet · Be the first.' line at 12px fgMuted, single row, padding 10 14"
- **Loc :** `ui/src/components/issues/IssuePreview.tsx:115-134`
- **Actuel :** When `lastComment` is null the entire comment section is omitted (no fallback line).
- **Attendu :** A single 12px fgMuted row "No comments yet · Be the first." with 10/14 padding.
- **Fix :** Add an `else` rendering the placeholder line. Note: this is partly a data nuance — the spec wants the row present even with zero comments; current code drops it.
- _confiance : medium_

## Kanban card and column — 42/100

**Résumé.** Wrong column model and wrong priority glyph dominate; see findings for full detail.

**Critiques UX :**

- Card has too many overlapping affordances (drag, link, Dispatch, gating pills); drag vs click is unclear, runs as board cards break columns-equal-status, the absolute date clashes with list relative stamps, the dashed Empty box collides with the drop-ghost, and six 268px columns overflow most viewports.

**Écarts (12) :**

#### `KAN-01` · P0 · architecture — Columns are lifecycle buckets, not Linear statuses with Needs you pinned first

- **Spec :** 12.3 EX-15
- **Loc :** `issueState.ts:27-34; IssuesKanbanView.tsx:52-63`
- **Actuel :** ISSUE_STATE_ORDER is open in_progress needs_human in_review done; Backlog+Todo merged to Open; needs_human mid-board.
- **Attendu :** 6 cols: Needs you pinned warn-tinted first, Backlog, Todo, In Progress, In Review, Done; drop Open.
- **Fix :** Add backlog+todo lanes; reorder to needs_human backlog todo in_progress in_review done; pin needs_human warn.
- _confiance : high_

#### `KAN-02` · P0 · iconography — Priority is a P1 P2 P3 text pill, not the PriorityIcon glyph

- **Spec :** 5.3 12.1 EX-01
- **Loc :** `KanbanIssueCard.tsx:157; SeverityPill.tsx:37-40`
- **Actuel :** Meta row leads with SeverityPill rendering P1 P2 P3 P4 dash text.
- **Attendu :** Meta row leads with PriorityIcon size 11 bar-stack glyph; no P1 text.
- **Fix :** Replace SeverityPill with PriorityIcon from priority.value size 11; widen size union to include 11.
- _confiance : high_

#### `KAN-03` · P0 · architecture — Ready Waiting Blocked pills render in the card body

- **Spec :** sec0 12.1 EX-02 EX-16
- **Loc :** `KanbanIssueCard.tsx:182; IssueExtraBadges.tsx:18-71`
- **Actuel :** Footer renders IssueExtraBadges producing Ready Waiting Blocked gating pills.
- **Attendu :** No body-level status pill; gating state is the trailing TaskDot only.
- **Fix :** Remove IssueExtraBadges from the card footer at line 182.
- _confiance : high_

#### `KAN-04` · P0 · architecture — Dispatch button rendered on launchable cards

- **Spec :** 12.1 EX-03 EX-04
- **Loc :** `KanbanIssueCard.tsx:208-219`
- **Actuel :** A secondary Dispatch button renders at the card bottom when canDispatch.
- **Attendu :** No launch or dispatch action on a card; launch lives in the issue-detail topbar.
- **Fix :** Remove the canDispatch Button block 208-219 and its dispatch plumbing props.
- _confiance : high_

#### `KAN-06` · P0 · architecture — Live runs rendered as their own board cards

- **Spec :** sec0 Foundation5 12
- **Loc :** `KanbanCard.tsx:37; KanbanRunCard.tsx:17-45`
- **Actuel :** KanbanCard renders KanbanRunCard for run items, so runs appear as first-class board cards.
- **Attendu :** Only the issue card exists on the board; a run surfaces via the issue TaskDot, not a separate card.
- **Fix :** Stop projecting runs (adapter already prefers linkedRun at line 8); render the issue card with TaskDot tone and drop KanbanRunCard.
- _confiance : medium_

#### `KAN-05` · P1 · architecture — auto tag in column header on non-droppable lanes

- **Spec :** 12.3 EX-05
- **Loc :** `KanbanColumn.tsx:70-77`
- **Actuel :** Non-droppable columns render a trailing auto span in the header.
- **Attendu :** Header is StatusIcon label count spacer plus more; no auto text.
- **Fix :** Remove the not-droppable auto span at 70-77.
- _confiance : high_

#### `KAN-07` · P1 · iconography — Column header uses a colored Dot instead of StatusIcon

- **Spec :** 12.3 9
- **Loc :** `KanbanColumn.tsx:66-69`
- **Actuel :** Header renders Dot tone size 8 plus label and count.
- **Attendu :** Header leads with StatusIcon 13 so lanes track by glyph shape.
- **Fix :** Replace Dot with StatusIcon kind from the lane status, size 13.
- _confiance : high_

#### `KAN-08` · P1 · color — Needs you column not pinned with warn-tinted border

- **Spec :** 12.3 9
- **Loc :** `KanbanColumn.tsx:56-78`
- **Actuel :** All columns share plain chrome; needs_human is unpinned and placed third.
- **Attendu :** Pinned column gets a warn-tinted top border and warn-soft header bg with a warn label.
- **Fix :** For needs_human add a warn top border, warn-soft header bg, warn label, render it first.
- _confiance : high_

#### `KAN-10` · P1 · elevation — Resting card has no shadow and hover restyles the border

- **Spec :** 12.1 4.3
- **Loc :** `KanbanIssueCard.tsx:113-116,105`
- **Actuel :** CardSurface has no resting box-shadow and sets hover border-border-strong.
- **Attendu :** Resting shadow is sk-shadow-1 (0 1px 0 rgba .03); spec defines no card hover state.
- **Fix :** Add the resting sk-shadow-1 and drop hover border-border-strong.
- _confiance : medium_

#### `KAN-11` · P1 · typography — Updated stamp shows an absolute date not a relative timestamp

- **Spec :** 12.1 8.2
- **Loc :** `KanbanIssueCard.tsx:185-187; format.ts:1-4`
- **Actuel :** formatShortDate renders e.g. May 28 via toLocaleDateString.
- **Attendu :** Updated is compact relative such as 8m 3h 1d 1w.
- **Fix :** Replace formatShortDate with the list-row relative formatter vs refTime.
- _confiance : high_

#### `KAN-12` · P1 · layout — Done column streams all cards, no Show all N

- **Spec :** 12.3
- **Loc :** `KanbanColumn.tsx:84-98`
- **Actuel :** The body maps over all items for every state including Done, no cap or reveal link.
- **Attendu :** Done shows the first 2 cards plus a centered Show all N link in fgDim 11.5.
- **Fix :** Slice the done lane to 2 cards and append a centered Show all N toggle link.
- _confiance : high_

#### `KAN-13` · P1 · typography — Column label vocabulary wrong: Needs Human, Open, In Progress

- **Spec :** 6.7 9 EX-13
- **Loc :** `issueStateAccent.ts:17-23; KanbanColumn.tsx:68`
- **Actuel :** Labels are Open, In Progress, Needs Human two words, In Review, Done.
- **Attendu :** Always Needs you, and Linear names Backlog Todo In Progress In Review Done; Open is not a status.
- **Fix :** Centralize a labels map: needs to Needs you; replace Open with the Backlog Todo split.
- _confiance : high_

## Issue Detail — layout, topbar, body, right rail — 72/100

**Résumé.** The Issue Detail surface is structurally close to A3: the topbar cluster (Subscribe / copy-link / more / divider / primary Launch-new-run vs Re-launch), the inline ExecutionLog placement, the flat no-card property list, and the deprecated Tasks tile / ExecutionStatusCard removal are all correct per §13.2 and §13.5. The biggest remaining gaps are in the right rail's foundations: it is 320px wide instead of 308, painted on bg-canvas (void #0b0d0f) instead of bg-surface (#15181c) which violates the elevation contract (§13.1), and its padding (16/16/20) does not match the spec's 14/12. The PropRow geometry also diverges — it is a flex row with py-1.25 and no row-level hover affordance instead of the spec's grid 92px/1fr, padding 5 8, radius 5, min-height 28, cursor-pointer, hover:bg-raised. Two notable content-level mismatches: the Status row renders a bordered StatusChip pill instead of the spec's bare StatusIcon-13 + text (§13.4), and the description renders at 14px/leading-7 instead of 13.5px/line-height-1.65/max-w-720 (§13.3).

**Critiques UX :**

- The Status row regression (StatusChip pill in the rail) is the most visible Linear-fidelity break: in Linear the rail status is a flat icon+label that opens a picker on click, never a tinted pill. The pill reads as a 'badge' and fights the flat property list aesthetic the rest of the rail establishes. De-chipping it (RAIL-04) is the single highest-leverage fix for feeling Linear-faithful.
- The rail elevation bug (bg-canvas instead of bg-surface) is subtle on screen but breaks the whole 'left column is the void, rail floats one tier up' reading. With both panes on canvas, only the 1px border-left separates them, so the rail looks like a continuation of the body rather than a distinct affordance surface. Fixing the surface tier will make the rail feel intentional.
- PropRow currently has its hover/click affordance on an inner trigger span, not the whole row. That means the clickable target is narrower than the visual row and hover highlights only the value, not the full-width row — inconsistent with Linear where the entire 28px row is the hit target and the hover bg spans label+value. Converting PropertyRow to a full-width grid with row-level hover:bg-raised (RAIL-05) fixes both the geometry and the interaction model in one move.
- Description at 14px/leading-7 reads slightly large and airy versus the spec's 13.5/1.65 — combined with body text being fg-muted instead of fg, the description currently feels like secondary copy rather than the primary content of the page. Tightening to 13.5/1.65 in fg restores the 'this is the issue' weight.
- The asymmetric paddings (left column 20/28/32, rail 14/12) were clearly tuned in the artboard for optical balance; the code's symmetric normalizations (24 all around, 16/16/20) flatten that intent. These are individually small but cumulatively make the page feel like a generic dark dashboard rather than the hand-tuned Linear clone.
- Done-state CTA: keeping the Re-launch button primary makes a closed issue still scream 'do this' — demoting it to secondary (TOPBAR-02) better communicates that the issue is finished and re-running is a deliberate, lower-priority action. Worth confirming against detail-done artboard which the spec says should be the secondary variant.

**Écarts (18) :**

#### `RAIL-01` · P1 · geometry — Right rail width is 320px, spec requires 308px

- **Spec :** §13.1 (Right: width 308)
- **Loc :** `ui/src/components/issue-detail/IssueDetailRail.tsx:15`
- **Actuel :** className includes w-[320px]
- **Attendu :** Rail fixed width is 308px, not 320px
- **Fix :** Change w-[320px] to w-[308px]
- _confiance : high_

#### `RAIL-02` · P0 · elevation — Right rail painted on void (bg-canvas) instead of surface — wrong elevation tier

- **Spec :** §13.1 (Right: bg surface) / §0.2 four-tier elevation
- **Loc :** `ui/src/components/issue-detail/IssueDetailRail.tsx:15`
- **Actuel :** bg-canvas on the aside (canvas token = #0b0d0f = --sk-void)
- **Attendu :** Rail background is --sk-surface (#15181c). The left column sits on void/canvas; the rail is one tier up on surface, separated by the border-left.
- **Fix :** Change bg-canvas to bg-surface on the <aside>
- _confiance : high_

#### `RAIL-03` · P2 · spacing — Rail inner padding 16/16/20 instead of 14/12

- **Spec :** §13.1 (Right: padding 14 12)
- **Loc :** `ui/src/components/issue-detail/IssueDetailRail.tsx:17`
- **Actuel :** px-4 pt-4 pb-5 (16px sides, 16px top, 20px bottom)
- **Attendu :** Vertical padding 14px, horizontal padding 12px (symmetric 14 12)
- **Fix :** Replace px-4 pt-4 pb-5 with px-3 py-3.5 (12px horizontal, 14px vertical)
- _confiance : high_

#### `RAIL-04` · P1 · iconography — Status property renders a StatusChip pill instead of bare StatusIcon + text

- **Spec :** §13.4 (Status  <StatusIcon 13> <text 12.5 fg>)
- **Loc :** `ui/src/components/issue-detail/properties/StatusRow.tsx:44; ui/src/components/issue-detail/StatusChip.tsx:8-21`
- **Actuel :** StatusRow renders <StatusChip> — a bordered/tinted pill (h-5, rounded-md border, color-mix bg + border, StatusIcon 12 + name)
- **Attendu :** Rail Status row is a flat StatusIcon at size 13 followed by plain text at 12.5px in fg color — no pill chrome, no border, no tinted background (§13.4). The StatusChip pill is a list/table affordance, not the rail.
- **Fix :** In StatusRow, replace <StatusChip status={issue.status} /> with an inline-flex span: <StatusIcon kind={statusIconKindFor(issue.status)} size={13} color={issue.status.color} /> + <span class="text-[12.5px] text-fg">{issue.status.name}</span>
- _confiance : high_

#### `RAIL-05` · P1 · geometry — PropRow is a flex row (py-1.25, no row hover) instead of grid 92/1fr radius5 min-h28 hover:bg-raised

- **Spec :** §13.4 (PropRow: grid 92px 1fr / gap 8 / padding 5 8 / radius 5 / min-height 28 / cursor pointer)
- **Loc :** `ui/src/components/issue-detail/properties/PropertyRow.tsx:9-14`
- **Actuel :** div is flex min-h-7 items-start gap-3 py-1.25; label w-23 pt-0.5; the whole row has no radius, no padding-x, no cursor-pointer, no hover background — hover/click affordance lives only on the inner PROPERTY_ROW_TRIGGER span
- **Attendu :** PropRow itself is a CSS grid template-columns 92px 1fr, gap 8px, padding 5px 8px, border-radius 5px, min-height 28px, cursor-pointer, and hover:bg-raised on the whole row (rows are click-to-edit affordances spanning the full width).
- **Fix :** Make PropertyRow a grid: className="grid grid-cols-[92px_1fr] items-center gap-2 rounded-[5px] px-2 py-1.25 min-h-7 cursor-pointer transition-colors hover:bg-raised". Move the editable trigger to span the value cell (or drop PROPERTY_ROW_TRIGGER's own bg and let the row carry hover). gap-2=8px, px-2=8px, py-1.25=5px, min-h-7=28px, rounded-[5px]=5px.
- _confiance : high_

#### `RAIL-06` · P2 · typography — PROPERTIES eyebrow letter-spacing is 0.16em, spec is 0.8px

- **Spec :** §13.4 (Eyebrow: fontSize 10.5 / weight 600 / 0.8 letter / uppercase / fgDim)
- **Loc :** `ui/src/components/issue-detail/IssueDetailRail.tsx:18-19`
- **Actuel :** tracking-[0.16em] font-medium (font-weight 500), font-size 10.5px
- **Attendu :** letter-spacing 0.8px (at 10.5px that is ~0.076em, far tighter than 0.16em), font-weight 600
- **Fix :** Change tracking-[0.16em] to tracking-[0.8px] and font-medium to font-semibold
- _confiance : high_

#### `RAIL-07` · P2 · spacing — Eyebrow padding doesn't match spec 2 8 6

- **Spec :** §13.4 (Eyebrow: padding 2 8 6)
- **Loc :** `ui/src/components/issue-detail/IssueDetailRail.tsx:18`
- **Actuel :** mb-1 only (no horizontal padding, 4px bottom margin)
- **Attendu :** padding 2px top / 8px sides / 6px bottom so the eyebrow aligns with the 8px PropRow horizontal padding
- **Fix :** Replace mb-1 with px-2 pt-0.5 pb-1.5 (8px x, 2px top, 6px bottom)
- _confiance : medium_

#### `RAIL-08` · P2 · border — PropDivider margin and color: code divider uses my-2 inside block, footer divider differs from spec PropDivider (margin 8 0)

- **Spec :** §13.4 (PropDivider: height 1 / bg --sk-border / margin 8 0)
- **Loc :** `ui/src/components/issue-detail/IssuePropertiesBlock.tsx:24,33; ui/src/components/issue-detail/IssueDetailRail.tsx:22`
- **Actuel :** In-block dividers use my-2 border-t border-border (8px margin ✓). Footer separator uses mt-5 border-t pt-3 (20px top gap, 12px pad) instead of a PropDivider with 8px symmetric margin
- **Attendu :** All section separators are PropDividers: 1px, --sk-border, margin 8px 0. The footer block is preceded by a standard PropDivider (8 0), then the footer text block at padding 4 8.
- **Fix :** Replace mt-5 ... pt-3 footer wrapper: insert a <div className="my-2 border-t border-border" /> divider, then a footer block with px-2 py-1 text-[11px] leading-[1.6] text-fg-dim
- _confiance : medium_

#### `DESC-01` · P1 · typography — Description renders at 14px / leading-7 instead of 13.5px / line-height 1.65

- **Spec :** §13.3.1 (Description fontSize 13.5, color fg, line-height 1.65, max-width 720)
- **Loc :** `ui/src/components/issue-detail/properties/EditableDescription.tsx:68`
- **Actuel :** IssueMarkdown className="text-[14px] leading-7" (14px, line-height 28px ≈ 2.0)
- **Attendu :** font-size 13.5px, line-height 1.65 (≈22.3px), color fg
- **Fix :** Change className to text-[13.5px] leading-[1.65] text-fg
- _confiance : high_

#### `DESC-02` · P2 · color — Description body paragraphs use fg-muted instead of fg

- **Spec :** §13.3.1 (Description … color fg)
- **Loc :** `ui/src/components/issue-detail/IssueMarkdown.tsx:66`
- **Actuel :** paragraph blocks rendered with text-fg-muted (#9aa0a8)
- **Attendu :** Description copy is fg (#e7e9ec) per §13.3.1; muted is for secondary/metadata, not the primary issue description body
- **Fix :** For the description context, paragraphs should inherit text-fg. Either pass a body-tone variant to IssueMarkdown or set the wrapper to text-fg and stop forcing text-fg-muted on <p> blocks.
- _confiance : medium_

#### `LEFT-01` · P2 · spacing — Left column padding is symmetric 24 (px-6 py-6) instead of 20 28 32

- **Spec :** §13.1 (Left: padding 20 28 32)
- **Loc :** `ui/src/components/issue-detail/IssueDetail.tsx:96`
- **Actuel :** px-6 py-6 (24px all sides)
- **Attendu :** padding-top 20px, padding-left/right 28px, padding-bottom 32px (asymmetric)
- **Fix :** Replace px-6 py-6 with pt-5 px-7 pb-8 (20 top, 28 sides, 32 bottom)
- _confiance : high_

#### `LEFT-02` · P2 · spacing — Left column content gap is 20 (gap-5) instead of 22

- **Spec :** §13.1 (Left: gap 22)
- **Loc :** `ui/src/components/issue-detail/IssueDetail.tsx:96`
- **Actuel :** gap-5 (20px) between stacked sections
- **Attendu :** gap 22px between description / ExecutionLog / sub-issues / activity
- **Fix :** Replace gap-5 with gap-[22px]
- _confiance : high_

#### `PROP-01` · P2 · typography — Property label color/size: spec rail value text is 12.5 fg; label sizing inconsistent with value

- **Spec :** §13.4 (PropRow values text 12.5 fg; label column 92px)
- **Loc :** `ui/src/components/issue-detail/properties/PropertyRow.tsx:11-12`
- **Actuel :** label span text-[12px] text-fg-dim w-23 pt-0.5; value div text-[12.5px] leading-5 text-fg
- **Attendu :** Value text is 12.5/fg (✓). Label is the 92px (w-23) left column, fg-dim — but with the grid fix the pt-0.5 nudge and items-start should become items-center so icon+label align on the row baseline
- **Fix :** Once converted to grid (see RAIL-05), drop pt-0.5 and items-start; use items-center so the 92px label and value cell are vertically centered within the 28px row
- _confiance : medium_

#### `PROP-02` · P2 · iconography — Property icon sizes are 12 in rail rows; spec specifies 13 for Status and Priority glyphs

- **Spec :** §13.4 (Status <StatusIcon 13>, Priority <PriorityIcon 13>)
- **Loc :** `ui/src/components/issue-detail/properties/PriorityRow.tsx:42; ui/src/components/issue-detail/StatusChip.tsx:18`
- **Actuel :** PriorityIcon size={12}; StatusIcon size={12} (inside chip)
- **Attendu :** Status and Priority glyphs in the rail are size 13
- **Fix :** Set PriorityIcon size={13} in PriorityRow; set StatusIcon size={13} once StatusRow is de-chipped (RAIL-04)
- _confiance : high_

#### `PROP-03` · P2 · typography — Estimate row shows em-dash placeholder + 'points' even when empty; spec shows EstimateChip n + 'points' (11.5 fgDim)

- **Spec :** §13.4 (Estimate <EstimateChip n> + 'points' 11.5 fgDim)
- **Loc :** `ui/src/components/issue-detail/properties/EstimateRow.tsx:34-37`
- **Actuel :** chip renders '—' when null and always shows 'points'; 'points' label has no explicit size (inherits 12.5)
- **Attendu :** 'points' suffix is 11.5px fg-dim; when estimate is null the affordance should read as empty/'No estimate' rather than an em-dash chip followed by 'points'
- **Fix :** Set the 'points' suffix to text-[11.5px] text-fg-dim; when issue.estimate is null render a 'No estimate' fg-dim placeholder instead of '—' + 'points'
- _confiance : medium_

#### `TOPBAR-01` · P2 · geometry — Topbar vertical divider is h-6 (24px); spec says 18px

- **Spec :** §13.2 (vertical divider 1×18 border, margin 0 4)
- **Loc :** `ui/src/components/issue-detail/IssueDetailTopbarRight.tsx:68`
- **Actuel :** div className="mx-1 h-6 w-px bg-border" (24px tall, 4px margin)
- **Attendu :** divider 1px wide × 18px tall, margin 0 4px
- **Fix :** Change h-6 to h-[18px] (keep mx-1 = 4px)
- _confiance : high_

#### `TOPBAR-02` · P2 · state — Re-launch (done state) uses primary button + RefreshCw; spec says secondary button with loop icon

- **Spec :** §13.2 (primary zap 'Launch new run' for running/needs/idle OR secondary loop 'Re-launch' for done)
- **Loc :** `ui/src/components/issue-detail/IssueDetailTopbarRight.tsx:31,69`
- **Actuel :** Btn kind='primary' always; done state swaps icon to RefreshCw but keeps primary styling
- **Attendu :** When isDone, the launch button is the secondary (raised) variant, not primary, and uses a loop icon — distinguishing 'this issue is closed, re-running is a secondary action' from the primary launch CTA
- **Fix :** Make kind={isDone ? 'secondary' : 'primary'}; RefreshCw is an acceptable loop glyph but ensure the secondary tone is applied in the done state
- _confiance : medium_

#### `TOPBAR-03` · P2 · iconography — Subscribe button label 'Subscribe' vs spec affordance — copy icon-only button uses link icon, spec says copy icon

- **Spec :** §13.2 (ghost sm icon=star 'Subscribe'; ghost sm icon=copy icon-only)
- **Loc :** `ui/src/components/issue-detail/IssueDetailTopbarRight.tsx:42-53`
- **Actuel :** Star icon + 'Subscribe' text (✓ label); the icon-only ghost uses a Link (chain) icon to copy the URL
- **Attendu :** Spec describes the second ghost as icon=copy. Current uses a link/chain icon (LinkIcon) for 'Copy link'. The glyph differs from the spec's copy glyph; verify against the artboard which icon the second slot uses.
- **Fix :** If matching spec literally, swap LinkIcon for a Copy icon in the icon-only ghost; otherwise confirm artboard intent (copy-link as a chain icon is a reasonable UX but diverges from the stated 'copy' glyph)
- _confiance : low_

## Inline ExecutionLog + NeedsBanner + PhaseStrip + ExecSections (issue detail) — 48/100

**Résumé.** The ExecutionLog skeleton is present (header, state chip, phase strip, needs banner, worktree, past runs) and the decision controls correctly live inline on the issue rather than in the drawer — the most important architecture rule is honored. But the surface is far from drop-for-drop. Two whole §17 sub-sections are missing entirely: Recent activity (§17.5 ExecRow ribbon) and Files changed (§17.6 ExecFileRow stacked bars). The card's elevation is inverted/flattened (the whole section is painted `bg-canvas`/void instead of surface, and the header has no distinct void band), the outer radius is 6px instead of 10px, the NeedsBanner is rendered as an inset rounded card with an all-around border instead of a full-bleed warn-tinted banner with only a bottom border, the Approve button is warn-colored instead of primary/accent, and the PhaseStrip discs/connectors drift from the §17.4 spec (solid accent active disc instead of info-tint + pulsing ring, flat 1px border connectors instead of gradient). The biggest gap is the two missing sections plus the void/surface elevation inversion — together they make the section read as a flat block on the page floor rather than the layered "crown jewel" card in A3.

**Critiques UX :**

- Decisions-on-the-issue is correctly honored: Approve/Reject/Comment live in NeedsBanner on the issue, and the drawer Open-run only navigates — this satisfies the §17.3 P0 architecture rule. Don't regress this when refactoring.
- The two missing sections (Recent activity + Files changed) are the heart of A3's 'crown jewel'. Without them the inline log answers 'is it running / does it need me' but not 'what did the agent actually do' — which is the whole point of putting execution on the issue instead of a separate page. Prioritize EXEC-01/EXEC-02 above the cosmetic disc/connector fixes.
- Past runs collapse to a plain text 'Show N past runs' link rather than the §17 ExecSection 'PAST RUNS · 2' eyebrow with chevron. It works but reads as an afterthought vs the consistent uppercase-eyebrow rhythm the rest of A3 uses — fold it into the shared ExecSection shell for visual consistency across all four sub-sections.
- The Pill atom hard-codes a tone palette that includes non-spec tones (mineral/oxide/gold/cyan/violet/live) alongside the semantic ones. For the exec-log state chip the bordered sm Pill is the wrong primitive entirely (it adds a perimeter border and is 24px, not the borderless 19px chip the artboard uses). Consider a dedicated borderless StateChip so the header chip and the per-row badges stay faithful.
- derivePhases throws away the per-phase meta ('2 steps', '4 of 7', 'paused at 4', 'shipped') that the artboard shows next to each phase label. Even if the live data only has step counts, wiring '· N of M' would make the strip far more informative and match the mock — right now the strip is just three discs and labels with no progress context.
- Elapsed time updates via useNow (good — it ticks), but the header packs agent + model + elapsed into a flex-wrap row that will collapse awkwardly at the 308px-rail-constrained left column on narrow viewports. Consider truncating the model label before wrapping the whole meta cluster under the chip.
- The idle state Launch button links to /tasks/new — but §0 foundation 5 says Tasks aren't a primary surface and shouldn't have their own page nav. A /tasks/new route is arguably an extra surface; verify this is an intentional escape hatch and not a leftover from the deprecated Task-page pattern (it should ideally open a launch dialog/drawer, not navigate to a Tasks page).

**Écarts (19) :**

#### `EXEC-01` · P0 · architecture — Recent activity section (§17.5) is entirely missing

- **Spec :** §17.5 Recent activity (ExecSection + ExecRow) / artboard detail-running/needs/done
- **Loc :** `ui/src/components/issue-detail/execution-log/ExecutionLog.tsx:27-45`
- **Actuel :** ExecutionLog renders Header, NeedsBanner, PhaseStrip, WorktreeMini (done only), PastRunsSection. There is no RECENT ACTIVITY ExecSection and no ExecRow component exists anywhere in the codebase.
- **Attendu :** An ExecSection titled 'RECENT ACTIVITY' (10.5/600 uppercase 0.9 fgDim eyebrow, chevDown 11 fgDim, '· N events' meta, ghost-sm 'All in drawer' action with arrowRight) wrapping 3-5 ExecRows. Each ExecRow: 14px round dot border 1.5px palette.c, icon 7 stroke 2, +3px pulse ring if active; title flex-1 12.5 ellipsis fgMuted/fg; optional Pill badge; mono 11 fgDim meta min-width 50 right. Palette per kind (plan→fgMuted/layers, tool→info/terminal, edit→accent/doc, test→success/check, pr→success/pr, ask/stuck→warn, done→success).
- **Fix :** Build ExecSection + ExecRow components and render the latest 3-5 step/activity events between PhaseStrip and Files changed, mirroring the artboard 8340642f.js ExecRow palette table and ExecSection shell (padding 12 16, gap 10, border-top 1px border).
- _confiance : high_

#### `EXEC-02` · P0 · architecture — Files changed section (§17.6) is entirely missing

- **Spec :** §17.6 Files changed (ExecSection + ExecFileRow)
- **Loc :** `ui/src/components/issue-detail/execution-log/ExecutionLog.tsx:27-45`
- **Actuel :** No FILES CHANGED ExecSection and no ExecFileRow component. Diff info only appears (if at all) inside the drawer; the inline section has no file list or stacked +/- bars.
- **Attendu :** ExecSection titled 'FILES CHANGED' · '· N files', action ghost-sm icon=external 'Diff'. Body col gap 7. Each ExecFileRow: doc icon 11 fgDim, mono path 11 fg (accent if active edit) ellipsis, mini stacked bar width 56 h 4 radius 999 [adds% success | dels% danger], '+N' mono 10.5 success min-width 22 right, '−N' mono 10.5 danger min-width 22 right.
- **Fix :** Add ExecFileRow + a FILES CHANGED ExecSection rendered from run/diff file stats, geometry per artboard ExecFileRow (lines 127-148 of 8340642f.js).
- _confiance : high_

#### `EXEC-03` · P0 · elevation — Card elevation inverted: outer is void, header has no void band

- **Spec :** §17.1 outer bg --sk-surface; §17.2 header bg --sk-void; §3 four-tier elevation
- **Loc :** `ui/src/components/issue-detail/execution-log/ExecutionLog.tsx:30; ExecutionLogHeader.tsx:92-93`
- **Actuel :** Outer <section> uses bg-canvas (--color-canvas = #0b0d0f = void). The header (<header> at ExecutionLogHeader.tsx:92) sets no background, so it inherits the void outer. The whole section is one flat void block sitting on the void page floor (IssueDetail.tsx:94 page is also bg-canvas), giving zero elevation separation.
- **Attendu :** Outer card = --sk-surface (#15181c, bg-surface) so it lifts off the void page; header = --sk-void (#0b0d0f, bg-canvas) as a distinct darker band with border-bottom 1px border. Two visible tiers (surface card with void header strip).
- **Fix :** Change ExecutionLog outer to bg-surface; give the header its own bg-canvas + border-b border-border (header should be a full-width band with px-4 py-3, not just a flex-wrap row inside the padded section). Remove the section-level px-3.5 py-3 from the outer so the header bleeds edge-to-edge.
- _confiance : high_

#### `EXEC-04` · P1 · radius — Outer radius is 6px, spec requires 10px

- **Spec :** §17.1 border-radius 10 / §4.2 r-lg=10 (ExecutionLog outer)
- **Loc :** `ui/src/components/issue-detail/execution-log/ExecutionLog.tsx:30 (rounded-md); ExecutionLogLoading.tsx:7; ExecutionLogIdle.tsx:13`
- **Actuel :** rounded-md → 6px on all three outer containers (active, loading, idle).
- **Attendu :** 10px radius. Tailwind rounded-lg is 8 and rounded-xl is 12 — neither is 10, so an explicit value is required.
- **Fix :** Use rounded-[10px] on the ExecutionLog, ExecutionLogLoading and ExecutionLogIdle outer containers.
- _confiance : high_

#### `EXEC-05` · P0 · geometry — NeedsBanner is an inset rounded card, not a full-bleed warn band

- **Spec :** §17.3 padding 10 14, bg color-mix(warn 10%, surface), border-bottom 1px color-mix(warn 30%, border) — no all-around border, no radius
- **Loc :** `ui/src/components/issue-detail/execution-log/NeedsBanner.tsx:35-39`
- **Actuel :** Rendered as a separate rounded card: className 'rounded-md border border-warn/40 bg-warn-soft/60 px-3 py-2' — full perimeter border, 6px radius, sitting inside the section's gap-3 column with its own margins.
- **Attendu :** Full-width banner directly under the header: bg color-mix(in srgb, var(--sk-warn) 10%, var(--sk-surface)), border-bottom only (1px color-mix(warn 30%, border)), padding 10px 14px, no radius, no top/side border. It is a band spanning the card, not an inset chip.
- **Fix :** Render NeedsBanner as a full-bleed div (no rounded, no perimeter border): border-b border-[color-mix(in_srgb,var(--color-warn)_30%,var(--color-border))], bg-[color-mix(in_srgb,var(--color-warn)_10%,var(--color-surface))], px-3.5 py-2.5. This also depends on EXEC-03 making the section edge-to-edge.
- _confiance : high_

#### `EXEC-06` · P1 · color — Approve button is warn-colored, spec requires primary/accent

- **Spec :** §17.3 primary sm icon=check 'Approve' / artboard <Btn kind="primary">Approve
- **Loc :** `ui/src/components/issue-detail/execution-log/NeedsBanner.tsx:46-54`
- **Actuel :** Approve button uses bg-warn text-white (warn/gold fill). Reject uses border-border bg-surface (secondary, correct). Comment uses ghost (correct).
- **Attendu :** Approve = primary Btn: bg --sk-accent (#5b6ef2), color #fff, transparent border. Reject = secondary (raised bg + border). Comment = ghost. Only the primary action carries accent here.
- **Fix :** Change Approve to bg-accent (white text) and its focus ring to ring-accent/40 to match the primary Btn kind.
- _confiance : high_

#### `EXEC-07` · P1 · state — PhaseStrip active disc is solid accent, spec wants info-tint fill + 6px dot + pulsing ring

- **Spec :** §17.4 active: border+bg color (info at 22% mix), 6px solid dot, + pulsing 3px ring (sk-pulse)
- **Loc :** `ui/src/components/issue-detail/execution-log/PhaseDisc.tsx:13-17,30-31`
- **Actuel :** active disc = 'border-transparent bg-accent text-white' with a white 6px dot (size-1.5). It is a solid cobalt-accent disc, no pulse ring, and uses accent rather than info as its tone.
- **Attendu :** active = info-toned: border 1.5px --sk-info, bg color-mix(info 22%), a 6px info-colored solid dot, plus a +3px outer ring via sk-pulse animation (inset -2, box-shadow 0 0 0 3px info/1f). The 'in progress' phase color is info, not accent.
- **Fix :** Set active STATUS_CLASS to border-info bg-[color-mix(in_srgb,var(--color-info)_22%,transparent)] text-info; make the active glyph a 6px info dot (bg-info) and add an absolutely-positioned pulsing ring span (animate-[sk-pulse_1.6s_ease-out_infinite]).
- _confiance : high_

#### `EXEC-08` · P2 · geometry — PhaseStrip connectors are flat 1px border, spec wants 1.5px gradient between tones

- **Spec :** §17.4 connector flex 1 min-width 24 height 1.5 margin 0 12; pending→solid border, else linear-gradient(currentTone→nextTone) opacity 0.7
- **Loc :** `ui/src/components/issue-detail/execution-log/PhaseStrip.tsx:20-22`
- **Actuel :** Connector is 'h-px flex-1 bg-border' — 1px tall, always solid --sk-border, no gradient, no min-width 24, gap-2 (8px) between disc and connector instead of margin 0 12 (12px).
- **Attendu :** 1.5px tall, min-width 24, margin 0 12; solid --sk-border only when the NEXT phase is pending; otherwise a left-to-right gradient from the current phase tone to the next phase tone at opacity 0.7.
- **Fix :** Make connector h-[1.5px] min-w-6 mx-3; compute background: when next phase pending use bg-border, else a linear-gradient(to right, <toneColor>, <nextToneColor>) with opacity-70. Pass phase tones into PhaseStrip.
- _confiance : high_

#### `EXEC-09` · P2 · color — Done phase disc border uses /50 alpha but bg should be 20% color-mix

- **Spec :** §17.4 done: border + bg color (success at 20% mix), check icon 10
- **Loc :** `ui/src/components/issue-detail/execution-log/PhaseDisc.tsx:12,28; PhaseStrip artboard 8340642f.js:36-37,41`
- **Actuel :** done = 'border-success/50 bg-success-soft text-success' (success-soft = rgba(78,166,116,0.13)); check icon size 11 stroke 2.4.
- **Attendu :** Artboard uses bg = c+'20' (≈ success at 12.5% on top of a solid border at full success color, not /50) and check icon size 10 strokeWidth 2.5. The disc border is full-strength tone, not 50% alpha.
- **Fix :** Set done to border-success (full) bg-[color-mix(in_srgb,var(--color-success)_20%,transparent)]; render Check at size 10 strokeWidth 2.5. Apply the same full-strength border + 20-22% bg pattern to paused (warn) and failed (danger).
- _confiance : medium_

#### `EXEC-10` · P1 · typography — Header zap icon and 'Execution' label undersized (12px vs 14/13)

- **Spec :** §17.2 Icon zap 14 accent; 'Execution' 13/600 fg; §5.1 execution-log header icon = 13
- **Loc :** `ui/src/components/issue-detail/execution-log/ExecutionLogHeader.tsx:94-96`
- **Actuel :** Zap size={12}; 'Execution' wrapped in text-[12.5px] font-medium (500).
- **Attendu :** Zap 14px accent (header glyph), 'Execution' 13px weight 600 fg.
- **Fix :** Zap size={14}; change the label span to text-[13px] font-semibold text-fg (drop the wrapping inline-flex's 12.5/medium).
- _confiance : high_

#### `EXEC-11` · P1 · geometry — State chip rendered as Pill (h-24, border) instead of bare 19px tone-soft chip

- **Spec :** §17.2 State chip: gap 6, padding 0 7, height 19, radius 4, bg toneSoft, color tone, 11/500, Dot size 6 pulse
- **Loc :** `ui/src/components/issue-detail/execution-log/ExecutionLogHeader.tsx:98-100; ui/src/components/ui/pill.tsx:27`
- **Actuel :** Uses Pill tone size='sm' which is h-6 (24px), rounded-md (6px), and adds a 'border border-{tone}/30' perimeter. Artboard chip has NO border, height 19, radius 4.
- **Attendu :** Height 19px, radius 4px, padding 0 7px, bg var(--sk-{tone}Soft), color var(--sk-{tone}), font 11/500, leading 6px Dot (pulse when not done), and no border.
- **Fix :** Either add a borderless 19px chip variant or render a dedicated span: h-[19px] rounded px-[7px] gap-1.5 text-[11px] font-medium bg-{tone}-soft text-{tone} with a Dot size 6. Don't reuse the bordered Pill sm here.
- _confiance : high_

#### `EXEC-12` · P1 · color — Header agent avatar uses accent-soft instead of the fixed fix-bot color #3a6f4e

- **Spec :** §17.2 Agent meta <Avatar 14 #3a6f4e icon=bot>; §6.3 per-agent colors are fixed, fix-bot=#3a6f4e
- **Loc :** `ui/src/components/issue-detail/execution-log/ExecutionLogHeader.tsx:64-69`
- **Actuel :** Bot avatar is a 16px (size-4) disc with bg-accent-soft text-accent. It's accent-tinted and is size-4 (16px) not 14px.
- **Attendu :** 14px disc filled with the agent's fixed hue (fix-bot = #3a6f4e green, per-agent map), white bot icon at ~size*0.55. Not accent-soft.
- **Fix :** Render the bot avatar at 14px with a per-agent background color resolved from the agent-color map (fallback to an orchestrator-assigned hue, never accent-soft and never a hash). Match the <Avatar> atom §6.3.
- _confiance : medium_

#### `EXEC-13` · P2 · typography — Header agent name color/weight inverted (name should be fg/500, model fgDim)

- **Spec :** §17.2 'fix-bot' 11.5 fg/500, '· sonnet-4.5' 11.5 fgDim
- **Loc :** `ui/src/components/issue-detail/execution-log/ExecutionLogHeader.tsx:70,78`
- **Actuel :** Agent name span is text-[11.5px] text-fg-muted (muted, weight 400); model span is text-[11.5px] text-fg-muted (also muted).
- **Attendu :** Agent name = fg, weight 500. Model = fgDim. (The name should read as primary, the model dimmer.)
- **Fix :** Agent name: text-fg font-medium. Model: text-fg-dim. Both 11.5px.
- _confiance : high_

#### `EXEC-14` · P2 · iconography — 'Open run' button shows trailing arrow + has a transparent border, spec wants leading external icon

- **Spec :** §17.2 <Btn ghost sm icon=external>Open run</Btn>
- **Loc :** `ui/src/components/issue-detail/execution-log/ExecutionLogHeader.tsx:107-114`
- **Actuel :** Button text is 'Open run →' (literal arrow glyph in text, no icon component) with 'border border-transparent'. No leading external icon.
- **Attendu :** Ghost sm Btn with a LEADING external (open-in-new) icon size 13 and label 'Open run', no decorative trailing arrow.
- **Fix :** Replace the '→' text with a leading <ExternalLink size={13}/> icon (lucide), label 'Open run'; keep ghost styling (fgMuted, hover bg-raised).
- _confiance : medium_

#### `EXEC-15` · P2 · typography — PhaseStrip pending index uses size-2.5px-ish font and bg is transparent but disc bg for non-pending uses *-soft tokens not 20% mix; meta '· N' line not rendered

- **Spec :** §17.4 pending: mono index 9.5; label 12 weight 500 (600 active/paused); meta '· 4 of 7' 11 fgDim
- **Loc :** `ui/src/components/issue-detail/execution-log/PhaseDisc.tsx:32,51; PhaseStrip.tsx (no meta passed)`
- **Actuel :** Pending index is font-data text-[10px] (spec 9.5). Phase label is text-[12px] text-fg with no weight change for active/paused (spec: 500 default, 600 when active/paused). No phase meta ('2 steps', '4 of 7') is rendered at all — derivePhases only returns kind+status, dropping the meta the artboard shows.
- **Attendu :** Pending index 9.5px mono fgDim; label 12px weight 500, bumped to 600 when active or paused; pending label color fgMuted (others fg); trailing meta '· {meta}' 11px fgDim when present.
- **Fix :** Index text-[9.5px]; label font-medium with conditional font-semibold for active/paused and text-fg-muted for pending; thread a meta string through Phase and render '· {meta}' 11px fgDim after the label.
- _confiance : medium_

#### `EXEC-16` · P1 · layout — ExecutionLog uses gap-3 column instead of the bordered ExecSection rhythm

- **Spec :** §17.4/§17.5/§17.6 each block is an ExecSection: padding 12 16, gap 10, border-top 1px border; phases padding 14 16
- **Loc :** `ui/src/components/issue-detail/execution-log/ExecutionLog.tsx:30,41-43`
- **Actuel :** Section is a single flex-col gap-3 with px-3.5 py-3 padding; PhaseStrip, WorktreeMini and PastRunsSection are stacked with a uniform 12px gap and share the outer padding. There are no per-section border-top hairlines and no per-section eyebrow headers (PhaseStrip has none, Worktree has none, Past runs is a bare text toggle).
- **Attendu :** Header (void band) → optional NeedsBanner → Phases block (padding 14 16) → RECENT ACTIVITY ExecSection (border-top) → FILES CHANGED ExecSection (border-top) → WORKTREE ExecSection (border-top, eyebrow 'WORKTREE · HOW TO TEST') → PAST RUNS ExecSection (border-top, collapsed). Each separated by a 1px border-top, not a gap.
- **Fix :** Introduce an ExecSection shell (padding 12 16, gap 10, border-top border) with uppercase 10.5/600/0.9 eyebrow + chevron + meta + action, and wrap Worktree/Past runs (and the new Recent activity / Files changed) in it. Phases get their own padding-14-16 block with no border-top.
- _confiance : high_

#### `EXEC-17` · P2 · layout — WorktreeMini lacks eyebrow/section chrome and the spec's branch/sandbox/path/PR meta + action row

- **Spec :** §17 Worktree ExecSection: title 'Worktree · how to test', branch+sandbox+path+PR meta row, action ghost-sm more, action buttons (Open shell / Copy clone / Open in editor)
- **Loc :** `ui/src/components/issue-detail/execution-log/WorktreeMini.tsx:12-28`
- **Actuel :** Bare rounded-md surface card with branch (GitBranch), worktreePath (Folder) and a PR badge pushed right. No 'WORKTREE · HOW TO TEST' eyebrow, no sandbox chip, no Open-shell/Copy-clone/Open-in-editor action row.
- **Attendu :** An ExecSection titled 'WORKTREE · HOW TO TEST' with branch / sandbox / path / PR meta (each icon 11 fgDim + mono value) and a ghost-sm action row (Open shell / Copy clone command / Open in editor).
- **Fix :** Wrap worktree facts in the ExecSection shell; add the sandbox state chip and the three ghost-sm action buttons per artboard WorktreeMini (lines 178-211 of 8340642f.js). Drop the standalone rounded card chrome.
- _confiance : medium_

#### `EXEC-18` · P2 · iconography — Past runs row uses bordered 'Open' button + Pill, not the artboard TaskDot + arrowRight row

- **Spec :** §17 PastRunRow: TaskDot size 7, mono id 11.5 fg, Avatar 16 bot, label fgMuted flex-1, when mono 11 fgDim, trailing arrowRight 11
- **Loc :** `ui/src/components/issue-detail/execution-log/PastRunRow.tsx:21-44`
- **Actuel :** Row leads with a status Pill (xs) instead of a 7px TaskDot, shows no agent Avatar, and ends with a bordered 'Open ↗' button (border border-border bg-raised) rather than a plain trailing arrowRight glyph on a fully-clickable row.
- **Attendu :** Lead with <TaskDot state size=7>, then mono id 11.5 fg, Avatar 16 (bot), label fgMuted flex-1 ellipsis, when mono 11 fgDim, trailing arrowRight 11 fgDim. The whole row is the click target (cursor pointer), no inset button.
- **Fix :** Replace the Pill with TaskDot size=7, add the agent Avatar 16, make the entire row the clickable target opening the drawer, and replace the bordered button with a trailing ArrowRight 11 fgDim.
- _confiance : medium_

#### `EXEC-19` · P2 · state — NeedsBanner Approve/Reject focus rings use warn instead of accent/proper tone; Reject icon ok

- **Spec :** §6.5 Btn focus + §17.3 button kinds
- **Loc :** `ui/src/components/issue-detail/execution-log/NeedsBanner.tsx:50,59,67`
- **Actuel :** All three buttons use focus-visible:ring-warn/40. Approve is a primary action so its focus ring should follow the accent (after EXEC-06); ghost/secondary rings should be accent-based per the app's Btn convention.
- **Attendu :** Primary Approve focus ring accent/40; secondary/ghost focus rings accent/40 (matching Btn atom), not warn.
- **Fix :** Switch focus-visible:ring-warn/40 to ring-accent/40 on the three banner buttons once Approve is primary.
- _confiance : low_

## Comments + activity timeline + composer + sub-issues card (issue detail Activity feed) — 58/100

**Résumé.** The activity feed is structurally functional and wires real Linear data (comments, history, run events) faithfully, but it diverges from the spec's two distinct anatomies in §15/§16. The biggest gap is architectural: every feed item — comments AND events — is rendered through one shared ActivityNode that draws a vertical connector line and a 22px tinted-soft disc. That is the run-page TimelineEvent shape; the spec explicitly forbids it on the issue page (§16: "circle 26 bordered icon (NOT the run-page dot+connector)"). The comment card also loses its in-card header (name/pill/time live outside the card in the shared node), the avatar is 20px instead of 26, the disc uses semantic soft fills instead of bg-surface+border, and there is no "agent" provenance pill anywhere. Sub-issues card is the closest to spec (denser 30px rows, 80x5 success progress bar) but its outer surface is painted on void (bg-canvas) instead of surface and uses the wrong radius. The composer is largely correct (radius10, avatar20, attach icons, Cmd+Enter Kbd, primary Comment) with minor padding asymmetries.

**Critiques UX :**

- The single shared ActivityNode trying to serve both comment cards and timeline events is the root cause of most parity drift here. COMPONENT_MAPPING/CW-02 explicitly warns not to unify these — the issue page wants a self-contained Comment card (in-card header) and a separate lightweight TimelineEvent (26px bordered circle, no connector). Splitting ActivityNode into IssueCommentCard + IssueTimelineEvent would resolve TL-01, TL-02, CMT-01, CMT-03 and CMT-04 in one refactor and stop the two anatomies from fighting.
- The connector line currently drawn behind every node makes the issue feed look like a run execution log. To a user this blurs the distinction the design works hard to make: human conversation (cards) vs. system bookkeeping (events). Removing the connector and giving comments real card chrome will immediately make the feed read as 'Linear-faithful' rather than 'CI timeline'.
- CommentBody supports nested threaded replies (children → CommentReply), but Linear (and this spec) treats comments as a flat list — there's no threaded-reply anatomy in §15. If the Linear data never returns children this is dead code; if it does, the nested left-border thread is an un-specced visual the spec would currently hide per the 2026-05-25 alignment decision. Worth confirming and either removing or routing through IMPLEMENTATION_EXTRAS.
- There are two mono fonts in play: tokens.css --font-mono is JetBrains Mono (what the spec wants for tabular data), but the .font-data utility used throughout this surface (IDs, counts, timestamps) is DM Mono. It's app-wide, not unique to this surface, but every count/ID/timestamp here renders in the 'wrong' mono per §1. Worth a global fix so counts get the tnum/ss01 feel the spec specifies.
- The Activity header has a 'Newest first' sort affordance in §13.3 (text + chevDown) that the current IssueFeed header omits entirely — it only shows the comment/event count. Even as a non-functional affordance it's part of the contract; its absence makes the header feel unfinished next to the mockup.
- bg-canvas is being used as if it were 'surface' in ChildIssues, but canvas = void (#0b0d0f). This same confusion (canvas vs surface naming) is an easy trap across the codebase; a card floor should never be void. Renaming or aliasing the token to make 'void' explicit would prevent recurrence.
- The composer's disabled attach buttons (link/doc/terminal are permanently disabled) read as scaffolding. Per the orchestrator handoff the composer should look production-ready; permanently-disabled toolbar icons with no tooltip explaining why undercut that. Either wire them or hide them until they do something, rather than showing three dead controls.

**Écarts (17) :**

#### `TL-01` · P0 · architecture — Timeline events use run-page connector line + dot instead of issue-page bordered 26px circle

- **Spec :** §16 Activity timeline event (issue page)
- **Loc :** `ui/src/components/issue-detail/ActivityNode.tsx:62-69`
- **Actuel :** ActivityNode renders a vertical connector hairline (absolute top-7 bottom-0 left-2.5 w-px bg-border) behind every node, the run-page "dot + connector line" shape. §16 explicitly names this as the WRONG variant for the issue page.
- **Attendu :** Issue-page TimelineEvent is `row, gap 10, padding-left 2` with a 26x26 / radius 999 circle, bg --sk-surface, border 1px --sk-border, centered icon size 12 — and NO connector line. The connector belongs only to the run-page TimelineEvent (§17/§18/§19).
- **Fix :** Remove the `connect`/connector span entirely for the issue feed. Render the disc as a 26px circle: `inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-surface border border-border` with the icon at `size={12}` colored by role (text-fg-dim default), dropping the soft-fill tints.
- _confiance : high_

#### `TL-02` · P1 · geometry — Event/comment disc is 22px with semantic soft-fill background, not 26px surface+border

- **Spec :** §16 (circle 26x26 bg surface border) / §15.1 (Avatar 26)
- **Loc :** `ui/src/components/issue-detail/ActivityNode.tsx:38-48`
- **Actuel :** DefaultDisc is `h-5.5 w-5.5` (22px) with DISC_TONE soft fills (bg-success-soft/bg-warn-soft/bg-info-soft/bg-accent-soft etc.) and icon size 12 strokeWidth 1.9.
- **Attendu :** 26x26 circle, bg --sk-surface, border 1px --sk-border, icon size 12 colored from the `color`/role prop (the GLYPH carries the color, not a filled colored background — §5.4 forbids filled colored backgrounds behind glyphs).
- **Fix :** Set `h-[26px] w-[26px]`, replace `${DISC_TONE[role]}` background with `bg-surface border border-border` and apply the role color to the icon only (e.g. `text-success`/`text-info` on the `<Cmp>` not the wrapper).
- _confiance : high_

#### `CMT-01` · P0 · architecture — Comment card has no in-card header — name/time render outside the card via shared node

- **Spec :** §15.1 Comment card
- **Loc :** `ui/src/components/issue-detail/IssueFeed.tsx:73-86, ActivityNode.tsx:71-80`
- **Actuel :** buildNode(comment) puts `who`/`time` into ActivityNode's shared baseline header row (above/outside the card), and CommentBody renders only the body text inside a `rounded-md border bg-surface px-3 py-2.5` box. The card has no header band.
- **Attendu :** The comment card is a self-contained unit: header row INSIDE the card (padding 7 12 5) holding Name 12.5/500 + agent pill + " · 3h ago" + flex spacer + more icon, then body (padding 0 12 10) with the header's 5px bottom padding doubling as the body top gutter. The avatar (26) sits to the left of the whole card.
- **Fix :** Restructure the comment node so the card owns its header: `<div class="rounded-lg border border-border bg-surface"><div class="flex items-center gap-[7px] px-3 pt-[7px] pb-[5px]"><span class="text-[12.5px] font-medium text-fg">{name}</span>{agentPill}<span class="text-[11px] text-fg-dim">· {time}</span><span class="ml-auto">{moreIcon}</span></div><div class="px-3 pb-2.5 text-[13px] leading-[1.55]">{body}</div></div>`. Do not route comment name/time through the event header row.
- _confiance : high_

#### `CMT-02` · P1 · geometry — Comment/timeline avatar is 20px (size-5), spec requires 26px

- **Spec :** §15.1 Avatar size=26 / §16 circle 26
- **Loc :** `ui/src/components/issue-detail/AuthorAvatar.tsx:1-18`
- **Actuel :** AuthorAvatar renders both the img and the initials fallback at `size-5` (20px).
- **Attendu :** 26px avatar for comment cards and history-actor timeline events (Avatar size=26, icon variant for agents). 20px is reserved for nested-reply/composer use only.
- **Fix :** Parameterize size (default 26): `size-[26px]` for the comment/history disc. Keep 20 only for the composer and any nested reply.
- _confiance : high_

#### `CMT-03` · P1 · color — Avatar fallback uses deprecated graphite palette (bg-edge / text-dim) instead of per-agent hue + white

- **Spec :** §6.3 Avatar (per-agent fixed colors) / §2 token discipline
- **Loc :** `ui/src/components/issue-detail/AuthorAvatar.tsx:14`
- **Actuel :** Initials fallback is `bg-edge text-[9px] text-dim` — bg-edge=#2e323b and text-dim=#55524c come from the deprecated graphite @theme in index.css, not the spec tokens.
- **Attendu :** Avatar disc filled with a per-person hue (e.g. fix-bot #3a6f4e, review-bot #5b6ef2, Léa M #6f5ad9) with `color: #fff`, initials 2-char weight 600 letter-spacing 0.2 at size×0.42. Bot/agent avatars use the icon variant (bot glyph on the colored disc).
- **Fix :** Replace bg-edge/text-dim with an agentColor(name) lookup → inline `style={{ background: hue, color: '#fff' }}`, weight 600. Reuse the AssigneeAvatar token approach (bg-raised/text-fg-muted) at minimum if hue isn't wired — never the graphite palette.
- _confiance : high_

#### `CMT-04` · P1 · iconography — No "agent" provenance pill on agent comments / events

- **Spec :** §15.1 agent pill / §16 inline pill
- **Loc :** `ui/src/components/issue-detail/IssueFeed.tsx:107-158, ActivityNode.tsx:72-77`
- **Actuel :** buildNode never emits an agent pill; the header just shows the name. No accent provenance tag exists in the feed.
- **Attendu :** Agent-authored comments/events show an "agent" pill right after the name: fontSize 9.5, padding 0 5, radius 3, bg --sk-accent-soft, color --sk-accent, uppercase, letter-spacing 0.3, weight 600.
- **Fix :** When the author is an agent/bot, render `<span class="inline-flex items-center rounded-[3px] bg-accent-soft px-[5px] text-[9.5px] font-semibold uppercase tracking-[0.3px] text-accent">agent</span>` after the name. (Data gap: if author.kind isn't exposed, wire it; absence of data is acceptable until then, but the affordance must exist for agents.)
- _confiance : medium_

#### `CMT-05` · P2 · interaction — Comment card uses radius-md (8) on body box but is missing the trailing "more" affordance

- **Spec :** §15.1 header `<Icon more 13 fgDim>`
- **Loc :** `ui/src/components/issue-detail/IssueFeed.tsx:73-86`
- **Actuel :** The comment card renders no per-comment overflow/more control; ActivityNode's `link` slot is unused for comments.
- **Attendu :** Header row ends with a flex spacer + `<Icon more 13 fgDim>` (the comment overflow menu trigger).
- **Fix :** Add `<button aria-label="Comment actions"><Icon name="more" size={13} className="text-fg-dim"/></button>` at the end of the new in-card header (ml-auto).
- _confiance : medium_

#### `TL-03` · P2 · typography — Time lacks the leading "·" middot separator the spec shows

- **Spec :** §15.1 (" · 3h ago") / §16 (" · 3h ago")
- **Loc :** `ui/src/components/issue-detail/ActivityNode.tsx:76`
- **Actuel :** Time renders as bare `{time}` (e.g. "3h ago") separated only by flex gap-x-2, no middot glyph.
- **Attendu :** Name and time are separated by an explicit " · " middot: `<name> · 3h ago` (the Activity header at IssueFeed.tsx:174-180 already uses an explicit middot, so this is inconsistent within the same surface).
- **Fix :** Prefix the time span with a fgDim middot: render `· {time}` (e.g. wrap as `<span className="text-fg-dim">· </span>{time}`), matching the Activity-count middot pattern.
- _confiance : medium_

#### `TL-04` · P2 · color — Event verb text styled at 12.5/fg but spec calls for fgMuted body color

- **Spec :** §16 (content fontSize 12.5 fgMuted line-height 1.55)
- **Loc :** `ui/src/components/issue-detail/ActivityNode.tsx:72-77`
- **Actuel :** Event content sits in the header row `text-[12.5px] text-fg` and the `who` name is medium; the verb children inherit text-fg. HistoryEntryBody wraps in text-fg-muted (good) but RunLaunched/RunCompleted bodies use text-fg-muted only on the verb word.
- **Attendu :** Event content block is 12.5px fgMuted, line-height 1.55, with only the name at fg/500 and inline status chips at fg. The verb text should read as fgMuted throughout.
- **Fix :** Set the event content wrapper to `text-fg-muted leading-[1.55]` and let only `who` be `text-fg font-medium`; ensure run-launched/run-completed verb spans don't fall back to inherited fg.
- _confiance : low_

#### `SUB-01` · P1 · elevation — Sub-issues card outer surface painted on void (bg-canvas), spec wants bg surface

- **Spec :** §14.1 Outer (bg --sk-surface)
- **Loc :** `ui/src/components/issue-detail/ChildIssues.tsx:11-12`
- **Actuel :** Card outer is `rounded-md border border-border bg-canvas` (bg-canvas = --color-canvas = #0b0d0f = void) while the header band is bg-surface. This inverts the elevation: card floor is void, header is surface.
- **Attendu :** Card outer bg is --sk-surface (#15181c); rows sit directly on surface with bg-raised only on hover. The header is not a separately-tinted band — the whole card is one surface with a border-bottom under the header.
- **Fix :** Change outer to `bg-surface` and remove the redundant `bg-surface` on the header (keep its `border-b`). Rows then read on surface with hover→raised (already correct in SubIssueRow).
- _confiance : high_

#### `SUB-02` · P2 · radius — Sub-issues card uses radius-md=8 via rounded-md — verify it is 8 not Tailwind default

- **Spec :** §14.1 (radius 8) / §4.2
- **Loc :** `ui/src/components/issue-detail/ChildIssues.tsx:11`
- **Actuel :** `rounded-md` — under Tailwind v4 with the shadcn @theme inline, --radius-md = calc(var(--radius)*0.8) = calc(6px*0.8) = ~4.8px, NOT 8px. So the card likely renders at ~5px radius, not the spec's 8.
- **Attendu :** Sub-issues card radius = 8px (spec §4.2 `md = 8`).
- **Fix :** Use an explicit `rounded-[8px]` instead of `rounded-md`, since the project's `--radius-md` resolves to ~4.8px not 8. (Same caution applies to the comment card which §15 also wants at 8.)
- _confiance : medium_

#### `SUB-03` · P2 · spacing — Sub-issues header height 36 (h-9), spec geometry implies ~33 from padding 8/12

- **Spec :** §14.2 Header (padding 8 12)
- **Loc :** `ui/src/components/issue-detail/ChildIssues.tsx:12`
- **Actuel :** Header is fixed `h-9` (36px) with `px-3` (12px). Spec defines header by padding `8 12` (vertical 8), which yields a content-driven height (~17px content + 16 padding ≈ 33px), not a forced 36.
- **Attendu :** padding 8px 12px, height content-driven (~32-33px), not a hard 36px row.
- **Fix :** Replace `h-9 ... px-3` with `px-3 py-2` (8px) and drop the fixed height so the header matches the 8/12 padding spec.
- _confiance : low_

#### `SUB-04` · P2 · spacing — Sub-issue row ID column width 60 OK but gap 10 (gap-2.5) vs spec gap 9

- **Spec :** §14.3 Sub-issue row (gap 9)
- **Loc :** `ui/src/components/issue-detail/SubIssueRow.tsx:19`
- **Actuel :** Row uses `gap-2.5` (10px) between columns.
- **Attendu :** Sub-issue row column gap is 9px.
- **Fix :** Change `gap-2.5` to `gap-[9px]`. (Height 30 via h-[30px], px 10 via px-3=12 — note px-3 is 12px, spec says padding 0 10; consider `px-2.5` for the 10px gutter.)
- _confiance : medium_

#### `SUB-05` · P2 · spacing — Sub-issue row horizontal padding 12 (px-3), spec wants 10

- **Spec :** §14.3 (padding 0 10)
- **Loc :** `ui/src/components/issue-detail/SubIssueRow.tsx:19`
- **Actuel :** `px-3` = 12px horizontal padding.
- **Attendu :** Sub-issue row padding is `0 10` (10px left/right).
- **Fix :** Change `px-3` to `px-2.5` (10px).
- _confiance : medium_

#### `CMP-01` · P2 · spacing — Composer footer/header paddings are asymmetric and don't match spec 8/12 + 6/8

- **Spec :** §15.3 Composer (header padding 8 12; footer padding 6 8)
- **Loc :** `ui/src/components/issue-detail/IssueReplyComposer.tsx:46,66`
- **Actuel :** Header is `px-3 pt-3` (12 top, 12 x, no explicit border-bottom divider between header avatar/textarea and footer). Footer is `px-3 pt-1.5 pb-2` (12 x, 6 top, 8 bottom). The spec's three-zone structure (header / textarea / footer) with border-bottom under the header and border-top above the footer is collapsed into two zones.
- **Attendu :** Three zones: (1) header row padding 8 12 with avatar20 + "Leave a comment…" affordance, border-bottom 1px; (2) textarea area padding 10 12, min-height 48-56, fontSize 13; (3) footer row padding 6 8, border-top 1px. The current build merges header+textarea and omits the internal dividers.
- **Fix :** Split into header (`flex items-center gap-2 px-3 py-2 border-b border-border` with avatar + muted label), textarea (`px-3 py-2.5`), footer (`px-2 py-1.5 border-t border-border`). Add the two hairline dividers.
- _confiance : medium_

#### `CMP-02` · P2 · geometry — Composer attach toolbar buttons are 24px (size-6), spec implies ghost sm icon buttons

- **Spec :** §15.3 footer (ghost sm icons: link, doc, terminal)
- **Loc :** `ui/src/components/issue-detail/IssueReplyComposer.tsx:12-13,68-76`
- **Actuel :** TOOLBAR_BTN is `size-6` (24px) custom buttons with icon size 13.
- **Attendu :** Footer attach controls are ghost `sm` buttons (height 26, icon 14 per §6.5) — the icon size here (13) and box (24) are a touch undersized vs the ghost-sm spec, though visually close.
- **Fix :** Either reuse `<Btn kind="ghost" size="sm" icon="link"/>` (26px / icon 14) icon-only, or bump TOOLBAR_BTN to `size-[26px]` with icon size 14 for consistency with the rest of the footer Btn.
- _confiance : low_

#### `FEED-01` · P2 · spacing — Section spacing between Activity feed nodes (pb-5/pb-2) and around card diverges from spec rhythm

- **Spec :** §13.1 (gap 22 in left column) / §16 vertical rhythm
- **Loc :** `ui/src/components/issue-detail/ActivityNode.tsx:63, IssueDetail.tsx:96`
- **Actuel :** Comment nodes have pb-5 (20px) and event nodes pb-2 (8px) bottom spacing; the left column wrapper uses gap-5 (20px) and px-6 py-6 (24px). The connector-based layout couples vertical spacing to the (to-be-removed) connector line.
- **Attendu :** Issue-page events are independent rows (gap 10 internal), comment cards separated by consistent vertical gaps; left column section gap is 22 and padding 20 28 32 (§13.1).
- **Fix :** Once the connector is removed (TL-01), replace per-node pb-5/pb-2 with a uniform feed `space-y` (e.g. space-y-4) and align the column wrapper to gap-[22px] / pl-5 pr-7 pt-5 pb-8 per §13.1.
- _confiance : low_

## Run Drawer (640px slide-in) + tabs — 34/100

**Résumé.** Shell geometry is roughly right (640px, right overlay, backdrop) but the drawer renders on the DEPRECATED Graphite palette (index.css lines 9 to 37) not the spec tokens.css design language (surface, raised, overlay, border, fg, fgMuted, fgDim, plus accent, success, warn, danger, info). That is a foundation P0 for the whole surface. Also missing: the 18.5 Activity filter strip, the 18.2 Re-run and Bundle actions, the 18.4 Raw tab and per-tab count badges, the 18.7 diff-preview panel, and the 18.10 run-id URL sync. The 18.6 ToolCallRow lacks the zero-padded index, tool badge and duration column. The 18.9 Terminal tab ships the full destructive TerminalTakeover (Inspect, Continue, Force takeover) instead of a read-only stream plus a shell input. Re-platform onto tokens.css before any per-component polish.

**Critiques UX :**

- The drawer is effectively a different product skin from the rest of the UI: Graphite palette here vs tokens.css on the issue list and detail. Opening it from a spec-compliant Issue Detail feels like jumping into a foreign app. Re-platforming onto tokens.css is the single highest-leverage fix and should precede any per-row polish.
- Two stacked headers (the generic RUN eyebrow from SideDrawer plus the content sub-bar) waste vertical space at the top of a compact 640px drawer and bury the run identity. The spec single dense header is tighter and more useful.
- Putting a destructive Force-takeover control (it cancels the in-flight agent turn) inside a debug drawer Terminal tab is a real safety smell, not just a parity miss. Even if takeover graduates back via IMPLEMENTATION_EXTRAS, it belongs behind explicit confirmation, not one tap inside an overlay.
- The Tools tab is a relabeled ledger list, not real tool calls; combined with the missing zero-padded index and tool badge, the most engineer-facing tab is the least faithful. Wiring real tool calls plus the 18.6 row anatomy would do the most to make the drawer feel like a build inspector.
- There is no visible Re-run or Bundle and no run-id deep link, so the drawer can be neither acted on nor shared, undercutting the always-one-keystroke-away and sharable premise. URL sync is cheap with TanStack Router search params.
- Color semantics are inconsistent: deletions are oxide here but the spec wants danger, and the diff minus line is text-fg in StructuredActivityList. Pick one semantic mapping (success and danger) for every delta stat so the eye can trust the color.
- The active tab underline is accent here while 18.4 and view-tabs 10.1 use fg for the underline and reserve accent for the issue list selected-row rail. Mixing accent into tab chrome erodes the cobalt-is-sparse rule across surfaces.

**Écarts (16) :**

#### `DRW-01` · P0 · color — Drawer renders on the deprecated Graphite palette, not the spec design tokens

- **Spec :** SPEC 0.2 elevation, 2.1 color roles, 3 surfaces
- **Loc :** `ui/src/index.css:8-37; ui/src/components/ui/side-drawer.tsx:40,43,47,52; RunDrawerContent.tsx:59,72; RunMetaStrip.tsx:40`
- **Actuel :** Uses carbon 111214 as surface, edge 2e323b as hairlines, silver and ash as text, plus mineral oxide gold cyan violet semantics. index.css line 8 marks this block deprecated.
- **Attendu :** surface 15181c, raised 1c2026, overlay 23282f, border 262b32, fg fgMuted fgDim, semantic success warn danger info accent; header and strip on void 0b0d0f.
- **Fix :** Replace bg-carbon with bg-surface, border-edge with border-border, text-silver with text-fg, text-ash with text-fg-muted or text-fg-dim, and oxide mineral gold cyan violet with danger success warn info accent.
- _confiance : high_

#### `DRW-02` · P0 · architecture — Terminal tab ships the full destructive TerminalTakeover instead of a read-only stream plus input

- **Spec :** SPEC 18.9 Terminal tab
- **Loc :** `ui/src/components/run-detail/RunWorkspaceTabs/ShellTab.tsx:8-13; ui/src/components/run-detail/TerminalTakeover.tsx:113-249`
- **Actuel :** ShellTab renders TerminalTakeover: Inspect, Continue and Force-takeover buttons, a force-takeover confirm panel that cancels the in-flight agent turn, a sub-mode select, and a run-primary PTY inside the 640px overlay.
- **Attendu :** A context row (mono sandbox path plus Dot success shell idle plus ghost copy), a read-only pre stream (mono 11.5, codeFg, bg code), and an input row (mono prompt, placeholder, Kbd enter). No takeover modes.
- **Fix :** Build a compact read-only DrawerTerminalTab per 18.9 and stop importing TerminalTakeover. Gate takeover behind a default-off flag per IMPLEMENTATION_EXTRAS.
- _confiance : high_

#### `DRW-03` · P1 · layout — No Agent Model Sandbox Branch Cost context strip; RunMetaStrip uses wrong columns

- **Spec :** SPEC 18.3 Context strip
- **Loc :** `ui/src/components/issue-detail/run-drawer/RunDrawerContent.tsx:84; ui/src/components/run-shared/RunMetaStrip.tsx:40-105`
- **Actuel :** 5-col grid labelled Agent Model Branch Worktree Started; Model hard-coded to not attached at line 54; no Sandbox or Cost cell; CSS grid not a flex DKV row.
- **Attendu :** flex-wrap row pad 10 16 gap 16; DKV cells in order Agent Model Sandbox(mono) Branch(mono) Cost(mono); label 10 600 uppercase fgDim, value icon 11 fgDim plus 12 fg.
- **Fix :** Reorder and relabel to Agent Model Sandbox Branch Cost, drop Started, render Cost only when known, use a flex-wrap DKV row.
- _confiance : high_

#### `DRW-04` · P1 · architecture — Drawer not sharable via run-id search param; store is plain zustand with no URL sync

- **Spec :** SPEC 18, 18.10
- **Loc :** `ui/src/stores/runDrawer.ts:1-24; ui/src/components/issue-detail/run-drawer/RunDrawer.tsx:5-21`
- **Actuel :** openDrawer and closeDrawer only mutate zustand state; opening does not push the run-id search param to the issue URL and a deep link does not reopen the drawer.
- **Attendu :** Opens with the run-id search param on the issue URL; closing returns to the issue route; sharable via that param.
- **Fix :** Sync the drawer to TanStack Router run and tab search params on the issue route; derive open and runId from the URL so it is deep-linkable and survives reload.
- _confiance : high_

#### `DRW-05` · P1 · layout — Header lacks run-id identity and Re-run Bundle actions; separate RUN eyebrow and 24x24 close

- **Spec :** SPEC 18.2 Header
- **Loc :** `ui/src/components/ui/side-drawer.tsx:47-57; ui/src/components/issue-detail/run-drawer/RunDrawerContent.tsx:59-83`
- **Actuel :** SideDrawer 48px header with a RUN eyebrow Title and a 24x24 close on bg-carbon; RunDrawerContent adds a second sub-bar (issue Pill, state badge, 8-char run id, Detail link). No Re-run, no Bundle.
- **Attendu :** One header row gap 10 pad 14 16 border-bottom on bg void: mono run-id pill, state chip, for ISS 12 fgMuted, spacer, ghost Re-run, ghost Bundle, 1x16 divider, 28x28 close.
- **Fix :** Collapse into a single spec header on bg-void with run-id pill, state chip, for ISS, Re-run, Bundle, divider, 28x28 close; drop the duplicate RUN eyebrow.
- _confiance : high_

#### `DRW-06` · P1 · layout — Activity tab missing the filter strip (All Tools Edits Tests Flags) and search affordance

- **Spec :** SPEC 18.5 Activity tab
- **Loc :** `ui/src/components/run-tabs/ActivityTab.tsx:34-59`
- **Actuel :** ActivityTab jumps straight into the event list (px-5 py-3 pl-7); no filter pill row and no Search events input.
- **Attendu :** A filters strip pad 8 16 gap 10 border-bottom on bg void with pills All Tools Edits Tests Flags (on raised plus border plus fg, off transparent plus fgMuted, trailing mono count) and a right-aligned search affordance.
- **Fix :** Add a DrawerFilters strip above the Activity body with the five pills and a search affordance; derive counts from the events array.
- _confiance : high_

#### `DRW-07` · P1 · typography — Tabs: label Tools not Tool calls, no Raw tab, no count badges, h-10 not 36, underline accent not fg

- **Spec :** SPEC 18.4 Tabs
- **Loc :** `ui/src/components/issue-detail/run-drawer/RunDrawerTabs.tsx:5-25; ui/src/components/ui/tab-bar.tsx:29-51`
- **Actuel :** Tabs Activity Tools Files Logs Terminal; rows h-10 (40px), active underline border-accent, no per-tab count badge, container bg-carbon. Second tab labelled Tools.
- **Attendu :** Tab height 36, active underline 2px fg NOT accent, each tab a mono 10.5 count badge (raised bg, fgDim, min-width 14); order Activity Tool-calls Files Logs Terminal then a flex spacer plus a tertiary Raw tab. Label is Tool calls.
- **Fix :** Rename Tools to Tool calls, change underline to border-fg, add count badges, add a spacer plus Raw tab, set tab height 36, container bg surface.
- _confiance : high_

#### `DRW-08` · P1 · geometry — ToolCallRow has no zero-padded index, tool badge, or duration column; off-spec status dot

- **Spec :** SPEC 18.6 Tool calls tab
- **Loc :** `ui/src/components/run-detail/RunWorkspaceTabs/ToolCallRow.tsx:22-62`
- **Actuel :** caret, colored dot (bg-oxide bg-gold bg-cyan), tool_name (mono 12 fg), relative time, error or running text, padding px-5 py-2. No index, tool badge, fixed duration column, or copy button; expanded body px-7 not bg-raised; divide-edge separators.
- **Attendu :** pad 8 16 min-h 32; chev 11 fgDim; mono index 10.5 fgDim min-width 24 ZERO-PADDED (01 not 1); tool badge radius 3 bg raised border 10.5 mono fg; summary mono 12 fgMuted; status dot 6 success or danger; mono duration 11 fgDim min-width 44; copy button 22x22; expanded body bg raised pad 6 16 14 56.
- **Fix :** Add a zero-padded mono index, a tool-name badge, a fixed-width duration cell, and a copy button; switch the dot to success or danger size 6; set expanded body bg raised with a 56px left inset; border-b border-border.
- _confiance : high_

#### `DRW-09` · P1 · layout — Files tab has no diff-preview panel and no per-file stacked bar; rows use A M D letters

- **Spec :** SPEC 18.7 Files tab
- **Loc :** `ui/src/components/run-detail/RunWorkspaceTabs/ChangesTab.tsx:69-85; ui/src/components/run-detail/RunWorkspaceTabs/FileDiffRow.tsx:37-72`
- **Actuel :** caret, 4x4 A M D status glyph, mono path, adds (success) and dels (oxide), inline pre when expanded. No per-file stacked adds-dels bar; ChangesTab renders no standalone diff-preview panel.
- **Attendu :** FileChangeRow col gap 5 pad 7 0; doc icon 12 fgDim plus mono path 11.5 fg plus adds success 11 plus dels danger 11; stacked bar h3 radius 999 bg raised. Below the list a diff-preview panel pad 12 radius 8 bg void border with a DIFF PREVIEW eyebrow plus copy plus Open in editor plus a compact CodeBlock.
- **Fix :** Add the per-file stacked bar and a diff-preview panel beneath the list; deletions text-danger not oxide; drop the A M D letter chip for the doc-icon plus path plus stat layout.
- _confiance : high_

#### `DRW-10` · P1 · elevation — Logs tab pre is not a code surface (no bg-code, codeFg, or byte-count header with copy download)

- **Spec :** SPEC 18.8 Logs tab
- **Loc :** `ui/src/components/run-tabs/LogsTab.tsx:13-28,47-66`
- **Actuel :** Logs render in a pre with text-fg-muted on the default surface, per-line border-edge dividers and a time plus agent or shell prefix; errors text-oxide; a Full terminal transcript link bar but no byte-count header, copy, or download.
- **Attendu :** A header row pad 0 16 8 raw stdout stderr KB 11 fgDim plus ghost copy plus ghost Download; the pre pad 12 16 mono 11.5 color codeFg bg code top and bottom border pre-wrap.
- **Fix :** Wrap the pre in bg-code with text-code-fg, add a top and bottom border, and add a byte-count header row with copy and Download; switch error lines to text-danger.
- _confiance : high_

#### `DRW-11` · P1 · elevation — Drawer shadow is symmetric shadow-2xl, not the spec asymmetric left shadow

- **Spec :** SPEC 18.1, 4.3
- **Loc :** `ui/src/components/ui/side-drawer.tsx:43`
- **Actuel :** Dialog.Popup uses Tailwind shadow-2xl (a symmetric ambient shadow).
- **Attendu :** minus 12px 0 40px rgba(0,0,0,.45) asymmetric to the left.
- **Fix :** Replace shadow-2xl with an arbitrary box-shadow of minus 12px 0 40px rgba black 0.45.
- _confiance : high_

#### `DRW-12` · P1 · state — State chip uses off-spec tones and labels; not the 17.2 running needs shipped chip

- **Spec :** SPEC 18.2, 17.2
- **Loc :** `ui/src/components/RunStateBadge.tsx:5-13; ui/src/lib/domain/displayLabels.ts:39-51`
- **Actuel :** RunStateBadge renders the raw state enum with underscores spaced, toned via stateTone mapping to cyan live violet gold mineral oxide (Graphite palette).
- **Attendu :** A chip gap 6 pad 0 7 h19 radius 4 bg toneSoft color tone 11 500 with a Dot (pulse unless done) and labels running, paused needs you, shipped; semantic info warn success accent.
- **Fix :** Map states to the three spec variants (running to info, needs to warn paused needs you, shipped to success) with 17.2 geometry; remove cyan live violet gold mineral oxide from Pill.
- _confiance : high_

#### `DRW-13` · P1 · iconography — StructuredActivityList uses off-spec icons, tone colors, dot bg and lacks the active pulse ring

- **Spec :** SPEC 18.5, 17.5
- **Loc :** `ui/src/components/run-tabs/StructuredActivityList.tsx:7-31,134-176`
- **Actuel :** 18px dot on bg-carbon with borders oxide success accent edge; icons CircleDot FileText Search Check TestTube2 (generic Lucide); diff minus lines text-fg; no pulse ring on active; connector left 9px bg-edge.
- **Attendu :** 17.5 palette: plan fgMuted layers, search fgDim search, tool info terminal, edit accent doc, test and pr and done success check, ask and stuck warn; dot bg surface plus sk-pulse ring when active; connector 1.5 bg border.
- **Fix :** Map activity_kind to the 17.5 icon and color table (terminal doc check layers, not CircleDot TestTube2), dot on bg-surface with semantic borders, add the pulse ring, recolor diff and error with success and danger.
- _confiance : medium_

#### `DRW-14` · P2 · typography — Mono content uses DM Mono (font-data), not the spec JetBrains or IBM Plex Mono

- **Spec :** SPEC 1 typography
- **Loc :** `ui/src/index.css:65-67; font-data used in RunDrawerContent.tsx:72, ToolCallRow.tsx:38, LogsTab.tsx:51`
- **Actuel :** font-data resolves to DM Mono, SF Mono, Fira Code; the spec mono token font-mono (JetBrains, IBM Plex) in tokens.css is unused by the drawer.
- **Attendu :** Mono equals JetBrains Mono, IBM Plex Mono, ui-monospace, Menlo with font-feature-settings tnum and ss01 for numeric content.
- **Fix :** Point the drawer mono text at var font-mono (font-mono utility, not font-data) and apply tabular-nums to numeric cells.
- _confiance : medium_

#### `DRW-15` · P2 · color — Backdrop opacity and blur off-spec (carbon 60 plus blur-sm vs 40 percent black plus 1px blur)

- **Spec :** SPEC 18.1 backdrop
- **Loc :** `ui/src/components/ui/side-drawer.tsx:40`
- **Actuel :** Dialog.Backdrop equals bg-carbon 60 (111214 at 60 percent) with backdrop-blur-sm (about 4px).
- **Attendu :** bg rgba(0,0,0,.40) with backdrop-filter blur(1px).
- **Fix :** Set backdrop to bg-black 40 with backdrop-blur 1px instead of carbon 60 plus blur-sm.
- _confiance : medium_

#### `DRW-16` · P2 · architecture — Activity tab pending-attention block foregrounds a decision-adjacent affordance in the drawer

- **Spec :** SPEC 18.10, 17.3
- **Loc :** `ui/src/components/run-tabs/ActivityTab.tsx:36-52`
- **Actuel :** ActivityTab renders a needs-decision warn pill block at the top of the body. It is read-only (no Approve or Reject buttons) but visually foregrounds the decision in the drawer.
- **Attendu :** Decisions live on the issue NeedsBanner; the drawer is a debug inspector. A read-only marker is borderline but must not read as the decision surface.
- **Fix :** Keep it strictly informational (it currently is, which is correct) and ensure no Approve or Reject ever attaches; consider demoting it to an inline timeline event.
- _confiance : low_

## Run Inspector + Task Cockpit (deep-link/debug surfaces) — 42/100

**Résumé.** Both surfaces are architecturally in the right place (not in nav, parent-banner pushes decisions to the issue) but diverge heavily from the §19/§20 artboards on foundations and layout. The single largest issue is a systemic color-token regression: ~135 class usages across run-inspector/task-cockpit/run-detail still consume the DEPRECATED Graphite palette (carbon-dim, edge, silver, fog, dim, oxide, gold, mineral, cyan, neon-green) instead of the spec tokens (surface/raised/border/fg-dim/success/warn/danger/info). Worse, bg-carbon-dim is undefined in both index.css and tokens.css, so the Run Inspector Facts rail and the Cockpit Now panel render with NO background instead of the spec's surface tint. Beyond color, the Run Inspector is built as a 5-tab inspector (drawer pattern) rather than the §20 two-column layout (Activity column + 340px facts rail + collapsed-terminal footer strip + 7-cell context strip with ToolStat summaries), and the Cockpit PhaseTracker disc is 28px (size-7) vs the spec 22px, with status discs that never render the active pulsing ring / paused / failed glyph states. The biggest remaining gap is the color foundation: until these surfaces consume tokens.css the elevation tiers and semantic colors are simply wrong, an automatic §0 P0.

**Critiques UX :**

- The deprecated Graphite palette (index.css) and the spec tokens (tokens.css) coexist, and these debug surfaces are still on the old one while the issue surfaces have migrated. This produces a visible seam: navigate from an issue (#15181c surfaces, #262b32 hairlines) into a run (#111214/#2e323b) and the whole color temperature shifts. Finishing the SUP-127 token migration on run-inspector/task-cockpit/run-detail should be one coordinated pass, not file-by-file — a codemod over the class strings is safer than hand edits.
- bg-carbon-dim being undefined means a reviewer eyeballing the diff sees 'a bg token is set' and assumes it's fine, but it renders nothing. The class is repeated in 4 places and slipped through review; worth a CI/Tailwind check that flags class names not backed by a --color token.
- The spec leans on a legacy 'Tasks ›' crumb and a /runs page reached 'from the drawer's Open full page', but §0.5 deprecates Tasks/Runs as destinations entirely. There is genuine tension here: the artboards predate the issue-centered decision. The implementation's choice (parent-banner back to issue, no Tasks crumb) is arguably MORE correct than the literal artboard — flag to design rather than blindly restoring artboard crumbs.
- Run Inspector being a 5-tab page makes it visually identical to the Drawer, which defeats the §20.2 intent that the full page is the spread-out version (2-col, tools summarized, terminal collapsed). Right now the only difference between drawer and inspector is width. If effort is limited, at minimum pull Terminal+Logs out of the tab strip so the page reads facts-first.
- The Cockpit Now panel 'Intervene' section is reduced to a single 'Open issue' link, consistent with the issue-centered foundation (decisions belong on the issue) but divergent from §19.5's 3 full-width buttons. This is a defensible deviation; log it in IMPLEMENTATION_EXTRAS / a design note so a future reviewer does not 'fix' it back to 3 buttons and reintroduce the decision-in-cockpit anti-pattern.
- StepTimeline / RunHero / RunDetailsGrid / LedgerRow look like remnants of the pre-rework run page; the live /runs route renders RunInspector, which does not import most of them. If they are dead, deleting them removes roughly half the Graphite-palette debt for free. Confirm mount status before spending time restyling them.

**Écarts (17) :**

#### `FND-01` · P0 · color — Right rail / Now panel background undefined — bg-carbon-dim does not exist

- **Spec :** §3 elevation / §20 right rail bg surface / §19.5 Now panel bg surface
- **Loc :** `ui/src/components/run-inspector/RunInspectorFacts.tsx:51; ui/src/components/task-cockpit/TaskCockpitNowPanel.tsx:41; ui/src/components/run-inspector/RunInspectorParentBanner.tsx:12; ui/src/components/task-cockpit/TaskCockpitParentBanner.tsx:14`
- **Actuel :** className uses bg-carbon-dim/40. Neither index.css nor tokens.css defines --color-carbon-dim (only --color-carbon #111214). The utility resolves to nothing, so the Facts rail, Now panel, and both parent banners render with a transparent/void background.
- **Attendu :** Run Inspector right rail and Cockpit Now panel are --sk-surface (#15181c). Parent banners step to surface over the page. Tokens map: bg-surface.
- **Fix :** Replace bg-carbon-dim/40 with bg-surface on the two asides (RunInspectorFacts.tsx:51, TaskCockpitNowPanel.tsx:41) and the two parent banners. Drop the /40 alpha — the spec rail is opaque surface.
- _confiance : high_

#### `FND-02` · P0 · color — Deprecated Graphite palette used throughout instead of spec tokens

- **Spec :** §2 Color roles / §0 Foundation 2 (four-tier elevation) & 4 (semantic colors)
- **Loc :** `ui/src/components/run-detail/RunDetailsGrid.tsx:41; ui/src/components/run-detail/StepTimeline.tsx:10-16,52,56,63; ui/src/components/run-detail/RunBudgetCard.tsx:71-74; ui/src/components/run-detail/LedgerRow.tsx:35,39,45,49; ui/src/components/run-tabs/StructuredActivityList.tsx:8-11,78,91,142; ui/src/components/run-shared/RunMetaStrip.tsx:40`
- **Actuel :** Components use border-edge (#2e323b), bg-carbon (#111214), text-silver (#b0ada6), text-fog, text-dim (#55524c), text-ash, text-oxide (#e85d4a), bg-oxide, bg-gold (#e5a913), bg-mineral (#4caf7d), text-cyan, text-neon-green (#3ddc84), ring-offset-carbon — the index.css palette explicitly marked deprecated, retired when all surfaces consume tokens.css (SUP-127+).
- **Attendu :** Hairlines = border (#262b32) not edge. Surfaces = surface/raised/canvas. Secondary text = fg-muted (#9aa0a8) not silver. Semantics: success #4ea674 (not mineral/neon-green), warn #d4a04a (not gold), danger #cf5a55 (not oxide), info #5b8ec9 (not cyan).
- **Fix :** Migrate every Graphite class on these surfaces to tokens.css equivalents: border-edge→border-border, bg-carbon→bg-surface (or bg-canvas where void intended), text-silver→text-fg-muted, text-fog→text-fg, text-dim→text-fg-dim, text-oxide/bg-oxide→text-danger/bg-danger, bg-gold→bg-warn, bg-mineral/text-neon-green→bg-success/text-success, text-cyan→text-info.
- _confiance : high_

#### `FND-03` · P0 · architecture — Run Inspector is a tabbed inspector, not the §20 two-column layout

- **Spec :** §20.1 / §20.2 Differences from the Drawer (Tabs: None — content laid out 2-col)
- **Loc :** `ui/src/components/run-inspector/RunInspector.tsx:140-159; ui/src/components/run-inspector/RunInspectorTabs.tsx:10-16,47-68`
- **Actuel :** Body = a 5-tab TabBar (Activity · Tools · Files · Logs · Terminal) on the left flex-1 column + a 320px Facts rail. This is the Drawer's tab pattern (§18.4) transplanted onto the full page.
- **Attendu :** Run Inspector full page is two columns with NO in-place tabs: left = Activity timeline column (flex 1, border-right); right = 340px facts rail with summarized NPSection blocks (Tool calls·N as ToolStat rows, Files changed·N with Diff, Reproduce/test, Worktree); plus a collapsed-terminal escape-hatch FOOTER strip across the bottom. §20.2 explicitly contrasts 'Tabs: 6 in-place' (drawer) vs 'None — content laid out 2-col' (inspector).
- **Fix :** Replace RunInspectorTabs with a single Activity column (header = ACTIVITY eyebrow + count + filter Pills) and move Tools/Files into right-rail NPSection summaries. Terminal becomes the bottom footer strip (FND-04), not a tab.
- _confiance : high_

#### `FND-04` · P1 · layout — Missing collapsed-terminal footer escape-hatch strip on Run Inspector

- **Spec :** §20.1 Footer (escape-hatch terminal)
- **Loc :** `ui/src/components/run-inspector/RunInspector.tsx:135-159 (no footer element rendered)`
- **Actuel :** Terminal is only reachable as a tab (ShellTab). There is no bottom strip; the layout ends at the body row.
- **Attendu :** Footer row: padding 8 22 / gap 12 / border-top 1px / bg surface / fontSize 12 — terminal icon 13 fgDim + `$ ephemeral-2:~/sk/run-7af2-1` mono fgDim + <Dot tone=success> + 'shell idle · last cmd 38s ago' fgMuted + flex spacer + ghost sm icon=chev 'Expand terminal'.
- **Fix :** Add a flex-none footer below the 2-col body with the terminal context line and an 'Expand terminal' ghost button that opens the shell takeover.
- _confiance : high_

#### `FND-05` · P1 · layout — Run Inspector context strip is a 5-cell grid, not the §20 7-cell CSCell row

- **Spec :** §20.1 Context strip (7 cells: Agent · Model · Sandbox · Branch · Worktree · Started · Cost)
- **Loc :** `ui/src/components/run-shared/RunMetaStrip.tsx:38-106`
- **Actuel :** RunMetaStrip renders a 5-column responsive grid: Agent, Model, Branch, Worktree, Started. Missing Sandbox and Cost cells. Uses grid grid-cols-2 ... md:grid-cols-[...] with bg-carbon/border-edge, py-3.
- **Attendu :** Seven CSCell cells in order Agent · Model · Sandbox · Branch · Worktree · Started · Cost, laid out as a wrapping flex row (gap 24, padding 12 22, border-bottom, bg surface). Each cell: label 10.5/600/uppercase/0.8ls fgDim + value row (icon 11 fgDim + 12 fg, mono where applicable).
- **Fix :** Add Sandbox (mono) and Cost (mono, `$x.xx / $y.yy`) cells; switch the container to a flex-wrap row with gap-6 and bg-surface/border-border; reduce label tracking to match 0.8 letter-spacing.
- _confiance : medium_

#### `FND-06` · P1 · layout — Missing ToolStat summary rows in Run Inspector right rail

- **Spec :** §20.1 right rail 'Tool calls · N → ToolStat rows' / §20.2 right-rail tools 'summarized via ToolStat rows'
- **Loc :** `ui/src/components/run-inspector/RunInspectorFacts.tsx:48-143`
- **Actuel :** Facts rail has Progress/Agent/Files changed/Workspace/Pull request/Execution budget. There is no Tool calls summary section and no Reproduce/test section. Tools live only in the separate Tools tab.
- **Attendu :** First NPSection in the rail is 'Tool calls · N' with ToolStat rows: Icon 12 fgDim + label fgMuted (flex 1) + mono count (minWidth 24, right) + mono ms 11 fgDim (minWidth 40, right). Plus a 'Reproduce / test' CodeBlock section.
- **Fix :** Add a ToolStat-style 'Tool calls · N' section aggregating tool events, and a 'Reproduce / test' section, to RunInspectorFacts. Section eyebrows should be 10.5/600 uppercase (currently text-[11px]).
- _confiance : medium_

#### `FND-07` · P1 · geometry — Right rail / Now panel width is 320px (w-80), spec is 340 (inspector) / 360 (cockpit)

- **Spec :** §20.1 Right rail width 340 / §19.1 & §19.5 Now panel width 360
- **Loc :** `ui/src/components/run-inspector/RunInspectorFacts.tsx:51 (w-80); ui/src/components/task-cockpit/TaskCockpitNowPanel.tsx:41 (w-80)`
- **Actuel :** Both panels use w-80 (320px).
- **Attendu :** Run Inspector right rail = 340px; Task Cockpit Now panel = 360px. These are distinct widths in the spec.
- **Fix :** RunInspectorFacts: w-[340px]. TaskCockpitNowPanel: w-[360px].
- _confiance : high_

#### `FND-08` · P1 · typography — Facts/Now rail header is a generic 36px bar, not the §19.5 NOW headline block

- **Spec :** §19.5 Now headline section (padding 16 16 14, eyebrow + state Pill, headline 14/500, sub 11.5)
- **Loc :** `ui/src/components/run-inspector/RunInspectorFacts.tsx:53-57; ui/src/components/task-cockpit/TaskCockpitNowPanel.tsx:43-58`
- **Actuel :** Both use a fixed h-9 (36px) header with a centered eyebrow ('Facts' / 'Now') at font-data text-[11px] tracking-widest. The Cockpit then renders the 'Now' headline as a separate first section (text-[13px] font-semibold).
- **Attendu :** The NOW block is the headline section: eyebrow 'NOW' 10.5/600/uppercase/0.9ls fgDim + flex spacer + a state Pill (running/paused/shipped) with pulsing dot, then headline 14/500 fg lineHeight 1.45, then sub 11.5 fgDim. No separate fixed-height 36px bar. (Run Inspector has no 'Facts' eyebrow bar in §20 at all.)
- **Fix :** Replace the h-9 header with the spec NOW block: eyebrow + trailing state Pill row, headline at text-[14px] font-medium, sub at text-[11.5px] text-fg-dim. Drop the standalone 'Facts' label on the inspector rail.
- _confiance : medium_

#### `FND-09` · P1 · geometry — Cockpit PhaseTracker disc is 28px (size-7) — spec PhaseTracker disc is 22px

- **Spec :** §19.2 PhaseTracker disc 22×22 (vs §17.4 PhaseStrip 18px — 'Don't mix the two')
- **Loc :** `ui/src/components/launch/LaunchPlanStrip.tsx:86 (size-7), used as cockpit tracker via TaskCockpit.tsx:65`
- **Actuel :** StepperNode disc is size-7 (28px), strip padding py-4, border + ring-4 ring-accent/10 for current.
- **Attendu :** PhaseTracker disc is exactly 22px (size-[22px]). The surface-focus note explicitly distinguishes the 22px PhaseTracker disc from the 18px ExecutionLog PhaseStrip — 28px is neither.
- **Fix :** Set the StepperNode disc to size-[22px]. Active node uses a 4px outer pulsing ring (boxShadow ring + sk-pulse) rather than a static ring-4. Connector should be 1.5px with a tone gradient (currently h-px bg-edge).
- _confiance : high_

#### `FND-10` · P1 · state — PhaseTracker omits active pulsing ring, paused, and failed status glyphs

- **Spec :** §19.2 PhaseTracker (done check / active inner dot + pulsing ring / paused pause / failed x / pending mono index)
- **Loc :** `ui/src/components/launch/LaunchPlanStrip.tsx:78-105`
- **Actuel :** StepperNode only handles done (Check) vs everything-else (Dot tone). Current step gets a static ring-accent/10. No paused (pause icon), no failed (x), no pending mono index, no animated outer ring on the active node, and the disc bg is always bg-surface (no 20/22% tone-mix fill).
- **Attendu :** Five states per §19.2: done = bg color@20% + check 11 sw2.5; active = bg color@22% + 7px inner dot + 4px pulsing ring (sk-pulse); paused = bg warn@22% + pause icon 9; failed = bg danger@20% + x 10; pending = transparent bg + borderStrong + mono index 10/600 fgDim.
- **Fix :** Expand StepperNode to a status switch matching PhaseTracker: tone-mixed disc backgrounds, pause/x icons, mono index for pending, and an absolutely-positioned animated outer ring for the active node.
- _confiance : high_

#### `FND-11` · P1 · color — Run-page TimelineEvent dot fill is bg-carbon, spec uses void; diff/delta colors wrong

- **Spec :** §19.4 / §20 TimelineEvent (dot bg --sk-void) & §17.6 diff (− lines danger)
- **Loc :** `ui/src/components/run-tabs/StructuredActivityList.tsx:142 (bg-carbon), :8-11 (border-oxide/edge), :78, :91 (oxide), :108-110 diffLineClass (- => text-fg)`
- **Actuel :** The 18px timeline dot uses bg-carbon (#111214). toneFor returns border-oxide/text-oxide and border-edge/text-fg-muted. Delta removed count uses text-oxide; removed diff lines are colored text-fg (white) and added lines text-success.
- **Attendu :** Dot bg = --sk-void (canvas #0b0d0f), border = palette.c per kind. Removed/failed = danger (#cf5a55) not oxide. In §17.6 the diff − stat is danger; a removed diff line should not be plain fg-white.
- **Fix :** StructuredActivityList: dot bg-canvas; replace oxide→danger and edge→border in toneFor and Delta; diffLineClass for '-' → text-danger (or fg-muted) rather than text-fg.
- _confiance : high_

#### `FND-12` · P2 · iconography — Run-page TimelineEvent icon set diverges from spec kind→icon palette

- **Spec :** §17.5 palette (plan=layers, search=search, tool=terminal, edit=doc, test=check, pr=pr, done=check) / §5 stroked SVG vocabulary
- **Loc :** `ui/src/components/run-tabs/StructuredActivityList.tsx:14-31 (IconFor)`
- **Actuel :** IconFor maps diff/write→FileText, search→Search, summary→Check, test→TestTube2, progress/spec/default→CircleDot. TestTube2 and CircleDot are not in the spec icon vocabulary.
- **Attendu :** Per §17.5: tool→terminal, edit→doc(FileText ok), test→check, plan→layers, search→search, done/pr→check/pr. No TestTube2; tests use the check glyph; generic falls back to clock, not CircleDot.
- **Fix :** Remap test→Check, progress/spec/default→Clock, drop TestTube2/CircleDot to match the §17.5 kind palette.
- _confiance : medium_

#### `FND-13` · P2 · architecture — /tasks/<id> route is not debug-gated (?debug=task)

- **Spec :** §0 Foundation 5 / §19 scope note ('/tasks/<id>?debug=task', not a primary nav URL)
- **Loc :** `ui/src/routes/_shell/tasks.$taskId.tsx:10-19 (no validateSearch / debug gate)`
- **Actuel :** Route is a plain createRoute at path '/tasks/$taskId' that renders TaskCockpit unconditionally. No validateSearch for a debug param and no redirect when the gate is absent. (Sidebar correctly omits Tasks/Runs, so it is not in nav — good.)
- **Attendu :** Per §0.5 + §19 scope note, the Task Cockpit is a debug surface reached via ?debug=task; without the flag it should not be a primary destination.
- **Fix :** Add validateSearch parsing { debug?: 'task' } and, when absent, redirect to the parent issue (/issues/<issueId>) — keeping the cockpit reachable only with the debug query.
- _confiance : medium_

#### `FND-14` · P2 · typography — Cockpit body tabs carry icons and wrong count styling vs §19.3

- **Spec :** §19.3 Body tabs (no icons; padding 11 0; trailing count mono 10.5 fgDim; weight 600 active/500 rest)
- **Loc :** `ui/src/components/task-cockpit/TaskCockpitTabs.tsx:7-12,24-31; ui/src/components/ui/tab-bar.tsx:42-49`
- **Actuel :** Cockpit tabs render a leading Lucide icon (Activity/FileDiff/ScrollText/Terminal) at size 14, h-10 buttons, and the per-tab count is shown as an aggregate '{n} steps / {n} files' cluster on the right rather than a per-tab trailing mono count. Tab label is 'Step summaries'/'Files changed' not the spec 'Raw logs'/'Tool calls'.
- **Attendu :** §19.3 tabs are icon-less text tabs (Activity n=11 · Files changed n=2 · Tool calls n=14 · Raw logs) with per-tab trailing mono 10.5 fgDim counts and a right cluster ghost 'Terminal' button. Active = weight 600 + 2px accent underline.
- **Fix :** Drop the leading icons for the cockpit TabBar variant; render per-tab mono counts inline; add a 'Tool calls' tab; rename 'Step summaries'→'Raw logs'; move Terminal to a right-aligned ghost button.
- _confiance : medium_

#### `FND-15` · P2 · architecture — Run Inspector exposes the 5-tab drawer set on a full page

- **Spec :** §20.2 (Run Inspector: 'Tabs None'); §18.4 6-tab set belongs to the 640w drawer only
- **Loc :** `ui/src/components/run-inspector/RunInspectorTabs.tsx:10-16`
- **Actuel :** Run Inspector exposes Activity · Tools · Files · Logs · Terminal as a tab bar — the drawer's interaction model.
- **Attendu :** On the full-page inspector these become: Activity = the left column; Tools/Files = right-rail summaries; Logs = rail/footer; Terminal = the bottom footer strip. No tab bar.
- **Fix :** Subsumed by FND-03/FND-04/FND-06: dissolve the tab bar into the 2-col + footer composition. Tracked separately because the tab list itself is the visible artifact.
- _confiance : high_

#### `FND-16` · P2 · color — RunDetailsGrid / StepTimeline / LedgerRow still on Graphite chips & ledger styling

- **Spec :** §2 / §16 run-page TimelineEvent / §17.6 file rows
- **Loc :** `ui/src/components/run-detail/RunDetailsGrid.tsx:41 (text-neon-green); ui/src/components/run-detail/StepTimeline.tsx:52-53 (border-cyan/30, bg-cyan/5, border-edge/50, bg-graphite/50); ui/src/components/run-detail/LedgerRow.tsx:35,49 (ring-offset-carbon, text-silver)`
- **Actuel :** RunDetailsGrid PR link is text-neon-green/hover bg-neon-green/10. StepTimeline active row uses border-cyan/30 bg-cyan/5 and resting uses border-edge/50 bg-graphite/50. LedgerRow dot ring-offset-carbon and detail text-silver.
- **Attendu :** PR link uses success token; active step uses info (#5b8ec9) tinting; resting row uses raised/border; ring offset = canvas/surface; detail text = fg-muted.
- **Fix :** Replace neon-green→success, cyan→info, graphite→raised, edge→border, carbon→surface/canvas, silver→fg-muted across these three files. Note: verify these are still mounted by the live /runs route (RunInspector does not import most of them); if dead, delete rather than restyle.
- _confiance : medium_

#### `FND-17` · P2 · typography — Topbar title shows truncated UUID slug instead of run-id; no crumbs

- **Spec :** §20.1 (Topbar with crumbs) / §19.1 (crumbs)
- **Loc :** `ui/src/components/run-inspector/RunInspector.tsx:128-133; ui/src/components/task-cockpit/TaskCockpit.tsx:57-61`
- **Actuel :** RunInspector sets title=run.id.slice(0, 8) (raw hex slug) with a back button and no crumbs. TaskCockpit sets title=issue summary with a back button and no crumbs. usePageActions supports a crumbs slot that neither uses.
- **Attendu :** Run Inspector topbar = crumbs + 'run-<id>' title; Cockpit = crumbs + task title. The page-actions store already supports crumbs.
- **Fix :** Pass a crumbs array to usePageActions (issue-anchored, e.g. ['Issues', issueIdentifier, 'Run']) and use a human run id rather than slice(0,8). Note: the artboard's literal 'Tasks ›' crumb conflicts with §0.5 (Tasks not a destination) — anchor crumbs on the issue instead.
- _confiance : low_

## App shell — sidebar + topbar + run dock — 62/100

**Résumé.** The Sidebar and Topbar are structurally close to SPEC §7 and correctly use the canonical token system (surface/raised/border/fg-dim/accent), with most geometry right: 224px width, 26px workspace tile, 7px radii, correct badge styling, and crucially NO Tasks/Runs nav entries (foundation §5 respected). However the shell is dragged down by two whole components rendered inside it — RunDock and SessionWatchRail — that are built on an entirely different, legacy design system (carbon/edge/ash/fog/mineral/silver tokens + font-data) that the spec's tokens.css supersedes. That is the single biggest gap: a user sees two visually foreign bars stitched onto an otherwise Linear-faithful chrome. Secondary issues are real but smaller: the sidebar is missing the mandated PINNED section + dividers, the nav font is 13.5 instead of 13, nav icons are 16 instead of 14, the active rail is anchored at left-0 instead of left:-10, and the topbar crumb separator is a slash instead of the spec'd › glyph and lacks the right-cluster vertical divider.

**Critiques UX :**

- The codebase carries two complete, conflicting design systems: the approved tokens.css (surface/raised/overlay/fg-dim/accent) and a legacy index.css 'carbon/edge/ash/fog/mineral/silver' palette with font-data. RunDock, SessionWatchRail, and several components/ui/* (pill, tooltip, side-drawer, confirm-dialog, RuntimeCard, settings panes) still live on the legacy system. Until the legacy tokens are deleted from index.css, regressions will keep leaking back in. Recommend a tracked migration: port or retire every font-data/carbon/edge consumer, then remove those vars.
- The shell stacks two horizontal status strips below the Topbar (SessionWatchRail) and one at the bottom (RunDock). Combined with the Topbar's own live clock/active-count cluster, there are three competing 'what's running now' surfaces — which directly contradicts foundation §5 (the Issue is the anchor; run state renders inline on the issue + drawer). This is busy and off-message for a Linear-faithful chrome.
- The artboard you cited (issues-redesign-linear-like.html) explicitly scopes the sidebar OUT ('Out of scope: Issue Detail, Task / Run, Inbox, Settings') and renders list surfaces without full nav chrome, so SPEC §7 is the only ground truth for the shell — there is no pixel artboard to diff the sidebar against. Worth producing a dedicated shell artboard so the PINNED section, dividers, and active-rail offset have a literal visual reference.
- Active nav rail at left-0 vs the spec's left:-10 is subtle but it's the difference between 'a highlighted item' and Linear's signature 'rail hugging the panel wall'. Combined with the 16px icon (vs 14) the nav reads slightly heavier/chunkier than the reference density.
- pathnameToTitle still maps /tasks and /runs to titles (pathnameToTitle.ts:9-11) even though those are not sidebar destinations (§0.5). Harmless for crumbs, but it's residue of the old Tasks/Runs IA — worth pruning so the title map matches the post-decision nav set.
- The topbar crumb separator being a dimmed slash rather than the › glyph is a small thing that nonetheless instantly breaks the Linear-faithful feel; chevrons read as hierarchy, slashes read as paths/URLs.

**Écarts (12) :**

#### `DOCK-01` · P0 · architecture — RunDock is built on a foreign/legacy design system (carbon/edge/ash/fog/mineral), not spec tokens

- **Spec :** §0.2 four-tier elevation / §7.3 Page composition / §2 Color roles
- **Loc :** `ui/src/components/shell/RunDock.tsx:26-78; tokens defined in ui/src/index.css:12-28`
- **Actuel :** RunDock renders a bottom bar using bg-carbon/90, border-edge, text-ash/fog/silver/mineral and font-data — a parallel token vocabulary (#111214 carbon, #2e323b edge, #7a7770 ash, #e8e6e1 fog, #4caf7d mineral) that does not exist in the approved tokens.css. backdrop-blur-md adds a blur fill. It is mounted unconditionally inside AppShell (AppShell.tsx:40).
- **Attendu :** The spec shell (§7) is Sidebar + (Topbar + content). RunDock is not part of it. Per the 2026-05-25 alignment decision (§0), implementation-extras the spec doesn't cover must be hidden behind a default-off flag or removed — not rendered with a competing color system. Elevation must stay within void→surface→raised→overlay using --color-* tokens; no blur fills (§0.2).
- **Fix :** Remove <RunDock /> from AppShell, or gate it behind a default-off flag and track it in IMPLEMENTATION_EXTRAS.md. If kept, re-skin entirely to canonical tokens (bg-surface, border-border, text-fg-dim/fg-muted, font-mono) and drop backdrop-blur. Run state in this design lives inline on the issue (ExecutionLog §17) and in the Drawer (§18), not a global dock.
- _confiance : high_

#### `DOCK-02` · P0 · architecture — SessionWatchRail rendered in shell also uses legacy carbon tokens

- **Spec :** §0.2 / §7.3 Page composition
- **Loc :** `ui/src/components/shell/AppShell.tsx:36; ui/src/components/dashboard/SessionWatchRail.tsx:35-37`
- **Actuel :** AppShell renders <SessionWatchRail mode="overview"> between Topbar and main. The rail uses border-edge, bg-carbon/60, text-dim and font-data — the same legacy system as RunDock, foreign to tokens.css.
- **Attendu :** Not part of the §7 shell composition. Either remove from the shell or, if retained, re-skin to canonical tokens and gate behind a default-off extra. The spec shell is strictly Sidebar + Topbar + scroll content.
- **Fix :** Remove the SessionWatchRail mount from AppShell (or flag it off), and if it survives, replace edge/carbon/dim/font-data with border-border/bg-surface/text-fg-dim/font-mono.
- _confiance : high_

#### `SIDE-01` · P1 · layout — Sidebar missing the mandated PINNED section and its dividers

- **Spec :** §7.1 Required nav set (post-decision)
- **Loc :** `ui/src/shell/Sidebar.tsx:104-123`
- **Actuel :** Nav is Inbox/Issues/Agents, then a flex spacer (line 110), then Settings, then a 'You' profile tile. There is no divider after Agents, no PINNED eyebrow section for saved views, and no divider before Settings.
- **Attendu :** §7.1 nav set: Inbox · Issues · Agents → divider (1px border, margin 14 0 10 0) → PINNED section header eyebrow (10.5/600 uppercase, fgDim) with saved-views slot → divider → Settings.
- **Fix :** Insert after the Agents nav block: a <div className="my-[10px] mt-3.5 h-px bg-border"/> divider, then a PINNED eyebrow (text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-dim px-2), then the saved-views list, then another border divider above Settings. Use flex-1 spacer only after PINNED if desired.
- _confiance : high_

#### `SIDE-02` · P2 · typography — Nav item font-size is 13.5px, spec is 13px

- **Spec :** §7.1 Nav items (fontSize 13) / §1 t-13
- **Loc :** `ui/src/shell/Sidebar.tsx:41`
- **Actuel :** NavRow uses text-[13.5px].
- **Attendu :** Sidebar item label is the t-13 token: 13px / 400 (font-medium only when active). §7.1 explicitly: 'fontSize 13'.
- **Fix :** Change text-[13.5px] to text-[13px] on the NavRow Link (line 41).
- _confiance : high_

#### `SIDE-03` · P1 · iconography — Nav icons render at 16px, spec is 14px

- **Spec :** §7.1 'icon size 14' / §5.1 size 14 = sidebar item
- **Loc :** `ui/src/shell/Sidebar.tsx:54`
- **Actuel :** NavRow Icon uses size={16}.
- **Attendu :** Sidebar nav icon size 14 (§7.1 and §5.1 table 'sidebar item' = 14).
- **Fix :** Change size={16} to size={14} on the NavRow <Icon> (line 54).
- _confiance : high_

#### `SIDE-04` · P1 · geometry — Active rail anchored at left-0, spec is left:-10 (inset into the 12px gutter)

- **Spec :** §7.1 'ACTIVE RAIL: 2px wide tab pinned at left -10, top 6, bottom 6, radius 2'
- **Loc :** `ui/src/shell/Sidebar.tsx:47-50`
- **Actuel :** Active rail span is positioned left-0 inside the padded nav row, so it sits at the row's text-padding edge rather than against the sidebar wall.
- **Attendu :** Rail sits at left:-10px so it hangs into the sidebar's 12px horizontal padding (flush against the left wall), top 6 / bottom 6, w 2px, radius 2, bg accent.
- **Fix :** Change left-0 to -left-[10px] on the rail span (line 49). top/bottom 6 (top-[6px] bottom-[6px]) and w-[2px] rounded-[2px] bg-accent are already correct.
- _confiance : high_

#### `SIDE-05` · P2 · spacing — Workspace tile row gap is 10px, spec is 9px

- **Spec :** §7.1 Workspace tile 'row gap 9'
- **Loc :** `ui/src/shell/Sidebar.tsx:79`
- **Actuel :** Workspace tile row uses gap-2.5 (10px).
- **Attendu :** Workspace tile row gap 9 (§7.1).
- **Fix :** Change gap-2.5 to gap-[9px] on the workspace tile row (line 79).
- _confiance : medium_

#### `SIDE-06` · P2 · spacing — Search row horizontal padding is 10px, spec is 9px

- **Spec :** §7.1 Search row 'padding 6 9'
- **Loc :** `ui/src/shell/Sidebar.tsx:93`
- **Actuel :** Search button uses px-2.5 py-1.5 = 10px / 6px.
- **Attendu :** Search row padding 6 9 → py 6, px 9.
- **Fix :** Change px-2.5 to px-[9px] (keep py-1.5 = 6px) on the search button (line 93).
- _confiance : medium_

#### `SIDE-07` · P2 · architecture — Extra 'You' user profile tile in sidebar footer not in spec §7.1

- **Spec :** §7.1 Required nav set (ends at Settings) / §0 alignment decision
- **Loc :** `ui/src/shell/Sidebar.tsx:124-130`
- **Actuel :** A 24px Avatar + 'You / local operator' tile is rendered below Settings. The spec's sidebar terminates at Settings; no user-profile tile is specified.
- **Attendu :** §7.1 enumerates the full sidebar contents and stops at Settings. Additions the spec doesn't cover should be hidden or tracked as an extra, not rendered by default.
- **Fix :** Remove the 'You' tile (lines 124-130), or relocate it into the workspace tile / a Settings flyout, or gate behind a default-off flag and log in IMPLEMENTATION_EXTRAS.md.
- _confiance : medium_

#### `TOP-01` · P1 · typography — Breadcrumb separator is '/' (slash), spec is '›' chevron glyph

- **Spec :** §7.2 'Separators are › glyphs with fgDim color'
- **Loc :** `ui/src/shell/Topbar.tsx:24`
- **Actuel :** Crumb separator renders <span className="opacity-50">/</span> (a forward slash dimmed via opacity).
- **Attendu :** Separator is the › (single right-angle quote) glyph, colored fgDim — not a slash, not opacity-faked.
- **Fix :** Replace the '/' with '›' and color it text-fg-dim instead of opacity-50: <span className="text-fg-dim">›</span> (line 24).
- _confiance : high_

#### `TOP-02` · P2 · geometry — Topbar right cluster missing the 1×18 vertical divider before primary action

- **Spec :** §7.2 'Right cluster: action buttons (sm), separated by a 1×18 vertical divider in --sk-border with margin 0 4px'
- **Loc :** `ui/src/shell/Topbar.tsx:36`
- **Actuel :** Right cluster is a plain flex gap-2 row with no divider element; the divider (when needed) would have to be injected by each page's right slot, and TopbarStatus (TopbarStatus.tsx:24-55) does not include one.
- **Attendu :** Right cluster groups should be separated by a 1px × 18px --sk-border vertical divider with margin 0 4px (e.g. between meta/secondary actions and the primary action).
- **Fix :** Provide a shared divider element (<span className="mx-1 h-[18px] w-px bg-border"/>) the Topbar or page right-slots use to separate action groups, per §7.2.
- _confiance : medium_

#### `TOP-03` · P2 · architecture — TopbarStatus uses non-canonical surface Btn variant and is itself an unspecced cluster

- **Spec :** §6.5 Btn kinds (primary/secondary/ghost/danger) / §7.2 right cluster
- **Loc :** `ui/src/shell/TopbarStatus.tsx:47-54; variant defined ui/src/ui/Btn.tsx:8,26`
- **Actuel :** TopbarStatus is the default topbar right cluster (AppShell.tsx:33) showing a clock, active count, attention link, and a refresh Btn with kind="surface". §6.5 notes the surface variant is 'currently unused on these screens', and the clock/idle status cluster is not part of the §7.2 spec.
- **Attendu :** Right cluster should use spec'd Btn kinds (ghost sm for icon-only actions) and contain only spec'd affordances; the live clock + active-count cluster is an implementation extra.
- **Fix :** Switch the refresh button to kind="ghost" size="sm" (§6.5). Reassess the clock/idle/active cluster against §7.2 — either spec it or move it to an extras-gated location.
- _confiance : low_
