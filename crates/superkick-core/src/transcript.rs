//! Durable terminal transcript — raw PTY output chunks stored for post-mortem inspection.

use chrono::{DateTime, Utc};

use crate::id::{RunId, TranscriptChunkId};

/// A single chunk of raw PTY output for durable persistence.
#[derive(Debug, Clone)]
pub struct TranscriptChunk {
    pub id: TranscriptChunkId,
    pub run_id: RunId,
    pub sequence: i64,
    pub ts: DateTime<Utc>,
    pub payload: Vec<u8>,
}

impl TranscriptChunk {
    pub fn new(run_id: RunId, sequence: i64, payload: Vec<u8>) -> Self {
        Self {
            id: TranscriptChunkId::new(),
            run_id,
            sequence,
            ts: Utc::now(),
            payload,
        }
    }
}
