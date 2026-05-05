//! End-to-end integration tests for `CodexProtocolAdapter` driven by a mock
//! subprocess. Mirrors `claude_protocol.rs`: rather than depend on a real
//! `codex` binary being installed on CI runners, the tests use the
//! `spawn_codex_pump_for_test` seam to spawn a POSIX `cat` (or `sh`) child
//! and feed it Codex-shaped JSONL fixtures. Exercises: happy path, cancel,
//! wall-clock timeout against a steady stream, non-zero exit without a
//! terminal event, and the resume-not-found diagnostic path.

use std::process::Stdio;
use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

use superkick_core::{ProtocolEvent, ProtocolEventEnvelope, ResumeKey, TurnOutcome};
use superkick_runtime::ProtocolEventReceiver;
use superkick_runtime::protocol_adapter::spawn_codex_pump_for_test;

/// Captured shape of `codex exec --json` happy-path output (CLI 0.128.0).
const FIXTURE_HAPPY_PATH: &str = concat!(
    r#"{"type":"thread.started","thread_id":"019df324-cc9a-7e40-b2de-0bb1e1e701dd"}"#,
    "\n",
    r#"{"type":"turn.started"}"#,
    "\n",
    r#"{"type":"item.started","item":{"id":"item_0","type":"command_execution","command":"/bin/zsh -lc ls","aggregated_output":"","exit_code":null,"status":"in_progress"}}"#,
    "\n",
    r#"{"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"/bin/zsh -lc ls","aggregated_output":"hello\n","exit_code":0,"status":"completed"}}"#,
    "\n",
    r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"done"}}"#,
    "\n",
    r#"{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":50,"output_tokens":10,"reasoning_output_tokens":0}}"#,
    "\n",
);

async fn drain(rx: &mut ProtocolEventReceiver) -> Vec<ProtocolEventEnvelope> {
    let mut out = Vec::new();
    while let Some(env) = rx.recv().await {
        out.push(env);
    }
    out
}

fn kinds(events: &[ProtocolEventEnvelope]) -> Vec<&'static str> {
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

/// Spawn `cat -` and pipe a fixture into stdin. Equivalent to running `codex
/// exec --json` against the operator's prompt for our test purposes.
async fn spawn_cat_with_fixture(fixture: &str) -> tokio::process::Child {
    let mut child = Command::new("cat")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn cat");
    let mut stdin = child.stdin.take().expect("cat stdin");
    let payload = fixture.as_bytes().to_vec();
    tokio::spawn(async move {
        stdin.write_all(&payload).await.expect("write fixture");
        // Closing stdin signals EOF to cat, which exits 0 — mirrors codex's
        // natural termination after emitting `turn.completed`.
    });
    child
}

#[tokio::test]
async fn pump_drives_happy_path_to_completed_outcome() {
    let child = spawn_cat_with_fixture(FIXTURE_HAPPY_PATH).await;
    let mut stream = spawn_codex_pump_for_test(child, 64, Some(Duration::from_secs(5)), None);

    let events = timeout(Duration::from_secs(5), drain(&mut stream.events))
        .await
        .expect("events drained within timeout");
    let outcome = timeout(Duration::from_secs(5), stream.handle.finish())
        .await
        .expect("finish within timeout")
        .expect("turn ok");

    assert_eq!(
        kinds(&events),
        vec![
            "session_meta",
            "tool_use",
            "tool_result",
            "text_block",
            "usage",
            "completion",
        ]
    );

    // Sequence numbers strictly monotonic from 0.
    for (i, env) in events.iter().enumerate() {
        assert_eq!(env.seq, i as u64, "envelope at index {i} has wrong seq");
    }

    match outcome {
        TurnOutcome::Completed { resume_key, usage } => {
            assert_eq!(
                resume_key.as_str(),
                "019df324-cc9a-7e40-b2de-0bb1e1e701dd",
                "Completed must surface the thread id as the resume key",
            );
            assert!(usage.is_some(), "Completed must carry a usage snapshot");
        }
        other => panic!("expected Completed, got {other:?}"),
    }
}

#[tokio::test]
async fn cancel_terminates_pump_and_emits_cancelled() {
    // `sleep 30` keeps stdout open with no output — the pump only ever exits
    // because the cancel token fires.
    let child = Command::new("sleep")
        .arg("30")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn sleep");
    let mut stream = spawn_codex_pump_for_test(child, 64, None, None);

    stream.handle.cancel();

    let events = timeout(Duration::from_secs(5), drain(&mut stream.events))
        .await
        .expect("events drained within timeout");
    let outcome = timeout(Duration::from_secs(5), stream.handle.finish())
        .await
        .expect("finish within timeout")
        .expect("turn ok");

    assert_eq!(kinds(&events), vec!["cancelled"]);
    match outcome {
        TurnOutcome::Cancelled { reason, .. } => assert_eq!(reason, "operator"),
        other => panic!("expected Cancelled, got {other:?}"),
    }
}

#[tokio::test]
async fn wall_clock_timeout_fires_against_steady_event_stream() {
    // A child that emits one event every 200ms indefinitely. With a 1-second
    // wall-clock cap, the pump must time out *despite* the steady stream.
    // Locks in the regression for the deadline-anchored timeout.
    let script = r#"while :; do echo '{"type":"turn.started"}'; sleep 0.2; done"#;
    let child = Command::new("sh")
        .arg("-c")
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn sh");
    let mut stream = spawn_codex_pump_for_test(child, 64, Some(Duration::from_secs(1)), None);

    let events = timeout(Duration::from_secs(5), drain(&mut stream.events))
        .await
        .expect("events drained within timeout");
    let outcome = timeout(Duration::from_secs(5), stream.handle.finish())
        .await
        .expect("finish within timeout")
        .expect("turn ok");

    assert_eq!(
        kinds(&events).last().copied(),
        Some("failure"),
        "last event must be the timeout-synthesised failure",
    );
    match outcome {
        TurnOutcome::Failed { code, .. } => assert_eq!(code, "timeout"),
        other => panic!("expected Failed, got {other:?}"),
    }
}

#[tokio::test]
async fn nonzero_exit_without_terminal_event_synthesizes_failure() {
    let child = Command::new("sh")
        .arg("-c")
        .arg("echo whoops 1>&2; exit 7")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn sh");
    let mut stream = spawn_codex_pump_for_test(child, 64, Some(Duration::from_secs(5)), None);

    let events = timeout(Duration::from_secs(5), drain(&mut stream.events))
        .await
        .expect("events drained within timeout");
    let outcome = timeout(Duration::from_secs(5), stream.handle.finish())
        .await
        .expect("finish within timeout")
        .expect("turn ok");

    assert_eq!(kinds(&events), vec!["failure"]);
    match outcome {
        TurnOutcome::Failed { code, message, .. } => {
            assert_eq!(code, "codex_exit_7");
            assert!(
                message.contains("whoops"),
                "stderr tail should be in message, got {message:?}"
            );
        }
        other => panic!("expected Failed, got {other:?}"),
    }
}

#[tokio::test]
async fn resume_unknown_id_synthesizes_resume_not_found_failure() {
    // Mirrors the real `codex exec resume <unknown-uuid>` failure mode
    // captured during SUP-99 probing: stderr says "thread/resume failed: no
    // rollout found for thread id <id>", exit 1, no JSONL emitted.
    let child = Command::new("sh")
        .arg("-c")
        .arg("echo 'Error: thread/resume: thread/resume failed: no rollout found for thread id 00000000-0000-0000-0000-000000000000' 1>&2; exit 1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn sh");
    let attempted = ResumeKey::new("00000000-0000-0000-0000-000000000000");
    let mut stream = spawn_codex_pump_for_test(
        child,
        64,
        Some(Duration::from_secs(5)),
        Some(attempted.clone()),
    );

    let events = timeout(Duration::from_secs(5), drain(&mut stream.events))
        .await
        .expect("events drained within timeout");
    let outcome = timeout(Duration::from_secs(5), stream.handle.finish())
        .await
        .expect("finish within timeout")
        .expect("turn ok");

    assert_eq!(kinds(&events), vec!["failure"]);
    match outcome {
        TurnOutcome::Failed { code, message, .. } => {
            assert_eq!(
                code, "resume_not_found",
                "resume failure must surface a stable code, got {code}"
            );
            assert!(
                message.contains(attempted.as_str()),
                "failure message must mention the attempted resume key for operator diagnostics, got {message:?}",
            );
        }
        other => panic!("expected Failed, got {other:?}"),
    }
}

#[tokio::test]
async fn turn_failed_event_propagates_provider_error_code() {
    // Codex 0.128.0 emits a `turn.failed` line with the API's error blob in
    // `error.message`. The parser pulls `error.type` out and we surface that
    // as the canonical failure code so callers can branch without string
    // matching the human-readable text.
    let fixture = concat!(
        r#"{"type":"thread.started","thread_id":"019df325-fffe-7000-aaaa-bbbbbbbbbbbb"}"#,
        "\n",
        r#"{"type":"turn.started"}"#,
        "\n",
        r#"{"type":"error","message":"upstream 400"}"#,
        "\n",
        r#"{"type":"turn.failed","error":{"message":"{\"type\":\"error\",\"status\":400,\"error\":{\"type\":\"invalid_request_error\",\"message\":\"bad model\"}}"}}"#,
        "\n",
    );
    let child = spawn_cat_with_fixture(fixture).await;
    let mut stream = spawn_codex_pump_for_test(child, 64, Some(Duration::from_secs(5)), None);

    let events = timeout(Duration::from_secs(5), drain(&mut stream.events))
        .await
        .expect("events drained within timeout");
    let outcome = timeout(Duration::from_secs(5), stream.handle.finish())
        .await
        .expect("finish within timeout")
        .expect("turn ok");

    assert_eq!(
        kinds(&events),
        vec!["session_meta", "log", "failure"],
        "error line must surface as Log; turn.failed as Failure",
    );
    match outcome {
        TurnOutcome::Failed {
            code,
            resume_key,
            message,
        } => {
            assert_eq!(code, "invalid_request_error");
            assert!(
                message.contains("bad model"),
                "failure message preserves the provider's diagnostic, got {message:?}"
            );
            assert_eq!(
                resume_key.as_ref().map(ResumeKey::as_str),
                Some("019df325-fffe-7000-aaaa-bbbbbbbbbbbb"),
                "resume key persisted from earlier SessionMeta even on failure",
            );
        }
        other => panic!("expected Failed, got {other:?}"),
    }
}
