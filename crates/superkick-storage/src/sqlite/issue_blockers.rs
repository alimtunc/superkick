use anyhow::Result;
use sqlx::SqlitePool;
use superkick_core::IssueBlocker;

use crate::repo::IssueBlockerRepo;

pub struct SqliteIssueBlockerRepo {
    pool: SqlitePool,
}

impl SqliteIssueBlockerRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl IssueBlockerRepo for SqliteIssueBlockerRepo {
    async fn replace_for_downstream(
        &self,
        downstream_issue_id: &str,
        blockers: &[IssueBlocker],
    ) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        replace_downstream_in_tx(&mut tx, downstream_issue_id, blockers).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn replace_for_downstreams(&self, entries: &[(String, Vec<IssueBlocker>)]) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        for (downstream_issue_id, blockers) in entries {
            replace_downstream_in_tx(&mut tx, downstream_issue_id, blockers).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn list_all(&self) -> Result<Vec<IssueBlocker>> {
        let rows = sqlx::query_as::<_, IssueBlockerRow>(
            "SELECT downstream_issue_id, blocker_issue_id, blocker_identifier, \
             blocker_title, blocker_state_type, recorded_at \
             FROM issue_blockers ORDER BY downstream_issue_id, blocker_issue_id",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(IssueBlockerRow::into_domain).collect()
    }

    async fn list_for_downstream(&self, downstream_issue_id: &str) -> Result<Vec<IssueBlocker>> {
        let rows = sqlx::query_as::<_, IssueBlockerRow>(
            "SELECT downstream_issue_id, blocker_issue_id, blocker_identifier, \
             blocker_title, blocker_state_type, recorded_at \
             FROM issue_blockers WHERE downstream_issue_id = ?1 ORDER BY blocker_issue_id",
        )
        .bind(downstream_issue_id)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(IssueBlockerRow::into_domain).collect()
    }
}

async fn replace_downstream_in_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    downstream_issue_id: &str,
    blockers: &[IssueBlocker],
) -> Result<()> {
    sqlx::query("DELETE FROM issue_blockers WHERE downstream_issue_id = ?1")
        .bind(downstream_issue_id)
        .execute(&mut **tx)
        .await?;

    for b in blockers {
        sqlx::query(
            "INSERT INTO issue_blockers
                (downstream_issue_id, blocker_issue_id, blocker_identifier,
                 blocker_title, blocker_state_type, recorded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(&b.downstream_issue_id)
        .bind(&b.blocker_issue_id)
        .bind(&b.blocker_identifier)
        .bind(&b.blocker_title)
        .bind(&b.blocker_state_type)
        .bind(b.recorded_at.to_rfc3339())
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

#[derive(sqlx::FromRow)]
struct IssueBlockerRow {
    downstream_issue_id: String,
    blocker_issue_id: String,
    blocker_identifier: String,
    blocker_title: String,
    blocker_state_type: String,
    recorded_at: String,
}

impl IssueBlockerRow {
    fn into_domain(self) -> Result<IssueBlocker> {
        Ok(IssueBlocker {
            downstream_issue_id: self.downstream_issue_id,
            blocker_issue_id: self.blocker_issue_id,
            blocker_identifier: self.blocker_identifier,
            blocker_title: self.blocker_title,
            blocker_state_type: self.blocker_state_type,
            recorded_at: chrono::DateTime::parse_from_rfc3339(&self.recorded_at)?.to_utc(),
        })
    }
}
