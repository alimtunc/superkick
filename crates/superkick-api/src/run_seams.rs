//! Production implementations of the runtime `RunSpawn` + `LaunchTaskCanceller`
//! seams. These erase the `StepEngine` and `LaunchTaskExecutor` generics so the
//! `RunService` (and thus `AppState`) never names them.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use superkick_core::{Run, RunId};
use superkick_runtime::RunSpawn;
use tokio_util::sync::CancellationToken;

use crate::Engine;

/// Owns the in-flight run cancellation registry and the `StepEngine` handle.
/// Keeps the CancellationToken-stored-before-spawn invariant inside a single
/// owner: the token is inserted into the registry synchronously before the
/// execution task is spawned, and removed when execution completes. The
/// registry uses a `std::sync::Mutex` (never held across an `.await`) so the
/// synchronous `RunSpawn::spawn` can store the token before `tokio::spawn`.
pub struct EngineRunSpawner {
    engine: Arc<Engine>,
    run_tokens: Arc<Mutex<HashMap<RunId, CancellationToken>>>,
}

impl EngineRunSpawner {
    pub fn new(engine: Arc<Engine>) -> Arc<Self> {
        Arc::new(Self {
            engine,
            run_tokens: Arc::new(Mutex::new(HashMap::new())),
        })
    }
}

impl RunSpawn for EngineRunSpawner {
    fn spawn(&self, run: Run) -> CancellationToken {
        let token = CancellationToken::new();
        let spawn_token = token.clone();
        let run_id = run.id;
        let engine = Arc::clone(&self.engine);
        let run_tokens = Arc::clone(&self.run_tokens);

        // Store the token BEFORE spawning so a cancel arriving immediately
        // afterwards cannot miss it. Recover a poisoned lock rather than drop
        // the insert — a brief insert/remove can't leave the map invalid.
        self.run_tokens
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(run_id, token.clone());

        tokio::spawn(async move {
            if let Err(e) = engine.execute(run, spawn_token).await {
                tracing::error!(error = %e, "run execution failed");
            }
            run_tokens
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .remove(&run_id);
        });

        token
    }

    fn cancel(&self, run_id: RunId) {
        if let Some(token) = self
            .run_tokens
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&run_id)
        {
            token.cancel();
        }
    }
}
