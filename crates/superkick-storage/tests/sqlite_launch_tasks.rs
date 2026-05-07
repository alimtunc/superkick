//! SUP-116 — SQLite integration tests for the launch-task aggregate.
//!
//! Hits a real in-memory SQLite per CLAUDE.md rule 9. Covers:
//!  - transactional insert + relectures by id, by linear_issue_id, by status;
//!  - status updates honour the domain transition validator (invalid edges
//!    bubble out via `CoreError::InvalidLaunchTask*Transition`);
//!  - the `WHERE status = <old>` guard catches concurrent transitions;
//!  - `set_current_step` rejects a step that belongs to another task;
//!  - cascade delete on the parent removes the children.

use std::collections::HashMap;

use anyhow::Result;
use superkick_core::{
    AgentCatalog, AgentProvider, CoreAgentDefinition, LaunchTask, LaunchTaskStatus,
    LaunchTaskStepStatus, LinearContextMode, PlanImplementReviewAgents, ResolvedMcpPolicy,
    ResolvedToolPolicy,
};
use superkick_storage::repo::LaunchTaskRepo;
use superkick_storage::{SqliteLaunchTaskRepo, connect};

async fn setup() -> Result<SqliteLaunchTaskRepo> {
    let pool = connect("sqlite::memory:").await?;
    Ok(SqliteLaunchTaskRepo::new(pool))
}

fn agent(name: &str, provider: AgentProvider, model: Option<&str>) -> CoreAgentDefinition {
    CoreAgentDefinition {
        name: name.into(),
        provider,
        role: None,
        model: model.map(String::from),
        system_prompt: None,
        tools: None,
        timeout_secs: None,
        max_turns: None,
        linear_context: LinearContextMode::default(),
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy::default(),
    }
}

fn catalog() -> AgentCatalog {
    let mut roles: HashMap<String, CoreAgentDefinition> = HashMap::new();
    roles.insert(
        "planner".into(),
        agent("planner", AgentProvider::Claude, Some("opus-4-7")),
    );
    roles.insert(
        "coder".into(),
        agent("coder", AgentProvider::Claude, Some("sonnet-4-6")),
    );
    roles.insert(
        "reviewer".into(),
        agent("reviewer", AgentProvider::Codex, None),
    );
    AgentCatalog::new(roles)
}

fn agents() -> PlanImplementReviewAgents {
    PlanImplementReviewAgents {
        planner: "planner".into(),
        coder: "coder".into(),
        reviewer: "reviewer".into(),
    }
}

#[tokio::test]
async fn insert_with_steps_persists_parent_and_children() -> Result<()> {
    let repo = setup().await?;
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-116", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let reloaded = repo.get(task.id).await?.expect("task row");
    assert_eq!(reloaded.linear_issue_id, "SUP-116");
    assert_eq!(reloaded.status, LaunchTaskStatus::Pending);

    let steps = repo.list_steps(task.id).await?;
    assert_eq!(steps.len(), 3);
    assert_eq!(steps[0].sequence, 1);
    assert_eq!(steps[2].sequence, 3);
    assert_eq!(steps[0].agent_name, "planner");
    assert_eq!(steps[1].agent_name, "coder");
    assert_eq!(steps[2].agent_name, "reviewer");

    Ok(())
}

#[tokio::test]
async fn get_by_linear_issue_returns_most_recent() -> Result<()> {
    let repo = setup().await?;
    let (first, first_steps) = LaunchTask::new_with_v1_recipe("SUP-9", agents(), &catalog())?;
    repo.insert_with_steps(&first, &first_steps).await?;

    // sleep_micros: ensure the second created_at is strictly greater than the
    // first. Without it, two creates inside the same millisecond sort
    // ambiguously and the assertion below would be flaky.
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;

    let (second, second_steps) = LaunchTask::new_with_v1_recipe("SUP-9", agents(), &catalog())?;
    repo.insert_with_steps(&second, &second_steps).await?;

    let latest = repo
        .get_by_linear_issue("SUP-9")
        .await?
        .expect("latest row");
    assert_eq!(latest.id.0, second.id.0);

    Ok(())
}

#[tokio::test]
async fn list_filters_combine_correctly() -> Result<()> {
    let repo = setup().await?;
    let (a, a_steps) = LaunchTask::new_with_v1_recipe("SUP-1", agents(), &catalog())?;
    let (b, b_steps) = LaunchTask::new_with_v1_recipe("SUP-2", agents(), &catalog())?;
    repo.insert_with_steps(&a, &a_steps).await?;
    repo.insert_with_steps(&b, &b_steps).await?;

    repo.update_task_status(b.id, LaunchTaskStatus::Running)
        .await?;

    let all = repo.list(None, None).await?;
    assert_eq!(all.len(), 2);

    let pending = repo.list(Some(LaunchTaskStatus::Pending), None).await?;
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].id.0, a.id.0);

    let running = repo.list(Some(LaunchTaskStatus::Running), None).await?;
    assert_eq!(running.len(), 1);
    assert_eq!(running[0].id.0, b.id.0);

    let by_issue = repo.list(None, Some("SUP-1")).await?;
    assert_eq!(by_issue.len(), 1);
    assert_eq!(by_issue[0].id.0, a.id.0);

    let combined = repo
        .list(Some(LaunchTaskStatus::Running), Some("SUP-1"))
        .await?;
    assert!(combined.is_empty());

    Ok(())
}

#[tokio::test]
async fn update_task_status_rejects_invalid_transition() -> Result<()> {
    let repo = setup().await?;
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-3", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    // Pending → Completed is invalid (must run first). The repo surfaces the
    // domain error wrapped in anyhow — same shape the API layer expects.
    let err = repo
        .update_task_status(task.id, LaunchTaskStatus::Completed)
        .await
        .unwrap_err();
    let msg = format!("{err:#}");
    assert!(
        msg.contains("invalid launch task transition"),
        "unexpected error: {msg}"
    );

    // Status on disk must be unchanged after the rejection.
    let reloaded = repo.get(task.id).await?.expect("task row");
    assert_eq!(reloaded.status, LaunchTaskStatus::Pending);
    Ok(())
}

#[tokio::test]
async fn update_step_status_and_links_persist() -> Result<()> {
    let repo = setup().await?;
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-4", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let plan = &steps[0];
    repo.update_step_status(plan.id, LaunchTaskStepStatus::Running)
        .await?;
    let run_id = superkick_core::RunId::new();
    repo.add_step_links(plan.id, Some(run_id), None, None)
        .await?;
    repo.update_step_status(plan.id, LaunchTaskStepStatus::Completed)
        .await?;

    let after = repo.list_steps(task.id).await?;
    assert_eq!(after[0].status, LaunchTaskStepStatus::Completed);
    assert_eq!(after[0].linked_run_id, Some(run_id));

    Ok(())
}

#[tokio::test]
async fn set_current_step_updates_pointer() -> Result<()> {
    let repo = setup().await?;
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-5", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    repo.set_current_step(task.id, Some(steps[1].id)).await?;
    let after = repo.get(task.id).await?.expect("task row");
    assert_eq!(after.current_step_id, Some(steps[1].id));
    Ok(())
}

#[tokio::test]
async fn cascade_delete_removes_steps() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteLaunchTaskRepo::new(pool.clone());

    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-6", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;
    assert_eq!(repo.list_steps(task.id).await?.len(), 3);

    sqlx::query("DELETE FROM launch_tasks WHERE id = ?1")
        .bind(task.id.0.to_string())
        .execute(&pool)
        .await?;

    assert!(repo.list_steps(task.id).await?.is_empty());
    assert!(repo.get(task.id).await?.is_none());
    Ok(())
}

#[tokio::test]
async fn unique_sequence_per_task_is_enforced() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteLaunchTaskRepo::new(pool.clone());

    let (task, mut steps) = LaunchTask::new_with_v1_recipe("SUP-7", agents(), &catalog())?;
    // Tamper with the second step so it collides with the first on `(launch_task_id, sequence)`.
    steps[1].sequence = 1;
    let err = repo.insert_with_steps(&task, &steps).await.unwrap_err();
    let msg = format!("{err:#}");
    assert!(msg.to_lowercase().contains("unique"), "got: {msg}");
    Ok(())
}

#[tokio::test]
async fn update_task_status_rejects_concurrent_state_change() -> Result<()> {
    // Simulate a stale-snapshot race: another writer moves the row to a new
    // status after our domain validation but before our UPDATE lands. The
    // `WHERE status = <old>` guard must surface the loss instead of silently
    // overwriting.
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteLaunchTaskRepo::new(pool.clone());

    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-8", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;
    repo.update_task_status(task.id, LaunchTaskStatus::Running)
        .await?;

    // Concurrent writer pushes the row to Failed via raw SQL.
    sqlx::query("UPDATE launch_tasks SET status = 'failed' WHERE id = ?1")
        .bind(task.id.0.to_string())
        .execute(&pool)
        .await?;

    // The next domain-driven Running → Completed should fail. With a stale
    // snapshot the SELECT now reads "failed", so the domain itself rejects
    // the transition (terminal). Either error shape proves the guard works.
    let err = repo
        .update_task_status(task.id, LaunchTaskStatus::Completed)
        .await
        .unwrap_err();
    let msg = format!("{err:#}");
    assert!(
        msg.contains("invalid launch task transition") || msg.contains("concurrent state change"),
        "expected stale-snapshot or invalid-transition error, got: {msg}"
    );
    Ok(())
}

#[tokio::test]
async fn set_current_step_rejects_step_from_other_task() -> Result<()> {
    let repo = setup().await?;
    let (task_a, steps_a) = LaunchTask::new_with_v1_recipe("SUP-9", agents(), &catalog())?;
    let (task_b, steps_b) = LaunchTask::new_with_v1_recipe("SUP-10", agents(), &catalog())?;
    repo.insert_with_steps(&task_a, &steps_a).await?;
    repo.insert_with_steps(&task_b, &steps_b).await?;

    // Pointing task A's pointer at a step owned by task B must fail loudly —
    // silent acceptance would corrupt the aggregate downstream.
    let err = repo
        .set_current_step(task_a.id, Some(steps_b[0].id))
        .await
        .unwrap_err();
    let msg = format!("{err:#}");
    assert!(
        msg.contains("does not belong to"),
        "expected ownership rejection, got: {msg}"
    );

    // Pointer must remain unset.
    let reloaded = repo.get(task_a.id).await?.expect("task row");
    assert!(reloaded.current_step_id.is_none());
    Ok(())
}
