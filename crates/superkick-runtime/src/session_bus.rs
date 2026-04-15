//! In-process publish/subscribe bus for `SessionLifecycleEvent` (SUP-79).
//!
//! The bus is the observation hook that lets the orchestrator react to session
//! state changes without blocking on `JoinHandle::await`. It is intentionally
//! thin — a typed broadcast channel plus a small convenience API — so that the
//! substrate remains the PTY session model rather than a parallel messaging
//! system.
//!
//! Subscribers (orchestrator, UI fan-out handlers, persistence sinks) call
//! `subscribe()` and receive every event emitted thereafter. Slow subscribers
//! that lag beyond the channel capacity will see `RecvError::Lagged`; this is
//! acceptable because the persisted `session_lifecycle_events` audit stream is
//! the source of truth, not the broadcast.

use std::sync::Arc;

use tokio::sync::broadcast;
use tracing::debug;

use superkick_core::SessionLifecycleEvent;

/// Broadcast capacity. Lifecycle events are sparse (a handful per session) so
/// a modest buffer is sufficient. Sized to absorb a review swarm fan-out
/// without forcing a lag on casual subscribers.
const BUS_CAPACITY: usize = 1024;

/// Typed broadcast bus. Cheap to clone — holds a single `Sender` inside an
/// `Arc`. Callers keep an `Arc<SessionBus>` and hand out receivers on demand.
pub struct SessionBus {
    tx: broadcast::Sender<SessionLifecycleEvent>,
}

impl SessionBus {
    /// Construct a bus with the default capacity.
    pub fn new() -> Arc<Self> {
        let (tx, _) = broadcast::channel(BUS_CAPACITY);
        Arc::new(Self { tx })
    }

    /// Publish a lifecycle event to all live subscribers. Returns the count of
    /// subscribers that received it. If no one is subscribed the event is
    /// dropped — the persisted audit stream remains authoritative.
    pub fn publish(&self, event: SessionLifecycleEvent) {
        match self.tx.send(event) {
            Ok(n) => debug!(subscribers = n, "session lifecycle event published"),
            Err(_) => debug!("session lifecycle event published with no subscribers"),
        }
    }

    /// Subscribe to every future event. Receivers that lag beyond
    /// `BUS_CAPACITY` will observe `RecvError::Lagged` and should fall back to
    /// `SessionLifecycleRepo::list_by_run` for the missed window.
    pub fn subscribe(&self) -> broadcast::Receiver<SessionLifecycleEvent> {
        self.tx.subscribe()
    }

    /// Current subscriber count — useful for health endpoints and tests.
    pub fn subscriber_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use superkick_core::{
        AgentSessionId, RunId, SessionLifecycleEvent, SessionLifecyclePhase, StepId,
    };

    fn make_event(phase: SessionLifecyclePhase) -> SessionLifecycleEvent {
        SessionLifecycleEvent::new(
            AgentSessionId::new(),
            RunId::new(),
            StepId::new(),
            Some("planner".into()),
            None,
            None,
            None,
            phase,
        )
    }

    #[tokio::test]
    async fn subscriber_receives_published_events() {
        let bus = SessionBus::new();
        let mut rx = bus.subscribe();
        bus.publish(make_event(SessionLifecyclePhase::Running));
        let got = rx.recv().await.unwrap();
        assert!(matches!(got.phase, SessionLifecyclePhase::Running));
    }

    #[tokio::test]
    async fn publish_without_subscribers_is_noop() {
        let bus = SessionBus::new();
        bus.publish(make_event(SessionLifecyclePhase::Running));
        assert_eq!(bus.subscriber_count(), 0);
    }

    #[tokio::test]
    async fn multiple_subscribers_each_get_events() {
        let bus = SessionBus::new();
        let mut a = bus.subscribe();
        let mut b = bus.subscribe();
        bus.publish(make_event(SessionLifecyclePhase::Completed {
            exit_code: 0,
        }));
        let ra = a.recv().await.unwrap();
        let rb = b.recv().await.unwrap();
        assert_eq!(ra.id, rb.id);
    }
}
