# `apps/web/src/components/app/` — Superkick house patterns

Cross-domain components that speak Superkick's visual language and are reused by **2+ domains**.
This is the only `components/` layer allowed to carry domain vocabulary, and it does so through
`lib/domain` tone/label maps — never by re-implementing domain logic.

## What goes here

- `badges/` — status renderers: `RunStateBadge`, `PrStateBadge`, `CapabilityBadge`,
  `ProviderStatusBadge`, `RuntimeStatusBadge`, `ExecutionModeBadge`.
- House chips reused across domains: `TaskBadge`, `EstimateChip`, `SubCountChip`.

## Rules

- May import `primitives`, `composites`, and `lib/domain`. **Never** imports a specific domain's
  components (no `@/domains/<x>/...`). If it needs a domain's data shape, that's a sign it belongs
  **in** that domain, not here.
- Tone / label / status mapping lives in `lib/domain` (`displayLabels`, `taskBadge`, …). An `app`
  component consumes the map; it does not hardcode the domain→tone table.
- Promote a component here only after a **second** domain consumes it. One consumer → it stays in
  that domain.
