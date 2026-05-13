---
name: ticket-plan
description: Plans a Superkick ticket before any code. Auto-invoked by ticket-triage for the plan-then-execute path, or called directly by the operator. Fetches the issue, scans the workspace for reuse, writes a structured plan to `.claude/plans/<TICKET>.md`. For small mono-stack plans, auto-invokes ticket-execute in the same session; for larger plans, stops and emits a fresh-session handoff.
---

# Ticket Plan — Superkick

Write the plan, then either continue to execution (small plan) or stop for a fresh-session handoff (large plan).

## Usage

- Auto-invoked by `ticket-triage` when the path is plan-then-execute.
- Invocable directly by the operator when they already know the ticket needs a plan and want to skip triage.

## Preconditions

- No worktree required at this step — plans are written at the repo root on any branch. The worktree is created by `ticket-execute` downstream.
- No code edits allowed. The only file written is `.claude/plans/<TICKET>.md`.

## Process

1. **Fetch the issue** via the Linear MCP tools available. If none is configured, ask the operator for the body. If triage already fetched it in this session, reuse that context instead of re-fetching.

2. **Scan for reuse**, adaptive based on the stack classification:
   - **Backend** — the crates listed in `CLAUDE.md`: `superkick-api`, `superkick-core`, `superkick-config`, `superkick-runtime`, `superkick-storage`, `superkick-integrations`. Check existing `thiserror` error domains, axum extractors, sqlx queries, serde structs.
   - **Frontend** — `ui/src/types/**` (shared types barrel), `ui/src/hooks/`, `ui/src/components/`, existing TanStack Query hooks and Zustand stores.
   - **Cross-stack** — both surfaces, plus the API contract boundary (`crates/superkick-api` routes ↔ `ui/src/api.ts`).

3. **Write the plan** to `.claude/plans/<TICKET>.md` using the template below.

4. **Display the plan** to the operator (status message with the file path + a one-line summary of each acceptance criterion).

5. **Decide on auto-execution** using the criteria below, then either auto-invoke `ticket-execute` or stop with a handoff prompt.

## Auto-chain decision

Invoke `ticket-execute` in the **same session** only when **all** of these hold:

- Plan has ≤ 3 numbered acceptance criteria.
- Stack is mono-stack (backend *or* frontend, never cross-stack).
- No migration, no schema change, no new crate, no new top-level `ui/src/` module.
- The current session hasn't already done significant unrelated work before the plan (i.e., the session is fresh, typically coming straight from `ticket-triage`).

Otherwise **stop** and emit the fresh-session handoff:

```
Plan écrit : .claude/plans/SUP-XXX.md
Critères : <n> — <cross-stack | migration | multi-crate | session déjà chargée>

Reprends dans une nouvelle session avec :
---
Invoque ticket-execute sur SUP-XXX. Le plan est validé dans .claude/plans/SUP-XXX.md.
---
```

When auto-chaining: the operator sees the plan in the preceding status message. If they want to review before execution, they interrupt; otherwise `ticket-execute` starts immediately.

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

- No code edits during planning. No file writes outside `.claude/plans/<TICKET>.md`.
- May auto-invoke `ticket-execute` **only** when the auto-chain criteria above hold. Never chains into any review skill.
- If the ticket is too vague to produce numbered acceptance criteria, surface this in "Risques / zones floues" and suggest falling back to triage with `split-first` instead of auto-chaining.
- MCP-agnostic: never hardcode a Linear MCP server name. Describe the capability.
