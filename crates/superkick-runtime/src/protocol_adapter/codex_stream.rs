//! Stateless parser for Codex's `exec --json` JSONL stream.
//!
//! `codex exec --json` (and `codex exec resume --json`) emit one JSON object
//! per line on stdout. Observed shapes from Codex CLI 0.128.0:
//!
//! ```text
//! {"type":"thread.started","thread_id":"<UUID>"}
//! {"type":"turn.started"}
//! {"type":"item.started","item":{"id":"item_0","type":"command_execution","command":"...","status":"in_progress"}}
//! {"type":"item.completed","item":{"id":"item_0","type":"command_execution","aggregated_output":"...","exit_code":0,"status":"completed"}}
//! {"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"..."}}
//! {"type":"item.completed","item":{"id":"item_2","type":"file_change","changes":[{"path":"...","kind":"add"}],"status":"completed"}}
//! {"type":"turn.completed","usage":{"input_tokens":...,"output_tokens":...}}
//! {"type":"error","message":"..."}
//! {"type":"turn.failed","error":{"message":"..."}}
//! ```
//!
//! We translate each line into one or more provider-neutral `ProtocolEvent`s.
//! The parser is pure: takes `&str` + `&mut ParserState`, returns `Vec<ProtocolEvent>`.
//! No I/O, no tokio. Unit tests cover every variant without spawning a real
//! Codex binary.

use serde::Deserialize;
use serde_json::Value;

use superkick_core::{
    Completion, Failure, LogEntry, LogLevel, ProtocolEvent, ResumeKey, SessionMeta, TextBlock,
    ToolCallResult, ToolCallStart, UsageSnapshot,
};

use crate::text::truncate_chars;

/// Cross-line state the parser threads through every `parse_line` call.
#[derive(Debug, Default)]
pub(crate) struct ParserState {
    /// Last `ResumeKey` seen on a `thread.started` event (Codex `thread_id`).
    /// Surfaces on the final `TurnOutcome` so callers can resume the same
    /// conversation via `codex exec resume <id>`.
    pub last_resume_key: Option<ResumeKey>,
    /// Counter for synthetic block ids on agent messages. Codex stamps items
    /// with `item_<N>` ids that scope to a turn — fine for short runs but
    /// non-unique across turns once a session resumes. We allocate our own
    /// `blk-<N>` ids for the canonical contract.
    pub next_block_id: u64,
}

impl ParserState {
    fn alloc_block_id(&mut self, prefix: &str) -> String {
        let id = self.next_block_id;
        self.next_block_id += 1;
        format!("{prefix}-{id}")
    }
}

/// Parse one JSONL line. Returns the canonical events the adapter should
/// publish, in order. A whitespace-only line is a silent no-op; any other line
/// that fails to parse — or a known envelope that is malformed — yields a
/// `Log(Warn)` diagnostic event instead of being silently dropped (SUP-185), so
/// invalid Codex JSONL always surfaces in the run ledger rather than vanishing.
pub(crate) fn parse_line(line: &str, state: &mut ParserState) -> Vec<ProtocolEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let value: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(err) => {
            // Cap the echoed line so a diagnostic never logs a huge or
            // sensitive payload verbatim.
            return diagnostic(format!(
                "codex: unparseable JSONL line ({err}): {}",
                truncate_chars(trimmed, 160)
            ));
        }
    };

    let ty = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    match ty.as_str() {
        "thread.started" => thread_started_to_events(&value, state),
        "turn.started" => Vec::new(),
        "turn.completed" => match serde_json::from_value::<RawTurnCompleted>(value) {
            Ok(tc) => turn_completed_to_events(tc),
            Err(err) => malformed("turn.completed", &err),
        },
        "turn.failed" => match serde_json::from_value::<RawTurnFailed>(value) {
            Ok(tf) => turn_failed_to_events(tf),
            Err(err) => malformed("turn.failed", &err),
        },
        "error" => match serde_json::from_value::<RawError>(value) {
            Ok(e) => error_to_events(e),
            Err(err) => malformed("error", &err),
        },
        "item.started" => match serde_json::from_value::<RawItemEnvelope>(value) {
            Ok(env) => item_started_to_events(env.item),
            Err(err) => malformed("item.started", &err),
        },
        "item.completed" => match serde_json::from_value::<RawItemEnvelope>(value) {
            Ok(env) => item_completed_to_events(env.item, state),
            Err(err) => malformed("item.completed", &err),
        },
        "" => Vec::new(),
        other => vec![ProtocolEvent::Log(LogEntry {
            level: LogLevel::Info,
            message: format!("codex.{other}"),
        })],
    }
}

/// A single `Log(Warn)` diagnostic for input the parser could not turn into a
/// canonical event — surfaced in the ledger instead of being dropped.
fn diagnostic(message: String) -> Vec<ProtocolEvent> {
    tracing::warn!(%message, "codex jsonl diagnostic");
    vec![ProtocolEvent::Log(LogEntry {
        level: LogLevel::Warn,
        message,
    })]
}

fn malformed(envelope: &str, err: &serde_json::Error) -> Vec<ProtocolEvent> {
    diagnostic(format!("codex: malformed {envelope} envelope: {err}"))
}

fn thread_started_to_events(value: &Value, state: &mut ParserState) -> Vec<ProtocolEvent> {
    let Some(thread_id) = value
        .get("thread_id")
        .and_then(Value::as_str)
        .map(str::to_string)
    else {
        return Vec::new();
    };
    let resume_key = ResumeKey::new(thread_id.clone());
    state.last_resume_key = Some(resume_key.clone());
    vec![ProtocolEvent::SessionMeta(SessionMeta {
        resume_key,
        label: Some(thread_id),
    })]
}

fn turn_completed_to_events(tc: RawTurnCompleted) -> Vec<ProtocolEvent> {
    let snapshot = build_usage_snapshot(tc.usage);
    let mut out = Vec::with_capacity(2);
    if let Some(snap) = snapshot.clone() {
        out.push(ProtocolEvent::Usage(snap));
    }
    out.push(ProtocolEvent::Completion(Completion {
        // Codex's `turn.completed` does not carry a final summary string —
        // the last `agent_message` item is the assistant's final text.
        // Adapters that need a summary should concatenate text blocks.
        summary: None,
        usage: snapshot,
    }));
    out
}

fn turn_failed_to_events(tf: RawTurnFailed) -> Vec<ProtocolEvent> {
    let message = tf.error.message;
    let code = classify_failure(&message);
    vec![ProtocolEvent::Failure(Failure {
        code,
        message,
        usage: None,
    })]
}

/// Top-level `error` lines (e.g. an HTTP 400 from the model API) precede
/// `turn.failed` in observed traces. Surface them as a Log so operators see
/// the diagnostic without conflating them with the terminal Failure that
/// follows.
fn error_to_events(e: RawError) -> Vec<ProtocolEvent> {
    vec![ProtocolEvent::Log(LogEntry {
        level: LogLevel::Error,
        message: e.message,
    })]
}

fn item_started_to_events(item: RawItem) -> Vec<ProtocolEvent> {
    match item {
        RawItem::CommandExecution {
            id,
            command,
            status: _,
            ..
        } => vec![ProtocolEvent::ToolUse(ToolCallStart {
            call_id: id,
            tool_name: "command_execution".to_string(),
            input: serde_json::json!({ "command": command }),
        })],
        RawItem::FileChange { id, changes, .. } => vec![ProtocolEvent::ToolUse(ToolCallStart {
            call_id: id,
            tool_name: "file_change".to_string(),
            input: serde_json::json!({ "changes": changes }),
        })],
        // Agent messages don't have a meaningful "started" — Codex emits them
        // only on `item.completed`. Other / unknown item types fall through.
        RawItem::AgentMessage { .. } | RawItem::Other => Vec::new(),
    }
}

fn item_completed_to_events(item: RawItem, state: &mut ParserState) -> Vec<ProtocolEvent> {
    match item {
        RawItem::AgentMessage { text, .. } => vec![ProtocolEvent::TextBlock(TextBlock {
            block_id: state.alloc_block_id("blk"),
            text,
        })],
        RawItem::CommandExecution {
            id,
            command,
            aggregated_output,
            exit_code,
            ..
        } => {
            let is_error = exit_code.map(|c| c != 0).unwrap_or(false);
            vec![ProtocolEvent::ToolResult(ToolCallResult {
                call_id: id,
                output: serde_json::json!({
                    "command": command,
                    "exit_code": exit_code,
                    "output": aggregated_output,
                }),
                is_error,
            })]
        }
        RawItem::FileChange { id, changes, .. } => {
            vec![ProtocolEvent::ToolResult(ToolCallResult {
                call_id: id,
                output: serde_json::json!({ "changes": changes }),
                is_error: false,
            })]
        }
        RawItem::Other => Vec::new(),
    }
}

fn build_usage_snapshot(usage: Option<RawUsage>) -> Option<UsageSnapshot> {
    let usage = usage?;
    Some(UsageSnapshot {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cached_input_tokens,
        cache_creation_tokens: None,
        // Codex `turn.completed` does not report cost in the JSONL stream
        // observed on 0.128.0 — leave None rather than guess from tokens.
        cost_usd: None,
    })
}

/// Pull a stable `code` out of the freeform Codex error message so callers
/// can branch on the failure kind. Codex 0.128.0 wraps API errors as a JSON
/// blob with `error.type`; if we can't recognise the shape we fall back to a
/// generic `codex_error`.
fn classify_failure(message: &str) -> String {
    if let Ok(value) = serde_json::from_str::<Value>(message) {
        if let Some(t) = value
            .get("error")
            .and_then(|e| e.get("type"))
            .and_then(Value::as_str)
        {
            return t.to_string();
        }
        if let Some(t) = value.get("type").and_then(Value::as_str) {
            return t.to_string();
        }
    }
    if message.contains("no rollout found") {
        return "resume_not_found".to_string();
    }
    "codex_error".to_string()
}

#[derive(Debug, Deserialize)]
struct RawTurnCompleted {
    #[serde(default)]
    usage: Option<RawUsage>,
}

#[derive(Debug, Deserialize)]
struct RawTurnFailed {
    error: RawTurnFailedError,
}

#[derive(Debug, Deserialize)]
struct RawTurnFailedError {
    #[serde(default)]
    message: String,
}

#[derive(Debug, Deserialize)]
struct RawError {
    #[serde(default)]
    message: String,
}

#[derive(Debug, Default, Deserialize)]
struct RawUsage {
    #[serde(default)]
    input_tokens: Option<u64>,
    #[serde(default)]
    output_tokens: Option<u64>,
    #[serde(default)]
    cached_input_tokens: Option<u64>,
    #[serde(default)]
    #[allow(dead_code)]
    reasoning_output_tokens: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RawItemEnvelope {
    item: RawItem,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum RawItem {
    AgentMessage {
        #[allow(dead_code)]
        id: String,
        #[serde(default)]
        text: String,
    },
    CommandExecution {
        id: String,
        #[serde(default)]
        command: String,
        #[serde(default)]
        aggregated_output: String,
        #[serde(default)]
        exit_code: Option<i64>,
        #[serde(default)]
        #[allow(dead_code)]
        status: Option<String>,
    },
    FileChange {
        id: String,
        #[serde(default)]
        changes: Vec<Value>,
        #[serde(default)]
        #[allow(dead_code)]
        status: Option<String>,
    },
    #[serde(other)]
    Other,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_all(lines: &str) -> (Vec<ProtocolEvent>, ParserState) {
        let mut state = ParserState::default();
        let mut events = Vec::new();
        for line in lines.lines() {
            events.extend(parse_line(line, &mut state));
        }
        (events, state)
    }

    const THREAD_STARTED: &str =
        r#"{"type":"thread.started","thread_id":"019df324-cc9a-7e40-b2de-0bb1e1e701dd"}"#;
    const TURN_STARTED: &str = r#"{"type":"turn.started"}"#;
    const CMD_STARTED: &str = r#"{"type":"item.started","item":{"id":"item_0","type":"command_execution","command":"/bin/zsh -lc ls","aggregated_output":"","exit_code":null,"status":"in_progress"}}"#;
    const CMD_COMPLETED: &str = r#"{"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"/bin/zsh -lc ls","aggregated_output":"hello\n","exit_code":0,"status":"completed"}}"#;
    const CMD_COMPLETED_ERR: &str = r#"{"type":"item.completed","item":{"id":"item_9","type":"command_execution","command":"/bin/zsh -lc 'false'","aggregated_output":"","exit_code":1,"status":"completed"}}"#;
    const AGENT_MESSAGE: &str = r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"hello world"}}"#;
    const FILE_CHANGE_STARTED: &str = r#"{"type":"item.started","item":{"id":"item_2","type":"file_change","changes":[{"path":"/tmp/foo.txt","kind":"add"}],"status":"in_progress"}}"#;
    const FILE_CHANGE_COMPLETED: &str = r#"{"type":"item.completed","item":{"id":"item_2","type":"file_change","changes":[{"path":"/tmp/foo.txt","kind":"add"}],"status":"completed"}}"#;
    const TURN_COMPLETED: &str = r#"{"type":"turn.completed","usage":{"input_tokens":29552,"cached_input_tokens":18176,"output_tokens":61,"reasoning_output_tokens":0}}"#;
    const TURN_FAILED: &str = r#"{"type":"turn.failed","error":{"message":"{\"type\":\"error\",\"status\":400,\"error\":{\"type\":\"invalid_request_error\",\"message\":\"bad model\"}}"}}"#;
    const ERROR_LINE: &str = r#"{"type":"error","message":"upstream 500"}"#;

    #[test]
    fn thread_started_emits_session_meta_and_persists_resume_key() {
        let (events, state) = parse_all(THREAD_STARTED);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::SessionMeta(meta) => {
                assert_eq!(
                    meta.resume_key.as_str(),
                    "019df324-cc9a-7e40-b2de-0bb1e1e701dd"
                );
                assert_eq!(
                    meta.label.as_deref(),
                    Some("019df324-cc9a-7e40-b2de-0bb1e1e701dd")
                );
            }
            other => panic!("expected SessionMeta, got {other:?}"),
        }
        assert_eq!(
            state.last_resume_key.as_ref().map(ResumeKey::as_str),
            Some("019df324-cc9a-7e40-b2de-0bb1e1e701dd")
        );
    }

    #[test]
    fn turn_started_is_noop() {
        let (events, _) = parse_all(TURN_STARTED);
        assert!(events.is_empty());
    }

    #[test]
    fn agent_message_emits_text_block_with_synthetic_id() {
        let (events, _) = parse_all(AGENT_MESSAGE);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::TextBlock(b) => {
                assert_eq!(b.text, "hello world");
                assert!(b.block_id.starts_with("blk-"));
            }
            other => panic!("expected TextBlock, got {other:?}"),
        }
    }

    #[test]
    fn command_execution_lifecycle_pairs_call_id() {
        let fixture = format!("{CMD_STARTED}\n{CMD_COMPLETED}");
        let (events, _) = parse_all(&fixture);
        assert_eq!(events.len(), 2);
        match (&events[0], &events[1]) {
            (ProtocolEvent::ToolUse(start), ProtocolEvent::ToolResult(result)) => {
                assert_eq!(start.tool_name, "command_execution");
                assert_eq!(start.call_id, "item_0");
                assert_eq!(result.call_id, "item_0");
                assert!(!result.is_error);
                assert_eq!(result.output["exit_code"], 0);
                assert_eq!(result.output["output"], "hello\n");
            }
            other => panic!("expected ToolUse + ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn command_execution_nonzero_exit_marks_tool_result_error() {
        let (events, _) = parse_all(CMD_COMPLETED_ERR);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::ToolResult(r) => {
                assert!(r.is_error, "exit_code != 0 must mark is_error");
                assert_eq!(r.output["exit_code"], 1);
            }
            other => panic!("expected ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn file_change_lifecycle_pairs_call_id_and_carries_changes() {
        let fixture = format!("{FILE_CHANGE_STARTED}\n{FILE_CHANGE_COMPLETED}");
        let (events, _) = parse_all(&fixture);
        assert_eq!(events.len(), 2);
        match (&events[0], &events[1]) {
            (ProtocolEvent::ToolUse(start), ProtocolEvent::ToolResult(result)) => {
                assert_eq!(start.tool_name, "file_change");
                assert_eq!(start.call_id, "item_2");
                assert_eq!(result.call_id, "item_2");
                assert_eq!(start.input["changes"][0]["path"], "/tmp/foo.txt");
                assert!(!result.is_error);
            }
            other => panic!("expected ToolUse + ToolResult, got {other:?}"),
        }
    }

    #[test]
    fn turn_completed_emits_usage_then_completion() {
        let (events, _) = parse_all(TURN_COMPLETED);
        assert_eq!(events.len(), 2);
        match &events[0] {
            ProtocolEvent::Usage(snap) => {
                assert_eq!(snap.input_tokens, Some(29552));
                assert_eq!(snap.output_tokens, Some(61));
                assert_eq!(snap.cache_read_tokens, Some(18176));
                assert!(snap.cost_usd.is_none());
            }
            other => panic!("expected Usage, got {other:?}"),
        }
        match &events[1] {
            ProtocolEvent::Completion(c) => {
                assert!(c.summary.is_none());
                assert!(c.usage.is_some());
            }
            other => panic!("expected Completion, got {other:?}"),
        }
    }

    #[test]
    fn turn_completed_without_usage_still_emits_completion() {
        let line = r#"{"type":"turn.completed"}"#;
        let (events, _) = parse_all(line);
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0], ProtocolEvent::Completion(_)));
    }

    #[test]
    fn turn_failed_emits_failure_with_classified_code() {
        let (events, _) = parse_all(TURN_FAILED);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::Failure(f) => {
                assert_eq!(f.code, "invalid_request_error");
                assert!(f.message.contains("bad model"));
            }
            other => panic!("expected Failure, got {other:?}"),
        }
    }

    #[test]
    fn turn_failed_with_freeform_message_falls_back_to_generic_code() {
        let line = r#"{"type":"turn.failed","error":{"message":"network down"}}"#;
        let (events, _) = parse_all(line);
        match &events[0] {
            ProtocolEvent::Failure(f) => {
                assert_eq!(f.code, "codex_error");
                assert_eq!(f.message, "network down");
            }
            other => panic!("expected Failure, got {other:?}"),
        }
    }

    #[test]
    fn classify_failure_recognises_resume_not_found() {
        let msg = "thread/resume: thread/resume failed: no rollout found for thread id abc";
        assert_eq!(classify_failure(msg), "resume_not_found");
    }

    #[test]
    fn error_line_emits_log_at_error_level() {
        let (events, _) = parse_all(ERROR_LINE);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::Log(l) => {
                assert!(matches!(l.level, LogLevel::Error));
                assert_eq!(l.message, "upstream 500");
            }
            other => panic!("expected Log, got {other:?}"),
        }
    }

    #[test]
    fn unknown_top_level_type_emits_log_for_observability() {
        let line = r#"{"type":"telemetry","payload":{}}"#;
        let (events, _) = parse_all(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::Log(l) => assert_eq!(l.message, "codex.telemetry"),
            other => panic!("expected Log, got {other:?}"),
        }
    }

    #[test]
    fn unknown_item_type_falls_through_silently() {
        let line =
            r#"{"type":"item.completed","item":{"id":"item_x","type":"reasoning","text":"..."}}"#;
        let (events, _) = parse_all(line);
        assert!(events.is_empty(), "unknown item types must be skipped");
    }

    #[test]
    fn invalid_json_line_emits_diagnostic_not_silent_drop() {
        let fixture = format!("{THREAD_STARTED}\nnot json\n{AGENT_MESSAGE}");
        let (events, _) = parse_all(&fixture);
        // SUP-185: the bad line must surface as a Warn diagnostic, not vanish.
        assert_eq!(events.len(), 3);
        assert!(matches!(events[0], ProtocolEvent::SessionMeta(_)));
        match &events[1] {
            ProtocolEvent::Log(l) => {
                assert_eq!(l.level, LogLevel::Warn);
                assert!(l.message.contains("unparseable"), "got: {}", l.message);
            }
            other => panic!("expected Log(Warn) diagnostic, got {other:?}"),
        }
        assert!(matches!(events[2], ProtocolEvent::TextBlock(_)));
    }

    #[test]
    fn malformed_known_envelope_emits_diagnostic() {
        // `type` is recognised but the body is the wrong shape — must not drop.
        let line = r#"{"type":"item.completed","item":"not-an-object"}"#;
        let (events, _) = parse_all(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::Log(l) => {
                assert_eq!(l.level, LogLevel::Warn);
                assert!(
                    l.message.contains("malformed item.completed"),
                    "got: {}",
                    l.message
                );
            }
            other => panic!("expected Log(Warn) diagnostic, got {other:?}"),
        }
    }

    #[test]
    fn empty_or_whitespace_lines_are_noop() {
        let (events, _) = parse_all("\n   \n\n");
        assert!(events.is_empty());
    }

    #[test]
    fn full_happy_path_in_order() {
        let fixture = [
            THREAD_STARTED,
            TURN_STARTED,
            CMD_STARTED,
            CMD_COMPLETED,
            AGENT_MESSAGE,
            TURN_COMPLETED,
        ]
        .join("\n");
        let (events, state) = parse_all(&fixture);

        let kinds: Vec<&'static str> = events
            .iter()
            .map(|e| match e {
                ProtocolEvent::SessionMeta(_) => "session_meta",
                ProtocolEvent::TextBlock(_) => "text_block",
                ProtocolEvent::ToolUse(_) => "tool_use",
                ProtocolEvent::ToolResult(_) => "tool_result",
                ProtocolEvent::Usage(_) => "usage",
                ProtocolEvent::Completion(_) => "completion",
                ProtocolEvent::Failure(_) => "failure",
                ProtocolEvent::Cancelled(_) => "cancelled",
                ProtocolEvent::Log(_) => "log",
                ProtocolEvent::TextDelta(_) => "text_delta",
                ProtocolEvent::Thinking(_) => "thinking",
            })
            .collect();
        assert_eq!(
            kinds,
            vec![
                "session_meta",
                "tool_use",
                "tool_result",
                "text_block",
                "usage",
                "completion",
            ]
        );
        assert_eq!(
            state.last_resume_key.as_ref().map(ResumeKey::as_str),
            Some("019df324-cc9a-7e40-b2de-0bb1e1e701dd")
        );
    }
}
