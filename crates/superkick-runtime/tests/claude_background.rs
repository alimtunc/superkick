//! Integration tests for the Claude `--bg` subscription background runner.
//!
//! Two layers:
//! 1. The polling driver via `AgentSupervisor::launch_claude_background`, driven
//!    by an in-process fake [`ClaudeBackgroundCli`] against a real in-memory
//!    SQLite (CLAUDE.md rule 9 — storage is never mocked). Asserts the
//!    state→`AgentResult` mapping, `run_events` evidence, persisted
//!    `provider_session_id`, and that no `Run`/`RunStep` state is mutated.
//! 2. `RealClaudeBackgroundCli` against a fake `claude` shell script — launch id
//!    parsing, the billing env scrub, agents-JSON filtering, log-read tolerance,
//!    and stop. No real `claude` binary in CI.
//!
//! An optional `#[ignore]` smoke test (gated on `SUPERKICK_CLAUDE_BG_SMOKE=1`)
//! exercises a real `claude --bg`.

use std::collections::VecDeque;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use anyhow::Result;
use superkick_core::{
    AgentProvider, BillingProfile, ExecutionMode, LaunchReason, LinearContextMode, Run, RunStep,
    RunnerMode, SessionLifecyclePhase, StepKey, StepResultStatus, TriggerSource,
};
use superkick_runtime::agent_supervisor::{
    AgentLaunchConfig, AgentSupervisor, PolicyAudit, SessionLaunchInfo,
};
use superkick_runtime::claude_background::{
    BackgroundAgent, BackgroundFilter, BackgroundHandle, BackgroundLaunch, BackgroundState,
    ClaudeBackgroundCli, RealClaudeBackgroundCli,
};
use superkick_runtime::pty_session::PtySessionRegistry;
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo, RunRepo, RunStepRepo};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteRunEventRepo, SqliteRunRepo, SqliteRunStepRepo,
    SqliteTranscriptRepo, connect,
};

const FAST_POLL: Duration = Duration::from_millis(5);
const FAKE_ID: &str = "fake123";
const SESSION_NAME: &str = "superkick-x";

// ── in-process fake controller ───────────────────────────────────────

struct FakeCli {
    states: Mutex<VecDeque<BackgroundState>>,
    logs: Option<String>,
    transcript: Option<String>,
    stop_calls: Arc<AtomicUsize>,
}

impl FakeCli {
    fn new(states: Vec<BackgroundState>, logs: Option<&str>) -> (Self, Arc<AtomicUsize>) {
        Self::build(states, logs, None)
    }

    fn new_with_transcript(
        states: Vec<BackgroundState>,
        logs: Option<&str>,
        transcript: &str,
    ) -> (Self, Arc<AtomicUsize>) {
        Self::build(states, logs, Some(transcript))
    }

    fn build(
        states: Vec<BackgroundState>,
        logs: Option<&str>,
        transcript: Option<&str>,
    ) -> (Self, Arc<AtomicUsize>) {
        let stop_calls = Arc::new(AtomicUsize::new(0));
        (
            Self {
                states: Mutex::new(states.into()),
                logs: logs.map(str::to_string),
                transcript: transcript.map(str::to_string),
                stop_calls: Arc::clone(&stop_calls),
            },
            stop_calls,
        )
    }

    fn next_state(&self) -> Option<BackgroundState> {
        let mut s = self.states.lock().unwrap();
        if s.len() > 1 {
            s.pop_front()
        } else {
            s.front().cloned()
        }
    }
}

impl ClaudeBackgroundCli for FakeCli {
    async fn launch(&self, _params: BackgroundLaunch) -> Result<BackgroundHandle> {
        Ok(BackgroundHandle {
            id: FAKE_ID.to_string(),
            session_id: Some(format!("{FAKE_ID}-full")),
        })
    }

    fn poll(
        &self,
        _filter: &BackgroundFilter,
    ) -> impl Future<Output = Result<Option<BackgroundAgent>>> + Send {
        let next = self.next_state();
        async move {
            Ok(next.map(|state| BackgroundAgent {
                id: FAKE_ID.to_string(),
                session_id: Some(format!("{FAKE_ID}-full")),
                name: Some(SESSION_NAME.to_string()),
                cwd: None,
                state,
            }))
        }
    }

    fn logs(&self, _id: &str) -> impl Future<Output = Result<Option<String>>> + Send {
        let logs = self.logs.clone();
        async move { Ok(logs) }
    }

    fn transcript(&self, _session_id: &str) -> impl Future<Output = Result<Option<String>>> + Send {
        let transcript = self.transcript.clone();
        async move { Ok(transcript) }
    }

    fn stop(&self, _id: &str) -> impl Future<Output = Result<()>> + Send {
        self.stop_calls.fetch_add(1, Ordering::SeqCst);
        async move { Ok(()) }
    }
}

// ── SQLite harness ───────────────────────────────────────────────────

type Sup = AgentSupervisor<SqliteAgentSessionRepo, SqliteRunEventRepo, SqliteTranscriptRepo>;

struct Harness {
    supervisor: Sup,
    sessions: Arc<SqliteAgentSessionRepo>,
    events: Arc<SqliteRunEventRepo>,
    runs: SqliteRunRepo,
    run: Run,
    run_step: RunStep,
}

async fn harness() -> Result<Harness> {
    let pool = connect("sqlite::memory:").await?;
    let sessions = Arc::new(SqliteAgentSessionRepo::new(pool.clone()));
    let events = Arc::new(SqliteRunEventRepo::new(pool.clone()));
    let transcripts = Arc::new(SqliteTranscriptRepo::new(pool.clone()));
    let runs = SqliteRunRepo::new(pool.clone());
    let steps = SqliteRunStepRepo::new(pool.clone());
    let registry = Arc::new(PtySessionRegistry::new());
    let supervisor = AgentSupervisor::new(
        Arc::clone(&sessions),
        Arc::clone(&events),
        transcripts,
        registry,
    );

    let mut run = Run::new(
        "issue-bg".into(),
        "SUP-BG".into(),
        "owner/repo".into(),
        TriggerSource::LaunchTask,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run.worktree_path = Some("/tmp/wt-bg".into());
    runs.insert(&run).await?;
    let run_step = RunStep::new(run.id, StepKey::Code, 1);
    steps.insert(&run_step).await?;

    Ok(Harness {
        supervisor,
        sessions,
        events,
        runs,
        run,
        run_step,
    })
}

fn bg_config(h: &Harness) -> AgentLaunchConfig {
    AgentLaunchConfig {
        run_id: h.run.id,
        step_id: h.run_step.id,
        provider: AgentProvider::Claude,
        args: vec!["claude".into()],
        workdir: PathBuf::from("/tmp/wt-bg"),
        timeout: Duration::from_secs(60),
        idle_timeout: None,
        linear_context_mode: LinearContextMode::None,
        policy_audit: PolicyAudit::default(),
        session_launch: SessionLaunchInfo {
            role: "implementer".into(),
            purpose: "claude background test".into(),
            parent_session_id: None,
            launch_reason: LaunchReason::InitialStep,
            handoff_id: None,
        },
        initial_stdin: None,
        runner_mode: RunnerMode::BackgroundSession,
        billing_profile: BillingProfile::Subscription,
        session_live: None,
    }
}

const MARKER_LOGS: &str = "\u{1b}[32mworking…\u{1b}[0m\nSUPERKICK_STEP_RESULT_BEGIN\n{\"status\":\"completed\",\"summary\":\"did the thing\",\"changed_files\":[\"a.rs\"],\"questions\":[]}\nSUPERKICK_STEP_RESULT_END\n";

#[tokio::test]
async fn done_scans_logs_marker_into_completed_result() -> Result<()> {
    let h = harness().await?;
    let (cli, _stop) = FakeCli::new(
        vec![BackgroundState::Working, BackgroundState::Done],
        Some(MARKER_LOGS),
    );

    let (handle, join) = h
        .supervisor
        .launch_claude_background(
            cli,
            bg_config(&h),
            "do it".into(),
            SESSION_NAME.into(),
            FAST_POLL,
        )
        .await?;
    let result = join.await.expect("join").expect("agent result");

    assert!(matches!(
        result.lifecycle_phase,
        SessionLifecyclePhase::Completed { exit_code: 0 }
    ));
    let sr = result
        .step_result
        .expect("marker ok")
        .expect("marker present");
    assert_eq!(sr.status, StepResultStatus::Completed);
    assert_eq!(sr.summary, "did the thing");
    assert_eq!(sr.changed_files, vec!["a.rs".to_string()]);

    // Background id persisted as the control handle.
    let session = h
        .sessions
        .get(handle.session_id())
        .await?
        .expect("session row");
    assert_eq!(session.provider_session_id.as_deref(), Some(FAKE_ID));

    // run_events carry lifecycle + log evidence.
    let kinds: Vec<_> = h
        .events
        .list_by_run(h.run.id)
        .await?
        .into_iter()
        .map(|e| e.kind)
        .collect();
    use superkick_core::EventKind::*;
    assert!(kinds.contains(&SessionSpawned), "spawn event: {kinds:?}");
    assert!(
        kinds.contains(&SessionCompleted),
        "completed event: {kinds:?}"
    );
    // Background evidence is now structured AgentProtocol rows (SessionMeta /
    // Log / Completion) so the Activity tab renders them.
    assert!(kinds.contains(&AgentProtocol), "protocol rows: {kinds:?}");

    assert_no_business_state_mutation(&h).await?;
    Ok(())
}

#[tokio::test]
async fn done_recovers_marker_from_transcript_when_logs_are_garbled() -> Result<()> {
    // Regression for the "agent finished without emitting a step-result marker"
    // bug: `claude logs` is TUI overdraw with the marker evicted/glued, but the
    // durable transcript carries it byte-clean. Must complete, not park.
    let h = harness().await?;
    let text = "done.\n\
                SUPERKICK_STEP_RESULT_BEGIN\n\
                {\"status\":\"completed\",\"summary\":\"from transcript\",\"changed_files\":[],\"questions\":[]}\n\
                SUPERKICK_STEP_RESULT_END\n";
    let transcript = serde_json::json!({
        "message": { "role": "assistant", "content": [{ "type": "text", "text": text }] }
    })
    .to_string();
    // Garbled scrollback: the marker token is glued to leaked footer/OSC payload,
    // so the scrollback scan can never recover it.
    let garbled = "thinking with xhigh effort superkick-8be9b50d\n\
                   SUPERKICK_STEP_RESULT_BEGIN0; superkick-957f2828 thinking…";
    let (cli, _stop) = FakeCli::new_with_transcript(
        vec![BackgroundState::Working, BackgroundState::Done],
        Some(garbled),
        &transcript,
    );

    let (_handle, join) = h
        .supervisor
        .launch_claude_background(
            cli,
            bg_config(&h),
            "do it".into(),
            SESSION_NAME.into(),
            FAST_POLL,
        )
        .await?;
    let result = join.await.expect("join").expect("agent result");

    let sr = result
        .step_result
        .expect("marker ok")
        .expect("marker present");
    assert_eq!(sr.status, StepResultStatus::Completed);
    assert_eq!(
        sr.summary, "from transcript",
        "marker must come from the durable transcript, not the garbled logs"
    );
    Ok(())
}

#[tokio::test]
async fn blocked_parks_needs_human_without_stopping() -> Result<()> {
    let h = harness().await?;
    let (cli, stop) = FakeCli::new(
        vec![BackgroundState::Working, BackgroundState::Blocked],
        Some("waiting for your approval"),
    );

    let (_handle, join) = h
        .supervisor
        .launch_claude_background(
            cli,
            bg_config(&h),
            "do it".into(),
            SESSION_NAME.into(),
            FAST_POLL,
        )
        .await?;
    let result = join.await.expect("join").expect("agent result");

    let sr = result.step_result.expect("ok").expect("present");
    assert_eq!(sr.status, StepResultStatus::NeedsHuman);
    assert!(sr.summary.contains("blocked"));
    // Blocked sessions are left running so a later `claude attach` can resume.
    assert_eq!(
        stop.load(Ordering::SeqCst),
        0,
        "blocked must not stop the session"
    );
    Ok(())
}

#[tokio::test]
async fn failed_state_maps_to_failed_result() -> Result<()> {
    let h = harness().await?;
    let (cli, _stop) = FakeCli::new(vec![BackgroundState::Failed], None);

    let (_handle, join) = h
        .supervisor
        .launch_claude_background(
            cli,
            bg_config(&h),
            "do it".into(),
            SESSION_NAME.into(),
            FAST_POLL,
        )
        .await?;
    let result = join.await.expect("join").expect("agent result");

    assert!(matches!(
        result.lifecycle_phase,
        SessionLifecyclePhase::Failed { .. }
    ));
    let sr = result.step_result.expect("ok").expect("present");
    assert_eq!(sr.status, StepResultStatus::Failed);
    Ok(())
}

#[tokio::test]
async fn cancel_stops_the_background_session() -> Result<()> {
    let h = harness().await?;
    let (cli, stop) = FakeCli::new(vec![BackgroundState::Working], None);

    let (handle, join) = h
        .supervisor
        .launch_claude_background(
            cli,
            bg_config(&h),
            "do it".into(),
            SESSION_NAME.into(),
            FAST_POLL,
        )
        .await?;
    handle.cancel();
    let result = join.await.expect("join").expect("agent result");

    assert!(matches!(
        result.lifecycle_phase,
        SessionLifecyclePhase::Cancelled
    ));
    assert!(
        stop.load(Ordering::SeqCst) >= 1,
        "cancel must run `claude stop`"
    );
    Ok(())
}

async fn assert_no_business_state_mutation(h: &Harness) -> Result<()> {
    // The runner only touches its AgentSession + run_events; the shadow Run
    // state stays exactly as seeded.
    let run = h.runs.get(h.run.id).await?.expect("run row");
    assert_eq!(run.state, h.run.state, "runner must not mutate Run.state");
    Ok(())
}

// ── RealClaudeBackgroundCli against a fake `claude` script ────────────

fn write_fake_claude(dir: &Path, body: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let path = dir.join("claude");
    let script = format!("#!/bin/sh\n{body}\n");
    std::fs::write(&path, script).expect("write fake claude");
    let mut perms = std::fs::metadata(&path).expect("meta").permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&path, perms).expect("chmod");
    path
}

const AGENTS_JSON: &str = r#"echo '[{"pid":1,"cwd":"/x","kind":"interactive","sessionId":"i-1"},{"id":"fake123","cwd":"/wt","kind":"background","sessionId":"fake123-full","name":"superkick-x","state":"done"}]'"#;

#[tokio::test]
async fn real_cli_parses_backgrounded_id_and_polls_state() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let body = format!(
        r#"case "$1" in
  --bg) echo "backgrounded · fake123 (idle — send a prompt to start)" ;;
  agents) {AGENTS_JSON} ;;
  logs) echo "SUPERKICK_STEP_RESULT_BEGIN" ;;
  stop) : ;;
esac"#
    );
    let exe = write_fake_claude(dir.path(), &body);
    let cli = RealClaudeBackgroundCli::new(&exe);

    let handle = cli
        .launch(BackgroundLaunch {
            name: SESSION_NAME.into(),
            prompt: "p".into(),
            cwd: dir.path().to_path_buf(),
            effort: None,
        })
        .await?;
    assert_eq!(handle.id, "fake123");

    let agent = cli
        .poll(&BackgroundFilter {
            id: "fake123".into(),
            name: SESSION_NAME.into(),
            cwd: PathBuf::from("/wt"),
        })
        .await?
        .expect("background agent found");
    assert_eq!(agent.state, BackgroundState::Done);
    assert_eq!(agent.session_id.as_deref(), Some("fake123-full"));
    Ok(())
}

#[tokio::test]
async fn real_cli_launch_forwards_effort_flag() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let argdump = dir.path().join("args.txt");
    let body = format!(
        r#"case "$1" in
  --bg) echo "$@" > "{}"; echo "backgrounded · fake123 (idle)" ;;
  *) : ;;
esac"#,
        argdump.display()
    );
    let exe = write_fake_claude(dir.path(), &body);
    let cli = RealClaudeBackgroundCli::new(&exe);
    cli.launch(BackgroundLaunch {
        name: SESSION_NAME.into(),
        prompt: "p".into(),
        cwd: dir.path().to_path_buf(),
        effort: Some("high".into()),
    })
    .await?;
    let dumped = std::fs::read_to_string(&argdump)?;
    assert!(
        dumped.contains("--effort high"),
        "background argv must carry --effort: {dumped}"
    );
    Ok(())
}

#[tokio::test]
async fn real_cli_tolerates_log_read_failure() -> Result<()> {
    let dir = tempfile::tempdir()?;
    // `logs` exits non-zero — mimics the ENOENT control-socket failure after a
    // daemon idle/restart. Must degrade to `Ok(None)`, never an error.
    let body = r#"case "$1" in
  logs) echo "connect ENOENT control.sock" 1>&2; exit 1 ;;
  *) : ;;
esac"#;
    let exe = write_fake_claude(dir.path(), body);
    let cli = RealClaudeBackgroundCli::new(&exe);
    assert_eq!(cli.logs("fake123").await?, None);
    Ok(())
}

#[tokio::test]
async fn real_cli_launch_scrubs_billing_override_env() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let envdump = dir.path().join("childenv.txt");
    let body = format!(
        r#"case "$1" in
  --bg) env > "{}"; echo "backgrounded · fake123 (x)" ;;
  *) : ;;
esac"#,
        envdump.display()
    );
    let exe = write_fake_claude(dir.path(), &body);

    // The parent process carries the override; the launch must scrub it so the
    // subscription path can't be silently forced to pay-as-you-go.
    // SAFETY: single set/remove window around one synchronous launch; no other
    // test in this binary reads ANTHROPIC_* env.
    unsafe {
        std::env::set_var("ANTHROPIC_API_KEY", "secret-should-be-scrubbed");
        std::env::set_var("ANTHROPIC_BASE_URL", "https://evil.example");
    }
    let cli = RealClaudeBackgroundCli::new(&exe);
    let handle = cli
        .launch(BackgroundLaunch {
            name: SESSION_NAME.into(),
            prompt: "p".into(),
            cwd: dir.path().to_path_buf(),
            effort: None,
        })
        .await;
    unsafe {
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("ANTHROPIC_BASE_URL");
    }
    let handle = handle?;
    assert_eq!(handle.id, "fake123");

    let dumped = std::fs::read_to_string(&envdump)?;
    assert!(
        !dumped.contains("ANTHROPIC_API_KEY"),
        "ANTHROPIC_API_KEY must be scrubbed from the --bg child env"
    );
    assert!(
        !dumped.contains("ANTHROPIC_BASE_URL"),
        "ANTHROPIC_BASE_URL must be scrubbed from the --bg child env"
    );
    Ok(())
}

// ── optional real smoke ──────────────────────────────────────────────

#[tokio::test]
#[ignore = "requires a real `claude` CLI and SUPERKICK_CLAUDE_BG_SMOKE=1"]
async fn smoke_real_claude_bg() -> Result<()> {
    if std::env::var("SUPERKICK_CLAUDE_BG_SMOKE").is_err() {
        return Ok(());
    }
    let dir = tempfile::tempdir()?;
    let cli = RealClaudeBackgroundCli::new("claude");
    let handle = cli
        .launch(BackgroundLaunch {
            name: "superkick-smoke".into(),
            prompt: "Reply with the single word PONG, then stop.".into(),
            cwd: dir.path().to_path_buf(),
            effort: None,
        })
        .await?;
    assert!(!handle.id.is_empty(), "real claude --bg returned an id");

    let filter = BackgroundFilter {
        id: handle.id.clone(),
        name: "superkick-smoke".into(),
        cwd: dir.path().to_path_buf(),
    };
    // Poll a few times for a terminal-ish state, then clean up.
    for _ in 0..30 {
        if let Some(agent) = cli.poll(&filter).await? {
            if agent.state.is_terminal() || agent.state == BackgroundState::Blocked {
                break;
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    cli.stop(&handle.id).await?;
    Ok(())
}
