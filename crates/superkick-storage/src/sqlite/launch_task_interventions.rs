//! SUP-154 — SQLite-backed `LaunchTaskInterventionRepo`.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use superkick_core::{
    LaunchTaskId, LaunchTaskIntervention, LaunchTaskInterventionId, LaunchTaskStepId,
};

use crate::repo::LaunchTaskInterventionRepo;

pub struct SqliteLaunchTaskInterventionRepo {
    pool: SqlitePool,
}

impl SqliteLaunchTaskInterventionRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl LaunchTaskInterventionRepo for SqliteLaunchTaskInterventionRepo {
    async fn insert(&self, intervention: &LaunchTaskIntervention) -> Result<()> {
        sqlx::query(
            "INSERT INTO launch_task_interventions \
             (id, launch_task_id, target_step_id, author, body, created_at, consumed_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(intervention.id.0.to_string())
        .bind(intervention.launch_task_id.0.to_string())
        .bind(intervention.target_step_id.map(|s| s.0.to_string()))
        .bind(&intervention.author)
        .bind(&intervention.body)
        .bind(intervention.created_at.to_rfc3339())
        .bind(intervention.consumed_at.map(|t| t.to_rfc3339()))
        .execute(&self.pool)
        .await
        .with_context(|| format!("insert launch_task_intervention {}", intervention.id.0))?;
        Ok(())
    }

    async fn get(&self, id: LaunchTaskInterventionId) -> Result<Option<LaunchTaskIntervention>> {
        let row = sqlx::query_as::<_, InterventionRow>(
            "SELECT id, launch_task_id, target_step_id, author, body, created_at, consumed_at \
             FROM launch_task_interventions WHERE id = ?1",
        )
        .bind(id.0.to_string())
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get launch_task_intervention {}", id.0))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_task(&self, task_id: LaunchTaskId) -> Result<Vec<LaunchTaskIntervention>> {
        let rows = sqlx::query_as::<_, InterventionRow>(
            "SELECT id, launch_task_id, target_step_id, author, body, created_at, consumed_at \
             FROM launch_task_interventions \
             WHERE launch_task_id = ?1 \
             ORDER BY created_at ASC, id ASC",
        )
        .bind(task_id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list launch_task_interventions for task {}", task_id.0))?;
        rows.into_iter().map(InterventionRow::into_domain).collect()
    }

    async fn list_pending_for_step(
        &self,
        task_id: LaunchTaskId,
        step_id: LaunchTaskStepId,
    ) -> Result<Vec<LaunchTaskIntervention>> {
        let rows = sqlx::query_as::<_, InterventionRow>(
            "SELECT id, launch_task_id, target_step_id, author, body, created_at, consumed_at \
             FROM launch_task_interventions \
             WHERE launch_task_id = ?1 \
               AND consumed_at IS NULL \
               AND (target_step_id IS NULL OR target_step_id = ?2) \
             ORDER BY created_at ASC, id ASC",
        )
        .bind(task_id.0.to_string())
        .bind(step_id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("select pending interventions for task {}", task_id.0))?;
        rows.into_iter().map(InterventionRow::into_domain).collect()
    }

    async fn mark_consumed(
        &self,
        ids: &[LaunchTaskInterventionId],
        at: DateTime<Utc>,
    ) -> Result<Vec<LaunchTaskInterventionId>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        // SQLite has no bulk-bind for `IN (?, ?, ?)`, so the call is per-row
        // inside a single transaction. The `WHERE consumed_at IS NULL` guard
        // ensures a concurrent writer that already consumed a row cannot be
        // double-counted in the returned `actually_updated` list.
        let mut tx = self.pool.begin().await.context("begin tx")?;
        let consumed_at_str = at.to_rfc3339();
        let mut updated = Vec::with_capacity(ids.len());
        for id in ids {
            let res = sqlx::query(
                "UPDATE launch_task_interventions \
                 SET consumed_at = ?1 \
                 WHERE id = ?2 AND consumed_at IS NULL",
            )
            .bind(&consumed_at_str)
            .bind(id.0.to_string())
            .execute(&mut *tx)
            .await
            .with_context(|| format!("mark intervention {} consumed", id.0))?;
            if res.rows_affected() == 1 {
                updated.push(*id);
            }
        }
        tx.commit().await.context("commit mark_consumed tx")?;
        Ok(updated)
    }
}

#[derive(sqlx::FromRow)]
struct InterventionRow {
    id: String,
    launch_task_id: String,
    target_step_id: Option<String>,
    author: String,
    body: String,
    created_at: String,
    consumed_at: Option<String>,
}

impl InterventionRow {
    fn into_domain(self) -> Result<LaunchTaskIntervention> {
        Ok(LaunchTaskIntervention {
            id: LaunchTaskInterventionId(uuid::Uuid::parse_str(&self.id)?),
            launch_task_id: LaunchTaskId(uuid::Uuid::parse_str(&self.launch_task_id)?),
            target_step_id: self
                .target_step_id
                .as_deref()
                .map(uuid::Uuid::parse_str)
                .transpose()?
                .map(LaunchTaskStepId),
            author: self.author,
            body: self.body,
            created_at: DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
            consumed_at: self
                .consumed_at
                .as_deref()
                .map(DateTime::parse_from_rfc3339)
                .transpose()?
                .map(|d| d.to_utc()),
        })
    }
}
