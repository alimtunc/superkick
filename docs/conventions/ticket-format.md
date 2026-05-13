# Ticket Format Conventions — Superkick

Project-specific shapes that Turkit-generic workflow skills should follow when working a Superkick ticket. The generic *process* lives in Turkit; the *shape* of plans, handoffs, and test instructions lives here.

## Reuse-scan checklist

Before writing a plan, scan for existing pieces to reuse — adaptive to the stack touched:

- **Backend** — crates listed in [CLAUDE.md](../../CLAUDE.md): `superkick-api`, `superkick-core`, `superkick-config`, `superkick-runtime`, `superkick-storage`, `superkick-integrations`. Look at existing `thiserror` error domains, axum extractors, sqlx queries, serde structs.
- **Frontend** — `ui/src/types/**` (shared barrel), `ui/src/hooks/`, `ui/src/components/`, existing TanStack Query hooks, Zustand stores.
- **Cross-stack** — both surfaces, plus the API contract boundary (`crates/superkick-api` routes ↔ `ui/src/api.ts`).

## Plan template

Plans live at `.claude/plans/<TICKET>.md`. Body stays in French — that's the operator's working language.

```markdown
# SUP-XXX — <Title>

## Résumé (reformulé)
<2–3 lignes>

## Stack touché
<backend | frontend | cross-stack>

## Critères d'acceptation
1. <vérifiable>
2. ...

## Reuse check
- <file/module> — reused / not reused because <reason>

## Fichiers à toucher
<!-- Mono-stack: one flat list.
     Cross-stack: split into Backend / Frontend blocks. -->
- path/to/file — pourquoi + approche

## Contrat API
<!-- Only if cross-stack. Otherwise omit this section. -->
- Endpoint, request/response shapes, error variants

## Branche proposée
<conforme à docs/conventions/workflow.md>

## Risques / zones floues
<liste ou "aucun">
```

## ticket-execute handoff format

After implementing, emit this block verbatim (French labels — keep as-is):

```
Ticket         : SUP-XXX
Worktree       : <absolute path>
Branche        : <name>
Fichiers modifiés :
  - path — <1-line summary>
Critères couverts    : [1, 2, 3]
Critères non couverts: [] (or reasons)
Tests manuels faits  : <list or "pending">
Blockers             : <list or "aucun">

Next steps (operator invokes):
 1. /test-instructions
 2. /pre-pr-review
 3. commit & /ship
```

## test-instructions résumé

The test-instructions checklist must end with a 2–3 sentence **Résumé** in French describing what was implemented, the expected behaviour, and points d'attention. Everything else in the checklist stays in English / code.

## Split-first proposal

When triage routes a ticket to `split-first`, write the proposal to `.claude/plans/<TICKET>-split.md`:

```markdown
# SUP-XXX — Split proposal

## Raison du split
<pourquoi le ticket ne tient pas en un seul merge>

## Sous-tickets proposés
### SUP-XXX.1 — <titre>
Scope : ...
Critères d'acceptation :
  1. ...

### SUP-XXX.2 — ...
```

Stop after writing. The operator reviews and creates the Linear sub-tickets themselves.
