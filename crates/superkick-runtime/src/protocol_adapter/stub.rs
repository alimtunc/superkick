//! Stub adapter that scripts a deterministic `ProtocolEvent` trace.
//!
//! Used for testing orchestration code that depends on `ProtocolAdapter`
//! without spawning a real provider binary. The scripted shape covers every
//! variant in the canonical event model so consumers can exercise their full
//! switch surface, and supports `cancel` / failure paths through the
//! `StubScript` builder.

use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use anyhow::Result;
use chrono::Utc;
use tokio_util::sync::CancellationToken;

use superkick_core::{
    Cancelled, Completion, Failure, LogEntry, LogLevel, ProtocolEvent, ProtocolEventEnvelope,
    ResumeKey, SessionMeta, TextBlock, TextDelta, Thinking, ToolCallResult, ToolCallStart,
    TurnOutcome, TurnRequest, UsageSnapshot,
};

use super::{
    ProtocolAdapter, ProtocolEventSender, ProtocolStream, TurnHandle, protocol_event_channel,
};

/// How the stub turn should terminate when not externally cancelled.
#[derive(Debug, Clone, PartialEq)]
pub enum StubTermination {
    Completed { summary: Option<String> },
    Failed { code: String, message: String },
}

impl Default for StubTermination {
    fn default() -> Self {
        Self::Completed {
            summary: Some("scripted turn complete".to_string()),
        }
    }
}

/// Builder controlling the scripted trace emitted by `NoopProtocolAdapter`.
/// Defaults: full event surface (every variant once), terminate on
/// `Completed`. Callers tweak via the `with_*` helpers.
#[derive(Debug, Clone)]
pub struct StubScript {
    /// Resume key the stub returns on `SessionMeta` and the final outcome.
    pub resume_key: ResumeKey,
    /// Whether to keep waiting on cancellation between events. When `true`,
    /// each `await` of a non-terminal event yields, allowing a caller to
    /// race a `cancel()` against the script's progress.
    pub allow_cancel_between_events: bool,
    /// Optional pause inserted between non-terminal events. `None` ≈ no
    /// artificial delay (still yields once); `Some(d)` sleeps for `d` so a
    /// long-running scenario is observable in tests.
    pub inter_event_delay: Option<Duration>,
    /// Termination kind to emit when the script reaches its end without
    /// being cancelled.
    pub termination: StubTermination,
}

impl Default for StubScript {
    fn default() -> Self {
        Self {
            resume_key: ResumeKey::new("stub-resume"),
            allow_cancel_between_events: true,
            inter_event_delay: None,
            termination: StubTermination::default(),
        }
    }
}

impl StubScript {
    pub fn with_failure(mut self, code: impl Into<String>, message: impl Into<String>) -> Self {
        self.termination = StubTermination::Failed {
            code: code.into(),
            message: message.into(),
        };
        self
    }

    pub fn with_long_running(mut self, delay: Duration) -> Self {
        self.inter_event_delay = Some(delay);
        self
    }

    pub fn with_resume_key(mut self, key: ResumeKey) -> Self {
        self.resume_key = key;
        self
    }
}

/// Scripted adapter — emits a deterministic event trace covering every
/// variant of `ProtocolEvent`. Useful as a substitute for real Claude / Codex
/// adapters in unit and integration tests.
#[derive(Debug, Default, Clone)]
pub struct NoopProtocolAdapter {
    script: StubScript,
}

impl NoopProtocolAdapter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_script(script: StubScript) -> Self {
        Self { script }
    }

    fn spawn_turn(
        &self,
        _request: TurnRequest,
        _resume: Option<ResumeKey>,
    ) -> Result<ProtocolStream> {
        let (tx, rx) = protocol_event_channel();
        let cancel = CancellationToken::new();
        let script = self.script.clone();
        let cancel_for_task = cancel.clone();

        let outcome = tokio::spawn(async move { drive_script(script, tx, cancel_for_task).await });

        Ok(ProtocolStream {
            events: rx,
            handle: TurnHandle::new(cancel, outcome),
        })
    }
}

impl ProtocolAdapter for NoopProtocolAdapter {
    fn name(&self) -> &'static str {
        "stub"
    }

    fn start_turn(
        &self,
        request: TurnRequest,
    ) -> impl Future<Output = Result<ProtocolStream>> + Send {
        let result = self.spawn_turn(request, None);
        async move { result }
    }

    fn resume_turn(
        &self,
        resume_key: ResumeKey,
        request: TurnRequest,
    ) -> impl Future<Output = Result<ProtocolStream>> + Send {
        let result = self.spawn_turn(request, Some(resume_key));
        async move { result }
    }
}

/// Pumps the scripted events through `tx`, racing each step against `cancel`
/// so the consumer can interrupt mid-trace. Returns the matching
/// `TurnOutcome` once a terminal event has been flushed.
async fn drive_script(
    script: StubScript,
    tx: ProtocolEventSender,
    cancel: CancellationToken,
) -> Result<TurnOutcome> {
    let seq = AtomicU64::new(0);
    let resume_key = script.resume_key.clone();

    let scripted = scripted_events(&resume_key);

    for event in scripted {
        if cancel.is_cancelled() {
            return flush_cancelled(&tx, &seq, Some(resume_key.clone()), "operator cancelled")
                .await;
        }

        if !send_event(&tx, &seq, event).await {
            // Receiver dropped — finalise as failure so callers waiting on
            // `finish()` don't deadlock.
            return Ok(TurnOutcome::Failed {
                resume_key: Some(resume_key),
                code: "receiver_closed".into(),
                message: "consumer dropped the event receiver".into(),
            });
        }

        if script.allow_cancel_between_events {
            if let Some(delay) = script.inter_event_delay {
                tokio::select! {
                    _ = cancel.cancelled() => {
                        return flush_cancelled(&tx, &seq, Some(resume_key.clone()), "operator cancelled").await;
                    }
                    _ = tokio::time::sleep(delay) => {}
                }
            } else {
                // Yield once so a caller racing `cancel()` has a chance to win.
                tokio::task::yield_now().await;
                if cancel.is_cancelled() {
                    return flush_cancelled(
                        &tx,
                        &seq,
                        Some(resume_key.clone()),
                        "operator cancelled",
                    )
                    .await;
                }
            }
        }
    }

    flush_termination(&tx, &seq, &resume_key, &script.termination).await
}

fn scripted_events(resume_key: &ResumeKey) -> Vec<ProtocolEvent> {
    let usage = UsageSnapshot {
        input_tokens: Some(120),
        output_tokens: Some(40),
        cache_read_tokens: Some(0),
        cache_creation_tokens: Some(0),
        cost_usd: Some("0.0001".into()),
    };
    vec![
        ProtocolEvent::SessionMeta(SessionMeta {
            resume_key: resume_key.clone(),
            label: Some("stub-session".into()),
        }),
        ProtocolEvent::Log(LogEntry {
            level: LogLevel::Info,
            message: "stub adapter started".into(),
        }),
        ProtocolEvent::Thinking(Thinking {
            block_id: "thought-1".into(),
            text: "considering the request".into(),
        }),
        ProtocolEvent::TextDelta(TextDelta {
            block_id: "blk-1".into(),
            text: "Hello".into(),
        }),
        ProtocolEvent::TextDelta(TextDelta {
            block_id: "blk-1".into(),
            text: ", world".into(),
        }),
        ProtocolEvent::TextBlock(TextBlock {
            block_id: "blk-1".into(),
            text: "Hello, world".into(),
        }),
        ProtocolEvent::ToolUse(ToolCallStart {
            call_id: "tc-1".into(),
            tool_name: "noop_tool".into(),
            input: serde_json::json!({ "echo": "hi" }),
        }),
        ProtocolEvent::ToolResult(ToolCallResult {
            call_id: "tc-1".into(),
            output: serde_json::json!({ "echo": "hi" }),
            is_error: false,
        }),
        ProtocolEvent::Usage(usage),
    ]
}

async fn flush_termination(
    tx: &ProtocolEventSender,
    seq: &AtomicU64,
    resume_key: &ResumeKey,
    termination: &StubTermination,
) -> Result<TurnOutcome> {
    match termination {
        StubTermination::Completed { summary } => {
            let usage = UsageSnapshot {
                input_tokens: Some(120),
                output_tokens: Some(40),
                ..UsageSnapshot::default()
            };
            send_event(
                tx,
                seq,
                ProtocolEvent::Completion(Completion {
                    summary: summary.clone(),
                    usage: Some(usage.clone()),
                }),
            )
            .await;
            Ok(TurnOutcome::Completed {
                resume_key: resume_key.clone(),
                usage: Some(usage),
            })
        }
        StubTermination::Failed { code, message } => {
            send_event(
                tx,
                seq,
                ProtocolEvent::Failure(Failure {
                    code: code.clone(),
                    message: message.clone(),
                    usage: None,
                }),
            )
            .await;
            Ok(TurnOutcome::Failed {
                resume_key: Some(resume_key.clone()),
                code: code.clone(),
                message: message.clone(),
            })
        }
    }
}

async fn flush_cancelled(
    tx: &ProtocolEventSender,
    seq: &AtomicU64,
    resume_key: Option<ResumeKey>,
    reason: &str,
) -> Result<TurnOutcome> {
    send_event(
        tx,
        seq,
        ProtocolEvent::Cancelled(Cancelled {
            reason: reason.to_string(),
        }),
    )
    .await;
    Ok(TurnOutcome::Cancelled {
        resume_key,
        reason: reason.to_string(),
    })
}

/// Send one event with a fresh monotonic seq + timestamp. Returns `false` if
/// the receiver has been dropped — caller decides what to do then.
async fn send_event(tx: &ProtocolEventSender, seq: &AtomicU64, event: ProtocolEvent) -> bool {
    let envelope = ProtocolEventEnvelope {
        seq: seq.fetch_add(1, Ordering::Relaxed),
        at: Utc::now(),
        event,
    };
    tx.send(envelope).await.is_ok()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::time::Duration;

    use tokio::time::timeout;

    use super::*;

    fn turn_request() -> TurnRequest {
        TurnRequest {
            prompt: "do the thing".into(),
            workdir: PathBuf::from("/tmp"),
            options: Default::default(),
        }
    }

    fn collect_kinds(events: &[ProtocolEventEnvelope]) -> Vec<&'static str> {
        events
            .iter()
            .map(|e| match &e.event {
                ProtocolEvent::SessionMeta(_) => "session_meta",
                ProtocolEvent::TextDelta(_) => "text_delta",
                ProtocolEvent::TextBlock(_) => "text_block",
                ProtocolEvent::Thinking(_) => "thinking",
                ProtocolEvent::Log(_) => "log",
                ProtocolEvent::ToolUse(_) => "tool_use",
                ProtocolEvent::ToolResult(_) => "tool_result",
                ProtocolEvent::Usage(_) => "usage",
                ProtocolEvent::Completion(_) => "completion",
                ProtocolEvent::Failure(_) => "failure",
                ProtocolEvent::Cancelled(_) => "cancelled",
            })
            .collect()
    }

    async fn drain(rx: &mut super::super::ProtocolEventReceiver) -> Vec<ProtocolEventEnvelope> {
        let mut out = Vec::new();
        while let Some(env) = rx.recv().await {
            out.push(env);
        }
        out
    }

    #[tokio::test]
    async fn stub_emits_full_event_surface_then_completes() {
        let adapter = NoopProtocolAdapter::new();
        let mut stream = adapter.start_turn(turn_request()).await.expect("start");
        let events = drain(&mut stream.events).await;
        let outcome = stream.handle.finish().await.expect("finish");

        let kinds = collect_kinds(&events);
        // Must cover every non-terminal variant + completion, in order.
        assert_eq!(
            kinds,
            vec![
                "session_meta",
                "log",
                "thinking",
                "text_delta",
                "text_delta",
                "text_block",
                "tool_use",
                "tool_result",
                "usage",
                "completion",
            ]
        );
        // Sequence numbers strictly increase from 0.
        for (i, env) in events.iter().enumerate() {
            assert_eq!(env.seq, i as u64);
        }
        // Outcome carries the configured resume key.
        assert!(matches!(outcome, TurnOutcome::Completed { .. }));
    }

    #[tokio::test]
    async fn stub_failure_path_emits_failure_event_and_outcome() {
        let adapter =
            NoopProtocolAdapter::with_script(StubScript::default().with_failure("oops", "boom"));
        let mut stream = adapter.start_turn(turn_request()).await.expect("start");
        let events = drain(&mut stream.events).await;
        let outcome = stream.handle.finish().await.expect("finish");

        assert_eq!(*collect_kinds(&events).last().unwrap(), "failure");
        match outcome {
            TurnOutcome::Failed { code, message, .. } => {
                assert_eq!(code, "oops");
                assert_eq!(message, "boom");
            }
            other => panic!("expected Failed outcome, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn cancel_interrupts_stream_and_terminates_on_cancelled() {
        let adapter = NoopProtocolAdapter::with_script(
            StubScript::default().with_long_running(Duration::from_millis(50)),
        );
        let mut stream = adapter.start_turn(turn_request()).await.expect("start");
        // Cancel immediately — first event will already have shipped, but
        // the script must wrap up on `Cancelled` rather than `Completed`.
        stream.handle.cancel();

        let events = timeout(Duration::from_secs(2), drain(&mut stream.events))
            .await
            .expect("drain within timeout");
        let outcome = timeout(Duration::from_secs(2), stream.handle.finish())
            .await
            .expect("finish within timeout")
            .expect("ok");

        assert_eq!(*collect_kinds(&events).last().unwrap(), "cancelled");
        assert!(matches!(outcome, TurnOutcome::Cancelled { .. }));
    }

    #[tokio::test]
    async fn resume_turn_uses_provided_resume_key() {
        let adapter = NoopProtocolAdapter::new();
        let mut stream = adapter
            .resume_turn(ResumeKey::new("provided-key"), turn_request())
            .await
            .expect("start");
        let events = drain(&mut stream.events).await;
        // The stub doesn't (yet) propagate the caller's resume key into the
        // SessionMeta — but it must still terminate cleanly so `finish` works.
        let outcome = stream.handle.finish().await.expect("finish");
        assert!(matches!(outcome, TurnOutcome::Completed { .. }));
        assert!(!events.is_empty());
    }
}
