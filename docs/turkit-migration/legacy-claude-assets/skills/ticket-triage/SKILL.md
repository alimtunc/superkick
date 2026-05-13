---
name: ticket-triage
description: Operator-invoked entry point for any Superkick ticket. Fetches the Linear issue, evaluates scope, picks the path (one-shot / plan-then-execute / split-first), then auto-invokes the next skill (ticket-execute for one-shot, ticket-plan for plan-then-execute). Split-first stops for operator review.
---

# Ticket Triage — Superkick

Route a Linear ticket to the right workflow path **and dispatch it**. Triage owns the fetch + routing, so it hands off directly instead of asking the operator to paste a follow-up prompt.

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

5. **Emit the triage report** (format below), then **auto-invoke the next skill**:
   - `one-shot` → invoke `ticket-execute` immediately, passing the inline mini-plan (ticket id, title, stack, 1–3 acceptance criteria inferred from the ticket body).
   - `plan-then-execute` → invoke `ticket-plan` immediately.
   - `split-first` → **stop**. Write the split proposal to `.claude/plans/<TICKET>-split.md`, display it, and let the operator create the sub-tickets.

## Output format (strict)

```
Ticket : SUP-XXX — <short title>
Path   : <one-shot | plan-then-execute | split-first>
Stack  : <backend | frontend | cross-stack>
Reason : <1–2 sentences>
```

Display this block, then immediately invoke the downstream skill (no pasted prompt, no operator handoff for one-shot / plan-then-execute).

## Mini-plan (one-shot hand-off to ticket-execute)

When routing to one-shot, pass this block inline to `ticket-execute` so it can run without reading `.claude/plans/`:

```
Ticket : SUP-XXX — <title>
Stack  : <backend | frontend>
Critères d'acceptation :
  1. <vérifiable>
  2. ...
Fichiers probables : <comma-separated list>
```

`ticket-execute` sets up the worktree, verifies alignment, implements, and emits its standard handoff.

## Split-first proposal template

Write to `.claude/plans/<TICKET>-split.md`:

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

## Hard constraints

- Auto-invokes `ticket-plan` (plan path) or `ticket-execute` (one-shot path). Never invokes review skills (`pre-pr-review`, `ship`, `test-instructions`).
- Never fetches from an external API other than through an MCP tool already present in the session.
- If the ticket body is genuinely unfetchable, ask the operator — do not infer from the title.
- MCP-agnostic: never hardcode a Linear MCP server name. Describe the capability.
- Split-first path never auto-invokes anything — the operator must create Linear sub-tickets by hand.
