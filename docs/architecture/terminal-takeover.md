# Terminal takeover semantics for protocol-first runs (SUP-101)

## Why this exists

A protocol-first run (`claude stream-json`, `codex exec --json`) does not
expose an interactive PTY mid-turn. Operators still need to "open the
terminal" — to inspect the worktree, to continue the conversation in the
provider's interactive CLI, or to abort the protocol turn and take over by
hand. Pretending that all three are the same hides real differences and
leads to surprising behaviour. SUP-101 names them.

## The three modes

### `inspect`

Spawn an interactive shell rooted in the run's worktree. Read-only against
the agent — does not touch the protocol process or its session state.
Always available, including while a turn is streaming.

### `interactive_continuation`

Spawn the provider's interactive CLI in the worktree. When the adapter
advertises support, the CLI is launched with the resume flag pointing at
the conversation's `provider_session_id` so the operator picks up where
the agent left off. When the adapter does not yet support resume, the CLI
starts fresh and the response payload reports `resume_attempted: false`.
The UI surfaces this distinction directly — a "Resume not supported"
badge, never a silent fallback.

Today: Claude supports resume via `--resume <session_id>`. Codex does not
(its `exec --json` thread id has no matching interactive flag yet); the
helper returns `resume_attempted: false`.

### `force_takeover`

Cancel the in-flight protocol turn first, then open one of the two modes
above as a sub-mode. Requires `confirm_force: true` in the request body —
no defaulting, because the turn's work is discarded.

The cancellation path goes through `ConversationRunner::cancel_turn` which
both trips the adapter's `CancellationToken` (so the pump emits a
`Cancelled` envelope and the child process is reaped) and marks the turn
row terminal in storage. Returns 409 `no active turn` if there is nothing
to cancel.

## Multi-writer

Each takeover is a distinct `PtySession` with its own `WriterHolder`
lease. Two browser tabs on the same `takeover_session_id` supersede each
other via the existing `same_kind` rule — same as the run-primary PTY.

Critically: the protocol process's stdin is **never** shared with a
takeover PTY. The protocol pump owns its child via piped stdin/stdout;
takeover PTYs spawn their own child in the same worktree but with no
handle into the protocol process. This keeps two operator surfaces from
fighting for the same input stream.

## Persistence

- `EventKind::TerminalTakeoverOpened` and `TerminalTakeoverClosed` land
  in `run_events` with `payload_json` carrying
  `{ mode, takeover_session_id, operator_id?, reason? }`. The `RunLedger`
  surfaces them like any other run event.
- The `PtySessionRegistry` keeps a secondary `TakeoverSessionId →
  TakeoverEntry` map alongside the legacy `RunId → PtySession` index. The
  primary index is unchanged so legacy PTY-backed runs (SUP-74/75) still
  attach via `GET /runs/{id}/terminal`.
- **No durable transcript** is persisted for takeover PTYs. Scrollback is
  in-memory (the same ring buffer used by the primary session); when the
  child exits and the cleanup window elapses, the bytes are gone. If we
  later need an audit trail of every operator-driven session, a
  `takeover_transcripts` table is the obvious follow-up — out of scope
  here to keep SUP-101 honest.

## API surface

```
GET    /api/runs/{id}/terminal-takeover/modes         → mode availability
POST   /api/runs/{id}/terminal-takeover/open          → open a takeover
POST   /api/runs/{id}/terminal-takeover/{ts_id}/close → close a takeover
GET    /api/runs/{id}/takeovers                       → list active
GET    /api/runs/{id}/terminal/{ts_id}                → WebSocket attach
```

The legacy primary routes (`GET /runs/{id}/terminal`,
`GET /runs/{id}/terminal-history`) keep working unchanged for runs that
were spawned via the agent supervisor.

## What this is not

- Not a fake live-attach onto the protocol process. There is no
  in-progress PTY to attach to — the protocol process owns piped
  stdin/stdout streams. `inspect` and `interactive_continuation` spawn
  *new* processes in the worktree.
- Not a way to recover a partially-emitted protocol response. The chat
  surface (SUP-100 conversations / turns) is the canonical path for
  in-flight observation; takeovers are escape hatches, not replacements.
- Not an audit log of every keystroke (see "Persistence" above).
