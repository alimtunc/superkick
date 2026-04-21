---
name: ticket-triage
description: Operator-invoked entry point for any Superkick ticket. Fetches the Linear issue, evaluates scope, picks the path (one-shot / plan-then-execute / split-first), and emits a copy-pasteable prompt for the next step. Does not auto-chain.
---

# Ticket Triage — Superkick

Route a Linear ticket to the right workflow path. Invoked explicitly by the operator or by Codex; Claude does not call this skill on its own.

## Usage

```
Invoke ticket-triage on SUP-XXX
```

Or paste a free-form description when no Linear ticket exists yet.

## Process

1. **Fetch the issue** via the Linear MCP tools available in the session. If no Linear MCP is configured, ask the operator to paste the ticket body — do not guess from the ID.

2. **Classify the stack touched**:
   - `backend` — Rust crates only.
   - `frontend` — `ui/` only.
   - `cross-stack` — at least one Rust crate *and* `ui/`.

3. **Classify the path**:
   - **one-shot** — diff describable in one sentence *and* mono-stack. Examples: rename a prop, add a translation key, fix a label.
   - **plan → execute** — default for any non-trivial or cross-stack work. Ticket is coherent and mergeable as one unit with clear acceptance criteria.
   - **split-first** — exceptional. Only when the ticket genuinely mixes concerns or is too vague to write good acceptance criteria.

4. **Apply Superkick-specific guardrails**:
   - Cross-stack → never one-shot. Contract must be pinned in a plan first.
   - Any ticket touching `crates/superkick-api` routes *and* `ui/src/` → cross-stack.
   - Mentions "migration", "schema change", or "storage", or crosses >3 crates → plan-then-execute even if one-sentence describable.

5. **Emit the triage report + a single next-step prompt**. Stop. Do not invoke `ticket-plan` or `ticket-execute` — the operator decides.

## Output format (strict)

```
Ticket : SUP-XXX — <short title>
Path   : <one-shot | plan-then-execute | split-first>
Stack  : <backend | frontend | cross-stack>
Reason : <1–2 sentences>

Next prompt (paste into a fresh Claude session):
---
<ready-to-use prompt for the chosen path — see templates below>
---
```

## Next-prompt templates

**one-shot:**

```
Implémente directement SUP-XXX.

Fetch le ticket via les outils Linear MCP disponibles pour confirmer le scope, puis implémente.

Invoque le skill : ticket-execute (il gère le worktree, la branche et les conventions Superkick). À la fin, invoque test-instructions.

Contraintes dures :
- Pas de commit sans validation.
- Pas de `as T`, pas de `any`, pas de `cond && <X />` en JSX.
- Reuse-first : scan les crates Rust / ui/src avant de créer.

Handoff strict : format dicté par ticket-execute.
```

**plan-then-execute:**

```
Prépare le plan pour SUP-XXX.

Invoque le skill ticket-plan. Fetch le ticket via les outils Linear MCP disponibles, scanne la codebase pour le reuse (crates Rust pertinentes + ui/src), et écris le plan dans .claude/plans/SUP-XXX.md.

Aucun code modifié. Tu t'arrêtes après avoir écrit le plan et tu me l'affiches pour validation.
```

**split-first:**

```
Prépare un split proposal pour SUP-XXX.

Fetch le ticket via les outils Linear MCP disponibles, évalue la taille réelle, et propose un découpage en 2-5 sous-tickets cohérents dans .claude/plans/SUP-XXX-split.md.

Chaque sous-ticket : scope clair, mergeable indépendamment, critères d'acceptation numérotés.

Aucun code modifié, aucun ticket Linear créé. Je review et je crée les tickets moi-même.
```

## Hard constraints

- Never invokes `ticket-plan`, `ticket-execute`, or any review skill.
- Never fetches from an external API other than through an MCP tool already present in the session.
- If the ticket body is genuinely unfetchable, ask the operator — do not infer from the title.
- MCP-agnostic: never hardcode a Linear MCP server name. Describe the capability.
