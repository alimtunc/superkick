//! SQLite repository for durable terminal transcript chunks.

use anyhow::{Context, Result};
use sqlx::SqlitePool;
use superkick_core::{RunId, TranscriptChunk, TranscriptChunkId};

use super::codec::decode_rfc3339;
use crate::repo::TranscriptRepo;

pub struct SqliteTranscriptRepo {
    pool: SqlitePool,
}

impl SqliteTranscriptRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl TranscriptRepo for SqliteTranscriptRepo {
    async fn insert(&self, chunk: &TranscriptChunk) -> Result<()> {
        sqlx::query(
            "INSERT INTO terminal_transcripts (id, run_id, sequence, ts, payload)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(chunk.id.0.to_string())
        .bind(chunk.run_id.0.to_string())
        .bind(chunk.sequence)
        .bind(chunk.ts.to_rfc3339())
        .bind(&chunk.payload)
        .execute(&self.pool)
        .await
        .with_context(|| format!("insert transcript chunk {}", chunk.id.0))?;
        Ok(())
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<TranscriptChunk>> {
        let rows = sqlx::query_as::<_, TranscriptRow>(
            "SELECT * FROM terminal_transcripts WHERE run_id = ?1 ORDER BY sequence",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list transcripts for run {}", run_id.0))?;
        rows.into_iter().map(|row| row.into_domain()).collect()
    }
}

#[derive(sqlx::FromRow)]
struct TranscriptRow {
    id: String,
    run_id: String,
    sequence: i64,
    ts: String,
    payload: Vec<u8>,
}

impl TranscriptRow {
    fn into_domain(self) -> Result<TranscriptChunk> {
        Ok(TranscriptChunk {
            id: TranscriptChunkId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            sequence: self.sequence,
            ts: decode_rfc3339(&self.ts)?,
            payload: self.payload,
        })
    }
}
