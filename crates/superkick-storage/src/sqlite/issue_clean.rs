//! "Clean issue" persistence: stats-safe archive + destructive purge of the
//! runs and launch tasks linked to one Linear issue.
//!
//! Both operations key off the stable issue identifier (e.g. `SUP-122`):
//! `runs.issue_identifier` and `launch_tasks.linear_issue_id` both store that
//! identifier at create time. Each runs in a single transaction so a reader
//! never sees a half-cleaned issue.

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;

use crate::repo::{IssueCleanOutcome, IssueCleanRepo};

pub struct SqliteIssueCleanRepo {
    pool: SqlitePool,
}

impl SqliteIssueCleanRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl IssueCleanRepo for SqliteIssueCleanRepo {
    async fn archive_issue(
        &self,
        issue_identifier: &str,
        now: DateTime<Utc>,
    ) -> Result<IssueCleanOutcome> {
        let now = now.to_rfc3339();
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for archive_issue")?;

        let runs = sqlx::query(
            "UPDATE runs SET archived_at = ?1 \
             WHERE issue_identifier = ?2 AND archived_at IS NULL",
        )
        .bind(&now)
        .bind(issue_identifier)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("archive runs for issue {issue_identifier}"))?
        .rows_affected();

        let launch_tasks = sqlx::query(
            "UPDATE launch_tasks SET archived_at = ?1 \
             WHERE linear_issue_id = ?2 AND archived_at IS NULL",
        )
        .bind(&now)
        .bind(issue_identifier)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("archive launch_tasks for issue {issue_identifier}"))?
        .rows_affected();

        tx.commit()
            .await
            .context("commit transaction for archive_issue")?;

        Ok(IssueCleanOutcome { runs, launch_tasks })
    }

    async fn purge_issue(&self, issue_identifier: &str) -> Result<IssueCleanOutcome> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for purge_issue")?;

        // Defer FK enforcement to COMMIT: lets us delete in any order within
        // the transaction. Every referencing row is removed below, so the
        // deferred check passes at commit time.
        sqlx::query("PRAGMA defer_foreign_keys = ON")
            .execute(&mut *tx)
            .await
            .context("enable deferred foreign keys for purge")?;

        // Child rows keyed off the issue's runs. Each delete scopes to the run
        // ids belonging to this issue via a subquery, so unrelated issues are
        // never touched. Literal statements (not format!) so sqlx can audit them.
        const RUN_SCOPED_DELETES: &[&str] = &[
            "DELETE FROM run_events WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
            "DELETE FROM agent_sessions WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
            "DELETE FROM interrupts WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
            "DELETE FROM artifacts WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
            "DELETE FROM pull_requests WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
            "DELETE FROM terminal_transcripts WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
            "DELETE FROM attention_requests WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
            "DELETE FROM handoffs WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
            "DELETE FROM session_ownership_events WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
            "DELETE FROM session_lifecycle_events WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
            "DELETE FROM run_steps WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
        ];
        for sql in RUN_SCOPED_DELETES {
            sqlx::query(*sql)
                .bind(issue_identifier)
                .execute(&mut *tx)
                .await
                .with_context(|| format!("purge child rows for issue {issue_identifier}"))?;
        }

        // Conversations + their turns/events can reference an issue run. Delete
        // the turn events, then turns, then the conversation rows scoped to the
        // issue's runs.
        sqlx::query(
            "DELETE FROM turn_events WHERE turn_id IN (\
                 SELECT t.id FROM conversation_turns t \
                 JOIN conversations c ON c.id = t.conversation_id \
                 WHERE c.run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1))",
        )
        .bind(issue_identifier)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("purge turn_events for issue {issue_identifier}"))?;
        sqlx::query(
            "DELETE FROM conversation_turns WHERE conversation_id IN (\
                 SELECT id FROM conversations \
                 WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1))",
        )
        .bind(issue_identifier)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("purge conversation_turns for issue {issue_identifier}"))?;
        sqlx::query(
            "DELETE FROM conversations \
             WHERE run_id IN (SELECT id FROM runs WHERE issue_identifier = ?1)",
        )
        .bind(issue_identifier)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("purge conversations for issue {issue_identifier}"))?;

        // Issue-scoped conversations key directly off `issue_identifier` with a
        // NULL `run_id`, so the run-scoped deletes above miss them. They have no
        // run to cascade from — purge their turns/events then the rows directly.
        sqlx::query(
            "DELETE FROM turn_events WHERE turn_id IN (\
                 SELECT t.id FROM conversation_turns t \
                 JOIN conversations c ON c.id = t.conversation_id \
                 WHERE c.issue_identifier = ?1)",
        )
        .bind(issue_identifier)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("purge issue-scoped turn_events for issue {issue_identifier}"))?;
        sqlx::query(
            "DELETE FROM conversation_turns WHERE conversation_id IN (\
                 SELECT id FROM conversations WHERE issue_identifier = ?1)",
        )
        .bind(issue_identifier)
        .execute(&mut *tx)
        .await
        .with_context(|| {
            format!("purge issue-scoped conversation_turns for issue {issue_identifier}")
        })?;
        sqlx::query("DELETE FROM conversations WHERE issue_identifier = ?1")
            .bind(issue_identifier)
            .execute(&mut *tx)
            .await
            .with_context(|| {
                format!("purge issue-scoped conversations for issue {issue_identifier}")
            })?;

        let runs = sqlx::query("DELETE FROM runs WHERE issue_identifier = ?1")
            .bind(issue_identifier)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("purge runs for issue {issue_identifier}"))?
            .rows_affected();

        // run_context_snapshots is keyed by launch_task_id with no FK cascade,
        // so delete it explicitly before the parent launch_tasks rows.
        sqlx::query(
            "DELETE FROM run_context_snapshots WHERE launch_task_id IN \
             (SELECT id FROM launch_tasks WHERE linear_issue_id = ?1)",
        )
        .bind(issue_identifier)
        .execute(&mut *tx)
        .await
        .with_context(|| format!("purge run_context_snapshots for issue {issue_identifier}"))?;

        // launch_task_steps + launch_task_interventions cascade on the parent
        // delete (ON DELETE CASCADE).
        let launch_tasks = sqlx::query("DELETE FROM launch_tasks WHERE linear_issue_id = ?1")
            .bind(issue_identifier)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("purge launch_tasks for issue {issue_identifier}"))?
            .rows_affected();

        tx.commit()
            .await
            .context("commit transaction for purge_issue")?;

        Ok(IssueCleanOutcome { runs, launch_tasks })
    }
}
