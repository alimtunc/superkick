//! SUP-102: SQLite persistence for `OrchestratorSession` + `OrchestratorCheckpoint`.
//!
//! Mirrors `sqlite/handoffs.rs`: a `Row` struct with `into_domain()` parses
//! IDs and JSON columns back into core types. Enum codec is shared with the
//! rest of the storage layer (`super::codec`).
//!
//! `insert_checkpoint` is the only multi-row write: it appends the checkpoint
//! and bumps the parent session's denormalised pointers in the same
//! transaction so the pointer cannot reference a missing row.

use anyhow::{Context, Result, anyhow};
use sqlx::SqlitePool;
use superkick_core::{
    AgentProvider, EventId, HandoffId, OperatorId, OrchestratorCheckpoint,
    OrchestratorCheckpointId, OrchestratorScope, OrchestratorSession, OrchestratorSessionId,
    OrchestratorStatus, RunId, RuntimeProviderId,
};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::OrchestratorSessionRepo;

pub struct SqliteOrchestratorSessionRepo {
    pool: SqlitePool,
}

impl SqliteOrchestratorSessionRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

impl OrchestratorSessionRepo for SqliteOrchestratorSessionRepo {
    async fn insert(&self, s: &OrchestratorSession) -> Result<()> {
        sqlx::query(
            "INSERT INTO orchestrator_sessions (\
                 id, title, provider, runtime_provider_id, status, owner, scope_json, \
                 provider_session_id, latest_checkpoint_id, last_event_cursor, \
                 created_at, updated_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        )
        .bind(s.id.0.to_string())
        .bind(&s.title)
        .bind(serialize_enum(&s.provider)?)
        .bind(s.runtime_provider_id.map(|id| id.0.to_string()))
        .bind(serialize_enum(&s.status)?)
        .bind(&s.owner.0)
        .bind(serde_json::to_string(&s.scope)?)
        .bind(s.provider_session_id.clone())
        .bind(s.latest_checkpoint_id.map(|id| id.0.to_string()))
        .bind(s.last_event_cursor.map(|id| id.0.to_string()))
        .bind(s.created_at.to_rfc3339())
        .bind(s.updated_at.to_rfc3339())
        .execute(&self.pool)
        .await
        .with_context(|| format!("insert orchestrator_session {}", s.id.0))?;
        Ok(())
    }

    async fn get(&self, id: OrchestratorSessionId) -> Result<Option<OrchestratorSession>> {
        let row = sqlx::query_as::<_, OrchestratorSessionRow>(
            "SELECT * FROM orchestrator_sessions WHERE id = ?1",
        )
        .bind(id.0.to_string())
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get orchestrator_session {}", id.0))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_status(&self, status: OrchestratorStatus) -> Result<Vec<OrchestratorSession>> {
        let rows = sqlx::query_as::<_, OrchestratorSessionRow>(
            "SELECT * FROM orchestrator_sessions WHERE status = ?1 ORDER BY created_at",
        )
        .bind(serialize_enum(&status)?)
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list orchestrator_sessions by status {status:?}"))?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn list_all(&self) -> Result<Vec<OrchestratorSession>> {
        let rows = sqlx::query_as::<_, OrchestratorSessionRow>(
            "SELECT * FROM orchestrator_sessions ORDER BY created_at",
        )
        .fetch_all(&self.pool)
        .await
        .context("list all orchestrator_sessions")?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn list_by_issue_identifier(
        &self,
        issue_identifier: &str,
    ) -> Result<Vec<OrchestratorSession>> {
        // `linear_issue_ids` lives inside `scope_json` so we filter
        // post-deserialisation. Volume is bounded (sessions are top-level
        // operator artifacts) — see SUP-102 plan risk 2 for the trade-off.
        let rows = sqlx::query_as::<_, OrchestratorSessionRow>(
            "SELECT * FROM orchestrator_sessions ORDER BY created_at",
        )
        .fetch_all(&self.pool)
        .await
        .with_context(|| {
            format!("list orchestrator_sessions by issue_identifier {issue_identifier}")
        })?;
        rows.into_iter()
            .map(|r| r.into_domain())
            .filter(|res| match res {
                Ok(session) => session
                    .scope
                    .linear_issue_ids
                    .iter()
                    .any(|id| id == issue_identifier),
                // Keep deserialisation errors in the stream so the surrounding
                // `collect::<Result<...>>` propagates them; do not silently
                // drop them via `filter_map(|r| r.ok())`.
                Err(_) => true,
            })
            .collect()
    }

    async fn update(&self, s: &OrchestratorSession) -> Result<()> {
        let result = sqlx::query(
            "UPDATE orchestrator_sessions SET \
                 title = ?1, provider = ?2, runtime_provider_id = ?3, status = ?4, owner = ?5, \
                 scope_json = ?6, provider_session_id = ?7, latest_checkpoint_id = ?8, \
                 last_event_cursor = ?9, updated_at = ?10 \
             WHERE id = ?11",
        )
        .bind(&s.title)
        .bind(serialize_enum(&s.provider)?)
        .bind(s.runtime_provider_id.map(|id| id.0.to_string()))
        .bind(serialize_enum(&s.status)?)
        .bind(&s.owner.0)
        .bind(serde_json::to_string(&s.scope)?)
        .bind(s.provider_session_id.clone())
        .bind(s.latest_checkpoint_id.map(|id| id.0.to_string()))
        .bind(s.last_event_cursor.map(|id| id.0.to_string()))
        .bind(s.updated_at.to_rfc3339())
        .bind(s.id.0.to_string())
        .execute(&self.pool)
        .await
        .with_context(|| format!("update orchestrator_session {}", s.id.0))?;
        if result.rows_affected() == 0 {
            return Err(anyhow!("orchestrator_session {} not found", s.id.0));
        }
        Ok(())
    }

    async fn set_provider_session_id(
        &self,
        id: OrchestratorSessionId,
        provider_session_id: &str,
    ) -> Result<()> {
        let result = sqlx::query(
            "UPDATE orchestrator_sessions SET provider_session_id = ?1, updated_at = ?2 \
             WHERE id = ?3",
        )
        .bind(provider_session_id)
        .bind(now_rfc3339())
        .bind(id.0.to_string())
        .execute(&self.pool)
        .await
        .with_context(|| format!("set provider_session_id for orchestrator_session {}", id.0))?;
        if result.rows_affected() == 0 {
            return Err(anyhow!("orchestrator_session {} not found", id.0));
        }
        Ok(())
    }

    async fn insert_checkpoint(&self, c: &OrchestratorCheckpoint) -> Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for insert_checkpoint")?;

        sqlx::query(
            "INSERT INTO orchestrator_checkpoints (\
                 id, session_id, summary, covers_from_event, covers_to_event, \
                 decisions_json, open_questions_json, child_run_ids_json, \
                 child_handoff_ids_json, created_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )
        .bind(c.id.0.to_string())
        .bind(c.session_id.0.to_string())
        .bind(&c.summary)
        .bind(c.covers_from_event.map(|id| id.0.to_string()))
        .bind(c.covers_to_event.map(|id| id.0.to_string()))
        .bind(serde_json::to_string(&c.decisions)?)
        .bind(serde_json::to_string(&c.open_questions)?)
        .bind(serde_json::to_string(&c.child_run_ids)?)
        .bind(serde_json::to_string(&c.child_handoff_ids)?)
        .bind(c.created_at.to_rfc3339())
        .execute(&mut *tx)
        .await
        .with_context(|| {
            format!(
                "insert orchestrator_checkpoint {} for orchestrator_session {}",
                c.id.0, c.session_id.0
            )
        })?;

        // Advance the session's denormalised pointers. `last_event_cursor`
        // mirrors the checkpoint's `covers_to_event` when set — a fresh
        // checkpoint always covers up to (or past) the previous cursor.
        let result = sqlx::query(
            "UPDATE orchestrator_sessions SET \
                 latest_checkpoint_id = ?1, \
                 last_event_cursor = COALESCE(?2, last_event_cursor), \
                 updated_at = ?3 \
             WHERE id = ?4",
        )
        .bind(c.id.0.to_string())
        .bind(c.covers_to_event.map(|id| id.0.to_string()))
        .bind(now_rfc3339())
        .bind(c.session_id.0.to_string())
        .execute(&mut *tx)
        .await
        .with_context(|| {
            format!(
                "advance orchestrator_session {} pointers for checkpoint {}",
                c.session_id.0, c.id.0
            )
        })?;

        if result.rows_affected() == 0 {
            return Err(anyhow!(
                "orchestrator_session {} not found while inserting checkpoint {}",
                c.session_id.0,
                c.id.0
            ));
        }

        tx.commit()
            .await
            .context("commit transaction for insert_checkpoint")?;
        Ok(())
    }

    async fn list_checkpoints_by_session(
        &self,
        id: OrchestratorSessionId,
    ) -> Result<Vec<OrchestratorCheckpoint>> {
        let rows = sqlx::query_as::<_, OrchestratorCheckpointRow>(
            "SELECT * FROM orchestrator_checkpoints WHERE session_id = ?1 ORDER BY created_at",
        )
        .bind(id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list orchestrator_checkpoints for session {}", id.0))?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn latest_checkpoint(
        &self,
        id: OrchestratorSessionId,
    ) -> Result<Option<OrchestratorCheckpoint>> {
        let row = sqlx::query_as::<_, OrchestratorCheckpointRow>(
            "SELECT * FROM orchestrator_checkpoints \
             WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(id.0.to_string())
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get latest orchestrator_checkpoint for session {}", id.0))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn get_checkpoint(
        &self,
        id: OrchestratorCheckpointId,
    ) -> Result<Option<OrchestratorCheckpoint>> {
        let row = sqlx::query_as::<_, OrchestratorCheckpointRow>(
            "SELECT * FROM orchestrator_checkpoints WHERE id = ?1",
        )
        .bind(id.0.to_string())
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get orchestrator_checkpoint {}", id.0))?;
        row.map(|r| r.into_domain()).transpose()
    }
}

#[derive(sqlx::FromRow)]
struct OrchestratorSessionRow {
    id: String,
    title: String,
    provider: String,
    runtime_provider_id: Option<String>,
    status: String,
    owner: String,
    scope_json: String,
    provider_session_id: Option<String>,
    latest_checkpoint_id: Option<String>,
    last_event_cursor: Option<String>,
    created_at: String,
    updated_at: String,
}

impl OrchestratorSessionRow {
    fn into_domain(self) -> Result<OrchestratorSession> {
        Ok(OrchestratorSession {
            id: OrchestratorSessionId(uuid::Uuid::parse_str(&self.id)?),
            title: self.title,
            provider: deserialize_enum::<AgentProvider>(&self.provider)?,
            runtime_provider_id: self
                .runtime_provider_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(RuntimeProviderId),
            status: deserialize_enum::<OrchestratorStatus>(&self.status)?,
            owner: OperatorId(self.owner),
            scope: serde_json::from_str::<OrchestratorScope>(&self.scope_json)?,
            provider_session_id: self.provider_session_id,
            latest_checkpoint_id: self
                .latest_checkpoint_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(OrchestratorCheckpointId),
            last_event_cursor: self
                .last_event_cursor
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(EventId),
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
            updated_at: chrono::DateTime::parse_from_rfc3339(&self.updated_at)?.to_utc(),
        })
    }
}

#[derive(sqlx::FromRow)]
struct OrchestratorCheckpointRow {
    id: String,
    session_id: String,
    summary: String,
    covers_from_event: Option<String>,
    covers_to_event: Option<String>,
    decisions_json: String,
    open_questions_json: String,
    child_run_ids_json: String,
    child_handoff_ids_json: String,
    created_at: String,
}

impl OrchestratorCheckpointRow {
    fn into_domain(self) -> Result<OrchestratorCheckpoint> {
        Ok(OrchestratorCheckpoint {
            id: OrchestratorCheckpointId(uuid::Uuid::parse_str(&self.id)?),
            session_id: OrchestratorSessionId(uuid::Uuid::parse_str(&self.session_id)?),
            summary: self.summary,
            covers_from_event: self
                .covers_from_event
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(EventId),
            covers_to_event: self
                .covers_to_event
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(EventId),
            decisions: serde_json::from_str::<Vec<String>>(&self.decisions_json)?,
            open_questions: serde_json::from_str::<Vec<String>>(&self.open_questions_json)?,
            child_run_ids: serde_json::from_str::<Vec<RunId>>(&self.child_run_ids_json)?,
            child_handoff_ids: serde_json::from_str::<Vec<HandoffId>>(
                &self.child_handoff_ids_json,
            )?,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
        })
    }
}
