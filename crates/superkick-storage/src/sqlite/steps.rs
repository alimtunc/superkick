use anyhow::Result;
use sqlx::SqlitePool;
use superkick_core::{RunId, RunStep, StepId, StepKey, StepStatus};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::RunStepRepo;

pub struct SqliteRunStepRepo {
    pool: SqlitePool,
}

impl SqliteRunStepRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl RunStepRepo for SqliteRunStepRepo {
    async fn insert(&self, step: &RunStep) -> Result<()> {
        sqlx::query(
            "INSERT INTO run_steps (id, run_id, step_key, status, attempt, agent_provider, started_at, finished_at, input_json, output_json, error_message)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )
        .bind(step.id.0.to_string())
        .bind(step.run_id.0.to_string())
        .bind(step.step_key.to_string())
        .bind(serialize_enum(&step.status)?)
        .bind(step.attempt as i64)
        .bind(&step.agent_provider)
        .bind(step.started_at.map(|t| t.to_rfc3339()))
        .bind(step.finished_at.map(|t| t.to_rfc3339()))
        .bind(step.input_json.as_ref().map(|v| v.to_string()))
        .bind(step.output_json.as_ref().map(|v| v.to_string()))
        .bind(&step.error_message)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get(&self, id: StepId) -> Result<Option<RunStep>> {
        let row = sqlx::query_as::<_, StepRow>("SELECT * FROM run_steps WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<RunStep>> {
        let rows = sqlx::query_as::<_, StepRow>(
            "SELECT * FROM run_steps WHERE run_id = ?1 ORDER BY attempt",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn update(&self, step: &RunStep) -> Result<()> {
        sqlx::query(
            "UPDATE run_steps SET status = ?1, agent_provider = ?2, started_at = ?3, finished_at = ?4, input_json = ?5, output_json = ?6, error_message = ?7 WHERE id = ?8",
        )
        .bind(serialize_enum(&step.status)?)
        .bind(&step.agent_provider)
        .bind(step.started_at.map(|t| t.to_rfc3339()))
        .bind(step.finished_at.map(|t| t.to_rfc3339()))
        .bind(step.input_json.as_ref().map(|v| v.to_string()))
        .bind(step.output_json.as_ref().map(|v| v.to_string()))
        .bind(&step.error_message)
        .bind(step.id.0.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct StepRow {
    id: String,
    run_id: String,
    step_key: String,
    status: String,
    attempt: i64,
    agent_provider: Option<String>,
    started_at: Option<String>,
    finished_at: Option<String>,
    input_json: Option<String>,
    output_json: Option<String>,
    error_message: Option<String>,
}

impl StepRow {
    fn into_domain(self) -> Result<RunStep> {
        Ok(RunStep {
            id: StepId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            step_key: deserialize_enum::<StepKey>(&self.step_key)?,
            status: deserialize_enum::<StepStatus>(&self.status)?,
            attempt: self.attempt as u32,
            agent_provider: self.agent_provider,
            started_at: self
                .started_at
                .as_deref()
                .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
                .transpose()?,
            finished_at: self
                .finished_at
                .as_deref()
                .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
                .transpose()?,
            input_json: self
                .input_json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()?,
            output_json: self
                .output_json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()?,
            error_message: self.error_message,
        })
    }
}
