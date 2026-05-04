//! End-to-end integration tests for `ClaudeProtocolAdapter` driven by a mock
//! subprocess. Rather than depend on a real `claude` binary being installed on
//! CI runners, the tests use the `spawn_pump_for_test` seam: they spawn a
//! POSIX `cat` (or `sleep`) child themselves, hand it to the adapter's pump,
//! and assert on the resulting event stream + `TurnOutcome`. This exercises:
//! the stdout NDJSON pipeline, the rolling stderr tail, the cancel path, and
//! the synthetic `claude_exit_<code>` failure path.

use std::process::Stdio;
use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

use superkick_core::{ProtocolEvent, ProtocolEventEnvelope, TurnOutcome};
use superkick_runtime::ProtocolEventReceiver;
use superkick_runtime::protocol_adapter::spawn_pump_for_test;

const FIXTURE_HAPPY_PATH: &str = concat!(
    r#"{"type":"system","subtype":"init","session_id":"sess-int-1","model":"claude-sonnet-4-5","cwd":"/tmp"}"#,
    "\n",
    r#"{"type":"assistant","message":{"id":"msg_01","role":"assistant","content":[{"type":"text","text":"hi there"}]}}"#,
    "\n",
    r#"{"type":"assistant","message":{"id":"msg_02","role":"assistant","content":[{"type":"tool_use","id":"toolu_x","name":"Read","input":{"path":"a.rs"}}]}}"#,
    "\n",
    r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_x","content":"file body","is_error":false}]}}"#,
    "\n",
    r#"{"type":"result","subtype":"success","is_error":false,"result":"hi there","session_id":"sess-int-1","total_cost_usd":0.0001,"usage":{"input_tokens":7,"output_tokens":2}}"#,
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

/// Spawn `cat -` and pipe a fixture into stdin. Equivalent to running `claude`
/// against the operator's prompt for our test purposes.
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
        // Closing stdin signals EOF to cat, which then exits 0 — mirrors
        // claude's natural termination after emitting `result`.
    });
    child
}

#[tokio::test]
async fn pump_drives_happy_path_to_completed_outcome() {
    let child = spawn_cat_with_fixture(FIXTURE_HAPPY_PATH).await;
    let mut stream = spawn_pump_for_test(child, 64, Some(Duration::from_secs(5)));

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
            "text_block",
            "tool_use",
            "tool_result",
            "usage",
            "completion",
        ]
    );

    // Sequence numbers must be strictly monotonic from 0.
    for (i, env) in events.iter().enumerate() {
        assert_eq!(env.seq, i as u64, "envelope at index {i} has wrong seq");
    }

    match outcome {
        TurnOutcome::Completed { resume_key, usage } => {
            assert_eq!(resume_key.as_str(), "sess-int-1");
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
    let mut stream = spawn_pump_for_test(child, 64, None);

    // Kick the cancel token immediately.
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
    // A child that emits one log line every 200ms, indefinitely. With a
    // 1-second wall-clock cap, the pump must time out *despite* the steady
    // stream of stdout activity. Locks in the regression for the deadline-
    // anchored timeout (see SUP-98 review).
    let script = r#"while :; do echo '{"type":"system","subtype":"flush"}'; sleep 0.2; done"#;
    let child = Command::new("sh")
        .arg("-c")
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn sh");
    let mut stream = spawn_pump_for_test(child, 64, Some(Duration::from_secs(1)));

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
        "last event must be the timeout-synthesized failure",
    );
    match outcome {
        TurnOutcome::Failed { code, .. } => assert_eq!(code, "timeout"),
        other => panic!("expected Failed, got {other:?}"),
    }
}

#[tokio::test]
async fn nonzero_exit_without_result_synthesizes_failure() {
    // `sh -c 'echo whoops 1>&2; exit 7'` exits non-zero with no stdout JSON
    // and one stderr line. The pump must synthesize a Failure tagged
    // `claude_exit_7` and surface the stderr tail in the message.
    let child = Command::new("sh")
        .arg("-c")
        .arg("echo whoops 1>&2; exit 7")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn sh");
    let mut stream = spawn_pump_for_test(child, 64, Some(Duration::from_secs(5)));

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
            assert_eq!(code, "claude_exit_7");
            assert!(
                message.contains("whoops"),
                "stderr tail should be in message, got {message:?}"
            );
        }
        other => panic!("expected Failed, got {other:?}"),
    }
}
