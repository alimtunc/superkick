//! SQLite persistence for `SessionLifecycleEvent` — the append-only audit
//! stream introduced by SUP-79's spawn-and-observe orchestrator runtime.

use anyhow::Result;
use chrono::DateTime;
use sqlx::SqlitePool;

use superkick_core::{
    AgentSessionId, HandoffId, LaunchReason, RunId, SessionLifecycleEvent, SessionLifecycleEventId,
    SessionLifecyclePhase, StepId,
};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::SessionLifecycleRepo;

pub struct SqliteSessionLifecycleRepo {
    pool: SqlitePool,
}

impl SqliteSessionLifecycleRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl SessionLifecycleRepo for SqliteSessionLifecycleRepo {
    async fn insert(&self, event: &SessionLifecycleEvent) -> Result<()> {
        let launch_reason = event
            .launch_reason
            .as_ref()
            .map(serialize_enum)
            .transpose()?;
        sqlx::query(
            "INSERT INTO session_lifecycle_events (\
                 id, session_id, run_id, step_id, role, parent_session_id, \
                 launch_reason, handoff_id, phase_tag, phase_json, ts\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )
        .bind(event.id.0.to_string())
        .bind(event.session_id.0.to_string())
        .bind(event.run_id.0.to_string())
        .bind(event.step_id.0.to_string())
        .bind(event.role.as_deref())
        .bind(event.parent_session_id.map(|id| id.0.to_string()))
        .bind(launch_reason)
        .bind(event.handoff_id.map(|id| id.0.to_string()))
        .bind(event.phase.tag())
        .bind(serde_json::to_string(&event.phase)?)
        .bind(event.ts.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_by_session(
        &self,
        session_id: AgentSessionId,
    ) -> Result<Vec<SessionLifecycleEvent>> {
        let rows = sqlx::query_as::<_, LifecycleRow>(
            "SELECT id, session_id, run_id, step_id, role, parent_session_id, \
                    launch_reason, handoff_id, phase_json, ts \
             FROM session_lifecycle_events \
             WHERE session_id = ?1 ORDER BY ts, id",
        )
        .bind(session_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<SessionLifecycleEvent>> {
        let rows = sqlx::query_as::<_, LifecycleRow>(
            "SELECT id, session_id, run_id, step_id, role, parent_session_id, \
                    launch_reason, handoff_id, phase_json, ts \
             FROM session_lifecycle_events \
             WHERE run_id = ?1 ORDER BY ts, id",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }
}

#[derive(sqlx::FromRow)]
struct LifecycleRow {
    id: String,
    session_id: String,
    run_id: String,
    step_id: String,
    role: Option<String>,
    parent_session_id: Option<String>,
    launch_reason: Option<String>,
    handoff_id: Option<String>,
    phase_json: String,
    ts: String,
}

impl LifecycleRow {
    fn into_domain(self) -> Result<SessionLifecycleEvent> {
        Ok(SessionLifecycleEvent {
            id: SessionLifecycleEventId(uuid::Uuid::parse_str(&self.id)?),
            session_id: AgentSessionId(uuid::Uuid::parse_str(&self.session_id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            step_id: StepId(uuid::Uuid::parse_str(&self.step_id)?),
            role: self.role,
            parent_session_id: self
                .parent_session_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(AgentSessionId),
            launch_reason: self
                .launch_reason
                .as_deref()
                .map(deserialize_enum::<LaunchReason>)
                .transpose()?,
            handoff_id: self
                .handoff_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(HandoffId),
            phase: serde_json::from_str::<SessionLifecyclePhase>(&self.phase_json)?,
            ts: DateTime::parse_from_rfc3339(&self.ts)?.to_utc(),
        })
    }
}
