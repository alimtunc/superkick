# Codex ↔ Claude — Superkick ticket workflow

Reference doc for Codex (orchestrator) when dispatching Superkick tickets to Claude running Opus 4.7. Goal: maximize first-try success while keeping Codex thin.

`docs/conventions/workflow.md` is the operational source of truth for ticket handling in this repo. This document explains the Codex ↔ Claude orchestration choices.

---

## Codex's role (thin)

- Reads the Linear backlog with the operator.
- Picks the next ticket based on priority and dependencies.
- Hands off to Claude with one line: `Invoke ticket-triage on SUP-XXX`.
- Does **not** fetch the ticket body.
- Does **not** pick a template or write a brief.
- Does **not** touch code.

Claude's `ticket-triage` does all of that.

---

## Claude's role

| Skill | What it does | Next step |
|---|---|---|
| `ticket-triage` | Fetches the ticket, picks the path, **auto-invokes** `ticket-plan` (plan path) or `ticket-execute` (one-shot). Stops on split-first. | Automatic — unless split-first, where the operator creates the sub-tickets. |
| `ticket-plan` | Writes `.claude/plans/SUP-XXX.md`. Auto-invokes `ticket-execute` if the plan is small (≤ 3 criteria, mono-stack, no migration, fresh session); otherwise stops with a fresh-session handoff. | Automatic for small plans; for large plans, operator resumes in a new session with `Invoke ticket-execute on SUP-XXX`. |
| `ticket-execute` | Worktree + implementation, stops at handoff. | Operator runs `/test-instructions` / `/pre-pr-review` / commits / `/ship`. |

Triage and plan auto-chain into the next ticket skill. Review/ship skills (`pre-pr-review`, `ship`, `test-instructions`) are never auto-chained — the operator always invokes those.

---

## Why this shape

Claude Opus 4.7 is literal — vague one-line prompts regress because the model no longer silently fills implicit context. Well-scoped briefs with numbered acceptance criteria win big. The plan → execute split is still two sessions for non-trivial tickets (cleaner execution context, cheap human checkpoint), but small mono-stack plans now auto-chain in one session — triage and plan own the fetch + context, so re-dispatching for a trivial execute was pure friction.

4.7 also spawns fewer subagents and makes fewer tool calls by default, so our skills dispatch subagents explicitly (`pre-pr-review`) and name the Linear MCP capability upfront (`ticket-triage`, `ticket-plan`).

References: [Anthropic — Best practices for Opus 4.7 with Claude Code](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code) · [Migration guide — Opus 4.7](https://platform.claude.com/docs/en/about-claude/models/migration-guide#migrating-to-claude-opus-4-7).

---

## Operator setup

- **Effort:** run Claude Code at `xhigh` effort for Superkick coding sessions. Anthropic's migration guide recommends `xhigh` as the starting point for coding + agentic use cases on Opus 4.7; `high` works but under-thinks on moderately complex tickets.
- **Thinking display:** default is `omitted` on 4.7; if you want to see reasoning in the IDE, set the Claude Code config to display summarized thinking.

---

## Invariants (reminders for Codex)

- Never tell Claude to skip `ticket-triage`.
- Never send absolute paths to SKILL.md files — just name the skill (`ticket-plan`, not `/Users/.../SKILL.md`).
- Never ask for "what was updated" as handoff — `ticket-execute` already uses a strict format.
- Never commit on `main`. Never skip hooks. Never add `Co-Authored-By`.
- Never hardcode MCP server names in a brief — Claude matches on capability.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Plan drifted from current code | `ticket-execute` step 2 detects and stops. Operator decides. |
| Ticket too vague to write criteria | `ticket-triage` routes to `split-first`, or `ticket-plan` lists it in "Risques / zones floues". |
| Cross-stack ticket | Always plan-then-execute. Never one-shot. |
| Codex unsure which path | Just send `Invoke ticket-triage on SUP-XXX` — triage picks. |
