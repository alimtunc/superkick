//! SUP-116: SQLite persistence for `LaunchTask` + `LaunchTaskStep`.
//!
//! Two invariants that the storage layer enforces beyond what the SQL
//! schema can express:
//!
//! 1. **Atomic transitions.** `update_task_status` and `update_step_status`
//!    run SELECT + UPDATE inside a single transaction with a
//!    `WHERE status = <old>` guard. Two concurrent transitions therefore
//!    cannot both win — the loser sees `rows_affected == 0` and surfaces a
//!    `concurrent state change` error rather than silently overwriting.
//! 2. **Cross-aggregate ownership.** `set_current_step` checks that the
//!    supplied step belongs to the supplied task before bumping the
//!    pointer. A typo in the SUP-118 execution loop fails loudly instead
//!    of corrupting an unrelated row.

use anyhow::{Context, Result, anyhow};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use superkick_core::{
    ConversationId, FailureClassification, LaunchRecipe, LaunchStepKind, LaunchTask, LaunchTaskId,
    LaunchTaskStatus, LaunchTaskStep, LaunchTaskStepId, LaunchTaskStepStatus,
    OrchestratorSessionId, RunId, StepResult,
};

use super::codec::{decode_rfc3339, deserialize_enum, serialize_enum};
use crate::repo::LaunchTaskRepo;

pub struct SqliteLaunchTaskRepo {
    pool: SqlitePool,
}

impl SqliteLaunchTaskRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

fn encode_json_column<T: serde::Serialize>(
    id: LaunchTaskStepId,
    column: &'static str,
    value: Option<&T>,
) -> Result<Option<String>> {
    value
        .map(serde_json::to_string)
        .transpose()
        .with_context(|| format!("encode {column} for launch_task_step {}", id.0))
}

impl LaunchTaskRepo for SqliteLaunchTaskRepo {
    async fn insert_with_steps(&self, task: &LaunchTask, steps: &[LaunchTaskStep]) -> Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for insert_with_steps")?;

        sqlx::query(
            "INSERT INTO launch_tasks (\
                 id, linear_issue_id, recipe_kind, status, current_step_id, summary, \
                 base_branch, use_worktree, \
                 created_at, updated_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )
        .bind(task.id.0.to_string())
        .bind(&task.linear_issue_id)
        .bind(serialize_enum(&task.recipe_kind)?)
        .bind(serialize_enum(&task.status)?)
        .bind(task.current_step_id.map(|id| id.0.to_string()))
        .bind(task.summary.clone())
        .bind(task.base_branch.clone())
        .bind(task.use_worktree.map(i64::from))
        .bind(task.created_at.to_rfc3339())
        .bind(task.updated_at.to_rfc3339())
        .execute(&mut *tx)
        .await
        .with_context(|| format!("insert launch_task {}", task.id.0))?;

        for step in steps {
            let structured_json = encode_json_column(
                step.id,
                "structured_result",
                step.structured_result.as_ref(),
            )?;
            let classification_json = encode_json_column(
                step.id,
                "failure_classification",
                step.failure_classification.as_ref(),
            )?;
            sqlx::query(
                "INSERT INTO launch_task_steps (\
                     id, launch_task_id, sequence, step_kind, agent_name, \
                     provider, model, mode, status, \
                     linked_run_id, linked_conversation_id, linked_orchestrator_session_id, \
                     summary, structured_result, failure_classification, \
                     auto_resume_count, resume_key, \
                     created_at, updated_at\
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
            )
            .bind(step.id.0.to_string())
            .bind(step.launch_task_id.0.to_string())
            .bind(step.sequence as i64)
            .bind(serialize_enum(&step.step_kind)?)
            .bind(&step.agent_name)
            .bind(step.provider.clone())
            .bind(step.model.clone())
            .bind(step.mode.clone())
            .bind(serialize_enum(&step.status)?)
            .bind(step.linked_run_id.map(|id| id.0.to_string()))
            .bind(step.linked_conversation_id.map(|id| id.0.to_string()))
            .bind(
                step.linked_orchestrator_session_id
                    .map(|id| id.0.to_string()),
            )
            .bind(step.summary.clone())
            .bind(structured_json)
            .bind(classification_json)
            .bind(i64::from(step.auto_resume_count))
            .bind(step.resume_key.clone())
            .bind(step.created_at.to_rfc3339())
            .bind(step.updated_at.to_rfc3339())
            .execute(&mut *tx)
            .await
            .with_context(|| format!("insert launch_task_step {}", step.id.0))?;
        }

        tx.commit()
            .await
            .context("commit transaction for insert_with_steps")?;
        Ok(())
    }

    async fn get(&self, id: LaunchTaskId) -> Result<Option<LaunchTask>> {
        let row = sqlx::query_as::<_, LaunchTaskRow>("SELECT * FROM launch_tasks WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await
            .with_context(|| format!("get launch_task {}", id.0))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn get_by_linear_issue(&self, linear_issue_id: &str) -> Result<Option<LaunchTask>> {
        let row = sqlx::query_as::<_, LaunchTaskRow>(
            "SELECT * FROM launch_tasks WHERE linear_issue_id = ?1 \
             ORDER BY created_at DESC LIMIT 1",
        )
        .bind(linear_issue_id)
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get launch_task by linear_issue_id {linear_issue_id}"))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list(
        &self,
        status: Option<LaunchTaskStatus>,
        linear_issue_id: Option<&str>,
    ) -> Result<Vec<LaunchTask>> {
        let mut qb = QueryBuilder::<Sqlite>::new("SELECT * FROM launch_tasks WHERE 1 = 1");
        if let Some(status) = status {
            qb.push(" AND status = ");
            qb.push_bind(serialize_enum(&status)?);
        }
        if let Some(issue) = linear_issue_id {
            qb.push(" AND linear_issue_id = ");
            qb.push_bind(issue.to_string());
        }
        qb.push(" ORDER BY created_at");
        let rows: Vec<LaunchTaskRow> = qb
            .build_query_as()
            .fetch_all(&self.pool)
            .await
            .context("list launch_tasks")?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn list_steps(&self, task_id: LaunchTaskId) -> Result<Vec<LaunchTaskStep>> {
        let rows = sqlx::query_as::<_, LaunchTaskStepRow>(
            "SELECT * FROM launch_task_steps WHERE launch_task_id = ?1 ORDER BY sequence",
        )
        .bind(task_id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list launch_task_steps for launch_task {}", task_id.0))?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    /// Contract: returns the most-recently-updated step pointing at `run_id`.
    ///
    /// The schema does not enforce uniqueness on `linked_run_id`. The runtime
    /// invariant (one shadow run per launch task, owned by exactly one step)
    /// is upheld by `RealStepRunner::ensure_shadow_run` + the
    /// `add_step_links` write path. Callers that need this mapping (e.g.
    /// `cancel_run`) rely on the "most recent wins" tie-break.
    async fn find_step_by_linked_run(&self, run_id: RunId) -> Result<Option<LaunchTaskStep>> {
        let row = sqlx::query_as::<_, LaunchTaskStepRow>(
            "SELECT * FROM launch_task_steps WHERE linked_run_id = ?1 \
             ORDER BY updated_at DESC LIMIT 1",
        )
        .bind(run_id.0.to_string())
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("find launch_task_step by linked_run {}", run_id.0))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn update_task_status(
        &self,
        id: LaunchTaskId,
        new_status: LaunchTaskStatus,
    ) -> Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for update_task_status")?;
        let row = sqlx::query_as::<_, LaunchTaskRow>("SELECT * FROM launch_tasks WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&mut *tx)
            .await
            .with_context(|| format!("get launch_task {} for status update", id.0))?
            .ok_or_else(|| anyhow!("launch_task {} not found", id.0))?;
        let mut task = row.into_domain()?;
        let old_status = serialize_enum(&task.status)?;
        task.transition_to(new_status)
            .with_context(|| format!("launch_task {}", id.0))?;
        let result = sqlx::query(
            "UPDATE launch_tasks SET status = ?1, updated_at = ?2 \
             WHERE id = ?3 AND status = ?4",
        )
        .bind(serialize_enum(&task.status)?)
        .bind(task.updated_at.to_rfc3339())
        .bind(id.0.to_string())
        .bind(&old_status)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("update launch_task {} status", id.0))?;
        if result.rows_affected() == 0 {
            return Err(anyhow!(
                "launch_task {} concurrent state change (no longer at {})",
                id.0,
                old_status
            ));
        }
        tx.commit()
            .await
            .context("commit transaction for update_task_status")?;
        Ok(())
    }

    async fn update_step_status(
        &self,
        id: LaunchTaskStepId,
        new_status: LaunchTaskStepStatus,
    ) -> Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for update_step_status")?;
        let row =
            sqlx::query_as::<_, LaunchTaskStepRow>("SELECT * FROM launch_task_steps WHERE id = ?1")
                .bind(id.0.to_string())
                .fetch_optional(&mut *tx)
                .await
                .with_context(|| format!("get launch_task_step {} for status update", id.0))?
                .ok_or_else(|| anyhow!("launch_task_step {} not found", id.0))?;
        let mut step = row.into_domain()?;
        let old_status = serialize_enum(&step.status)?;
        step.transition_to(new_status)
            .with_context(|| format!("launch_task_step {}", id.0))?;
        let result = sqlx::query(
            "UPDATE launch_task_steps SET status = ?1, updated_at = ?2 \
             WHERE id = ?3 AND status = ?4",
        )
        .bind(serialize_enum(&step.status)?)
        .bind(step.updated_at.to_rfc3339())
        .bind(id.0.to_string())
        .bind(&old_status)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("update launch_task_step {} status", id.0))?;
        if result.rows_affected() == 0 {
            return Err(anyhow!(
                "launch_task_step {} concurrent state change (no longer at {})",
                id.0,
                old_status
            ));
        }
        tx.commit()
            .await
            .context("commit transaction for update_step_status")?;
        Ok(())
    }

    async fn set_step_summary(&self, id: LaunchTaskStepId, summary: Option<String>) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let result =
            sqlx::query("UPDATE launch_task_steps SET summary = ?1, updated_at = ?2 WHERE id = ?3")
                .bind(summary)
                .bind(now)
                .bind(id.0.to_string())
                .execute(&self.pool)
                .await
                .with_context(|| format!("set summary for launch_task_step {}", id.0))?;
        if result.rows_affected() == 0 {
            return Err(anyhow!("launch_task_step {} not found", id.0));
        }
        Ok(())
    }

    async fn set_step_structured_result(
        &self,
        id: LaunchTaskStepId,
        result: Option<StepResult>,
    ) -> Result<()> {
        let encoded = encode_json_column(id, "structured_result", result.as_ref())?;
        let now = chrono::Utc::now().to_rfc3339();
        let outcome = sqlx::query(
            "UPDATE launch_task_steps SET structured_result = ?1, updated_at = ?2 WHERE id = ?3",
        )
        .bind(encoded)
        .bind(now)
        .bind(id.0.to_string())
        .execute(&self.pool)
        .await
        .with_context(|| format!("set structured_result for launch_task_step {}", id.0))?;
        if outcome.rows_affected() == 0 {
            return Err(anyhow!("launch_task_step {} not found", id.0));
        }
        Ok(())
    }

    async fn set_step_failure_classification(
        &self,
        id: LaunchTaskStepId,
        classification: Option<FailureClassification>,
    ) -> Result<()> {
        let encoded = encode_json_column(id, "failure_classification", classification.as_ref())?;
        let now = chrono::Utc::now().to_rfc3339();
        let outcome = sqlx::query(
            "UPDATE launch_task_steps SET failure_classification = ?1, updated_at = ?2 \
             WHERE id = ?3",
        )
        .bind(encoded)
        .bind(now)
        .bind(id.0.to_string())
        .execute(&self.pool)
        .await
        .with_context(|| format!("set failure_classification for launch_task_step {}", id.0))?;
        if outcome.rows_affected() == 0 {
            return Err(anyhow!("launch_task_step {} not found", id.0));
        }
        Ok(())
    }

    async fn set_step_auto_resume(
        &self,
        id: LaunchTaskStepId,
        auto_resume_count: u32,
        resume_key: Option<String>,
    ) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let outcome = sqlx::query(
            "UPDATE launch_task_steps SET auto_resume_count = ?1, resume_key = ?2, updated_at = ?3 \
             WHERE id = ?4",
        )
        .bind(i64::from(auto_resume_count))
        .bind(resume_key)
        .bind(now)
        .bind(id.0.to_string())
        .execute(&self.pool)
        .await
        .with_context(|| format!("set auto_resume state for launch_task_step {}", id.0))?;
        if outcome.rows_affected() == 0 {
            return Err(anyhow!("launch_task_step {} not found", id.0));
        }
        Ok(())
    }

    async fn add_step_links(
        &self,
        id: LaunchTaskStepId,
        run_id: Option<RunId>,
        conversation_id: Option<ConversationId>,
        orchestrator_session_id: Option<OrchestratorSessionId>,
    ) -> Result<()> {
        let row =
            sqlx::query_as::<_, LaunchTaskStepRow>("SELECT * FROM launch_task_steps WHERE id = ?1")
                .bind(id.0.to_string())
                .fetch_optional(&self.pool)
                .await
                .with_context(|| format!("get launch_task_step {} for add_links", id.0))?
                .ok_or_else(|| anyhow!("launch_task_step {} not found", id.0))?;
        let mut step = row.into_domain()?;
        step.add_links(run_id, conversation_id, orchestrator_session_id);
        let result = sqlx::query(
            "UPDATE launch_task_steps SET \
                 linked_run_id = ?1, linked_conversation_id = ?2, \
                 linked_orchestrator_session_id = ?3, updated_at = ?4 \
             WHERE id = ?5",
        )
        .bind(step.linked_run_id.map(|id| id.0.to_string()))
        .bind(step.linked_conversation_id.map(|id| id.0.to_string()))
        .bind(
            step.linked_orchestrator_session_id
                .map(|id| id.0.to_string()),
        )
        .bind(step.updated_at.to_rfc3339())
        .bind(id.0.to_string())
        .execute(&self.pool)
        .await
        .with_context(|| format!("update launch_task_step {} links", id.0))?;
        if result.rows_affected() == 0 {
            return Err(anyhow!("launch_task_step {} not found", id.0));
        }
        Ok(())
    }

    async fn set_current_step(
        &self,
        task_id: LaunchTaskId,
        step_id: Option<LaunchTaskStepId>,
    ) -> Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for set_current_step")?;

        let task_exists: Option<(String,)> =
            sqlx::query_as("SELECT id FROM launch_tasks WHERE id = ?1")
                .bind(task_id.0.to_string())
                .fetch_optional(&mut *tx)
                .await
                .with_context(|| format!("check launch_task {} exists", task_id.0))?;
        if task_exists.is_none() {
            return Err(anyhow!("launch_task {} not found", task_id.0));
        }

        if let Some(step_id) = step_id {
            let step_exists: Option<(String,)> = sqlx::query_as(
                "SELECT id FROM launch_task_steps WHERE id = ?1 AND launch_task_id = ?2",
            )
            .bind(step_id.0.to_string())
            .bind(task_id.0.to_string())
            .fetch_optional(&mut *tx)
            .await
            .with_context(|| {
                format!(
                    "check launch_task_step {} belongs to task {}",
                    step_id.0, task_id.0
                )
            })?;
            if step_exists.is_none() {
                return Err(anyhow!(
                    "launch_task_step {} does not belong to launch_task {}",
                    step_id.0,
                    task_id.0
                ));
            }
        }

        sqlx::query("UPDATE launch_tasks SET current_step_id = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(step_id.map(|id| id.0.to_string()))
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(task_id.0.to_string())
            .execute(&mut *tx)
            .await
            .with_context(|| format!("set current_step for launch_task {}", task_id.0))?;
        tx.commit()
            .await
            .context("commit transaction for set_current_step")?;
        Ok(())
    }

    async fn begin_retry(&self, task_id: LaunchTaskId, step_id: LaunchTaskStepId) -> Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for begin_retry")?;

        let step_row =
            sqlx::query_as::<_, LaunchTaskStepRow>("SELECT * FROM launch_task_steps WHERE id = ?1")
                .bind(step_id.0.to_string())
                .fetch_optional(&mut *tx)
                .await
                .with_context(|| format!("get launch_task_step {} for begin_retry", step_id.0))?
                .ok_or_else(|| anyhow!("launch_task_step {} not found", step_id.0))?;
        let mut step = step_row.into_domain()?;
        if step.launch_task_id != task_id {
            return Err(anyhow!(
                "launch_task_step {} does not belong to launch_task {}",
                step_id.0,
                task_id.0
            ));
        }
        let old_step_status = serialize_enum(&step.status)?;
        step.transition_to(LaunchTaskStepStatus::Running)
            .with_context(|| format!("launch_task_step {} (begin_retry)", step_id.0))?;

        let task_row =
            sqlx::query_as::<_, LaunchTaskRow>("SELECT * FROM launch_tasks WHERE id = ?1")
                .bind(task_id.0.to_string())
                .fetch_optional(&mut *tx)
                .await
                .with_context(|| format!("get launch_task {} for begin_retry", task_id.0))?
                .ok_or_else(|| anyhow!("launch_task {} not found", task_id.0))?;
        let mut task = task_row.into_domain()?;
        let old_task_status = serialize_enum(&task.status)?;
        task.transition_to(LaunchTaskStatus::Running)
            .with_context(|| format!("launch_task {} (begin_retry)", task_id.0))?;

        let step_result = sqlx::query(
            "UPDATE launch_task_steps SET status = ?1, updated_at = ?2 \
             WHERE id = ?3 AND status = ?4",
        )
        .bind(serialize_enum(&step.status)?)
        .bind(step.updated_at.to_rfc3339())
        .bind(step_id.0.to_string())
        .bind(&old_step_status)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("update launch_task_step {} status (begin_retry)", step_id.0))?;
        if step_result.rows_affected() == 0 {
            return Err(anyhow!(
                "launch_task_step {} concurrent state change (no longer at {})",
                step_id.0,
                old_step_status
            ));
        }

        let task_result = sqlx::query(
            "UPDATE launch_tasks SET status = ?1, updated_at = ?2 \
             WHERE id = ?3 AND status = ?4",
        )
        .bind(serialize_enum(&task.status)?)
        .bind(task.updated_at.to_rfc3339())
        .bind(task_id.0.to_string())
        .bind(&old_task_status)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("update launch_task {} status (begin_retry)", task_id.0))?;
        if task_result.rows_affected() == 0 {
            return Err(anyhow!(
                "launch_task {} concurrent state change (no longer at {})",
                task_id.0,
                old_task_status
            ));
        }

        sqlx::query("UPDATE launch_tasks SET current_step_id = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(step_id.0.to_string())
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(task_id.0.to_string())
            .execute(&mut *tx)
            .await
            .with_context(|| {
                format!(
                    "set current_step for launch_task {} (begin_retry)",
                    task_id.0
                )
            })?;

        tx.commit()
            .await
            .context("commit transaction for begin_retry")?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct LaunchTaskRow {
    id: String,
    linear_issue_id: String,
    recipe_kind: String,
    status: String,
    current_step_id: Option<String>,
    summary: Option<String>,
    base_branch: Option<String>,
    use_worktree: Option<i64>,
    created_at: String,
    updated_at: String,
}

impl LaunchTaskRow {
    fn into_domain(self) -> Result<LaunchTask> {
        Ok(LaunchTask {
            id: LaunchTaskId(uuid::Uuid::parse_str(&self.id)?),
            linear_issue_id: self.linear_issue_id,
            recipe_kind: deserialize_enum::<LaunchRecipe>(&self.recipe_kind)?,
            status: deserialize_enum::<LaunchTaskStatus>(&self.status)?,
            current_step_id: self
                .current_step_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(LaunchTaskStepId),
            summary: self.summary,
            base_branch: self.base_branch,
            use_worktree: self.use_worktree.map(|v| v != 0),
            created_at: decode_rfc3339(&self.created_at)?,
            updated_at: decode_rfc3339(&self.updated_at)?,
        })
    }
}

#[derive(sqlx::FromRow)]
struct LaunchTaskStepRow {
    id: String,
    launch_task_id: String,
    sequence: i64,
    step_kind: String,
    agent_name: String,
    provider: Option<String>,
    model: Option<String>,
    mode: Option<String>,
    status: String,
    linked_run_id: Option<String>,
    linked_conversation_id: Option<String>,
    linked_orchestrator_session_id: Option<String>,
    summary: Option<String>,
    structured_result: Option<String>,
    failure_classification: Option<String>,
    auto_resume_count: i64,
    resume_key: Option<String>,
    created_at: String,
    updated_at: String,
}

impl LaunchTaskStepRow {
    fn into_domain(self) -> Result<LaunchTaskStep> {
        // Malformed JSON degrades to `None` so the read path keeps working.
        let structured_result = self.structured_result.as_deref().and_then(|raw| {
            StepResult::try_from_json(raw).or_else(|| {
                tracing::warn!(
                    launch_task_step_id = %self.id,
                    "malformed structured_result JSON — dropping"
                );
                None
            })
        });
        let failure_classification = self.failure_classification.as_deref().and_then(|raw| {
            match serde_json::from_str::<FailureClassification>(raw) {
                Ok(v) => Some(v),
                Err(err) => {
                    tracing::warn!(
                        launch_task_step_id = %self.id,
                        error = %err,
                        "malformed failure_classification JSON — dropping"
                    );
                    None
                }
            }
        });
        Ok(LaunchTaskStep {
            id: LaunchTaskStepId(uuid::Uuid::parse_str(&self.id)?),
            launch_task_id: LaunchTaskId(uuid::Uuid::parse_str(&self.launch_task_id)?),
            sequence: u32::try_from(self.sequence).with_context(|| {
                format!("launch_task_step sequence overflow: {}", self.sequence)
            })?,
            step_kind: deserialize_enum::<LaunchStepKind>(&self.step_kind)?,
            agent_name: self.agent_name,
            provider: self.provider,
            model: self.model,
            mode: self.mode,
            status: deserialize_enum::<LaunchTaskStepStatus>(&self.status)?,
            linked_run_id: self
                .linked_run_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(RunId),
            linked_conversation_id: self
                .linked_conversation_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(ConversationId),
            linked_orchestrator_session_id: self
                .linked_orchestrator_session_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(OrchestratorSessionId),
            summary: self.summary,
            structured_result,
            failure_classification,
            auto_resume_count: u32::try_from(self.auto_resume_count).with_context(|| {
                format!(
                    "launch_task_step auto_resume_count overflow: {}",
                    self.auto_resume_count
                )
            })?,
            resume_key: self.resume_key,
            created_at: decode_rfc3339(&self.created_at)?,
            updated_at: decode_rfc3339(&self.updated_at)?,
        })
    }
}
