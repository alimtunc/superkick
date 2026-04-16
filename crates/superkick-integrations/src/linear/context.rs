//! Convert a full `IssueDetailResponse` into the bounded `IssueContext`
//! payload that child agents receive. Truncation is applied here so the
//! runtime never handles unbounded Linear text.

use chrono::Utc;
use superkick_core::{
    ISSUE_COMMENT_CHAR_LIMIT, ISSUE_COMMENT_MAX_COUNT, ISSUE_DESCRIPTION_CHAR_LIMIT, IssueContext,
    IssueContextComment, IssueContextParent, linear_context::truncate_on_char_boundary,
};

use super::types::IssueDetailResponse;

/// Build a bounded `IssueContext` from a full Linear issue payload.
///
/// The conversion is deterministic and pure — it takes the most recent
/// `ISSUE_COMMENT_MAX_COUNT` comments (by `created_at` descending) and
/// truncates long text on char boundaries.
pub fn issue_context_from_detail(detail: &IssueDetailResponse) -> IssueContext {
    let (description, description_truncated) =
        truncate_on_char_boundary(&detail.description, ISSUE_DESCRIPTION_CHAR_LIMIT);

    // Comment count as delivered by the Linear API — not guaranteed to equal
    // the upstream total if paging is ever introduced.
    let received = detail.comments.len() as u32;
    let mut sorted = detail.comments.clone();
    sorted.sort_by_key(|c| std::cmp::Reverse(c.created_at));
    sorted.truncate(ISSUE_COMMENT_MAX_COUNT);

    let comments = sorted
        .into_iter()
        .map(|c| {
            let (body, was_truncated) =
                truncate_on_char_boundary(&c.body, ISSUE_COMMENT_CHAR_LIMIT);
            IssueContextComment {
                author: c.author.map(|a| a.name),
                created_at: c.created_at,
                body,
                body_truncated: was_truncated,
            }
        })
        .collect();

    IssueContext {
        id: detail.id.clone(),
        identifier: detail.identifier.clone(),
        title: detail.title.clone(),
        url: detail.url.clone(),
        status_name: detail.status.name.clone(),
        status_type: detail.status.state_type.clone(),
        priority_label: detail.priority.label.clone(),
        labels: detail.labels.iter().map(|l| l.name.clone()).collect(),
        assignee: detail.assignee.as_ref().map(|a| a.name.clone()),
        project: detail.project.as_ref().map(|p| p.name.clone()),
        description,
        description_truncated,
        parent: detail.parent.as_ref().map(|p| IssueContextParent {
            identifier: p.identifier.clone(),
            title: p.title.clone(),
        }),
        comments,
        received_comment_count: received,
        fetched_at: Utc::now(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linear::types::{
        IssueAssignee, IssueComment, IssueLabel, IssuePriority, IssueStatus,
    };
    use chrono::{DateTime, TimeZone, Utc};

    fn at(ts: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(ts, 0).unwrap()
    }

    fn base(description: String, comments: Vec<IssueComment>) -> IssueDetailResponse {
        IssueDetailResponse {
            id: "abc".into(),
            identifier: "SUP-1".into(),
            title: "x".into(),
            status: IssueStatus {
                state_type: "started".into(),
                name: "In Progress".into(),
                color: "#fff".into(),
            },
            priority: IssuePriority {
                value: 1,
                label: "Urgent".into(),
            },
            url: "https://l".into(),
            created_at: at(0),
            updated_at: at(0),
            description,
            labels: vec![IssueLabel {
                name: "bug".into(),
                color: "red".into(),
            }],
            assignee: Some(IssueAssignee {
                name: "alice".into(),
                avatar_url: None,
            }),
            project: None,
            cycle: None,
            estimate: None,
            due_date: None,
            parent: None,
            children: vec![],
            comments,
            linked_runs: vec![],
        }
    }

    #[test]
    fn truncates_long_description() {
        let huge = "a".repeat(ISSUE_DESCRIPTION_CHAR_LIMIT + 10);
        let ctx = issue_context_from_detail(&base(huge, vec![]));
        assert!(ctx.description_truncated);
        assert_eq!(
            ctx.description.chars().count(),
            ISSUE_DESCRIPTION_CHAR_LIMIT
        );
    }

    #[test]
    fn caps_comments_and_records_total() {
        let mut comments = Vec::new();
        for i in 0..(ISSUE_COMMENT_MAX_COUNT as i64 + 5) {
            comments.push(IssueComment {
                id: format!("c{i}"),
                body: format!("hello {i}"),
                author: Some(IssueAssignee {
                    name: "bob".into(),
                    avatar_url: None,
                }),
                created_at: at(i),
                updated_at: at(i),
                parent_id: None,
            });
        }
        let received = comments.len() as u32;
        let ctx = issue_context_from_detail(&base("d".into(), comments));
        assert_eq!(ctx.received_comment_count, received);
        assert_eq!(ctx.comments.len(), ISSUE_COMMENT_MAX_COUNT);
        // Newest first — the last comment pushed (highest timestamp) must lead.
        let first_ts = ctx.comments.first().unwrap().created_at;
        let last_ts = ctx.comments.last().unwrap().created_at;
        assert!(first_ts > last_ts);
    }

    #[test]
    fn truncates_long_comment_body() {
        let huge = "z".repeat(ISSUE_COMMENT_CHAR_LIMIT + 5);
        let ctx = issue_context_from_detail(&base(
            "d".into(),
            vec![IssueComment {
                id: "c1".into(),
                body: huge,
                author: None,
                created_at: at(10),
                updated_at: at(10),
                parent_id: None,
            }],
        ));
        assert!(ctx.comments[0].body_truncated);
        assert_eq!(
            ctx.comments[0].body.chars().count(),
            ISSUE_COMMENT_CHAR_LIMIT
        );
    }
}
