# SUP-46 — Child-session coordination & structured handoff contract

**Status:** design landed with core contract + runtime scaffolding
**Depends on:** SUP-43 (agent catalog, role router), SUP-76 (attention requests), SUP-86 (Linear context delivery)
**Forward compatible with:** SUP-79 (spawn-and-observe orchestrator runtime), review swarm evolution

## Problem

Orchestrated runs already fan out into multiple PTY-backed agent sessions (plan → code; review swarm = N parallel reviewers). Today each child is identified only by `provider`, `command`, and its parent `run_step_id`. The design has no explicit answer to:

- **Lineage:** which session spawned which, and why?
- **Purpose:** what is this session *for*, beyond "it is the Plan step's agent"?
- **Coordination:** how does one session's output become another's input without terminal echoing?
- **Failure / retry / escalation:** how do we retry a sub-task or escalate it to the operator as a first-class artifact rather than as terminal noise or implicit subprocess exit codes?

Without answering these, the PTY substrate drifts toward "agents typing at each other" the moment we add a second reviewer, a fixer, or a meta-planner.

## Non-negotiables (taken from the task brief)

- Child sessions are explicit units of work, not subprocess side effects.
- Each child has explicit lineage and purpose.
- Work moves through structured handoffs/artifacts — never through PTY-to-PTY text.
- Operators can still watch every live session through the existing PTY substrate.
- Keep the contract compatible with SUP-79's spawn-and-observe orchestrator.
- Do not invent a generic distributed agent cloud. Everything is run-scoped.

## Design

### 1. Session lineage — AgentSession extensions

Every `AgentSession` row gains structured lineage that the orchestrator (never the agent itself) sets at spawn time:

| Field              | Type                 | Meaning                                                           |
|--------------------|----------------------|-------------------------------------------------------------------|
| `role`             | `String`             | Catalog role name (`planner`, `coder`, `reviewer`, ...).          |
| `purpose`          | `String`             | Short human/auditor-facing summary (e.g. "plan SUP-46").          |
| `parent_session_id`| `Option<AgentSessionId>` | The session that requested this child (None = orchestrator).  |
| `origin_step_id`   | `StepId`             | The `RunStep` that owns the handoff (already indirectly present). |
| `launch_reason`    | `LaunchReason` enum  | `InitialStep \| Handoff \| ReviewFanout \| OperatorEscalation`.   |
| `handoff_id`       | `Option<HandoffId>`  | The handoff this spawn fulfils, if any.                           |

`parent_run` is the existing `run_id`. The fields are nullable in storage for legacy rows; the runtime always sets them going forward.

### 2. The handoff contract

A **handoff** is a durable, typed artifact that moves work between sessions. It is the *only* legitimate coordination channel between child sessions and the orchestrator.

```text
Handoff {
  id, run_id
  from_session: Option<AgentSessionId>   // None = orchestrator
  to_role: String                         // must resolve via RoleRouter
  to_session: Option<AgentSessionId>      // filled when the fulfilling spawn starts
  kind: HandoffKind
  payload: HandoffPayload                 // JSON-typed per kind
  status: HandoffStatus
  result: Option<HandoffResult>
  failure: Option<HandoffFailure>
  parent_handoff: Option<HandoffId>       // chain retries/escalations
  created_at, delivered_at, completed_at
}
```

**`HandoffKind` (initial set — extensible):**

- `Plan` — "produce a plan for this scope."
- `Implement` — "apply these changes."
- `Review` — "review this diff against these criteria."
- `Fix` — "resolve these specific findings" (child of a failed `Implement` or `Review`).
- `Escalate` — "route this to the operator" (materialises an `AttentionRequest`).

**`HandoffPayload` (tagged enum):** one shape per kind. Examples:
- `Plan { scope_summary, constraints, reference_artifacts: [ArtifactId] }`
- `Review { target_ref: GitRef, criteria: Vec<String>, reference_artifacts }`
- `Fix { findings: Vec<ReviewFinding>, parent_review: HandoffId }`
- `Escalate { reason, kind: AttentionKind, options }` — when completed, the handoff carries the `AttentionRequestId` that was created.

**`HandoffResult`** — machine-readable conclusion of a child session. Carries a short `summary`, a list of produced `artifact_ids`, an optional `git_ref` (for code-producing work), and optional `structured` JSON defined by the kind.

**`HandoffFailure`** — `reason`, `retry_count`, and an optional `escalated_attention_id` when the failure was escalated rather than retried.

### 3. Lifecycle

```
Pending ─┬─▶ Delivered ─▶ Accepted ─▶ Completed
         │                           └─▶ Failed ─┬─▶ (retry: new Handoff with parent_handoff)
         │                                       └─▶ Escalated (creates AttentionRequest)
         └─▶ Cancelled (operator abort, superseded)
```

- `Pending`: created by orchestrator or by a parent session via a safe, narrow runtime API.
- `Delivered`: a session has been spawned to fulfil it (`to_session` now set, session `launch_reason = Handoff`).
- `Accepted`: spawn succeeded and the session is `Running` (distinct from Delivered so we can tell "we lost the spawn" apart from "agent crashed mid-run").
- `Completed` / `Failed`: terminal per handoff. Completed carries `HandoffResult`; Failed carries `HandoffFailure`.
- `Escalated`: terminal special case of Failed — the failure was routed to an `AttentionRequest` via SUP-76's existing substrate. The AttentionRequest id lives in `HandoffFailure.escalated_attention_id`.
- `Superseded`: an operator or orchestrator cancelled it before it completed.

### 4. Failure, retry, escalation at the handoff layer

- Retry = a new Handoff with the same `kind` and `to_role`, `parent_handoff` pointing at the failed one. Retry count and history are walkable via the chain.
- Escalation = the orchestrator creates an `AttentionRequest` (existing SUP-76 machinery) and marks the handoff `Escalated` with the attention id. When the operator replies, the orchestrator decides whether to create a new retry handoff, mark the run `WaitingHuman`, or abort. The attention-reply → retry-handoff mapping is an orchestrator policy, not part of the contract.
- Cancellation propagates transitively: cancelling a handoff cancels its child session (if any) and marks any in-flight descendant handoffs `Superseded`.

### 5. Interaction with SUP-76 and SUP-86

- SUP-76 (attention requests) becomes the *escalation sink* for the handoff layer. Handoffs never duplicate AttentionRequest semantics — they route to them.
- SUP-86 (role context delivery) remains the snapshot/MCP mechanism at the spawn boundary. Handoff payloads carry references (e.g. `reference_artifacts`), not the full context. Role context (Linear snapshot, MCP config) is still derived per-role via the existing `prepare_linear_context` path.

### 6. How a child result becomes orchestrator input

When a session fulfilling a handoff completes:

1. The supervisor writes the structured `HandoffResult` on the handoff row (summary, artifact_ids, optional git_ref).
2. The orchestrator step that owns the handoff reads it synchronously (not by scraping the terminal transcript).
3. If the step needs the result's body, it looks it up via `artifact_ids` — artifacts are already the durable channel for plan text, review output, etc.

This is what replaces "the orchestrator parses terminal output." PTY transcripts are preserved for operator inspection, but the orchestrator's state machine only consumes handoff results.

### 7. Storage (migration 010)

- `agent_sessions` gains: `role`, `purpose`, `parent_session_id`, `launch_reason`, `handoff_id` (all TEXT, nullable to keep old rows readable).
- New table `handoffs`:

```sql
CREATE TABLE handoffs (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id),
  origin_step_id  TEXT NOT NULL REFERENCES run_steps(id),
  from_session_id TEXT REFERENCES agent_sessions(id),
  to_role         TEXT NOT NULL,
  to_session_id   TEXT REFERENCES agent_sessions(id),
  kind            TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  status          TEXT NOT NULL,
  result_json     TEXT,
  failure_json    TEXT,
  parent_handoff  TEXT REFERENCES handoffs(id),
  created_at      TEXT NOT NULL,
  delivered_at    TEXT,
  completed_at    TEXT
);
CREATE INDEX idx_handoffs_run_id ON handoffs(run_id);
CREATE INDEX idx_handoffs_status ON handoffs(status);
CREATE INDEX idx_handoffs_parent ON handoffs(parent_handoff);
```

### 8. Runtime

- New `HandoffService` in `superkick-runtime` mirrors `AttentionService`. It exposes: `create`, `mark_delivered`, `mark_accepted`, `complete`, `fail`, `escalate`, `cancel`, `list_by_run`.
- `AgentLaunchConfig` gains a `SessionLaunchInfo { role, purpose, parent_session_id, launch_reason, handoff_id }`. The supervisor persists these on the new `AgentSession` row. The lifecycle task marks the bound handoff `Accepted` once the process reaches `Running`, and `Completed` / `Failed` at exit — a thin wrapper, not a new substrate.
- Existing spawn sites (`step_engine::agent`, `step_engine::review_swarm`) are retrofitted to synthesize handoffs for their initial steps: the Plan step issues a `Plan` handoff from the orchestrator to the planner role; each reviewer in the swarm is a separate `Review` handoff. This lands the contract on the paths that already exist, with zero new spawn surface.

### 9. Compatibility with SUP-79 (spawn-and-observe orchestrator)

SUP-79 will replace hand-written step code with an orchestrator loop that observes child sessions and reacts. The contract above is deliberately substrate-agnostic: handoffs are durable rows, lineage is per-session. SUP-79 can read `handoffs.status` and `agent_sessions.parent_session_id` to drive its scheduling without any new machinery.

### 10. Explicit non-goals for this change

- No new UI. A minimal JSON-over-HTTP `GET /runs/:id/handoffs` may follow in a separate change.
- No cross-run handoffs. Everything is bounded by `run_id`.
- No automatic retry policy at the handoff layer — retries are a consequence of orchestrator policy decisions (SUP-79 scope).
- No new spawn paths. The review swarm and plan/code agents are retrofitted; no new top-level fan-out is introduced here.

## Implementation summary

This change lands:
1. `handoff.rs` in `superkick-core`: types, lifecycle, validation, tests.
2. `LaunchReason` + lineage fields on `AgentSession`.
3. Migration `010_child_handoffs_and_session_lineage.sql`.
4. `HandoffRepo` trait + `SqliteHandoffRepo`.
5. `HandoffService` in `superkick-runtime`.
6. `SessionLaunchInfo` on `AgentLaunchConfig`; supervisor persists it.
7. `step_engine::agent` and `step_engine::review_swarm` create handoffs on entry and close them on exit (including ReviewFanout lineage).
8. Tests on core invariants (state transitions, payload/kind matching, retry-chain walk).

## Verification

- `just check` (workspace compiles)
- `cargo test -p superkick-core` (new handoff tests)
- `cargo test -p superkick-storage` (migration + repo roundtrip)
- `just lint`
