//! Recovery-event persistence (SUP-73). Append-only audit of every
//! `Healthy ↔ Stalled` transition the scheduler observed for a run.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use superkick_core::{LatestEventTag, RecoveryCandidate, RunId, RunState, StalledReason};

use super::codec::deserialize_enum;

/// Stored row in `run_recovery_events`. The `kind` is one of `"stalled"` or
/// `"recovered"`; the `reason` is JSON-encoded `StalledReason` for stalled
/// rows and the empty string for `recovered` rows (the audit table does not
/// need a structured reason for healthy transitions).
#[derive(Debug, Clone)]
pub struct RecoveryEventRow {
    pub run_id: RunId,
    pub kind: RecoveryEventKind,
    pub reason: Option<StalledReason>,
    /// Time the run actually went silent (the freshest signal at classify
    /// time). `None` for `recovered` rows. The dashboard uses this — not
    /// `detected_at` — to render the "stalled for Y minutes" duration so the
    /// number reflects the underlying silence, not the scheduler's tick lag.
    pub stalled_since: Option<DateTime<Utc>>,
    pub detected_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryEventKind {
    Stalled,
    Recovered,
}

impl RecoveryEventKind {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Stalled => "stalled",
            Self::Recovered => "recovered",
        }
    }

    /// Project to the core `LatestEventTag` so the scheduler can call
    /// `decide_recovery_action` without depending on this storage enum.
    #[must_use]
    pub const fn to_latest_tag(self) -> LatestEventTag {
        match self {
            Self::Stalled => LatestEventTag::Stalled,
            Self::Recovered => LatestEventTag::Recovered,
        }
    }
}

pub struct SqliteRecoveryEventRepo {
    pool: SqlitePool,
}

impl SqliteRecoveryEventRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// List every non-terminal run as a [`RecoveryCandidate`]. Reads the
    /// `runs` table directly so the scheduler always sees the freshest
    /// snapshot — no scheduler-local cache.
    pub async fn list_candidates(&self) -> Result<Vec<RecoveryCandidate>> {
        list_recovery_candidates(&self.pool).await
    }

    /// Insert a `stalled` row. The reason is serialized as JSON so future
    /// readers (debugging, analytics) can decode the structured cause without
    /// ambiguity. `since` is the classifier's "freshest signal at decision
    /// time" — distinct from `detected_at` (the scheduler tick wall-clock).
    pub async fn insert_stalled(
        &self,
        run_id: RunId,
        reason: &StalledReason,
        since: DateTime<Utc>,
        detected_at: DateTime<Utc>,
    ) -> Result<()> {
        let reason_json = serde_json::to_string(reason)
            .with_context(|| format!("serializing stalled reason for run {run_id}"))?;
        sqlx::query(
            "INSERT INTO run_recovery_events (run_id, kind, reason, stalled_since, detected_at)
             VALUES (?1, 'stalled', ?2, ?3, ?4)",
        )
        .bind(run_id.0.to_string())
        .bind(reason_json)
        .bind(since.to_rfc3339())
        .bind(detected_at.to_rfc3339())
        .execute(&self.pool)
        .await
        .with_context(|| format!("inserting stalled recovery event for run {run_id}"))?;
        Ok(())
    }

    /// Insert a `recovered` row. Stored without a reason because the operator
    /// surface only cares that the staleness cleared.
    pub async fn insert_recovered(&self, run_id: RunId, detected_at: DateTime<Utc>) -> Result<()> {
        sqlx::query(
            "INSERT INTO run_recovery_events (run_id, kind, reason, stalled_since, detected_at)
             VALUES (?1, 'recovered', '', NULL, ?2)",
        )
        .bind(run_id.0.to_string())
        .bind(detected_at.to_rfc3339())
        .execute(&self.pool)
        .await
        .with_context(|| format!("inserting recovered recovery event for run {run_id}"))?;
        Ok(())
    }

    /// Latest event of any kind for one run. Used by the scheduler to
    /// deduplicate — if the most recent row is already `stalled` we don't
    /// re-emit on every tick.
    pub async fn latest_for_run(&self, run_id: RunId) -> Result<Option<RecoveryEventRow>> {
        let row = sqlx::query_as::<_, RawRecoveryRow>(
            "SELECT run_id, kind, reason, stalled_since, detected_at
             FROM run_recovery_events
             WHERE run_id = ?1
             ORDER BY detected_at DESC, id DESC
             LIMIT 1",
        )
        .bind(run_id.0.to_string())
        .fetch_optional(&self.pool)
        .await?;
        row.map(RawRecoveryRow::into_domain).transpose()
    }

    /// Latest `stalled` event for a run that has not yet been followed by a
    /// `recovered` row. Used by the dashboard handler to annotate live cards
    /// with their current stall.
    pub async fn current_stall(&self, run_id: RunId) -> Result<Option<RecoveryEventRow>> {
        let latest = self.latest_for_run(run_id).await?;
        match latest {
            Some(row) if row.kind == RecoveryEventKind::Stalled => Ok(Some(row)),
            _ => Ok(None),
        }
    }
}

#[derive(sqlx::FromRow)]
struct RawRecoveryRow {
    run_id: String,
    kind: String,
    reason: String,
    stalled_since: Option<String>,
    detected_at: String,
}

impl RawRecoveryRow {
    fn into_domain(self) -> Result<RecoveryEventRow> {
        let kind = match self.kind.as_str() {
            "stalled" => RecoveryEventKind::Stalled,
            "recovered" => RecoveryEventKind::Recovered,
            other => anyhow::bail!("unexpected recovery event kind: {other}"),
        };
        let reason = if matches!(kind, RecoveryEventKind::Stalled) && !self.reason.is_empty() {
            Some(serde_json::from_str(&self.reason)?)
        } else {
            None
        };
        let stalled_since = self
            .stalled_since
            .as_deref()
            .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
            .transpose()?;
        Ok(RecoveryEventRow {
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            kind,
            reason,
            stalled_since,
            detected_at: chrono::DateTime::parse_from_rfc3339(&self.detected_at)?.to_utc(),
        })
    }
}

/// Build [`RecoveryCandidate`]s for every non-terminal run. Hits the same
/// `runs` table the rest of the system reads from so the scheduler always
/// sees the freshest snapshot.
pub async fn list_recovery_candidates(pool: &SqlitePool) -> Result<Vec<RecoveryCandidate>> {
    let rows = sqlx::query_as::<_, RecoveryCandidateRow>(
        "SELECT id, state, updated_at, last_heartbeat_at
         FROM runs
         WHERE state NOT IN ('completed', 'failed', 'cancelled')",
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(RecoveryCandidateRow::into_domain)
        .collect()
}

#[derive(sqlx::FromRow)]
struct RecoveryCandidateRow {
    id: String,
    state: String,
    updated_at: String,
    last_heartbeat_at: Option<String>,
}

impl RecoveryCandidateRow {
    fn into_domain(self) -> Result<RecoveryCandidate> {
        Ok(RecoveryCandidate {
            run_id: RunId(uuid::Uuid::parse_str(&self.id)?),
            state: deserialize_enum::<RunState>(&self.state)?,
            updated_at: chrono::DateTime::parse_from_rfc3339(&self.updated_at)?.to_utc(),
            last_heartbeat_at: self
                .last_heartbeat_at
                .as_deref()
                .map(|s| chrono::DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
                .transpose()?,
        })
    }
}
