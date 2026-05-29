# Design brief — Superkick UI, full redesign (2026-05)

**To:** design (claude design)
**From:** engineering
**Status:** brief for a from-scratch visual redesign

## Why we're restarting

Superkick is a local-first tool: **Linear issue → worktree → playbook → agent run → PR** (Rust backend + React 19 UI). The previous design round (`docs/design/issue-centered-v1`, artboards A1/A2/A3) drifted into an unreliable target:

- it **predates product decisions** (it still shows Tasks/Runs in the sidebar; the product later made the Issue the anchor);
- it renders **idealized data** the real app doesn't have (full filter chips, every row with sub-counts/estimates) — so the live app always looked "sparser" and "off";
- it left **key visual questions ambiguous** (page-floor elevation, whether the activity feed has connector lines, input tiers) — engineering had to guess by pixel-sampling, which produced visible incoherences.

So we're redesigning the **visual layer from scratch** — but keeping the **product model** (below). North star: **Linear** — calm density, keyboard-first, restrained color, status/priority glyph vocabulary.

## Scope boundary (read first)

You produce the **design reference only** — the coded HTML/CSS + legend — under `docs/design/redesign-2026-05/artifacts/`. **Do not modify any file under `ui/src/`.** Implementation into the running app is done by engineering against your reference. This separation (design authors the reference → engineering implements it) is exactly what prevents the interpretation-drift that derailed the previous round.

## Deliverable — non-negotiable for pixel-perfect integration

1. A **coded reference**, not images: a self-contained `.html` (or small set) that uses **CSS custom properties for every token** (color, type scale, spacing, radii, shadows, motion). Engineering reads exact values straight from it. PNG-only mockups recreate the exact problem we're escaping (engineers re-interpret → drift).
2. Every surface rendered with **realistic data that matches the app's real shapes** (see "Data" below). Include the **sparse cases** (no estimate, no project, no linked run, empty description) — show how an empty/omitted field looks, not just full rows.
3. **Dark theme is primary** (light optional, 1:1 token swap if provided).
4. Each surface shows its **states**: empty / loading / active / needs-human / done — each artboard labeled.
5. A one-page **system legend**: the full token table + an explicit **elevation & color map** (which surface uses which tier) + the motion specs. This legend is what kills the ambiguity.

## Product model — HARD constraints (do not redesign these away)

1. **The Issue is the anchor.** Tasks and Runs are **not** navigation destinations. Agent execution renders **inline on the issue** (an "ExecutionLog" section) and drills into a **right-edge drawer**. A standalone run page exists only as a deep-link/debug surface.
2. **Operator decisions happen on the issue** — when an agent needs a human, an Approve / Reject / Comment banner appears **on the issue**, never buried in the drawer.
3. **Status & priority use Linear's glyph vocabulary.** Status: `backlog · todo · in_progress · in_review · done · cancelled` + a Superkick **`needs_you`** state. Priority: `urgent · high · medium · low · none`.
4. **Sidebar nav set:** Inbox · Issues · Agents · Settings, plus a Pinned / saved-views section. **No Tasks/Runs entries.**

## Surfaces to design (priority order)

1. **Issues list** *(top priority)* — list rows, group headers (grouped by status, with a pinned "Needs you" group on top), view tabs, filter bar + filter dropdown, hover preview card, and the kanban view. Row carries: priority glyph, status glyph, identifier, title, labels, sub-issue count, project, estimate, assignee, relative-updated, and one Superkick **agent-state dot** (needs/running/review/shipped).
2. **Issue detail** — left body: description (markdown) → inline **ExecutionLog** (run state chip, phase tracker, recent activity, files changed, worktree/how-to-test) → **activity feed** (interleaved human comments + system/timeline events) → composer. Right: **properties rail** (status, priority, assignee, labels, project, cycle, estimate, due date, relations, created/updated footer).
3. **App shell** — sidebar + topbar (breadcrumbs + per-page action cluster).
4. **Run drawer** — slide-in over the issue: run identity + context strip + tabs (activity / tool calls / files / logs / terminal).
5. **Run inspector / task cockpit** — deep-link/debug surfaces (lower priority).

## Decisions to make EXPLICIT (these ambiguities caused the churn — decide and SHOW them)

- **Elevation map.** Define the tiers and assign each surface precisely: page floor, content cards, right rail, inputs, section headers, code blocks. (Last round it was unclear whether the issue-detail body floor was the darkest tier or the card tier → visible incoherence. Pick one and render it everywhere.)
- **Activity feed connector.** Is there a vertical line linking events/comments down the gutter (Linear has one)? Decide and render it for both comment cards and system events.
- **Inputs.** Which tier/treatment — they must not recede *below* their surrounding surface (a dark input on a dark floor reads as a hole).
- **Per-entity colors.** A fixed, legible palette for agent/person avatars — **not** hash-based (hashing produces look-alike neighbours).
- **Real-data sparsity.** Show the row/card/rail with partially-empty data and define the omitted-field treatment (spacer vs hidden vs placeholder).

## Data — design against the real shapes, not fiction

The real field definitions live in **`ui/src/types/`** — read these so the design matches what the app actually has:

- `issues.ts` → `LinearIssueListItem` (list row), `IssueDetailResponse` (detail), `IssueStatus`, `IssuePriority`, `IssueLabel`, `IssueAssignee`, `IssueProject`, `IssueCycle`.
- `issuesView.ts` → grouping/board model. `executionLog.ts` → phases + activity rows + file changes. `runs.ts`, `launchQueue.ts`, `issueHistory.ts` → run/queue/timeline shapes.

Notable nullable fields to design empty states for: `assignee`, `project`, `cycle`, `estimate`, `completed_at`, linked run, `description` (empty string). The list row's `team_id`, `parent`, `children`, `blocked_by` exist but are mostly used for behavior, not display.

## What engineering already has (lean on it for behavior, replace freely for visuals)

- A working React component tree covering all surfaces + states, and a current token file `ui/src/styles/tokens.css`. The current build is **green** and structurally Linear-faithful — use it as a **functional reference** for data shapes, states, and information architecture. You are free to define a **fresh token system**; if you do, keep token names descriptive/mappable so engineering can wire them cleanly.
- Reference of the prior intent (use critically, much is stale): `docs/design/issue-centered-v1/SPEC.md` and the gap analysis at `docs/design/issue-centered-v1/realignment-2026-05/AUDIT.md`.

## Acceptance (how engineering will integrate)

Engineering replicates the coded reference value-for-value. A surface is "done" when its live render matches the reference artboard at the configured pixel threshold (we have a visual-parity harness, `ui/visual-parity/`). So: anything the reference doesn't make explicit (a color, a tier, a connector, an empty state) becomes an engineering guess — please make it explicit in the coded reference + legend.
