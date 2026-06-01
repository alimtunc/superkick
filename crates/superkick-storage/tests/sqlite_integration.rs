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
    assert!(tables.contains(&"handoffs".to_string()));
    assert!(tables.contains(&"session_ownership_events".to_string()));
    assert!(tables.contains(&"session_lifecycle_events".to_string()));
    assert!(tables.contains(&"issue_blockers".to_string()));
    assert!(tables.contains(&"runtimes".to_string()));
    assert!(tables.contains(&"runtime_providers".to_string()));
    Ok(())
}

#[tokio::test]
async fn runtime_registry_ensure_local_is_idempotent() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteRuntimeRepo::new(pool);

    let first = repo
        .ensure_local(Some("alimtunc-mbp"), Some("darwin"), Some("aarch64"))
        .await?;
    let second = repo
        .ensure_local(Some("alimtunc-mbp"), Some("darwin"), Some("aarch64"))
        .await?;

    assert_eq!(first.id.0, second.id.0, "ensure_local must return same row");
    let all = repo.list_all().await?;
    assert_eq!(all.len(), 1, "exactly one local runtime expected");
    assert_eq!(all[0].host_label.as_deref(), Some("alimtunc-mbp"));
    Ok(())
}

#[tokio::test]
async fn runtime_registry_upsert_provider_replaces_in_place() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteRuntimeRepo::new(pool);

    let runtime = repo
        .ensure_local(None, Some("darwin"), Some("aarch64"))
        .await?;

    let caps_v1 = RuntimeCapabilities {
        supports_pty: true,
        supports_protocol: false,
        supports_resume: true,
        supports_mcp_config: true,
        supports_structured_tools: true,
        supports_usage: true,
    };
    let first = repo
        .upsert_provider(
            runtime.id,
            ProviderUpsert {
                kind: AgentProvider::Claude,
                executable_path: Some("/usr/local/bin/claude"),
                version: Some("1.2.3"),
                status: ProviderStatus::Available,
                capabilities: caps_v1,
                seen_at: Some(Utc::now()),
            },
        )
        .await?;

    // Re-detect with a new version: same row, same id, but updated fields.
    let second = repo
        .upsert_provider(
            runtime.id,
            ProviderUpsert {
                kind: AgentProvider::Claude,
                executable_path: Some("/opt/homebrew/bin/claude"),
                version: Some("1.2.4"),
                status: ProviderStatus::Available,
                capabilities: caps_v1,
                seen_at: Some(Utc::now()),
            },
        )
        .await?;

    assert_eq!(first.id.0, second.id.0, "upsert must reuse provider row");
    assert_eq!(second.version.as_deref(), Some("1.2.4"));
    assert_eq!(
        second.executable_path.as_deref(),
        Some("/opt/homebrew/bin/claude")
    );

    let providers = repo.list_providers(runtime.id).await?;
    assert_eq!(providers.len(), 1);
    Ok(())
}

#[tokio::test]
async fn runtime_registry_marks_provider_unavailable() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteRuntimeRepo::new(pool);

    let runtime = repo.ensure_local(None, None, None).await?;
    let caps = RuntimeCapabilities {
        supports_pty: false,
        supports_protocol: false,
        supports_resume: false,
        supports_mcp_config: false,
        supports_structured_tools: false,
        supports_usage: false,
    };
    let p = repo
        .upsert_provider(
            runtime.id,
            ProviderUpsert {
                kind: AgentProvider::Codex,
                executable_path: None,
                version: None,
                status: ProviderStatus::Unavailable,
                capabilities: caps,
                seen_at: None,
            },
        )
        .await?;
    assert_eq!(p.status, ProviderStatus::Unavailable);
    assert!(p.executable_path.is_none());
    Ok(())
}

#[tokio::test]
async fn issue_blocker_replace_then_list_roundtrips() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteIssueBlockerRepo::new(pool);

    let rows = vec![
        IssueBlocker {
            downstream_issue_id: "down-uuid".into(),
            blocker_issue_id: "blk-1-uuid".into(),
            blocker_identifier: "SUP-77".into(),
            blocker_title: "Launch queue".into(),
            blocker_state_type: "started".into(),
            recorded_at: Utc::now(),
        },
        IssueBlocker {
            downstream_issue_id: "down-uuid".into(),
            blocker_issue_id: "blk-2-uuid".into(),
            blocker_identifier: "SUP-80".into(),
            blocker_title: "Operator dashboard".into(),
            blocker_state_type: "completed".into(),
            recorded_at: Utc::now(),
        },
    ];
    repo.replace_for_downstream("down-uuid", &rows).await?;

    let listed = repo.list_for_downstream("down-uuid").await?;
    assert_eq!(listed.len(), 2);
    let identifiers: Vec<_> = listed
        .iter()
        .map(|b| b.blocker_identifier.as_str())
        .collect();
    assert!(identifiers.contains(&"SUP-77"));
    assert!(identifiers.contains(&"SUP-80"));

    // Re-replace with a smaller set deletes the missing row.
    repo.replace_for_downstream(
        "down-uuid",
        &[IssueBlocker {
            downstream_issue_id: "down-uuid".into(),
            blocker_issue_id: "blk-1-uuid".into(),
            blocker_identifier: "SUP-77".into(),
            blocker_title: "Launch queue".into(),
            blocker_state_type: "completed".into(),
            recorded_at: Utc::now(),
        }],
    )
    .await?;
    let listed = repo.list_for_downstream("down-uuid").await?;
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].blocker_identifier, "SUP-77");
    assert_eq!(listed[0].blocker_state_type, "completed");
    Ok(())
}

#[tokio::test]
async fn issue_blocker_batch_replace_is_atomic_across_downstreams() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteIssueBlockerRepo::new(pool);

    // Seed two downstreams with stale rows.
    repo.replace_for_downstream(
        "down-a",
        &[IssueBlocker {
            downstream_issue_id: "down-a".into(),
            blocker_issue_id: "blk-old".into(),
            blocker_identifier: "SUP-OLD".into(),
            blocker_title: "stale".into(),
            blocker_state_type: "started".into(),
            recorded_at: Utc::now(),
        }],
    )
    .await?;
    repo.replace_for_downstream(
        "down-b",
        &[IssueBlocker {
            downstream_issue_id: "down-b".into(),
            blocker_issue_id: "blk-old".into(),
            blocker_identifier: "SUP-OLD".into(),
            blocker_title: "stale".into(),
            blocker_state_type: "started".into(),
            recorded_at: Utc::now(),
        }],
    )
    .await?;

    // Batch-replace both downstreams in one call.
    let entries = vec![
        (
            "down-a".to_string(),
            vec![IssueBlocker {
                downstream_issue_id: "down-a".into(),
                blocker_issue_id: "blk-new-a".into(),
                blocker_identifier: "SUP-NEWA".into(),
                blocker_title: "fresh a".into(),
                blocker_state_type: "started".into(),
                recorded_at: Utc::now(),
            }],
        ),
        (
            "down-b".to_string(),
            vec![IssueBlocker {
                downstream_issue_id: "down-b".into(),
                blocker_issue_id: "blk-new-b".into(),
                blocker_identifier: "SUP-NEWB".into(),
                blocker_title: "fresh b".into(),
                blocker_state_type: "completed".into(),
                recorded_at: Utc::now(),
            }],
        ),
    ];
    repo.replace_for_downstreams(&entries).await?;

    let a = repo.list_for_downstream("down-a").await?;
    assert_eq!(a.len(), 1);
    assert_eq!(a[0].blocker_identifier, "SUP-NEWA");
    let b = repo.list_for_downstream("down-b").await?;
    assert_eq!(b.len(), 1);
    assert_eq!(b[0].blocker_identifier, "SUP-NEWB");
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
        ExecutionMode::FullAuto,
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
        ExecutionMode::FullAuto,
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
async fn run_update_reports_missing_row() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteRunRepo::new(pool);

    let run = Run::new(
        "issue-missing".into(),
        "SK-MISSING".into(),
        "org/repo".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );

    let err = repo
        .update(&run)
        .await
        .expect_err("updating a missing run must fail");
    assert!(format!("{err:#}").contains("run"));
    assert!(format!("{err:#}").contains("not found"));
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
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    let r2 = Run::new(
        "b".into(),
        "SK-2".into(),
        "o/r".into(),
        TriggerSource::Retry,
        ExecutionMode::FullAuto,
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
        ExecutionMode::FullAuto,
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
        ExecutionMode::FullAuto,
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
        ExecutionMode::FullAuto,
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
        ExecutionMode::FullAuto,
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
        ExecutionMode::FullAuto,
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
async fn step_update_reports_missing_row() -> Result<()> {
    let pool = setup().await?;
    let step_repo = SqliteRunStepRepo::new(pool);
    let step = RunStep::new(RunId::new(), StepKey::Code, 1);

    let err = step_repo
        .update(&step)
        .await
        .expect_err("updating a missing step must fail");
    assert!(format!("{err:#}").contains("run_step"));
    assert!(format!("{err:#}").contains("not found"));
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
        ExecutionMode::FullAuto,
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
        ExecutionMode::FullAuto,
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
        linear_context_mode: None,
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: None,
        purpose: None,
        parent_session_id: None,
        launch_reason: None,
        handoff_id: None,
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
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
async fn agent_session_provider_session_id_round_trips() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
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
        provider: AgentProvider::Codex,
        command: "codex exec --json -".into(),
        pid: None,
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: None,
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: None,
        purpose: None,
        parent_session_id: None,
        launch_reason: None,
        handoff_id: None,
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
    };
    let sid = session.id;
    session_repo.insert(&session).await?;

    // Default state: NULL.
    assert!(session_repo.get_provider_session_id(sid).await?.is_none());

    // First write — typical SessionMeta observation.
    session_repo
        .set_provider_session_id(sid, "019df324-cc9a-7e40-b2de-0bb1e1e701dd")
        .await?;
    assert_eq!(
        session_repo.get_provider_session_id(sid).await?.as_deref(),
        Some("019df324-cc9a-7e40-b2de-0bb1e1e701dd")
    );
    let fetched = session_repo.get(sid).await?.unwrap();
    assert_eq!(
        fetched.provider_session_id.as_deref(),
        Some("019df324-cc9a-7e40-b2de-0bb1e1e701dd")
    );

    // Codex may emit a fresh thread id on resume — overwrite must work.
    session_repo
        .set_provider_session_id(sid, "019df325-fffe-7000-aaaa-bbbbbbbbbbbb")
        .await?;
    assert_eq!(
        session_repo.get_provider_session_id(sid).await?.as_deref(),
        Some("019df325-fffe-7000-aaaa-bbbbbbbbbbbb")
    );

    // Unknown session id → Ok(None) rather than an error.
    assert!(
        session_repo
            .get_provider_session_id(AgentSessionId::new())
            .await?
            .is_none()
    );

    Ok(())
}

#[tokio::test]
async fn agent_session_linear_context_mode_round_trips() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-1".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
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
        pid: Some(42),
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: Some(LinearContextMode::SnapshotPlusMcp),
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: None,
        purpose: None,
        parent_session_id: None,
        launch_reason: None,
        handoff_id: None,
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
    };
    session_repo.insert(&session).await?;

    let fetched = session_repo.get(session.id).await?.expect("session exists");
    assert_eq!(
        fetched.linear_context_mode,
        Some(LinearContextMode::SnapshotPlusMcp)
    );
    Ok(())
}

#[tokio::test]
async fn agent_session_runner_mode_and_billing_profile_round_trip() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-135".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;
    let step = RunStep::new(run.id, StepKey::Plan, 0);
    step_repo.insert(&step).await?;

    let session = AgentSession {
        id: AgentSessionId::new(),
        run_id: run.id,
        run_step_id: step.id,
        provider: AgentProvider::Claude,
        command: "claude".into(),
        pid: None,
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: None,
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: None,
        purpose: None,
        parent_session_id: None,
        launch_reason: None,
        handoff_id: None,
        provider_session_id: None,
        runner_mode: Some(RunnerMode::InteractivePty),
        billing_profile: Some(BillingProfile::Subscription),
    };
    session_repo.insert(&session).await?;

    let fetched = session_repo.get(session.id).await?.expect("session exists");
    assert_eq!(fetched.runner_mode, Some(RunnerMode::InteractivePty));
    assert_eq!(fetched.billing_profile, Some(BillingProfile::Subscription));
    Ok(())
}

#[tokio::test]
async fn agent_session_runner_mode_legacy_null_round_trips() -> Result<()> {
    // Row written before migration 025: only the pre-025 columns are set.
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool.clone());

    let run = Run::new(
        "i".into(),
        "SK-135b".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;
    let step = RunStep::new(run.id, StepKey::Plan, 0);
    step_repo.insert(&step).await?;

    let legacy_id = AgentSessionId::new();
    sqlx::query(
        "INSERT INTO agent_sessions (\
             id, run_id, run_step_id, provider, command, pid, status, started_at\
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(legacy_id.0.to_string())
    .bind(run.id.0.to_string())
    .bind(step.id.0.to_string())
    .bind(AgentProvider::Claude.to_string())
    .bind("claude")
    .bind::<Option<i64>>(None)
    .bind("running")
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await?;

    let fetched = session_repo.get(legacy_id).await?.expect("legacy row");
    assert!(fetched.runner_mode.is_none());
    assert!(fetched.billing_profile.is_none());
    Ok(())
}

// ── SUP-104: agent_sessions tool/MCP policy audit columns ──────────

#[tokio::test]
async fn agent_session_tool_policy_columns_round_trip() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-104".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
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
        pid: Some(42),
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: Some(LinearContextMode::SnapshotPlusMcp),
        mcp_servers_used: vec!["linear".to_string(), "fs".to_string()],
        tools_allow_snapshot: Some(vec!["read".to_string(), "grep".to_string()]),
        tool_approval_required: true,
        tool_results_persisted: false,
        role: Some("planner".into()),
        purpose: Some("plan SUP-104".into()),
        parent_session_id: None,
        launch_reason: None,
        handoff_id: None,
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
    };
    session_repo.insert(&session).await?;

    let fetched = session_repo.get(session.id).await?.expect("session exists");
    assert_eq!(
        fetched.mcp_servers_used,
        vec!["linear".to_string(), "fs".to_string()]
    );
    assert_eq!(
        fetched.tools_allow_snapshot.as_deref(),
        Some(&["read".to_string(), "grep".to_string()][..])
    );
    assert!(fetched.tool_approval_required);
    assert!(!fetched.tool_results_persisted);
    Ok(())
}

#[tokio::test]
async fn agent_session_tool_policy_defaults_when_absent() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SK-104b".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;
    let step = RunStep::new(run.id, StepKey::Plan, 0);
    step_repo.insert(&step).await?;

    let session = AgentSession {
        id: AgentSessionId::new(),
        run_id: run.id,
        run_step_id: step.id,
        provider: AgentProvider::Claude,
        command: "claude".into(),
        pid: None,
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: None,
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: None,
        purpose: None,
        parent_session_id: None,
        launch_reason: None,
        handoff_id: None,
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
    };
    session_repo.insert(&session).await?;

    let fetched = session_repo.get(session.id).await?.unwrap();
    assert!(fetched.mcp_servers_used.is_empty());
    assert!(fetched.tools_allow_snapshot.is_none());
    assert!(!fetched.tool_approval_required);
    assert!(fetched.tool_results_persisted);
    Ok(())
}

#[tokio::test]
async fn agent_session_legacy_row_picks_up_017_defaults() -> Result<()> {
    // Simulate a row written before migration 017: only the pre-017
    // columns are populated, the new columns rely on the `ALTER TABLE
    // ... DEFAULT` clauses. Read back through the domain repo and
    // assert the audit shape matches the historical-behaviour intent
    // (no MCP wiring, no allowlist snapshot, no approval gate, results
    // are persisted).
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool.clone());

    let run = Run::new(
        "i".into(),
        "SK-104c".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;
    let step = RunStep::new(run.id, StepKey::Plan, 0);
    step_repo.insert(&step).await?;

    // Write only the pre-017 columns. The new columns get their DEFAULTs
    // (NULL for the JSON ones, 0/1 for the booleans), exactly as a row
    // migrated from a 016-state database would.
    let legacy_id = AgentSessionId::new();
    sqlx::query(
        "INSERT INTO agent_sessions (\
             id, run_id, run_step_id, provider, command, pid, status, started_at\
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )
    .bind(legacy_id.0.to_string())
    .bind(run.id.0.to_string())
    .bind(step.id.0.to_string())
    .bind(AgentProvider::Claude.to_string())
    .bind("claude --legacy")
    .bind::<Option<i64>>(None)
    .bind("running")
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await?;

    let fetched = session_repo.get(legacy_id).await?.expect("legacy row");
    assert!(
        fetched.mcp_servers_used.is_empty(),
        "NULL mcp_servers_used should map to []"
    );
    assert!(
        fetched.tools_allow_snapshot.is_none(),
        "NULL tools_allow_snapshot should map to None (no restriction)"
    );
    assert!(
        !fetched.tool_approval_required,
        "DEFAULT 0 should map to require_approval = false"
    );
    assert!(
        fetched.tool_results_persisted,
        "DEFAULT 1 should map to persist_results = true"
    );
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
        ExecutionMode::FullAuto,
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
        linear_context_mode: None,
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: None,
        purpose: None,
        parent_session_id: None,
        launch_reason: None,
        handoff_id: None,
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
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
async fn agent_session_update_reports_missing_row() -> Result<()> {
    let pool = setup().await?;
    let session_repo = SqliteAgentSessionRepo::new(pool);
    let session = AgentSession {
        id: AgentSessionId::new(),
        run_id: RunId::new(),
        run_step_id: StepId::new(),
        provider: AgentProvider::Codex,
        command: "codex run".into(),
        pid: None,
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: None,
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: None,
        purpose: None,
        parent_session_id: None,
        launch_reason: None,
        handoff_id: None,
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
    };

    let err = session_repo
        .update(&session)
        .await
        .expect_err("updating a missing agent session must fail");
    assert!(format!("{err:#}").contains("agent_session"));
    assert!(format!("{err:#}").contains("not found"));
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
        ExecutionMode::FullAuto,
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
        ExecutionMode::FullAuto,
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
        "issue-atomicity".into(),
        "SK-99".into(),
        "org/repo".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
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

#[tokio::test]
async fn semi_auto_execution_mode_round_trips() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteRunRepo::new(pool);

    let run = Run::new(
        "issue-semi".into(),
        "SK-10".into(),
        "org/repo".into(),
        TriggerSource::Manual,
        ExecutionMode::SemiAuto,
        "main".into(),
        true,
        None,
    );
    let id = run.id;
    repo.insert(&run).await?;
    let fetched = repo.get(id).await?.expect("run should exist");
    assert_eq!(fetched.execution_mode, ExecutionMode::SemiAuto);
    Ok(())
}

#[tokio::test]
async fn handoff_lifecycle_round_trip() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool.clone());
    let handoff_repo = SqliteHandoffRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SUP-46".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;
    let step = RunStep::new(run.id, StepKey::Plan, 1);
    step_repo.insert(&step).await?;

    let mut handoff = Handoff::new(
        run.id,
        step.id,
        None,
        "planner".into(),
        HandoffPayload::Plan {
            scope_summary: "plan SUP-46".into(),
            constraints: vec!["no PTY chatter".into()],
            reference_artifacts: vec![],
        },
        None,
    )?;
    handoff_repo.insert(&handoff).await?;

    let fetched = handoff_repo.get(handoff.id).await?.expect("handoff exists");
    assert_eq!(fetched.status, HandoffStatus::Pending);
    assert_eq!(fetched.kind, HandoffKind::Plan);
    assert_eq!(fetched.to_role, "planner");

    // Create a real session row first — the handoff's to_session_id has an FK.
    let sess = AgentSession {
        id: AgentSessionId::new(),
        run_id: run.id,
        run_step_id: step.id,
        provider: AgentProvider::Claude,
        command: "claude".into(),
        pid: None,
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: None,
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: Some("planner".into()),
        purpose: Some("plan".into()),
        parent_session_id: None,
        launch_reason: Some(LaunchReason::Handoff),
        handoff_id: Some(handoff.id),
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
    };
    session_repo.insert(&sess).await?;
    let sess_id = sess.id;
    handoff.mark_delivered(sess_id)?;
    handoff.mark_accepted()?;
    handoff.complete(HandoffResult {
        summary: "plan done".into(),
        artifact_ids: vec![],
        git_ref: Some("deadbeef".into()),
        structured: None,
        primary_artifact_kind: None,
    })?;
    handoff_repo.update(&handoff).await?;

    let fetched = handoff_repo.get(handoff.id).await?.unwrap();
    assert_eq!(fetched.status, HandoffStatus::Completed);
    assert_eq!(fetched.to_session_id, Some(sess_id));
    assert_eq!(
        fetched.result.as_ref().unwrap().git_ref.as_deref(),
        Some("deadbeef")
    );

    let listed = handoff_repo.list_by_run(run.id).await?;
    assert_eq!(listed.len(), 1);
    Ok(())
}

#[tokio::test]
async fn agent_session_lineage_round_trips() -> Result<()> {
    let pool = setup().await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool);

    let run = Run::new(
        "i".into(),
        "SUP-46".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;
    let step = RunStep::new(run.id, StepKey::Code, 1);
    step_repo.insert(&step).await?;

    // Insert a parent session first (FK on parent_session_id).
    let parent = AgentSession {
        id: AgentSessionId::new(),
        run_id: run.id,
        run_step_id: step.id,
        provider: AgentProvider::Claude,
        command: "claude".into(),
        pid: None,
        status: AgentStatus::Completed,
        started_at: Utc::now(),
        finished_at: Some(Utc::now()),
        exit_code: Some(0),
        linear_context_mode: None,
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: Some("planner".into()),
        purpose: Some("plan".into()),
        parent_session_id: None,
        launch_reason: Some(LaunchReason::InitialStep),
        handoff_id: None,
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
    };
    session_repo.insert(&parent).await?;
    let parent_id = parent.id;
    let handoff_id = HandoffId::new();
    let session = AgentSession {
        id: AgentSessionId::new(),
        run_id: run.id,
        run_step_id: step.id,
        provider: AgentProvider::Claude,
        command: "claude --code".into(),
        pid: Some(9),
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: Some(LinearContextMode::Snapshot),
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: Some("coder".into()),
        purpose: Some("implement SUP-46".into()),
        parent_session_id: Some(parent_id),
        launch_reason: Some(LaunchReason::Handoff),
        handoff_id: Some(handoff_id),
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
    };
    session_repo.insert(&session).await?;

    let fetched = session_repo.get(session.id).await?.unwrap();
    assert_eq!(fetched.role.as_deref(), Some("coder"));
    assert_eq!(fetched.parent_session_id, Some(parent_id));
    assert_eq!(fetched.launch_reason, Some(LaunchReason::Handoff));
    assert_eq!(fetched.handoff_id, Some(handoff_id));
    Ok(())
}

// ── SUP-48: session ownership ─────────────────────────────────────────────

async fn seed_session_for_ownership(pool: sqlx::SqlitePool) -> Result<AgentSessionId> {
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool);
    let run = Run::new(
        "i".into(),
        "SUP-48".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
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
        command: "claude".into(),
        pid: None,
        status: AgentStatus::Running,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: None,
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: Some("coder".into()),
        purpose: Some("x".into()),
        parent_session_id: None,
        launch_reason: Some(LaunchReason::InitialStep),
        handoff_id: None,
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
    };
    session_repo.insert(&session).await?;
    Ok(session.id)
}

#[tokio::test]
async fn ownership_defaults_to_orchestrator() -> Result<()> {
    let pool = setup().await?;
    let session_id = seed_session_for_ownership(pool.clone()).await?;
    let repo = SqliteSessionOwnershipRepo::new(pool);

    let snap = repo.current(session_id).await?.expect("snapshot");
    assert!(matches!(snap.owner, OrchestrationOwner::Orchestrator));
    assert!(snap.since.is_none());
    Ok(())
}

#[tokio::test]
async fn ownership_takeover_persists_snapshot_and_audit_row() -> Result<()> {
    let pool = setup().await?;
    let session_id = seed_session_for_ownership(pool.clone()).await?;
    let repo = SqliteSessionOwnershipRepo::new(pool.clone());

    let before = repo.current(session_id).await?.expect("snapshot");
    let event = OwnershipEvent::new(
        before.run_id,
        session_id,
        Some(OrchestrationOwner::Orchestrator),
        OrchestrationOwner::Operator {
            operator_id: OperatorId("alice@example.com".into()),
            note: Some("debugging".into()),
        },
        OwnershipTransitionReason::OperatorTakeover,
        Some(OperatorId("alice@example.com".into())),
    );
    repo.apply(&event, Utc::now()).await?;

    let after = repo.current(session_id).await?.expect("snapshot");
    match after.owner {
        OrchestrationOwner::Operator { operator_id, note } => {
            assert_eq!(operator_id.0, "alice@example.com");
            assert_eq!(note.as_deref(), Some("debugging"));
        }
        other => panic!("expected operator, got {:?}", other),
    }
    assert!(after.since.is_some());

    let audit = repo.list_by_session(session_id).await?;
    assert_eq!(audit.len(), 1);
    assert_eq!(audit[0].reason, OwnershipTransitionReason::OperatorTakeover);
    Ok(())
}

#[tokio::test]
async fn ownership_suspend_reason_round_trips() -> Result<()> {
    let pool = setup().await?;
    let session_id = seed_session_for_ownership(pool.clone()).await?;
    let repo = SqliteSessionOwnershipRepo::new(pool.clone());

    let snap = repo.current(session_id).await?.expect("snapshot");
    let attention_id = AttentionRequestId::new();
    let event = OwnershipEvent::new(
        snap.run_id,
        session_id,
        Some(OrchestrationOwner::Orchestrator),
        OrchestrationOwner::Suspended {
            reason: SuspendReason::AttentionRequested { attention_id },
        },
        OwnershipTransitionReason::AttentionRaised,
        None,
    );
    repo.apply(&event, Utc::now()).await?;

    let loaded = repo.current(session_id).await?.expect("snapshot");
    match loaded.owner {
        OrchestrationOwner::Suspended {
            reason: SuspendReason::AttentionRequested { attention_id: id },
        } => assert_eq!(id, attention_id),
        other => panic!("expected suspended, got {:?}", other),
    }
    Ok(())
}

// --- SUP-79: session lifecycle events -------------------------------------

async fn seed_session(pool: &sqlx::SqlitePool) -> Result<AgentSession> {
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let session_repo = SqliteAgentSessionRepo::new(pool.clone());

    let run = Run::new(
        "i".into(),
        "SK-79".into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await?;
    let step = RunStep::new(run.id, StepKey::Code, 1);
    step_repo.insert(&step).await?;
    let sess = AgentSession {
        id: AgentSessionId::new(),
        run_id: run.id,
        run_step_id: step.id,
        provider: AgentProvider::Claude,
        command: "claude".into(),
        pid: None,
        status: AgentStatus::Starting,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: None,
        mcp_servers_used: Vec::new(),
        tools_allow_snapshot: None,
        tool_approval_required: false,
        tool_results_persisted: true,
        role: Some("planner".into()),
        purpose: Some("plan".into()),
        parent_session_id: None,
        launch_reason: Some(LaunchReason::InitialStep),
        handoff_id: None,
        provider_session_id: None,
        runner_mode: None,
        billing_profile: None,
    };
    session_repo.insert(&sess).await?;
    Ok(sess)
}

#[tokio::test]
async fn session_lifecycle_events_round_trip() -> Result<()> {
    let pool = setup().await?;
    let sess = seed_session(&pool).await?;
    let repo = SqliteSessionLifecycleRepo::new(pool.clone());

    let spawned = SessionLifecycleEvent::new(
        sess.id,
        sess.run_id,
        sess.run_step_id,
        sess.role.clone(),
        None,
        sess.launch_reason,
        None,
        SessionLifecyclePhase::Spawning,
    );
    let running = SessionLifecycleEvent::new(
        sess.id,
        sess.run_id,
        sess.run_step_id,
        sess.role.clone(),
        None,
        sess.launch_reason,
        None,
        SessionLifecyclePhase::Running,
    );
    let failed = SessionLifecycleEvent::new(
        sess.id,
        sess.run_id,
        sess.run_step_id,
        sess.role.clone(),
        None,
        sess.launch_reason,
        None,
        SessionLifecyclePhase::Failed {
            exit_code: Some(7),
            reason: "exit 7".into(),
        },
    );
    repo.insert(&spawned).await?;
    repo.insert(&running).await?;
    repo.insert(&failed).await?;

    let by_session: Vec<SessionLifecycleEvent> =
        SessionLifecycleRepo::list_by_session(&repo, sess.id).await?;
    assert_eq!(by_session.len(), 3);
    match &by_session[2].phase {
        SessionLifecyclePhase::Failed { exit_code, reason } => {
            assert_eq!(exit_code.as_ref(), Some(&7i32));
            assert_eq!(reason, "exit 7");
        }
        other => panic!("unexpected terminal phase: {other:?}"),
    }

    let by_run: Vec<SessionLifecycleEvent> =
        SessionLifecycleRepo::list_by_run(&repo, sess.run_id).await?;
    assert_eq!(by_run.len(), 3);
    Ok(())
}

#[tokio::test]
async fn session_lifecycle_phase_tag_is_indexable() -> Result<()> {
    let pool = setup().await?;
    let sess = seed_session(&pool).await?;
    let repo = SqliteSessionLifecycleRepo::new(pool.clone());
    repo.insert(&SessionLifecycleEvent::new(
        sess.id,
        sess.run_id,
        sess.run_step_id,
        sess.role.clone(),
        None,
        sess.launch_reason,
        None,
        SessionLifecyclePhase::Completed { exit_code: 0 },
    ))
    .await?;

    let tag: String =
        sqlx::query_scalar("SELECT phase_tag FROM session_lifecycle_events WHERE session_id = ?1")
            .bind(sess.id.0.to_string())
            .fetch_one(&pool)
            .await?;
    assert_eq!(tag, "completed");
    Ok(())
}

// ── SUP-102: orchestrator session + checkpoint persistence ────────────────

fn make_orchestrator_session() -> OrchestratorSession {
    OrchestratorSession::new(
        "drive SUP-95 epic",
        AgentProvider::Claude,
        Some(RuntimeProviderId::new()),
        OperatorId("alice".into()),
        OrchestratorScope {
            linear_issue_ids: vec!["SUP-95".into(), "SUP-102".into()],
            project_id: Some("proj-1".into()),
            parent_feature_issue: Some("SUP-1".into()),
            labels: vec!["epic".into()],
        },
    )
    .expect("session ctor")
}

#[tokio::test]
async fn orchestrator_session_round_trip() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteOrchestratorSessionRepo::new(pool);

    let session = make_orchestrator_session();
    repo.insert(&session).await?;

    let fetched = repo.get(session.id).await?.expect("session round-trips");
    assert_eq!(fetched.title, session.title);
    assert_eq!(fetched.provider, session.provider);
    assert_eq!(fetched.runtime_provider_id, session.runtime_provider_id);
    assert_eq!(fetched.status, OrchestratorStatus::Idle);
    assert_eq!(fetched.owner, session.owner);
    assert_eq!(
        fetched.scope.linear_issue_ids,
        vec!["SUP-95".to_string(), "SUP-102".to_string()]
    );
    assert_eq!(fetched.scope.project_id.as_deref(), Some("proj-1"));
    assert_eq!(fetched.scope.parent_feature_issue.as_deref(), Some("SUP-1"));
    assert_eq!(fetched.scope.labels, vec!["epic".to_string()]);
    assert!(fetched.latest_checkpoint_id.is_none());
    Ok(())
}

#[tokio::test]
async fn orchestrator_session_status_filter_returns_only_matching_rows() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteOrchestratorSessionRepo::new(pool);

    let mut idle = make_orchestrator_session();
    let mut blocked = make_orchestrator_session();
    blocked
        .transition_to(OrchestratorStatus::Thinking)
        .expect("idle -> thinking");
    blocked
        .transition_to(OrchestratorStatus::Blocked)
        .expect("thinking -> blocked");

    repo.insert(&idle).await?;
    repo.insert(&blocked).await?;

    let idles = repo.list_by_status(OrchestratorStatus::Idle).await?;
    assert_eq!(idles.len(), 1);
    assert_eq!(idles[0].id, idle.id);

    let blockeds = repo.list_by_status(OrchestratorStatus::Blocked).await?;
    assert_eq!(blockeds.len(), 1);
    assert_eq!(blockeds[0].id, blocked.id);

    // Update the idle session's status via `update` and re-filter.
    idle.transition_to(OrchestratorStatus::Thinking)
        .expect("idle -> thinking");
    repo.update(&idle).await?;
    let idles_now = repo.list_by_status(OrchestratorStatus::Idle).await?;
    assert!(idles_now.is_empty(), "session left Idle");
    Ok(())
}

#[tokio::test]
async fn orchestrator_session_list_by_issue_identifier_scans_scope_json() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteOrchestratorSessionRepo::new(pool);

    let s_a = make_orchestrator_session();
    let mut s_b = OrchestratorSession::new(
        "session B",
        AgentProvider::Codex,
        None,
        OperatorId("bob".into()),
        OrchestratorScope {
            linear_issue_ids: vec!["SUP-300".into()],
            ..OrchestratorScope::default()
        },
    )
    .expect("ctor");
    s_b.transition_to(OrchestratorStatus::Thinking).unwrap();

    repo.insert(&s_a).await?;
    repo.insert(&s_b).await?;

    let by_a = repo.list_by_issue_identifier("SUP-95").await?;
    assert_eq!(by_a.len(), 1);
    assert_eq!(by_a[0].id, s_a.id);

    let by_b = repo.list_by_issue_identifier("SUP-300").await?;
    assert_eq!(by_b.len(), 1);
    assert_eq!(by_b[0].id, s_b.id);

    let by_unknown = repo.list_by_issue_identifier("SUP-999").await?;
    assert!(by_unknown.is_empty());
    Ok(())
}

#[tokio::test]
async fn orchestrator_checkpoint_atomic_with_session() -> Result<()> {
    // Insert a checkpoint and verify the session pointer + cursor advance in
    // the same transaction. This is the SUP-102 atomicity invariant — without
    // it, a crash between the two writes leaves the session pointing at a
    // checkpoint that doesn't exist.
    let pool = setup().await?;
    let repo = SqliteOrchestratorSessionRepo::new(pool);

    let session = make_orchestrator_session();
    repo.insert(&session).await?;

    let cursor = EventId::new();
    let checkpoint = OrchestratorCheckpoint::new(
        session.id,
        "first compaction summary",
        None,
        Some(cursor),
        vec!["picked claude provider".into()],
        vec!["mcp policy?".into()],
        vec![RunId::new()],
        vec![HandoffId::new()],
    )
    .expect("checkpoint ctor");

    repo.insert_checkpoint(&checkpoint).await?;

    let reloaded = repo.get(session.id).await?.expect("session still there");
    assert_eq!(reloaded.latest_checkpoint_id, Some(checkpoint.id));
    assert_eq!(reloaded.last_event_cursor, Some(cursor));

    let latest = repo
        .latest_checkpoint(session.id)
        .await?
        .expect("checkpoint persisted");
    assert_eq!(latest.id, checkpoint.id);
    assert_eq!(latest.summary, "first compaction summary");
    assert_eq!(latest.decisions, vec!["picked claude provider".to_string()]);
    Ok(())
}

#[tokio::test]
async fn orchestrator_checkpoint_for_unknown_session_rejected() -> Result<()> {
    // The FK on `orchestrator_checkpoints.session_id` rejects the INSERT
    // before we even reach the session pointer update — that's the expected
    // protection. The transaction is rolled back so no checkpoint row leaks.
    let pool = setup().await?;
    let repo = SqliteOrchestratorSessionRepo::new(pool.clone());

    let unknown_session = OrchestratorSessionId::new();
    let checkpoint = OrchestratorCheckpoint::new(
        unknown_session,
        "summary",
        None,
        None,
        vec![],
        vec![],
        vec![],
        vec![],
    )
    .expect("checkpoint ctor");

    let err = repo.insert_checkpoint(&checkpoint).await.unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("FOREIGN KEY") || msg.contains("orchestrator_session"),
        "error indicates the missing session, got: {msg}"
    );

    // Rollback invariant: no checkpoint row exists for the unknown session.
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orchestrator_checkpoints")
        .fetch_one(&pool)
        .await?;
    assert_eq!(count, 0, "checkpoint insert must be rolled back");
    Ok(())
}

#[tokio::test]
async fn orchestrator_session_set_provider_session_id_persists() -> Result<()> {
    let pool = setup().await?;
    let repo = SqliteOrchestratorSessionRepo::new(pool);

    let session = make_orchestrator_session();
    repo.insert(&session).await?;
    assert!(session.provider_session_id.is_none());

    repo.set_provider_session_id(session.id, "claude-thread-xyz")
        .await?;

    let reloaded = repo.get(session.id).await?.expect("session still there");
    assert_eq!(
        reloaded.provider_session_id.as_deref(),
        Some("claude-thread-xyz")
    );
    Ok(())
}

#[tokio::test]
async fn turn_first_user_text_returns_first_seq() -> Result<()> {
    // SUP-107: the sidebar derives the conversation title from the
    // operator's opening prompt. Verify the storage layer returns the
    // earliest turn's user_text and None when no turns exist yet.
    let pool = setup().await?;
    let conv_repo = SqliteConversationRepo::new(pool.clone());
    let turn_repo = SqliteTurnRepo::new(pool);

    let subject = ConversationSubject::Issue {
        identifier: "SUP-107".into(),
    };
    let conv = conv_repo
        .create(&subject, "default", AgentProvider::Claude, Utc::now())
        .await?;

    assert!(
        turn_repo.first_user_text(conv.id).await?.is_none(),
        "no turns yet → None"
    );

    turn_repo
        .create_pending(conv.id, "first message", Utc::now())
        .await?;
    turn_repo
        .create_pending(conv.id, "second message", Utc::now())
        .await?;

    assert_eq!(
        turn_repo.first_user_text(conv.id).await?.as_deref(),
        Some("first message"),
        "earliest seq wins"
    );
    Ok(())
}

#[tokio::test]
async fn conversation_create_allows_multiple_per_subject_agent() -> Result<()> {
    // SUP-107: dropping the (subject, agent_id) unique indexes lets the
    // multi-conversation sidebar host more than one chat per subject. Two
    // back-to-back creates with identical subject/agent must persist as
    // distinct rows that both surface through `list_by_subject` in
    // created_at order — pinning the order here so a future change to the
    // sort cannot silently regress the sidebar.
    let pool = setup().await?;
    let repo = SqliteConversationRepo::new(pool);

    let subject = ConversationSubject::Issue {
        identifier: "SUP-107".into(),
    };
    let first_now = Utc::now();
    let second_now = first_now + chrono::Duration::seconds(1);

    let first = repo
        .create(&subject, "planner", AgentProvider::Claude, first_now)
        .await?;
    let second = repo
        .create(&subject, "planner", AgentProvider::Claude, second_now)
        .await?;

    assert_ne!(first.id, second.id, "each create must mint a fresh id");

    let listed = repo.list_by_subject(&subject).await?;
    assert_eq!(listed.len(), 2);
    assert_eq!(
        listed[0].id, first.id,
        "ORDER BY created_at ASC: oldest first"
    );
    assert_eq!(listed[1].id, second.id);
    Ok(())
}

#[tokio::test]
async fn conversation_list_by_subject_with_first_text_collapses_n_plus_one() -> Result<()> {
    // SUP-107: the sidebar derives titles from the first turn's user_text.
    // The repo exposes a single-query variant so the API does not issue
    // M+1 round-trips. Verify it returns the same set as `list_by_subject`
    // and pairs each conversation with its earliest turn (or None when no
    // turn has landed yet).
    let pool = setup().await?;
    let conv_repo = SqliteConversationRepo::new(pool.clone());
    let turn_repo = SqliteTurnRepo::new(pool);

    let subject = ConversationSubject::Issue {
        identifier: "SUP-107".into(),
    };
    let first_now = Utc::now();
    let second_now = first_now + chrono::Duration::seconds(1);

    let with_turn = conv_repo
        .create(&subject, "planner", AgentProvider::Claude, first_now)
        .await?;
    let empty = conv_repo
        .create(&subject, "planner", AgentProvider::Claude, second_now)
        .await?;

    turn_repo
        .create_pending(with_turn.id, "first message", first_now)
        .await?;
    turn_repo
        .create_pending(with_turn.id, "second message", second_now)
        .await?;

    let listed = conv_repo.list_by_subject_with_first_text(&subject).await?;
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].0.id, with_turn.id);
    assert_eq!(listed[0].1.as_deref(), Some("first message"));
    assert_eq!(listed[1].0.id, empty.id);
    assert!(listed[1].1.is_none(), "no turns yet → None");
    Ok(())
}
