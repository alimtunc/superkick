# ADR — SUP-187: RunContextSnapshot v0 for retry and takeover

- **Status:** Accepted (implemented)
- **Date:** 2026-06-02
- **Ticket:** [SUP-187](https://linear.app/superkick/issue/SUP-187) (parent SUP-115; Harness V2 Ticket 3)
- **Blocked by:** SUP-185 (structured Launch Task events) — merged. **Blocks:** SUP-188 (takeover-from-snapshot).
- **Scope:** Add a *derived* projection. No new canonical model, no business-state transition changes, no PTY/Claude path changes.

## Context

To retry, resume, debug, or (later) take over a Launch Task, a future session needs the run's
context without depending on the exact live PTY or the full transcript. SUP-185 made structured
provider evidence durable in `run_events`; this ticket assembles a small, redacted, **regenerable**
projection over the canonical state so that context can be handed to a fresh session.

This deliberately replaces the earlier overloaded "`RunHandoffPacket`" idea. The existing
`Handoff` domain name is **not** reused — a `Handoff` (`crates/superkick-core/src/handoff.rs`) is a
structured *work transfer between sessions*, a different concept with its own lifecycle.

## The model (unchanged by this ticket)

| Layer | Role | Owner |
|---|---|---|
| State tables (`launch_tasks`, `runs`, `agent_sessions`, …) | **source of truth** | domain + storage |
| Protocol events (`ProtocolEventEnvelope`) | evidence provider | SUP-185 sink |
| `run_events` | operator ledger / replay / audit | storage |
| **`RunContextSnapshot`** | **derived, redacted, regenerable projection** | SUP-187 (this) |
| PTY / transcript | fallback / takeover / debug | runtime |

`RunContextSnapshot` sits at the bottom: it is *built from* the rows above, is safe to throw away,
and is **never** read as truth.

## Decisions

### 1. Domain type in `superkick-core`, versioned

`RunContextSnapshot` (`crates/superkick-core/src/run_context_snapshot.rs`) is a plain serde data
type carrying `version: u32` (== `RUN_CONTEXT_SNAPSHOT_VERSION`, `0` for v0) and `generated_at`.
Field names serialize `camelCase` (matching the `RunDiff` projection precedent and the UI), while
nested enum *values* keep their `snake_case`. Bumping the constant identifies (and forces
regeneration of) a persisted snapshot across schema changes.

### 2. Pure builder in `superkick-runtime`

`build_run_context_snapshot(...)` (`run_context_snapshot_builder.rs`) derives the projection by
**reading** the existing repos (`LaunchTaskRepo`, `RunRepo`, `AgentSessionRepo`, `RunEventRepo`,
`IssueWorkspaceContextRepo`). It is pure in the sense that matters: it never transitions a
task/step/run and never writes business state. `now` is a parameter so the build is deterministic
and testable.

The shadow run is found via the steps' `linked_run_id`; issue title/identifier/status come from the
captured `IssueWorkspaceContext` (the `LaunchTask` only stores `linear_issue_id`).

### 3. Pointers, not payloads

The snapshot embeds *references*, never bulk data:

- **Changed files** = paths aggregated from finished `StepResult.changed_files` (deduped, capped at
  100). No git subprocess and no worktree dependency — so it still builds for a cancelled run whose
  worktree is gone.
- **Diff** = `SnapshotDiffRef { run_id, base_branch, head_branch, worktree_recorded }`; the full
  (bounded) diff is fetched on demand from `GET /runs/{id}/diff`. The snapshot never embeds a diff.
- **Recent events** = the last 20 `run_events` summarised to `{ seq, ts, kind, level, message }` —
  never `payload_json`.
- **Memory** = `SnapshotMemoryRef { workspace_context_id, ledger_pointer }` — never the entries.

### 4. Redaction before it lands

Every operator/agent free-text field (issue title/body excerpt, task objective/summary, step
summaries, failure reasons, pending-decision details, blocking reason, run error message, event
messages) is passed through a new `redaction::redact()` that **reuses the exact `PATTERNS`** of the
existing `redaction::scan()` (DRY — secret shapes live in one place). `scan` *rejects* at the
memory-entry boundary; `redact` *masks* with `[redacted:<kind>]` and never fails — a projection that
aggregates many sources must always build. Structural fields (ids, branches, paths) and the opaque
provider resume key are carried verbatim — the resume key is the point of takeover, not a credential.

### 5. Missing data is explicit

Absent data is `None`/empty, never fabricated. No run yet → `run_id: None`, `run: None`,
`worktree: None`. No workspace context → issue `identifier`/`title`/`status` are `None`.

### 6. Persisted as a regenerable cache, not a second truth

Migration `034_run_context_snapshots.sql` adds one row **per launch task** (PK `launch_task_id`).
`RunContextSnapshotRepo::upsert` replaces it wholesale on regeneration — there is no history table
and no second source of truth. `version`/`generated_at` are denormalised header columns;
`snapshot_json` is the authoritative serialized projection. No FK on `launch_task_id` (same rationale
as `launch_task_steps.linked_run_id`): the projection is derived and a dangling row is harmless.

### 7. Read surface

`GET /api/launch-tasks/{id}/snapshot` derives → persists (upsert) → returns the snapshot. The build
is read-only over business state, so requesting a snapshot has no side effect beyond refreshing the
cached projection. 404 when the task does not exist. **No new transition, no PTY/Claude change.**

## Non-goals (per ticket)

- No takeover implementation (SUP-188), no full transcript, no full/duplicated diff, no new canonical
  model, no Sinew/graph dependency, no mandatory AI summary, no fabricated data.
- No `run_events` shape change, no business-state transition change. Snapshot generation is **not**
  wired into step-terminal transitions in v0 (it is generated on read); doing so without touching
  the executor's transition logic is left to SUP-188's needs.

## Test strategy (real SQLite; no mocked storage)

- **core unit:** `redact()` masks each credential kind / leaves clean text borrowed; snapshot type
  round-trips, serializes `camelCase`, represents missing data as explicit null, pins `version == 0`.
- **storage integration:** upsert→get round-trip; upsert replaces (one row per task); unknown task →
  `None`; distinct tasks stay independent.
- **runtime integration:** builds for an active run (linked issue/task/run); completed-step summaries
  + changed-file aggregation; explicit missing data; secrets redacted in summaries/events/body;
  provider resume key surfaced; a blocking reason for waiting-human / failed / cancelled and none for
  completed; needs-human + open questions become pending decisions; unknown task errors.
- **api integration:** `GET /launch-tasks/{id}/snapshot` returns a redacted camelCase projection and
  persists it; 404 on unknown id.

## Acceptance-criteria traceability

| AC | Mechanism |
|---|---|
| Snapshot generable for a Launch Task with an active run | builder + `builds_for_active_run_with_linked_issue_task_run` |
| Generable for completed / failed / cancelled / waiting_human | `blocking_reason_for_*` + `completed_run_has_no_blocking_reason` |
| Secrets/credentials redacted | `redaction::redact` on every free-text field; core + runtime + api redaction tests |
| No full diffs / transcripts duplicated | changed-file *paths* + `SnapshotDiffRef` + summarised event pointers |
| Missing data explicit, not invented | `Option`/empty everywhere; `missing_data_is_explicit_*` tests |
| Tests cover versioning / redaction / missing data / completed summaries / linked issue-task-run | see test strategy |
| No Claude/PTY change | builder only reads repos; no supervisor/PTY touch |
| No business-state transition change | builder never transitions; handler only reads + upserts the cache |
