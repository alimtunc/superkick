use anyhow::Result;
use sqlx::SqlitePool;
use superkick_core::{EventId, EventKind, EventLevel, RunEvent, RunId, StepId};

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
    async fn insert(&self, event: &RunEvent) -> Result<()> {
        sqlx::query(
            "INSERT INTO run_events (id, run_id, run_step_id, ts, kind, level, message, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(event.id.0.to_string())
        .bind(event.run_id.0.to_string())
        .bind(event.run_step_id.map(|id| id.0.to_string()))
        .bind(event.ts.to_rfc3339())
        .bind(ser_enum(&event.kind))
        .bind(ser_enum(&event.level))
        .bind(&event.message)
        .bind(event.payload_json.as_ref().map(|v| v.to_string()))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get(&self, id: EventId) -> Result<Option<RunEvent>> {
        let row = sqlx::query_as::<_, EventRow>("SELECT * FROM run_events WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<RunEvent>> {
        let rows =
            sqlx::query_as::<_, EventRow>("SELECT * FROM run_events WHERE run_id = ?1 ORDER BY ts")
                .bind(run_id.0.to_string())
                .fetch_all(&self.pool)
                .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }
}

#[derive(sqlx::FromRow)]
struct EventRow {
    id: String,
    run_id: String,
    run_step_id: Option<String>,
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
            ts: chrono::DateTime::parse_from_rfc3339(&self.ts)?.to_utc(),
            kind: de_enum::<EventKind>(&self.kind)?,
            level: de_enum::<EventLevel>(&self.level)?,
            message: self.message,
            payload_json: self
                .payload_json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()?,
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
