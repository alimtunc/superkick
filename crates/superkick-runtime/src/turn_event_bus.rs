//! Per-turn broadcast bus for live `ProtocolEventEnvelope` fan-out (SUP-100).
//!
//! One broadcast channel per `TurnId`. SSE handlers subscribe by turn id and
//! receive every envelope the runner publishes for that turn. Channels are
//! created lazily on the first publish or subscribe and dropped explicitly
//! by the runner once the turn terminates.
//!
//! Persistence (`turn_events`) is the source of truth — the bus only carries
//! live deltas. SSE handlers replay from storage first, then pull live from
//! the bus, so a slow subscriber never loses data.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;
use tokio::sync::broadcast;
use tracing::trace;

use superkick_core::{ProtocolEventEnvelope, TurnId};

/// Per-turn capacity. Sized for a single chat conversation: streaming text
/// deltas can hit ~100 events/s during long responses, and we want a slow
/// browser tab to absorb a few seconds of lag without `RecvError::Lagged`.
const TURN_BUS_CAPACITY: usize = 1024;

/// Bus indexed by `TurnId`. Cheap to clone — wraps a single `Mutex<HashMap>`.
pub struct TurnEventBus {
    channels: Mutex<HashMap<TurnId, broadcast::Sender<ProtocolEventEnvelope>>>,
}

impl TurnEventBus {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            channels: Mutex::new(HashMap::new()),
        })
    }

    /// Subscribe to envelopes for a specific turn. Creates the channel if
    /// the runner hasn't published yet — the SSE handler may attach before
    /// the runner spawns.
    pub async fn subscribe(&self, turn_id: TurnId) -> broadcast::Receiver<ProtocolEventEnvelope> {
        let mut guard = self.channels.lock().await;
        let sender = guard.entry(turn_id).or_insert_with(|| {
            let (tx, _) = broadcast::channel(TURN_BUS_CAPACITY);
            tx
        });
        sender.subscribe()
    }

    /// Publish an envelope to subscribers of `turn_id`. If no channel exists
    /// yet (no subscriber attached, no prior publish) one is created so the
    /// bus stays consistent with `subscribe` semantics.
    pub async fn publish(&self, turn_id: TurnId, envelope: ProtocolEventEnvelope) {
        let mut guard = self.channels.lock().await;
        let sender = guard.entry(turn_id).or_insert_with(|| {
            let (tx, _) = broadcast::channel(TURN_BUS_CAPACITY);
            tx
        });
        match sender.send(envelope) {
            Ok(n) => trace!(turn_id = %turn_id, subscribers = n, "turn envelope published"),
            Err(_) => trace!(turn_id = %turn_id, "turn envelope published with no subscribers"),
        }
    }

    /// Drop the channel for a turn. Outstanding receivers will observe
    /// `RecvError::Closed` and unwind. Called by the runner once the turn
    /// transitions to a terminal status.
    pub async fn close(&self, turn_id: TurnId) {
        let mut guard = self.channels.lock().await;
        guard.remove(&turn_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use superkick_core::{ProtocolEvent, TextDelta};

    fn delta(seq: u64) -> ProtocolEventEnvelope {
        ProtocolEventEnvelope {
            seq,
            at: Utc::now(),
            event: ProtocolEvent::TextDelta(TextDelta {
                block_id: "b".into(),
                text: "x".into(),
            }),
        }
    }

    #[tokio::test]
    async fn subscriber_receives_published_events() {
        let bus = TurnEventBus::new();
        let turn = TurnId::new();
        let mut rx = bus.subscribe(turn).await;
        bus.publish(turn, delta(0)).await;
        let got = rx.recv().await.unwrap();
        assert_eq!(got.seq, 0);
    }

    #[tokio::test]
    async fn close_drops_channel_and_disconnects_receivers() {
        let bus = TurnEventBus::new();
        let turn = TurnId::new();
        let mut rx = bus.subscribe(turn).await;
        bus.close(turn).await;
        let err = rx.recv().await.unwrap_err();
        assert!(matches!(err, broadcast::error::RecvError::Closed));
    }

    #[tokio::test]
    async fn isolated_turns_do_not_cross_subscribe() {
        let bus = TurnEventBus::new();
        let a = TurnId::new();
        let b = TurnId::new();
        let mut rx_a = bus.subscribe(a).await;
        let mut rx_b = bus.subscribe(b).await;
        bus.publish(a, delta(0)).await;
        assert_eq!(rx_a.recv().await.unwrap().seq, 0);
        assert!(rx_b.try_recv().is_err());
    }
}
