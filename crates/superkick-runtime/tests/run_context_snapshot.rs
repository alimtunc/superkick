//! SUP-187 — integration tests for `build_run_context_snapshot`.
//!
//! Hits a real in-memory SQLite per CLAUDE.md rule 9 — the launch-task, run,
//! session, event, and workspace repos are never mocked. Covers the acceptance
//! criteria: versioning, redaction, explicit missing data, completed-step
//! summaries, linked issue/task/run, the provider resume key, and a blocking
//! reason for each terminal/blocked run state.

use anyhow::Result;
use chrono::Utc;
use superkick_core::{
    AgentProvider, AgentSession, AgentSessionId, AgentStatus, BlockingKind, EventKind, EventLevel,
    ExecutionMode, FailureClassification, IssueWorkspaceContext, IssueWorkspaceContextSnapshot,
    LaunchTask, LaunchTaskId, LaunchTaskStepStatus, PlanImplementReviewAgents,
    RUN_CONTEXT_SNAPSHOT_VERSION, Run, RunEvent, RunState, RunStep, RunnerMode, StepKey,
    StepResult, StepResultStatus, TriggerSource,
};
use superkick_runtime::test_support::catalog;
use superkick_runtime::{SnapshotError, build_run_context_snapshot};
use superkick_storage::repo::{
    AgentSessionRepo, IssueWorkspaceContextRepo, LaunchTaskRepo, RunEventRepo, RunRepo, RunStepRepo,
};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteIssueWorkspaceContextRepo, SqliteLaunchTaskRepo,
    SqliteRunEventRepo, SqliteRunRepo, SqliteRunStepRepo, connect,
};

const GITHUB_PAT: &str = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ISSUE_UUID: &str = "issue-uuid-187";

struct Repos {
    launch: SqliteLaunchTaskRepo,
    runs: SqliteRunRepo,
    steps: SqliteRunStepRepo,
    sessions: SqliteAgentSessionRepo,
    events: SqliteRunEventRepo,
    workspaces: SqliteIssueWorkspaceContextRepo,
}

async fn setup() -> Result<Repos> {
    let pool = connect("sqlite::memory:").await?;
    Ok(Repos {
        launch: SqliteLaunchTaskRepo::new(pool.clone()),
        runs: SqliteRunRepo::new(pool.clone()),
        steps: SqliteRunStepRepo::new(pool.clone()),
        sessions: SqliteAgentSessionRepo::new(pool.clone()),
        events: SqliteRunEventRepo::new(pool.clone()),
        workspaces: SqliteIssueWorkspaceContextRepo::new(pool),
    })
}

fn agents() -> PlanImplementReviewAgents {
    PlanImplementReviewAgents {
        planner: "planner".into(),
        coder: "coder".into(),
        reviewer: "reviewer".into(),
    }
}

async fn seed_task(repos: &Repos) -> Result<(LaunchTask, Vec<superkick_core::LaunchTaskStep>)> {
    let (task, steps) = LaunchTask::new_with_v1_recipe(ISSUE_UUID, agents(), &catalog())?;
    repos.launch.insert_with_steps(&task, &steps).await?;
    Ok((task, steps))
}

async fn seed_run(repos: &Repos) -> Result<Run> {
    let mut run = Run::new(
        ISSUE_UUID.into(),
        "SUP-187".into(),
        "owner/repo".into(),
        TriggerSource::LaunchTask,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run.worktree_path = Some("/tmp/wt/sup-187".into());
    run.branch_name = Some("alimtunc/sup-187".into());
    repos.runs.insert(&run).await?;
    Ok(run)
}

async fn seed_workspace(repos: &Repos, body: &str) -> Result<()> {
    let (ctx, excerpts, links) = IssueWorkspaceContext::new(
        IssueWorkspaceContextSnapshot {
            linear_team_key: "SUP".into(),
            linear_issue_identifier: "SUP-187".into(),
            linear_issue_id: ISSUE_UUID.into(),
            snapshot_title: "RunContextSnapshot v0".into(),
            snapshot_body_md: body.into(),
            snapshot_status_name: "In Progress".into(),
        },
        vec![],
        vec![],
    )?;
    repos
        .workspaces
        .insert_with_children(&ctx, &excerpts, &links)
        .await?;
    Ok(())
}

async fn build(repos: &Repos, task_id: LaunchTaskId) -> Result<superkick_core::RunContextSnapshot> {
    Ok(build_run_context_snapshot(
        &repos.launch,
        &repos.runs,
        &repos.sessions,
        &repos.events,
        &repos.workspaces,
        task_id,
        Utc::now(),
    )
    .await?)
}

#[tokio::test]
async fn unknown_launch_task_is_not_found() -> Result<()> {
    let repos = setup().await?;
    let err = build_run_context_snapshot(
        &repos.launch,
        &repos.runs,
        &repos.sessions,
        &repos.events,
        &repos.workspaces,
        LaunchTaskId::new(),
        Utc::now(),
    )
    .await
    .expect_err("missing task must error");
    assert!(
        matches!(err, SnapshotError::LaunchTaskNotFound(_)),
        "got {err:?}"
    );
    Ok(())
}

#[tokio::test]
async fn builds_for_active_run_with_linked_issue_task_run() -> Result<()> {
    let repos = setup().await?;
    let (task, steps) = seed_task(&repos).await?;
    let run = seed_run(&repos).await?;
    seed_workspace(&repos, "Derive a projection for retry and takeover.").await?;

    // Link the shadow run to the first step and mark the second step current.
    repos
        .launch
        .add_step_links(steps[0].id, Some(run.id), None, None)
        .await?;
    repos
        .launch
        .set_current_step(task.id, Some(steps[1].id))
        .await?;

    let snap = build(&repos, task.id).await?;

    assert_eq!(snap.version, RUN_CONTEXT_SNAPSHOT_VERSION);
    assert_eq!(snap.launch_task_id, task.id);
    assert_eq!(snap.run_id, Some(run.id));
    // Linked issue (from workspace context).
    assert_eq!(snap.issue.linear_issue_id, ISSUE_UUID);
    assert_eq!(snap.issue.identifier.as_deref(), Some("SUP-187"));
    assert_eq!(snap.issue.title.as_deref(), Some("RunContextSnapshot v0"));
    // Linked task (recipe + 3 steps).
    assert_eq!(snap.steps.len(), 3);
    assert_eq!(snap.current_step.as_ref().map(|c| c.sequence), Some(2));
    // Linked run (state + worktree/branches).
    let run_proj = snap.run.expect("run projection");
    assert_eq!(run_proj.trigger_source, TriggerSource::LaunchTask);
    let worktree = snap.worktree.expect("worktree");
    assert_eq!(worktree.base_branch, "main");
    assert_eq!(worktree.run_branch.as_deref(), Some("alimtunc/sup-187"));
    let diff = snap.diff_ref.expect("diff ref");
    assert_eq!(diff.run_id, run.id);
    assert!(diff.worktree_recorded);
    Ok(())
}

#[tokio::test]
async fn completed_step_summaries_and_changed_files_are_projected() -> Result<()> {
    let repos = setup().await?;
    let (task, steps) = seed_task(&repos).await?;

    let plan = steps[0].id;
    repos
        .launch
        .update_step_status(plan, LaunchTaskStepStatus::Running)
        .await?;
    repos
        .launch
        .update_step_status(plan, LaunchTaskStepStatus::Completed)
        .await?;
    repos
        .launch
        .set_step_summary(plan, Some("planned the work".into()))
        .await?;
    repos
        .launch
        .set_step_structured_result(
            plan,
            Some(StepResult {
                status: StepResultStatus::Completed,
                summary: "planned the work".into(),
                changed_files: vec!["docs/plan.md".into(), "docs/plan.md".into()],
                questions: vec![],
            }),
        )
        .await?;

    let snap = build(&repos, task.id).await?;

    let plan_step = snap
        .steps
        .iter()
        .find(|s| s.sequence == 1)
        .expect("plan step");
    assert_eq!(plan_step.status, LaunchTaskStepStatus::Completed);
    assert_eq!(plan_step.summary.as_deref(), Some("planned the work"));
    assert_eq!(plan_step.result_status, Some(StepResultStatus::Completed));
    // Changed files aggregate + dedup, never the diff itself.
    assert_eq!(snap.changed_files.paths, vec!["docs/plan.md".to_string()]);
    assert!(!snap.changed_files.truncated);
    Ok(())
}

#[tokio::test]
async fn missing_data_is_explicit_not_fabricated() -> Result<()> {
    let repos = setup().await?;
    let (task, _steps) = seed_task(&repos).await?;
    // No run linked, no workspace context, no sessions, no events.

    let snap = build(&repos, task.id).await?;

    assert_eq!(snap.run_id, None);
    assert!(snap.run.is_none());
    assert!(snap.worktree.is_none());
    assert!(snap.diff_ref.is_none());
    assert!(snap.current_step.is_none());
    assert!(snap.memory.is_none());
    assert!(snap.blocking.is_none());
    assert!(snap.recent_events.is_empty());
    assert!(snap.changed_files.paths.is_empty());
    // Issue facts absent (no workspace) — explicit None, not invented.
    assert_eq!(snap.issue.linear_issue_id, ISSUE_UUID);
    assert!(snap.issue.identifier.is_none());
    assert!(snap.issue.title.is_none());
    // Provider session id absent.
    assert!(snap.provider.provider_session_id.is_none());
    // Provider/agent/model still come from the snapshotted step definitions.
    assert_eq!(snap.provider.agent.as_deref(), Some("planner"));
    Ok(())
}

#[tokio::test]
async fn secrets_are_redacted_in_summaries_events_and_body() -> Result<()> {
    let repos = setup().await?;
    let (task, steps) = seed_task(&repos).await?;
    let run = seed_run(&repos).await?;
    seed_workspace(&repos, &format!("Body leaks {GITHUB_PAT} oops")).await?;
    repos
        .launch
        .add_step_links(steps[0].id, Some(run.id), None, None)
        .await?;

    let plan = steps[0].id;
    repos
        .launch
        .update_step_status(plan, LaunchTaskStepStatus::Running)
        .await?;
    repos
        .launch
        .update_step_status(plan, LaunchTaskStepStatus::Completed)
        .await?;
    repos
        .launch
        .set_step_summary(plan, Some(format!("did it with {GITHUB_PAT}")))
        .await?;

    let mut event = RunEvent::new(
        run.id,
        None,
        EventKind::AgentOutput,
        EventLevel::Info,
        format!("ran with token {GITHUB_PAT}"),
    );
    event.payload_json = None;
    repos.events.insert(&event).await?;

    let snap = build(&repos, task.id).await?;

    let body = snap.issue.body_excerpt.expect("body excerpt");
    assert!(
        !body.contains(GITHUB_PAT),
        "issue body leaked secret: {body}"
    );
    assert!(body.contains("[redacted:github_pat]"));

    let plan_step = snap.steps.iter().find(|s| s.sequence == 1).unwrap();
    let summary = plan_step.summary.as_deref().unwrap();
    assert!(
        !summary.contains(GITHUB_PAT),
        "step summary leaked: {summary}"
    );

    let msg = &snap.recent_events.last().expect("event").message;
    assert!(!msg.contains(GITHUB_PAT), "event leaked: {msg}");
    assert!(msg.contains("[redacted:github_pat]"));
    Ok(())
}

#[tokio::test]
async fn provider_resume_key_is_surfaced() -> Result<()> {
    let repos = setup().await?;
    let (task, steps) = seed_task(&repos).await?;
    let run = seed_run(&repos).await?;
    repos
        .launch
        .add_step_links(steps[0].id, Some(run.id), None, None)
        .await?;

    let run_step = RunStep::new(run.id, StepKey::Code, 1);
    repos.steps.insert(&run_step).await?;
    let session = AgentSession {
        id: AgentSessionId::new(),
        run_id: run.id,
        run_step_id: run_step.id,
        provider: AgentProvider::Codex,
        command: "codex exec --json".into(),
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
    repos.sessions.insert(&session).await?;
    repos
        .sessions
        .set_provider_session_id(session.id, "codex-thread-abc")
        .await?;

    let snap = build(&repos, task.id).await?;
    assert_eq!(
        snap.provider.provider_session_id.as_deref(),
        Some("codex-thread-abc"),
    );
    Ok(())
}

#[tokio::test]
async fn background_session_id_is_excluded_from_resume_key() -> Result<()> {
    // The `claude --bg` id is persisted in `provider_session_id` as the control
    // handle for logs/stop/attach — but it is NOT a `claude --resume` key.
    // Surfacing it would make takeover spawn an invalid `claude --resume <bg-id>`,
    // so the snapshot must exclude `BackgroundSession` rows (falls back to Fresh).
    let repos = setup().await?;
    let (task, steps) = seed_task(&repos).await?;
    let run = seed_run(&repos).await?;
    repos
        .launch
        .add_step_links(steps[0].id, Some(run.id), None, None)
        .await?;

    let run_step = RunStep::new(run.id, StepKey::Code, 1);
    repos.steps.insert(&run_step).await?;
    let session = AgentSession {
        id: AgentSessionId::new(),
        run_id: run.id,
        run_step_id: run_step.id,
        provider: AgentProvider::Claude,
        command: "claude --bg --name superkick-x".into(),
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
        runner_mode: Some(RunnerMode::BackgroundSession),
        billing_profile: None,
    };
    repos.sessions.insert(&session).await?;
    repos
        .sessions
        .set_provider_session_id(session.id, "6106fcf5")
        .await?;

    let snap = build(&repos, task.id).await?;
    assert!(
        snap.provider.provider_session_id.is_none(),
        "background control-handle id must not surface as a claude --resume key"
    );
    Ok(())
}

#[tokio::test]
async fn blocking_reason_for_waiting_human_run() -> Result<()> {
    let repos = setup().await?;
    let (task, steps) = seed_task(&repos).await?;
    let mut run = seed_run(&repos).await?;
    repos
        .launch
        .add_step_links(steps[0].id, Some(run.id), None, None)
        .await?;

    run.state = RunState::WaitingHuman;
    run.mark_paused(
        superkick_core::PauseKind::Approval,
        "awaiting operator approval",
    );
    repos.runs.update(&run).await?;

    let snap = build(&repos, task.id).await?;
    let blocking = snap.blocking.expect("blocking reason");
    assert_eq!(blocking.kind, BlockingKind::RunWaitingHuman);
    assert!(
        blocking.reason.contains("approval"),
        "reason: {}",
        blocking.reason
    );
    // Pending decisions also surface the pause + waiting-human.
    assert!(!snap.pending_decisions.is_empty());
    Ok(())
}

#[tokio::test]
async fn blocking_reason_for_failed_run() -> Result<()> {
    let repos = setup().await?;
    let (task, steps) = seed_task(&repos).await?;
    let mut run = seed_run(&repos).await?;
    repos
        .launch
        .add_step_links(steps[0].id, Some(run.id), None, None)
        .await?;

    run.state = RunState::Failed;
    run.error_message = Some("compilation failed".into());
    run.finished_at = Some(Utc::now());
    repos.runs.update(&run).await?;

    let snap = build(&repos, task.id).await?;
    let blocking = snap.blocking.expect("blocking reason");
    assert_eq!(blocking.kind, BlockingKind::RunFailed);
    assert!(blocking.reason.contains("compilation failed"));
    assert_eq!(snap.run.unwrap().state, RunState::Failed);
    Ok(())
}

#[tokio::test]
async fn blocking_reason_for_cancelled_run() -> Result<()> {
    let repos = setup().await?;
    let (task, steps) = seed_task(&repos).await?;
    let mut run = seed_run(&repos).await?;
    repos
        .launch
        .add_step_links(steps[0].id, Some(run.id), None, None)
        .await?;

    run.state = RunState::Cancelled;
    run.finished_at = Some(Utc::now());
    repos.runs.update(&run).await?;

    let snap = build(&repos, task.id).await?;
    assert_eq!(
        snap.blocking.expect("blocking").kind,
        BlockingKind::RunCancelled
    );
    Ok(())
}

#[tokio::test]
async fn completed_run_has_no_blocking_reason() -> Result<()> {
    let repos = setup().await?;
    let (task, steps) = seed_task(&repos).await?;
    let mut run = seed_run(&repos).await?;
    repos
        .launch
        .add_step_links(steps[0].id, Some(run.id), None, None)
        .await?;

    run.state = RunState::Completed;
    run.finished_at = Some(Utc::now());
    repos.runs.update(&run).await?;

    let snap = build(&repos, task.id).await?;
    assert!(snap.blocking.is_none(), "completed run must not be blocked");
    Ok(())
}

#[tokio::test]
async fn step_needs_human_open_questions_become_pending_decisions() -> Result<()> {
    let repos = setup().await?;
    let (task, steps) = seed_task(&repos).await?;

    let plan = steps[0].id;
    repos
        .launch
        .update_step_status(plan, LaunchTaskStepStatus::Running)
        .await?;
    repos
        .launch
        .update_step_status(plan, LaunchTaskStepStatus::NeedsHuman)
        .await?;
    repos
        .launch
        .set_step_failure_classification(plan, Some(FailureClassification::MissingMarker))
        .await?;
    repos
        .launch
        .set_step_structured_result(
            plan,
            Some(StepResult {
                status: StepResultStatus::NeedsHuman,
                summary: "stuck".into(),
                changed_files: vec![],
                questions: vec!["which crate owns this?".into()],
            }),
        )
        .await?;

    let snap = build(&repos, task.id).await?;
    let kinds: Vec<_> = snap.pending_decisions.iter().map(|d| d.kind).collect();
    assert!(kinds.contains(&superkick_core::PendingDecisionKind::StepNeedsHuman));
    assert!(kinds.contains(&superkick_core::PendingDecisionKind::OpenQuestion));
    let plan_step = snap.steps.iter().find(|s| s.sequence == 1).unwrap();
    assert!(plan_step.failure_reason.is_some());
    Ok(())
}
