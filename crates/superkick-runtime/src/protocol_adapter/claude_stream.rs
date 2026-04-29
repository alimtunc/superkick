//! Stateless parser for Claude's `--output-format stream-json` NDJSON stream.
//!
//! The Claude CLI emits one JSON object per line on stdout. We deserialize each
//! line into a `serde_json::Value`, dispatch on the `type` tag, and translate
//! into one or more provider-neutral `ProtocolEvent`s. The parser keeps a tiny
//! `ParserState` (last `ResumeKey` and a synthetic block-id counter) so the
//! adapter can persist the session id across `resume_turn()` calls without
//! threading it through every hop.
//!
//! Pure: takes `&str` and a `&mut ParserState`, returns `Vec<ProtocolEvent>`.
//! No I/O, no tokio. Lets us cover every variant in unit tests without spawning
//! a real claude binary.

use serde::Deserialize;
use serde_json::Value;

use superkick_core::{
    Completion, Failure, LogEntry, LogLevel, ProtocolEvent, ResumeKey, SessionMeta, TextBlock,
    Thinking, ToolCallResult, ToolCallStart, UsageSnapshot,
};

/// Carries cross-line state the parser needs to translate Claude's stream into
/// canonical events. Threaded by reference through every `parse_line` call.
#[derive(Debug, Default)]
pub(crate) struct ParserState {
    /// Last `ResumeKey` seen on a `system.init` or `result` event. Adapters
    /// expose this on the final `TurnOutcome` so callers can resume the
    /// conversation.
    pub last_resume_key: Option<ResumeKey>,
    /// Counter for synthetic ids on text/thinking blocks. Claude does not
    /// stamp content blocks with stable ids in the JSON wire format, so we
    /// generate one ourselves to satisfy the canonical contract.
    pub next_block_id: u64,
}

impl ParserState {
    fn alloc_block_id(&mut self, prefix: &str) -> String {
        let id = self.next_block_id;
        self.next_block_id += 1;
        format!("{prefix}-{id}")
    }
}

/// Parse one NDJSON line. Returns the canonical events the adapter should
/// publish, in order. Empty `Vec` means the line was a no-op (skipped variant
/// or invalid JSON — both are logged at `debug!` level so a noisy provider
/// doesn't spam the operator).
pub(crate) fn parse_line(line: &str, state: &mut ParserState) -> Vec<ProtocolEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let value: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(err) => {
            tracing::debug!(error = %err, "skipping invalid claude stream-json line");
            return Vec::new();
        }
    };

    let ty = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    match ty.as_str() {
        "system" => system_to_events(value, state),
        "assistant" => match serde_json::from_value::<RawAssistantEnvelope>(value) {
            Ok(env) => assistant_to_events(env.message, state),
            Err(err) => {
                tracing::debug!(error = %err, "skipping malformed assistant envelope");
                Vec::new()
            }
        },
        "user" => match serde_json::from_value::<RawUserEnvelope>(value) {
            Ok(env) => user_to_events(env.message),
            Err(err) => {
                tracing::debug!(error = %err, "skipping malformed user envelope");
                Vec::new()
            }
        },
        "result" => match serde_json::from_value::<RawResult>(value) {
            Ok(res) => result_to_events(res, state),
            Err(err) => {
                tracing::debug!(error = %err, "skipping malformed result envelope");
                Vec::new()
            }
        },
        "" => Vec::new(),
        other => {
            let subtype = value
                .get("subtype")
                .and_then(Value::as_str)
                .map(str::to_string);
            let message = match subtype {
                Some(sub) => format!("claude.{other}.{sub}"),
                None => format!("claude.{other}"),
            };
            vec![ProtocolEvent::Log(LogEntry {
                level: LogLevel::Info,
                message,
            })]
        }
    }
}

fn system_to_events(value: Value, state: &mut ParserState) -> Vec<ProtocolEvent> {
    let subtype = value
        .get("subtype")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if subtype == "init" {
        if let Some(sid) = value
            .get("session_id")
            .and_then(Value::as_str)
            .map(str::to_string)
        {
            let resume_key = ResumeKey::new(sid);
            state.last_resume_key = Some(resume_key.clone());
            let label = value
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_string);
            return vec![ProtocolEvent::SessionMeta(SessionMeta {
                resume_key,
                label,
            })];
        }
    }

    let message = if subtype.is_empty() {
        "claude.system".to_string()
    } else {
        format!("claude.system.{subtype}")
    };
    vec![ProtocolEvent::Log(LogEntry {
        level: LogLevel::Info,
        message,
    })]
}

fn assistant_to_events(
    message: RawAssistantMessage,
    state: &mut ParserState,
) -> Vec<ProtocolEvent> {
    let mut out = Vec::with_capacity(message.content.len());
    for block in message.content {
        match block {
            RawContentBlock::Text { text } => {
                out.push(ProtocolEvent::TextBlock(TextBlock {
                    block_id: state.alloc_block_id("blk"),
                    text,
                }));
            }
            RawContentBlock::Thinking { thinking } => {
                out.push(ProtocolEvent::Thinking(Thinking {
                    block_id: state.alloc_block_id("thought"),
                    text: thinking,
                }));
            }
            RawContentBlock::ToolUse { id, name, input } => {
                out.push(ProtocolEvent::ToolUse(ToolCallStart {
                    call_id: id,
                    tool_name: name,
                    input,
                }));
            }
            RawContentBlock::ToolResult { .. } | RawContentBlock::Other => {
                // Tool results only ever appear on `user` envelopes; ignore
                // them on `assistant` to avoid double-emission. Unknown block
                // types fall through silently.
            }
        }
    }
    out
}

fn user_to_events(message: RawUserMessage) -> Vec<ProtocolEvent> {
    let blocks = match message.content {
        RawUserContent::Blocks(blocks) => blocks,
        // A bare-string user message is the prompt itself echoed back —
        // not interesting downstream. Skip.
        RawUserContent::Text(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    for block in blocks {
        if let RawContentBlock::ToolResult {
            tool_use_id,
            content,
            is_error,
        } = block
        {
            out.push(ProtocolEvent::ToolResult(ToolCallResult {
                call_id: tool_use_id,
                output: content.unwrap_or(Value::Null),
                is_error: is_error.unwrap_or(false),
            }));
        }
    }
    out
}

fn result_to_events(res: RawResult, state: &mut ParserState) -> Vec<ProtocolEvent> {
    if let Some(sid) = res.session_id {
        state.last_resume_key = Some(ResumeKey::new(sid));
    }

    let snapshot = build_usage_snapshot(res.usage, res.total_cost_usd);
    let kind = res.subtype.unwrap_or_else(|| "unknown".to_string());

    if res.is_error.unwrap_or(false) || kind != "success" {
        let message = res
            .result
            .clone()
            .unwrap_or_else(|| format!("claude result.{kind}"));
        return vec![ProtocolEvent::Failure(Failure {
            code: kind,
            message,
            usage: snapshot,
        })];
    }

    let mut out = Vec::with_capacity(2);
    if let Some(snap) = snapshot.clone() {
        out.push(ProtocolEvent::Usage(snap));
    }
    out.push(ProtocolEvent::Completion(Completion {
        summary: res.result,
        usage: snapshot,
    }));
    out
}

fn build_usage_snapshot(usage: Option<RawUsage>, cost: Option<f64>) -> Option<UsageSnapshot> {
    if usage.is_none() && cost.is_none() {
        return None;
    }
    let usage = usage.unwrap_or_default();
    Some(UsageSnapshot {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_tokens: usage.cache_read_input_tokens,
        cache_creation_tokens: usage.cache_creation_input_tokens,
        cost_usd: cost.map(format_cost_usd),
    })
}

/// Render a USD cost as a fixed-precision decimal string with trailing zeros
/// trimmed. The contract type stores cost as `Option<String>` to dodge `f64`
/// rounding drift across providers (cf. SUP-97).
fn format_cost_usd(value: f64) -> String {
    let rendered = format!("{value:.6}");
    if !rendered.contains('.') {
        return rendered;
    }
    let trimmed = rendered.trim_end_matches('0').trim_end_matches('.');
    if trimmed.is_empty() {
        "0".to_string()
    } else {
        trimmed.to_string()
    }
}

#[derive(Debug, Deserialize)]
struct RawAssistantEnvelope {
    message: RawAssistantMessage,
}

#[derive(Debug, Deserialize)]
struct RawUserEnvelope {
    message: RawUserMessage,
}

#[derive(Debug, Deserialize)]
struct RawAssistantMessage {
    #[serde(default)]
    content: Vec<RawContentBlock>,
}

#[derive(Debug, Deserialize)]
struct RawUserMessage {
    content: RawUserContent,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum RawUserContent {
    // Bare-string user messages (the prompt echoed back) carry no events we
    // surface — match on the variant tag only.
    Text(#[allow(dead_code)] String),
    Blocks(Vec<RawContentBlock>),
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum RawContentBlock {
    Text {
        text: String,
    },
    Thinking {
        thinking: String,
    },
    ToolUse {
        id: String,
        name: String,
        #[serde(default)]
        input: Value,
    },
    ToolResult {
        tool_use_id: String,
        #[serde(default)]
        content: Option<Value>,
        #[serde(default)]
        is_error: Option<bool>,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct RawResult {
    #[serde(default)]
    subtype: Option<String>,
    #[serde(default)]
    is_error: Option<bool>,
    #[serde(default)]
    result: Option<String>,
    #[serde(default)]
    total_cost_usd: Option<f64>,
    #[serde(default)]
    usage: Option<RawUsage>,
    #[serde(default)]
    session_id: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct RawUsage {
    #[serde(default)]
    input_tokens: Option<u64>,
    #[serde(default)]
    output_tokens: Option<u64>,
    #[serde(default)]
    cache_creation_input_tokens: Option<u64>,
    #[serde(default)]
    cache_read_input_tokens: Option<u64>,
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

    const SESSION_INIT: &str = r#"{"type":"system","subtype":"init","session_id":"sess-init-123","model":"claude-sonnet-4-5","cwd":"/tmp"}"#;

    const ASSISTANT_TEXT: &str = r#"{"type":"assistant","message":{"id":"msg_01","role":"assistant","content":[{"type":"text","text":"hello world"}]},"session_id":"sess-init-123"}"#;

    const ASSISTANT_THINKING: &str = r#"{"type":"assistant","message":{"id":"msg_02","role":"assistant","content":[{"type":"thinking","thinking":"considering"}]}}"#;

    const TOOL_USE: &str = r#"{"type":"assistant","message":{"id":"msg_03","role":"assistant","content":[{"type":"tool_use","id":"toolu_42","name":"Read","input":{"path":"x.rs"}}]}}"#;

    const TOOL_RESULT: &str = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_42","content":"ok","is_error":false}]}}"#;

    const RESULT_SUCCESS: &str = r#"{"type":"result","subtype":"success","is_error":false,"result":"hello world","total_cost_usd":0.000123,"usage":{"input_tokens":12,"output_tokens":3,"cache_read_input_tokens":0,"cache_creation_input_tokens":0},"session_id":"sess-init-123"}"#;

    const RESULT_ERROR: &str = r#"{"type":"result","subtype":"error_max_turns","is_error":true,"result":"hit the cap","session_id":"sess-init-123"}"#;

    #[test]
    fn parse_session_init_emits_session_meta() {
        let (events, state) = parse_all(SESSION_INIT);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::SessionMeta(meta) => {
                assert_eq!(meta.resume_key.as_str(), "sess-init-123");
                assert_eq!(meta.label.as_deref(), Some("claude-sonnet-4-5"));
            }
            other => panic!("expected SessionMeta, got {other:?}"),
        }
        assert_eq!(
            state.last_resume_key.as_ref().map(ResumeKey::as_str),
            Some("sess-init-123")
        );
    }

    #[test]
    fn parse_assistant_text_block_emits_text_block() {
        let (events, _) = parse_all(ASSISTANT_TEXT);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::TextBlock(block) => {
                assert_eq!(block.text, "hello world");
                assert!(
                    !block.block_id.is_empty(),
                    "block_id must be a synthetic id"
                );
            }
            other => panic!("expected TextBlock, got {other:?}"),
        }
    }

    #[test]
    fn parse_thinking_block_emits_thinking() {
        let (events, _) = parse_all(ASSISTANT_THINKING);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::Thinking(t) => {
                assert_eq!(t.text, "considering");
                assert!(t.block_id.starts_with("thought-"));
            }
            other => panic!("expected Thinking, got {other:?}"),
        }
    }

    #[test]
    fn parse_tool_use_then_tool_result_pairs_call_id() {
        let fixture = format!("{TOOL_USE}\n{TOOL_RESULT}");
        let (events, _) = parse_all(&fixture);
        assert_eq!(events.len(), 2);
        let (call_id_use, call_id_result) = match (&events[0], &events[1]) {
            (ProtocolEvent::ToolUse(start), ProtocolEvent::ToolResult(result)) => {
                assert_eq!(start.tool_name, "Read");
                assert_eq!(start.input["path"], "x.rs");
                assert!(!result.is_error);
                (start.call_id.clone(), result.call_id.clone())
            }
            other => panic!("expected ToolUse + ToolResult, got {other:?}"),
        };
        assert_eq!(call_id_use, "toolu_42");
        assert_eq!(call_id_result, "toolu_42");
    }

    #[test]
    fn parse_result_success_emits_usage_then_completion() {
        let (events, state) = parse_all(RESULT_SUCCESS);
        assert_eq!(events.len(), 2, "expected Usage then Completion");
        match &events[0] {
            ProtocolEvent::Usage(snap) => {
                assert_eq!(snap.input_tokens, Some(12));
                assert_eq!(snap.output_tokens, Some(3));
                assert_eq!(snap.cost_usd.as_deref(), Some("0.000123"));
            }
            other => panic!("expected Usage, got {other:?}"),
        }
        match &events[1] {
            ProtocolEvent::Completion(c) => {
                assert_eq!(c.summary.as_deref(), Some("hello world"));
                assert!(c.usage.is_some());
            }
            other => panic!("expected Completion, got {other:?}"),
        }
        assert_eq!(
            state.last_resume_key.as_ref().map(ResumeKey::as_str),
            Some("sess-init-123")
        );
    }

    #[test]
    fn parse_result_error_emits_failure_with_code() {
        let (events, _) = parse_all(RESULT_ERROR);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ProtocolEvent::Failure(f) => {
                assert_eq!(f.code, "error_max_turns");
                assert_eq!(f.message, "hit the cap");
            }
            other => panic!("expected Failure, got {other:?}"),
        }
    }

    #[test]
    fn parse_skips_unknown_variants_without_panicking() {
        let unknown = r#"{"type":"telemetry","subtype":"flush","stuff":[1,2,3]}"#;
        let fixture = format!("{SESSION_INIT}\n{unknown}\n{ASSISTANT_TEXT}");
        let (events, _) = parse_all(&fixture);
        // SessionMeta + Log (for the unknown variant) + TextBlock = 3 events.
        // The unknown variant must not abort downstream parsing.
        assert_eq!(events.len(), 3);
        match &events[1] {
            ProtocolEvent::Log(log) => assert_eq!(log.message, "claude.telemetry.flush"),
            other => panic!("expected Log, got {other:?}"),
        }
        assert!(matches!(events[2], ProtocolEvent::TextBlock(_)));
    }

    #[test]
    fn parse_invalid_json_line_is_logged_and_skipped() {
        let invalid = "this is not json";
        let fixture = format!("{SESSION_INIT}\n{invalid}\n{ASSISTANT_TEXT}");
        let (events, _) = parse_all(&fixture);
        // The invalid line yields zero events; surrounding lines still parse.
        assert_eq!(events.len(), 2);
        assert!(matches!(events[0], ProtocolEvent::SessionMeta(_)));
        assert!(matches!(events[1], ProtocolEvent::TextBlock(_)));
    }

    #[test]
    fn parse_empty_or_whitespace_line_is_noop() {
        let (events, _) = parse_all("\n   \n");
        assert!(events.is_empty());
    }

    #[test]
    fn format_cost_usd_trims_trailing_zeros() {
        assert_eq!(format_cost_usd(0.001), "0.001");
        assert_eq!(format_cost_usd(0.000123), "0.000123");
        assert_eq!(format_cost_usd(1.0), "1");
        assert_eq!(format_cost_usd(0.0), "0");
    }

    #[test]
    fn parse_full_happy_path_in_order() {
        let fixture = [
            SESSION_INIT,
            ASSISTANT_TEXT,
            TOOL_USE,
            TOOL_RESULT,
            RESULT_SUCCESS,
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
                "text_block",
                "tool_use",
                "tool_result",
                "usage",
                "completion",
            ]
        );
        assert_eq!(
            state.last_resume_key.as_ref().map(ResumeKey::as_str),
            Some("sess-init-123")
        );
    }
}
