//! Normalized types for the Linear issue list contract.
//!
//! These types represent the **stable API payload** that the frontend relies on.
//! They are intentionally decoupled from Linear's raw GraphQL schema so that
//! upstream changes don't ripple into the UI contract.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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
    pub priority: u32,
    pub priority_label: String,
    pub labels: GqlLabelConnection,
    pub assignee: Option<GqlUser>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GqlIssueState {
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

// ── Conversion ─────────────────────────────────────────────────────────

impl From<GqlIssue> for LinearIssueListItem {
    fn from(g: GqlIssue) -> Self {
        Self {
            id: g.id,
            identifier: g.identifier,
            title: g.title,
            status: IssueStatus {
                name: g.state.name,
                color: g.state.color,
            },
            priority: IssuePriority {
                value: g.priority as u8, // Linear priority is 0–4
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
                        "state": { "name": "Todo", "color": "#bbb" },
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
