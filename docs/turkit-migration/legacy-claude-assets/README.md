# Legacy Claude assets — archived by `/turkit-workflow:adopt-project`

These were local `.claude/skills/*` and `.claude/commands/*` entries that duplicated jobs now owned by the Turkit workflow plugin (`turkit-workflow@turkit`, `turkit-react@turkit`). Archived on 2026-05-13.

| Asset | Replacement | Project-specific bits extracted to |
|---|---|---|
| `skills/ticket-triage/` | `turkit-workflow:ticket-triage` | `docs/conventions/workflow.md § Triage guardrails` |
| `skills/ticket-plan/` | `turkit-workflow:ticket-plan` | `docs/conventions/ticket-format.md` |
| `skills/ticket-execute/` | `turkit-workflow:ticket-execute` | `docs/conventions/ticket-format.md` (handoff format); init steps live in `.turkit.yaml workflow.init` |
| `skills/pre-pr-review/` | `turkit-workflow:pre-pr-review` | — (dispatch logic obsolete) |
| `skills/ship/` | `turkit-workflow:ship` | — (branch→issue logic now in `.turkit.yaml branch_template`) |
| `skills/test-instructions/` | `turkit-workflow:test-instructions` | `docs/conventions/ticket-format.md § test-instructions résumé` |
| `commands/pr-description.md` | `turkit-workflow:pr-description` | — |

Keep these for git history and rollback context. Do not move them back under `.claude/` — active duplicates cause drift.
