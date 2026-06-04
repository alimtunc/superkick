//! Takeover service: honest path stamping, attach without spawn, and ledger
//! emission. Wired against a real in-memory SQLite event repo so the persisted
//! `TerminalTakeoverOpened` payload is exercised end-to-end.

use std::sync::Arc;

use anyhow::Result;
use portable_pty::CommandBuilder;
use superkick_core::{
    EventKind, ExecutionMode, Run, RunId, TakeoverModeKind, TakeoverPath, TakeoverSessionId,
    TriggerSource,
};
use superkick_runtime::pty_session::PtySessionRegistry;
use superkick_runtime::terminal_takeover::{
    OpenTakeoverParams, SpawnedTakeover, TerminalTakeoverService,
};
use superkick_storage::repo::{RunEventRepo, RunRepo};
use superkick_storage::{SqliteRunEventRepo, SqliteRunRepo, connect};

fn sample_run() -> Run {
    let mut run = Run::new(
        "issue-uuid-188".into(),
        "SUP-188".into(),
        "owner/repo".into(),
        TriggerSource::LaunchTask,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run.worktree_path = Some(std::env::temp_dir().to_string_lossy().into_owned());
    run
}

#[test]
fn into_opened_routes_ws_and_resume_by_path() {
    let run_id = RunId::new();
    let id = TakeoverSessionId::new();
    let spawned = |path| SpawnedTakeover {
        takeover_session_id: id,
        mode: TakeoverModeKind::InteractiveContinuation,
        takeover_path: path,
    };

    // Attach joins the run's primary terminal; no takeover PTY is addressed.
    let attach = spawned(TakeoverPath::Attach).into_opened(run_id);
    assert_eq!(attach.terminal_ws, format!("/api/runs/{run_id}/terminal"));
    assert_eq!(attach.takeover_path, TakeoverPath::Attach);

    // Fresh and Resume both point at the dedicated takeover PTY.
    let fresh = spawned(TakeoverPath::Fresh).into_opened(run_id);
    assert_eq!(
        fresh.terminal_ws,
        format!("/api/runs/{run_id}/terminal/{id}")
    );
    assert_eq!(fresh.takeover_path, TakeoverPath::Fresh);

    let resume = spawned(TakeoverPath::Resume).into_opened(run_id);
    assert_eq!(
        resume.terminal_ws,
        format!("/api/runs/{run_id}/terminal/{id}")
    );
    assert_eq!(resume.takeover_path, TakeoverPath::Resume);
}

#[tokio::test]
async fn attach_emits_attach_event_and_registers_nothing() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let run_repo = Arc::new(SqliteRunRepo::new(pool.clone()));
    let registry = Arc::new(PtySessionRegistry::new());
    let event_repo = Arc::new(SqliteRunEventRepo::new(pool));
    let service = TerminalTakeoverService::new(Arc::clone(&registry), Arc::clone(&event_repo));

    let run = sample_run();
    run_repo.insert(&run).await?;

    let spawned = service.attach(run.id, Some("operator-1".into())).await;
    assert_eq!(spawned.takeover_path, TakeoverPath::Attach);
    let opened = spawned.into_opened(run.id);
    assert_eq!(opened.terminal_ws, format!("/api/runs/{}/terminal", run.id));

    // Attach never spawns/registers a takeover PTY — closing it must not be
    // able to kill the agent's primary session.
    assert!(registry.list_takeovers_for_run(run.id).is_empty());

    // The ledger event carries the path so the UI reflects it via SSE.
    let events = event_repo.list_by_run(run.id).await?;
    let opened_evt = events
        .iter()
        .find(|e| e.kind == EventKind::TerminalTakeoverOpened)
        .expect("TerminalTakeoverOpened emitted");
    let payload = opened_evt.payload_json.as_ref().expect("payload");
    assert_eq!(payload["takeover_path"], "attach");
    Ok(())
}

#[tokio::test]
async fn open_stamps_path_and_emits_opened_event() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let run_repo = Arc::new(SqliteRunRepo::new(pool.clone()));
    let registry = Arc::new(PtySessionRegistry::new());
    let event_repo = Arc::new(SqliteRunEventRepo::new(pool));
    let service = TerminalTakeoverService::new(registry, Arc::clone(&event_repo));

    let run = sample_run();
    run_repo.insert(&run).await?;

    let cwd = std::env::temp_dir();
    // A trivially-terminating real process: exercises the spawn → register →
    // emit → inject wiring without depending on a provider CLI being present.
    let mut command = CommandBuilder::new("/bin/sh");
    command.args(["-c", "exit 0"]);
    command.cwd(&cwd);

    let spawned = service
        .open(OpenTakeoverParams {
            run_id: run.id,
            cwd: &cwd,
            command,
            mode: TakeoverModeKind::InteractiveContinuation,
            takeover_path: TakeoverPath::Fresh,
            opening_context: Some("takeover context block".into()),
            operator_id: Some("operator-1".into()),
        })
        .await?;
    assert_eq!(spawned.takeover_path, TakeoverPath::Fresh);
    let opened = spawned.into_opened(run.id);
    assert!(
        opened
            .terminal_ws
            .starts_with(&format!("/api/runs/{}/terminal/", run.id)),
        "{}",
        opened.terminal_ws
    );
    assert_eq!(opened.takeover_path, TakeoverPath::Fresh);

    let events = event_repo.list_by_run(run.id).await?;
    let opened_evt = events
        .iter()
        .find(|e| e.kind == EventKind::TerminalTakeoverOpened)
        .expect("TerminalTakeoverOpened emitted");
    let payload = opened_evt.payload_json.as_ref().expect("payload");
    assert_eq!(payload["takeover_path"], "fresh");
    Ok(())
}
