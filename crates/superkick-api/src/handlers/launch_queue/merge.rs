//! Project the pure `LaunchQueueClassification` onto the wire shape
//! consumed by the UI. Splits issue verdicts and run verdicts into their
//! respective buckets, attaches the linked issue for runs, and drops issues
//! that are already covered by a live run.

use indexmap::IndexMap;
use superkick_core::{ClassifiedIssue, ClassifiedRun, LaunchQueue, LaunchQueueClassification};
use superkick_integrations::linear::LinearIssueListItem;

use crate::handlers::queue_common::RunTriage;

use super::wire::{LaunchQueueWireItem, LinkedIssueSummary};

pub(super) fn merge_into_groups(
    classification: &LaunchQueueClassification,
    issues: &[LinearIssueListItem],
    triages: &[RunTriage],
) -> IndexMap<&'static str, Vec<LaunchQueueWireItem>> {
    let mut groups: IndexMap<&'static str, Vec<LaunchQueueWireItem>> = LaunchQueue::ALL
        .iter()
        .map(|b| (b.slug(), Vec::new()))
        .collect();

    // Issues — skip ones joined to a live run. The run carries the bucket
    // so we avoid double-rendering the same logical work item.
    for classified in &classification.issues {
        if classified.linked_run_id.is_some() {
            continue;
        }
        let Some(issue) = issues
            .iter()
            .find(|i| i.identifier == classified.identifier)
        else {
            continue;
        };
        push_issue(&mut groups, classified, issue.clone());
    }

    // Runs — render every classified run with its full wire payload.
    for classified in &classification.runs {
        let Some(triage) = triages.iter().find(|t| t.run.id == classified.run_id) else {
            continue;
        };
        let linked_issue = find_linked_issue(issues, &triage.run.issue_identifier);
        push_run(&mut groups, classified, triage, linked_issue);
    }

    groups
}

fn push_issue(
    groups: &mut IndexMap<&'static str, Vec<LaunchQueueWireItem>>,
    classified: &ClassifiedIssue,
    issue: LinearIssueListItem,
) {
    groups
        .entry(classified.bucket.slug())
        .or_default()
        .push(LaunchQueueWireItem::Issue {
            issue,
            bucket: classified.bucket,
            reason: classified.reason.clone(),
        });
}

fn push_run(
    groups: &mut IndexMap<&'static str, Vec<LaunchQueueWireItem>>,
    classified: &ClassifiedRun,
    triage: &RunTriage,
    linked_issue: Option<LinkedIssueSummary>,
) {
    groups
        .entry(classified.bucket.slug())
        .or_default()
        .push(LaunchQueueWireItem::Run {
            run: triage.run.clone(),
            linked_issue,
            bucket: classified.bucket,
            reason: classified.reason.clone(),
            pending_attention_count: triage.pending_attention_count,
            pending_interrupt_count: triage.pending_interrupt_count,
            pr: triage.pr.clone(),
        });
}

fn find_linked_issue(
    issues: &[LinearIssueListItem],
    identifier: &str,
) -> Option<LinkedIssueSummary> {
    issues
        .iter()
        .find(|i| i.identifier == identifier)
        .map(|i| LinkedIssueSummary {
            identifier: i.identifier.clone(),
            title: i.title.clone(),
            url: i.url.clone(),
        })
}
