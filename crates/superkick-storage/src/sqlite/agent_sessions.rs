use anyhow::Result;
use sqlx::SqlitePool;
use superkick_core::{AgentProvider, AgentSession, AgentSessionId, AgentStatus, RunId, StepId};

use crate::repo::AgentSessionRepo;

pub struct SqliteAgentSessionRepo {
    pool: SqlitePool,
}

impl SqliteAgentSessionRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl AgentSessionRepo for SqliteAgentSessionRepo {
    async fn insert(&self, session: &AgentSession) -> Result<()> {
        sqlx::query(
            "INSERT INTO agent_sessions (id, run_id, run_step_id, provider, command, pid, status, started_at, finished_at, exit_code)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )
        .bind(session.id.0.to_string())
        .bind(session.run_id.0.to_string())
        .bind(session.run_step_id.0.to_string())
        .bind(session.provider.to_string())
        .bind(&session.command)
        .bind(session.pid.map(|p| p as i64))
        .bind(ser_enum(&session.status))
        .bind(session.started_at.to_rfc3339())
        .bind(session.finished_at.map(|t| t.to_rfc3339()))
        .bind(session.exit_code)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get(&self, id: AgentSessionId) -> Result<Option<AgentSession>> {
        let row = sqlx::query_as::<_, SessionRow>("SELECT * FROM agent_sessions WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<AgentSession>> {
        let rows = sqlx::query_as::<_, SessionRow>(
            "SELECT * FROM agent_sessions WHERE run_id = ?1 ORDER BY started_at",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn update(&self, session: &AgentSession) -> Result<()> {
        sqlx::query(
            "UPDATE agent_sessions SET status = ?1, pid = ?2, finished_at = ?3, exit_code = ?4 WHERE id = ?5",
        )
        .bind(ser_enum(&session.status))
        .bind(session.pid.map(|p| p as i64))
        .bind(session.finished_at.map(|t| t.to_rfc3339()))
        .bind(session.exit_code)
        .bind(session.id.0.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct SessionRow {
    id: String,
    run_id: String,
    run_step_id: String,
    provider: String,
    command: String,
    pid: Option<i64>,
    status: String,
    started_at: String,
    finished_at: Option<String>,
    exit_code: Option<i32>,
}

impl SessionRow {
    fn into_domain(self) -> Result<AgentSession> {
        Ok(AgentSession {
            id: AgentSessionId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            run_step_id: StepId(uuid::Uuid::parse_str(&self.run_step_id)?),
            provider: de_enum::<AgentProvider>(&self.provider)?,
            command: self.command,
            pid: self.pid.map(|p| p as u32),
            status: de_enum::<AgentStatus>(&self.status)?,
            started_at: chrono::DateTime::parse_from_rfc3339(&self.started_at)?.to_utc(),
            finished_at: self
                .finished_at
                .as_deref()
                .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
                .transpose()?,
            exit_code: self.exit_code,
        })
    }
}

fn ser_enum<T: serde::Serialize>(val: &T) -> String {
    serde_json::to_string(val)
        .expect("enum serialization cannot fail")
        .trim_matches('"')
        .to_string()
}

fn de_enum<T: serde::de::DeserializeOwned>(s: &str) -> Result<T> {
    let quoted = format!("\"{s}\"");
    Ok(serde_json::from_str(&quoted)?)
}
