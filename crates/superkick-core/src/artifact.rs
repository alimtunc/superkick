use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::id::{ArtifactId, RunId};

/// Classification of an artifact produced during a run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactKind {
    Plan,
    Diff,
    Log,
    ReviewSummary,
    PrUrl,
}

/// An artifact produced by a run step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub id: ArtifactId,
    pub run_id: RunId,
    pub kind: ArtifactKind,
    pub path_or_url: String,
    pub metadata_json: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

impl Artifact {
    pub fn new(run_id: RunId, kind: ArtifactKind, path_or_url: String) -> Self {
        Self {
            id: ArtifactId::new(),
            run_id,
            kind,
            path_or_url,
            metadata_json: None,
            created_at: Utc::now(),
        }
    }
}
