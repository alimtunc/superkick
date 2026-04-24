//! Blocker snapshot diff + event emission for the launch-queue poll (SUP-81).
//!
//! The launch-queue HTTP handler doubles as the Linear "poll" — every UI
//! refresh fetches the live issue list. This module sits between the fetch
//! and the classifier: it compares the freshly returned `blocked_by`
//! relations to the previous `issue_blockers` snapshot, detects blockers that
//! have just turned terminal, emits a `DependencyResolved` event on the
//! workspace bus for each transition, then upserts the new snapshot.
//!
//! Why here and not in the classifier: the classifier is pure. Diffing is
//! stateful (old vs. new) and has side effects (bus publish + DB write). The
//! classifier only needs the post-transition blocker list to gate the
//! downstream; the diff exists to feed the operator audit trail.
//!
//! ## Concurrency
//!
//! Two concurrent `GET /launch-queue` calls would otherwise each observe the
//! same pre-transition snapshot and each publish the same resolution events.
//! The handler takes a process-wide mutex (`AppState::blocker_reconcile_lock`)
//! around the diff+persist+emit window so at most one reconcile runs at a
//! time. Writes inside the window are already transactional via
//! `replace_for_downstreams`.

use chrono::Utc;
use std::collections::HashMap;
use std::sync::Arc;

use superkick_core::{
    DependencyResolvedPayload, IssueBlocker, IssueEvent, WorkspaceRunEvent,
    is_terminal_blocker_state,
};
use superkick_integrations::linear::LinearIssueListItem;
use superkick_runtime::WorkspaceEventBus;
use superkick_storage::repo::IssueBlockerRepo;
use tokio::sync::Mutex;

/// Diff the prior `issue_blockers` snapshot against the freshly fetched Linear
/// relations, emit a `DependencyResolved` event per terminal transition, then
/// replace the snapshot for every downstream atomically. Errors during
/// persistence are surfaced to the caller; an empty `issues` slice is a no-op
/// so a degraded Linear fetch (error branch) doesn't wipe the prior snapshot.
//
// TODO(SUP-81): the empty-issues no-op also means a legitimately-empty Linear
// workspace never clears stale rows. Revisit once the feature is used in a
// real workspace with no active issues.
pub(super) async fn reconcile_blockers(
    issues: &[LinearIssueListItem],
    repo: &impl IssueBlockerRepo,
    bus: &Arc<WorkspaceEventBus>,
    lock: &Mutex<()>,
) -> anyhow::Result<()> {
    if issues.is_empty() {
        return Ok(());
    }

    // Serialise reconciliation so two concurrent GETs can't both publish the
    // same transition. Held only for the diff+persist+emit window, not for
    // the surrounding handler work.
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

    // Persist first, emit after. If persistence fails we skip the emit — we'd
    // otherwise tell the UI "unblocked" without a stable snapshot to back it
    // up, and the next refresh would re-emit.
    let entries: Vec<(String, Vec<IssueBlocker>)> = issues
        .iter()
        .map(|issue| (issue.id.clone(), fresh_rows_for(issue, now)))
        .collect();
    repo.replace_for_downstreams(&entries).await?;

    for payload in transitions {
        bus.publish(WorkspaceRunEvent::IssueEvent(
            IssueEvent::DependencyResolved(payload),
        ));
    }

    Ok(())
}

/// Pure diff step. Visible for tests.
pub(super) fn detect_transitions(
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
    use chrono::Utc;
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

        // First sighting of a pair, even with a terminal state, is not a
        // transition — we've never seen the blocker block anything.
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
}
