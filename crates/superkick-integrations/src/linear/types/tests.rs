use chrono::Utc;

use super::contract::*;
use super::graphql::*;
use crate::linear::LinearError;

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
        team: Some(GqlTeamRef {
            id: "team-1".into(),
        }),
        priority: 2,
        priority_label: "High".into(),
        labels: GqlLabelConnection {
            nodes: vec![GqlLabel {
                name: "bug".into(),
                color: "#eb5757".into(),
            }],
        },
        assignee: Some(GqlUser {
            id: "user-alice".into(),
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
        inverse_relations: None,
        completed_at: None,
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
        "completed_at",
    ] {
        assert!(json.get(key).is_some(), "missing field: {key}");
    }
}

#[test]
fn completed_at_round_trips_when_present() {
    let raw = r##"{
        "data": {
            "issues": {
                "nodes": [{
                    "id": "abc",
                    "identifier": "SUP-1",
                    "title": "Shipped issue",
                    "url": "https://linear.app/t/SUP-1",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                    "updatedAt": "2026-01-05T00:00:00.000Z",
                    "completedAt": "2026-01-04T12:30:00.000Z",
                    "state": { "type": "completed", "name": "Done", "color": "#0b0" },
                    "priority": 2,
                    "priorityLabel": "High",
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
    let item = LinearIssueListItem::from(data.issues.nodes.into_iter().next().unwrap());

    let completed = item.completed_at.expect("completed_at should be hydrated");
    assert_eq!(completed.to_rfc3339(), "2026-01-04T12:30:00+00:00");
}

#[test]
fn completed_at_round_trips_when_null() {
    let raw = r##"{
        "data": {
            "issues": {
                "nodes": [{
                    "id": "abc",
                    "identifier": "SUP-1",
                    "title": "Open issue",
                    "url": "https://linear.app/t/SUP-1",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                    "updatedAt": "2026-01-02T00:00:00.000Z",
                    "completedAt": null,
                    "state": { "type": "started", "name": "In Progress", "color": "#bbb" },
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
    let item = LinearIssueListItem::from(data.issues.nodes.into_iter().next().unwrap());
    assert!(item.completed_at.is_none());
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
            id: "user-alice".into(),
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
        team: Some(GqlTeamRef {
            id: "team-uuid".into(),
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
        inverse_relations: None,
        comments: GqlCommentConnection {
            nodes: vec![GqlComment {
                id: "comment-1".into(),
                body: "Reproducible on Safari 17+".into(),
                user: Some(GqlUser {
                    id: "user-bob".into(),
                    name: "Bob".into(),
                    avatar_url: None,
                }),
                created_at: Utc::now(),
                updated_at: Utc::now(),
                parent: None,
                children: None,
            }],
        },
        history: None,
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
fn inverse_blocks_relations_expose_blocked_by() {
    let raw = r##"{
        "data": {
            "issues": {
                "nodes": [{
                    "id": "abc",
                    "identifier": "SUP-81",
                    "title": "Unblock flow",
                    "url": "https://linear.app/t/SUP-81",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                    "updatedAt": "2026-01-02T00:00:00.000Z",
                    "state": { "type": "started", "name": "In Progress", "color": "#bbb" },
                    "priority": 2,
                    "priorityLabel": "High",
                    "labels": { "nodes": [] },
                    "assignee": null,
                    "project": null,
                    "parent": null,
                    "children": { "nodes": [] },
                    "inverseRelations": {
                        "nodes": [
                            {
                                "type": "blocks",
                                "issue": {
                                    "id": "blocker-1",
                                    "identifier": "SUP-77",
                                    "title": "Launch queue",
                                    "state": { "type": "started", "name": "In Progress", "color": "#aaa" }
                                }
                            },
                            {
                                "type": "duplicate",
                                "issue": {
                                    "id": "dup-1",
                                    "identifier": "SUP-99",
                                    "title": "Old dup",
                                    "state": { "type": "canceled", "name": "Cancelled", "color": "#777" }
                                }
                            },
                            { "type": "blocks", "issue": null }
                        ]
                    }
                }],
                "pageInfo": { "hasNextPage": false, "endCursor": null }
            }
        }
    }"##;

    let parsed: GqlResponse = serde_json::from_str(raw).unwrap();
    let data = parsed.data.unwrap();
    let item = LinearIssueListItem::from(data.issues.nodes.into_iter().next().unwrap());

    assert_eq!(item.blocked_by.len(), 1);
    assert_eq!(item.blocked_by[0].identifier, "SUP-77");
    assert_eq!(item.blocked_by[0].status.state_type, "started");
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

#[test]
fn team_id_threads_through_list_item() {
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
                    "team": { "id": "team-uuid" },
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
    let item = LinearIssueListItem::from(data.issues.nodes.into_iter().next().unwrap());
    assert_eq!(item.team_id.as_deref(), Some("team-uuid"));
}

#[test]
fn issue_search_response_deserializes_assignee_id() {
    let raw = r##"{
        "data": {
            "searchIssues": {
                "nodes": [{
                    "id": "abc",
                    "identifier": "SUP-1",
                    "title": "Search result",
                    "url": "https://linear.app/t/SUP-1",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                    "updatedAt": "2026-01-02T00:00:00.000Z",
                    "state": { "type": "started", "name": "In Progress", "color": "#bbb" },
                    "priority": 2,
                    "priorityLabel": "High",
                    "labels": { "nodes": [] },
                    "assignee": { "id": "user-1", "name": "Alice", "avatarUrl": null },
                    "project": null,
                    "parent": null,
                    "children": { "nodes": [] }
                }],
                "pageInfo": { "hasNextPage": false, "endCursor": null }
            }
        }
    }"##;

    let parsed: GqlSearchResponse = serde_json::from_str(raw).unwrap();
    let issue = parsed
        .data
        .unwrap()
        .search_issues
        .nodes
        .into_iter()
        .next()
        .unwrap();
    assert_eq!(issue.assignee.unwrap().id, "user-1");
}

#[test]
fn recent_comments_response_deserializes_user_id() {
    let raw = r##"{
        "data": {
            "comments": {
                "nodes": [{
                    "id": "comment-1",
                    "body": "webhook failed",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                    "user": { "id": "user-1", "name": "Alice", "avatarUrl": null },
                    "issue": { "id": "issue-1", "identifier": "SUP-1" }
                }],
                "pageInfo": { "hasNextPage": false, "endCursor": null }
            }
        }
    }"##;

    let parsed: GqlCommentsResponse = serde_json::from_str(raw).unwrap();
    let comment = parsed
        .data
        .unwrap()
        .comments
        .nodes
        .into_iter()
        .next()
        .unwrap();
    assert_eq!(comment.user.unwrap().id, "user-1");
}

#[test]
fn issue_state_mutation_maps_to_linear_state_type() {
    assert_eq!(IssueStateMutation::Open.linear_state_type(), "unstarted");
    assert_eq!(
        IssueStateMutation::InProgress.linear_state_type(),
        "started"
    );
    assert_eq!(IssueStateMutation::Done.linear_state_type(), "completed");
}

#[test]
fn issue_create_input_serializes_with_camel_case_and_drops_nones() {
    let input = IssueCreateInput {
        team_id: "team-1".into(),
        title: "Fix Safari login".into(),
        description: None,
        state_id: None,
        assignee_id: Some("user-1".into()),
        priority: Some(2),
        label_ids: None,
        project_id: None,
        due_date: None,
        estimate: None,
    };

    let json = serde_json::to_value(&input).expect("serialize");
    let obj = json.as_object().expect("object");
    assert_eq!(obj["teamId"], "team-1");
    assert_eq!(obj["title"], "Fix Safari login");
    assert_eq!(obj["assigneeId"], "user-1");
    assert_eq!(obj["priority"], 2);
    assert!(!obj.contains_key("description"));
    assert!(!obj.contains_key("stateId"));
    assert!(!obj.contains_key("labelIds"));
    assert!(!obj.contains_key("projectId"));
    assert!(!obj.contains_key("dueDate"));
    assert!(!obj.contains_key("estimate"));
}

#[test]
fn issue_update_input_distinguishes_missing_null_and_value() {
    // Missing on all nullable fields: nothing should appear in the JSON.
    let input = IssueUpdateInput {
        title: Some("New title".into()),
        ..Default::default()
    };
    let json = serde_json::to_value(&input).expect("serialize");
    let obj = json.as_object().expect("object");
    assert_eq!(obj.len(), 1, "only `title` should be present: {json}");
    assert_eq!(obj["title"], "New title");

    // Explicit null on every clearable field.
    let input = IssueUpdateInput {
        assignee_id: Some(None),
        project_id: Some(None),
        due_date: Some(None),
        estimate: Some(None),
        ..Default::default()
    };
    let json = serde_json::to_value(&input).expect("serialize");
    let obj = json.as_object().expect("object");
    assert!(obj["assigneeId"].is_null(), "assigneeId should be null");
    assert!(obj["projectId"].is_null(), "projectId should be null");
    assert!(obj["dueDate"].is_null(), "dueDate should be null");
    assert!(obj["estimate"].is_null(), "estimate should be null");

    // Concrete value on every clearable field plus `label_ids` and `state_id`.
    let input = IssueUpdateInput {
        title: None,
        description: None,
        state_id: Some("state-1".into()),
        assignee_id: Some(Some("user-1".into())),
        priority: Some(1),
        label_ids: Some(vec!["lbl-a".into(), "lbl-b".into()]),
        project_id: Some(Some("proj-1".into())),
        due_date: Some(Some("2026-06-15".into())),
        estimate: Some(Some(3.0)),
    };
    let json = serde_json::to_value(&input).expect("serialize");
    let obj = json.as_object().expect("object");
    assert_eq!(obj["stateId"], "state-1");
    assert_eq!(obj["assigneeId"], "user-1");
    assert_eq!(obj["priority"], 1);
    assert_eq!(obj["labelIds"], serde_json::json!(["lbl-a", "lbl-b"]));
    assert_eq!(obj["projectId"], "proj-1");
    assert_eq!(obj["dueDate"], "2026-06-15");
    assert_eq!(obj["estimate"], 3.0);
}

#[test]
fn issue_update_input_empty_serializes_to_empty_object() {
    let input = IssueUpdateInput::default();
    let json = serde_json::to_value(&input).expect("serialize");
    assert_eq!(json, serde_json::json!({}));
}

#[test]
fn issue_update_input_label_ids_empty_vec_clears_labels() {
    // Linear semantics: `labelIds: []` removes every label, distinct from
    // omitting the key entirely.
    let input = IssueUpdateInput {
        label_ids: Some(Vec::new()),
        ..Default::default()
    };
    let json = serde_json::to_value(&input).expect("serialize");
    assert_eq!(json, serde_json::json!({ "labelIds": [] }));
}

#[test]
fn gql_error_extensions_deserializes_classifiable_code() {
    let raw = r#"{
        "message": "Title is required",
        "extensions": {
            "code": "INVALID_INPUT",
            "userPresentableMessage": "Title is required"
        }
    }"#;
    let parsed: GqlError = serde_json::from_str(raw).expect("parse");
    assert_eq!(parsed.message, "Title is required");
    let ext = parsed.extensions.expect("extensions");
    assert_eq!(ext.code.as_deref(), Some("INVALID_INPUT"));
    assert_eq!(
        ext.user_presentable_message.as_deref(),
        Some("Title is required"),
    );
}

#[test]
fn gql_error_without_extensions_deserializes() {
    let raw = r#"{ "message": "Unknown failure" }"#;
    let parsed: GqlError = serde_json::from_str(raw).expect("parse");
    assert!(parsed.extensions.is_none());
}

#[test]
fn classify_uses_user_presentable_message_on_known_code() {
    let raw = r#"[{
        "message": "Internal error",
        "extensions": {
            "code": "INVALID_INPUT",
            "userPresentableMessage": "Title is required"
        }
    }]"#;
    let errors: Vec<GqlError> = serde_json::from_str(raw).expect("parse");
    match classify_graphql_errors(&errors) {
        LinearError::Rejected(msg) => assert_eq!(msg, "Title is required"),
        other => panic!("expected Rejected, got {other:?}"),
    }
}

#[test]
fn classify_falls_back_to_message_when_extensions_missing() {
    let raw = r#"[{ "message": "boom" }]"#;
    let errors: Vec<GqlError> = serde_json::from_str(raw).expect("parse");
    match classify_graphql_errors(&errors) {
        LinearError::Graphql(msg) => assert_eq!(msg, "boom"),
        other => panic!("expected Graphql, got {other:?}"),
    }
}

#[test]
fn classify_joins_multiple_unclassified_messages() {
    let raw = r#"[
        { "message": "first" },
        { "message": "second", "extensions": { "code": "SOMETHING_ELSE" } }
    ]"#;
    let errors: Vec<GqlError> = serde_json::from_str(raw).expect("parse");
    match classify_graphql_errors(&errors) {
        LinearError::Graphql(msg) => assert_eq!(msg, "first; second"),
        other => panic!("expected Graphql, got {other:?}"),
    }
}

#[test]
fn linear_options_query_response_deserializes_to_contract() {
    let raw = r##"{
        "data": {
            "teams": { "nodes": [{
                "id": "team-1",
                "key": "SUP",
                "name": "Superkick",
                "states": { "nodes": [
                    { "id": "s1", "type": "unstarted", "name": "Todo", "color": "#bbb", "position": 0.0 },
                    { "id": "s2", "type": "started",   "name": "In Progress", "color": "#fc0", "position": 1.0 }
                ] }
            }] },
            "users": { "nodes": [
                { "id": "u1", "name": "Alice", "avatarUrl": "https://example/a.png" }
            ] },
            "projects": { "nodes": [
                { "id": "p1", "name": "Q2 epic", "color": "#0a0", "state": "started" }
            ] },
            "issueLabels": { "nodes": [
                { "id": "lbl-1", "name": "bug", "color": "#eb5757", "team": { "id": "team-1" } },
                { "id": "lbl-2", "name": "ws-wide", "color": "#5ec8eb", "team": null }
            ] }
        }
    }"##;

    let parsed: GqlOptionsResponse = serde_json::from_str(raw).expect("parse");
    let options = LinearOptions::from(parsed.data.expect("data"));

    assert_eq!(options.teams.len(), 1);
    assert_eq!(options.teams[0].key, "SUP");
    assert_eq!(options.users.len(), 1);
    assert_eq!(options.users[0].name, "Alice");
    assert_eq!(options.projects.len(), 1);
    assert_eq!(options.projects[0].state.as_deref(), Some("started"));
    assert_eq!(options.labels.len(), 2);
    assert_eq!(options.labels[0].team_id.as_deref(), Some("team-1"));
    assert!(options.labels[1].team_id.is_none());

    let team_states = options
        .workflow_states_by_team
        .get("team-1")
        .expect("team states populated");
    assert_eq!(team_states.len(), 2);
    assert_eq!(team_states[0].name, "Todo");
    assert_eq!(team_states[1].state_type, "started");
}

#[test]
fn create_comment_response_converts_to_issue_comment() {
    let raw = r##"{
        "data": {
            "commentCreate": {
                "success": true,
                "comment": {
                    "id": "comment-1",
                    "body": "Reproduced on Safari 17",
                    "user": { "id": "u1", "name": "Bob", "avatarUrl": null },
                    "createdAt": "2026-01-01T00:00:00.000Z",
                    "updatedAt": "2026-01-01T00:05:00.000Z",
                    "parent": null
                }
            }
        }
    }"##;

    let parsed: GqlCommentCreateResponse = serde_json::from_str(raw).expect("parse");
    let gql_comment = parsed
        .data
        .expect("data")
        .comment_create
        .comment
        .expect("comment");
    let comment = IssueComment::from(gql_comment);
    assert_eq!(comment.id, "comment-1");
    assert_eq!(comment.body, "Reproduced on Safari 17");
    let author = comment.author.expect("author");
    assert_eq!(author.name, "Bob");
    assert!(comment.parent_id.is_none());
}

// ── Issue history ──────────────────────────────────────────

fn empty_history_node(id: &str, created_at: &str) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "createdAt": created_at,
        "actor": null,
        "updatedDescription": null,
        "fromTitle": null,
        "toTitle": null,
        "fromPriority": null,
        "toPriority": null,
        "fromState": null,
        "toState": null,
        "fromAssignee": null,
        "toAssignee": null,
        "fromCycle": null,
        "toCycle": null,
        "fromProject": null,
        "toProject": null,
        "fromEstimate": null,
        "toEstimate": null,
        "fromDueDate": null,
        "toDueDate": null,
        "addedLabels": null,
        "removedLabels": null,
    })
}

fn parse_detail_with_history(history: serde_json::Value) -> IssueDetailResponse {
    let raw = serde_json::json!({
        "data": {
            "issue": {
                "id": "issue-uuid",
                "identifier": "SUP-1",
                "title": "Test",
                "description": "body",
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
                "comments": { "nodes": [] },
                "history": history,
            }
        }
    });

    let parsed: GqlDetailResponse = serde_json::from_value(raw).expect("parse");
    IssueDetailResponse::from(parsed.data.expect("data").issue)
}

#[test]
fn history_status_change_maps_to_status_changed_event() {
    let mut node = empty_history_node("h-status", "2026-01-02T10:00:00.000Z");
    node["fromState"] = serde_json::json!({
        "id": "s-backlog", "name": "Backlog", "color": "#bec2c8", "type": "backlog",
    });
    node["toState"] = serde_json::json!({
        "id": "s-progress", "name": "In Progress", "color": "#f2c94c", "type": "started",
    });
    node["actor"] = serde_json::json!({ "id": "u-1", "name": "Alice", "avatarUrl": null });

    let detail = parse_detail_with_history(serde_json::json!({
        "nodes": [node],
        "pageInfo": { "hasNextPage": false, "endCursor": null }
    }));

    // Created prepended, real history entry second.
    assert_eq!(detail.history.len(), 2);
    let created = &detail.history[0];
    assert!(matches!(created.events[0], IssueHistoryEvent::Created));
    assert_eq!(created.id, "created:issue-uuid");
    assert!(created.actor.is_none());

    let status = &detail.history[1];
    assert_eq!(status.id, "h-status");
    assert_eq!(status.actor.as_ref().unwrap().name, "Alice");
    match &status.events[0] {
        IssueHistoryEvent::StatusChanged { from, to } => {
            assert_eq!(from.state_type, "backlog");
            assert_eq!(to.state_type, "started");
            assert_eq!(to.name, "In Progress");
        }
        other => panic!("expected StatusChanged, got {other:?}"),
    }
}

#[test]
fn history_assignee_change_handles_unassigned_transition() {
    let mut node = empty_history_node("h-assignee", "2026-01-02T11:00:00.000Z");
    node["fromAssignee"] = serde_json::json!({ "id": "u-1", "name": "Alice", "avatarUrl": null });
    node["toAssignee"] = serde_json::Value::Null;

    let detail = parse_detail_with_history(serde_json::json!({
        "nodes": [node],
        "pageInfo": { "hasNextPage": false, "endCursor": null }
    }));
    let entry = detail.history.last().unwrap();
    match &entry.events[0] {
        IssueHistoryEvent::AssigneeChanged { from, to } => {
            assert_eq!(from.as_ref().unwrap().name, "Alice");
            assert!(to.is_none());
        }
        other => panic!("expected AssigneeChanged, got {other:?}"),
    }
}

#[test]
fn history_priority_change_clamps_float_to_u8() {
    let mut node = empty_history_node("h-priority", "2026-01-02T12:00:00.000Z");
    node["fromPriority"] = serde_json::json!(0.0);
    node["toPriority"] = serde_json::json!(2.0);

    let detail = parse_detail_with_history(serde_json::json!({
        "nodes": [node],
        "pageInfo": { "hasNextPage": false, "endCursor": null }
    }));
    let entry = detail.history.last().unwrap();
    match entry.events[0] {
        IssueHistoryEvent::PriorityChanged { from, to } => {
            assert_eq!(from, 0);
            assert_eq!(to, 2);
        }
        ref other => panic!("expected PriorityChanged, got {other:?}"),
    }
}

#[test]
fn history_priority_event_drops_out_of_range_values() {
    let mut node = empty_history_node("h-priority-bad", "2026-01-02T12:00:00.000Z");
    node["fromPriority"] = serde_json::json!(7.0);
    node["toPriority"] = serde_json::json!(2.0);

    let detail = parse_detail_with_history(serde_json::json!({
        "nodes": [node],
        "pageInfo": { "hasNextPage": false, "endCursor": null }
    }));
    // Out-of-range priority => no PriorityChanged event => the row has no
    // events at all => the row is dropped => only the synthetic Created remains.
    assert_eq!(detail.history.len(), 1);
    assert!(matches!(
        detail.history[0].events[0],
        IssueHistoryEvent::Created
    ));
}

#[test]
fn history_labels_change_collapses_into_single_event() {
    let mut node = empty_history_node("h-labels", "2026-01-02T13:00:00.000Z");
    node["addedLabels"] = serde_json::json!([
        { "name": "bug", "color": "#eb5757" },
        { "name": "p1", "color": "#000" }
    ]);
    node["removedLabels"] = serde_json::json!([{ "name": "old", "color": "#aaa" }]);

    let detail = parse_detail_with_history(serde_json::json!({
        "nodes": [node],
        "pageInfo": { "hasNextPage": false, "endCursor": null }
    }));
    let entry = detail.history.last().unwrap();
    assert_eq!(entry.events.len(), 1);
    match &entry.events[0] {
        IssueHistoryEvent::LabelsChanged { added, removed } => {
            assert_eq!(added.len(), 2);
            assert_eq!(added[0].name, "bug");
            assert_eq!(removed.len(), 1);
            assert_eq!(removed[0].name, "old");
        }
        other => panic!("expected LabelsChanged, got {other:?}"),
    }
}

#[test]
fn history_description_edit_emits_description_edited() {
    let mut node = empty_history_node("h-desc", "2026-01-02T14:00:00.000Z");
    node["updatedDescription"] = serde_json::json!(true);

    let detail = parse_detail_with_history(serde_json::json!({
        "nodes": [node],
        "pageInfo": { "hasNextPage": false, "endCursor": null }
    }));
    assert!(matches!(
        detail.history.last().unwrap().events[0],
        IssueHistoryEvent::DescriptionEdited
    ));
}

#[test]
fn history_multi_event_record_emits_all_changes() {
    let mut node = empty_history_node("h-multi", "2026-01-02T15:00:00.000Z");
    node["fromState"] = serde_json::json!({
        "id": "s-backlog", "name": "Backlog", "color": "#bbb", "type": "backlog",
    });
    node["toState"] = serde_json::json!({
        "id": "s-progress", "name": "In Progress", "color": "#fc0", "type": "started",
    });
    node["fromPriority"] = serde_json::json!(3.0);
    node["toPriority"] = serde_json::json!(1.0);
    node["fromTitle"] = serde_json::json!("Old");
    node["toTitle"] = serde_json::json!("New");

    let detail = parse_detail_with_history(serde_json::json!({
        "nodes": [node],
        "pageInfo": { "hasNextPage": false, "endCursor": null }
    }));
    let entry = detail.history.last().unwrap();
    let kinds: Vec<&'static str> = entry
        .events
        .iter()
        .map(|e| match e {
            IssueHistoryEvent::StatusChanged { .. } => "status",
            IssueHistoryEvent::PriorityChanged { .. } => "priority",
            IssueHistoryEvent::TitleChanged { .. } => "title",
            _ => "other",
        })
        .collect();
    assert_eq!(kinds, vec!["status", "priority", "title"]);
}

#[test]
fn history_is_reversed_to_oldest_first_with_created_prepended() {
    // Linear returns newest-first; the conversion must reverse and prepend
    // the synthetic Created entry so the UI sees the oldest event first.
    let mut newest = empty_history_node("h-new", "2026-01-05T00:00:00.000Z");
    newest["updatedDescription"] = serde_json::json!(true);
    let mut oldest = empty_history_node("h-old", "2026-01-02T00:00:00.000Z");
    oldest["fromState"] = serde_json::json!({
        "id": "s1", "name": "Backlog", "color": "#bbb", "type": "backlog",
    });
    oldest["toState"] = serde_json::json!({
        "id": "s2", "name": "Todo", "color": "#ccc", "type": "unstarted",
    });

    let detail = parse_detail_with_history(serde_json::json!({
        "nodes": [newest, oldest],
        "pageInfo": { "hasNextPage": false, "endCursor": null }
    }));

    assert_eq!(detail.history.len(), 3);
    assert!(matches!(
        detail.history[0].events[0],
        IssueHistoryEvent::Created
    ));
    assert_eq!(detail.history[1].id, "h-old");
    assert_eq!(detail.history[2].id, "h-new");
}

#[test]
fn history_created_synthesized_when_linear_omits_it() {
    let detail = parse_detail_with_history(serde_json::json!({
        "nodes": [],
        "pageInfo": { "hasNextPage": false, "endCursor": null }
    }));
    assert_eq!(detail.history.len(), 1);
    let created = &detail.history[0];
    assert_eq!(created.id, "created:issue-uuid");
    assert_eq!(created.created_at.to_rfc3339(), "2026-01-01T00:00:00+00:00");
    assert!(matches!(created.events[0], IssueHistoryEvent::Created));
}

#[test]
fn history_has_more_propagates_page_info() {
    let detail = parse_detail_with_history(serde_json::json!({
        "nodes": [],
        "pageInfo": { "hasNextPage": true, "endCursor": "cursor-1" }
    }));
    assert!(detail.history_has_more);
}

#[test]
fn issue_history_event_round_trips_through_json() {
    // Every variant must (de)serialize through serde with `tag = "kind"`.
    let cases: Vec<IssueHistoryEvent> = vec![
        IssueHistoryEvent::Created,
        IssueHistoryEvent::DescriptionEdited,
        IssueHistoryEvent::StatusChanged {
            from: WorkflowStateRef {
                id: "a".into(),
                name: "Backlog".into(),
                color: "#bbb".into(),
                state_type: "backlog".into(),
            },
            to: WorkflowStateRef {
                id: "b".into(),
                name: "Todo".into(),
                color: "#ccc".into(),
                state_type: "unstarted".into(),
            },
        },
        IssueHistoryEvent::AssigneeChanged {
            from: None,
            to: Some(IssueAssignee {
                id: "u".into(),
                name: "Alice".into(),
                avatar_url: None,
            }),
        },
        IssueHistoryEvent::PriorityChanged { from: 0, to: 2 },
        IssueHistoryEvent::LabelsChanged {
            added: vec![IssueLabel {
                name: "bug".into(),
                color: "#eb5757".into(),
            }],
            removed: vec![],
        },
        IssueHistoryEvent::ProjectChanged {
            from: None,
            to: Some(ProjectRef {
                id: "p".into(),
                name: "Q2".into(),
            }),
        },
        IssueHistoryEvent::CycleChanged {
            from: Some(CycleRef {
                id: "c".into(),
                name: Some("Sprint 1".into()),
                number: 1,
            }),
            to: None,
        },
        IssueHistoryEvent::EstimateChanged {
            from: Some(1.0),
            to: Some(3.0),
        },
        IssueHistoryEvent::DueDateChanged {
            from: None,
            to: Some("2026-06-15".into()),
        },
        IssueHistoryEvent::TitleChanged {
            from: "Old".into(),
            to: "New".into(),
        },
    ];

    for event in &cases {
        let json = serde_json::to_string(event).expect("serialize");
        // Tag is the discriminator.
        assert!(json.contains("\"kind\""), "missing kind tag: {json}");
        let parsed: IssueHistoryEvent = serde_json::from_str(&json).expect("round-trip");
        // Compare by serialized form — Eq isn't derived on the variants
        // because IssueAssignee/WorkflowStateRef carry plain Strings.
        assert_eq!(
            serde_json::to_value(&parsed).unwrap(),
            serde_json::to_value(event).unwrap(),
        );
    }
}

#[test]
fn issue_detail_response_history_defaults_to_empty() {
    // Existing fixtures that don't carry `history` / `history_has_more`
    // must still deserialize cleanly thanks to `#[serde(default)]`.
    let raw = r##"{
        "id": "x",
        "identifier": "SUP-9",
        "title": "Legacy fixture",
        "status": { "state_type": "started", "name": "In Progress", "color": "#bbb" },
        "priority": { "value": 2, "label": "High" },
        "url": "https://linear.app/t/SUP-9",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "description": "",
        "labels": [],
        "assignee": null,
        "project": null,
        "cycle": null,
        "estimate": null,
        "due_date": null,
        "parent": null,
        "children": [],
        "blocked_by": [],
        "team_id": null,
        "comments": [],
        "linked_runs": []
    }"##;
    let parsed: IssueDetailResponse = serde_json::from_str(raw).expect("parse");
    assert!(parsed.history.is_empty());
    assert!(!parsed.history_has_more);
}

#[test]
fn issue_update_response_deserializes_with_hydrated_issue() {
    // Sanity check: the enriched `issueUpdate` payload (success + full issue)
    // round-trips through serde. The issue body reuses the shared detail shape
    // already covered elsewhere, so we only assert on the wrapper fields.
    let raw = r##"{
        "data": {
            "issueUpdate": {
                "success": true,
                "issue": {
                    "id": "abc",
                    "identifier": "SUP-1",
                    "title": "Updated",
                    "description": null,
                    "url": "https://linear.app/t/SUP-1",
                    "createdAt": "2026-01-01T00:00:00.000Z",
                    "updatedAt": "2026-01-02T00:00:00.000Z",
                    "state": { "type": "started", "name": "In Progress", "color": "#bbb" },
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
                    "comments": { "nodes": [] }
                }
            }
        }
    }"##;
    let parsed: GqlIssueUpdateResponse = serde_json::from_str(raw).expect("parse");
    let update = parsed.data.expect("data").issue_update;
    assert!(update.success);
    let issue = update.issue.expect("issue hydrated");
    assert_eq!(issue.identifier, "SUP-1");
}
