# Frontend Conventions — Superkick

Source of truth for React 19 / TypeScript code in `apps/web/`.
Applies during implementation and review.

## Project layout

The web app is a workspace package under `apps/web/` (sibling of `apps/desktop/`, the Tauri shell;
the Rust backend stays in `crates/`). Inside `apps/web/src`:

```txt
components/
  primitives/   # shadcn/base-ui wrappers + pure atoms. No domain words.
  composites/   # generic interaction/layout shells. No domain nouns.
  app/          # Superkick house patterns reused by 2+ domains (badges, status renderers, error boundary).
domains/        # per-feature UI + view-models — one folder per product area
                #   (agents, chat, command, dashboard, diff, inbox, issues, launch, reviews, runs, settings).
lib/domain/     # headless cross-domain logic + tone/label maps. No React/DOM/Tailwind.
api/  hooks/  stores/  routes/  types/  styles/  shell/   # shell/ = app chrome (sidebar, topbar, dock)
```

Import direction (never violate): `primitives ← composites ← app ← domains ← routes`. Each shared
layer documents its own rules — read the `AGENTS.md` in
[`apps/web/src/components/`](../../apps/web/src/components/AGENTS.md) and
[`apps/web/src/domains/`](../../apps/web/src/domains/AGENTS.md) before adding a component. There is
**no** `src/ui` folder — shadcn/base-ui atoms live in `components/primitives`.

## React 19 API

- **`forwardRef` is banned** — in React 19, `ref` is a standard prop. Declare `ref: Ref<HTMLDivElement>` in the props type and forward it directly.
  - **Why:** `forwardRef` wraps the component in a non-transparent object, which breaks the React Compiler's memoization and confuses devtools. Removing it is mandatory for the compiler to optimise correctly.
- **`React.FC` / `React.FunctionComponent` are banned** — write the component as a typed function: `function Foo(props: FooProps) { … }`.
  - **Why:** `React.FC` implicitly adds `children`, which hides whether a component actually renders children. Typed functions make the contract explicit.
- **`JSX.Element` is banned as a return/prop type** — use `ReactNode` for slots and let inference handle return types.
  - **Why:** `JSX.Element` only admits a single element; `ReactNode` admits fragments, strings, numbers, and arrays — which is what slots actually need.
- **`defaultProps` is banned** — use ES6 default values in the destructuring: `function Foo({ size = 'md' }: FooProps)`.
  - **Why:** React 19 dropped `defaultProps` on function components. It silently does nothing.
- **Prefer `use(MyContext)` over `useContext(MyContext)`** in new code.
  - **Why:** `use` is conditionally callable (inside `if`, loops) and is the forward path. `useContext` still works but is being phased out of new patterns.

## Component structure

- **One component per file.** Split by default; colocate only when two components are genuinely coupled (e.g. a compound component's subparts).
  - **Why:** single-component files are trivial to find, move, and rename. Files with three unrelated components cause import noise and make git diffs harder to read.
- **Named exports only** — no `export default`.
  - **Why:** named exports rename-refactor cleanly across the codebase (IDE follows the symbol), survive re-export via barrels, and eliminate the "is it default or named?" coin-flip at import time.
- Extract hooks when a component holds business logic. Components render; hooks decide.

## Conditional rendering & empty states

- **`condition ? <X /> : null`**, never `condition && <X />`.
  - **Why:** `0 && <X />` renders `0` to the DOM. `"" && <X />` renders nothing but passes `""` as a child. The ternary makes the "nothing here" branch explicit and typesafe.
- **Empty returns: `return null`**, never `return <></>`.
  - **Why:** empty fragments are valid but meaningless; `null` is the idiomatic "render nothing" signal.

## Types

- **Shared type declarations live in `apps/web/src/types/**`**, split by sub-domain (`runs.ts`, `issues.ts`, `attention.ts`, …). Import through the barrel: `import type { Run } from '@/types'`.
- Exported type declarations **outside** `src/types/**` are banned, with these narrow exceptions:
  - Component `*Props` interfaces (colocated with their component).
  - Hook return-type aliases defined via `ReturnType<typeof useXxx>` (must stay with the hook).
  - `src/routes/**` — routing types (`RouterContext`, `AppRouter`).
  - `src/stores/**` — Zustand store/state/actions types.

  **Why:** when domain types scatter across feature folders, two things happen: (1) imports diverge (`import { Run } from '@/features/runs'` vs `'@/types'`), and (2) refactors across features require touching N files instead of one. Centralised domain types keep the app's mental model stable.

- **No `any`.** If a type is unknown at a boundary, use `unknown` and narrow explicitly.
  - **Why:** `any` poisons inference downstream. `unknown` forces the narrowing to happen at the boundary, where the context exists.

## Naming

- Descriptive names: `label`, not `l`; `issue`, not `i`; `priority`, not `p`. Single letters are fine only for generic type parameters and trivial loop indices.
- Components are `PascalCase`, hooks are `useCamelCase`, utilities are `camelCase`, constants are `SCREAMING_SNAKE_CASE`.

## Data fetching & state

- No direct `fetch` in components — go through a typed API function (in `apps/web/src/api/**` or equivalent).
- Business logic lives in hooks, not in components. A component that computes anything beyond trivial derivation is a hook waiting to be extracted.
- Server state: TanStack Query. Client state: zustand. URL state: TanStack Router. Do not mix roles.

## UI components

- Use shadcn components first (`pnpm dlx shadcn@latest add <component>`) — they live in `apps/web/src/components/primitives/` (the `components.json` `ui` alias points there).
- Drop down to `@base-ui/react` primitives only if no shadcn component covers the use case.
- **Never hand-roll** interactive UI (switch, dialog, dropdown, combobox, tooltip) when a shadcn or base-ui primitive exists.
  - **Why:** hand-rolled interactive components miss accessibility wiring (focus traps, ARIA, keyboard) and diverge in styling from the rest of the app.

## Tailwind v4

- Use Tailwind utilities. Add a custom class only when no utility (or sensible combination) exists.
- Theme tokens live in `@theme` blocks in CSS — do not hardcode hex colours in components.

## Visual design

- Surfaces, density, typography, icons, and interactive states are governed by [visual-design.md](./visual-design.md). Read it before adding a new surface or chip.
- Status / domain pills go through `Pill` ([apps/web/src/components/primitives/pill.tsx](../../apps/web/src/components/primitives/pill.tsx)). The shadcn `Badge` stays for shadcn-internal slots (form errors, etc.); domain code uses `Pill`.
- Empty / loading / error states use the shared `EmptyState` / `LoadingState` / `ErrorState` primitives — never inline a placeholder string.
