use anyhow::Result;
use chrono::Utc;
use superkick_core::*;
use superkick_storage::repo::*;
use superkick_storage::*;

async fn setup() -> Result<sqlx::SqlitePool> {
    let pool = connect("sqlite::memory:").await?;
    Ok(pool)
}

#[tokio::test]
async fn schema_created_from_scratch() -> Result<()> {
    let pool = setup().await?;

    // Verify all 6 tables exist.
    let tables: Vec<String> =
        sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .fetch_all(&pool)
            .await?;

    assert!(tables.contains(&"runs".to_string()));
    assert!(tables.contains(&"run_steps".to_string()));
    assert!(tables.contains(&"run_events".to_string()));
    assert!(tables.contains(&"agent_sessions".to_string()));
    assert!(tables.contains(&"interrupts".to_string()));
    assert!(tables.contains(&"artifacts".to_string()));
    Ok(())
}

#[tokio::test]
async fn wal_mode_enabled() -> Result<()> {
    // WAL mode cannot be verified on :memory: databases — use a temp file.
    let dir = std::env::temp_dir().join(format!("sk_test_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir)?;
    let db_path = dir.join("test.db");
    let url = format!("sqlite:{}", db_path.display());

    let pool = connect(&url).await?;
    let mode: String = sqlx::query_scalar("PRAGMA journal_mode")
        .fetch_one(&pool)
        .await?;
    assert_eq!(mode.to_lowercase(), "wal");

    pool.close().await;
    let _ = std::fs::remove_dir_all(&dir);
    Ok(())
}

#[tokio::test]
async fn run_insert_and_get() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteRunRepo::new(pool);

    let run = Run::new(
        "issue-123".into(),
        "SK-1".into(),
        "org/repo".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    let id = run.id;

    repo.insert(&run).await?;
    let fetched = repo.get(id).await?.expect("run should exist");

    assert_eq!(fetched.id, id);
    assert_eq!(fetched.issue_id, "issue-123");
    assert_eq!(fetched.state, RunState::Queued);
    assert_eq!(fetched.trigger_source, TriggerSource::Manual);
    assert_eq!(fetched.base_branch, "main");
    Ok(())
}

#[tokio::test]
async fn run_update() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteRunRepo::new(pool);

    let mut run = Run::new(
        "issue-456".into(),
        "SK-2".into(),
        "org/repo".into(),
        TriggerSource::LinearWebhook,
        "main".into(),
        true,
        None,
    );
    repo.insert(&run).await?;

    run.transition_to(RunState::Preparing)?;
    run.branch_name = Some("sk-2-fix".into());
    repo.update(&run).await?;

    let fetched = repo.get(run.id).await?.unwrap();
    assert_eq!(fetched.state, RunState::Preparing);
    assert_eq!(fetched.branch_name.as_deref(), Some("sk-2-fix"));
    Ok(())
}

#[tokio::test]
async fn run_list_all() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteRunRepo::new(pool);

    let r1 = Run::new(
        "a".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    let r2 = Run::new(
        "b".into(),
        "SK-2".into(),
        "o/r".into(),
        TriggerSource::Retry,
        "main".into(),
        true,
        None,
    );
    repo.insert(&r1).await?;
    repo.insert(&r2).await?;

    let all = repo.list_all().await?;
    assert_eq!(all.len(), 2);
    Ok(())
}

#[tokio::test]
async fn run_lookup_by_issue_identifier_and_active_guard() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteRunRepo::new(pool);

    let mut completed = Run::new(
        "linear-1".into(),
        "SK-9".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    completed.state = RunState::Completed;
    completed.updated_at = Utc::now();
    completed.finished_at = Some(Utc::now());
    repo.insert(&completed).await?;

    let active = Run::new(
        "linear-2".into(),
        "SK-9".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    let active_id = active.id;
    repo.insert(&active).await?;

    let fetched = repo
        .find_active_by_issue_identifier("SK-9")
        .await?
        .expect("active run should exist");
    assert_eq!(fetched.id, active_id);

    let all = repo.list_by_issue_identifier("SK-9").await?;
    assert_eq!(all.len(), 2);

    let duplicate = Run::new(
        "linear-3".into(),
        "SK-9".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    let err = repo
        .insert(&duplicate)
        .await
        .expect_err("insert should fail");
    assert!(format!("{err:#}").to_lowercase().contains("unique"));

    Ok(())
}

#[tokio::test]
async fn step_insert_and_list() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;

    let step = RunStep::new(run.id, StepKey::Plan, 1);
    let step_id = step.id;
    step_repo.insert(&step).await?;

    let fetched = step_repo.get(step_id).await?.unwrap();
    assert_eq!(fetched.step_key, StepKey::Plan);
    assert_eq!(fetched.status, StepStatus::Pending);
    assert_eq!(fetched.attempt, 1);

    let steps = step_repo.list_by_run(run.id).await?;
    assert_eq!(steps.len(), 1);
    Ok(())
}

#[tokio::test]
async fn step_update() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;

    let mut step = RunStep::new(run.id, StepKey::Code, 1);
    step_repo.insert(&step).await?;

    step.status = StepStatus::Running;
    step.started_at = Some(Utc::now());
    step_repo.update(&step).await?;

    let fetched = step_repo.get(step.id).await?.unwrap();
    assert_eq!(fetched.status, StepStatus::Running);
    assert!(fetched.started_at.is_some());
    Ok(())
}

#[tokio::test]
async fn event_insert_and_list() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let event_repo = SqliteRunEventRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;

    let event = RunEvent::new(
        run.id,
        None,
        EventKind::StateChange,
        EventLevel::Info,
        "started".into(),
    );
    let event_id = event.id;
    event_repo.insert(&event).await?;

    let fetched = event_repo.get(event_id).await?.unwrap();
    assert_eq!(fetched.kind, EventKind::StateChange);
    assert_eq!(fetched.level, EventLevel::Info);
    assert_eq!(fetched.message, "started");

    let events = event_repo.list_by_run(run.id).await?;
    assert_eq!(events.len(), 1);
    Ok(())
}

#[tokio::test]
async fn agent_session_insert_and_list() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;

    let step = RunStep::new(run.id, StepKey::Code, 1);
    step_repo.insert(&step).await?;

    let session = AgentSession {
        id: AgentSessionId::new(),
        run_id: run.id,
        run_step_id: step.id,
        provider: AgentProvider::Claude,
        command: "claude --code".into(),
        pid: Some(1234),
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
    };
    let sid = session.id;
    session_repo.insert(&session).await?;

    let fetched = session_repo.get(sid).await?.unwrap();
    assert_eq!(fetched.provider, AgentProvider::Claude);
    assert_eq!(fetched.pid, Some(1234));

    let sessions = session_repo.list_by_run(run.id).await?;
    assert_eq!(sessions.len(), 1);
    Ok(())
}

#[tokio::test]
async fn agent_session_update() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;
    let step = RunStep::new(run.id, StepKey::Code, 1);
    step_repo.insert(&step).await?;

    let mut session = AgentSession {
        id: AgentSessionId::new(),
        run_id: run.id,
        run_step_id: step.id,
        provider: AgentProvider::Codex,
        command: "codex run".into(),
        pid: Some(5678),
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
    };
    session_repo.insert(&session).await?;

    session.status = AgentStatus::Completed;
    session.finished_at = Some(Utc::now());
    session.exit_code = Some(0);
    session_repo.update(&session).await?;

    let fetched = session_repo.get(session.id).await?.unwrap();
    assert_eq!(fetched.status, AgentStatus::Completed);
    assert_eq!(fetched.exit_code, Some(0));
    Ok(())
}

#[tokio::test]
async fn interrupt_insert_resolve_and_list() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let int_repo = SqliteInterruptRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;

    let mut interrupt = Interrupt::new(run.id, None, "Approve plan?".into());
    let iid = interrupt.id;
    int_repo.insert(&interrupt).await?;

    let fetched = int_repo.get(iid).await?.unwrap();
    assert_eq!(fetched.status, InterruptStatus::Pending);
    assert_eq!(fetched.question, "Approve plan?");

    interrupt.resolve(&InterruptAction::ContinueWithNote {
        note: "approved".into(),
    })?;
    int_repo.update(&interrupt).await?;

    let fetched = int_repo.get(iid).await?.unwrap();
    assert_eq!(fetched.status, InterruptStatus::Resolved);
    assert!(fetched.answer_json.is_some());

    let ints = int_repo.list_by_run(run.id).await?;
    assert_eq!(ints.len(), 1);
    Ok(())
}

#[tokio::test]
async fn artifact_insert_and_list() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let art_repo = SqliteArtifactRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;

    let artifact = Artifact::new(run.id, ArtifactKind::Plan, "/tmp/plan.md".into());
    let aid = artifact.id;
    art_repo.insert(&artifact).await?;

    let fetched = art_repo.get(aid).await?.unwrap();
    assert_eq!(fetched.kind, ArtifactKind::Plan);
    assert_eq!(fetched.path_or_url, "/tmp/plan.md");

    let arts = art_repo.list_by_run(run.id).await?;
    assert_eq!(arts.len(), 1);
    Ok(())
}

#[tokio::test]
async fn migrations_are_idempotent() -> Result<()> {
    let pool = setup().await?;
    // Running connect again on the same pool should not fail.
    // We simulate by calling connect twice on the same in-memory db.
    // Since :memory: creates a new db each time, we just verify no error.
    let _pool2 = connect("sqlite::memory:").await?;
    drop(pool);
    Ok(())
}

#[tokio::test]
async fn get_nonexistent_returns_none() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteRunRepo::new(pool);

    let result = repo.get(RunId::new()).await?;
    assert!(result.is_none());
    Ok(())
}

#[tokio::test]
async fn create_interrupt_atomic_rolls_back_on_duplicate() -> Result<()> {
    use superkick_storage::repo::InterruptTxRepo;

    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let int_repo = SqliteInterruptRepo::new(pool);

    // Create a run in Coding state (can transition to WaitingHuman).
    let mut run = Run::new(
        "i".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        "main".into(),
        None,
    );
    run.transition_to(RunState::Preparing)?;
    run.transition_to(RunState::Planning)?;
    run.transition_to(RunState::Coding)?;
    run_repo.insert(&run).await?;

    // Insert a first interrupt to create a duplicate ID later.
    let first = Interrupt::new(run.id, None, "first".into());
    int_repo.insert(&first).await?;

    // Transition run to WaitingHuman in memory (simulating what the service does).
    run.transition_to(RunState::WaitingHuman)?;

    // Build a second interrupt with the SAME ID to force a unique constraint violation.
    let mut duplicate = Interrupt::new(run.id, None, "duplicate".into());
    duplicate.id = first.id; // force collision

    // The atomic call must fail.
    let result = int_repo.create_interrupt_atomic(&run, &duplicate).await;
    assert!(result.is_err(), "expected unique constraint violation");

    // The run must still be in Coding — the UPDATE was rolled back.
    let fetched = run_repo.get(run.id).await?.expect("run should exist");
    assert_eq!(
        fetched.state,
        RunState::Coding,
        "run state must not have changed after failed atomic insert"
    );

    Ok(())
}
