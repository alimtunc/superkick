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
            author: c.user.map(gql_user_to_assignee),
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
        let (history, history_has_more) = history_from_gql(g.history, &g.id, g.created_at);
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
            assignee: g.assignee.map(gql_user_to_assignee),
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
            team_id: g.team.map(|t| t.id),
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
            history,
            history_has_more,
        }
    }
}

/// Linear returns newest-first; reverse and prepend a synthetic Created entry (Linear emits none).
fn history_from_gql(
    connection: Option<super::graphql::GqlIssueHistoryConnection>,
    issue_id: &str,
    issue_created_at: chrono::DateTime<chrono::Utc>,
) -> (Vec<IssueHistoryEntry>, bool) {
    let Some(conn) = connection else {
        let synthetic = synthesize_created_entry(issue_id, issue_created_at);
        return (vec![synthetic], false);
    };
    let has_more = conn.page_info.has_next_page;
    let mut entries: Vec<IssueHistoryEntry> = conn
        .nodes
        .into_iter()
        .filter_map(history_entry_from_gql)
        .collect();
    entries.reverse();
    if !entries.first().is_some_and(|e| {
        e.events
            .iter()
            .any(|ev| matches!(ev, IssueHistoryEvent::Created))
    }) {
        entries.insert(0, synthesize_created_entry(issue_id, issue_created_at));
    }
    (entries, has_more)
}

fn synthesize_created_entry(
    issue_id: &str,
    issue_created_at: chrono::DateTime<chrono::Utc>,
) -> IssueHistoryEntry {
    IssueHistoryEntry {
        id: format!("created:{issue_id}"),
        created_at: issue_created_at,
        actor: None,
        events: vec![IssueHistoryEvent::Created],
    }
}

fn history_entry_from_gql(node: super::graphql::GqlIssueHistory) -> Option<IssueHistoryEntry> {
    let mut events: Vec<IssueHistoryEvent> = Vec::new();

    if let (Some(from), Some(to)) = (node.from_state, node.to_state) {
        events.push(IssueHistoryEvent::StatusChanged {
            from: WorkflowStateRef {
                id: from.id,
                name: from.name,
                color: from.color,
                state_type: from.state_type,
            },
            to: WorkflowStateRef {
                id: to.id,
                name: to.name,
                color: to.color,
                state_type: to.state_type,
            },
        });
    }

    if node.from_assignee.is_some() || node.to_assignee.is_some() {
        events.push(IssueHistoryEvent::AssigneeChanged {
            from: node.from_assignee.map(gql_user_to_assignee),
            to: node.to_assignee.map(gql_user_to_assignee),
        });
    }

    if let Some(priority_event) = priority_event(node.from_priority, node.to_priority) {
        events.push(priority_event);
    }

    let added_labels = node.added_labels.unwrap_or_default();
    let removed_labels = node.removed_labels.unwrap_or_default();
    if !added_labels.is_empty() || !removed_labels.is_empty() {
        events.push(IssueHistoryEvent::LabelsChanged {
            added: added_labels
                .into_iter()
                .map(|l| IssueLabel {
                    name: l.name,
                    color: l.color,
                })
                .collect(),
            removed: removed_labels
                .into_iter()
                .map(|l| IssueLabel {
                    name: l.name,
                    color: l.color,
                })
                .collect(),
        });
    }

    if node.from_project.is_some() || node.to_project.is_some() {
        events.push(IssueHistoryEvent::ProjectChanged {
            from: node.from_project.map(|p| ProjectRef {
                id: p.id,
                name: p.name,
            }),
            to: node.to_project.map(|p| ProjectRef {
                id: p.id,
                name: p.name,
            }),
        });
    }

    if node.from_cycle.is_some() || node.to_cycle.is_some() {
        events.push(IssueHistoryEvent::CycleChanged {
            from: node.from_cycle.map(|c| CycleRef {
                id: c.id,
                name: c.name,
                number: c.number,
            }),
            to: node.to_cycle.map(|c| CycleRef {
                id: c.id,
                name: c.name,
                number: c.number,
            }),
        });
    }

    if node.from_estimate.is_some() || node.to_estimate.is_some() {
        events.push(IssueHistoryEvent::EstimateChanged {
            from: node.from_estimate,
            to: node.to_estimate,
        });
    }

    if node.from_due_date.is_some() || node.to_due_date.is_some() {
        events.push(IssueHistoryEvent::DueDateChanged {
            from: node.from_due_date,
            to: node.to_due_date,
        });
    }

    if let (Some(from), Some(to)) = (node.from_title, node.to_title) {
        events.push(IssueHistoryEvent::TitleChanged { from, to });
    }

    if node.updated_description == Some(true) {
        events.push(IssueHistoryEvent::DescriptionEdited);
    }

    if events.is_empty() {
        return None;
    }

    Some(IssueHistoryEntry {
        id: node.id,
        created_at: node.created_at,
        actor: node.actor.map(gql_user_to_assignee),
        events,
    })
}

fn gql_user_to_assignee(u: super::graphql::GqlUser) -> IssueAssignee {
    IssueAssignee {
        id: u.id,
        name: u.name,
        avatar_url: u.avatar_url,
    }
}

/// Clamp Linear's `Float` priority into the documented 0..=4 range and emit a
/// `PriorityChanged` event. Linear's wire shape is `Float` but the live range
/// is integer 0..=4 — anything outside is dropped defensively rather than
/// silently round-tripping a garbage value.
fn priority_event(from: Option<f32>, to: Option<f32>) -> Option<IssueHistoryEvent> {
    let from = clamp_priority(from?)?;
    let to = clamp_priority(to?)?;
    Some(IssueHistoryEvent::PriorityChanged { from, to })
}

fn clamp_priority(raw: f32) -> Option<u8> {
    if !raw.is_finite() {
        return None;
    }
    let rounded = raw.round();
    if !(0.0..=4.0).contains(&rounded) {
        return None;
    }
    Some(rounded as u8)
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
            assignee: g.assignee.map(gql_user_to_assignee),
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
        assignee: c.assignee.map(gql_user_to_assignee),
        updated_at: c.updated_at,
    }
}
