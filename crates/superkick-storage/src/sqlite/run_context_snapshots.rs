//! SUP-187 — SQLite persistence for the derived `RunContextSnapshot`: one
//! regenerable row per launch task (PK), upserted wholesale. `snapshot_json` is
//! the authoritative payload; `version`/`generated_at` are denormalised header
//! columns for cheap querying.

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::SqlitePool;
use superkick_core::{LaunchTaskId, RunContextSnapshot};

use crate::repo::RunContextSnapshotRepo;

pub struct SqliteRunContextSnapshotRepo {
    pool: SqlitePool,
}

impl SqliteRunContextSnapshotRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl RunContextSnapshotRepo for SqliteRunContextSnapshotRepo {
    async fn upsert(&self, snapshot: &RunContextSnapshot) -> Result<()> {
        let launch_task_id = snapshot.launch_task_id.0.to_string();
        let snapshot_json = serde_json::to_string(snapshot)
            .with_context(|| format!("serialize run_context_snapshot {launch_task_id}"))?;
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO run_context_snapshots (\
                 launch_task_id, version, generated_at, snapshot_json, created_at, updated_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)\
             ON CONFLICT(launch_task_id) DO UPDATE SET \
                 version = excluded.version, \
                 generated_at = excluded.generated_at, \
                 snapshot_json = excluded.snapshot_json, \
                 updated_at = excluded.updated_at",
        )
        .bind(&launch_task_id)
        .bind(i64::from(snapshot.version))
        .bind(snapshot.generated_at.to_rfc3339())
        .bind(snapshot_json)
        .bind(now)
        .execute(&self.pool)
        .await
        .with_context(|| format!("upsert run_context_snapshot {launch_task_id}"))?;
        Ok(())
    }

    async fn get_by_launch_task(
        &self,
        launch_task_id: LaunchTaskId,
    ) -> Result<Option<RunContextSnapshot>> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT snapshot_json FROM run_context_snapshots WHERE launch_task_id = ?1",
        )
        .bind(launch_task_id.0.to_string())
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get run_context_snapshot {}", launch_task_id.0))?;

        row.map(|(json,)| {
            serde_json::from_str(&json)
                .with_context(|| format!("deserialize run_context_snapshot {}", launch_task_id.0))
        })
        .transpose()
    }
}
