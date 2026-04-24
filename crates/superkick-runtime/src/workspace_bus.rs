//! Workspace-level run event bus (SUP-84).
//!
//! A single broadcast channel that aggregates every `WorkspaceRunEvent`
//! produced anywhere in the process. The HTTP shell SSE handler subscribes
//! once and fans the stream out to connected frontends, replacing the
//! per-run polling pattern used by `/runs/{id}/events`.
//!
//! Design mirrors `SessionBus`: thin wrapper, no retention, persistence
//! remains authoritative. Capacity is larger because this is the point where
//! every run converges — a review swarm spanning multiple runs can emit
//! dozens of events per second during a shell-wide dashboard session.
//!
//! Run-event producers (step engine, interrupt/attention/ownership/handoff
//! services) are wired to the bus through `PublishingRunEventRepo`, a thin
//! wrapper around any `RunEventRepo` that publishes on successful persistence.
//! This keeps service code ignorant of the bus — they keep their generic
//! `E: RunEventRepo` bound and the wiring happens once at server startup.

use std::sync::Arc;

use anyhow::Result;
use tokio::sync::broadcast;
use tracing::{debug, trace};

use superkick_core::{EventId, RunEvent, RunId, WorkspaceRunEvent};
use superkick_storage::repo::RunEventRepo;

/// Broadcast capacity. Sized to absorb multiple concurrent runs fanning in
/// without forcing a lag on casual subscribers (shell dashboard, watched
/// session rails). Larger than `SessionBus::BUS_CAPACITY` because this bus
/// sees every run at once.
const BUS_CAPACITY: usize = 4096;

/// Workspace-scope broadcast bus for run events. Cheap to clone — holds a
/// single `Sender` inside an `Arc`. Callers keep an `Arc<WorkspaceEventBus>`
/// and hand out receivers on demand.
pub struct WorkspaceEventBus {
    tx: broadcast::Sender<WorkspaceRunEvent>,
}

impl WorkspaceEventBus {
    /// Construct a bus with the default capacity.
    pub fn new() -> Arc<Self> {
        let (tx, _) = broadcast::channel(BUS_CAPACITY);
        Arc::new(Self { tx })
    }

    /// Publish an event to all live subscribers. Returns the count of
    /// subscribers that received it. If no one is subscribed the event is
    /// dropped — persistence (run_events / session_lifecycle_events) is the
    /// source of truth, the bus is only for live fan-out.
    pub fn publish(&self, event: WorkspaceRunEvent) {
        match self.tx.send(event) {
            Ok(n) => trace!(subscribers = n, "workspace event published"),
            Err(_) => debug!("workspace event published with no subscribers"),
        }
    }

    /// Subscribe to every future event. Receivers that lag beyond
    /// `BUS_CAPACITY` will observe `RecvError::Lagged` and should reconcile
    /// by refetching the affected run's state from the repositories.
    pub fn subscribe(&self) -> broadcast::Receiver<WorkspaceRunEvent> {
        self.tx.subscribe()
    }

    /// Current subscriber count — useful for health endpoints and tests.
    pub fn subscriber_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

/// `RunEventRepo` wrapper that publishes every successfully persisted event
/// onto a `WorkspaceEventBus`.
///
/// Compose once at server startup:
/// ```ignore
/// let bus = WorkspaceEventBus::new();
/// let event_repo = Arc::new(PublishingRunEventRepo::new(
///     SqliteRunEventRepo::new(pool),
///     Arc::clone(&bus),
/// ));
/// ```
/// All downstream services that accept `Arc<impl RunEventRepo>` now publish
/// to the shell-level substrate without service-level changes.
pub struct PublishingRunEventRepo<E> {
    inner: E,
    bus: Arc<WorkspaceEventBus>,
}

impl<E> PublishingRunEventRepo<E> {
    pub fn new(inner: E, bus: Arc<WorkspaceEventBus>) -> Self {
        Self { inner, bus }
    }

    /// Access the wrapped repo without losing the publishing behaviour —
    /// useful for read handlers that want the inner type's concrete methods.
    pub fn inner(&self) -> &E {
        &self.inner
    }
}

impl<E: RunEventRepo> RunEventRepo for PublishingRunEventRepo<E> {
    async fn insert(&self, event: &RunEvent) -> Result<()> {
        self.inner.insert(event).await?;
        self.bus.publish(event.clone().into());
        Ok(())
    }

    async fn get(&self, id: EventId) -> Result<Option<RunEvent>> {
        self.inner.get(id).await
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<RunEvent>> {
        self.inner.list_by_run(run_id).await
    }

    async fn list_by_run_from_offset(&self, run_id: RunId, offset: usize) -> Result<Vec<RunEvent>> {
        self.inner.list_by_run_from_offset(run_id, offset).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use superkick_core::{EventKind, EventLevel, RunEvent};

    fn make_run_event() -> WorkspaceRunEvent {
        RunEvent::new(
            RunId::new(),
            None,
            EventKind::StateChange,
            EventLevel::Info,
            "queued → running".into(),
        )
        .into()
    }

    #[tokio::test]
    async fn subscriber_receives_published_events() {
        let bus = WorkspaceEventBus::new();
        let mut rx = bus.subscribe();
        bus.publish(make_run_event());
        let got = rx.recv().await.unwrap();
        assert_eq!(got.variant(), "run_event");
    }

    #[tokio::test]
    async fn publish_without_subscribers_is_noop() {
        let bus = WorkspaceEventBus::new();
        bus.publish(make_run_event());
        assert_eq!(bus.subscriber_count(), 0);
    }

    #[tokio::test]
    async fn multiple_subscribers_each_get_events() {
        let bus = WorkspaceEventBus::new();
        let mut a = bus.subscribe();
        let mut b = bus.subscribe();
        let event = make_run_event();
        let run_id = event.run_id();
        bus.publish(event);
        let ra = a.recv().await.unwrap();
        let rb = b.recv().await.unwrap();
        assert_eq!(ra.run_id(), run_id);
        assert_eq!(rb.run_id(), run_id);
        assert!(run_id.is_some());
    }

    /// A minimal in-memory `RunEventRepo` used to exercise the publishing
    /// wrapper without a database fixture.
    #[derive(Default)]
    struct MemRepo {
        events: std::sync::Mutex<Vec<RunEvent>>,
    }

    impl RunEventRepo for MemRepo {
        async fn insert(&self, event: &RunEvent) -> Result<()> {
            self.events.lock().unwrap().push(event.clone());
            Ok(())
        }

        async fn get(&self, id: EventId) -> Result<Option<RunEvent>> {
            Ok(self
                .events
                .lock()
                .unwrap()
                .iter()
                .find(|e| e.id == id)
                .cloned())
        }

        async fn list_by_run(&self, run_id: RunId) -> Result<Vec<RunEvent>> {
            Ok(self
                .events
                .lock()
                .unwrap()
                .iter()
                .filter(|e| e.run_id == run_id)
                .cloned()
                .collect())
        }

        async fn list_by_run_from_offset(
            &self,
            run_id: RunId,
            offset: usize,
        ) -> Result<Vec<RunEvent>> {
            Ok(self
                .events
                .lock()
                .unwrap()
                .iter()
                .filter(|e| e.run_id == run_id)
                .skip(offset)
                .cloned()
                .collect())
        }
    }

    #[tokio::test]
    async fn publishing_wrapper_publishes_on_successful_insert() {
        let bus = WorkspaceEventBus::new();
        let mut rx = bus.subscribe();
        let repo = PublishingRunEventRepo::new(MemRepo::default(), Arc::clone(&bus));

        let run_id = RunId::new();
        let event = RunEvent::new(
            run_id,
            None,
            EventKind::StepStarted,
            EventLevel::Info,
            "prepare".into(),
        );
        repo.insert(&event).await.unwrap();

        let got = rx.recv().await.unwrap();
        assert_eq!(got.run_id(), Some(run_id));
        assert_eq!(got.variant(), "run_event");
        assert_eq!(repo.inner().events.lock().unwrap().len(), 1);
    }
}
