//! Blocker snapshot reconciliation for the launch-queue poll (SUP-81).
//!
//! The classifier in `superkick-core` is pure; this service handles the
//! stateful edge around it: compare the freshly returned Linear `blocked_by`
//! relations with the prior `issue_blockers` snapshot, publish
//! `DependencyResolved` events for non-terminal to terminal transitions, then
//! persist the fresh snapshot.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use anyhow::Result;
use chrono::Utc;
use superkick_core::{
    DependencyResolvedPayload, IssueBlocker, IssueEvent, WorkspaceRunEvent,
    is_terminal_blocker_state,
};
use superkick_integrations::linear::LinearIssueListItem;
use superkick_storage::repo::IssueBlockerRepo;
use tokio::sync::Mutex;

use crate::WorkspaceEventBus;

/// Diff the prior `issue_blockers` snapshot against the freshly fetched Linear
/// relations, emit a `DependencyResolved` event per terminal transition, then
/// replace the affected snapshot rows atomically. The caller must only invoke
/// this after a successful Linear fetch; degraded runs-only views should skip
/// reconciliation so stale DB rows are not cleared by accident.
pub async fn reconcile_blockers(
    issues: &[LinearIssueListItem],
    repo: &impl IssueBlockerRepo,
    bus: &Arc<WorkspaceEventBus>,
    lock: &Mutex<()>,
) -> Result<()> {
    let _guard = lock.lock().await;

    let now = Utc::now();
    let old = repo.list_all().await?;
    let old_by_pair: HashMap<(&str, &str), &str> = old
        .iter()
        .map(|b| {
            (
                (b.downstream_issue_id.as_str(), b.blocker_issue_id.as_str()),
                b.blocker_state_type.as_str(),
            )
        })
        .collect();

    let transitions = detect_transitions(issues, &old_by_pair, now);
    let entries = replacement_entries(issues, &old, now);

    // Persist first, emit after. If persistence fails we skip the emit so a
    // later refresh can retry without double-counting an unbacked transition.
    repo.replace_for_downstreams(&entries).await?;

    for payload in transitions {
        bus.publish(WorkspaceRunEvent::IssueEvent(
            IssueEvent::DependencyResolved(payload),
        ));
    }

    Ok(())
}

fn replacement_entries(
    issues: &[LinearIssueListItem],
    old: &[IssueBlocker],
    recorded_at: chrono::DateTime<Utc>,
) -> Vec<(String, Vec<IssueBlocker>)> {
    let fresh_ids: HashSet<&str> = issues.iter().map(|issue| issue.id.as_str()).collect();
    let mut entries: Vec<(String, Vec<IssueBlocker>)> = issues
        .iter()
        .map(|issue| (issue.id.clone(), fresh_rows_for(issue, recorded_at)))
        .collect();

    let mut stale_ids: Vec<String> = old
        .iter()
        .filter(|row| !fresh_ids.contains(row.downstream_issue_id.as_str()))
        .map(|row| row.downstream_issue_id.clone())
        .collect();
    stale_ids.sort();
    stale_ids.dedup();

    entries.extend(stale_ids.into_iter().map(|id| (id, Vec::new())));
    entries
}

fn detect_transitions(
    issues: &[LinearIssueListItem],
    old_by_pair: &HashMap<(&str, &str), &str>,
    now: chrono::DateTime<Utc>,
) -> Vec<DependencyResolvedPayload> {
    let mut out = Vec::new();
    for issue in issues {
        for blocker in &issue.blocked_by {
            let key = (issue.id.as_str(), blocker.id.as_str());
            let Some(old_state) = old_by_pair.get(&key) else {
                continue;
            };
            let was_non_terminal = !is_terminal_blocker_state(old_state);
            let now_terminal = is_terminal_blocker_state(&blocker.status.state_type);
            if was_non_terminal && now_terminal {
                out.push(DependencyResolvedPayload {
                    blocker_issue_id: blocker.id.clone(),
                    blocker_identifier: blocker.identifier.clone(),
                    downstream_issue_id: issue.id.clone(),
                    downstream_identifier: issue.identifier.clone(),
                    resolved_at: now,
                });
            }
        }
    }
    out
}

fn fresh_rows_for(
    issue: &LinearIssueListItem,
    recorded_at: chrono::DateTime<Utc>,
) -> Vec<IssueBlocker> {
    issue
        .blocked_by
        .iter()
        .map(|b| IssueBlocker {
            downstream_issue_id: issue.id.clone(),
            blocker_issue_id: b.id.clone(),
            blocker_identifier: b.identifier.clone(),
            blocker_title: b.title.clone(),
            blocker_state_type: b.status.state_type.clone(),
            recorded_at,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use superkick_integrations::linear::{
        IssueAssignee, IssueBlockerRef, IssueLabel, IssueParentRef, IssuePriority, IssueProject,
        IssueStatus,
    };

    fn status(state_type: &str) -> IssueStatus {
        IssueStatus {
            state_type: state_type.into(),
            name: state_type.into(),
            color: "#000".into(),
        }
    }

    fn make_issue(
        id: &str,
        identifier: &str,
        blockers: Vec<IssueBlockerRef>,
    ) -> LinearIssueListItem {
        LinearIssueListItem {
            id: id.into(),
            identifier: identifier.into(),
            title: "t".into(),
            status: status("started"),
            team_id: None,
            priority: IssuePriority {
                value: 3,
                label: "Medium".into(),
            },
            labels: Vec::<IssueLabel>::new(),
            assignee: None::<IssueAssignee>,
            project: None::<IssueProject>,
            parent: None::<IssueParentRef>,
            children: Vec::new(),
            blocked_by: blockers,
            url: "u".into(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            completed_at: None,
        }
    }

    fn blocker_ref(id: &str, identifier: &str, state: &str) -> IssueBlockerRef {
        IssueBlockerRef {
            id: id.into(),
            identifier: identifier.into(),
            title: "b".into(),
            status: status(state),
        }
    }

    fn blocker_row(downstream_id: &str, blocker_id: &str) -> IssueBlocker {
        IssueBlocker {
            downstream_issue_id: downstream_id.into(),
            blocker_issue_id: blocker_id.into(),
            blocker_identifier: "SUP-OLD".into(),
            blocker_title: "old".into(),
            blocker_state_type: "started".into(),
            recorded_at: Utc::now(),
        }
    }

    #[test]
    fn emits_when_blocker_transitions_from_started_to_completed() {
        let issues = vec![make_issue(
            "down",
            "SUP-81",
            vec![blocker_ref("blk", "SUP-77", "completed")],
        )];
        let old: HashMap<(&str, &str), &str> = [(("down", "blk"), "started")].into_iter().collect();

        let out = detect_transitions(&issues, &old, Utc::now());
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].blocker_identifier, "SUP-77");
        assert_eq!(out[0].downstream_identifier, "SUP-81");
    }

    #[test]
    fn no_emit_when_blocker_still_non_terminal() {
        let issues = vec![make_issue(
            "down",
            "SUP-81",
            vec![blocker_ref("blk", "SUP-77", "started")],
        )];
        let old: HashMap<(&str, &str), &str> = [(("down", "blk"), "started")].into_iter().collect();

        assert!(detect_transitions(&issues, &old, Utc::now()).is_empty());
    }

    #[test]
    fn no_emit_when_pair_is_new_even_if_terminal() {
        let issues = vec![make_issue(
            "down",
            "SUP-81",
            vec![blocker_ref("blk", "SUP-77", "completed")],
        )];
        let old: HashMap<(&str, &str), &str> = HashMap::new();

        assert!(detect_transitions(&issues, &old, Utc::now()).is_empty());
    }

    #[test]
    fn no_emit_when_blocker_was_already_terminal() {
        let issues = vec![make_issue(
            "down",
            "SUP-81",
            vec![blocker_ref("blk", "SUP-77", "canceled")],
        )];
        let old: HashMap<(&str, &str), &str> =
            [(("down", "blk"), "completed")].into_iter().collect();

        assert!(detect_transitions(&issues, &old, Utc::now()).is_empty());
    }

    #[test]
    fn replacement_entries_clear_stale_downstreams() {
        let old = vec![
            blocker_row("stale-a", "old-a"),
            blocker_row("stale-b", "old-b"),
        ];
        let entries = replacement_entries(&[], &old, Utc::now());

        assert_eq!(entries.len(), 2);
        assert!(
            entries
                .iter()
                .any(|(id, rows)| id == "stale-a" && rows.is_empty())
        );
        assert!(
            entries
                .iter()
                .any(|(id, rows)| id == "stale-b" && rows.is_empty())
        );
    }
}
