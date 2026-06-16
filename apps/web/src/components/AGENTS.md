# `apps/web/src/components/` — shared UI layers

Three layers of **cross-domain** UI, in increasing Superkick-specificity. A file moves **up** a
layer only when reuse is proven, never speculatively.

| Layer         | Knows about                                   | May import                             | Examples                                          |
| ------------- | --------------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| `primitives/` | nothing domain                                | base-ui, tailwind, other primitives    | `button`, `input`, `pill`, `Icon`, `StatusIcon`   |
| `composites/` | interaction / a11y, **no domain nouns**       | primitives                             | `dialog-shell`, `side-drawer`, `tab-bar`, `field` |
| `app/`        | Superkick visual language, used by ≥2 domains | primitives + composites + `lib/domain` | `TaskBadge`, `badges/*`, status/PR chips          |

## Import direction (never violate)

```
primitives  ←  composites  ←  app  ←  domains  ←  routes
```

- `primitives` imports only base-ui, tailwind, and other primitives. Never composites/app/domains.
- `composites` imports primitives. Never app/domains. Never a domain noun (`Issue`, `Run`, `Pr`…).
- `app` imports primitives + composites + `lib/domain`. Never a specific domain's components.
- `domains/<x>` imports any of the three layers + `lib/domain`. Never another domain's internals.

Each layer has a barrel: `primitives/index.ts` re-exports every primitive (`export *`, shadcn
atoms included); `app/index.ts` is explicit named. Import primitives from the
`@/components/primitives` barrel — never a deep file path. The one exception: files **inside**
`primitives/` import siblings deep/relative, so the barrel never imports itself (cycle).

## Where does a new component go?

1. Generic atom, no domain meaning, wraps base-ui → `primitives/`.
2. Generic shell/picker/tabs/dialog, no domain noun → `composites/`.
3. Superkick house pattern reused by **2+ domains** → `app/`.
4. Used by exactly one domain → `domains/<x>/components/`, **not** here.

`components/` holds **only** these three layers (plus this doc). Feature UI lives in
[`../domains/`](../domains/AGENTS.md); app chrome (sidebar, topbar, shell) lives in `../shell/`.
Never add a `components/<feature>/` folder.
