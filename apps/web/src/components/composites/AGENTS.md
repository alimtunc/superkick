# `apps/web/src/components/composites/` — generic interaction shells

Reusable interaction / layout shells built from primitives. They own a11y, focus, and keyboard
wiring so domains don't re-implement it. **No domain nouns.**

## What goes here

- Overlays: `dialog-shell`, `popover-shell`, `menu-shell`, `combobox-shell`, `side-drawer`,
  `confirm-dialog`.
- Layout / navigation: `tab-bar`, `sidebar`, `resizable`, `detail-shell`.
- Form scaffolding: `field`, `menu-select`.
- `external-link` (opens via the Tauri opener / browser).

## What must NOT go here

- **No domain noun** in the name, props, or types (`Issue`, `Run`, `Review`, `Agent`, `Pr`, Linear,
  GitHub). An `IssueDialog` is a domain component; a `DialogShell` is a composite.
- **No domain data / fetching.** A composite takes children, slots, and callbacks; it never knows
  what a Run or an Issue is.
- **No tone / status maps** — those live in `lib/domain`.

## Rules

- Imports primitives only. Never `app/`, never a domain. Never imports up the layer stack.
- Built on base-ui for anything interactive — never hand-roll focus traps, ARIA, or keyboard.
- A shell used by exactly one screen is **not** a composite — keep it next to that screen.
