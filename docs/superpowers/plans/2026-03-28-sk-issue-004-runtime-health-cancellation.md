# SK-ISSUE-004 — Runtime Health & Cancellation Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `status` check real HTTP health, `cancel` stop real work, and `serve` report accurate startup errors.

**Architecture:** Three independent changes to the CLI and runtime. The cancellation token flows from the API layer (where it's created per-run and stored in shared state) through `StepEngine::execute` into agent/command execution loops. Status and serve changes are CLI-only.

**Tech Stack:** Rust, Tokio, `tokio-util` (CancellationToken), Axum, ureq

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `crates/superkick-cli/src/status.rs` | Modify | HTTP health check via ureq |
| `crates/superkick-cli/src/net.rs` | Modify | HTTP-based `ensure_server_reachable` |
| `crates/superkick-cli/src/serve.rs` | Modify | Differentiated bind error messages |
| `crates/superkick-runtime/Cargo.toml` | Modify | Add `tokio-util` dependency |
| `crates/superkick-runtime/src/step_engine.rs` | Modify | Accept and check `CancellationToken` |
| `crates/superkick-api/Cargo.toml` | Modify | Add `tokio-util` dependency |
| `crates/superkick-api/src/lib.rs` | Modify | Store per-run tokens, wire cancel |

---

### Task 1: HTTP health check in `superkick status`

**Files:**
- Modify: `crates/superkick-cli/src/status.rs`

- [ ] **Step 1: Replace TCP probe with HTTP GET in `check_health`**

Replace the entire `check_health` function:

```rust
fn check_health(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/health");
    match ureq::get(&url).timeout(std::time::Duration::from_secs(2)).call() {
        Ok(resp) if resp.status() == 200 => {
            resp.into_body()
                .read_to_string()
                .map(|body| body.trim() == "ok")
                .unwrap_or(false)
        }
        _ => false,
    }
}
```

Remove the `use std::time::Duration;` import (no longer needed standalone — used inline). Add nothing else — `ureq` is already a dependency of `superkick-cli`.

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p superkick-cli`
Expected: success, no errors.

- [ ] **Step 3: Commit**

```
feat(status): use HTTP health check instead of TCP probe

status now GETs /health and checks for 200+"ok" instead of just
testing whether the TCP port accepts connections.
```

---

### Task 2: HTTP probe in `net::ensure_server_reachable`

**Files:**
- Modify: `crates/superkick-cli/src/net.rs`

- [ ] **Step 1: Replace TCP probe with HTTP GET**

Replace the entire file content:

```rust
/// Check that a Superkick server is reachable on the given port, or bail.
pub fn ensure_server_reachable(port: u16) -> anyhow::Result<()> {
    let url = format!("http://127.0.0.1:{port}/health");
    match ureq::get(&url)
        .timeout(std::time::Duration::from_secs(2))
        .call()
    {
        Ok(resp) if resp.status() == 200 => Ok(()),
        _ => anyhow::bail!(
            "No healthy Superkick server on port {}. Start one with: superkick serve",
            port
        ),
    }
}
```

Remove the old `use std::net::{SocketAddr, TcpStream};` and `use std::time::Duration;` imports — they're no longer needed.

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p superkick-cli`
Expected: success.

- [ ] **Step 3: Commit**

```
feat(net): switch ensure_server_reachable to HTTP health probe

cancel and run commands now verify the server is actually responsive
at the HTTP layer, not just that the TCP port is open.
```

---

### Task 3: Differentiated bind errors in `superkick serve`

**Files:**
- Modify: `crates/superkick-cli/src/serve.rs`

- [ ] **Step 1: Match on `io::ErrorKind` instead of discarding the error**

Replace the `TcpListener::bind` call and its `map_err`:

```rust
    let listener = tokio::net::TcpListener::bind(&addr).await.map_err(|e| {
        match e.kind() {
            std::io::ErrorKind::AddrInUse => anyhow::anyhow!(
                "Port {} is already in use.\n\n\
                 Check what's running:  lsof -i :{}\n\
                 Kill it:               kill $(lsof -ti :{})\n\
                 Or use another port:   superkick serve -p {}",
                args.port,
                args.port,
                args.port,
                args.port + 1
            ),
            std::io::ErrorKind::PermissionDenied => anyhow::anyhow!(
                "Permission denied binding to port {}.\n\
                 Try a port above 1024:  superkick serve -p {}",
                args.port,
                args.port.max(1025)
            ),
            _ => anyhow::anyhow!("Failed to bind to {}: {}", addr, e),
        }
    })?;
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p superkick-cli`
Expected: success.

- [ ] **Step 3: Commit**

```
fix(serve): differentiate bind errors instead of always saying "port in use"

Permission denied and other bind failures now get their own error
messages instead of being lumped into the "already in use" case.
```

---

### Task 4: Add `tokio-util` dependency to runtime and API crates

**Files:**
- Modify: `crates/superkick-runtime/Cargo.toml`
- Modify: `crates/superkick-api/Cargo.toml`
- Modify: `Cargo.toml` (workspace)

- [ ] **Step 1: Add `tokio-util` to workspace dependencies**

In `Cargo.toml` (workspace root), add to `[workspace.dependencies]`:

```toml
tokio-util = { version = "0.7", features = ["rt"] }
```

- [ ] **Step 2: Add `tokio-util` to runtime crate**

In `crates/superkick-runtime/Cargo.toml`, add under `[dependencies]`:

```toml
tokio-util.workspace = true
```

- [ ] **Step 3: Add `tokio-util` to API crate**

In `crates/superkick-api/Cargo.toml`, add under `[dependencies]`:

```toml
tokio-util.workspace = true
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check -p superkick-runtime -p superkick-api`
Expected: success (unused import warnings are fine at this stage).

- [ ] **Step 5: Commit**

```
chore: add tokio-util dependency for CancellationToken
```

---

### Task 5: Thread `CancellationToken` through `StepEngine::execute`

**Files:**
- Modify: `crates/superkick-runtime/src/step_engine.rs`

- [ ] **Step 1: Add import at the top of step_engine.rs**

Add after the existing `use tokio::process::Command;` line:

```rust
use tokio_util::sync::CancellationToken;
```

- [ ] **Step 2: Change `execute` signature to accept a token**

Change the `execute` method signature (around line 85):

```rust
    pub async fn execute(
        &self,
        mut run: superkick_core::Run,
        cancel_token: CancellationToken,
    ) -> Result<()> {
```

Pass the token to `execute_inner`:

```rust
        let result = self.execute_inner(&mut run, &cancel_token).await;
```

- [ ] **Step 3: Change `execute_inner` to accept and check the token**

Change signature (around line 106):

```rust
    async fn execute_inner(
        &self,
        run: &mut superkick_core::Run,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
```

Add a cancellation check at the **top of the step loop**, right after `for step_key in step_keys {` (line 113) and before the setup handle wait:

```rust
        for step_key in step_keys {
            // ── Cancellation check at step boundary ──
            if cancel_token.is_cancelled() {
                info!(run_id = %run.id, "run cancelled at step boundary");
                run.transition_to(RunState::Cancelled)
                    .context("failed to transition to Cancelled")?;
                run.current_step_key = None;
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    "run cancelled".into(),
                )
                .await;
                return Ok(());
            }
```

- [ ] **Step 4: Pass token into `execute_step`**

Change `execute_step` signature to accept the token:

```rust
    async fn execute_step(
        &self,
        key: StepKey,
        run: &mut superkick_core::Run,
        step: &RunStep,
        worktree_path: Option<&std::path::Path>,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
```

Update the call site in `execute_inner` (around line 176):

```rust
                    match self
                        .execute_step(step_key, run, &step, worktree_path.as_deref(), cancel_token)
                        .await
```

Pass token through to `execute_agent` and `execute_commands` in the match arms:

```rust
        match key {
            StepKey::Prepare => self.execute_prepare(run).await,
            StepKey::Plan => {
                let wt = require_worktree(worktree_path)?;
                let agent_name = self.find_workflow_agent(key)?;
                self.execute_agent(run, step, &agent_name, wt, cancel_token).await
            }
            StepKey::Code => {
                let wt = require_worktree(worktree_path)?;
                let agent_name = self.find_workflow_agent(key)?;
                self.execute_agent(run, step, &agent_name, wt, cancel_token).await
            }
            StepKey::Commands => {
                let wt = require_worktree(worktree_path)?;
                let commands = self.find_workflow_commands()?;
                self.execute_commands(run, step, &commands, wt, cancel_token).await
            }
            StepKey::CreatePr => {
                let wt = require_worktree(worktree_path)?;
                self.execute_create_pr(run, step, wt).await
            }
            StepKey::ReviewSwarm => {
                let wt = require_worktree(worktree_path)?;
                let (agents, threshold) = self.find_review_swarm_config()?;
                self.execute_review_swarm(run, step, &agents, threshold, wt)
                    .await
            }
            StepKey::AwaitHuman => Ok(()),
        }
```

Note: `Prepare`, `CreatePr`, and `ReviewSwarm` don't need the token — they're short-lived. The step boundary check handles them.

- [ ] **Step 5: Wire cancel into `execute_agent`**

Change the `execute_agent` signature (around line 589):

```rust
    async fn execute_agent(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        agent_name: &str,
        worktree: &std::path::Path,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
```

Replace the section that launches and awaits the agent (around lines 645-654). Change `_handle` to `handle` and use `select!`:

```rust
        let (handle, join) = self
            .supervisor
            .launch(launch_cfg)
            .await
            .context("failed to launch agent")?;

        let result = tokio::select! {
            res = join => {
                res.context("agent task panicked")?
                   .context("agent execution failed")?
            }
            _ = cancel_token.cancelled() => {
                handle.cancel().await;
                bail!("run cancelled during agent execution");
            }
        };
```

- [ ] **Step 6: Wire cancel into `execute_commands`**

Change the `execute_commands` signature (around line 668):

```rust
    async fn execute_commands(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        commands: &[String],
        worktree: &std::path::Path,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
```

Add a cancellation check at the top of the command loop (right after `for cmd_str in commands {`):

```rust
        for cmd_str in commands {
            if cancel_token.is_cancelled() {
                bail!("run cancelled before command: {cmd_str}");
            }
```

- [ ] **Step 7: Wire cancel into `wait_for_interrupt`**

Change the signature (around line 1211):

```rust
    async fn wait_for_interrupt(
        &self,
        interrupt_id: superkick_core::InterruptId,
        cancel_token: &CancellationToken,
    ) -> Result<InterruptAction> {
        loop {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(2)) => {}
                _ = cancel_token.cancelled() => {
                    bail!("run cancelled while waiting for human interrupt");
                }
            }

            if let Some(interrupt) = self.interrupt_repo.get(interrupt_id).await? {
                if interrupt.status == superkick_core::InterruptStatus::Resolved {
                    if let Some(answer) = &interrupt.answer_json {
                        let action: InterruptAction = serde_json::from_value(answer.clone())
                            .context("failed to parse interrupt action")?;
                        return Ok(action);
                    }
                }
            }
        }
    }
```

Update the call site in `execute_inner` (around line 313) to pass the token:

```rust
                    let action = self.wait_for_interrupt(interrupt.id, cancel_token).await?;
```

- [ ] **Step 8: Verify it compiles**

Run: `cargo check -p superkick-runtime`
Expected: success.

- [ ] **Step 9: Commit**

```
feat(runtime): thread CancellationToken through StepEngine

execute() now accepts a CancellationToken checked at every step
boundary, during agent execution (via select!), between commands,
and during interrupt waits.
```

---

### Task 6: Wire per-run tokens in the API layer

**Files:**
- Modify: `crates/superkick-api/src/lib.rs`

- [ ] **Step 1: Add imports**

Add at the top of the file, after existing imports:

```rust
use std::collections::HashMap;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
```

- [ ] **Step 2: Add `run_tokens` to `AppState`**

Add a new field to the `AppState` struct:

```rust
#[derive(Clone)]
struct AppState {
    run_repo: Arc<SqliteRunRepo>,
    step_repo: Arc<SqliteRunStepRepo>,
    event_repo: Arc<SqliteRunEventRepo>,
    interrupt_repo: Arc<SqliteInterruptRepo>,
    engine: Arc<Engine>,
    interrupt_service: Arc<IntService>,
    run_tokens: Arc<Mutex<HashMap<RunId, CancellationToken>>>,
}
```

- [ ] **Step 3: Initialize `run_tokens` in `run_server`**

In the `run_server` function, update the `AppState` construction (around line 88):

```rust
    let state = AppState {
        run_repo,
        step_repo,
        event_repo,
        interrupt_repo,
        engine,
        interrupt_service,
        run_tokens: Arc::new(Mutex::new(HashMap::new())),
    };
```

- [ ] **Step 4: Create token and pass to engine in `trigger_run`**

In the `trigger_run` handler (around line 178-184), replace the `tokio::spawn` block:

```rust
    let engine = Arc::clone(&state.engine);
    let run_clone = run.clone();
    let token = CancellationToken::new();
    let spawn_token = token.clone();

    {
        let mut tokens = state.run_tokens.lock().await;
        tokens.insert(run.id, token);
    }

    let run_tokens = Arc::clone(&state.run_tokens);
    let run_id = run.id;
    tokio::spawn(async move {
        if let Err(e) = engine.execute(run_clone, spawn_token).await {
            tracing::error!(error = %e, "run execution failed");
        }
        // Clean up token when run finishes.
        run_tokens.lock().await.remove(&run_id);
    });
```

Note: `create_run` is the handler name in the route, but the function is called `trigger_run` based on the code at line ~130. Verify the actual function name.

- [ ] **Step 5: Cancel the token in `cancel_run`**

In the `cancel_run` handler, add token cancellation right before the DB state update (around line 297):

```rust
    // Signal the running task to stop.
    {
        let mut tokens = state.run_tokens.lock().await;
        if let Some(token) = tokens.remove(&run_id) {
            token.cancel();
        }
    }

    // Persist cancelled state.
    run.transition_to(superkick_core::RunState::Cancelled)
        .map_err(|e| AppError::Internal(e.into()))?;
    state.run_repo.update(&run).await?;
    Ok(Json(run))
```

Remove the old TODO comment (`// TODO: This only updates DB state...`).

- [ ] **Step 6: Verify it compiles**

Run: `cargo check -p superkick-api`
Expected: success.

- [ ] **Step 7: Run `cargo test`**

Run: `cargo test --workspace`
Expected: all existing tests pass.

- [ ] **Step 8: Commit**

```
feat(api): wire per-run CancellationToken into cancel endpoint

cancel_run now looks up the token for the run and cancels it,
signalling the StepEngine to stop at the next boundary or kill
the running agent process.
```

---

### Task 7: Full build verification

- [ ] **Step 1: Run full workspace check**

Run: `cargo check --workspace`
Expected: success with no errors.

- [ ] **Step 2: Run clippy**

Run: `cargo clippy --workspace -- -D warnings`
Expected: no warnings or errors.

- [ ] **Step 3: Run all tests**

Run: `cargo test --workspace`
Expected: all tests pass.

- [ ] **Step 4: Fix any issues found in steps 1-3**

If clippy or tests flag issues, fix them and re-run.

- [ ] **Step 5: Commit fixes if any**

Only if step 4 required changes.
