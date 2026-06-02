# ADR — SUP-186: Launch Task liveness and orphan reconciliation

- **Status:** Accepted (operator-approved design; gate before merge)
- **Date:** 2026-06-02
- **Ticket:** [SUP-186](https://linear.app/superkick/issue/SUP-186) (parent SUP-115; Harness V2 Ticket 2)
- **Relates to:** [SUP-185](./SUP-185-codex-structured-launch-task-events.md) — must preserve its single-transition-owner invariant.
- **Scope:** Liveness enforcement + orphan reconciliation for Launch Task shadow runs. No structured-adapter work, no transport rewrite, no recovery-scheduler rewrite.

## Context

Dogfooding exposed *stale execution state*: a Launch Task whose process dies, fails, hangs, or is
orphaned by a server restart leaves its shadow `Run` / `RunStep` / `LaunchTask` / `LaunchTaskStep`
in a non-terminal state. Consequences:

- The issue looks **active forever** — the UI derives liveness from `!TERMINAL_STATES.has(run.state)`
  (`ui/src/lib/constants.ts`), so RunInspector / RunHero / RunDrawer keep a pulsing "live" dot and a
  growing "running for…" timer for a dead run, with no manual-reload escape.
- A **relaunch is blocked**: `find_active_by_issue_identifier` (`sqlite/runs.rs`) matches the stranded
  shadow run, so `POST /launch-tasks` returns 409 *"already has an active run"* forever.

**Verified root cause (current main, re-checked against source):** the shadow `Run` is flipped to a
terminal `RunState` in only two places — operator cancel (`run_step` cancel arm) and successful Review
(`process_completion`, `launch_task_step_runner.rs:624`). On **Failed disposition**, the
`process_completion` `Some(c)` branch deliberately leaves `run.state` at the step phase
(`launch_task_step_runner.rs:978-981`) so SUP-120 retry can re-enter. On **cancel-of-parked** (the
`LaunchTaskExecutor::cancel` *Reserved* arm) and on **process death / server restart**, nothing flips
the run at all. The `recovery_scheduler` has a hard *no-mutation* invariant and explicitly excludes
`trigger_source='launch_task'` rows, so it cannot resolve any of this.

## Transition ownership (the invariant we must not break)

| Entity | Sole owner | Where |
|---|---|---|
| `LaunchTask` / `LaunchTaskStep` status | `LaunchTaskExecutor` | `launch_task_executor.rs` (CAS-guarded `LaunchTaskRepo` writes) |
| Shadow `Run` / `RunStep` state | `RealStepRunner` | `launch_task_step_runner.rs` (`set_shadow_run_state`, `finish_run_step`) |
| Shadow `Run` terminal on operator-cancel | `RunService::cancel_run` (idempotent fallback) | `run_service.rs` |
| `AgentSession` lifecycle | `AgentSupervisor` (in-process) | `agent_supervisor/lifecycle.rs` |
| Run liveness *classification* (visibility only) | `recovery_scheduler` — **never mutates** | `recovery_scheduler.rs` |

**Design rule:** SUP-186 introduces **no new transition owner**. The reconciliation layer
*orchestrates the existing owners* — it never writes `LaunchTask`/`RunState` directly.

## Decisions

### 1. Shadow-run terminalization on task-terminal (live, deterministic — the root-cause fix)

Add `StepRunner::finalize_shadow_run(run_id, terminal, reason)` (terminal ∈ `{Failed, Cancelled,
Completed}`), with a **default no-op impl** so the test fakes are unaffected. `RealStepRunner`
implements it: load the shadow run; **no-op if already terminal** (idempotent); else
`set_shadow_run_state(terminal)`, finish any still-`Running` shadow `RunStep`, finalize any
non-terminal `AgentSession` of that run, and emit one descriptive `run_events` `StateChange` row
carrying `reason`. It resolves everything from `run_id` (the shadow run's `issue_id == linear_issue_id`),
so it works cross-process (boot) where the in-memory `shadow_runs` cache is empty.

`LaunchTaskExecutor` calls it exactly where it terminalizes a task to a **dead** state:

- `route_classified_halt` — **only** the `FailureDisposition::Failed` branch → `finalize_shadow_run(Failed)`.
- `halt_step_cancelled` and the `cancel()` **Reserved** arm → `finalize_shadow_run(Cancelled)`.

**NeedsHuman / Timeout are *not* finalized** (parked & retryable — SUP-120 reuses the live shadow run,
per operator decision). The live cancel arm in `run_step` already terminalizes the run; calling
`finalize_shadow_run(Cancelled)` again is a no-op. `RunService::cancel_run`'s existing
`if !refreshed.state.is_terminal()` guard makes the operator-run-cancel flow idempotent against this.

Net effect: a **real failure or any cancel** leaves `run.state` terminal *immediately on the live
path* — relaunch unblocked with no reconciliation needed, and the "Cancelled task with a still-Running
step + stranded run" bug fixed.

### 2. Idle / no-output watchdog (live)

Add `idle_timeout: Option<Duration>` to `AgentLaunchConfig`, defaulted from config
(`runner.agent_idle_timeout_secs`, default **300 s**), distinct from the existing wall-clock
`timeout` (600 s). Both spawn paths honour it:

- **PTY** (`run_supervised`): an `Arc<AtomicI64>` last-activity stamp is bumped by `persist_chunks`
  on every output chunk; a new `select!` arm fires when `now - last_activity ≥ idle_timeout` → SIGKILL.
- **Structured** (`structured::consume`): each `events.recv()` is wrapped in
  `tokio::time::timeout(idle_timeout, …)`; on elapse → `handle.cancel()`.

On idle expiry we reuse `SessionLifecyclePhase::TimedOut` with `timeout_after = Some(idle_timeout)` so
the existing classifier yields `FailureClassification::Timeout` (disposition **NeedsHuman**, retryable
— a hung agent should be retryable), but emit a **distinct** `run_events` row
*"agent … produced no output for {idle} — terminated as hung"* so Activity reads honestly. Minimal
footprint: no new `SessionLifecyclePhase` / `FailureClassification` variant.

### 3. Orphan reconciliation — boot one-shot + dedicated periodic sweep

New module `launch_task_liveness.rs`, **separate from `recovery_scheduler`** (which stays
visibility-only; its tests are untouched). It enumerates non-terminal **shadow runs** (the exact thing
that blocks relaunch and shows "live") via a new `RunRepo::list_active_launch_task_runs()`
(`WHERE trigger_source='launch_task' AND state NOT IN (terminal)`), and routes each to a single
executor entry point. Per run, classify by the owning `LaunchTask` (resolved via the **existing**
`LaunchTaskRepo::find_step_by_linked_run`):

| Owning task | Action |
|---|---|
| `NeedsHuman` | **skip** — legitimate retryable park |
| terminal (`Failed`/`Cancelled`/`Completed`) | **strand cleanup** — `finalize_shadow_run` to match |
| `Running`/`Pending`, **live executor** (registry) | **skip** — alive (periodic sweep) |
| `Running`/`Pending`, **no live executor** | **orphan** — drive task+step+run+session terminal (`Failed`) |
| no owning task (unlinked run) | **orphan run** — `finalize_shadow_run(Failed)` |

- **Boot:** `reconcile_launch_task_orphans(...)` is awaited in `run_server` **before** `axum::serve`.
  The in-memory `LaunchTaskRegistry` is empty at boot, so every active-task run is a true orphan.
- **Periodic sweep:** `spawn_launch_task_liveness_sweep(...)` runs the same pass on an interval;
  the live-executor gate (atomic `LaunchTaskRegistry::try_register` inside the executor entry) means it
  only reaps genuinely dead executions mid-session (e.g. a panicked executor task).

### 4. Executor reconcile entry (keeps the single owner)

`LaunchTaskExecutor::reconcile_shadow_run(&run) -> Result<ReconcileOutcome>` encapsulates the table
above. For the orphan case it acquires the slot via `try_register` (atomic gate — fails iff a live
executor holds it), drives the current `Running` step → `Failed` and the task → `Failed` through its
**own** `update_step_status` / `move_task_to_status`, then calls `finalize_shadow_run` for the run. The
executor stays the sole writer of task/step state; the step runner the sole writer of run/run-step
state. The `launch_task_liveness` module only enumerates and dispatches — it writes nothing itself.

### 5. UI — stop showing a dead run as alive, no manual reload

No new event kind (operator decision — minimal footprint). Reconciliation writes a terminal
`RunState` (`failed`/`cancelled`) + a `StateChange` `run_events` row:

- `state_change` is already in `RUN_DETAIL_INVALIDATING_KINDS` and triggers `runs.all` + `issues.all`
  invalidation → RunInspector / RunHero / RunDrawer / StepTimeline re-render off the terminal state
  with **no manual reload**; the pulsing "live" dot and the `Cancel` button disappear via the existing
  `TERMINAL_STATES` / `isTerminal` logic; the orphaned `RunStep` → `Failed` removes the `StepTimeline`
  "live" glyph.
- Add a readable **"why it stopped"** reason line to the run header/banner (the reconciliation reason),
  and a domain/UI test that a reconciled (dead-but-non-terminal → terminal) run renders terminal, not
  live.

## Consequences

- **Claude/PTY path:** behaviour unchanged except the new idle watchdog (opt-in via `idle_timeout`),
  which only fires on genuine output silence.
- **SUP-185 structured path:** unchanged except the idle wrapper around `events.recv()`; the structured
  sink still mutates only `AgentSession` + `run_events`.
- **Single-owner invariant preserved:** every task/step write stays in `LaunchTaskExecutor`; every
  run/run-step write stays in `RealStepRunner` (`finalize_shadow_run` reuses `set_shadow_run_state` /
  `finish_run_step`). The reconciler is a pure orchestrator.
- **`recovery_scheduler` untouched:** no-mutation invariant + `launch_task` exclusion + its tests stay
  green. Liveness reconciliation is a *separate, explicitly-mutating* owner, as the ticket permits.
- **`run_events`** gains a couple of descriptive liveness rows (crashed/orphaned/reconciled/no-output);
  no schema change, no new `EventKind`.
- **New surface:** `RunRepo::list_active_launch_task_runs`, `LaunchTaskRegistry::is_registered` (read
  helper), `StepRunner::finalize_shadow_run` (default no-op), `LaunchTaskExecutor::reconcile_shadow_run`,
  `launch_task_liveness` module, `idle_timeout` config + plumbing.

## Non-goals

- **No resume-after-restart.** Executions still do not survive a restart (the V1 registry invariant);
  we *reconcile to terminal*, we do not re-drive. An orphaned run becomes `Failed` with a clear event,
  and the issue is relaunchable.
- No recovery-scheduler rewrite, no transport rewrite, no structured-adapter changes, no fake liveness
  from UI polling, no fabricated "completed"/progress events to mask an unknown state.

## Test strategy (real SQLite; no mocked storage)

- **Executor (`tests/launch_task_executor.rs` + new):** Failed disposition terminalizes the shadow run
  (`run.state == Failed`); NeedsHuman/Timeout leave it non-terminal (retry still works); cancel-of-parked
  (Reserved arm) terminalizes task **and** shadow run + finishes the orphan step.
- **Reconciliation (new `tests/launch_task_liveness.rs`):** seed a non-terminal shadow run whose owning
  task is `Running` with no registry entry → the pass drives task+step+run+session terminal and emits a
  `state_change`; a `NeedsHuman` task's run is **left alone**; a live (registered) task is **skipped**;
  a stranded run under an already-`Failed` task is finalized; **after the pass, `POST /launch-tasks`
  for the issue succeeds (relaunch unblocked).**
- **Watchdog (`launch_task_step_runner.rs` / supervisor):** a scripted no-output child is killed at the
  idle threshold → `TimedOut` phase, distinct "no output" event, task parks `NeedsHuman`.
- **Regression:** `tests/recovery_scheduler.rs` no-mutation + `launch_task` exclusion stay green;
  SUP-185 `structured.rs` test stays green.
- **UI (vitest):** a run reconciled to `failed`/`cancelled` renders terminal (no pulsing dot, no
  `Cancel`, no `live` step glyph); the reason line renders.

## Acceptance-criteria traceability

| AC | Mechanism |
|---|---|
| Non-zero exit transitions deterministically + visible event | existing `AgentNonZeroExit` → NeedsHuman; shadow run parked (retryable) — covered |
| Timeout transitions deterministically + visible event | wall-clock `TimedOut` → `Timeout` classification + event (unchanged) |
| Cancel terminal everywhere + UI updates w/o reload | Decision 1 (`finalize_shadow_run(Cancelled)` on every cancel arm) + `state_change` SSE invalidation |
| Hung-but-alive no-output detected & handled | Decision 2 (idle watchdog, both spawn paths) |
| Orphaned `running` shadow runs after restart reconciled | Decision 3 (boot pass) + Decision 4 |
| Recovery scheduler no-mutation invariant preserved | separate `launch_task_liveness` module; scheduler untouched |
| Tests cover all six scenarios | Test strategy above |
| Relaunch unblocked after real failure/orphan | shadow `run.state` → terminal (Decisions 1 & 3) frees `find_active_by_issue_identifier` |
| UI stops showing a dead run alive | terminal `RunState` + `state_change` invalidation (Decision 5) |
| No fake event masking unknown state | honest `Failed`/`Cancelled` + descriptive reason; no fabricated progress |
