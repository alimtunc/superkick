//! Shared, rebuildable agent catalog.
//!
//! The agent catalog moved from an immutable config-derived `Arc<AgentCatalog>`
//! (built once at boot) to a DB-backed store editable at runtime. This provider
//! holds the current snapshot behind a lock so the read API, the write handlers,
//! and the step runners all share one source of truth: a successful agent write
//! rebuilds the catalog from the repo and swaps it in, and the next resolution
//! sees the change without a process restart.
//!
//! `snapshot()` is synchronous and cheap (an `Arc` clone) so it can be called
//! from the runner's sync resolution path; `replace()` swaps the whole catalog
//! atomically. A poisoned lock is recovered rather than panicked on — a write
//! never holds the guard across an await, so poisoning would only follow an
//! unrelated panic and must not take down the supervisor.

use std::sync::{Arc, RwLock};

use superkick_core::AgentCatalog;

#[derive(Clone)]
pub struct AgentCatalogProvider {
    inner: Arc<RwLock<Arc<AgentCatalog>>>,
}

impl AgentCatalogProvider {
    pub fn new(catalog: AgentCatalog) -> Self {
        Self {
            inner: Arc::new(RwLock::new(Arc::new(catalog))),
        }
    }

    /// Current catalog as a cheap `Arc` clone. Borrow it for one resolution; do
    /// not cache it across a launch, or a concurrent edit would go unseen.
    pub fn snapshot(&self) -> Arc<AgentCatalog> {
        Arc::clone(&self.read())
    }

    /// Swap in a freshly-rebuilt catalog after an agent write.
    pub fn replace(&self, catalog: AgentCatalog) {
        let mut guard = self
            .inner
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *guard = Arc::new(catalog);
    }

    fn read(&self) -> std::sync::RwLockReadGuard<'_, Arc<AgentCatalog>> {
        self.inner
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}
