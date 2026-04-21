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
| `ticket-triage` | Fetches the ticket, picks the path, emits a next-step prompt | Operator reads the prompt, decides |
| `ticket-plan` (if routed there) | Writes `.claude/plans/SUP-XXX.md`, stops | Operator validates, pastes prompt into S2 |
| `ticket-execute` | Worktree + implementation, stops at handoff | Operator runs `/test-instructions` / `/pre-pr-review` / commits / `/ship` |

Every skill is operator-invoked. None auto-chains.

---

## Why this shape

Claude Opus 4.7 is literal — vague one-line prompts regress because the model no longer silently fills implicit context. Well-scoped briefs with numbered acceptance criteria win big. Two-session plan → execute beats one session on non-trivial tickets: cleaner execution context, cheap human checkpoint.

Reference: [Anthropic — Best practices for Opus 4.7 with Claude Code](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code).

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
