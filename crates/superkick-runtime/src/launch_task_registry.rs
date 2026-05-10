//! In-process registry of live `LaunchTask` cancellation tokens (SUP-118).
//!
//! The auto-trigger in `POST /launch-tasks` spawns the executor on
//! `tokio::spawn`; the operator-facing `POST /launch-tasks/{id}/cancel`
//! handler needs a way to signal that detached task. Persisting cancel
//! intent on the row would force the executor to poll, so we keep the
//! registry in-memory and accept the V1 invariant that "executions do not
//! survive a server restart" (recorded explicitly in the plan and ticket
//! body — crash recovery is a follow-up).

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use tokio_util::sync::CancellationToken;

use superkick_core::LaunchTaskId;

/// Maps `LaunchTaskId` to the cancellation token of its currently-running
/// executor. Empty when no execution is live in this process.
#[derive(Default)]
pub struct LaunchTaskRegistry {
    inner: Mutex<HashMap<LaunchTaskId, CancellationToken>>,
}

impl LaunchTaskRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a token for an active execution. Returns the previous token
    /// if the task was already registered — caller decides whether to cancel
    /// the prior run before overwriting (the executor itself rejects
    /// duplicate `run` calls upstream of this).
    pub fn register(
        &self,
        task_id: LaunchTaskId,
        token: CancellationToken,
    ) -> Option<CancellationToken> {
        self.lock().insert(task_id, token)
    }

    /// Cancel the active execution if any. Returns `true` if a token was
    /// found, `false` if there is no live executor for the task in this
    /// process (orphan after restart, already finished, never started).
    pub fn cancel(&self, task_id: LaunchTaskId) -> bool {
        let guard = self.lock();
        if let Some(token) = guard.get(&task_id) {
            token.cancel();
            true
        } else {
            false
        }
    }

    /// Drop the entry for a finished execution.
    pub fn unregister(&self, task_id: LaunchTaskId) {
        self.lock().remove(&task_id);
    }

    pub fn contains(&self, task_id: LaunchTaskId) -> bool {
        self.lock().contains_key(&task_id)
    }

    /// Lock the inner map, recovering the inner data on poison rather than
    /// propagating a panic. Each registry operation is a sub-microsecond
    /// `HashMap` op that cannot leave the map in an invalid logical state, so
    /// poison recovery is safe — and crucially keeps a panic in any caller
    /// from killing every subsequent `cancel` / `unregister` call (which
    /// would silently break the SUP-118 supervisor).
    fn lock(&self) -> MutexGuard<'_, HashMap<LaunchTaskId, CancellationToken>> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_and_cancel_signals_token() {
        let reg = LaunchTaskRegistry::new();
        let id = LaunchTaskId::new();
        let token = CancellationToken::new();
        assert!(reg.register(id, token.clone()).is_none());
        assert!(reg.contains(id));
        assert!(reg.cancel(id));
        assert!(token.is_cancelled());
    }

    #[test]
    fn cancel_unknown_task_returns_false() {
        let reg = LaunchTaskRegistry::new();
        assert!(!reg.cancel(LaunchTaskId::new()));
    }

    #[test]
    fn unregister_removes_token() {
        let reg = LaunchTaskRegistry::new();
        let id = LaunchTaskId::new();
        reg.register(id, CancellationToken::new());
        reg.unregister(id);
        assert!(!reg.contains(id));
    }
}
