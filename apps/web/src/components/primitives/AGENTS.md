# `apps/web/src/components/primitives/` — pure UI atoms

shadcn/base-ui wrappers and Linear-style atoms. The lowest layer. Nothing here knows Superkick
exists. This is the home shadcn writes to (`components.json` → `"ui": "@/components/primitives"`).

## What goes here

- Form atoms: `button`, `input`, `textarea`, `label`, `switch`, `Toggle`.
- Display atoms: `badge`, `pill`, `card`, `separator`, `tooltip`, `table`, `section-heading`,
  `client-date-time`, `disclosure`, `Icon`, `Dot`, `Avatar`, `Kbd`, `Inline`, `Sparkline`.
- State atoms: the `state-*` set (`state-empty` / `-loading` / `-error` / `-async` / `-empty-tab`).
- The two sanctioned inline-SVG state glyphs: `StatusIcon`, `PriorityIcon` (lucide has no
  partial-fill / stacked-bar equivalent — see [visual-design.md](../../../../docs/conventions/visual-design.md)).

## What must NOT go here

- **No domain vocabulary.** No `Issue` / `Run` / `Review` / `Agent` / `Pr` / Linear / GitHub in
  props, names, or types. `RunStateBadge` is not a primitive — it lives in `components/app`.
- **No tone / label / status maps.** A primitive takes `kind` / `tone` / `size` props; the mapping
  from a domain value to a tone lives in `lib/domain`. (`StatusIcon` takes a `kind`, not a
  `LinearState`.)
- **No data fetching, no business state machines, no zustand / query.**

## When to extract a new primitive

Only when it is a genuinely generic atom with ≥2 unrelated call sites and no domain meaning. Prefer
adopting an existing primitive or adding a variant prop over creating a near-duplicate. New
interactive atoms wrap base-ui — never hand-roll focus / ARIA / keyboard.
