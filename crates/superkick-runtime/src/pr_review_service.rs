//! SUP-205 — GitHub PR review composition.
//!
//! Composes the `gh`-backed inbox, PR detail, activity timeline, and review
//! submission. Local review threads (staged comments + file-reviewed marks)
//! live in the subject-polymorphic `DiffReviewRepo`; this service maps the
//! staged threads onto GitHub review-comment anchors at submit time and falls
//! back to the review summary body when a line cannot be anchored.

use std::sync::Arc;
use std::sync::Mutex;

use superkick_core::{
    DiffReviewLineSide, DiffReviewSubject, DiffReviewThread, DiffReviewThreadState,
    PrActivityEvent, PrActivityKind, PrDiffFile, PrInboxItem, PrReviewDetail, PrReviewEvent,
    PrReviewer, classify_review_bucket,
};
use superkick_integrations::github::{
    self, GitHubIssueComment, GitHubPrReview, GitHubPrSummary, GitHubReviewComment,
    SubmitReviewComment, check_gh_auth, fetch_pr_files, fetch_pr_summary, submit_pr_review,
};
use superkick_storage::repo::DiffReviewRepo;

#[derive(Debug, thiserror::Error)]
pub enum PrReviewServiceError {
    #[error("GitHub CLI is not authenticated — run `gh auth login`")]
    GitHubAuth,
    #[error("pull request not found")]
    NotFound,
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Storage(anyhow::Error),
    #[error(transparent)]
    GitHub(anyhow::Error),
}

/// Outcome of a submitted review: how many staged comments anchored to lines
/// vs. degraded into the summary body.
#[derive(Debug, Clone, Copy)]
pub struct PrReviewSubmitOutcome {
    pub anchored_comments: usize,
    pub fallback_comments: usize,
}

pub struct PrReviewService<R>
where
    R: DiffReviewRepo + 'static,
{
    review_repo: Arc<R>,
    default_repo_slug: String,
    viewer_login: Mutex<Option<Option<String>>>,
}

impl<R> PrReviewService<R>
where
    R: DiffReviewRepo + 'static,
{
    pub fn new(review_repo: Arc<R>, default_repo_slug: String) -> Arc<Self> {
        Arc::new(Self {
            review_repo,
            default_repo_slug,
            viewer_login: Mutex::new(None),
        })
    }

    /// The authenticated GitHub login, cached after first resolution.
    /// Best-effort: a failure caches `None` so "your" buckets simply don't match.
    async fn viewer(&self) -> Option<String> {
        if let Ok(guard) = self.viewer_login.lock() {
            if let Some(cached) = guard.as_ref() {
                return cached.clone();
            }
        }
        let resolved = github::fetch_viewer_login().await.ok();
        if let Ok(mut guard) = self.viewer_login.lock() {
            *guard = Some(resolved.clone());
        }
        resolved
    }

    /// Fail fast with the actionable auth hint before any gh-backed work, so a
    /// logged-out operator gets `gh auth login` instead of a generic 503.
    async fn ensure_authenticated(&self) -> Result<(), PrReviewServiceError> {
        check_gh_auth()
            .await
            .map_err(|_| PrReviewServiceError::GitHubAuth)
    }

    /// PRs of the current project, grouped Linear-like. Opens dominate; a bounded
    /// window of merged/closed feeds the Completed bucket (collapsed in the UI).
    pub async fn inbox(&self) -> Result<Vec<PrInboxItem>, PrReviewServiceError> {
        if self.default_repo_slug.trim().is_empty() {
            return Err(PrReviewServiceError::Invalid(
                "no GitHub repository is configured for this project".into(),
            ));
        }
        self.ensure_authenticated().await?;
        let viewer = self.viewer().await;
        let mut summaries = self.fetch_state("open", 50).await?;
        summaries.extend(self.fetch_state("merged", 20).await?);
        summaries.extend(self.fetch_state("closed", 20).await?);

        let mut seen = std::collections::HashSet::new();
        let items = summaries
            .into_iter()
            .filter(|summary| seen.insert(summary.number))
            .map(|summary| self.inbox_item(summary, viewer.as_deref(), None))
            .collect();
        Ok(items)
    }

    async fn fetch_state(
        &self,
        state: &str,
        limit: u32,
    ) -> Result<Vec<GitHubPrSummary>, PrReviewServiceError> {
        github::fetch_pr_list(&self.default_repo_slug, state, limit)
            .await
            .map_err(PrReviewServiceError::GitHub)
    }

    /// PR detail header. `linked_issue` is supplied by the caller (the API layer
    /// resolves it from runs/issue PRs).
    pub async fn detail(
        &self,
        repo_slug: &str,
        number: u32,
        linked_issue_identifier: Option<String>,
        linked_issue_id: Option<String>,
    ) -> Result<PrReviewDetail, PrReviewServiceError> {
        self.ensure_authenticated().await?;
        let viewer = self.viewer().await;
        let summary = fetch_pr_summary(repo_slug, number)
            .await
            .map_err(PrReviewServiceError::GitHub)?;
        let created_at = summary.created_at;
        let body = summary.body.clone();
        let pull_request = self.inbox_item(summary, viewer.as_deref(), linked_issue_identifier);
        Ok(PrReviewDetail {
            pull_request,
            body,
            linked_issue_id,
            created_at,
        })
    }

    /// The PR diff, fetched live (no DB cache; TanStack Query caches client-side).
    pub async fn diff(
        &self,
        repo_slug: &str,
        number: u32,
    ) -> Result<Vec<PrDiffFile>, PrReviewServiceError> {
        self.ensure_authenticated().await?;
        fetch_pr_files(repo_slug, number)
            .await
            .map_err(PrReviewServiceError::GitHub)
    }

    /// Minimal GitHub activity: opened, review requested, comments, reviews.
    pub async fn activity(
        &self,
        repo_slug: &str,
        number: u32,
    ) -> Result<Vec<PrActivityEvent>, PrReviewServiceError> {
        self.ensure_authenticated().await?;
        let summary = fetch_pr_summary(repo_slug, number)
            .await
            .map_err(PrReviewServiceError::GitHub)?;
        let mut events = Vec::new();
        events.push(PrActivityEvent {
            kind: PrActivityKind::Opened,
            actor: summary.author.clone(),
            body: None,
            decision: None,
            file_path: None,
            created_at: summary.created_at,
        });
        for reviewer in &summary.requested_reviewers {
            events.push(PrActivityEvent {
                kind: PrActivityKind::ReviewRequested,
                actor: reviewer.clone(),
                body: None,
                decision: None,
                file_path: None,
                created_at: summary.updated_at,
            });
        }

        if let Ok(reviews) = github::fetch_pr_reviews(repo_slug, number).await {
            events.extend(review_events(reviews));
        }
        if let Ok(comments) = github::fetch_pr_review_comments(repo_slug, number).await {
            events.extend(review_comment_events(comments));
        }
        if let Ok(comments) = github::fetch_pr_issue_comments(repo_slug, number).await {
            events.extend(issue_comment_events(comments));
        }

        events.sort_by_key(|event| event.created_at);
        Ok(events)
    }

    /// Submit a GitHub review for a PR subject. Staged open threads map to line
    /// comments; unmappable anchors degrade into the summary body. After a
    /// successful submit the included threads are resolved so a re-submit posts
    /// nothing new (UI-visible idempotency).
    pub async fn submit(
        &self,
        repo_slug: &str,
        number: u32,
        head_sha: &str,
        event: PrReviewEvent,
        summary_body: &str,
    ) -> Result<PrReviewSubmitOutcome, PrReviewServiceError> {
        self.ensure_authenticated().await?;

        let subject =
            DiffReviewSubject::pull_request(repo_slug.to_string(), number, head_sha.to_string());
        let review = self
            .review_repo
            .list_by_subject(subject)
            .await
            .map_err(PrReviewServiceError::Storage)?;
        let open_threads: Vec<&DiffReviewThread> = review
            .threads
            .iter()
            .filter(|thread| thread.state == DiffReviewThreadState::Open)
            .collect();

        let files = fetch_pr_files(repo_slug, number)
            .await
            .map_err(PrReviewServiceError::GitHub)?;

        let (anchored, fallback_lines) = map_threads_to_comments(&open_threads, &files);
        let body = compose_body(summary_body, &fallback_lines);

        if matches!(
            event,
            PrReviewEvent::RequestChanges | PrReviewEvent::Comment
        ) && body.trim().is_empty()
            && anchored.is_empty()
        {
            return Err(PrReviewServiceError::Invalid(
                "a comment or request-changes review needs a summary or at least one comment"
                    .into(),
            ));
        }

        submit_pr_review(repo_slug, number, event.as_github_event(), &body, &anchored)
            .await
            .map_err(PrReviewServiceError::GitHub)?;

        for thread in &open_threads {
            match self.review_repo.set_thread_resolved(thread.id, true).await {
                Ok(Some(_)) => {}
                Ok(None) => {
                    tracing::warn!(thread = %thread.id.0, "submitted review thread vanished before it could be resolved");
                }
                Err(err) => {
                    tracing::warn!(thread = %thread.id.0, error = %err, "failed to resolve submitted review thread");
                }
            }
        }

        Ok(PrReviewSubmitOutcome {
            anchored_comments: anchored.len(),
            fallback_comments: fallback_lines.len(),
        })
    }

    fn inbox_item(
        &self,
        summary: GitHubPrSummary,
        viewer: Option<&str>,
        linked_issue_identifier: Option<String>,
    ) -> PrInboxItem {
        let bucket = classify_review_bucket(
            summary.state,
            summary.is_draft,
            summary.review_decision,
            &summary.author,
            &summary.requested_reviewers,
            viewer,
        );
        let reviewers = merge_reviewers(&summary);
        PrInboxItem {
            repo_slug: self.default_repo_slug.clone(),
            number: summary.number,
            title: summary.title,
            url: summary.url,
            state: summary.state,
            is_draft: summary.is_draft,
            author: summary.author,
            head_branch: summary.head_branch,
            base_branch: summary.base_branch,
            head_sha: summary.head_sha,
            reviewers,
            review_decision: summary.review_decision,
            review_comment_count: 0,
            bucket,
            linked_issue_identifier,
            checks: summary.checks,
            updated_at: summary.updated_at,
        }
    }
}

fn merge_reviewers(summary: &GitHubPrSummary) -> Vec<PrReviewer> {
    let mut reviewers: Vec<PrReviewer> = summary
        .latest_reviews
        .iter()
        .map(|(login, state)| PrReviewer {
            login: login.clone(),
            state: Some(*state),
        })
        .collect();
    for requested in &summary.requested_reviewers {
        if !reviewers
            .iter()
            .any(|reviewer| &reviewer.login == requested)
        {
            reviewers.push(PrReviewer {
                login: requested.clone(),
                state: None,
            });
        }
    }
    reviewers
}

fn review_events(reviews: Vec<GitHubPrReview>) -> impl Iterator<Item = PrActivityEvent> {
    reviews.into_iter().filter_map(|review| {
        let created_at = review.submitted_at?;
        Some(PrActivityEvent {
            kind: PrActivityKind::ReviewSubmitted,
            actor: review.author,
            body: optional_text(review.body),
            decision: review.state,
            file_path: None,
            created_at,
        })
    })
}

fn review_comment_events(
    comments: Vec<GitHubReviewComment>,
) -> impl Iterator<Item = PrActivityEvent> {
    comments.into_iter().map(|comment| PrActivityEvent {
        kind: PrActivityKind::Commented,
        actor: comment.author,
        body: optional_text(comment.body),
        decision: None,
        file_path: comment.path,
        created_at: comment.created_at,
    })
}

fn issue_comment_events(
    comments: Vec<GitHubIssueComment>,
) -> impl Iterator<Item = PrActivityEvent> {
    comments.into_iter().map(|comment| PrActivityEvent {
        kind: PrActivityKind::Commented,
        actor: comment.author,
        body: optional_text(comment.body),
        decision: None,
        file_path: None,
        created_at: comment.created_at,
    })
}

fn optional_text(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Build the review summary body, appending any unmappable comments so they are
/// never silently dropped (the global-comment fallback).
fn compose_body(summary_body: &str, fallback_lines: &[String]) -> String {
    let mut body = summary_body.trim().to_string();
    if fallback_lines.is_empty() {
        return body;
    }
    if !body.is_empty() {
        body.push_str("\n\n");
    }
    body.push_str("Unanchored review comments:");
    for line in fallback_lines {
        body.push_str("\n- ");
        body.push_str(line);
    }
    body
}

/// Map staged open threads onto GitHub review-comment anchors. Threads whose
/// anchor line is not part of the PR diff are returned as fallback descriptions
/// for the summary body.
fn map_threads_to_comments(
    threads: &[&DiffReviewThread],
    files: &[PrDiffFile],
) -> (Vec<SubmitReviewComment>, Vec<String>) {
    let mut comments = Vec::new();
    let mut fallback = Vec::new();
    for thread in threads {
        let body = thread_body(thread);
        let anchor = &thread.anchor;
        let mapped = anchor_to_line_side(anchor.side, anchor.old_line, anchor.new_line).and_then(
            |(side, line)| {
                let file = files.iter().find(|file| file.path == anchor.file_path)?;
                let patch = file.patch.as_deref()?;
                if patch_covers_line(patch, side, line) {
                    Some((side, line))
                } else {
                    None
                }
            },
        );
        match mapped {
            Some((side, line)) => comments.push(SubmitReviewComment {
                path: anchor.file_path.clone(),
                line,
                side: side.to_string(),
                body,
            }),
            None => fallback.push(format!(
                "{} ({}): {}",
                anchor.file_path,
                line_label(anchor.side, anchor.old_line, anchor.new_line),
                body
            )),
        }
    }
    (comments, fallback)
}

fn thread_body(thread: &DiffReviewThread) -> String {
    thread
        .comments
        .iter()
        .map(|comment| comment.body.trim())
        .filter(|body| !body.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// GitHub review-comment side ("LEFT"=old, "RIGHT"=new) + line for an anchor.
fn anchor_to_line_side(
    side: DiffReviewLineSide,
    old_line: Option<u32>,
    new_line: Option<u32>,
) -> Option<(&'static str, u32)> {
    match side {
        DiffReviewLineSide::New => new_line.map(|line| ("RIGHT", line)),
        DiffReviewLineSide::Old => old_line.map(|line| ("LEFT", line)),
        DiffReviewLineSide::Context => new_line
            .map(|line| ("RIGHT", line))
            .or_else(|| old_line.map(|line| ("LEFT", line))),
    }
}

fn line_label(side: DiffReviewLineSide, old_line: Option<u32>, new_line: Option<u32>) -> String {
    match anchor_to_line_side(side, old_line, new_line) {
        Some((side, line)) => format!("{side} line {line}"),
        None => "line unknown".to_string(),
    }
}

/// Whether a unified-diff `patch` covers `line` on the given side ("LEFT"=old
/// image, "RIGHT"=new image). Used to gate which staged comments can anchor to
/// a GitHub review-comment line vs. degrade to the summary body.
fn patch_covers_line(patch: &str, side: &str, line: u32) -> bool {
    for header in patch.lines().filter(|line| line.starts_with("@@")) {
        if let Some((old_range, new_range)) = parse_hunk_header(header) {
            let range = if side == "LEFT" { old_range } else { new_range };
            let (start, count) = range;
            if count > 0 && line >= start && line < start + count {
                return true;
            }
        }
    }
    false
}

/// Parse `@@ -old_start,old_count +new_start,new_count @@` into the two ranges.
/// Counts default to 1 when omitted (`@@ -a +b @@`).
fn parse_hunk_header(header: &str) -> Option<((u32, u32), (u32, u32))> {
    let inner = header.trim_start_matches('@').trim();
    let inner = inner.split("@@").next()?.trim();
    let mut parts = inner.split_whitespace();
    let old = parts.next()?.strip_prefix('-')?;
    let new = parts.next()?.strip_prefix('+')?;
    Some((parse_range(old)?, parse_range(new)?))
}

fn parse_range(value: &str) -> Option<(u32, u32)> {
    let mut parts = value.split(',');
    let start = parts.next()?.parse().ok()?;
    let count = match parts.next() {
        Some(count) => count.parse().ok()?,
        None => 1,
    };
    Some((start, count))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use superkick_core::{
        DiffReviewAnchor, DiffReviewComment, DiffReviewCommentId, DiffReviewThreadId,
        PrDiffFileStatus,
    };

    fn thread(
        file_path: &str,
        side: DiffReviewLineSide,
        new_line: Option<u32>,
        body: &str,
    ) -> DiffReviewThread {
        let now = Utc::now();
        let id = DiffReviewThreadId::new();
        DiffReviewThread {
            id,
            anchor: DiffReviewAnchor {
                subject: DiffReviewSubject::pull_request("owner/repo", 1, "sha"),
                issue_id: None,
                file_path: file_path.into(),
                old_path: None,
                side,
                old_line: None,
                old_line_end: None,
                new_line,
                new_line_end: None,
                hunk_header: None,
                hunk_index: None,
                base_ref: Some("base".into()),
                head_ref: Some("head".into()),
            },
            state: DiffReviewThreadState::Open,
            author: "operator".into(),
            created_at: now,
            updated_at: now,
            comments: vec![DiffReviewComment {
                id: DiffReviewCommentId::new(),
                thread_id: id,
                author: "operator".into(),
                body: body.into(),
                created_at: now,
                updated_at: now,
            }],
        }
    }

    fn file(path: &str, patch: &str) -> PrDiffFile {
        PrDiffFile {
            path: path.into(),
            old_path: None,
            status: PrDiffFileStatus::Modified,
            additions: 1,
            deletions: 0,
            patch: Some(patch.into()),
            position: 0,
        }
    }

    #[test]
    fn parses_hunk_header_ranges() {
        assert_eq!(
            parse_hunk_header("@@ -10,3 +12,4 @@ fn main() {"),
            Some(((10, 3), (12, 4)))
        );
        assert_eq!(parse_hunk_header("@@ -1 +1 @@"), Some(((1, 1), (1, 1))));
    }

    #[test]
    fn patch_covers_only_lines_inside_hunks() {
        let patch = "@@ -10,3 +12,4 @@\n line\n+added\n line";
        assert!(patch_covers_line(patch, "RIGHT", 12));
        assert!(patch_covers_line(patch, "RIGHT", 15));
        assert!(!patch_covers_line(patch, "RIGHT", 16));
        assert!(patch_covers_line(patch, "LEFT", 10));
        assert!(!patch_covers_line(patch, "LEFT", 13));
    }

    #[test]
    fn maps_anchored_comment_and_falls_back_when_outside_diff() {
        let in_diff = thread("src/lib.rs", DiffReviewLineSide::New, Some(13), "anchor me");
        let out_of_diff = thread("src/lib.rs", DiffReviewLineSide::New, Some(99), "global me");
        let missing_file = thread("missing.rs", DiffReviewLineSide::New, Some(1), "no file");
        let threads = vec![&in_diff, &out_of_diff, &missing_file];
        let files = vec![file(
            "src/lib.rs",
            "@@ -10,3 +12,4 @@\n line\n+added\n line\n line",
        )];

        let (comments, fallback) = map_threads_to_comments(&threads, &files);
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].path, "src/lib.rs");
        assert_eq!(comments[0].line, 13);
        assert_eq!(comments[0].side, "RIGHT");
        assert_eq!(comments[0].body, "anchor me");
        assert_eq!(fallback.len(), 2);
        assert!(fallback.iter().any(|line| line.contains("global me")));
        assert!(fallback.iter().any(|line| line.contains("no file")));
    }

    #[test]
    fn compose_body_appends_fallback_section() {
        let body = compose_body(
            "Looks good overall.",
            &["src/lib.rs (RIGHT line 99): global me".into()],
        );
        assert!(body.starts_with("Looks good overall."));
        assert!(body.contains("Unanchored review comments:"));
        assert!(body.contains("global me"));

        let empty = compose_body("", &[]);
        assert_eq!(empty, "");
    }
}
