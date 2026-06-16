# @superkick/web

The Superkick dashboard — React 19 + Vite + Tailwind v4 + TanStack (Router/Query/Form), zustand,
shadcn/base-ui. One of the workspace apps under `apps/` (sibling: `apps/desktop/`, the Tauri shell;
backend lives in `crates/`).

## Develop

From the **repo root** (the pnpm workspace root):

```bash
pnpm install            # installs all workspace apps
just dev                # API + dashboard together (recommended)
# or just the dashboard:
pnpm -C apps/web dev    # Vite on http://localhost:5173, proxies /api to the local API
```

## Scripts (`pnpm -C apps/web <script>`)

| Script              | Does                                   |
| ------------------- | -------------------------------------- |
| `dev`               | Vite dev server                        |
| `build`             | `tsc -b` typecheck + `vite build`      |
| `test` / `test:run` | Vitest (watch / once)                  |
| `lint`              | oxlint (`../../.oxlintrc.json`)        |
| `fmt` / `fmt:check` | oxfmt (`../../.oxfmtrc.json`)          |

## `src/` layout

```txt
components/
  primitives/   # shadcn/base-ui wrappers + pure atoms (no domain words)
  composites/   # generic interaction/layout shells (no domain nouns)
  app/          # Superkick house patterns reused by 2+ domains
domains/        # per-feature UI + view-models (issues, reviews, agents, runs, launch, settings)
lib/domain/     # headless cross-domain logic + tone/label maps (no React/DOM/Tailwind)
api/  hooks/  stores/  routes/  types/  styles/  shell/
```

Import direction: `primitives ← composites ← app ← domains ← routes`. Each shared layer has an
`AGENTS.md` with its rules. Path alias: `@/* → src/*`. There is **no** `src/ui` folder. See
[`../../docs/conventions/frontend.md`](../../docs/conventions/frontend.md).
