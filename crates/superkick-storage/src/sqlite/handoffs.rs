use anyhow::{Result, anyhow};
use sqlx::SqlitePool;
use superkick_core::{
    AgentSessionId, Handoff, HandoffFailure, HandoffId, HandoffKind, HandoffPayload, HandoffResult,
    HandoffStatus, RunId, StepId,
};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::HandoffRepo;

pub struct SqliteHandoffRepo {
    pool: SqlitePool,
}

impl SqliteHandoffRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl HandoffRepo for SqliteHandoffRepo {
    async fn insert(&self, h: &Handoff) -> Result<()> {
        sqlx::query(
            "INSERT INTO handoffs (\
                 id, run_id, origin_step_id, from_session_id, to_role, to_session_id, \
                 kind, payload_json, status, result_json, failure_json, parent_handoff, \
                 created_at, delivered_at, completed_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        )
        .bind(h.id.0.to_string())
        .bind(h.run_id.0.to_string())
        .bind(h.origin_step_id.0.to_string())
        .bind(h.from_session_id.map(|id| id.0.to_string()))
        .bind(&h.to_role)
        .bind(h.to_session_id.map(|id| id.0.to_string()))
        .bind(serialize_enum(&h.kind)?)
        .bind(serde_json::to_string(&h.payload)?)
        .bind(serialize_enum(&h.status)?)
        .bind(h.result.as_ref().map(serde_json::to_string).transpose()?)
        .bind(h.failure.as_ref().map(serde_json::to_string).transpose()?)
        .bind(h.parent_handoff.map(|id| id.0.to_string()))
        .bind(h.created_at.to_rfc3339())
        .bind(h.delivered_at.map(|t| t.to_rfc3339()))
        .bind(h.completed_at.map(|t| t.to_rfc3339()))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get(&self, id: HandoffId) -> Result<Option<Handoff>> {
        let row = sqlx::query_as::<_, HandoffRow>("SELECT * FROM handoffs WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<Handoff>> {
        let rows = sqlx::query_as::<_, HandoffRow>(
            "SELECT * FROM handoffs WHERE run_id = ?1 ORDER BY created_at",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn update(&self, h: &Handoff) -> Result<()> {
        let result = sqlx::query(
            "UPDATE handoffs SET \
                 to_session_id = ?1, status = ?2, result_json = ?3, failure_json = ?4, \
                 delivered_at = ?5, completed_at = ?6 \
             WHERE id = ?7",
        )
        .bind(h.to_session_id.map(|id| id.0.to_string()))
        .bind(serialize_enum(&h.status)?)
        .bind(h.result.as_ref().map(serde_json::to_string).transpose()?)
        .bind(h.failure.as_ref().map(serde_json::to_string).transpose()?)
        .bind(h.delivered_at.map(|t| t.to_rfc3339()))
        .bind(h.completed_at.map(|t| t.to_rfc3339()))
        .bind(h.id.0.to_string())
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(anyhow!("handoff {} not found", h.id.0));
        }
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct HandoffRow {
    id: String,
    run_id: String,
    origin_step_id: String,
    from_session_id: Option<String>,
    to_role: String,
    to_session_id: Option<String>,
    kind: String,
    payload_json: String,
    status: String,
    result_json: Option<String>,
    failure_json: Option<String>,
    parent_handoff: Option<String>,
    created_at: String,
    delivered_at: Option<String>,
    completed_at: Option<String>,
}

impl HandoffRow {
    fn into_domain(self) -> Result<Handoff> {
        Ok(Handoff {
            id: HandoffId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            origin_step_id: StepId(uuid::Uuid::parse_str(&self.origin_step_id)?),
            from_session_id: self
                .from_session_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(AgentSessionId),
            to_role: self.to_role,
            to_session_id: self
                .to_session_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(AgentSessionId),
            kind: deserialize_enum::<HandoffKind>(&self.kind)?,
            payload: serde_json::from_str::<HandoffPayload>(&self.payload_json)?,
            status: deserialize_enum::<HandoffStatus>(&self.status)?,
            result: self
                .result_json
                .as_deref()
                .map(serde_json::from_str::<HandoffResult>)
                .transpose()?,
            failure: self
                .failure_json
                .as_deref()
                .map(serde_json::from_str::<HandoffFailure>)
                .transpose()?,
            parent_handoff: self
                .parent_handoff
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(HandoffId),
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
            delivered_at: self
                .delivered_at
                .as_deref()
                .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
                .transpose()?,
            completed_at: self
                .completed_at
                .as_deref()
                .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
                .transpose()?,
        })
    }
}
