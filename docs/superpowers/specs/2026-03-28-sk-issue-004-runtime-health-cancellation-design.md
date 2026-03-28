# SK-ISSUE-004 — Runtime Health & Cancellation Hardening

## Goal

Make the local control plane trustworthy: health checks prove the service is alive, cancel stops real work, and startup errors are accurate.

## Changes

### 1. `superkick status` — HTTP health check

**Files**: `crates/superkick-cli/src/status.rs`, `crates/superkick-cli/src/net.rs`

Replace TCP `connect_timeout` with an HTTP GET to `http://127.0.0.1:{port}/health`.

- Use `ureq` (already a CLI dep) with a 2s timeout.
- Server is healthy only if response is 200 with body `"ok"`.
- `net::ensure_server_reachable` also switches to the HTTP probe so `cancel` and `run` get the same guarantee.
- Output stays the same: `[ok]` / `[!!]` messages.

### 2. `superkick serve` — differentiated bind errors

**Files**: `crates/superkick-cli/src/serve.rs`

Stop discarding the `io::Error` from `TcpListener::bind`. Match on `ErrorKind`:

| `ErrorKind`        | Message                                                        |
|--------------------|----------------------------------------------------------------|
| `AddrInUse`        | Current message with lsof hints (unchanged)                    |
| `PermissionDenied` | "Permission denied binding to port {port}. Try a port > 1024." |
| Other              | "Failed to bind to {addr}: {original_error}"                   |

### 3. Run cancellation — per-run `CancellationToken`

**Files**: `crates/superkick-api/src/lib.rs`, `crates/superkick-runtime/src/step_engine.rs`, `crates/superkick-runtime/Cargo.toml`

#### Data flow

```
cancel_run endpoint
  → looks up CancellationToken in AppState.run_tokens
  → calls token.cancel()
  → also persists Cancelled state in DB (existing behavior)

StepEngine::execute(run, token)
  → passes token into execute_inner
  → at each step boundary: if token.is_cancelled() → transition to Cancelled, return
  → in execute_agent: pass child token to select! alongside agent join handle
  → in execute_commands: check between each command
```

#### Implementation details

- Add `tokio-util` with `rt` feature to `superkick-runtime/Cargo.toml`.
- Add `run_tokens: Arc<Mutex<HashMap<RunId, CancellationToken>>>` to `AppState`.
- In `trigger_run`: create token, insert into map, pass to `engine.execute()`.
- Modify `StepEngine::execute` signature to accept `CancellationToken`.
- In `execute_inner`: check `token.is_cancelled()` before each step iteration.
- In `execute_agent`: use `tokio::select!` with `token.cancelled()` alongside the agent `JoinHandle`. On cancellation, call `handle.cancel()` on the `AgentHandle` (currently discarded as `_handle`).
- In `execute_commands`: check `token.is_cancelled()` before each command.
- In `cancel_run` endpoint: look up and cancel the token. Remove from map.
- On run completion (any terminal state): remove token from map to prevent leaks.

#### Edge cases

- Cancel of a run that has no token (already finished or never started): DB-only cancel, no error — same as today.
- Cancel during `wait_for_interrupt`: the interrupt poll loop should also select on the token.
- Cancel during setup commands: setup runs in a background `JoinHandle` — the step boundary check after setup completes handles this naturally.

## Non-goals

- No distributed cancellation.
- No changes to the dashboard.
- No new API endpoints — cancel endpoint stays the same, just gains real power.
- No changes to the `/health` response format.

## Testing

- `cargo test` for compilation.
- Manual: `superkick status` with server up → `[ok]`; server down → `[!!]`.
- Manual: start a run, cancel it, verify the agent process is killed.
- Manual: `superkick serve` on an occupied port → specific error; on port 80 → permission denied.
