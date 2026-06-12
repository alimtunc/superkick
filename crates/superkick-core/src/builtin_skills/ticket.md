---
name: ticket
description: Single-session ticket orchestrator (intake → route → plan → ⏸ approval → execute → verify + handoff), all in one session. Invoke when the operator runs /ticket or asks to take a ticket through its full lifecycle. Never commits; suggests a review pass, never auto-runs it.
---

# Ticket

Single-session orchestrator for one ticket: intake → route → plan → ⏸ plan approval → execute → verify, all in this session. No fresh-session handoff, no auto-continue gate.

## Invocation boundary

- **Operator-invoked.** A tracker link, a ticket id, or a pasted issue does not by itself drive this flow — only an explicit `/ticket` does.
- **One internal chain:** intake → route → plan → execute. This skill owns the whole flow; it dispatches no separate triage/plan/execute skill.
- **Never auto-invoke a reviewer.** The handoff suggests a review pass; the operator runs it.
- **Never commit.**

## Phases

### 1. Intake + route

- Resolve the ticket: an explicit id or description passed as an argument wins; otherwise scan the active tracker MCP tools (`get_issue` / `list_issues`), then fall back to the branch name, then to an operator-provided description. Never hardcode a specific tracker. If nothing resolves, ask the operator for a short description before routing.
- Read the title and body **verbatim** — do not paraphrase away detail. Resolve any referenced brief/mockup through the repo's rules docs; never guess a machine-specific path.
- Classify the scope:

    | Signal | Path |
    |---|---|
    | Known pattern, no ambiguity, diff describable in one sentence | **one-shot** |
    | Real implementation, coherent well-defined goal | **standard** |
    | Genuinely mixes unrelated concerns / too vague for criteria | **split** (exceptional) |

    Route on **pertinence, not file count.** Ten files of mechanical rename is one-shot; one file of novel state logic warrants a plan.

- **split** is the escape hatch, not routine. Use it only when the ticket genuinely mixes unrelated concerns. When warranted, decompose into one sub-plan file per piece under `.claude/plans/`, present the decomposition at the Phase 3 pause, and on approval execute each sub-plan in dependency order in this same session. Never create tracker issues.

### 2. Plan (reuse survey)

- **Load project rules** before planning: read `CLAUDE.md` / `AGENTS.md` / `docs/conventions/*.md`. These set ownership, boundaries, and conventions the plan must encode.
- **Reuse survey.** Fan out over the workspace to find reusable modules / components / helpers / schemas **before inventing new ones**. Cross-check the relevant contract if the ticket touches an API or shared surface. Synthesize the findings into the plan's reuse section.
- Produce the plan:
    - **standard** → write `.claude/plans/<TICKET-ID>.md` (template below).
    - **one-shot** → keep an inline mini-plan (résumé + criteria + target files); no plan file.
    - **split** → one sub-plan file per piece with `Depends on` set so order is unambiguous.

### 3. ⏸ Plan approval — the only human checkpoint

- Print the plan and **stop for operator validation before any edit.** This is the cheapest moment to catch a scope misunderstanding.
- On approval, proceed to execute. On amendment, revise and re-present. Do not edit until the plan is approved.

### 4. Execute

- **Verify the environment first** — confirm the working tree / branch is the intended one before editing.
- **Implement criterion by criterion.** For each acceptance criterion: read the relevant files, make the change, verify it typechecks via the project's check command, then mark the criterion done in the plan.
- Full project conventions apply at write time (ownership / boundaries / comment hygiene). When a guardrail or hook blocks a change, **fix the underlying type or logic — never bypass it.**
- Execution stays in this session. **Never commit.**

### 5. Verify + handoff

- **Self-check the diff:** every acceptance criterion maps to a concrete change, no scope creep, no half-implementation. Quick pass for reuse, ownership, boundaries, and comment hygiene on touched files.
- **Run the project gate** (check / lint / fmt) from the active working-tree root. Fix root causes or report them; never bypass a guardrail to make a check pass.
- **Emit a handoff** that lists the ticket, files touched, criteria covered/uncovered, manual tests done, and blockers. It **suggests** a review pass and the commit, prefixed "do NOT run these yourself", and never runs them.

## Plan template

```markdown
# <TICKET-ID> — <Short title>

## Résumé (reformulé)
<2–3 lines describing intent>

## Critères d'acceptation
1. <precise, verifiable criterion>
2. ...

## Fichiers à toucher
- path/to/file — <what + approach>

## Reuse check
- Reused: <list or "none">
- Rationale if creating new: <...>

## Risques / zones floues
<or "aucun">
```

## Anti-patterns

- Routing without reading the ticket end-to-end — scope estimates become guesses.
- Splitting a ticket that is merely large but coherent — split only for genuinely unrelated concerns.
- Freelancing past a standard route into execution without the Phase 3 plan-approval pause.
- Auto-invoking a reviewer — review is always operator-gated.
- Bypassing a guardrail or hook by commenting it out or masking the pattern — fix the underlying type/logic instead.
- Committing inside this skill — commits are operator-gated.

Respond in the conversation's language by default.
