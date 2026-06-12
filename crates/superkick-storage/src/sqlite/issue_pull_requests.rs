use anyhow::{Context, Result};
use sqlx::SqlitePool;
use superkick_core::{
    IssuePullRequest, IssuePullRequestSource, PrDiffFile, PrDiffFileStatus, PrState,
};

use super::codec::{decode_rfc3339, decode_rfc3339_opt, deserialize_enum, serialize_enum};
use crate::repo::IssuePullRequestRepo;

pub struct SqliteIssuePullRequestRepo {
    pool: SqlitePool,
}

impl SqliteIssuePullRequestRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl IssuePullRequestRepo for SqliteIssuePullRequestRepo {
    async fn upsert_issue_pr(&self, pr: &IssuePullRequest) -> Result<()> {
        sqlx::query(
            "INSERT INTO issue_pull_requests (
                issue_identifier, issue_id, repo_slug, number, url, state, title, head_branch,
                head_sha, base_branch, source, created_at, updated_at, merged_at, synced_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(issue_identifier, repo_slug, number) DO UPDATE SET
                issue_id = excluded.issue_id,
                url = excluded.url,
                state = excluded.state,
                title = excluded.title,
                head_branch = excluded.head_branch,
                head_sha = excluded.head_sha,
                base_branch = excluded.base_branch,
                source = excluded.source,
                updated_at = excluded.updated_at,
                merged_at = excluded.merged_at,
                synced_at = excluded.synced_at",
        )
        .bind(&pr.issue_identifier)
        .bind(&pr.issue_id)
        .bind(&pr.repo_slug)
        .bind(pr.number)
        .bind(&pr.url)
        .bind(serialize_enum(&pr.state)?)
        .bind(&pr.title)
        .bind(&pr.head_branch)
        .bind(&pr.head_sha)
        .bind(&pr.base_branch)
        .bind(serialize_enum(&pr.source)?)
        .bind(pr.created_at.to_rfc3339())
        .bind(pr.updated_at.to_rfc3339())
        .bind(pr.merged_at.map(|t| t.to_rfc3339()))
        .bind(pr.synced_at.to_rfc3339())
        .execute(&self.pool)
        .await
        .with_context(|| {
            format!(
                "upsert issue pull request {}#{} for {}",
                pr.repo_slug, pr.number, pr.issue_identifier
            )
        })?;
        Ok(())
    }

    async fn list_by_issue(&self, issue_identifier: &str) -> Result<Vec<IssuePullRequest>> {
        let rows = sqlx::query_as::<_, IssuePullRequestRow>(
            "SELECT * FROM issue_pull_requests WHERE issue_identifier = ?1 ORDER BY updated_at DESC, number DESC",
        )
        .bind(issue_identifier)
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list issue pull requests for {issue_identifier}"))?;
        rows.into_iter()
            .map(IssuePullRequestRow::into_domain)
            .collect()
    }

    async fn replace_diff_files(
        &self,
        issue_identifier: &str,
        repo_slug: &str,
        number: u32,
        head_sha: &str,
        files: &[PrDiffFile],
    ) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query(
            "DELETE FROM issue_pull_request_files
             WHERE issue_identifier = ?1 AND repo_slug = ?2 AND number = ?3 AND head_sha = ?4",
        )
        .bind(issue_identifier)
        .bind(repo_slug)
        .bind(number)
        .bind(head_sha)
        .execute(&mut *tx)
        .await
        .with_context(|| {
            format!(
                "delete cached diff files for {issue_identifier} {repo_slug}#{number} {head_sha}"
            )
        })?;

        for file in files {
            sqlx::query(
                "INSERT INTO issue_pull_request_files (
                    issue_identifier, repo_slug, number, head_sha, path, old_path, status,
                    additions, deletions, patch, position
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            )
            .bind(issue_identifier)
            .bind(repo_slug)
            .bind(number)
            .bind(head_sha)
            .bind(&file.path)
            .bind(&file.old_path)
            .bind(serialize_enum(&file.status)?)
            .bind(file.additions)
            .bind(file.deletions)
            .bind(&file.patch)
            .bind(file.position)
            .execute(&mut *tx)
            .await
            .with_context(|| {
                format!(
                    "insert cached diff file {} for {issue_identifier} {repo_slug}#{number}",
                    file.path
                )
            })?;
        }

        tx.commit().await?;
        Ok(())
    }

    async fn list_diff_files(
        &self,
        issue_identifier: &str,
        repo_slug: &str,
        number: u32,
        head_sha: &str,
    ) -> Result<Vec<PrDiffFile>> {
        let rows = sqlx::query_as::<_, PrDiffFileRow>(
            "SELECT path, old_path, status, additions, deletions, patch, position
             FROM issue_pull_request_files
             WHERE issue_identifier = ?1 AND repo_slug = ?2 AND number = ?3 AND head_sha = ?4
             ORDER BY position ASC, path ASC",
        )
        .bind(issue_identifier)
        .bind(repo_slug)
        .bind(number)
        .bind(head_sha)
        .fetch_all(&self.pool)
        .await
        .with_context(|| {
            format!("list cached diff files for {issue_identifier} {repo_slug}#{number} {head_sha}")
        })?;
        rows.into_iter().map(PrDiffFileRow::into_domain).collect()
    }
}

#[derive(sqlx::FromRow)]
struct IssuePullRequestRow {
    issue_identifier: String,
    issue_id: String,
    repo_slug: String,
    number: i64,
    url: String,
    state: String,
    title: String,
    head_branch: String,
    head_sha: String,
    base_branch: String,
    source: String,
    created_at: String,
    updated_at: String,
    merged_at: Option<String>,
    synced_at: String,
}

impl IssuePullRequestRow {
    fn into_domain(self) -> Result<IssuePullRequest> {
        Ok(IssuePullRequest {
            issue_id: self.issue_id,
            issue_identifier: self.issue_identifier,
            repo_slug: self.repo_slug,
            number: u32::try_from(self.number)?,
            url: self.url,
            state: deserialize_enum::<PrState>(&self.state)?,
            title: self.title,
            head_branch: self.head_branch,
            head_sha: self.head_sha,
            base_branch: self.base_branch,
            source: deserialize_enum::<IssuePullRequestSource>(&self.source)?,
            created_at: decode_rfc3339(&self.created_at)?,
            updated_at: decode_rfc3339(&self.updated_at)?,
            merged_at: decode_rfc3339_opt(self.merged_at.as_deref())?,
            synced_at: decode_rfc3339(&self.synced_at)?,
        })
    }
}

#[derive(sqlx::FromRow)]
struct PrDiffFileRow {
    path: String,
    old_path: Option<String>,
    status: String,
    additions: i64,
    deletions: i64,
    patch: Option<String>,
    position: i64,
}

impl PrDiffFileRow {
    fn into_domain(self) -> Result<PrDiffFile> {
        Ok(PrDiffFile {
            path: self.path,
            old_path: self.old_path,
            status: deserialize_enum::<PrDiffFileStatus>(&self.status)?,
            additions: u32::try_from(self.additions)?,
            deletions: u32::try_from(self.deletions)?,
            patch: self.patch,
            position: u32::try_from(self.position)?,
        })
    }
}
