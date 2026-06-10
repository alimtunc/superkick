//! Public contract types (stable, used by superkick-api).

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use superkick_core::LinkedRunSummary;

/// Identity of the authenticated Linear user (the "viewer").
///
/// Returned by `LinearClient::viewer` and surfaced through `GET /me`.
/// The frontend uses `id` to decide which issues are "mine" without
/// fragile name-matching.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewerResponse {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

/// Operator-facing mutation target. Narrower than Linear's workflow-state `type` set — `backlog` / `canceled` are not written from the kanban.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IssueStateMutation {
    Open,
    InProgress,
    Done,
}

impl IssueStateMutation {
    /// Linear workflow-state `type` literal to match when resolving the `stateId` for `issueUpdate`.
    #[must_use]
    pub fn linear_state_type(self) -> &'static str {
        match self {
            IssueStateMutation::Open => "unstarted",
            IssueStateMutation::InProgress => "started",
            IssueStateMutation::Done => "completed",
        }
    }
}

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
    /// Linear team UUID — lets a status-mutation skip the team-lookup round-trip.
    #[serde(default)]
    pub team_id: Option<String>,
    pub priority: IssuePriority,
    pub labels: Vec<IssueLabel>,
    pub assignee: Option<IssueAssignee>,
    pub project: Option<IssueProject>,
    pub parent: Option<IssueParentRef>,
    pub children: Vec<IssueChildRef>,
    /// Issues that block this one via a Linear `blocks` relation.
    /// Empty when the issue has no incoming blocker relations or when Linear
    /// hid the source issues (access control).
    #[serde(default)]
    pub blocked_by: Vec<IssueBlockerRef>,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Linear `completedAt` — set when the issue is in a `completed` (or
    /// `canceled`) workflow state. Single source of truth for the "shipped"
    /// window so `updated_at` cannot leak as a fake completion proxy.
    #[serde(default)]
    pub completed_at: Option<DateTime<Utc>>,
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
///. Mirrors `IssueParentRef`: the `status` is hydrated so the
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
    pub id: String,
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
    /// Linear team UUID — needed by the detail UI to scope status and label
    /// pickers (workflow states are owned per-team, labels are workspace-wide
    /// or team-scoped). Optional so older payloads still deserialize.
    #[serde(default)]
    pub team_id: Option<String>,
    pub comments: Vec<IssueComment>,
    pub linked_runs: Vec<LinkedRunSummary>,
    #[serde(default)]
    pub history: Vec<IssueHistoryEntry>,
    #[serde(default)]
    pub history_has_more: bool,
}

/// A single Linear history record can carry multiple deltas — hence `Vec<IssueHistoryEvent>`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueHistoryEntry {
    /// Linear's history-record uuid, or `"created:<issue_id>"` for the synthetic Created entry.
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub actor: Option<IssueAssignee>,
    pub events: Vec<IssueHistoryEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum IssueHistoryEvent {
    StatusChanged {
        from: WorkflowStateRef,
        to: WorkflowStateRef,
    },
    AssigneeChanged {
        from: Option<IssueAssignee>,
        to: Option<IssueAssignee>,
    },
    PriorityChanged {
        from: u8,
        to: u8,
    },
    LabelsChanged {
        added: Vec<IssueLabel>,
        removed: Vec<IssueLabel>,
    },
    ProjectChanged {
        from: Option<ProjectRef>,
        to: Option<ProjectRef>,
    },
    CycleChanged {
        from: Option<CycleRef>,
        to: Option<CycleRef>,
    },
    EstimateChanged {
        from: Option<f32>,
        to: Option<f32>,
    },
    DueDateChanged {
        from: Option<String>,
        to: Option<String>,
    },
    TitleChanged {
        from: String,
        to: String,
    },
    DescriptionEdited,
    Created,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStateRef {
    pub id: String,
    pub name: String,
    pub color: String,
    pub state_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CycleRef {
    pub id: String,
    pub name: Option<String>,
    pub number: u32,
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

/// One comment captured for the global-search in-memory cache.
///
/// Kept flat (no nested optionals beyond the author name) so the search
/// handler can clone matching entries cheaply each query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedComment {
    pub id: String,
    pub issue_id: String,
    pub issue_identifier: String,
    pub body: String,
    pub author_name: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Input to `LinearClient::create_issue`. `None` fields are skipped on the
/// wire — `null` has a distinct semantic on Linear's clearable fields.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueCreateInput {
    pub team_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimate: Option<f32>,
}

/// Input to `LinearClient::update_issue`. Clearable fields use
/// `Option<Option<T>>`: `None` skips the key, `Some(None)` sends `null`
/// (clears on Linear), `Some(Some(v))` sets.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueUpdateInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee_id: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimate: Option<Option<f32>>,
}

/// Composite payload for `GET /linear/options` / `LinearClient::list_options`:
/// every picker the UI needs at workspace boot, in one round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearOptions {
    pub teams: Vec<TeamOption>,
    pub users: Vec<UserOption>,
    pub projects: Vec<ProjectOption>,
    pub labels: Vec<LabelOption>,
    /// Workflow states grouped by owning team — same traversal as `teams`.
    pub workflow_states_by_team: HashMap<String, Vec<WorkflowStateOption>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamOption {
    pub id: String,
    pub key: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserOption {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectOption {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelOption {
    pub id: String,
    pub name: String,
    pub color: String,
    /// `None` = workspace-wide; `Some(team)` = team-scoped.
    #[serde(default)]
    pub team_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStateOption {
    pub id: String,
    pub name: String,
    pub state_type: String,
    pub color: String,
    pub position: f64,
}
