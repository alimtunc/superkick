# Issue ↔ run state synchronization rules (SUP-22)

## Why this document

A Linear *issue* has its own lifecycle (workflow status, blockers, assignee).
A Superkick *run* has its own lifecycle (`RunState`, pause kind, heartbeat,
PR). The two coexist on the same screen — the operator dashboard renders
both — and the rules connecting them have so far lived implicitly in code
review and CLAUDE.md prose. This document pins those rules so future runtime
or UI changes can lean on a stable contract instead of inventing one ad hoc.

The audience is twofold:

- **Implementers** (UI, runtime, API) need to know what to mirror, what to
  reference, and where the source of truth lives.
- **Agents** (any skill that derives an execution plan from product intent)
  need a structured artifact to read; sections are short and pointer-rich on
  purpose.

Identity remains the same as everywhere else in the codebase: **Linear is
the human workflow surface. Superkick is the agent execution surface.** The
rest of this doc is consequence.

## Scope

- **In scope:** how an issue's surface (badge, blockers, status) and a run's
  surface (`RunState`, pause kind, heartbeat) are linked, mirrored, or
  derived; what the UI is allowed to display while a run is in flight; the
  open questions that have been deliberately left unresolved.
- **Out of scope:** the launch-queue classifier itself (covered by
  [unblock-flow.md](./unblock-flow.md) and
  [crates/superkick-core/src/launch_queue.rs](../../crates/superkick-core/src/launch_queue.rs));
  the run-to-run handoff suspension model (`OwnershipResumed`,
  `PendingHandoff`); recovery scheduling internals (covered by SUP-73).

## Model of states

### Issue state

Owned by Linear. The relevant axis is `LinearStateType`:

```
backlog | unstarted | started | completed | canceled
```

[ui/src/types/issues.ts:2](../../ui/src/types/issues.ts#L2)

The custom workflow name (e.g. `In Progress`, `Ready for QA`, `Backlog`) is
carried alongside in [`IssueStatus.name`](../../ui/src/types/issues.ts#L4)
for display, but Superkick only routes on the canonical `state_type`.

### Run state

Owned by Superkick. Eleven variants live in
[crates/superkick-core/src/run.rs:13-25](../../crates/superkick-core/src/run.rs#L13-L25):

| Variant | Meaning |
|---|---|
| `Queued` | Accepted, not yet picked up by the orchestrator. |
| `Preparing` | Worktree creation, dependency install, branch setup. |
| `Planning` | Plan step running. |
| `Coding` | Coding step running. |
| `RunningCommands` | Commands step running (tests, lints, build). |
| `Reviewing` | Review-swarm step running. |
| `WaitingHuman` | Paused on operator decision. The pause *cause* is in `pause_kind`. |
| `OpeningPr` | PR creation step running. |
| `Completed` | Terminal — PR opened (or no-op completion). |
| `Failed` | Terminal but retryable: `Failed → Queued` is the only transition out. |
| `Cancelled` | Terminal final. |

Mirror in TypeScript:
[ui/src/types/runs.ts:4-15](../../ui/src/types/runs.ts#L4-L15).
Allowed transitions are pinned in
[`RunState::allowed_transitions`](../../crates/superkick-core/src/run.rs#L35-L61).

### Pause kind

A discriminator carried by a run **only when `state == WaitingHuman`**:

```
none | budget | approval
```

[crates/superkick-core/src/run.rs:178-183](../../crates/superkick-core/src/run.rs#L178-L183)
· [ui/src/types/runs.ts:23](../../ui/src/types/runs.ts#L23)

The reason this is a separate field rather than a state variant: a single
`WaitingHuman` keeps the state machine compact, and the *cause* (over budget
vs. awaiting approval vs. step failure) drives UI affordances, not
transitions.
[mark_paused / clear_pause](../../crates/superkick-core/src/run.rs#L355-L365)
are the only writers.

### Cardinality

**One issue → many runs.** A retried `Failed` produces a fresh dispatch; a
manually re-triggered issue can spawn another run. The UI surfaces the most
recent run with priority (LinkedRuns lists all of them in
chronological order). Whether two non-terminal runs may coexist on the same
issue is left as an open question (§9), since today's runtime allows it
without enforcing single-flight.

## Linkage

Runs reference Linear by two fields, both populated at run creation and
never re-synced:

| Column | Source | Use |
|---|---|---|
| `runs.issue_id` | Linear UUID | Stable join key. |
| `runs.issue_identifier` | Linear (e.g. `SUP-22`) | Denormalised so the UI can render queue cards without a Linear roundtrip. |

Schema: [crates/superkick-storage/migrations/001_initial_schema.sql:6-7](../../crates/superkick-storage/migrations/001_initial_schema.sql#L6-L7).

> **Reference, not mirror.** No Linear `state_type`, blocker list, assignee,
> or priority is copied onto the run row. The launch-queue handler reads
> Linear's current snapshot at request time and joins it with the run state
> in memory. Stale denormalisations are the bug class this avoids.

## Source of truth

| Datum | Owner | Notes |
|---|---|---|
| Linear `state_type`, `state_name`, `started_at`, `completed_at`, `canceled_at` | Linear | Always read fresh on each launch-queue pulse. |
| Linear blockers (`blocks` relation) | Linear → snapshot in `issue_blockers` | See [unblock-flow.md](./unblock-flow.md). |
| Assignee, priority | Linear | Used for queue ordering and approval-required gating. |
| `RunState`, transition history | Superkick (`runs` table) | Only the runtime mutates. |
| `pause_kind`, `pause_reason` | Superkick | Only valid in `WaitingHuman`. |
| `last_heartbeat_at`, recovery audit | Superkick (`recovery_events`, migration `016`) | The recovery scheduler classifies but never mutates `RunState`. |
| Ledger entries (`step_runs`, transcripts, attention requests, child handoffs) | Superkick | Run-scoped; never mirrored to Linear. |
| `pr_url` | Superkick | Surfaced on the issue card via `LinkedPrSummary`. |
| `OperatorQueue` / launch-queue bucket | Derived | Pure function; never persisted. |

Statu quo: **no outbound Linear writes from the runtime.** Today the only
writer to Linear is the operator (manually) or the [`/ship`](../../.claude/skills/ship/SKILL.md)
skill at the end of a run. Whether to add an outbound mirror is an open
question (§9).

## What the issue surface shows during an active run

The issue page is *the Linear view of the world*. It changes only when
Linear changes.

- **Issue badge** — Driven solely by `LinearStateType` /
  [IssueStatus](../../ui/src/types/issues.ts#L4). It does **not** flip when
  a Superkick run starts, pauses, or fails. An issue in Linear's `Todo`
  with a `Coding` run is still rendered as `Todo`.
- **LinkedRuns panel**
  ([ui/src/components/issue-detail/LinkedRuns.tsx](../../ui/src/components/issue-detail/LinkedRuns.tsx))
  — Each run carries its own `RunState` badge
  ([ui/src/components/RunStateBadge.tsx](../../ui/src/components/RunStateBadge.tsx))
  + PR summary if any. Run state is never blended back into the issue
  badge.
- **Queue card**
  ([ui/src/components/dashboard/QueueCard.tsx](../../ui/src/components/dashboard/QueueCard.tsx))
  — Renders the *derived* launch-queue bucket (`Active`, `NeedsHuman`,
  `InPr`, …). The bucket is reclassified on every refresh; nothing is
  persisted. See `LaunchQueue` in
  [crates/superkick-core/src/launch_queue.rs:69-127](../../crates/superkick-core/src/launch_queue.rs#L69-L127).

### Combinatorics — what the operator sees

| Linear state | Run state | Issue badge | LinkedRuns | Queue bucket |
|---|---|---|---|---|
| `started` | `Coding` | Linear status (e.g. "In Progress") | `coding` | `active` |
| `started` | `WaitingHuman` (`approval`) | Linear status | `waiting_human` + approval banner | `needs-human` |
| `started` | `Failed` | Linear status | `failed` (retry button) | `active` if a fresh run is live, else `needs-human` |
| `started` | `OpeningPr` / `Completed` | Linear status | `opening_pr` / `completed` + PR link | `in-pr` / `done` |
| `unstarted` | (none) | Linear "Todo" | empty | `todo` |
| `backlog` | (none) | Linear "Backlog" | empty | `backlog` |
| `completed` / `canceled` | any non-terminal | Linear "Done" / "Canceled" | run runs to its own terminal | `done` (issue is terminal — see §9 for the runtime-vs-Linear race question) |

The table is exhaustive on purpose: every combination has a defined display.

## Outcome semantics

For each terminal or pause path: what changes in Superkick (a), what
changes in Linear (b), what the operator sees in the UI (c).

### `Completed`

(a) `RunState::Completed`, `finished_at` set, PR row recorded, ledger sealed.

(b) **Nothing.** The runtime does not move the Linear issue to `Done`. The
operator does it (manually, or via [`/ship`](../../.claude/skills/ship/SKILL.md))
once they have verified the work. This separation is intentional — see §9.

(c) `RunStateBadge` flips to `completed`; LinkedRuns row gains the PR link;
the queue card moves to the `InPr` or `Done` bucket depending on Linear
state.

### `Failed`

(a) `RunState::Failed`, `finished_at` set, `error_message` populated. The
only allowed transition out is back to `Queued` (retry).

(b) Nothing.

(c) LinkedRuns surfaces the failed run with a retry affordance; the issue
badge is unchanged.

### `Cancelled`

(a) `RunState::Cancelled`, terminal final. Reached only by operator action.

(b) Nothing.

(c) LinkedRuns surfaces the cancelled run; the issue badge is unchanged.

### Pause — `WaitingHuman` × `pause_kind`

The state stays `WaitingHuman`; `pause_kind` discriminates the cause.
Migration: [014_run_budget_and_pause.sql](../../crates/superkick-storage/migrations/014_run_budget_and_pause.sql).

| `pause_kind` | Cause | Surface |
|---|---|---|
| `none` | Step-level halt (e.g. attention request, plan handoff). | [RunPauseBanner](../../ui/src/components/run-detail/RunPauseBanner.tsx). |
| `budget` | Budget tripwire (duration, retries, tokens) — see [015_run_budget_grant.sql](../../crates/superkick-storage/migrations/015_run_budget_grant.sql). | [RunPauseBudgetBanner](../../ui/src/components/run-detail/RunPauseBudgetBanner.tsx). |
| `approval` | Approval checkpoint (priority gate, pre-step gate). | [RunPauseApprovalBanner](../../ui/src/components/run-detail/RunPauseApprovalBanner.tsx). |

Linear is not touched. The operator resolves the gate (approve / override /
reject) and the runtime transitions out of `WaitingHuman` per
`allowed_transitions()`.

### Stalled

**Not a `RunState`.** Stalled is a *recovery classification* derived by the
recovery scheduler from `last_heartbeat_at` (migration
[016_run_heartbeat_recovery.sql](../../crates/superkick-storage/migrations/016_run_heartbeat_recovery.sql)).

(a) The run row is unchanged. A `recovery_events` row is appended
(`stalled` or `recovered`) and a workspace-bus event fires.

(b) Nothing.

(c) The queue card carries a "stalled" badge; the issue badge is unchanged.

The hard invariant — the recovery scheduler **never** mutates `RunState` —
is pinned at
[crates/superkick-api/src/recovery_scheduler.rs:6-17](../../crates/superkick-api/src/recovery_scheduler.rs#L6-L17).

### Blocked

**Not a `RunState`.** Blocked is a *launch-queue bucket* derived from the
presence of a non-terminal Linear `blocks` relation
([crates/superkick-core/src/launch_queue.rs:32-39](../../crates/superkick-core/src/launch_queue.rs#L32-L39)
· schema [013_issue_blockers.sql](../../crates/superkick-storage/migrations/013_issue_blockers.sql)).

It applies to issues that have **no live run** — i.e. the bucket gates
*intake*. What "blocked" means for an issue while a run is mid-flight is an
open question (§9). See [unblock-flow.md](./unblock-flow.md) for the full
intake model.

## Invariants

1. The recovery scheduler **never** mutates `RunState`. (Pinned by an
   integration test —
   [crates/superkick-api/tests/recovery_scheduler.rs](../../crates/superkick-api/tests/recovery_scheduler.rs).)
2. Only the runtime creates and transitions runs. The API layer accepts
   commands; the storage layer persists; neither writes a `RunState`
   directly.
3. `OperatorQueue` and `LaunchQueue` are derived at read time — never
   persisted, never event-sourced.
4. `pause_kind != None` is valid only when `state == WaitingHuman`. Any
   transition out of `WaitingHuman` clears it (`clear_pause`).
5. Every `RunState` transition respects `allowed_transitions()`. There is
   no escape hatch — `transition_to` returns `CoreError::InvalidTransition`
   on violations.
6. `runs.issue_id` and `runs.issue_identifier` are immutable after
   insertion. If Linear renames an identifier, the run keeps the original;
   re-running the issue creates a new row.

## What we deliberately do not mirror from Linear

- **Custom workflow statuses.** Linear teams can define arbitrary status
  names ("In Code Review", "Ready for QA"). Superkick only acts on the
  canonical `state_type`. Custom names render in the UI verbatim but never
  drive logic.
- **Sub-issue / parent hierarchy.** Linear parent/child is hierarchy, not
  dependency — re-pinned by SUP-81. Runs do not inherit anything from a
  parent issue's runs except the concurrency guardrail (parent has an
  active run → child is `Blocked` in the launch queue, intake-only).
- **Linear → Superkick transitions.** Moving an issue manually in Linear
  does not auto-spawn or auto-cancel a Superkick run. The launch-queue is
  a *suggestion surface*; dispatch is operator-driven.
- **Superkick → Linear transitions.** No outbound write. `/ship` is the
  only path that moves Linear, and it is operator-invoked.

## Open questions

Deliberately not arbitrated by this document. Each one is a future ticket.

1. **Linear → terminal during an active run.** If an operator (or a
   teammate) marks the issue `canceled` or `completed` while a Superkick
   run is mid-flight, should the runtime auto-cancel the run, log a
   warning, or do nothing? Today: nothing — the run continues to its own
   terminal state.
2. **Outbound Linear mirror.** Should starting a run move Linear to "In
   Progress", and completing a run move it to "Done", instead of waiting
   for `/ship`? The argument for: fewer manual steps. The argument
   against: a Superkick `Completed` is "PR opened", not "shipped" —
   conflating them would lie to the team.
3. **`RunState::Blocked`.** Today, "blocked" is a launch-queue bucket only,
   gating intake. Should there also be a runtime-level `Blocked` for a run
   that discovers mid-flight that a dependency it needs is unresolved
   (e.g. an Linear issue it has to coordinate with)? If yes, it needs its
   own pause/resume contract.
4. **Cardinality enforcement.** The schema permits multiple non-terminal
   runs per issue. Should the runtime enforce single-flight (one live run
   per `issue_id`)? Today, this is policed by convention (the operator
   doesn't double-trigger) and by the launch-queue rendering only one
   active row per issue. Making it a hard invariant would simplify the UI
   but requires a creation-time guard.

Each of these is a candidate for its own SUP-XX ticket. Resolving them in
*this* doc would defeat the point of pinning the current contract.

## Where these rules live

| Concern | Location |
|---|---|
| `RunState`, transitions, `PauseKind` | [crates/superkick-core/src/run.rs](../../crates/superkick-core/src/run.rs) |
| Recovery (stalled detection, heartbeat) | [crates/superkick-api/src/recovery_scheduler.rs](../../crates/superkick-api/src/recovery_scheduler.rs) · [crates/superkick-core/src/recovery.rs](../../crates/superkick-core/src/recovery.rs) · migration [016](../../crates/superkick-storage/migrations/016_run_heartbeat_recovery.sql) |
| Launch-queue classifier | [crates/superkick-core/src/launch_queue.rs](../../crates/superkick-core/src/launch_queue.rs) · [unblock-flow.md](./unblock-flow.md) |
| Run runtime (orchestrator, step engine, heartbeat listener) | [crates/superkick-runtime/src/](../../crates/superkick-runtime/src/) |
| Run-row schema, blockers, budgets | migrations [001](../../crates/superkick-storage/migrations/001_initial_schema.sql), [013](../../crates/superkick-storage/migrations/013_issue_blockers.sql), [014](../../crates/superkick-storage/migrations/014_run_budget_and_pause.sql), [015](../../crates/superkick-storage/migrations/015_run_budget_grant.sql), [016](../../crates/superkick-storage/migrations/016_run_heartbeat_recovery.sql) |
| API surfaces | [crates/superkick-api/src/handlers/](../../crates/superkick-api/src/handlers/) |
| TS mirrors | [ui/src/types/runs.ts](../../ui/src/types/runs.ts) · [ui/src/types/issues.ts](../../ui/src/types/issues.ts) |
| UI surfaces | [ui/src/components/RunStateBadge.tsx](../../ui/src/components/RunStateBadge.tsx) · [ui/src/components/issue-detail/LinkedRuns.tsx](../../ui/src/components/issue-detail/LinkedRuns.tsx) · [ui/src/components/dashboard/QueueCard.tsx](../../ui/src/components/dashboard/QueueCard.tsx) · [ui/src/components/run-detail/](../../ui/src/components/run-detail/) |

This is the index any future change-set should update first — if a rule
moves, its row here moves with it.
