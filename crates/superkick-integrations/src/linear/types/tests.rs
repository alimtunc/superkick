use chrono::Utc;

use super::contract::*;
use super::graphql::*;

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
        project: Some(GqlProject {
            name: "Superkick Product".into(),
        }),
        parent: Some(GqlIssueRef {
            id: "parent-1".into(),
            identifier: "SUP-10".into(),
            title: "Auth epic".into(),
            state: GqlIssueState {
                state_type: "started".into(),
                name: "In Progress".into(),
                color: "#f2c94c".into(),
            },
        }),
        children: Some(GqlChildConnection {
            nodes: vec![GqlChildIssue {
                id: "child-1".into(),
                identifier: "SUP-43".into(),
                title: "Fix Safari login".into(),
                updated_at: Utc::now(),
                state: GqlIssueState {
                    state_type: "unstarted".into(),
                    name: "Todo".into(),
                    color: "#bbb".into(),
                },
                priority: 3,
                priority_label: "Medium".into(),
                labels: GqlLabelConnection { nodes: vec![] },
                assignee: None,
            }],
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
    assert_eq!(item.project.as_ref().unwrap().name, "Superkick Product");
    assert_eq!(item.parent.as_ref().unwrap().identifier, "SUP-10");
    assert_eq!(item.parent.as_ref().unwrap().status.state_type, "started");
    assert_eq!(item.children.len(), 1);
    assert_eq!(item.children[0].identifier, "SUP-43");
}

#[test]
fn gql_issue_without_optional_fields() {
    let mut gql = sample_gql_issue();
    gql.assignee = None;
    gql.project = None;
    gql.parent = None;
    gql.children = None;

    let item = LinearIssueListItem::from(gql);
    assert!(item.assignee.is_none());
    assert!(item.project.is_none());
    assert!(item.parent.is_none());
    assert!(item.children.is_empty());
}

#[test]
fn list_item_serializes_to_stable_json() {
    let item = LinearIssueListItem::from(sample_gql_issue());
    let json = serde_json::to_value(&item).unwrap();

    for key in [
        "id",
        "identifier",
        "title",
        "status",
        "priority",
        "labels",
        "assignee",
        "project",
        "parent",
        "children",
        "url",
        "created_at",
        "updated_at",
    ] {
        assert!(json.get(key).is_some(), "missing field: {key}");
    }
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
        parent: Some(GqlIssueRef {
            id: "parent-1".into(),
            identifier: "SUP-10".into(),
            title: "Auth epic".into(),
            state: GqlIssueState {
                state_type: "started".into(),
                name: "In Progress".into(),
                color: "#f2c94c".into(),
            },
        }),
        children: Some(GqlChildConnection {
            nodes: vec![GqlChildIssue {
                id: "child-1".into(),
                identifier: "SUP-43".into(),
                title: "Fix Safari login".into(),
                updated_at: Utc::now(),
                state: GqlIssueState {
                    state_type: "unstarted".into(),
                    name: "Todo".into(),
                    color: "#bbb".into(),
                },
                priority: 3,
                priority_label: "Medium".into(),
                labels: GqlLabelConnection { nodes: vec![] },
                assignee: None,
            }],
        }),
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
    assert_eq!(detail.parent.as_ref().unwrap().identifier, "SUP-10");
    assert_eq!(detail.parent.as_ref().unwrap().status.state_type, "started");
    assert_eq!(detail.children.len(), 1);
    assert_eq!(detail.children[0].identifier, "SUP-43");
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
    gql.parent = None;
    gql.children = None;
    gql.comments = GqlCommentConnection { nodes: vec![] };

    let detail = IssueDetailResponse::from(gql);
    assert_eq!(detail.description, "");
    assert!(detail.assignee.is_none());
    assert!(detail.project.is_none());
    assert!(detail.cycle.is_none());
    assert!(detail.estimate.is_none());
    assert!(detail.due_date.is_none());
    assert!(detail.parent.is_none());
    assert!(detail.children.is_empty());
    assert!(detail.comments.is_empty());
}

#[test]
fn detail_response_serializes_to_stable_json() {
    let detail = IssueDetailResponse::from(sample_gql_issue_detail());
    let json = serde_json::to_value(&detail).unwrap();

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
    for key in [
        "labels",
        "assignee",
        "project",
        "cycle",
        "estimate",
        "due_date",
        "parent",
        "children",
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
                "parent": null,
                "children": { "nodes": [] },
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
                    "assignee": null,
                    "project": null,
                    "parent": null,
                    "children": { "nodes": [] }
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

#[test]
fn parent_state_is_exposed_on_list_item() {
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
                    "assignee": null,
                    "project": null,
                    "parent": {
                        "id": "p1",
                        "identifier": "SUP-10",
                        "title": "Epic",
                        "state": { "type": "completed", "name": "Done", "color": "#0b0" }
                    },
                    "children": { "nodes": [] }
                }],
                "pageInfo": { "hasNextPage": false, "endCursor": null }
            }
        }
    }"##;

    let parsed: GqlResponse = serde_json::from_str(raw).unwrap();
    let data = parsed.data.unwrap();
    let item = LinearIssueListItem::from(data.issues.nodes.into_iter().next().unwrap());
    let parent = item.parent.expect("parent should be hydrated");
    assert_eq!(parent.identifier, "SUP-10");
    assert_eq!(parent.status.state_type, "completed");
    assert_eq!(parent.status.name, "Done");
}
