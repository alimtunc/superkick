use anyhow::{Context, Result};
use sqlx::SqlitePool;
use superkick_core::{EventId, EventKind, EventLevel, RunEvent, RunId, StepId};

use super::codec::{decode_rfc3339, deserialize_enum, serialize_enum};
use crate::repo::RunEventRepo;

pub struct SqliteRunEventRepo {
    pool: SqlitePool,
}

impl SqliteRunEventRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl RunEventRepo for SqliteRunEventRepo {
    async fn insert(&self, event: &RunEvent) -> Result<u64> {
        // `seq` is allocated here, not by the caller: one monotonic counter per
        // run. SQLite serialises writers, so `MAX(seq) + 1` inside the INSERT is
        // race-free and gives every run_event (lifecycle + structured provider
        // evidence alike) a stable total order for replay/backfill (SUP-185).
        // `RETURNING seq` hands the assigned value back so the publishing
        // wrapper can broadcast a live copy with the same seq the row got.
        let seq: i64 = sqlx::query_scalar(
            "INSERT INTO run_events (id, run_id, run_step_id, ts, kind, level, message, payload_json, seq)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                     (SELECT COALESCE(MAX(seq), 0) + 1 FROM run_events WHERE run_id = ?2))
             RETURNING seq",
        )
        .bind(event.id.0.to_string())
        .bind(event.run_id.0.to_string())
        .bind(event.run_step_id.map(|id| id.0.to_string()))
        .bind(event.ts.to_rfc3339())
        .bind(serialize_enum(&event.kind)?)
        .bind(serialize_enum(&event.level)?)
        .bind(&event.message)
        .bind(event.payload_json.as_ref().map(|v| v.to_string()))
        .fetch_one(&self.pool)
        .await
        .with_context(|| format!("insert run_event {}", event.id.0))?;
        u64::try_from(seq).context("run_events.seq negative")
    }

    async fn get(&self, id: EventId) -> Result<Option<RunEvent>> {
        let row = sqlx::query_as::<_, EventRow>("SELECT * FROM run_events WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await
            .with_context(|| format!("get run_event {}", id.0))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<RunEvent>> {
        let rows = sqlx::query_as::<_, EventRow>(
            "SELECT * FROM run_events WHERE run_id = ?1 ORDER BY seq",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list run_events for run {}", run_id.0))?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn list_by_run_from_offset(&self, run_id: RunId, offset: usize) -> Result<Vec<RunEvent>> {
        let offset = i64::try_from(offset).context("run_event offset out of range")?;
        let rows = sqlx::query_as::<_, EventRow>(
            "SELECT * FROM run_events WHERE run_id = ?1 ORDER BY seq LIMIT -1 OFFSET ?2",
        )
        .bind(run_id.0.to_string())
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .with_context(|| {
            format!(
                "list run_events for run {} from offset {}",
                run_id.0, offset
            )
        })?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }
}

#[derive(sqlx::FromRow)]
struct EventRow {
    id: String,
    run_id: String,
    run_step_id: Option<String>,
    seq: Option<i64>,
    ts: String,
    kind: String,
    level: String,
    message: String,
    payload_json: Option<String>,
}

impl EventRow {
    fn into_domain(self) -> Result<RunEvent> {
        Ok(RunEvent {
            id: EventId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            run_step_id: self
                .run_step_id
                .as_deref()
                .map(|s| uuid::Uuid::parse_str(s).map(StepId))
                .transpose()?,
            seq: self
                .seq
                .map(u64::try_from)
                .transpose()
                .context("run_events.seq negative")?
                .unwrap_or(0),
            ts: decode_rfc3339(&self.ts)?,
            kind: deserialize_enum::<EventKind>(&self.kind)?,
            level: deserialize_enum::<EventLevel>(&self.level)?,
            message: self.message,
            payload_json: self
                .payload_json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()?,
        })
    }
}
