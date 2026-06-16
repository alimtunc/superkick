//! SQLite persistence for builtin deletion tombstones.
//!
//! The seeder re-inserts any builtin whose key is absent on every boot. A
//! tombstone here records a builtin the operator hard-deleted so the seeder
//! skips it permanently.

use std::collections::HashSet;

use anyhow::{Context, Result};
use sqlx::SqlitePool;

use crate::repo::{BuiltinDeletionRepo, BuiltinKind};

pub struct SqliteBuiltinDeletionRepo {
    pool: SqlitePool,
}

impl SqliteBuiltinDeletionRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl BuiltinDeletionRepo for SqliteBuiltinDeletionRepo {
    async fn record(&self, kind: BuiltinKind, key: &str) -> Result<()> {
        sqlx::query(
            "INSERT INTO builtin_deletions (kind, key) VALUES (?1, ?2) \
             ON CONFLICT(kind, key) DO NOTHING",
        )
        .bind(kind.as_str())
        .bind(key)
        .execute(&self.pool)
        .await
        .with_context(|| format!("record builtin deletion {}:{key}", kind.as_str()))?;
        Ok(())
    }

    async fn clear(&self, kind: BuiltinKind, key: &str) -> Result<()> {
        sqlx::query("DELETE FROM builtin_deletions WHERE kind = ?1 AND key = ?2")
            .bind(kind.as_str())
            .bind(key)
            .execute(&self.pool)
            .await
            .with_context(|| format!("clear builtin deletion {}:{key}", kind.as_str()))?;
        Ok(())
    }

    async fn deleted_keys(&self, kind: BuiltinKind) -> Result<HashSet<String>> {
        let rows: Vec<(String,)> =
            sqlx::query_as("SELECT key FROM builtin_deletions WHERE kind = ?1")
                .bind(kind.as_str())
                .fetch_all(&self.pool)
                .await
                .with_context(|| format!("list builtin deletions {}", kind.as_str()))?;
        Ok(rows.into_iter().map(|(key,)| key).collect())
    }
}
