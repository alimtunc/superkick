//! SUP-148: SQLite persistence for the append-only `MemoryEntry` ledger.
//!
//! Pagination uses the row-value comparison `(created_at, id) < (?, ?)` so
//! the composite index `(context_id, created_at DESC, id DESC)` can serve
//! every page directly. The `LIMIT = limit + 1` lookahead detects the end of
//! the stream without a `COUNT(*)`.
//!
//! Concurrent appends during pagination are accepted by design: a memory
//! entry written between two `list_page` calls will reappear at the top of
//! the next page rather than be hidden. The aggregate is append-only and the
//! UI refetches on focus -- a transactional snapshot would be overkill at
//! the volumes expected for V1.

use anyhow::{Context, Result};
use sqlx::SqlitePool;
use superkick_core::{
    IssueWorkspaceContextId, MemoryCursor, MemoryEntry, MemoryEntryId, MemoryPage,
};

use crate::repo::MemoryEntryRepo;

pub struct SqliteMemoryEntryRepo {
    pool: SqlitePool,
}

impl SqliteMemoryEntryRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl MemoryEntryRepo for SqliteMemoryEntryRepo {
    async fn append(&self, entry: &MemoryEntry) -> Result<()> {
        sqlx::query(
            "INSERT INTO memory_entries (id, context_id, author, role, text, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(entry.id.0.to_string())
        .bind(entry.context_id.0.to_string())
        .bind(entry.author.clone())
        .bind(&entry.role)
        .bind(&entry.text)
        .bind(entry.created_at.to_rfc3339())
        .execute(&self.pool)
        .await
        .with_context(|| format!("insert memory_entry {}", entry.id.0))?;
        Ok(())
    }

    async fn list_page(
        &self,
        context_id: IssueWorkspaceContextId,
        cursor: Option<MemoryCursor>,
        limit: u32,
    ) -> Result<MemoryPage> {
        let lookahead = limit.saturating_add(1);
        let rows = match cursor {
            None => sqlx::query_as::<_, MemoryEntryRow>(
                "SELECT id, context_id, author, role, text, created_at \
                 FROM memory_entries \
                 WHERE context_id = ?1 \
                 ORDER BY created_at DESC, id DESC \
                 LIMIT ?2",
            )
            .bind(context_id.0.to_string())
            .bind(lookahead)
            .fetch_all(&self.pool)
            .await
            .with_context(|| format!("list memory_entries for {}", context_id.0))?,
            Some(cursor) => sqlx::query_as::<_, MemoryEntryRow>(
                "SELECT id, context_id, author, role, text, created_at \
                 FROM memory_entries \
                 WHERE context_id = ?1 \
                   AND (created_at, id) < (?2, ?3) \
                 ORDER BY created_at DESC, id DESC \
                 LIMIT ?4",
            )
            .bind(context_id.0.to_string())
            .bind(cursor.created_at.to_rfc3339())
            .bind(cursor.id.0.to_string())
            .bind(lookahead)
            .fetch_all(&self.pool)
            .await
            .with_context(|| format!("list memory_entries page for {}", context_id.0))?,
        };

        let mut entries: Vec<MemoryEntry> = rows
            .into_iter()
            .map(MemoryEntryRow::into_domain)
            .collect::<Result<_>>()?;
        let next_cursor = if entries.len() as u32 > limit {
            entries.truncate(limit as usize);
            entries.last().map(|e| MemoryCursor {
                created_at: e.created_at,
                id: e.id,
            })
        } else {
            None
        };

        Ok(MemoryPage {
            entries,
            next_cursor,
        })
    }
}

#[derive(sqlx::FromRow)]
struct MemoryEntryRow {
    id: String,
    context_id: String,
    author: Option<String>,
    role: String,
    text: String,
    created_at: String,
}

impl MemoryEntryRow {
    fn into_domain(self) -> Result<MemoryEntry> {
        Ok(MemoryEntry {
            id: MemoryEntryId(uuid::Uuid::parse_str(&self.id)?),
            context_id: IssueWorkspaceContextId(uuid::Uuid::parse_str(&self.context_id)?),
            author: self.author,
            role: self.role,
            text: self.text,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
        })
    }
}
