use anyhow::Result;
use sqlx::SqlitePool;
use superkick_core::{Interrupt, InterruptId, InterruptStatus, RunId, StepId};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::InterruptRepo;

pub struct SqliteInterruptRepo {
    pool: SqlitePool,
}

impl SqliteInterruptRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl InterruptRepo for SqliteInterruptRepo {
    async fn insert(&self, interrupt: &Interrupt) -> Result<()> {
        sqlx::query(
            "INSERT INTO interrupts (id, run_id, run_step_id, question, context_json, status, answer_json, created_at, resolved_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )
        .bind(interrupt.id.0.to_string())
        .bind(interrupt.run_id.0.to_string())
        .bind(interrupt.run_step_id.map(|id| id.0.to_string()))
        .bind(&interrupt.question)
        .bind(interrupt.context_json.as_ref().map(|v| v.to_string()))
        .bind(serialize_enum(&interrupt.status)?)
        .bind(interrupt.answer_json.as_ref().map(|v| v.to_string()))
        .bind(interrupt.created_at.to_rfc3339())
        .bind(interrupt.resolved_at.map(|t| t.to_rfc3339()))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get(&self, id: InterruptId) -> Result<Option<Interrupt>> {
        let row = sqlx::query_as::<_, InterruptRow>("SELECT * FROM interrupts WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<Interrupt>> {
        let rows = sqlx::query_as::<_, InterruptRow>(
            "SELECT * FROM interrupts WHERE run_id = ?1 ORDER BY created_at",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn update(&self, interrupt: &Interrupt) -> Result<()> {
        sqlx::query(
            "UPDATE interrupts SET status = ?1, answer_json = ?2, resolved_at = ?3 WHERE id = ?4",
        )
        .bind(serialize_enum(&interrupt.status)?)
        .bind(interrupt.answer_json.as_ref().map(|v| v.to_string()))
        .bind(interrupt.resolved_at.map(|t| t.to_rfc3339()))
        .bind(interrupt.id.0.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct InterruptRow {
    id: String,
    run_id: String,
    run_step_id: Option<String>,
    question: String,
    context_json: Option<String>,
    status: String,
    answer_json: Option<String>,
    created_at: String,
    resolved_at: Option<String>,
}

impl InterruptRow {
    fn into_domain(self) -> Result<Interrupt> {
        Ok(Interrupt {
            id: InterruptId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            run_step_id: self
                .run_step_id
                .as_deref()
                .map(|s| uuid::Uuid::parse_str(s).map(StepId))
                .transpose()?,
            question: self.question,
            context_json: self
                .context_json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()?,
            status: deserialize_enum::<InterruptStatus>(&self.status)?,
            answer_json: self
                .answer_json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()?,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
            resolved_at: self
                .resolved_at
                .as_deref()
                .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
                .transpose()?,
        })
    }
}
