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

pub enum CancelDecision<'a> {
    Signalled,
    Reserved(ReservedSlot<'a>),
}

pub struct ReservedSlot<'a> {
    registry: &'a LaunchTaskRegistry,
    task_id: LaunchTaskId,
}

impl Drop for ReservedSlot<'_> {
    fn drop(&mut self) {
        self.registry.unregister(self.task_id);
    }
}

impl LaunchTaskRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert-if-absent: on conflict the new token is NOT stored, so the
    /// existing executor remains the one a subsequent `cancel` signals.
    pub fn try_register(
        &self,
        task_id: LaunchTaskId,
        token: CancellationToken,
    ) -> Result<(), CancellationToken> {
        use std::collections::hash_map::Entry;
        match self.lock().entry(task_id) {
            Entry::Occupied(occ) => Err(occ.get().clone()),
            Entry::Vacant(vac) => {
                vac.insert(token);
                Ok(())
            }
        }
    }

    /// Signal a live executor, or reserve the slot with a pre-cancelled
    /// sentinel so concurrent `try_register` calls fail until the returned
    /// guard drops.
    pub fn cancel_or_reserve(&self, task_id: LaunchTaskId) -> CancelDecision<'_> {
        use std::collections::hash_map::Entry;
        let mut guard = self.lock();
        match guard.entry(task_id) {
            Entry::Occupied(occ) => {
                occ.get().cancel();
                CancelDecision::Signalled
            }
            Entry::Vacant(vac) => {
                let sentinel = CancellationToken::new();
                sentinel.cancel();
                vac.insert(sentinel);
                CancelDecision::Reserved(ReservedSlot {
                    registry: self,
                    task_id,
                })
            }
        }
    }

    /// Drop the entry for a finished execution.
    pub fn unregister(&self, task_id: LaunchTaskId) {
        self.lock().remove(&task_id);
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
        reg.try_register(id, token.clone()).unwrap();
        // A second try_register failing proves the token is present in the slot.
        assert!(reg.try_register(id, CancellationToken::new()).is_err());
        assert!(matches!(
            reg.cancel_or_reserve(id),
            CancelDecision::Signalled
        ));
        assert!(token.is_cancelled());
    }

    #[test]
    fn cancel_unknown_task_reserves_instead_of_signalling() {
        let reg = LaunchTaskRegistry::new();
        // No live token for an unknown task — cancel_or_reserve must not
        // pretend it signalled one; it reserves the empty slot instead.
        assert!(matches!(
            reg.cancel_or_reserve(LaunchTaskId::new()),
            CancelDecision::Reserved(_)
        ));
    }

    #[test]
    fn unregister_removes_token() {
        let reg = LaunchTaskRegistry::new();
        let id = LaunchTaskId::new();
        reg.try_register(id, CancellationToken::new()).unwrap();
        reg.unregister(id);
        // Slot is free again: a fresh try_register succeeds where it would
        // have failed while the token was still registered.
        assert!(reg.try_register(id, CancellationToken::new()).is_ok());
    }

    #[test]
    fn try_register_rejects_when_occupied_without_overwriting() {
        let reg = LaunchTaskRegistry::new();
        let id = LaunchTaskId::new();
        let original = CancellationToken::new();
        reg.try_register(id, original.clone()).expect("first wins");

        let intruder = CancellationToken::new();
        let err = reg
            .try_register(id, intruder.clone())
            .expect_err("second registration must fail");
        // The returned token is the pre-existing one, and `intruder` was NOT
        // stored — cancelling via the registry signals `original`, not the
        // discarded `intruder`.
        assert!(err.is_cancelled() == original.is_cancelled());
        assert!(matches!(
            reg.cancel_or_reserve(id),
            CancelDecision::Signalled
        ));
        assert!(original.is_cancelled());
        assert!(!intruder.is_cancelled());
    }

    #[test]
    fn cancel_or_reserve_signals_when_live() {
        let reg = LaunchTaskRegistry::new();
        let id = LaunchTaskId::new();
        let token = CancellationToken::new();
        reg.try_register(id, token.clone()).unwrap();
        assert!(matches!(
            reg.cancel_or_reserve(id),
            CancelDecision::Signalled
        ));
        assert!(token.is_cancelled());
    }

    #[test]
    fn cancel_or_reserve_blocks_concurrent_register() {
        let reg = LaunchTaskRegistry::new();
        let id = LaunchTaskId::new();
        let CancelDecision::Reserved(_guard) = reg.cancel_or_reserve(id) else {
            panic!("expected Reserved on empty registry");
        };
        // While the guard is held, no executor can claim the slot.
        let blocked = reg.try_register(id, CancellationToken::new());
        assert!(blocked.is_err());
    }

    #[test]
    fn cancel_or_reserve_releases_slot_on_drop() {
        let reg = LaunchTaskRegistry::new();
        let id = LaunchTaskId::new();
        {
            let _guard = reg.cancel_or_reserve(id);
        }
        // Guard dropped — slot is free again.
        assert!(reg.try_register(id, CancellationToken::new()).is_ok());
    }
}
