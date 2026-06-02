# ADR — SUP-185: Codex structured events for Launch Task steps

- **Status:** Proposed (gate before implementation)
- **Date:** 2026-06-01
- **Ticket:** [SUP-185](https://linear.app/superkick/issue/SUP-185) (parent SUP-115; Harness V2 Ticket 1)
- **Scope:** Integration, not a harness rewrite. ~80% of the machinery already exists and is tested; this wires it into the Launch Task path.

## Context

Dogfooding exposed *run blindness*: a Codex Launch Task step runs through the PTY-backed
`AgentSupervisor`, so Activity / Tools / Logs stay empty while the agent works. Codex already has a
real, tested structured path (`CodexProtocolAdapter` → `codex exec --json` →
`ProtocolEventEnvelope`), but it is wired only into the chat/conversation path
(`conversation_runner` → `turn_events`), never into Launch Task steps.

**Verified facts (current main `355619a`, re-checked against source — the handoff docs cite the
older `dc014fb` and several line numbers have drifted):**

- `CodexProtocolAdapter` is **production code**, not a stub. The stub wording in
  `protocol_adapter/mod.rs:9` is stale SUP-97 doc text; `codex.rs` spawns `codex exec --json`,
  `codex_stream.rs` parses it, and `tests/codex_protocol.rs` covers it end-to-end.
- `ProtocolEventEnvelope = { seq: u64, at: DateTime<Utc>, #[serde(flatten)] event: ProtocolEvent }`
  (`protocol.rs:81`). `seq` is monotonic **per turn**, starting at 0.
- `ProtocolEvent` variants: `SessionMeta, TextDelta, TextBlock, Thinking, Log, ToolUse, ToolResult,
  Usage, Completion, Failure, Cancelled`; `is_terminal()` covers the last three.
- `SessionMeta.resume_key` (Codex `thread_id`) is already extracted by the parser
  (`codex_stream.rs:130`); `agent_sessions.provider_session_id` exists (migration 019) but the
  supervisor always writes `None` (`agent_supervisor/mod.rs:228`).
- `run_events` (migration 001): `id, run_id, run_step_id (nullable FK), ts, kind, level, message,
  payload_json`. **No `seq`, no `category`.** `kind`/`level` are typed enums (`EventKind`,
  `EventLevel`); reads `ORDER BY ts` (`sqlite/events.rs:49`) — unstable under equal timestamps.
- `turn_events` (migration 021) is the template: `seq INTEGER NOT NULL`, `at`, `kind`,
  `envelope_json`, index `(turn_id, seq)`.
- The Launch Task step fork point is `launch_task_step_runner.rs:889`:
  `let (handle, join) = self.supervisor.launch(launch_cfg).await`. Everything downstream
  (`tokio::select!` on cancel → `process_completion` → `classify` → `StepOutcome`) consumes an
  `AgentResult` and is provider-agnostic.
- UI: Activity is fed by `useEventStream` (backfill `GET /runs/{id}/events/log` + live `/events`
  SSE). `StructuredActivityList` renders `RunEvent.payload_json` only when it matches the
  `ActivityPayload` Zod schema (`activity_kind` discriminant). **Tools** reads tool calls from the
  *conversations* projection (`fetchRunToolCalls`) — empty for a shadow run with no conversation.
  **Files** reads the git diff (`runDiffQuery`). **Logs** filters `kind ∈ {agent_output,
  command_output}`.

## Decisions

### 1. Single transition owner (ADR requirement #1)

`LaunchTaskExecutor` **remains the sole owner** of `LaunchTask` / `LaunchTaskStep` business
transitions: `handle_step_outcome → route_classified_halt → move_task_to_status /
move_task_to_cancelled` (`launch_task_executor.rs`). `RealStepRunner.run_step` returns a
`StepOutcome`; it never writes task/step business state.

Protocol terminal events (`Completion`/`Failure`/`Cancelled`) are **evidence**. They flow through
the **existing** chain: the structured path produces an `AgentResult` (same struct the PTY
supervisor returns) → `process_completion` → `classify()` → `StepOutcome` → executor transitions.
**No event mapper mutates state in parallel.** Shadow `Run`/`RunStep` finalisation stays exactly
where it is today (`RealStepRunner::process_completion` / `finish_run_step` /
`set_shadow_run_state`). The protocol event sink only *persists evidence* and *derives an outcome*;
it calls no state-transition repo.

This directly answers handoff open-question #3 and the re-review's blocking risk #1.

### 2. Adapter path (ADR requirement #2)

Reuse the existing **`CodexProtocolAdapter`** from a **narrow internal helper** invoked by
`RealStepRunner` — *not* a public `ProtocolStepRunner` trait (non-goal), *not* a JSON parser scraped
off PTY output, *not* an `AgentTransport` framework (non-goal).

- New private module `crates/superkick-runtime/src/codex_structured_step.rs` exposing one helper,
  e.g. `launch_codex_structured(...) -> Result<(AgentHandle, JoinHandle<Result<AgentResult>>)>` —
  **the same return shape as `AgentSupervisor::launch`**, so the rest of `run_step` is unchanged.
- Fork in `run_step` (≈ line 872, before `build_launch_config`):
  `if resolved.provider == Codex && resolved.runner_mode == ExecJson { launch_codex_structured(…) }
  else { build_launch_config + supervisor.launch(…) }`. Default Codex steps are `ExecJson`
  (`RunnerMode::default_for(Codex)`), so they take the structured path. `(Codex, InteractivePty)`
  (e.g. takeover) and **all Claude modes** keep the PTY path **bit-for-bit**.
- The helper reuses the already-resolved `spawn_plan` (MCP audit + Linear snapshot block folded
  into the prompt) and builds a provider-neutral `TurnRequest { prompt, workdir, options }`. The
  adapter owns its own argv (`codex exec --json --model … --sandbox …`); we do **not** reuse
  `apply_runner_mode`/`build_launch_config` argv shaping on this path.
- It creates and inserts the `AgentSession` row (mirroring `AgentSupervisor::launch`, via a small
  shared helper to avoid duplicating the field mapping) and records the `Spawning` lifecycle, so
  the session exists for the ledger, cancellation, and `provider_session_id`.

### 3. `run_events` shape + migration (ADR requirement #3)

Reuse `run_events` (no new table — non-goal). **Minimal migration `033_run_events_seq.sql`:**

- `ALTER TABLE run_events ADD COLUMN seq INTEGER;`
- Backfill existing rows deterministically: `seq = ROW_NUMBER() OVER (PARTITION BY run_id ORDER BY
  ts, id)` (SQLite ≥ 3.25 window function).
- `CREATE INDEX idx_run_events_run_seq ON run_events(run_id, seq);`

**`seq` is allocated by storage at insert time**, per run, via a scalar subquery so *every*
producer (step engine, supervisor lifecycle, services, and the new protocol sink) gets a stable
total order without changing any caller:
`INSERT … VALUES (…, (SELECT COALESCE(MAX(seq),0)+1 FROM run_events WHERE run_id = ?))`. SQLite's
single-writer lock makes `MAX+1` race-free. Reads (`list_by_run`, `list_by_run_from_offset`) switch
to `ORDER BY seq`. `RunEvent` gains a read-populated `seq: u64` field (ignored on insert).

**Discriminator: strict-kind, not a `category` column.** Add **one** variant
`EventKind::AgentProtocol` (serialises `"agent_protocol"`). A protocol row is:
`kind = AgentProtocol`, `payload_json = <full ProtocolEventEnvelope JSON>`, `run_id` = shadow run,
`run_step_id` = shadow `RunStep`, `message` = short human label (e.g. `"tool: apply_patch"`),
`level` mapped from the event (`Failure`→Error, `Log` level, else Info). The audit `EventKind`
variants stay lifecycle-focused; all provider evidence funnels through `AgentProtocol` whose detail
lives in the typed envelope. `WHERE kind = 'agent_protocol'` is the cheap "provider evidence only"
filter — a `category` column would be redundant with this. The ticket explicitly permits "strict
`kind` convention" instead of `category`.

The envelope's per-turn `seq` is preserved **inside** `payload_json` as provenance; the row's
per-run `seq` is what orders replay.

### 4. Event volume policy (ADR requirement #4)

The sink coalesces and filters before persisting:

- **Persist:** `SessionMeta`, `ToolUse`, `ToolResult`, `Usage`, `file_change` (arrives as the
  Codex `file_change` item → currently a parser event; persisted as evidence only), `Completion`,
  `Failure`, `Cancelled`, and `Log` (Info+; the invalid-JSONL diagnostic is a `Log(Warn)`).
- **Coalesce:** accumulate `TextDelta` by `block_id` in memory and persist **one** `TextBlock` row
  when the block closes (block id changes or terminal). Do **not** persist every delta.
- **Thinking:** coalesce like text; persist at most one block per `block_id` (debug-ish, kept for
  observability). Live UI streaming of raw deltas is out of scope here (Phase later); the ledger is
  the coalesced trace.

Live broadcast is automatic: the sink writes through the existing
`PublishingRunEventRepo`, which publishes each insert to `WorkspaceEventBus` → `/events` SSE.

### 5. Invalid / unknown Codex JSONL (ADR requirement: visible diagnostic, never silent)

Today `codex_stream::parse_line` returns an empty `Vec` (silent `debug!`) on a JSON parse error or a
malformed sub-envelope. Change the parser so a **non-empty line that fails to parse** (and any
malformed `turn.*`/`error`/`item.*` envelope) emits a `ProtocolEvent::Log { level: Warn, message:
"codex: unparseable jsonl: <prefix…>" }` (prefix truncated to ~120 chars) instead of dropping it.
Blank lines stay no-ops. Unknown top-level `type` already emits `Log(Info) "codex.<type>"` — kept.

This is in the shared parser, so chat benefits too; both paths persist the `Log` (run_events /
turn_events). Result: invalid JSONL is a controlled, visible diagnostic, never silently dropped.

### 6. `SessionMeta` → `provider_session_id`

On the **first** `ProtocolEvent::SessionMeta`, the sink calls
`AgentSessionRepo::set_provider_session_id(session_id, meta.resume_key.as_str())` (idempotent,
mirrors `conversation_runner.rs`). PTY path stays `None` → Claude unchanged. This unblocks Phase D
(takeover/resume) without doing takeover here.

### 7. Mid-run takeover semantics for a headless step (ADR requirement #5)

A `codex exec --json` step is **headless — there is no live PTY to attach**. This ticket does not
build takeover; it must not *fake* one. Semantics recorded for Phase C/D: takeover of a running
headless Codex step = **cancel + retry**, or (later) a fresh interactive session seeded from a
`RunContextSnapshot`, optionally resuming via the now-persisted `provider_session_id`. The Run
drawer's terminal/takeover affordance must not pretend a structured step has an attachable live
terminal. No change to the existing terminal-takeover code in this ticket.

### 8. Files / diffs stay git-derived

Provider `file_change` events are **evidence only** (shown in Activity). The **Files/Changes** tab
keeps reading the git diff (`runDiffQuery` → worktree). No fake diffs.

### 9. Raw transcript fallback

The sink writes a best-effort raw transcript (concatenated assistant text / raw JSONL) to
`TranscriptRepo` for the shadow run, so the debug/terminal surface still has the raw stream. Keeps
the "transcript remains as fallback" guarantee.

### 10. UI consumption of real events

- **types/events.ts:** add `'agent_protocol'` to `EventKind`; add typed `ProtocolEventEnvelope` /
  `ProtocolEvent` mirrors (in `ui/src/types/**`, barrel-exported).
- **Activity:** `ActivityTab` gains a branch — when events carry `kind === 'agent_protocol'`,
  render them through a new `ProtocolActivityList` that displays the *actual* envelope (tool name +
  input summary, tool result ok/err, coalesced text/thinking, usage tokens, log level+message,
  session-meta resume chip, terminal). The legacy `StructuredActivityList`/`LedgerList` paths are
  untouched for playbook runs.
- **Tools:** derive tool calls for shadow/launch runs from the `agent_protocol` run_events
  (`ToolUse`/`ToolResult` paired by `call_id`) rather than the empty conversations projection. The
  conversation-based source stays for chat runs.
- **Logs:** extend the filter to include `agent_protocol` rows whose inner kind is `log`/`text`,
  rendered with the protocol level.
- **Files:** unchanged.

No faked data anywhere: every surface renders persisted, real provider evidence or git state.

## Consequences

- **Claude path:** zero behavioural change (PTY, marker scanning, classifier, transcript identical).
- **All run_events** become deterministically ordered by per-run `seq` — a strict improvement for
  the whole ledger, not just protocol rows (lifecycle + protocol events interleave on one shadow
  run, so a uniform order is required).
- `RunEvent` gains a `seq` field → construction sites and `RunEvent::new` updated (default 0,
  storage assigns). Read paths/UI gain `seq`.
- A small shared "build + insert AgentSession from launch config" helper is extracted so the
  structured path does not duplicate the supervisor's session mapping.
- Deferred (explicitly out of scope, per non-goals): liveness/orphan reconciliation (SUP-186),
  `RunContextSnapshot` (SUP-187), takeover-from-snapshot, capability registry, Codex failure-hint
  patterns (SUP-140), Claude structured default, any transport framework, any new event table.

## Test strategy (real SQLite; no mocked storage)

- **Parser unit tests** (`codex_stream.rs`): invalid JSON line and malformed envelopes now emit a
  `Log(Warn)` instead of dropping; existing variant tests stay green.
- **Storage integration** (`sqlite_integration.rs`): `seq` auto-allocation is monotonic per run;
  backfill orders existing rows; `list_by_run` returns `seq` order.
- **Runtime integration** (new, alongside `launch_task_real_step_runner.rs` using a mock `codex`
  via the adapter's `spawn_codex_pump_for_test`/scripted child): a Codex `ExecJson` step persists
  `agent_protocol` run_events in stable `seq` order; `SessionMeta` populates
  `provider_session_id`; `Completion` yields `StepOutcome::Completed` through `process_completion`
  *without* the event sink mutating step/task state; mid-flight `list_by_run` backfills prior
  events deterministically; a `(Claude, *)` step still goes through the PTY path (regression).
- **UI** (vitest + testing-library): `ProtocolActivityList` renders tool/text/log/terminal from
  `agent_protocol` payloads; Tools derives calls from paired `ToolUse`/`ToolResult`; Logs includes
  protocol log/text; Files stays git-derived; an old run with no protocol events still renders the
  ledger.

## Acceptance-criteria traceability

| AC | Mechanism |
|---|---|
| Codex run shows tools/logs live without opening the terminal | structured sink → `PublishingRunEventRepo` → `/events` SSE → Activity/Tools/Logs |
| Mid-flight reopen backfills in deterministic order | `seq` column + `ORDER BY seq` + `GET /runs/{id}/events/log` |
| `run_events` replay stable & test-covered | per-run `seq` + storage tests |
| `SessionMeta` → `agent_sessions.provider_session_id` | sink calls `set_provider_session_id` on first `SessionMeta` |
| Terminal events → correct `StepOutcome`, no double-mutate | `AgentResult` → `process_completion` → `classify` → executor (single owner) |
| Invalid JSONL = visible diagnostic | `parse_line` emits `Log(Warn)`, persisted |
| Files confirmed by git diff, not provider events | Files tab unchanged (`runDiffQuery`) |
| No fake tool calls/logs/diffs | all surfaces render persisted real evidence / git |
| Claude PTY path unchanged | fork only on `(Codex, ExecJson)` |

## Post-review refinements

An adversarial multi-agent review of the diff confirmed four issues (all fixed in this PR):

1. **`seq` propagation to the live stream.** Originally `seq` was assigned only to the DB row, so the SSE broadcast copy carried `seq = 0` while REST backfill carried the real `seq` — scrambling the UI's seq-ordered protocol rows on a mid-flight reopen. Fixed at the root: `RunEventRepo::insert` now returns the assigned per-run `seq` (via `INSERT … RETURNING seq`), and `PublishingRunEventRepo` broadcasts a copy carrying it, so SSE and backfill agree.
2. **`null` vs `optional` in the UI protocol schema.** `UsageSnapshot` has no `skip_serializing_if`, so `Option::None` serializes as explicit JSON `null`; the zod `usageSchema` used `.optional()` (which rejects `null`), silently dropping every real `usage`/`completion` envelope from Activity. Fixed: usage fields are `.nullish()`, with a regression test mirroring real serde output.
3. **Honest `command` audit.** The structured `AgentSession.command` recorded the unused PTY-style argv (prompt inlined); it now records the real `codex exec --json …` argv (prompt is fed via stdin, never inlined) via `CodexProtocolAdapter::command_preview`.
4. Nine further candidate findings were raised and refuted (false positives / out-of-scope / already-handled).
