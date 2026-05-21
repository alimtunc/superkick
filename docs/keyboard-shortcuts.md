# Keyboard Shortcuts

This document is the source of truth for keyboard bindings in the Superkick dashboard. Bindings introduced by a ticket land here before the PR ships.

## Global

| Keys | Action | Notes |
|---|---|---|
| `⌘K` / `Ctrl K` | Open command bar | Toggles the global ⌘K modal from any route. |
| `Esc` | Close active modal / dialog | When the command bar is open, closes it. |

## Command bar (⌘K) — modal-scoped

The following bindings are active only while the command bar modal is open. They never propagate to the underlying page.

| Keys | Action |
|---|---|
| `↑` / `↓` | Navigate result rows. Wraps at top/bottom. |
| `↵` | Activate selected row (navigate to issue / run / route). |
| `⌘↵` / `Ctrl↵` | Launch task on the current query — opens the composer pre-filled. |
| `Tab` | Cycle scope chips forward (`All → Issues → Comments → Files → Runs → Actions → All`). |
| `Shift+Tab` | Cycle scope chips backward. |
| `Esc` | Close the modal. |
| `i:` / `c:` / `f:` / `r:` | Prefix at the start of the input narrows scope to Issues / Comments / Files / Runs and strips the prefix from the working query. Inactive once a scope is pinned via chip or `Tab`. |

The scoped Issues view hides Done by default. Click `hidden by default · show` in the Done section header to reveal; preference persists across reloads (localStorage key `superkick.search.showDoneInScoped`).

## Reserved — not bound today

These bindings are reserved for upcoming tickets. They are documented here so future implementations don't collide with each other.

| Keys | Reserved for | Surface |
|---|---|---|
| `j` / `k` | Issue list focus next / prev | SUP-225 (IssueRowV2) |
| `l` (lowercase L) | Launch task on focused issue | SUP-225 |
| `c` | New issue from list | SUP-227 |
| `f` | Open Filter dropdown on issues list | SUP-227 |
| `v` | Cycle view (list / kanban) | SUP-227 |
| `g i` | Go to Issues | future |
| `g b` | Go to Inbox | future |

## Collision audit

The ⌘K modal owns `↑ ↓ ↵ ⌘↵ Tab Esc` while open. None of these conflict with shell/Topbar/Sidebar bindings — those have no global keyboard handlers today. Reserved single-letter bindings (`j k l c f v`) are page-scoped to the Issues list once SUP-225 lands; they do not propagate to the command bar.

When a future ticket needs a new global binding, add a row to **Global** above and audit this file before shipping.
