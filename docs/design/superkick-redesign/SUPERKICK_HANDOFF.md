# Superkick — implementation handoff

This document is the bridge between the design canvas (`Superkick design system.html`) and the codebase. Read it before opening tickets.

The canvas is the source of truth for **what the screens look like**. This doc is the source of truth for **what to build, in what order, with what primitives, and where each piece lives in the existing code**.

Each section below maps a screen on the canvas → the file you should touch in the Superkick repo → the foundation tickets it depends on.

---

## 1 · Foundations — do this first

Nothing else lands cleanly until these three things are in place.

### 1.1 Design tokens (SUP-217)

Move every color, radius and font size to CSS variables. Drop the screen-by-screen one-offs.

```css
:root {
  /* surfaces — 4 elevations, no more */
  --sk-void: #0b0d0f;
  --sk-surface: #15181c;
  --sk-raised: #1c2026;
  --sk-overlay: #23282f;

  /* lines & text */
  --sk-border: #262b32;
  --sk-border-strong: #323843;
  --sk-fg: #e7e9ec;
  --sk-fg-muted: #9aa0a8;
  --sk-fg-dim: #6b727b;

  /* accents (sparse use only) */
  --sk-accent: #5b6ef2;
  --sk-accent-soft: rgba(91,110,242,.16);

  /* semantic — status only, never decoration */
  --sk-success: #4ea674;  --sk-success-soft: rgba(78,166,116,.13);
  --sk-warn:    #d4a04a;  --sk-warn-soft:    rgba(212,160,74,.14);
  --sk-danger:  #cf5a55;  --sk-danger-soft:  rgba(207,90,85,.13);
  --sk-info:    #5b8ec9;  --sk-info-soft:    rgba(91,142,201,.13);

  /* code surfaces */
  --sk-code: #0f1114;  --sk-code-fg: #cdd2d8;
}

[data-theme="light"] { /* see canvas — light token set */ }
```

**Rules:**
- Never use a raw hex outside `tokens.css`.
- `--sk-accent` is **only for primary CTAs and active nav indicator**. Not for icons, not for text, not for chart fills.
- Status pills use `--sk-{semantic}-soft` background + `--sk-{semantic}` foreground. Always.
- Maximum 4 surface elevations. If a design seems to need a 5th, the design is wrong.

### 1.2 Typography (SUP-217)

```css
--sk-font: "DM Sans", "Inter", system-ui, sans-serif;
--sk-mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
```

Type scale (do not invent intermediates):

| Use | Size | Weight |
|---|---|---|
| Body | 14 / 1.45 | 400 |
| Body strong | 14 | 500–600 |
| Label / meta | 12 | 400 |
| Eyebrow caps | 11 / 0.8 letter-spacing / uppercase | 600 |
| Page title | 15 | 600 |
| Display | 18 | 600 |
| Numbers | tabular-nums always; mono font for IDs and counts |

### 1.3 Primitive components (SUP-217 cont.)

Build these once. **All screens consume them.**

| Component | File suggestion | Variants |
|---|---|---|
| `<Pill tone>` | `src/ui/Pill.tsx` | `neutral · accent · success · warn · danger · info`, optional `dot`, optional `mono` |
| `<Btn kind size>` | `src/ui/Btn.tsx` | `primary · secondary · ghost · danger · surface` × `sm · md`, optional `icon` + `iconRight` |
| `<Icon name>` | `src/ui/Icon.tsx` | One source for the icon bank. Use lucide-react and re-export only the names in the canvas's `SKI` map. Forbid ad-hoc inline SVGs in screen code. |
| `<Avatar name>` | `src/ui/Avatar.tsx` | Initials disc; `icon` prop for agent bots |
| `<Kbd>` | `src/ui/Kbd.tsx` | Single keycap; rendered in mono |
| `<Dot tone pulse>` | `src/ui/Dot.tsx` | 8px status circle, optional pulse halo |
| `<Spark data>` | `src/ui/Spark.tsx` | 64×20 inline polyline |

Each one is 30–80 lines. They map 1:1 to what's in `screens/sk-primitives.jsx` on the canvas — port the styles, keep the API.

---

## 2 · Shell — the chrome around everything (SUP-217)

**Canvas screens:** "Shell · sidebar + topbar (any page)"

Two components: `<Sidebar/>` and `<Topbar/>`. Then one `<Page/>` wrapper that composes them and slots in the page body.

### Sidebar (`src/shell/Sidebar.tsx`)

- Fixed 224px wide. Full height. `background: var(--sk-surface)`. Right border, no shadow.
- Workspace pill at top: 26px brand square + workspace name + repo subtitle + chev. Click → workspace switcher dropdown.
- Search input row below it (not a real input — `<button>` that opens the command bar). Shows `⌘K` Kbd on the right.
- Nav items: `Inbox · Issues · Tasks · Runs · Agents`. Each row 7×10 padding, 7px radius, `--sk-fg-muted` text, `--sk-fg` when active. Active row has a 2px accent bar on the left + `--sk-raised` background. **Only Inbox shows an accent-coloured count**; the others show muted counts.
- Divider, then "PINNED" eyebrow + pinned items.
- Spacer (`flex: 1`).
- `Settings` row, then user row at the bottom.

**Behaviour:**
- No collapsing. No icon-only mode. (User research showed it gets in the way more than it helps.)
- Hover on a row brightens to `--sk-fg` but keeps the same background unless active.
- Counts update via SSE — no polling.

### Topbar (`src/shell/Topbar.tsx`)

- 52px high, `--sk-surface`, bottom border.
- Left: optional crumbs (small, dim) + title (15px, 600). Optional pills next to title for status (`P2`, `in progress`, etc).
- Right: action buttons. Always ends with the page's primary action (e.g. "Launch task" on Inbox, "New issue" on Issues).
- No tab bar in the topbar. Tabs (when needed) live below it as their own row with a bottom border and 2px accent underline on the active tab.

### Page wrapper (`src/shell/Page.tsx`)

```tsx
<Page active="inbox" title="Inbox" sub={...} right={...}>
  {/* body */}
</Page>
```

Renders Sidebar + Topbar + the body in a flex column. Body gets `flex: 1; min-height: 0; overflow: hidden` so child scroll regions work.

---

## 3 · Inbox (SUP-218)

**Canvas screens:** "Inbox · default", "Inbox · all clear"

This is the **single landing page**. Replace the dashboard.

### Layout

```
Topbar [Inbox  ·  4 need you]                [Filters] [Mark all read] [Launch task ←primary]
─────────────────────────────────────────────────────────────────────
[Needs you · 4]  [Watching · 9]  [All activity · 142]    ← tabs, underline on active
─────────────────────────────────────────────────────────────────────
NEEDS A HUMAN · 4
  ● Run paused — destructive migration            [Block]  [Review & approve ←primary]
    Agent flagged DROP TABLE on 4M rows…
    run-7af2 · payments-api · 4 min ago
  ● Tests pass but coverage dropped 2.4%          [Open run]
    …
UPDATES WORTH A LOOK · 3
  ● PR merged — payments-api #841                 [View PR]
  …
```

### Row component

`<InboxRow tone title why ctx age sub action />` — see `screens/sk-inbox.jsx`. Single row, 14px padding, hairline bottom border. No card chrome.

- **tone** drives only the leading dot color. Don't tint the whole row.
- **why** is the single line that explains *why this is in the inbox*. If you can't write that line, the row doesn't belong here.
- **action** is 1–2 buttons aligned to the right. Primary is the most likely next step (Approve, Open run, View PR).

### Grouping

Group by reason, not by status:
1. "Needs a human · N" — runs paused waiting on you (rule trips, conflicts, loops)
2. "Updates worth a look · N" — runs you're watching that just changed (PR merged, retry passed, new issue assigned)

**Do not** add a third "FYI" bucket. Anything that doesn't fit those two is not Inbox material — surface it in the Watching tab.

### Empty state

The "all clear" screen on the canvas. 56px success circle + check, headline "Inbox zero.", subline acknowledging in-flight runs, single ghost button to flip to the Watching tab. No celebratory illustration.

### Counts

`needsYou` count flows everywhere: sidebar badge, topbar sub, browser title (`(4) Inbox · superkick`), favicon dot. One source of truth — wire it through context, don't re-fetch per consumer.

---

## 4 · Issues list & kanban (no new ticket — already in roadmap)

**Canvas screens:** "Issues · list", "Issues · kanban"

### List

Single grid row, columns: `id  sev  title  status  repo  agent  runs  age`. See `IssueRow` in the canvas. Column header row is sticky with eyebrow-cap labels.

- Severity pill uses semantic tone (`P0/P1` → danger, `P2` → warn, `P3` → info, `P4` → neutral).
- Status pill always has a dot.
- Agent column shows the agent disc + name when assigned, em-dash when not.
- Runs column shows count in mono, right-aligned.
- Age column: relative ("1h", "3d"), right-aligned.

Row click → Issue Detail. No row hover popover, no inline actions. Bulk select is a follow-up.

### Kanban

5 columns: Open · In progress · Needs human · Review · Done. 260px wide each, divided by hairline borders. Card uses `KanbanCard` — id + sev pill on top row, title in the middle, agent disc + optional tag pill + age on the bottom row. `Done` is virtual-scrolled and shows only the last 30; "see all" link at the bottom.

---

## 5 · Issue Detail (SUP-221)

**Canvas screen:** "Issue Detail · running" (single canonical screen; needs-human variant differs only in the last feed node)

This is **one column**, not three. Kill the right rail and the bottom tabs.

### Structure

```
Topbar [crumbs] [title] [ISS-217] [P2] [in progress]    [GitHub] [⋯] [Launch task… ←primary]
─────────────────────────────────────────────────────────────────────
CONTEXT STRIP — facts at a glance, no chrome
REPO · payments-api    OPENED BY · camille 1h ago    WATCHERS · 5    LINKED · #1483 OPS-91   |   LAST RUN · run-7af2 · 2m
─────────────────────────────────────────────────────────────────────
FEED (chronological, vertical timeline)
  ● camille opened the issue           1h ago
      [body card — markdown]
  ● superkick opened run-7af2          58m
      [chips: agent · model · sandbox · budget]
  ● fix-bot reproduced the issue       55m
      [body: short prose + code block]
  ● fix-bot proposed a fix             42m
      [diff card — file header + truncated diff]
  ● fix-bot ran the test suite         38m
      [test summary banner: 3418 passed · coverage 84.6% (+0.3%)]
  ● fix-bot is writing the PR…          now
      [in-progress card with pulse dot]

  [Reply composer at the bottom]
```

### Activity node component

```tsx
<ActivityNode time who role kind link>
  {children}
</ActivityNode>
```

- 22px disc on the left tinted by `role` (user/agent/system/success/warn). Vertical hairline connector to the next node.
- `kind` picks the icon inside the disc: `agent · user · commit · check · flag · system · pr`.
- `link` is the verb ("opened the issue", "proposed a fix"). The component formats it as muted text after the actor name.

Children render with no card chrome by default. Wrap with a card surface (1px border, 8px radius) only when the content is the issue body or a diff.

### Reply composer

Bottom of the feed, always visible. Avatar + placeholder text + bottom action row (attach link / shell / doc + `@ to address an agent` hint + `⌘↵ send` Kbd + `Send` primary button). Sticky? **No.** Let the feed scroll past it naturally; user scrolls to bottom to reply. Avoids the "two stuck things" problem on small viewports.

---

## 6 · Launch Task — composer + feed (SUP-219, SUP-220)

**Canvas screens:** "Launch Task · empty composer", "Launch Task · feed (running)"

### Composer at `/tasks/new` (SUP-219)

This replaces both the header button and the sidebar field. Every "Launch task" CTA in the product navigates here.

- Centered 720px max-width column, vertically centered in the page area.
- Page title h1: "What should we work on?" — set with the `<Topbar title>`.
- Single composer card: `--sk-surface`, 14px radius, 1px border, 18px padding.
  - Body: contenteditable, 16px font, 80px min height. Cursor shown when empty.
  - Bottom row, separated by a 1px divider: chip pickers (`repo · agent · base · sandbox · budget`) + icon ghost buttons (link, doc) + primary `Launch →` button.
- Hint row underneath: `⌘↵ launch · ⌥P pick template · @ reference an issue · Cost estimate ~$0.40`.
- Below the composer: "SUGGESTED STARTS" eyebrow + 3 cards. Each is a one-click pre-fill (clicking populates the composer above, doesn't auto-launch).

### Feed at `/runs/<id>` (SUP-220)

Lives at the Tasks tab when active. Three regions, top to bottom:

1. **Topbar** — title (task title), status pill (running/paused/done), elapsed time, agent pill. Right actions: Pause/Resume, Stop, ⋯.
2. **Plan strip** — sticky under the topbar. Eyebrow "PLAN" + "3 of 5 done" + chip row showing each step with a status dot. Steps not yet started are dashed-border chips.
3. **Feed** — vertical list of `<Evidence>` cards.

### Evidence card

```tsx
<Evidence kind title meta badge body>
```

- `kind` is `tool · edit · test · search · ask · stuck`. Drives the 2px left border color and the icon next to the title.
- Title is one line of plain English ("Ran: go test …", "Wrote tests/webhook_signature_test.go").
- `meta` is right-aligned and mono (timing, diff stats).
- `badge` is an optional Pill (`green`, `paused`, `needs you`).
- `body` is anything: code block, test summary banner, diff preview, mini button row, or `null`. If `null`, the card is a one-liner.

**Forbidden:** terminals embedded in the feed by default. The shell lives in the workspace pane on Run Detail or in a dedicated terminal page. A short tool invocation can show a code block as evidence — full interactive terminals don't go in the timeline.

### Needs-human in the feed

When the agent pauses, the **last** Evidence card switches to `kind="stuck"` and renders its body inside a `--sk-warn-soft` panel with three buttons: `Block · Suggest different approach · Approve`. The same actions appear in the sticky banner on Run Detail (§7) so the user can act without scrolling.

---

## 7 · Run Detail (SUP-222)

**Canvas screens:** "Run Detail · running", "Run Detail · needs human", "Run Detail · completed"

Two-pane layout:

```
Topbar [crumbs] [title] [agent pill] [status]      [Pause] [Shell] [Sandbox] [⋯]
─────────────────────────────────────────────────────────────────────
[NEEDS-HUMAN or COMPLETED banner — sticky, color-tinted, full-width]
─────────────────────────────────────────────────────────────────────
┌─────────────────────────────┬──────────────────────────┐
│ CONVERSATION                │ WORKSPACE                │
│  (RunChat bubbles)          │  Tabs: Changes · Shell · │
│                             │        Tools · Context   │
│                             │                          │
│                             │  [file list w/ diff bar] │
│                             │  [diff preview]          │
│                             │  [resources block]       │
│  [Composer]                 │                          │
└─────────────────────────────┴──────────────────────────┘
```

- Left pane: chat-style log of human ↔ agent messages. **Plan, evidence and code blocks are conversational artifacts that the agent posts** — not a separate timeline. Use `<RunChat>`.
- Right pane: 360px wide, `--sk-surface`. Tabs: Changes (default) · Shell · Tools · Context. Each tab is virtual — switching is instant.
- Status banner is sticky at the top of the body (below the topbar) and only renders for needs-human or completed states. Running state has no banner.

### When to use Run Detail vs Launch Task Feed

| Surface | Audience | Purpose |
|---|---|---|
| **Launch Task Feed** (SUP-220) | The person who launched it | Watch progress live, react to needs-human prompts inline. Optimised for the active session. |
| **Run Detail** (SUP-222) | Anyone — yourself returning later, a teammate auditing | Full review surface: conversation, diff, sandbox, tools used, cost. |

They share data, not layout. SUP-220 ships first; SUP-222 reuses the same `<Evidence>`/`<RunChat>` components.

---

## 8 · Agents (no ticket — keep current, restyle to tokens)

**Canvas screen:** "Agents"

3-column grid of `<AgentCard>`. Each card:
- Avatar disc (bot icon, role-tinted color) + name + role pill + model line.
- Hairline divider.
- Two stats: Runs (30d) + Success rate with sparkline.
- Hairline divider.
- Tag pills (`repos: N`, `PR-auto`, `budget $X`).

Click → agent detail page (not in this round). New agent button opens the agent template flow (also not in this round — keep current).

---

## 9 · Settings · Rules & guardrails (depends on SUP-218)

**Canvas screen:** "Settings · Rules"

Two-pane layout: left settings nav (200px), right body (max 780px content).

Rule rows: label + hint on the left (260px column), status controls on the right. Each row is a hairline-divided horizontal block — no cards, no toggles in the row header.

Rule statuses use semantic pills:
- `on` (success dot) — enforced
- `off` (warn dot) — disabled
- `dry-run` (info dot) — logs but doesn't pause

`Add a rule` is a secondary button at the bottom. Authoring is plain English; compilation to checks is server-side (out of scope here).

---

## 10 · Overlays

### 10.1 Command bar (⌘K)

**Canvas screen:** "Command bar"

580×variable modal, centered top 60px from viewport top. `--sk-overlay` surface, 14px radius, 24/0/0/1 shadow. Sectioned results: Actions · Issues · Runs · Files & docs. First section's first row is selected by default; arrow keys move; `⌘↵` triggers Launch on whatever is selected. Bottom row of hints with Kbd chips.

### 10.2 Launch dialog (compact)

**Canvas screen:** "Launch dialog"

540×variable modal. Same shadow recipe. Used when you launch a task without going to the composer (e.g. from a row hover, from an Issue Detail context menu). Shows the pre-filled context as a `--sk-raised` block, the chip pickers, and a single `Launch` button with an estimate.

If the user wants more control, the "Open in composer →" link in the chip row navigates to `/tasks/new` with the prefill carried over.

### 10.3 Chat drawer

**Canvas screen:** "Chat drawer"

520px right-side drawer (slides in from right with backdrop dim). Header has the agent avatar + name + current run pill ("working on ISS-217 · run-7af2"). Body is the same `<RunChat>` component used in Run Detail. Composer pinned to the bottom.

Used when the user wants to talk to an agent without leaving their current screen — open from any agent disc, or from the run pill in the topbar.

---

## 11 · Light mode (SUP-223)

**Canvas screens:** light-themed variants of Inbox, Issue Detail, Run Detail (toggleable via the theme switch in the canvas top-right)

Direction is **paper-first**, not "dark inverted". Surfaces feel warm and printed; accent shifts from `#5b6ef2` (cobalt-violet on dark) to `#3d52d6` (deeper, holds up on cream).

Switch is per-user with system default detection. CSS uses `[data-theme="light"]` on `<html>`. **All components consume `--sk-*` tokens — they should not branch on theme.** If a component has theme-specific logic, that's a bug.

---

## 12 · Patterns & rules

### Status pills

Every interactive status surface uses the same vocabulary:

| State | Tone | Dot | Where it appears |
|---|---|---|---|
| `running` | info | yes (pulse) | runs in flight |
| `paused`, `needs human`, `blocked`, `review` | warn | yes | anything waiting on you |
| `failed`, `loop` | danger | yes | unrecoverable agent state |
| `shipped`, `done`, `passed` | success | yes | terminal positive |
| `open`, `idle`, draft | neutral | yes | nothing happening yet |
| Severity (`P0…P4`) | danger / warn / info / neutral | no | mono pill, fixed width 32px |

A status pill with no dot is reserved for **labels** (severity, repo name, agent name). A status pill with a dot is reserved for **state**.

### Layout density

- Row padding for list items: 10–14px vertical, 24px horizontal (matches the page gutter).
- Card padding: 12–18px.
- Form rows: 16px vertical gap between rows; 24px gap between label column and value column.
- 4/8/12/16/24/32 only. No 10s, no 14s, no 22s.

### Motion

- 150ms ease-out for hover state changes.
- 220ms cubic-bezier(.2,.7,.3,1) for drawers and modals.
- No spring animations. No bouncy entrances.
- `prefers-reduced-motion`: kill all transitions, snap to end state.

### Numbers

- All IDs (ISS-217, run-7af2, hashes) in mono, tabular nums on.
- All counts (4, 27, 142) in mono.
- All currency ($0.42) in mono.
- Times ("3 min ago", "1h") in the UI sans.

### What never appears

- Emoji as UI affordance
- Drop shadows on cards (use border + tone, not depth)
- Gradient backgrounds (reserved for marketing surfaces — not the app)
- Rounded-corner left-accent containers ("AI tip" style)
- Dot status indicators larger than 8px
- More than 2 primary buttons in a row anywhere
- Toast notifications for non-actionable events (inbox handles those)

---

## 13 · Implementation order

If you can only do one thing per week, do them in this order:

1. **Week 1** — SUP-217 (tokens + primitives + shell). Nothing else moves until this lands.
2. **Week 2** — SUP-218 (Inbox + needs-human glue). Replaces dashboard. Touches sidebar counts.
3. **Week 3** — SUP-219 (Launch composer at `/tasks/new`). Wire every "launch task" CTA to it.
4. **Week 4** — SUP-220 (Launch feed evidence cards). Reuses primitives, no new tokens.
5. **Week 5** — SUP-221 (Issue Detail recompose). Single-column timeline. Kills the right rail.
6. **Week 6** — SUP-222 (Run Detail two-pane). Last of the structural changes.
7. **Week 7** — SUP-223 (Light mode). Pure token work if §1.1 was done right.

Settings, Agents, and overlays restyle as a byproduct of §1 — no dedicated tickets, just a sweep at the end of each week.

---

## 14 · What's not in this design pass

Out of scope, but worth flagging so they don't accidentally regress:

- Mobile / responsive < 1024px. Operator workflow is desktop-first; mobile is read-only and not addressed here.
- Workspace switching UX (the dropdown from the sidebar header).
- Agent detail page and the agent-template authoring flow.
- Billing, plan management, team admin.
- Public share links for runs.

Anything in this list comes back in a separate design round.
