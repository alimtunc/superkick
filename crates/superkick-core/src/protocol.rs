//! Provider-neutral protocol contracts for structured agent runs (SUP-97).
//!
//! Today's PTY supervisor scrapes a terminal stream for tokens and tool calls.
//! Native Claude/Codex protocol modes (stdin/stdout JSON, JSON-RPC) expose the
//! same information — but as a typed event stream rather than ANSI bytes. This
//! module defines the canonical event shape and turn contracts so adapters for
//! each provider can emit the *same* `ProtocolEvent` regardless of the wire
//! format underneath.
//!
//! Scope of this ticket: types only. Real Claude / Codex adapters land in
//! follow-ups (SUP-95 §"Child ticket order" 3 & 4). The PTY path
//! (`agent_supervisor::lifecycle`) is untouched and continues to drive the
//! terminal-takeover UX.
//!
//! Design notes:
//!
//! - `ProtocolEvent` is internally tagged on `kind` so JSON traces are
//!   self-describing and round-trip cleanly through serde.
//! - No variant or field mentions a provider (Claude, Codex, ...). The trait
//!   layer (in `superkick-runtime`) holds the adapter that *interprets*
//!   provider-specific output into these events.
//! - `ResumeKey` is intentionally opaque: providers persist their own
//!   identifiers (Claude `session_id`, Codex `thread_id`, …) inside it without
//!   leaking variants into the contract.

use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// One event emitted by a provider adapter during (or terminating) a turn.
///
/// Tagged externally on `kind` to keep the JSON wire format self-describing.
/// Each variant carries only the fields needed for its semantics — global
/// metadata (sequence, timestamp) lives on the wrapping `ProtocolEventEnvelope`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProtocolEvent {
    /// Metadata about the session/thread the adapter has bound this turn to.
    /// Emitted at most once at the start of a turn.
    SessionMeta(SessionMeta),
    /// Streaming assistant text (incremental). Adapters may emit a single
    /// final delta or many small ones; consumers concatenate by `block_id`.
    TextDelta(TextDelta),
    /// A complete assistant text block — useful for adapters that don't
    /// stream incrementally.
    TextBlock(TextBlock),
    /// Provider-side reasoning / progress notes. Not user-facing assistant
    /// output; surfaced for observability only.
    Thinking(Thinking),
    /// A free-form status / log line emitted by the adapter (or the wire
    /// transport) for operator visibility.
    Log(LogEntry),
    /// The assistant requested a tool call.
    ToolUse(ToolCallStart),
    /// A tool call returned a result (success or error).
    ToolResult(ToolCallResult),
    /// Snapshot of token / cost usage so far in this turn.
    Usage(UsageSnapshot),
    /// Terminal: the turn completed normally. No further events follow.
    Completion(Completion),
    /// Terminal: the turn failed. No further events follow.
    Failure(Failure),
    /// Terminal: the turn was cancelled (caller-initiated). No further events follow.
    Cancelled(Cancelled),
}

impl ProtocolEvent {
    /// Whether this event terminates the stream (no further events follow).
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            ProtocolEvent::Completion(_) | ProtocolEvent::Failure(_) | ProtocolEvent::Cancelled(_)
        )
    }
}

/// Wraps a `ProtocolEvent` with monotonic ordering + timestamp so consumers
/// can render and persist a stable trace. The adapter increments `seq`
/// strictly per turn starting at 0.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProtocolEventEnvelope {
    pub seq: u64,
    pub at: DateTime<Utc>,
    #[serde(flatten)]
    pub event: ProtocolEvent,
}

/// Identity of the session/thread the adapter bound to for this turn.
/// `resume_key` is the opaque token a caller can pass back to
/// `ProtocolAdapter::resume_turn` to continue the same conversation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionMeta {
    pub resume_key: ResumeKey,
    /// Optional human-readable label (e.g. provider's session id). Operator-
    /// visible only; do not parse — `ResumeKey` is the only stable identifier.
    pub label: Option<String>,
}

/// Streaming assistant text delta. Multiple deltas with the same `block_id`
/// concatenate into the final block.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextDelta {
    pub block_id: String,
    pub text: String,
}

/// A complete assistant text block.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextBlock {
    pub block_id: String,
    pub text: String,
}

/// Reasoning / progress note from the provider. Not assistant output.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Thinking {
    pub block_id: String,
    pub text: String,
}

/// A free-form log entry. Used for adapter-side notes (e.g. "reconnected",
/// "rate limited") and provider warnings that don't fit other variants.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogEntry {
    pub level: LogLevel,
    pub message: String,
}

/// Severity of a `LogEntry`. Mirrors `EventLevel` from the run ledger but is
/// intentionally a separate type so the protocol stream is not coupled to the
/// ledger's classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

/// Start of a tool invocation. The matching `ToolCallResult` carries the same
/// `call_id`. Inputs are serialised as JSON so the contract does not pin a
/// specific tool schema.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolCallStart {
    pub call_id: String,
    pub tool_name: String,
    pub input: serde_json::Value,
}

/// Result of a tool invocation. `is_error = true` carries a provider-reported
/// failure (e.g. tool denied, exec failed); transport-level errors surface as
/// `ProtocolEvent::Failure` instead.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolCallResult {
    pub call_id: String,
    pub output: serde_json::Value,
    pub is_error: bool,
}

/// Snapshot of token and cost usage. All fields are best-effort — providers
/// report what they expose; missing fields stay `None` rather than 0.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct UsageSnapshot {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cache_read_tokens: Option<u64>,
    pub cache_creation_tokens: Option<u64>,
    /// Cost in USD, when the provider exposes it. Stored as a string to avoid
    /// `f64` rounding drift in cross-provider comparisons.
    pub cost_usd: Option<String>,
}

/// Terminal: turn completed. `summary` is the provider's last assistant text
/// when available, otherwise `None`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Completion {
    pub summary: Option<String>,
    pub usage: Option<UsageSnapshot>,
}

/// Terminal: turn failed. `code` is a provider-stable string (e.g.
/// `"rate_limited"`, `"timeout"`) for branching; `message` is human-readable.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Failure {
    pub code: String,
    pub message: String,
    pub usage: Option<UsageSnapshot>,
}

/// Terminal: turn cancelled. `reason` is short and operator-readable.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Cancelled {
    pub reason: String,
}

/// Opaque token identifying a conversation that can be resumed. The string
/// shape is provider-specific and must not be parsed by consumers — adapters
/// own its semantics. Cheap to clone.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ResumeKey(String);

impl ResumeKey {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_inner(self) -> String {
        self.0
    }
}

impl std::fmt::Display for ResumeKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Caller-supplied configuration for one turn. Provider-neutral — adapters
/// translate this into provider-specific argv/JSON. PTY-isms (policy_audit,
/// MCP file paths, …) deliberately do not appear here; the trait contract is
/// the minimum needed to drive a structured turn.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TurnRequest {
    pub prompt: String,
    pub workdir: std::path::PathBuf,
    #[serde(default)]
    pub options: TurnOptions,
}

/// Tunable knobs for a turn that have a stable cross-provider meaning.
/// Provider-specific extensions go on the adapter, not here.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct TurnOptions {
    /// Hard wall-clock ceiling for the turn. `None` = adapter default.
    #[serde(default, with = "duration_opt")]
    pub timeout: Option<Duration>,
    /// Soft cap on output tokens. `None` = adapter / provider default.
    pub max_output_tokens: Option<u64>,
    /// Whether the adapter should request thinking/reasoning events when the
    /// provider supports them. Adapters may ignore when unsupported.
    #[serde(default)]
    pub enable_thinking: bool,
}

/// Outcome of a turn: the terminal kind + the resume key the adapter used.
/// Returned by adapter finalisation; mirrors the terminal `ProtocolEvent`
/// variants without the inner payload (callers already saw it on the stream).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum TurnOutcome {
    Completed {
        resume_key: ResumeKey,
        usage: Option<UsageSnapshot>,
    },
    Failed {
        resume_key: Option<ResumeKey>,
        code: String,
        message: String,
    },
    Cancelled {
        resume_key: Option<ResumeKey>,
        reason: String,
    },
}

mod duration_opt {
    use super::Duration;
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S: Serializer>(d: &Option<Duration>, s: S) -> Result<S::Ok, S::Error> {
        d.map(|d| d.as_millis() as u64).serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Duration>, D::Error> {
        let raw = Option::<u64>::deserialize(d)?;
        Ok(raw.map(Duration::from_millis))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round_trip(event: ProtocolEvent) {
        let json = serde_json::to_string(&event).expect("serialize");
        let back: ProtocolEvent = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(event, back, "round-trip mismatch via {json}");
    }

    #[test]
    fn round_trip_session_meta() {
        round_trip(ProtocolEvent::SessionMeta(SessionMeta {
            resume_key: ResumeKey::new("sess-abc"),
            label: Some("claude-session-42".into()),
        }));
    }

    #[test]
    fn round_trip_text_delta_and_block() {
        round_trip(ProtocolEvent::TextDelta(TextDelta {
            block_id: "blk-1".into(),
            text: "hello".into(),
        }));
        round_trip(ProtocolEvent::TextBlock(TextBlock {
            block_id: "blk-1".into(),
            text: "hello world".into(),
        }));
    }

    #[test]
    fn round_trip_thinking() {
        round_trip(ProtocolEvent::Thinking(Thinking {
            block_id: "thought-1".into(),
            text: "reading the file".into(),
        }));
    }

    #[test]
    fn round_trip_log() {
        round_trip(ProtocolEvent::Log(LogEntry {
            level: LogLevel::Warn,
            message: "rate limit nearing".into(),
        }));
    }

    #[test]
    fn round_trip_tool_use_and_result() {
        round_trip(ProtocolEvent::ToolUse(ToolCallStart {
            call_id: "tc-1".into(),
            tool_name: "edit_file".into(),
            input: serde_json::json!({ "path": "src/lib.rs" }),
        }));
        round_trip(ProtocolEvent::ToolResult(ToolCallResult {
            call_id: "tc-1".into(),
            output: serde_json::json!({ "ok": true }),
            is_error: false,
        }));
    }

    #[test]
    fn round_trip_usage() {
        round_trip(ProtocolEvent::Usage(UsageSnapshot {
            input_tokens: Some(1234),
            output_tokens: Some(56),
            cache_read_tokens: None,
            cache_creation_tokens: Some(0),
            cost_usd: Some("0.0123".into()),
        }));
    }

    #[test]
    fn round_trip_completion_failure_cancelled() {
        round_trip(ProtocolEvent::Completion(Completion {
            summary: Some("done".into()),
            usage: Some(UsageSnapshot::default()),
        }));
        round_trip(ProtocolEvent::Failure(Failure {
            code: "rate_limited".into(),
            message: "too many requests".into(),
            usage: None,
        }));
        round_trip(ProtocolEvent::Cancelled(Cancelled {
            reason: "operator".into(),
        }));
    }

    #[test]
    fn envelope_round_trips_with_kind_tag() {
        let env = ProtocolEventEnvelope {
            seq: 7,
            at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).expect("ts"),
            event: ProtocolEvent::TextDelta(TextDelta {
                block_id: "b".into(),
                text: "hi".into(),
            }),
        };
        let json = serde_json::to_value(&env).expect("serialize");
        // `kind` should be flattened next to seq/at (internal-tag flattening).
        assert_eq!(json["kind"], "text_delta");
        assert_eq!(json["seq"], 7);
        let back: ProtocolEventEnvelope = serde_json::from_value(json).expect("deserialize");
        assert_eq!(back, env);
    }

    #[test]
    fn is_terminal_classifies_correctly() {
        assert!(
            ProtocolEvent::Completion(Completion {
                summary: None,
                usage: None,
            })
            .is_terminal()
        );
        assert!(
            ProtocolEvent::Failure(Failure {
                code: "x".into(),
                message: "y".into(),
                usage: None,
            })
            .is_terminal()
        );
        assert!(ProtocolEvent::Cancelled(Cancelled { reason: "z".into() }).is_terminal());
        assert!(
            !ProtocolEvent::TextDelta(TextDelta {
                block_id: "b".into(),
                text: "t".into(),
            })
            .is_terminal()
        );
    }

    #[test]
    fn turn_options_serializes_timeout_as_millis() {
        let opts = TurnOptions {
            timeout: Some(Duration::from_secs(30)),
            max_output_tokens: Some(1024),
            enable_thinking: true,
        };
        let json = serde_json::to_value(&opts).expect("serialize");
        assert_eq!(json["timeout"], 30_000);
        let back: TurnOptions = serde_json::from_value(json).expect("deserialize");
        assert_eq!(back, opts);
    }

    #[test]
    fn turn_outcome_round_trips() {
        let outcomes = [
            TurnOutcome::Completed {
                resume_key: ResumeKey::new("k"),
                usage: None,
            },
            TurnOutcome::Failed {
                resume_key: None,
                code: "err".into(),
                message: "boom".into(),
            },
            TurnOutcome::Cancelled {
                resume_key: Some(ResumeKey::new("k2")),
                reason: "stop".into(),
            },
        ];
        for outcome in outcomes {
            let json = serde_json::to_string(&outcome).expect("serialize");
            let back: TurnOutcome = serde_json::from_str(&json).expect("deserialize");
            assert_eq!(outcome, back);
        }
    }

    #[test]
    fn resume_key_is_opaque_string() {
        let key = ResumeKey::new("opaque-123");
        assert_eq!(key.as_str(), "opaque-123");
        let json = serde_json::to_string(&key).expect("serialize");
        // Transparent: serialises as a bare string, not a tagged object.
        assert_eq!(json, "\"opaque-123\"");
    }
}
