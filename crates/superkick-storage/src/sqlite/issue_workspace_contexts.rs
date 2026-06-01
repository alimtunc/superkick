//! SUP-147: SQLite persistence for `IssueWorkspaceContext` + its children.
//!
//! Two invariants that the storage layer enforces beyond what the SQL
//! schema can express:
//!
//! 1. **Atomic attach.** `insert_with_children` writes the parent, comment
//!    excerpts and links in one transaction. A reader can therefore never
//!    observe a workspace that has fewer children than it was created with.
//! 2. **Idempotent link attach.** `add_link` translates the SQL UNIQUE
//!    violation on `(workspace_context_id, link_kind, target_id)` back into
//!    "fetch the existing row and return it". The domain rejects duplicate
//!    attaches in-memory; the storage layer relies on the SQL constraint as
//!    the race-safe source of truth, so two concurrent attaches converge on
//!    the same outcome instead of one of them failing.

use anyhow::{Context, Result, anyhow};
use sqlx::SqlitePool;
use superkick_core::{
    IssueWorkspaceContext, IssueWorkspaceContextCommentExcerpt,
    IssueWorkspaceContextCommentExcerptId, IssueWorkspaceContextId, IssueWorkspaceContextLink,
    IssueWorkspaceContextLinkId, IssueWorkspaceContextLinkKind,
};

use super::codec::{decode_rfc3339, deserialize_enum, serialize_enum};
use super::ensure_updated;
use crate::is_unique_violation;
use crate::repo::IssueWorkspaceContextRepo;

pub struct SqliteIssueWorkspaceContextRepo {
    pool: SqlitePool,
}

impl SqliteIssueWorkspaceContextRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl IssueWorkspaceContextRepo for SqliteIssueWorkspaceContextRepo {
    async fn insert_with_children(
        &self,
        context: &IssueWorkspaceContext,
        excerpts: &[IssueWorkspaceContextCommentExcerpt],
        links: &[IssueWorkspaceContextLink],
    ) -> Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for insert_with_children")?;

        sqlx::query(
            "INSERT INTO issue_workspace_contexts (\
                 id, linear_team_key, linear_issue_identifier, linear_issue_id, \
                 snapshot_title, snapshot_body_md, snapshot_status_name, \
                 captured_at, memory_ledger_pointer, created_at, updated_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )
        .bind(context.id.0.to_string())
        .bind(&context.linear_team_key)
        .bind(&context.linear_issue_identifier)
        .bind(&context.linear_issue_id)
        .bind(&context.snapshot_title)
        .bind(&context.snapshot_body_md)
        .bind(&context.snapshot_status_name)
        .bind(context.captured_at.to_rfc3339())
        .bind(context.memory_ledger_pointer.clone())
        .bind(context.created_at.to_rfc3339())
        .bind(context.updated_at.to_rfc3339())
        .execute(&mut *tx)
        .await
        .with_context(|| format!("insert issue_workspace_context {}", context.id.0))?;

        for excerpt in excerpts {
            sqlx::query(
                "INSERT INTO issue_workspace_context_comment_excerpts (\
                     id, workspace_context_id, linear_comment_id, author, body_md, captured_at\
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(excerpt.id.0.to_string())
            .bind(excerpt.workspace_context_id.0.to_string())
            .bind(&excerpt.linear_comment_id)
            .bind(excerpt.author.clone())
            .bind(&excerpt.body_md)
            .bind(excerpt.captured_at.to_rfc3339())
            .execute(&mut *tx)
            .await
            .with_context(|| {
                format!(
                    "insert issue_workspace_context_comment_excerpt {}",
                    excerpt.id.0
                )
            })?;
        }

        for link in links {
            sqlx::query(
                "INSERT INTO issue_workspace_context_links (\
                     id, workspace_context_id, link_kind, target_id, attached_at\
                 ) VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .bind(link.id.0.to_string())
            .bind(link.workspace_context_id.0.to_string())
            .bind(serialize_enum(&link.link_kind)?)
            .bind(&link.target_id)
            .bind(link.attached_at.to_rfc3339())
            .execute(&mut *tx)
            .await
            .with_context(|| format!("insert issue_workspace_context_link {}", link.id.0))?;
        }

        tx.commit()
            .await
            .context("commit transaction for insert_with_children")?;
        Ok(())
    }

    async fn get(&self, id: IssueWorkspaceContextId) -> Result<Option<IssueWorkspaceContext>> {
        let row = sqlx::query_as::<_, IssueWorkspaceContextRow>(
            "SELECT * FROM issue_workspace_contexts WHERE id = ?1",
        )
        .bind(id.0.to_string())
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get issue_workspace_context {}", id.0))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_issue_identifier(
        &self,
        identifier: &str,
    ) -> Result<Vec<IssueWorkspaceContext>> {
        let rows = sqlx::query_as::<_, IssueWorkspaceContextRow>(
            "SELECT * FROM issue_workspace_contexts \
             WHERE linear_issue_identifier = ?1 \
             ORDER BY captured_at DESC",
        )
        .bind(identifier)
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list issue_workspace_contexts by identifier {identifier}"))?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn find_latest_by_linear_issue_id(
        &self,
        linear_issue_id: &str,
    ) -> Result<Option<IssueWorkspaceContext>> {
        let row = sqlx::query_as::<_, IssueWorkspaceContextRow>(
            "SELECT * FROM issue_workspace_contexts \
             WHERE linear_issue_id = ?1 \
             ORDER BY captured_at DESC \
             LIMIT 1",
        )
        .bind(linear_issue_id)
        .fetch_optional(&self.pool)
        .await
        .with_context(|| {
            format!("find latest issue_workspace_context by linear_issue_id {linear_issue_id}")
        })?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_excerpts(
        &self,
        workspace_context_id: IssueWorkspaceContextId,
    ) -> Result<Vec<IssueWorkspaceContextCommentExcerpt>> {
        let rows = sqlx::query_as::<_, IssueWorkspaceContextCommentExcerptRow>(
            "SELECT * FROM issue_workspace_context_comment_excerpts \
             WHERE workspace_context_id = ?1 \
             ORDER BY captured_at ASC",
        )
        .bind(workspace_context_id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .with_context(|| {
            format!(
                "list issue_workspace_context_comment_excerpts for {}",
                workspace_context_id.0
            )
        })?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn list_links(
        &self,
        workspace_context_id: IssueWorkspaceContextId,
    ) -> Result<Vec<IssueWorkspaceContextLink>> {
        let rows = sqlx::query_as::<_, IssueWorkspaceContextLinkRow>(
            "SELECT * FROM issue_workspace_context_links \
             WHERE workspace_context_id = ?1 \
             ORDER BY attached_at ASC",
        )
        .bind(workspace_context_id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .with_context(|| {
            format!(
                "list issue_workspace_context_links for {}",
                workspace_context_id.0
            )
        })?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn add_link(
        &self,
        workspace_context_id: IssueWorkspaceContextId,
        link_kind: IssueWorkspaceContextLinkKind,
        target_id: &str,
    ) -> Result<IssueWorkspaceContextLink> {
        if target_id.trim().is_empty() {
            return Err(anyhow!("issue_workspace_context_link target_id is empty"));
        }
        let link = IssueWorkspaceContextLink {
            id: IssueWorkspaceContextLinkId::new(),
            workspace_context_id,
            link_kind,
            target_id: target_id.to_string(),
            attached_at: chrono::Utc::now(),
        };
        let insert = sqlx::query(
            "INSERT INTO issue_workspace_context_links (\
                 id, workspace_context_id, link_kind, target_id, attached_at\
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(link.id.0.to_string())
        .bind(link.workspace_context_id.0.to_string())
        .bind(serialize_enum(&link.link_kind)?)
        .bind(&link.target_id)
        .bind(link.attached_at.to_rfc3339())
        .execute(&self.pool)
        .await;

        match insert {
            Ok(_) => Ok(link),
            Err(err) => {
                let wrapped = anyhow::Error::from(err);
                if is_unique_violation(&wrapped) {
                    let existing = sqlx::query_as::<_, IssueWorkspaceContextLinkRow>(
                        "SELECT * FROM issue_workspace_context_links \
                         WHERE workspace_context_id = ?1 AND link_kind = ?2 AND target_id = ?3",
                    )
                    .bind(workspace_context_id.0.to_string())
                    .bind(serialize_enum(&link_kind)?)
                    .bind(target_id)
                    .fetch_optional(&self.pool)
                    .await
                    .with_context(|| {
                        format!(
                            "fetch existing issue_workspace_context_link on duplicate for {}/{link_kind}/{target_id}",
                            workspace_context_id.0
                        )
                    })?
                    .ok_or_else(|| {
                        anyhow!(
                            "issue_workspace_context_link {}/{link_kind}/{target_id} \
                             reported as duplicate but is missing on re-read",
                            workspace_context_id.0
                        )
                    })?;
                    existing.into_domain()
                } else {
                    Err(wrapped.context(format!(
                        "insert issue_workspace_context_link for {}",
                        workspace_context_id.0
                    )))
                }
            }
        }
    }

    async fn set_memory_ledger_pointer(
        &self,
        id: IssueWorkspaceContextId,
        pointer: Option<String>,
    ) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let result = sqlx::query(
            "UPDATE issue_workspace_contexts \
                SET memory_ledger_pointer = ?1, updated_at = ?2 \
              WHERE id = ?3",
        )
        .bind(pointer)
        .bind(now)
        .bind(id.0.to_string())
        .execute(&self.pool)
        .await
        .with_context(|| {
            format!(
                "update memory_ledger_pointer for issue_workspace_context {}",
                id.0
            )
        })?;
        ensure_updated(result, "issue_workspace_context", id.0)?;
        Ok(())
    }

    async fn delete(&self, id: IssueWorkspaceContextId) -> Result<()> {
        let result = sqlx::query("DELETE FROM issue_workspace_contexts WHERE id = ?1")
            .bind(id.0.to_string())
            .execute(&self.pool)
            .await
            .with_context(|| format!("delete issue_workspace_context {}", id.0))?;
        ensure_updated(result, "issue_workspace_context", id.0)?;
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct IssueWorkspaceContextRow {
    id: String,
    linear_team_key: String,
    linear_issue_identifier: String,
    linear_issue_id: String,
    snapshot_title: String,
    snapshot_body_md: String,
    snapshot_status_name: String,
    captured_at: String,
    memory_ledger_pointer: Option<String>,
    created_at: String,
    updated_at: String,
}

impl IssueWorkspaceContextRow {
    fn into_domain(self) -> Result<IssueWorkspaceContext> {
        Ok(IssueWorkspaceContext {
            id: IssueWorkspaceContextId(uuid::Uuid::parse_str(&self.id)?),
            linear_team_key: self.linear_team_key,
            linear_issue_identifier: self.linear_issue_identifier,
            linear_issue_id: self.linear_issue_id,
            snapshot_title: self.snapshot_title,
            snapshot_body_md: self.snapshot_body_md,
            snapshot_status_name: self.snapshot_status_name,
            captured_at: decode_rfc3339(&self.captured_at)?,
            memory_ledger_pointer: self.memory_ledger_pointer,
            created_at: decode_rfc3339(&self.created_at)?,
            updated_at: decode_rfc3339(&self.updated_at)?,
        })
    }
}

#[derive(sqlx::FromRow)]
struct IssueWorkspaceContextCommentExcerptRow {
    id: String,
    workspace_context_id: String,
    linear_comment_id: String,
    author: Option<String>,
    body_md: String,
    captured_at: String,
}

impl IssueWorkspaceContextCommentExcerptRow {
    fn into_domain(self) -> Result<IssueWorkspaceContextCommentExcerpt> {
        Ok(IssueWorkspaceContextCommentExcerpt {
            id: IssueWorkspaceContextCommentExcerptId(uuid::Uuid::parse_str(&self.id)?),
            workspace_context_id: IssueWorkspaceContextId(uuid::Uuid::parse_str(
                &self.workspace_context_id,
            )?),
            linear_comment_id: self.linear_comment_id,
            author: self.author,
            body_md: self.body_md,
            captured_at: decode_rfc3339(&self.captured_at)?,
        })
    }
}

#[derive(sqlx::FromRow)]
struct IssueWorkspaceContextLinkRow {
    id: String,
    workspace_context_id: String,
    link_kind: String,
    target_id: String,
    attached_at: String,
}

impl IssueWorkspaceContextLinkRow {
    fn into_domain(self) -> Result<IssueWorkspaceContextLink> {
        Ok(IssueWorkspaceContextLink {
            id: IssueWorkspaceContextLinkId(uuid::Uuid::parse_str(&self.id)?),
            workspace_context_id: IssueWorkspaceContextId(uuid::Uuid::parse_str(
                &self.workspace_context_id,
            )?),
            link_kind: deserialize_enum::<IssueWorkspaceContextLinkKind>(&self.link_kind)?,
            target_id: self.target_id,
            attached_at: decode_rfc3339(&self.attached_at)?,
        })
    }
}
