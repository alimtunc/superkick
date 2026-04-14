use anyhow::{Result, anyhow};
use sqlx::SqlitePool;
use superkick_core::{
    AttentionKind, AttentionReply, AttentionRequest, AttentionRequestId, AttentionStatus, RunId,
};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::AttentionRequestRepo;

pub struct SqliteAttentionRequestRepo {
    pool: SqlitePool,
}

impl SqliteAttentionRequestRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl AttentionRequestRepo for SqliteAttentionRequestRepo {
    async fn insert(&self, request: &AttentionRequest) -> Result<()> {
        let options_json = request
            .options
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let reply_json = request
            .reply
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;

        sqlx::query(
            "INSERT INTO attention_requests (id, run_id, kind, title, body, options_json, status, reply_json, replied_by, created_at, replied_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )
        .bind(request.id.0.to_string())
        .bind(request.run_id.0.to_string())
        .bind(serialize_enum(&request.kind)?)
        .bind(&request.title)
        .bind(&request.body)
        .bind(options_json)
        .bind(serialize_enum(&request.status)?)
        .bind(reply_json)
        .bind(&request.replied_by)
        .bind(request.created_at.to_rfc3339())
        .bind(request.replied_at.map(|t| t.to_rfc3339()))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get(&self, id: AttentionRequestId) -> Result<Option<AttentionRequest>> {
        let row =
            sqlx::query_as::<_, AttentionRow>("SELECT * FROM attention_requests WHERE id = ?1")
                .bind(id.0.to_string())
                .fetch_optional(&self.pool)
                .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<AttentionRequest>> {
        let rows = sqlx::query_as::<_, AttentionRow>(
            "SELECT * FROM attention_requests WHERE run_id = ?1 ORDER BY created_at",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn update(&self, request: &AttentionRequest) -> Result<()> {
        let reply_json = request
            .reply
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let result = sqlx::query(
            "UPDATE attention_requests
             SET status = ?1, reply_json = ?2, replied_by = ?3, replied_at = ?4
             WHERE id = ?5",
        )
        .bind(serialize_enum(&request.status)?)
        .bind(reply_json)
        .bind(&request.replied_by)
        .bind(request.replied_at.map(|t| t.to_rfc3339()))
        .bind(request.id.0.to_string())
        .execute(&self.pool)
        .await?;
        if result.rows_affected() == 0 {
            return Err(anyhow!("attention request {} not found", request.id.0));
        }
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct AttentionRow {
    id: String,
    run_id: String,
    kind: String,
    title: String,
    body: String,
    options_json: Option<String>,
    status: String,
    reply_json: Option<String>,
    replied_by: Option<String>,
    created_at: String,
    replied_at: Option<String>,
}

impl AttentionRow {
    fn into_domain(self) -> Result<AttentionRequest> {
        Ok(AttentionRequest {
            id: AttentionRequestId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            kind: deserialize_enum::<AttentionKind>(&self.kind)?,
            title: self.title,
            body: self.body,
            options: self
                .options_json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()?,
            status: deserialize_enum::<AttentionStatus>(&self.status)?,
            reply: self
                .reply_json
                .as_deref()
                .map(serde_json::from_str::<AttentionReply>)
                .transpose()?,
            replied_by: self.replied_by,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
            replied_at: self
                .replied_at
                .as_deref()
                .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
                .transpose()?,
        })
    }
}
