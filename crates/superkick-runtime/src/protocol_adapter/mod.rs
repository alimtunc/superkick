//! Provider-neutral protocol adapter trait (SUP-97).
//!
//! Models a structured agent turn as: caller asks the adapter to start (or
//! resume) a turn → adapter spawns/connects to its underlying provider →
//! adapter pumps `ProtocolEvent`s through an mpsc receiver → adapter publishes
//! a `TurnOutcome` when terminal. Cancellation is cooperative, driven by a
//! `tokio_util::sync::CancellationToken` exposed on the `TurnHandle`.
//!
//! This ticket defines the contract and the stub implementation only. Real
//! Claude / Codex adapters land in follow-ups; the existing PTY supervisor
//! (`agent_supervisor::lifecycle`) is unchanged and stays the production path
//! for terminal-takeover today.

mod stub;

use std::future::Future;

use anyhow::Result;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use superkick_core::{ProtocolEventEnvelope, ResumeKey, TurnOutcome, TurnRequest};

pub use stub::{NoopProtocolAdapter, StubScript};

/// Bounded channel capacity for adapter→consumer event flow. Matches the
/// PTY output bus, which has worked for terminal scraping under realistic
/// load. Adapters can override per-turn if they need different back-pressure.
pub const DEFAULT_EVENT_CHANNEL_CAPACITY: usize = 256;

/// Receiving half of the protocol event stream — what the consumer reads.
pub type ProtocolEventReceiver = mpsc::Receiver<ProtocolEventEnvelope>;

/// Sending half of the protocol event stream — what the adapter writes into.
pub type ProtocolEventSender = mpsc::Sender<ProtocolEventEnvelope>;

/// Handle returned by `start_turn` / `resume_turn`. Bundles the event
/// receiver, the cancellation token, and a finaliser that resolves with the
/// `TurnOutcome` once the adapter terminates.
pub struct ProtocolStream {
    /// Stream of events for the turn. Closed by the adapter once a terminal
    /// event has been published.
    pub events: ProtocolEventReceiver,
    /// Handle for cancel + outcome retrieval.
    pub handle: TurnHandle,
}

/// Cancel + finalisation handle for an in-flight turn. Detached from the
/// event receiver so consumers can hand it to a separate task (e.g. an
/// observer that watches for operator-initiated cancellation).
pub struct TurnHandle {
    cancel: CancellationToken,
    outcome: tokio::task::JoinHandle<Result<TurnOutcome>>,
}

impl TurnHandle {
    pub fn new(
        cancel: CancellationToken,
        outcome: tokio::task::JoinHandle<Result<TurnOutcome>>,
    ) -> Self {
        Self { cancel, outcome }
    }

    /// Request cancellation of the running turn. Idempotent; the adapter is
    /// expected to flush a `ProtocolEvent::Cancelled` and resolve the outcome.
    pub fn cancel(&self) {
        self.cancel.cancel();
    }

    /// Snapshot of the cancellation token, e.g. to share with a sibling task
    /// that needs to bail out alongside the turn.
    pub fn cancel_token(&self) -> CancellationToken {
        self.cancel.clone()
    }

    /// Await the turn's terminal outcome. Resolves once the adapter task has
    /// exited (post-terminal-event flush). The inner `Result` carries
    /// adapter-side errors that prevented even reaching a `TurnOutcome`.
    pub async fn finish(self) -> Result<TurnOutcome> {
        match self.outcome.await {
            Ok(res) => res,
            Err(join_err) => Err(anyhow::anyhow!(
                "protocol adapter task panicked or was aborted: {join_err}"
            )),
        }
    }
}

/// Provider-neutral driver of a structured agent turn.
///
/// Every method must be safe to call concurrently against distinct turns;
/// state shared between turns (sessions, connection pools) is the adapter's
/// responsibility. The trait is intentionally minimal — capabilities outside
/// these four methods (auth bootstrap, health checks, …) belong on the
/// concrete adapter, not the contract.
pub trait ProtocolAdapter: Send + Sync {
    /// Stable identifier for logs/metrics. Must match across instances of
    /// the same adapter (e.g. `"claude"`, `"codex"`, `"stub"`).
    fn name(&self) -> &'static str;

    /// Start a brand new turn against this adapter.
    fn start_turn(
        &self,
        request: TurnRequest,
    ) -> impl Future<Output = Result<ProtocolStream>> + Send;

    /// Resume an existing conversation identified by `resume_key`.
    fn resume_turn(
        &self,
        resume_key: ResumeKey,
        request: TurnRequest,
    ) -> impl Future<Output = Result<ProtocolStream>> + Send;
}

/// Convenience constructor: a paired sender/receiver with the default
/// capacity. Adapters use this in their `start_turn` so callers don't have to
/// know the channel kind.
pub fn protocol_event_channel() -> (ProtocolEventSender, ProtocolEventReceiver) {
    mpsc::channel(DEFAULT_EVENT_CHANNEL_CAPACITY)
}
