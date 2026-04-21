---
name: ticket-plan
description: Operator-invoked. Plan a Superkick ticket before any code. Fetches the issue, scans the workspace for reuse, writes a structured plan to `.claude/plans/<TICKET>.md` for operator validation, then stops. No code changes. Does not auto-invoke ticket-execute.
---

# Ticket Plan — Superkick

Session 1 of the plan-then-execute path. Write the plan, stop, let the operator validate.

## Usage

Dispatched by the operator after `ticket-triage` routed the ticket to plan-then-execute.

## Preconditions

- No worktree required — plans are written at the repo root on any branch.
- No code edits allowed. The only file written is `.claude/plans/<TICKET>.md`.

## Process

1. **Fetch the issue** via the Linear MCP tools available. If none is configured, ask the operator for the body.

2. **Scan for reuse**, adaptive based on the stack classification:
   - **Backend** — the crates listed in `CLAUDE.md`: `superkick-api`, `superkick-core`, `superkick-config`, `superkick-runtime`, `superkick-storage`, `superkick-integrations`. Check existing `thiserror` error domains, axum extractors, sqlx queries, serde structs.
   - **Frontend** — `ui/src/types/**` (shared types barrel), `ui/src/hooks/`, `ui/src/components/`, existing TanStack Query hooks and Zustand stores.
   - **Cross-stack** — both surfaces, plus the API contract boundary (`crates/superkick-api` routes ↔ `ui/src/api.ts`).

3. **Write the plan** to `.claude/plans/<TICKET>.md` using the template below.

4. **Stop**. Display the plan and ask the operator to validate. Do not invoke `ticket-execute`.

## Plan template

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

## Hard constraints

- No code edits. No file writes outside `.claude/plans/<TICKET>.md`.
- Never invoke `ticket-execute`.
- If the ticket is too vague to produce numbered acceptance criteria, surface this in "Risques / zones floues" and suggest falling back to triage with `split-first`.
- MCP-agnostic: never hardcode a Linear MCP server name. Describe the capability.
