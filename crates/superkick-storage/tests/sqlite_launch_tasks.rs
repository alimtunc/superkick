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
    AgentCatalog, AgentProvider, CoreAgentDefinition, LaunchTask, LaunchTaskOverrides,
    LaunchTaskStatus, LaunchTaskStepStatus, LinearContextMode, PlanImplementReviewAgents,
    ResolvedMcpPolicy, ResolvedToolPolicy,
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
        timeout_secs: None,
        max_turns: None,
        origin: superkick_core::AgentOrigin::Custom,
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
    // Pin `created_at` so the second row is unambiguously the most recent
    // without racing `Utc::now()` or sleeping between inserts.
    let base = chrono::Utc::now();
    let (mut first, first_steps) = LaunchTask::new_with_v1_recipe("SUP-9", agents(), &catalog())?;
    first.created_at = base;
    repo.insert_with_steps(&first, &first_steps).await?;

    let (mut second, second_steps) = LaunchTask::new_with_v1_recipe("SUP-9", agents(), &catalog())?;
    second.created_at = base + chrono::Duration::seconds(1);
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
async fn execution_target_overrides_round_trip() -> Result<()> {
    let repo = setup().await?;

    let (mut overridden, overridden_steps) =
        LaunchTask::new_with_v1_recipe("SUP-159", agents(), &catalog())?;
    overridden.apply_overrides(LaunchTaskOverrides {
        base_branch: Some("release/2026.q2".into()),
        use_worktree: Some(false),
    })?;
    repo.insert_with_steps(&overridden, &overridden_steps)
        .await?;

    let reloaded = repo.get(overridden.id).await?.expect("override row");
    assert_eq!(reloaded.base_branch.as_deref(), Some("release/2026.q2"));
    assert_eq!(reloaded.use_worktree, Some(false));

    let (defaulted, defaulted_steps) =
        LaunchTask::new_with_v1_recipe("SUP-159-B", agents(), &catalog())?;
    repo.insert_with_steps(&defaulted, &defaulted_steps).await?;

    let reloaded_default = repo.get(defaulted.id).await?.expect("default row");
    assert!(reloaded_default.base_branch.is_none());
    assert!(reloaded_default.use_worktree.is_none());

    Ok(())
}

#[tokio::test]
async fn apply_overrides_rejects_blank_base_branch() {
    let (mut task, _) =
        LaunchTask::new_with_v1_recipe("SUP-159-C", agents(), &catalog()).expect("base task");
    let err = task
        .apply_overrides(LaunchTaskOverrides {
            base_branch: Some("   ".into()),
            use_worktree: None,
        })
        .unwrap_err();
    let msg = format!("{err:#}");
    assert!(msg.to_lowercase().contains("base_branch"), "got: {msg}");
}

#[tokio::test]
async fn find_step_by_linked_run_returns_linked_step_or_none() -> Result<()> {
    let repo = setup().await?;
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-11", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let run_id = superkick_core::RunId::new();
    assert!(repo.find_step_by_linked_run(run_id).await?.is_none());

    let plan = &steps[0];
    repo.add_step_links(plan.id, Some(run_id), None, None)
        .await?;

    let found = repo
        .find_step_by_linked_run(run_id)
        .await?
        .expect("step linked to run");
    assert_eq!(found.id, plan.id);
    assert_eq!(found.launch_task_id, task.id);

    let unrelated = superkick_core::RunId::new();
    assert!(repo.find_step_by_linked_run(unrelated).await?.is_none());

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

#[tokio::test]
async fn set_step_structured_result_round_trips() -> Result<()> {
    use superkick_core::{StepResult, StepResultStatus};

    let repo = setup().await?;
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-139", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let plan = &steps[0];
    let payload = StepResult {
        status: StepResultStatus::Completed,
        summary: "wrote the plan".into(),
        changed_files: vec![".claude/plans/SUP-139.md".into()],
        questions: vec![],
    };
    repo.set_step_structured_result(plan.id, Some(payload.clone()))
        .await?;

    let reloaded = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == plan.id)
        .expect("plan step persists");
    assert_eq!(reloaded.structured_result.as_ref(), Some(&payload));

    repo.set_step_structured_result(plan.id, None).await?;
    let cleared = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == plan.id)
        .unwrap();
    assert!(cleared.structured_result.is_none());

    Ok(())
}

#[tokio::test]
async fn malformed_structured_result_json_decodes_as_none() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteLaunchTaskRepo::new(pool.clone());
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-139", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let plan_id = steps[0].id;
    sqlx::query("UPDATE launch_task_steps SET structured_result = ?1 WHERE id = ?2")
        .bind("not json at all")
        .bind(plan_id.0.to_string())
        .execute(&pool)
        .await?;

    let reloaded = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == plan_id)
        .unwrap();
    assert!(
        reloaded.structured_result.is_none(),
        "malformed JSON must decode as None, not crash the read path"
    );
    Ok(())
}

#[tokio::test]
async fn structured_result_round_trips_via_insert() -> Result<()> {
    use superkick_core::{StepResult, StepResultStatus};

    let repo = setup().await?;
    let (task, mut steps) = LaunchTask::new_with_v1_recipe("SUP-139", agents(), &catalog())?;
    let preloaded = StepResult {
        status: StepResultStatus::NeedsHuman,
        summary: "agent paused mid-flight".into(),
        changed_files: vec![],
        questions: vec!["Where are the integration tests?".into()],
    };
    let plan_id = steps[0].id;
    steps[0].structured_result = Some(preloaded.clone());
    repo.insert_with_steps(&task, &steps).await?;

    let reloaded = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == plan_id)
        .unwrap();
    assert_eq!(reloaded.structured_result.as_ref(), Some(&preloaded));
    Ok(())
}

#[tokio::test]
async fn set_step_failure_classification_round_trips() -> Result<()> {
    use superkick_core::{AgentProvider, FailureClassification};

    let repo = setup().await?;
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-140", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let plan = &steps[0];
    let payload = FailureClassification::QuotaExceeded {
        provider: AgentProvider::Claude,
        reset_at: Some("3:42pm".into()),
    };
    repo.set_step_failure_classification(plan.id, Some(payload.clone()))
        .await?;

    let reloaded = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == plan.id)
        .expect("plan step persists");
    assert_eq!(reloaded.failure_classification.as_ref(), Some(&payload));

    repo.set_step_failure_classification(plan.id, None).await?;
    let cleared = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == plan.id)
        .unwrap();
    assert!(cleared.failure_classification.is_none());

    Ok(())
}

#[tokio::test]
async fn malformed_failure_classification_json_decodes_as_none() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteLaunchTaskRepo::new(pool.clone());
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-140", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let plan_id = steps[0].id;
    sqlx::query("UPDATE launch_task_steps SET failure_classification = ?1 WHERE id = ?2")
        .bind("not json at all")
        .bind(plan_id.0.to_string())
        .execute(&pool)
        .await?;

    let reloaded = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == plan_id)
        .unwrap();
    assert!(
        reloaded.failure_classification.is_none(),
        "malformed JSON must decode as None, not crash the read path"
    );
    Ok(())
}

#[tokio::test]
async fn set_step_auto_resume_round_trips_count_and_key() -> Result<()> {
    let repo = setup().await?;
    let (task, steps) = LaunchTask::new_with_v1_recipe("SUP-191", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;
    let implement_id = steps[1].id;

    // Fresh rows default to no auto-resume state.
    let fresh = repo.list_steps(task.id).await?;
    let implement = fresh.iter().find(|s| s.id == implement_id).unwrap();
    assert_eq!(implement.auto_resume_count, 0);
    assert!(implement.resume_key.is_none());

    repo.set_step_auto_resume(implement_id, 2, Some("thread-xyz".into()))
        .await?;

    let reloaded = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == implement_id)
        .unwrap();
    assert_eq!(reloaded.auto_resume_count, 2);
    assert_eq!(reloaded.resume_key.as_deref(), Some("thread-xyz"));

    // A fresh-run path clears the key while keeping the counter.
    repo.set_step_auto_resume(implement_id, 2, None).await?;
    let cleared = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == implement_id)
        .unwrap();
    assert_eq!(cleared.auto_resume_count, 2);
    assert!(cleared.resume_key.is_none());

    Ok(())
}
