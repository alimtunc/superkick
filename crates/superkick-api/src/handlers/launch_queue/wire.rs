//! Wire-level shapes exposed by `GET /launch-queue`.
//!
//! These types are *only* the serialization contract — no merge logic, no
//! DB access, no HTTP framework plumbing. Kept in their own module so
//! changes to the response shape stay auditable independently of the
//! handler's orchestration.

use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use serde::Serialize;
use superkick_core::{LaunchQueue, LinkedPrSummary, Run};
use superkick_integrations::linear::LinearIssueListItem;

#[derive(Debug, Serialize)]
pub struct LaunchQueueResponse {
    pub generated_at: DateTime<Utc>,
    pub active_capacity: ActiveCapacity,
    /// Groups keyed by the canonical `LaunchQueue` slug. Serialised via
    /// `IndexMap` so JSON consumers see the same left-to-right order the UI
    /// renders (`LaunchQueue::ALL`), not an alphabetical BTree projection.
    pub groups: IndexMap<&'static str, Vec<LaunchQueueWireItem>>,
}

#[derive(Debug, Serialize)]
pub struct ActiveCapacity {
    pub current: u32,
    pub max: u32,
}

/// Wire-level item the UI consumes. Uses a tagged `kind` so the discriminant
/// is visible to the React layer without a peek-then-shape step.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LaunchQueueWireItem {
    Issue {
        issue: LinearIssueListItem,
        bucket: LaunchQueue,
        reason: String,
    },
    Run {
        run: Run,
        #[serde(skip_serializing_if = "Option::is_none")]
        linked_issue: Option<LinkedIssueSummary>,
        bucket: LaunchQueue,
        reason: String,
        pending_attention_count: usize,
        pending_interrupt_count: usize,
        #[serde(skip_serializing_if = "Option::is_none")]
        pr: Option<LinkedPrSummary>,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkedIssueSummary {
    pub identifier: String,
    pub title: String,
    pub url: String,
}
