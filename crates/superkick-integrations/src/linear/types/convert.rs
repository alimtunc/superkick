//! Conversions from internal GraphQL types to public contract types.

use chrono::{DateTime, Utc};

use super::contract::*;
use super::graphql::*;

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
            parent: g.parent.map(parent_ref_from_gql),
            children: g
                .children
                .into_iter()
                .flat_map(|c| c.nodes)
                .map(gql_child_to_child_ref)
                .collect(),
            blocked_by: blockers_from_inverse_relations(g.inverse_relations),
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
            project: g.project.map(|p| IssueProject { name: p.name }),
            parent: g.parent.map(parent_ref_from_gql),
            children: g
                .children
                .into_iter()
                .flat_map(|c| c.nodes)
                .map(gql_child_to_child_ref)
                .collect(),
            blocked_by: blockers_from_inverse_relations(g.inverse_relations),
            url: g.url,
            created_at: g.created_at,
            updated_at: g.updated_at,
        }
    }
}

fn parent_ref_from_gql(p: GqlIssueRef) -> IssueParentRef {
    IssueParentRef {
        id: p.id,
        identifier: p.identifier,
        title: p.title,
        status: IssueStatus::from(p.state),
    }
}

/// Extract Linear "blocks"-typed incoming relations into `IssueBlockerRef`.
/// Non-"blocks" relation types (duplicate, related) are skipped here — only
/// the unblock flow cares about this signal. Nodes with a null `issue` are
/// skipped: Linear hides them when the operator lacks access to the source.
fn blockers_from_inverse_relations(
    conn: Option<GqlInverseRelationConnection>,
) -> Vec<IssueBlockerRef> {
    let Some(conn) = conn else {
        return Vec::new();
    };
    conn.nodes
        .into_iter()
        .filter(|r| r.relation_type == "blocks")
        .filter_map(|r| {
            r.issue.map(|i| IssueBlockerRef {
                id: i.id,
                identifier: i.identifier,
                title: i.title,
                status: IssueStatus::from(i.state),
            })
        })
        .collect()
}

fn gql_child_to_child_ref(c: GqlChildIssue) -> IssueChildRef {
    IssueChildRef {
        id: c.id,
        identifier: c.identifier,
        title: c.title,
        status: IssueStatus::from(c.state),
        priority: IssuePriority {
            value: c.priority,
            label: c.priority_label,
        },
        labels: c
            .labels
            .nodes
            .into_iter()
            .map(|l| IssueLabel {
                name: l.name,
                color: l.color,
            })
            .collect(),
        assignee: c.assignee.map(|a| IssueAssignee {
            name: a.name,
            avatar_url: a.avatar_url,
        }),
        updated_at: c.updated_at,
    }
}
