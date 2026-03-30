use anyhow::Result;
use sqlx::SqlitePool;
use superkick_core::{PrState, PullRequest, PullRequestId, RunId};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::PullRequestRepo;

pub struct SqlitePullRequestRepo {
    pool: SqlitePool,
}

impl SqlitePullRequestRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl PullRequestRepo for SqlitePullRequestRepo {
    async fn upsert(&self, pr: &PullRequest) -> Result<()> {
        sqlx::query(
            "INSERT INTO pull_requests (id, run_id, number, repo_slug, url, state, title, head_branch, created_at, updated_at, merged_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(run_id) DO UPDATE SET
                state = excluded.state,
                title = excluded.title,
                head_branch = excluded.head_branch,
                updated_at = excluded.updated_at,
                merged_at = excluded.merged_at",
        )
        .bind(pr.id.0.to_string())
        .bind(pr.run_id.0.to_string())
        .bind(pr.number)
        .bind(&pr.repo_slug)
        .bind(&pr.url)
        .bind(serialize_enum(&pr.state)?)
        .bind(&pr.title)
        .bind(&pr.head_branch)
        .bind(pr.created_at.to_rfc3339())
        .bind(pr.updated_at.to_rfc3339())
        .bind(pr.merged_at.map(|t| t.to_rfc3339()))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get_by_run(&self, run_id: RunId) -> Result<Option<PullRequest>> {
        let row =
            sqlx::query_as::<_, PullRequestRow>("SELECT * FROM pull_requests WHERE run_id = ?1")
                .bind(run_id.0.to_string())
                .fetch_optional(&self.pool)
                .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn update(&self, pr: &PullRequest) -> Result<()> {
        sqlx::query(
            "UPDATE pull_requests SET state = ?1, title = ?2, head_branch = ?3, updated_at = ?4, merged_at = ?5 WHERE id = ?6",
        )
        .bind(serialize_enum(&pr.state)?)
        .bind(&pr.title)
        .bind(&pr.head_branch)
        .bind(pr.updated_at.to_rfc3339())
        .bind(pr.merged_at.map(|t| t.to_rfc3339()))
        .bind(pr.id.0.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct PullRequestRow {
    id: String,
    run_id: String,
    number: i64,
    repo_slug: String,
    url: String,
    state: String,
    title: String,
    head_branch: String,
    created_at: String,
    updated_at: String,
    merged_at: Option<String>,
}

impl PullRequestRow {
    fn into_domain(self) -> Result<PullRequest> {
        Ok(PullRequest {
            id: PullRequestId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            number: u32::try_from(self.number)?,
            repo_slug: self.repo_slug,
            url: self.url,
            state: deserialize_enum::<PrState>(&self.state)?,
            title: self.title,
            head_branch: self.head_branch,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
            updated_at: chrono::DateTime::parse_from_rfc3339(&self.updated_at)?.to_utc(),
            merged_at: self
                .merged_at
                .as_deref()
                .map(chrono::DateTime::parse_from_rfc3339)
                .transpose()?
                .map(|dt| dt.to_utc()),
        })
    }
}
