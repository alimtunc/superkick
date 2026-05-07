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
    ConversationId, LaunchRecipe, LaunchStepKind, LaunchTask, LaunchTaskId, LaunchTaskStatus,
    LaunchTaskStep, LaunchTaskStepId, LaunchTaskStepStatus, OrchestratorSessionId, RunId,
};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::LaunchTaskRepo;

pub struct SqliteLaunchTaskRepo {
    pool: SqlitePool,
}

impl SqliteLaunchTaskRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl LaunchTaskRepo for SqliteLaunchTaskRepo {
    async fn insert_with_steps(&self, task: &LaunchTask, steps: &[LaunchTaskStep]) -> Result<()> {
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            "INSERT INTO launch_tasks (\
                 id, linear_issue_id, recipe_kind, status, current_step_id, summary, \
                 created_at, updated_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(task.id.0.to_string())
        .bind(&task.linear_issue_id)
        .bind(serialize_enum(&task.recipe_kind)?)
        .bind(serialize_enum(&task.status)?)
        .bind(task.current_step_id.map(|id| id.0.to_string()))
        .bind(task.summary.clone())
        .bind(task.created_at.to_rfc3339())
        .bind(task.updated_at.to_rfc3339())
        .execute(&mut *tx)
        .await?;

        for step in steps {
            sqlx::query(
                "INSERT INTO launch_task_steps (\
                     id, launch_task_id, sequence, step_kind, agent_name, \
                     provider, model, mode, status, \
                     linked_run_id, linked_conversation_id, linked_orchestrator_session_id, \
                     summary, created_at, updated_at\
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
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
            .bind(step.created_at.to_rfc3339())
            .bind(step.updated_at.to_rfc3339())
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn get(&self, id: LaunchTaskId) -> Result<Option<LaunchTask>> {
        let row = sqlx::query_as::<_, LaunchTaskRow>("SELECT * FROM launch_tasks WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn get_by_linear_issue(&self, linear_issue_id: &str) -> Result<Option<LaunchTask>> {
        let row = sqlx::query_as::<_, LaunchTaskRow>(
            "SELECT * FROM launch_tasks WHERE linear_issue_id = ?1 \
             ORDER BY created_at DESC LIMIT 1",
        )
        .bind(linear_issue_id)
        .fetch_optional(&self.pool)
        .await?;
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
        let rows: Vec<LaunchTaskRow> = qb.build_query_as().fetch_all(&self.pool).await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn list_steps(&self, task_id: LaunchTaskId) -> Result<Vec<LaunchTaskStep>> {
        let rows = sqlx::query_as::<_, LaunchTaskStepRow>(
            "SELECT * FROM launch_task_steps WHERE launch_task_id = ?1 ORDER BY sequence",
        )
        .bind(task_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn update_task_status(
        &self,
        id: LaunchTaskId,
        new_status: LaunchTaskStatus,
    ) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query_as::<_, LaunchTaskRow>("SELECT * FROM launch_tasks WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&mut *tx)
            .await?
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
        .await?;
        if result.rows_affected() == 0 {
            return Err(anyhow!(
                "launch_task {} concurrent state change (no longer at {})",
                id.0,
                old_status
            ));
        }
        tx.commit().await?;
        Ok(())
    }

    async fn update_step_status(
        &self,
        id: LaunchTaskStepId,
        new_status: LaunchTaskStepStatus,
    ) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        let row =
            sqlx::query_as::<_, LaunchTaskStepRow>("SELECT * FROM launch_task_steps WHERE id = ?1")
                .bind(id.0.to_string())
                .fetch_optional(&mut *tx)
                .await?
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
        .await?;
        if result.rows_affected() == 0 {
            return Err(anyhow!(
                "launch_task_step {} concurrent state change (no longer at {})",
                id.0,
                old_status
            ));
        }
        tx.commit().await?;
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
                .await?
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
        .await?;
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
        let mut tx = self.pool.begin().await?;

        let task_exists: Option<(String,)> =
            sqlx::query_as("SELECT id FROM launch_tasks WHERE id = ?1")
                .bind(task_id.0.to_string())
                .fetch_optional(&mut *tx)
                .await?;
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
            .await?;
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
            .await?;
        tx.commit().await?;
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
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
            updated_at: chrono::DateTime::parse_from_rfc3339(&self.updated_at)?.to_utc(),
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
    created_at: String,
    updated_at: String,
}

impl LaunchTaskStepRow {
    fn into_domain(self) -> Result<LaunchTaskStep> {
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
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
            updated_at: chrono::DateTime::parse_from_rfc3339(&self.updated_at)?.to_utc(),
        })
    }
}
