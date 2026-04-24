//! Public contract types (stable, used by superkick-api).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use superkick_core::LinkedRunSummary;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueListResponse {
    pub issues: Vec<LinearIssueListItem>,
    pub total_count: u32,
}

/// A single issue in the list view.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearIssueListItem {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub status: IssueStatus,
    pub priority: IssuePriority,
    pub labels: Vec<IssueLabel>,
    pub assignee: Option<IssueAssignee>,
    pub project: Option<IssueProject>,
    pub parent: Option<IssueParentRef>,
    pub children: Vec<IssueChildRef>,
    /// Issues that block this one via a Linear `blocks` relation (SUP-81).
    /// Empty when the issue has no incoming blocker relations or when Linear
    /// hid the source issues (access control).
    #[serde(default)]
    pub blocked_by: Vec<IssueBlockerRef>,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Minimal parent issue reference for launch context. Carries its own
/// `status` so the launch queue can short-circuit "parent not completed"
/// without a second GraphQL round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueParentRef {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub status: IssueStatus,
}

/// Reference to an issue that blocks another via a Linear `blocks` relation
/// (SUP-81). Mirrors `IssueParentRef`: the `status` is hydrated so the
/// classifier can decide "blocker resolved" without a second round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueBlockerRef {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub status: IssueStatus,
}

/// Child issue reference with enough context for inline display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueChildRef {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub status: IssueStatus,
    pub priority: IssuePriority,
    pub labels: Vec<IssueLabel>,
    pub assignee: Option<IssueAssignee>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueStatus {
    /// Linear workflow state type: `backlog`, `unstarted`, `started`, `completed`, `canceled`.
    pub state_type: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssuePriority {
    pub value: u8,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueAssignee {
    pub name: String,
    pub avatar_url: Option<String>,
}

/// Full issue detail payload returned by `GET /issues/{id}`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueDetailResponse {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub status: IssueStatus,
    pub priority: IssuePriority,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub description: String,
    pub labels: Vec<IssueLabel>,
    pub assignee: Option<IssueAssignee>,
    pub project: Option<IssueProject>,
    pub cycle: Option<IssueCycle>,
    pub estimate: Option<f32>,
    pub due_date: Option<String>,
    pub parent: Option<IssueParentRef>,
    pub children: Vec<IssueChildRef>,
    /// See `LinearIssueListItem::blocked_by`.
    #[serde(default)]
    pub blocked_by: Vec<IssueBlockerRef>,
    pub comments: Vec<IssueComment>,
    pub linked_runs: Vec<LinkedRunSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueProject {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueCycle {
    pub name: Option<String>,
    pub number: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueComment {
    pub id: String,
    pub body: String,
    pub author: Option<IssueAssignee>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub parent_id: Option<String>,
}
