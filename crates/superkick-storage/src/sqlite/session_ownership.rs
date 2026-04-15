//! SUP-48 ownership persistence.
//!
//! The current ownership state lives as denormalised columns on
//! `agent_sessions`; this repo updates those columns and appends rows to
//! `session_ownership_events` for the audit trail. Callers are expected to
//! sequence the two writes via the service layer.

use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use superkick_core::{
    AgentSessionId, OperatorId, OrchestrationOwner, OwnershipEvent, OwnershipEventId,
    OwnershipTransitionReason, RunId, SuspendReason,
};

use crate::repo::{OwnershipSnapshot, SessionOwnershipRepo};

/// SQLite-backed implementation of the ownership repository.
pub struct SqliteSessionOwnershipRepo {
    pool: SqlitePool,
}

impl SqliteSessionOwnershipRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl SessionOwnershipRepo for SqliteSessionOwnershipRepo {
    async fn apply(&self, event: &OwnershipEvent, snapshot_since: DateTime<Utc>) -> Result<()> {
        let mut tx = self.pool.begin().await?;

        // Upsert the snapshot on agent_sessions.
        let serialized = serialize_owner(&event.to)?;
        let result = sqlx::query(
            "UPDATE agent_sessions SET \
                 ownership_state = ?1, \
                 ownership_operator_id = ?2, \
                 ownership_note = ?3, \
                 ownership_suspend_json = ?4, \
                 ownership_since = ?5 \
             WHERE id = ?6",
        )
        .bind(serialized.state)
        .bind(serialized.operator_id)
        .bind(serialized.note)
        .bind(serialized.suspend_json)
        .bind(snapshot_since.to_rfc3339())
        .bind(event.session_id.0.to_string())
        .execute(&mut *tx)
        .await?;

        if result.rows_affected() != 1 {
            return Err(anyhow::anyhow!(
                "ownership snapshot update matched {} rows for session {} (expected 1); aborting transaction",
                result.rows_affected(),
                event.session_id.0
            ));
        }

        // Append the audit row.
        sqlx::query(
            "INSERT INTO session_ownership_events (\
                 id, run_id, session_id, from_state, from_json, to_state, to_json, \
                 reason, operator_id, created_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )
        .bind(event.id.0.to_string())
        .bind(event.run_id.0.to_string())
        .bind(event.session_id.0.to_string())
        .bind(event.from.as_ref().map(|o| o.kind_str().to_string()))
        .bind(event.from.as_ref().map(serde_json::to_string).transpose()?)
        .bind(event.to.kind_str())
        .bind(serde_json::to_string(&event.to)?)
        .bind(reason_str(event.reason))
        .bind(event.operator_id.as_ref().map(|o| o.0.clone()))
        .bind(event.created_at.to_rfc3339())
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    async fn list_by_session(&self, session_id: AgentSessionId) -> Result<Vec<OwnershipEvent>> {
        let rows = sqlx::query_as::<_, OwnershipEventRow>(
            "SELECT * FROM session_ownership_events \
             WHERE session_id = ?1 ORDER BY created_at",
        )
        .bind(session_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn current(&self, session_id: AgentSessionId) -> Result<Option<OwnershipSnapshot>> {
        let row = sqlx::query_as::<_, SnapshotRow>(
            "SELECT id, run_id, ownership_state, ownership_operator_id, ownership_note, \
                    ownership_suspend_json, ownership_since \
             FROM agent_sessions WHERE id = ?1",
        )
        .bind(session_id.0.to_string())
        .fetch_optional(&self.pool)
        .await?;
        row.map(|r| r.into_snapshot()).transpose()
    }

    async fn list_current_by_run(&self, run_id: RunId) -> Result<Vec<OwnershipSnapshot>> {
        let rows = sqlx::query_as::<_, SnapshotRow>(
            "SELECT id, run_id, ownership_state, ownership_operator_id, ownership_note, \
                    ownership_suspend_json, ownership_since \
             FROM agent_sessions WHERE run_id = ?1",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_snapshot()).collect()
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<OwnershipEvent>> {
        let rows = sqlx::query_as::<_, OwnershipEventRow>(
            "SELECT * FROM session_ownership_events \
             WHERE run_id = ?1 ORDER BY created_at",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }
}

/// Denormalised snapshot columns as they will be written to `agent_sessions`.
struct SerializedOwner {
    state: &'static str,
    operator_id: Option<String>,
    note: Option<String>,
    suspend_json: Option<String>,
}

fn serialize_owner(owner: &OrchestrationOwner) -> Result<SerializedOwner> {
    Ok(match owner {
        OrchestrationOwner::Orchestrator => SerializedOwner {
            state: "orchestrator",
            operator_id: None,
            note: None,
            suspend_json: None,
        },
        OrchestrationOwner::Operator { operator_id, note } => SerializedOwner {
            state: "operator",
            operator_id: Some(operator_id.0.clone()),
            note: note.clone(),
            suspend_json: None,
        },
        OrchestrationOwner::Suspended { reason } => SerializedOwner {
            state: "suspended",
            operator_id: None,
            note: None,
            suspend_json: Some(serde_json::to_string(reason)?),
        },
    })
}

fn deserialize_owner(
    state: &str,
    operator_id: Option<&str>,
    note: Option<&str>,
    suspend_json: Option<&str>,
) -> Result<OrchestrationOwner> {
    match state {
        "orchestrator" => Ok(OrchestrationOwner::Orchestrator),
        "operator" => Ok(OrchestrationOwner::Operator {
            operator_id: OperatorId(
                operator_id
                    .ok_or_else(|| anyhow::anyhow!("operator state missing operator_id"))?
                    .to_string(),
            ),
            note: note.map(str::to_string),
        }),
        "suspended" => {
            let json = suspend_json
                .ok_or_else(|| anyhow::anyhow!("suspended state missing suspend json"))?;
            Ok(OrchestrationOwner::Suspended {
                reason: serde_json::from_str::<SuspendReason>(json)?,
            })
        }
        other => Err(anyhow::anyhow!("unknown ownership state: {other}")),
    }
}

fn reason_str(r: OwnershipTransitionReason) -> &'static str {
    match r {
        OwnershipTransitionReason::OperatorTakeover => "operator_takeover",
        OwnershipTransitionReason::OperatorRelease => "operator_release",
        OwnershipTransitionReason::HandoffPending => "handoff_pending",
        OwnershipTransitionReason::HandoffResolved => "handoff_resolved",
        OwnershipTransitionReason::AttentionRaised => "attention_raised",
        OwnershipTransitionReason::AttentionResolved => "attention_resolved",
        OwnershipTransitionReason::SessionEnded => "session_ended",
    }
}

fn parse_reason(s: &str) -> Result<OwnershipTransitionReason> {
    match s {
        "operator_takeover" => Ok(OwnershipTransitionReason::OperatorTakeover),
        "operator_release" => Ok(OwnershipTransitionReason::OperatorRelease),
        "handoff_pending" => Ok(OwnershipTransitionReason::HandoffPending),
        "handoff_resolved" => Ok(OwnershipTransitionReason::HandoffResolved),
        "attention_raised" => Ok(OwnershipTransitionReason::AttentionRaised),
        "attention_resolved" => Ok(OwnershipTransitionReason::AttentionResolved),
        "session_ended" => Ok(OwnershipTransitionReason::SessionEnded),
        other => Err(anyhow::anyhow!("unknown transition reason: {other}")),
    }
}

#[derive(sqlx::FromRow)]
struct OwnershipEventRow {
    id: String,
    run_id: String,
    session_id: String,
    // `from_state` / `to_state` are denormalised discriminator columns kept in
    // SQL for cheap index filtering; the canonical shape is in the `*_json`
    // columns, so Rust never reads these fields back.
    #[allow(dead_code)]
    from_state: Option<String>,
    from_json: Option<String>,
    #[allow(dead_code)]
    to_state: String,
    to_json: String,
    reason: String,
    operator_id: Option<String>,
    created_at: String,
}

impl OwnershipEventRow {
    fn into_domain(self) -> Result<OwnershipEvent> {
        let to = serde_json::from_str::<OrchestrationOwner>(&self.to_json)?;
        let from = self
            .from_json
            .as_deref()
            .map(serde_json::from_str::<OrchestrationOwner>)
            .transpose()?;

        Ok(OwnershipEvent {
            id: OwnershipEventId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            session_id: AgentSessionId(uuid::Uuid::parse_str(&self.session_id)?),
            from,
            to,
            reason: parse_reason(&self.reason)?,
            operator_id: self.operator_id.map(OperatorId),
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
        })
    }
}

#[derive(sqlx::FromRow)]
struct SnapshotRow {
    id: String,
    run_id: String,
    ownership_state: String,
    ownership_operator_id: Option<String>,
    ownership_note: Option<String>,
    ownership_suspend_json: Option<String>,
    ownership_since: Option<String>,
}

impl SnapshotRow {
    fn into_snapshot(self) -> Result<OwnershipSnapshot> {
        let owner = deserialize_owner(
            &self.ownership_state,
            self.ownership_operator_id.as_deref(),
            self.ownership_note.as_deref(),
            self.ownership_suspend_json.as_deref(),
        )?;
        let since = self
            .ownership_since
            .as_deref()
            .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
            .transpose()?;
        Ok(OwnershipSnapshot {
            session_id: AgentSessionId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            owner,
            since,
        })
    }
}
