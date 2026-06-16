# `apps/web/src/domains/` — feature domains

Each domain owns the UI and feature-local view-models for one product area. **Domain components
start here by default** — only promote to `components/app` once a second domain reuses them.

## Domains

`agents/` · `chat/` · `command/` · `dashboard/` · `diff/` · `inbox/` · `issues/` · `launch/` ·
`reviews/` · `runs/` · `settings/`

## Per-domain layout

```txt
domains/<x>/
  components/   # feature components (rendering); may nest a former feature folder
  lib/          # feature-local view-models, hooks, formatting (headless), when needed
  index.ts      # optional — the domain's curated public surface
```

A domain that aggregates several former feature folders nests them under `components/` (e.g.
`issues/components/issue-detail/`, `runs/components/{run-detail,run-tabs,…}/`). Add `lib/` or
`index.ts` only when a domain needs them; do not scaffold empty files.

## Rules

- A domain may import `components/{primitives,composites,app}` and `lib/domain`.
- A domain may **not** import another domain's internals. Cross-domain sharing goes **up** into
  `components/app` (UI) or `lib/domain` (logic), then both domains import from there.
- Routes and cross-domain consumers import a domain's components by their path under
  `domains/<x>/components/`. A domain `index.ts` barrel (its curated public surface) is encouraged
  as a domain grows.
- Pure cross-domain logic and status/tone maps belong in `lib/domain` (no React / DOM / Tailwind),
  not in a domain's `lib/`.

## Status (SUP-210)

All feature UI now lives here — `apps/web/src/components/` holds only the shared layers
(`primitives` / `composites` / `app`) plus app chrome in `src/shell/`. New feature UI starts in
`domains/<x>/`, never in `components/`.
