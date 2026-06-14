//! Integration tests for the "clean issue" repo (archive + purge).
//!
//! Hits a real in-memory SQLite per CLAUDE.md rule 9. Covers:
//!  - archive stamps `archived_at` so runs/launch tasks drop out of the issue
//!    feed while staying in the DB for stats;
//!  - purge hard-deletes runs (with their FK-referencing children) and launch
//!    tasks (with their cascading steps), and leaves other issues untouched.

use std::collections::HashMap;

use anyhow::Result;
use chrono::Utc;
use superkick_core::{
    AgentCatalog, AgentOrigin, AgentProvider, CoreAgentDefinition, EventKind, EventLevel,
    ExecutionMode, LaunchTask, LinearContextMode, PlanImplementReviewAgents, ResolvedMcpPolicy,
    ResolvedToolPolicy, Run, RunEvent, RunStep, StepKey, TriggerSource,
};
use superkick_storage::repo::{IssueCleanRepo, LaunchTaskRepo, RunEventRepo, RunRepo, RunStepRepo};
use superkick_storage::{
    SqliteIssueCleanRepo, SqliteLaunchTaskRepo, SqliteRunEventRepo, SqliteRunRepo,
    SqliteRunStepRepo, connect,
};

fn agent(name: &str) -> CoreAgentDefinition {
    CoreAgentDefinition {
        name: name.into(),
        provider: AgentProvider::Claude,
        role: None,
        model: Some("opus-4-7".into()),
        system_prompt: None,
        timeout_secs: None,
        max_turns: None,
        origin: AgentOrigin::Custom,
        linear_context: LinearContextMode::default(),
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy::default(),
        backend: None,
        runner_mode: None,
        billing_profile: None,
    }
}

fn catalog() -> AgentCatalog {
    let mut roles: HashMap<String, CoreAgentDefinition> = HashMap::new();
    roles.insert("planner".into(), agent("planner"));
    roles.insert("coder".into(), agent("coder"));
    roles.insert("reviewer".into(), agent("reviewer"));
    AgentCatalog::new(roles)
}

fn agents() -> PlanImplementReviewAgents {
    PlanImplementReviewAgents {
        planner: "planner".into(),
        coder: "coder".into(),
        reviewer: "reviewer".into(),
    }
}

fn run_for(identifier: &str) -> Run {
    Run::new(
        format!("uuid-{identifier}"),
        identifier.into(),
        "o/r".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    )
}

#[tokio::test]
async fn archive_hides_from_feed_but_keeps_rows() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let task_repo = SqliteLaunchTaskRepo::new(pool.clone());
    let clean_repo = SqliteIssueCleanRepo::new(pool.clone());

    let run = run_for("SUP-1");
    run_repo.insert(&run).await?;
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-1", agents(), &catalog())?;
    task_repo.insert_with_steps(&task, &steps).await?;

    let outcome = clean_repo.archive_issue("SUP-1", Utc::now()).await?;
    assert_eq!(outcome.runs, 1);
    assert_eq!(outcome.launch_tasks, 1);

    // Dropped from the issue feed.
    assert!(run_repo.list_by_issue_identifier("SUP-1").await?.is_empty());
    assert!(task_repo.list(None, Some("SUP-1")).await?.is_empty());

    // Still present for stats (unfiltered list keeps archived rows).
    assert_eq!(task_repo.list(None, None).await?.len(), 1);
    assert!(run_repo.get(run.id).await?.is_some());

    // Idempotent — re-archiving stamps nothing new.
    let again = clean_repo.archive_issue("SUP-1", Utc::now()).await?;
    assert_eq!(again.runs, 0);
    assert_eq!(again.launch_tasks, 0);
    Ok(())
}

#[tokio::test]
async fn purge_hard_deletes_runs_tasks_and_children() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool.clone());
    let event_repo = SqliteRunEventRepo::new(pool.clone());
    let task_repo = SqliteLaunchTaskRepo::new(pool.clone());
    let clean_repo = SqliteIssueCleanRepo::new(pool.clone());

    let target = run_for("SUP-1");
    run_repo.insert(&target).await?;
    step_repo
        .insert(&RunStep::new(target.id, StepKey::Plan, 1))
        .await?;
    event_repo
        .insert(&RunEvent::new(
            target.id,
            None,
            EventKind::StateChange,
            EventLevel::Info,
            "started".into(),
        ))
        .await?;
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-1", agents(), &catalog())?;
    task_repo.insert_with_steps(&task, &steps).await?;

    // A no-cascade run child (pull_requests) and an issue-scoped conversation
    // chain (run_id NULL). Neither cascades on the run/launch-task delete, so
    // these exercise the manual delete list — a missing entry would orphan them.
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO pull_requests (id, run_id, number, repo_slug, url, created_at, updated_at) \
         VALUES ('pr-1', ?1, 7, 'o/r', 'https://example/pr/7', ?2, ?2)",
    )
    .bind(target.id.to_string())
    .bind(&now)
    .execute(&pool)
    .await?;
    sqlx::query(
        "INSERT INTO conversations \
         (id, issue_identifier, agent_id, provider, status, created_at, updated_at) \
         VALUES ('conv-1', 'SUP-1', 'planner', 'claude', 'idle', ?1, ?1)",
    )
    .bind(&now)
    .execute(&pool)
    .await?;
    sqlx::query(
        "INSERT INTO conversation_turns (id, conversation_id, seq, user_text, status, created_at) \
         VALUES ('turn-1', 'conv-1', 0, 'hi', 'completed', ?1)",
    )
    .bind(&now)
    .execute(&pool)
    .await?;
    sqlx::query(
        "INSERT INTO turn_events (id, turn_id, seq, at, kind, envelope_json) \
         VALUES ('te-1', 'turn-1', 0, ?1, 'text', '{}')",
    )
    .bind(&now)
    .execute(&pool)
    .await?;

    // Control issue — must survive the purge untouched.
    let other = run_for("SUP-2");
    run_repo.insert(&other).await?;
    let (other_task, other_steps) = LaunchTask::new_with_v1_recipe("SUP-2", agents(), &catalog())?;
    task_repo
        .insert_with_steps(&other_task, &other_steps)
        .await?;

    let outcome = clean_repo.purge_issue("SUP-1").await?;
    assert_eq!(outcome.runs, 1);
    assert_eq!(outcome.launch_tasks, 1);

    // Target gone, including its FK-referencing children.
    assert!(run_repo.get(target.id).await?.is_none());
    assert!(step_repo.list_by_run(target.id).await?.is_empty());
    assert!(event_repo.list_by_run(target.id).await?.is_empty());
    assert!(task_repo.get(task.id).await?.is_none());
    assert!(task_repo.list_steps(task.id).await?.is_empty());

    // No-cascade children (PR + issue-scoped conversation chain) gone too. No
    // other issue seeded these tables, so a whole-table count is unambiguous.
    let pr_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pull_requests")
        .fetch_one(&pool)
        .await?;
    assert_eq!(pr_count, 0, "pull_requests purged");
    let conversation_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM conversations")
        .fetch_one(&pool)
        .await?;
    assert_eq!(conversation_count, 0, "issue-scoped conversations purged");
    let turn_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM conversation_turns")
        .fetch_one(&pool)
        .await?;
    assert_eq!(turn_count, 0, "conversation_turns purged");
    let turn_event_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM turn_events")
        .fetch_one(&pool)
        .await?;
    assert_eq!(turn_event_count, 0, "turn_events purged");

    // Control issue untouched.
    assert!(run_repo.get(other.id).await?.is_some());
    assert!(task_repo.get(other_task.id).await?.is_some());
    Ok(())
}
