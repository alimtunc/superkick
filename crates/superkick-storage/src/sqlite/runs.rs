use anyhow::Result;
use sqlx::SqlitePool;
use superkick_core::{ExecutionMode, Run, RunId, RunState, StepKey, TriggerSource};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::RunRepo;

pub struct SqliteRunRepo {
    pool: SqlitePool,
}

impl SqliteRunRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl RunRepo for SqliteRunRepo {
    async fn insert(&self, run: &Run) -> Result<()> {
        sqlx::query(
            "INSERT INTO runs (id, issue_id, issue_identifier, repo_slug, state, trigger_source, execution_mode, current_step_key, base_branch, use_worktree, worktree_path, branch_name, operator_instructions, started_at, updated_at, finished_at, error_message)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        )
        .bind(run.id.0.to_string())
        .bind(&run.issue_id)
        .bind(&run.issue_identifier)
        .bind(&run.repo_slug)
        .bind(serialize_enum(&run.state)?)
        .bind(serialize_enum(&run.trigger_source)?)
        .bind(serialize_enum(&run.execution_mode)?)
        .bind(run.current_step_key.map(|k| k.to_string()))
        .bind(&run.base_branch)
        .bind(run.use_worktree)
        .bind(&run.worktree_path)
        .bind(&run.branch_name)
        .bind(&run.operator_instructions)
        .bind(run.started_at.to_rfc3339())
        .bind(run.updated_at.to_rfc3339())
        .bind(run.finished_at.map(|t| t.to_rfc3339()))
        .bind(&run.error_message)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get(&self, id: RunId) -> Result<Option<Run>> {
        let row = sqlx::query_as::<_, RunRow>("SELECT * FROM runs WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_all(&self) -> Result<Vec<Run>> {
        let rows = sqlx::query_as::<_, RunRow>("SELECT * FROM runs ORDER BY started_at DESC")
            .fetch_all(&self.pool)
            .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn list_by_issue_id(&self, issue_id: &str) -> Result<Vec<Run>> {
        let rows = sqlx::query_as::<_, RunRow>(
            "SELECT * FROM runs WHERE issue_id = ?1 ORDER BY started_at DESC",
        )
        .bind(issue_id)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn list_by_issue_identifier(&self, issue_identifier: &str) -> Result<Vec<Run>> {
        let rows = sqlx::query_as::<_, RunRow>(
            "SELECT * FROM runs WHERE issue_identifier = ?1 ORDER BY started_at DESC",
        )
        .bind(issue_identifier)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn find_active_by_issue_identifier(&self, issue_identifier: &str) -> Result<Option<Run>> {
        let row = sqlx::query_as::<_, RunRow>(
            "SELECT * FROM runs WHERE issue_identifier = ?1 AND state NOT IN ('completed', 'failed', 'cancelled') LIMIT 1",
        )
        .bind(issue_identifier)
        .fetch_optional(&self.pool)
        .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn update(&self, run: &Run) -> Result<()> {
        sqlx::query(
            "UPDATE runs SET state = ?1, trigger_source = ?2, current_step_key = ?3, worktree_path = ?4, branch_name = ?5, operator_instructions = ?6, updated_at = ?7, finished_at = ?8, error_message = ?9 WHERE id = ?10",
        )
        .bind(serialize_enum(&run.state)?)
        .bind(serialize_enum(&run.trigger_source)?)
        .bind(run.current_step_key.map(|k| k.to_string()))
        .bind(&run.worktree_path)
        .bind(&run.branch_name)
        .bind(&run.operator_instructions)
        .bind(run.updated_at.to_rfc3339())
        .bind(run.finished_at.map(|t| t.to_rfc3339()))
        .bind(&run.error_message)
        .bind(run.id.0.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct RunRow {
    id: String,
    issue_id: String,
    issue_identifier: String,
    repo_slug: String,
    state: String,
    trigger_source: String,
    execution_mode: String,
    current_step_key: Option<String>,
    base_branch: String,
    use_worktree: bool,
    worktree_path: Option<String>,
    branch_name: Option<String>,
    operator_instructions: Option<String>,
    started_at: String,
    updated_at: String,
    finished_at: Option<String>,
    error_message: Option<String>,
}

impl RunRow {
    fn into_domain(self) -> Result<Run> {
        Ok(Run {
            id: RunId(uuid::Uuid::parse_str(&self.id)?),
            issue_id: self.issue_id,
            issue_identifier: self.issue_identifier,
            repo_slug: self.repo_slug,
            state: deserialize_enum::<RunState>(&self.state)?,
            trigger_source: deserialize_enum::<TriggerSource>(&self.trigger_source)?,
            execution_mode: deserialize_enum::<ExecutionMode>(&self.execution_mode)?,
            current_step_key: self
                .current_step_key
                .as_deref()
                .map(deserialize_enum::<StepKey>)
                .transpose()?,
            base_branch: self.base_branch,
            use_worktree: self.use_worktree,
            worktree_path: self.worktree_path,
            branch_name: self.branch_name,
            operator_instructions: self.operator_instructions,
            started_at: chrono::DateTime::parse_from_rfc3339(&self.started_at)?.to_utc(),
            updated_at: chrono::DateTime::parse_from_rfc3339(&self.updated_at)?.to_utc(),
            finished_at: self
                .finished_at
                .as_deref()
                .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
                .transpose()?,
            error_message: self.error_message,
        })
    }
}
