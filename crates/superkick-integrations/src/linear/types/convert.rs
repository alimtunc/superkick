//! Conversions from internal GraphQL types to public contract types.

use std::collections::HashMap;

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

impl From<GqlComment> for IssueComment {
    fn from(c: GqlComment) -> Self {
        Self {
            id: c.id,
            body: c.body,
            author: c.user.map(|u| IssueAssignee {
                id: u.id,
                name: u.name,
                avatar_url: u.avatar_url,
            }),
            created_at: c.created_at,
            updated_at: c.updated_at,
            parent_id: c.parent.map(|p| p.id),
        }
    }
}

impl From<GqlOptionsData> for LinearOptions {
    fn from(data: GqlOptionsData) -> Self {
        let mut workflow_states_by_team: HashMap<String, Vec<WorkflowStateOption>> = HashMap::new();
        let teams = data
            .teams
            .nodes
            .into_iter()
            .map(|t| {
                let states: Vec<WorkflowStateOption> = t
                    .states
                    .nodes
                    .into_iter()
                    .map(|s| WorkflowStateOption {
                        id: s.id,
                        name: s.name,
                        state_type: s.state_type,
                        color: s.color,
                        position: s.position,
                    })
                    .collect();
                workflow_states_by_team.insert(t.id.clone(), states);
                TeamOption {
                    id: t.id,
                    key: t.key,
                    name: t.name,
                }
            })
            .collect();
        let users = data
            .users
            .nodes
            .into_iter()
            .map(|u| UserOption {
                id: u.id,
                name: u.name,
                avatar_url: u.avatar_url,
            })
            .collect();
        let projects = data
            .projects
            .nodes
            .into_iter()
            .map(|p| ProjectOption {
                id: p.id,
                name: p.name,
                color: p.color,
                state: p.state,
            })
            .collect();
        let labels = data
            .issue_labels
            .nodes
            .into_iter()
            .map(|l| LabelOption {
                id: l.id,
                name: l.name,
                color: l.color,
                team_id: l.team.map(|t| t.id),
            })
            .collect();
        Self {
            teams,
            users,
            projects,
            labels,
            workflow_states_by_team,
        }
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
                id: a.id,
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
                .flat_map(|mut c| {
                    let children = std::mem::take(&mut c.children)
                        .into_iter()
                        .flat_map(|cc| cc.nodes);
                    let parent = IssueComment::from(c);
                    let parent_id_for_children = parent.id.clone();
                    let children_iter = children.map(move |child| {
                        let mut comment = IssueComment::from(child);
                        comment.parent_id = Some(parent_id_for_children.clone());
                        comment
                    });
                    std::iter::once(parent).chain(children_iter)
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
            team_id: g.team.map(|t| t.id),
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
                id: a.id,
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
            completed_at: g.completed_at,
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
            id: a.id,
            name: a.name,
            avatar_url: a.avatar_url,
        }),
        updated_at: c.updated_at,
    }
}
