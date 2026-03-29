//! Normalized types for the Linear issue list and detail contracts.
//!
//! These types represent the **stable API payload** that the frontend relies on.
//! They are intentionally decoupled from Linear's raw GraphQL schema so that
//! upstream changes don't ripple into the UI contract.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use superkick_core::LinkedRunSummary;

// ── Public contract types (stable, used by superkick-api) ──────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueListResponse {
    pub issues: Vec<LinearIssueListItem>,
    pub total_count: u32,
}

/// A single issue in the list view. Contains exactly the fields needed
/// to render a row and support filtering / run linkage downstream.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinearIssueListItem {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub status: IssueStatus,
    pub priority: IssuePriority,
    pub labels: Vec<IssueLabel>,
    pub assignee: Option<IssueAssignee>,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueStatus {
    /// Linear workflow state type: `backlog`, `unstarted`, `started`, `completed`, `canceled`.
    /// This is the raw Linear value — Superkick operator buckets are derived on the frontend.
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

// ── Issue detail contract (SUP-16) ────────────────────────────────────
//
// Extends the list item with fields needed for the operator decision
// surface. Linear remains the source of truth — we fetch on demand.
//
// Compatibility:
// - SUP-17 (Start action): consumes `id` + `identifier` to create runs.
// - SUP-19 (run history linkage): `linked_runs` populated by API layer
//   from superkick-storage, not from Linear.
// - SUP-21 (review context): `comments` carries latest review context;
//   richer thread support can extend without breaking this shape.

/// Full issue detail payload returned by `GET /issues/{id}`.
///
/// Identity/status fields from `LinearIssueListItem` are included flat
/// so the frontend can render the detail view without needing two shapes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueDetailResponse {
    // ── Required: identity & status ──
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub status: IssueStatus,
    pub priority: IssuePriority,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,

    // ── Required: detail-specific ──
    /// Markdown body. Empty string when the issue has no description.
    pub description: String,

    // ── Optional: metadata for launch decision ──
    pub labels: Vec<IssueLabel>,
    pub assignee: Option<IssueAssignee>,
    pub project: Option<IssueProject>,
    pub cycle: Option<IssueCycle>,
    pub estimate: Option<f32>,
    pub due_date: Option<String>,

    // ── Optional: review-relevant context (SUP-21 ready) ──
    pub comments: Vec<IssueComment>,

    // ── Optional: linked run state (SUP-19 ready) ──
    /// Populated by the API layer from superkick-storage, not from Linear.
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

// ── Internal deserialization types (Linear GraphQL response shape) ──────

#[derive(Debug, Deserialize)]
pub(crate) struct GqlResponse {
    pub data: Option<GqlData>,
    pub errors: Option<Vec<GqlError>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlError {
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlData {
    pub issues: GqlIssueConnection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssueConnection {
    pub nodes: Vec<GqlIssue>,
    #[allow(dead_code)]
    pub page_info: GqlPageInfo,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // Fields needed for deserialization; pagination used later.
pub(crate) struct GqlPageInfo {
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub state: GqlIssueState,
    pub priority: u8,
    pub priority_label: String,
    pub labels: GqlLabelConnection,
    pub assignee: Option<GqlUser>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueState {
    #[serde(rename = "type")]
    pub state_type: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlLabelConnection {
    pub nodes: Vec<GqlLabel>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlUser {
    pub name: String,
    pub avatar_url: Option<String>,
}

// ── Internal deserialization types (issue detail GraphQL response) ─────

#[derive(Debug, Deserialize)]
pub(crate) struct GqlDetailResponse {
    pub data: Option<GqlDetailData>,
    pub errors: Option<Vec<GqlError>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlDetailData {
    pub issue: GqlIssueDetail,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlIssueDetail {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    pub url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub state: GqlIssueState,
    pub priority: u8,
    pub priority_label: String,
    pub labels: GqlLabelConnection,
    pub assignee: Option<GqlUser>,
    pub project: Option<GqlProject>,
    pub cycle: Option<GqlCycle>,
    pub estimate: Option<f32>,
    pub due_date: Option<String>,
    pub comments: GqlCommentConnection,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlProject {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlCycle {
    pub name: Option<String>,
    pub number: u32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlCommentConnection {
    pub nodes: Vec<GqlComment>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GqlComment {
    pub id: String,
    pub body: String,
    pub user: Option<GqlUser>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub parent: Option<GqlCommentRef>,
    #[serde(default)]
    pub children: Option<GqlCommentConnection>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlCommentRef {
    pub id: String,
}

// ── Conversion ─────────────────────────────────────────────────────────

impl From<GqlIssueState> for IssueStatus {
    fn from(s: GqlIssueState) -> Self {
        Self {
            state_type: s.state_type,
            name: s.name,
            color: s.color,
        }
    }
}

fn gql_comment_to_issue_comment(
    id: String,
    body: String,
    user: Option<GqlUser>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    parent_id: Option<String>,
) -> IssueComment {
    IssueComment {
        id,
        body,
        author: user.map(|u| IssueAssignee {
            name: u.name,
            avatar_url: u.avatar_url,
        }),
        created_at,
        updated_at,
        parent_id,
    }
}

impl From<GqlIssueDetail> for IssueDetailResponse {
    fn from(g: GqlIssueDetail) -> Self {
        Self {
            id: g.id,
            identifier: g.identifier,
            title: g.title,
            description: g.description.unwrap_or_default(),
            status: IssueStatus::from(g.state),
            priority: IssuePriority {
                value: g.priority,
                label: g.priority_label,
            },
            labels: g
                .labels
                .nodes
                .into_iter()
                .map(|l| IssueLabel {
                    name: l.name,
                    color: l.color,
                })
                .collect(),
            assignee: g.assignee.map(|a| IssueAssignee {
                name: a.name,
                avatar_url: a.avatar_url,
            }),
            project: g.project.map(|p| IssueProject { name: p.name }),
            cycle: g.cycle.map(|c| IssueCycle {
                name: c.name,
                number: c.number,
            }),
            estimate: g.estimate,
            due_date: g.due_date,
            url: g.url,
            created_at: g.created_at,
            updated_at: g.updated_at,
            comments: g
                .comments
                .nodes
                .into_iter()
                .flat_map(|c| {
                    let child_parent_id = c.id.clone();
                    let parent = gql_comment_to_issue_comment(
                        c.id,
                        c.body,
                        c.user,
                        c.created_at,
                        c.updated_at,
                        c.parent.map(|p| p.id),
                    );
                    let children =
                        c.children
                            .into_iter()
                            .flat_map(|cc| cc.nodes)
                            .map(move |child| {
                                gql_comment_to_issue_comment(
                                    child.id,
                                    child.body,
                                    child.user,
                                    child.created_at,
                                    child.updated_at,
                                    Some(child_parent_id.clone()),
                                )
                            });
                    std::iter::once(parent).chain(children)
                })
                .collect(),
            // Populated by API layer, not by Linear conversion
            linked_runs: Vec::new(),
        }
    }
}

impl From<GqlIssue> for LinearIssueListItem {
    fn from(g: GqlIssue) -> Self {
        Self {
            id: g.id,
            identifier: g.identifier,
            title: g.title,
            status: IssueStatus::from(g.state),
            priority: IssuePriority {
                value: g.priority,
                label: g.priority_label,
            },
            labels: g
                .labels
                .nodes
                .into_iter()
                .map(|l| IssueLabel {
                    name: l.name,
                    color: l.color,
                })
                .collect(),
            assignee: g.assignee.map(|a| IssueAssignee {
                name: a.name,
                avatar_url: a.avatar_url,
            }),
            url: g.url,
            created_at: g.created_at,
            updated_at: g.updated_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_gql_issue() -> GqlIssue {
        GqlIssue {
            id: "issue-1".into(),
            identifier: "SUP-42".into(),
            title: "Fix login bug".into(),
            url: "https://linear.app/superkick/issue/SUP-42".into(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            state: GqlIssueState {
                state_type: "started".into(),
                name: "In Progress".into(),
                color: "#f2c94c".into(),
            },
            priority: 2,
            priority_label: "High".into(),
            labels: GqlLabelConnection {
                nodes: vec![GqlLabel {
                    name: "bug".into(),
                    color: "#eb5757".into(),
                }],
            },
            assignee: Some(GqlUser {
                name: "Alice".into(),
                avatar_url: Some("https://example.com/alice.png".into()),
            }),
        }
    }

    #[test]
    fn gql_issue_converts_to_list_item() {
        let item = LinearIssueListItem::from(sample_gql_issue());

        assert_eq!(item.identifier, "SUP-42");
        assert_eq!(item.status.state_type, "started");
        assert_eq!(item.status.name, "In Progress");
        assert_eq!(item.priority.value, 2);
        assert_eq!(item.priority.label, "High");
        assert_eq!(item.labels.len(), 1);
        assert_eq!(item.labels[0].name, "bug");
        assert!(item.assignee.is_some());
        assert_eq!(item.assignee.unwrap().name, "Alice");
    }

    #[test]
    fn gql_issue_without_assignee() {
        let mut gql = sample_gql_issue();
        gql.assignee = None;

        let item = LinearIssueListItem::from(gql);
        assert!(item.assignee.is_none());
    }

    #[test]
    fn list_item_serializes_to_stable_json() {
        let item = LinearIssueListItem::from(sample_gql_issue());
        let json = serde_json::to_value(&item).unwrap();

        assert!(json.get("id").is_some());
        assert!(json.get("identifier").is_some());
        assert!(json.get("title").is_some());
        assert!(json.get("status").is_some());
        assert!(json.get("priority").is_some());
        assert!(json.get("labels").is_some());
        assert!(json.get("assignee").is_some());
        assert!(json.get("url").is_some());
        assert!(json.get("created_at").is_some());
        assert!(json.get("updated_at").is_some());
    }

    #[test]
    fn list_response_roundtrips_through_json() {
        let response = IssueListResponse {
            issues: vec![LinearIssueListItem::from(sample_gql_issue())],
            total_count: 1,
        };

        let json = serde_json::to_string(&response).unwrap();
        let parsed: IssueListResponse = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.issues.len(), 1);
        assert_eq!(parsed.total_count, 1);
        assert_eq!(parsed.issues[0].identifier, "SUP-42");
    }

    fn sample_gql_issue_detail() -> GqlIssueDetail {
        GqlIssueDetail {
            id: "issue-1".into(),
            identifier: "SUP-42".into(),
            title: "Fix login bug".into(),
            description: Some("## Problem\nLogin fails on Safari.".into()),
            url: "https://linear.app/superkick/issue/SUP-42".into(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            state: GqlIssueState {
                state_type: "started".into(),
                name: "In Progress".into(),
                color: "#f2c94c".into(),
            },
            priority: 2,
            priority_label: "High".into(),
            labels: GqlLabelConnection {
                nodes: vec![GqlLabel {
                    name: "bug".into(),
                    color: "#eb5757".into(),
                }],
            },
            assignee: Some(GqlUser {
                name: "Alice".into(),
                avatar_url: Some("https://example.com/alice.png".into()),
            }),
            project: Some(GqlProject {
                name: "Superkick Product".into(),
            }),
            cycle: Some(GqlCycle {
                name: Some("Sprint 3".into()),
                number: 3,
            }),
            estimate: Some(3.0),
            due_date: Some("2026-04-01".into()),
            comments: GqlCommentConnection {
                nodes: vec![GqlComment {
                    id: "comment-1".into(),
                    body: "Reproducible on Safari 17+".into(),
                    user: Some(GqlUser {
                        name: "Bob".into(),
                        avatar_url: None,
                    }),
                    created_at: Utc::now(),
                    updated_at: Utc::now(),
                    parent: None,
                    children: None,
                }],
            },
        }
    }

    #[test]
    fn gql_issue_detail_converts_to_response() {
        let detail = IssueDetailResponse::from(sample_gql_issue_detail());

        assert_eq!(detail.identifier, "SUP-42");
        assert_eq!(detail.description, "## Problem\nLogin fails on Safari.");
        assert_eq!(detail.status.state_type, "started");
        assert_eq!(detail.status.name, "In Progress");
        assert_eq!(detail.priority.value, 2);
        assert_eq!(detail.labels.len(), 1);
        assert!(detail.assignee.is_some());
        assert_eq!(detail.project.as_ref().unwrap().name, "Superkick Product");
        assert_eq!(detail.cycle.as_ref().unwrap().number, 3);
        assert_eq!(detail.estimate, Some(3.0));
        assert_eq!(detail.due_date.as_deref(), Some("2026-04-01"));
        assert_eq!(detail.comments.len(), 1);
        assert_eq!(detail.comments[0].body, "Reproducible on Safari 17+");
        assert!(detail.comments[0].parent_id.is_none());
        assert!(detail.linked_runs.is_empty());
    }

    #[test]
    fn gql_issue_detail_without_optional_fields() {
        let mut gql = sample_gql_issue_detail();
        gql.description = None;
        gql.assignee = None;
        gql.project = None;
        gql.cycle = None;
        gql.estimate = None;
        gql.due_date = None;
        gql.comments = GqlCommentConnection { nodes: vec![] };

        let detail = IssueDetailResponse::from(gql);
        assert_eq!(detail.description, "");
        assert!(detail.assignee.is_none());
        assert!(detail.project.is_none());
        assert!(detail.cycle.is_none());
        assert!(detail.estimate.is_none());
        assert!(detail.due_date.is_none());
        assert!(detail.comments.is_empty());
    }

    #[test]
    fn detail_response_serializes_to_stable_json() {
        let detail = IssueDetailResponse::from(sample_gql_issue_detail());
        let json = serde_json::to_value(&detail).unwrap();

        // Required fields
        for key in [
            "id",
            "identifier",
            "title",
            "description",
            "status",
            "priority",
            "url",
            "created_at",
            "updated_at",
        ] {
            assert!(json.get(key).is_some(), "missing required field: {key}");
        }
        // Optional fields present
        for key in [
            "labels",
            "assignee",
            "project",
            "cycle",
            "estimate",
            "due_date",
            "comments",
            "linked_runs",
        ] {
            assert!(json.get(key).is_some(), "missing field: {key}");
        }
    }

    #[test]
    fn detail_response_roundtrips_through_json() {
        let detail = IssueDetailResponse::from(sample_gql_issue_detail());
        let json = serde_json::to_string(&detail).unwrap();
        let parsed: IssueDetailResponse = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.identifier, "SUP-42");
        assert_eq!(parsed.description, detail.description);
        assert_eq!(parsed.comments.len(), 1);
    }

    #[test]
    fn gql_detail_response_deserializes_from_linear_shape() {
        let raw = r##"{
            "data": {
                "issue": {
                    "id": "abc",
                    "identifier": "SUP-1",
                    "title": "Test",
                    "description": "Some description",
                    "url": "https://linear.app/t/SUP-1",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                    "updatedAt": "2026-01-02T00:00:00.000Z",
                    "state": { "type": "unstarted", "name": "Todo", "color": "#bbb" },
                    "priority": 1,
                    "priorityLabel": "Urgent",
                    "labels": { "nodes": [] },
                    "assignee": null,
                    "project": null,
                    "cycle": null,
                    "estimate": null,
                    "dueDate": null,
                    "comments": { "nodes": [
                        {
                            "id": "c1",
                            "body": "A comment",
                            "user": null,
                            "createdAt": "2026-01-01T00:00:00.000Z",
                            "updatedAt": "2026-01-01T00:00:00.000Z",
                            "parent": null,
                            "children": { "nodes": [
                                {
                                    "id": "c2",
                                    "body": "A reply",
                                    "user": null,
                                    "createdAt": "2026-01-01T01:00:00.000Z",
                                    "updatedAt": "2026-01-01T01:00:00.000Z"
                                }
                            ] }
                        }
                    ] }
                }
            }
        }"##;

        let parsed: GqlDetailResponse = serde_json::from_str(raw).unwrap();
        let data = parsed.data.unwrap();
        assert_eq!(data.issue.identifier, "SUP-1");
        assert_eq!(data.issue.description.as_deref(), Some("Some description"));
    }

    #[test]
    fn gql_response_deserializes_from_linear_shape() {
        let raw = r##"{
            "data": {
                "issues": {
                    "nodes": [{
                        "id": "abc",
                        "identifier": "SUP-1",
                        "title": "Test",
                        "url": "https://linear.app/t/SUP-1",
                        "createdAt": "2026-01-01T00:00:00.000Z",
                        "updatedAt": "2026-01-02T00:00:00.000Z",
                        "state": { "type": "unstarted", "name": "Todo", "color": "#bbb" },
                        "priority": 1,
                        "priorityLabel": "Urgent",
                        "labels": { "nodes": [] },
                        "assignee": null
                    }],
                    "pageInfo": { "hasNextPage": false, "endCursor": null }
                }
            }
        }"##;

        let parsed: GqlResponse = serde_json::from_str(raw).unwrap();
        let data = parsed.data.unwrap();
        assert_eq!(data.issues.nodes.len(), 1);
        assert_eq!(data.issues.nodes[0].identifier, "SUP-1");
    }
}
