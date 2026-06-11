//! Local diff review threads for run review.
//!
//! These types are local-first: they model operator comments anchored to a
//! run's diff and deliberately carry no GitHub review identifiers.

use std::fmt::Write;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::id::{DiffReviewCommentId, DiffReviewThreadId, RunId};

pub const DEFAULT_REVIEW_AUTHOR: &str = "operator";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffReviewLineSide {
    Old,
    New,
    Context,
}

impl std::fmt::Display for DiffReviewLineSide {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let side = match self {
            Self::Old => "old",
            Self::New => "new",
            Self::Context => "context",
        };
        f.write_str(side)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffReviewThreadState {
    Open,
    Resolved,
}

impl std::fmt::Display for DiffReviewThreadState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let state = match self {
            Self::Open => "open",
            Self::Resolved => "resolved",
        };
        f.write_str(state)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffReviewAnchor {
    pub run_id: RunId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issue_id: Option<String>,
    pub file_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub side: DiffReviewLineSide,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_line: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_line_end: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_line: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_line_end: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hunk_header: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hunk_index: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_ref: Option<String>,
}

impl DiffReviewAnchor {
    pub fn validate(&self) -> Result<(), CoreError> {
        if self.file_path.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "review file_path must not be empty".into(),
            ));
        }
        if self.old_line == Some(0)
            || self.old_line_end == Some(0)
            || self.new_line == Some(0)
            || self.new_line_end == Some(0)
        {
            return Err(CoreError::InvalidInput(
                "review anchor line numbers must be greater than zero".into(),
            ));
        }
        validate_line_range("old", self.old_line, self.old_line_end)?;
        validate_line_range("new", self.new_line, self.new_line_end)?;
        match self.side {
            DiffReviewLineSide::Old if self.old_line.is_none() => {
                return Err(CoreError::InvalidInput(
                    "old review anchor requires old_line".into(),
                ));
            }
            DiffReviewLineSide::New if self.new_line.is_none() => {
                return Err(CoreError::InvalidInput(
                    "new review anchor requires new_line".into(),
                ));
            }
            DiffReviewLineSide::Context if self.old_line.is_none() || self.new_line.is_none() => {
                return Err(CoreError::InvalidInput(
                    "context review anchor requires old_line and new_line".into(),
                ));
            }
            _ => {}
        }
        Ok(())
    }

    fn into_normalized(mut self) -> Result<Self, CoreError> {
        self.validate()?;
        self.issue_id = normalize_optional_string(self.issue_id);
        self.file_path = self.file_path.trim().to_string();
        self.old_path = normalize_optional_string(self.old_path);
        self.hunk_header = normalize_optional_string(self.hunk_header);
        self.base_ref = normalize_optional_string(self.base_ref);
        self.head_ref = normalize_optional_string(self.head_ref);
        Ok(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffReviewComment {
    pub id: DiffReviewCommentId,
    pub thread_id: DiffReviewThreadId,
    pub author: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl DiffReviewComment {
    pub fn new(
        thread_id: DiffReviewThreadId,
        new: NewDiffReviewComment,
    ) -> Result<Self, CoreError> {
        let now = Utc::now();
        Ok(Self {
            id: DiffReviewCommentId::new(),
            thread_id,
            author: normalize_author(new.author),
            body: normalize_body(&new.body)?,
            created_at: now,
            updated_at: now,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffReviewThread {
    pub id: DiffReviewThreadId,
    pub anchor: DiffReviewAnchor,
    pub state: DiffReviewThreadState,
    pub author: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub comments: Vec<DiffReviewComment>,
}

impl DiffReviewThread {
    pub fn new(new: NewDiffReviewThread) -> Result<Self, CoreError> {
        let anchor = new.anchor.into_normalized()?;
        let now = Utc::now();
        let id = DiffReviewThreadId::new();
        let author = normalize_author(new.author);
        let comment = DiffReviewComment {
            id: DiffReviewCommentId::new(),
            thread_id: id,
            author: author.clone(),
            body: normalize_body(&new.body)?,
            created_at: now,
            updated_at: now,
        };
        Ok(Self {
            id,
            anchor,
            state: DiffReviewThreadState::Open,
            author,
            created_at: now,
            updated_at: now,
            comments: vec![comment],
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffReviewFileState {
    pub run_id: RunId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issue_id: Option<String>,
    pub file_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub reviewed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reviewer: Option<String>,
    pub updated_at: DateTime<Utc>,
}

impl DiffReviewFileState {
    pub fn from_change(change: DiffReviewFileReviewedChange) -> Result<Self, CoreError> {
        if change.file_path.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "review file_path must not be empty".into(),
            ));
        }
        Ok(Self {
            run_id: change.run_id,
            issue_id: normalize_optional_string(change.issue_id),
            file_path: change.file_path.trim().to_string(),
            old_path: normalize_optional_string(change.old_path),
            reviewed: change.reviewed,
            reviewer: change
                .reviewer
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            updated_at: Utc::now(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffReviewState {
    pub run_id: RunId,
    pub threads: Vec<DiffReviewThread>,
    pub reviewed_files: Vec<DiffReviewFileState>,
    pub unresolved_thread_count: u32,
    pub unresolved_comment_count: u32,
}

impl DiffReviewState {
    pub fn new(
        run_id: RunId,
        threads: Vec<DiffReviewThread>,
        reviewed_files: Vec<DiffReviewFileState>,
    ) -> Self {
        let unresolved_threads: Vec<&DiffReviewThread> = threads
            .iter()
            .filter(|thread| thread.state == DiffReviewThreadState::Open)
            .collect();
        let unresolved_thread_count = unresolved_threads.len() as u32;
        let unresolved_comment_count = unresolved_threads
            .iter()
            .map(|thread| thread.comments.len() as u32)
            .sum();
        Self {
            run_id,
            threads,
            reviewed_files,
            unresolved_thread_count,
            unresolved_comment_count,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewDiffReviewThread {
    pub anchor: DiffReviewAnchor,
    pub author: Option<String>,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewDiffReviewComment {
    pub author: Option<String>,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffReviewFileReviewedChange {
    pub run_id: RunId,
    pub issue_id: Option<String>,
    pub file_path: String,
    pub old_path: Option<String>,
    pub reviewed: bool,
    pub reviewer: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiffReviewFixPromptComment {
    pub file_path: String,
    pub side: DiffReviewLineSide,
    pub old_line: Option<u32>,
    pub old_line_end: Option<u32>,
    pub new_line: Option<u32>,
    pub new_line_end: Option<u32>,
    pub body: String,
}

pub fn unresolved_diff_review_fix_prompt_comments(
    review: &DiffReviewState,
) -> Vec<DiffReviewFixPromptComment> {
    review
        .threads
        .iter()
        .filter(|thread| thread.state == DiffReviewThreadState::Open)
        .flat_map(|thread| {
            thread
                .comments
                .iter()
                .map(|comment| DiffReviewFixPromptComment {
                    file_path: thread.anchor.file_path.clone(),
                    side: thread.anchor.side,
                    old_line: thread.anchor.old_line,
                    old_line_end: thread.anchor.old_line_end,
                    new_line: thread.anchor.new_line,
                    new_line_end: thread.anchor.new_line_end,
                    body: comment.body.clone(),
                })
        })
        .collect()
}

pub fn render_diff_review_fix_prompt(
    issue_identifier: &str,
    source_run_id: RunId,
    source_branch: Option<&str>,
    base_ref: &str,
    head_ref: &str,
    comments: &[DiffReviewFixPromptComment],
    snapshot_json: Option<&str>,
) -> String {
    let mut prompt = String::new();
    writeln!(
        prompt,
        "Address these unresolved local review comments for {issue_identifier}."
    )
    .expect("write prompt");
    writeln!(prompt).expect("write prompt");
    writeln!(prompt, "Source run: {source_run_id}").expect("write prompt");
    if let Some(branch) = source_branch {
        writeln!(prompt, "Reviewed branch: {branch}").expect("write prompt");
    }
    writeln!(prompt, "Diff refs: base {base_ref}, head {head_ref}").expect("write prompt");
    writeln!(prompt).expect("write prompt");
    writeln!(prompt, "Instructions:").expect("write prompt");
    writeln!(
        prompt,
        "- Address these unresolved local review comments before considering the work done."
    )
    .expect("write prompt");
    writeln!(prompt, "- Do not introduce unrelated changes.").expect("write prompt");
    writeln!(
        prompt,
        "- Keep the fix narrowly scoped to the reviewed diff and comments."
    )
    .expect("write prompt");
    writeln!(
        prompt,
        "- Run focused verification for the touched area or report any blockers."
    )
    .expect("write prompt");
    writeln!(prompt).expect("write prompt");
    writeln!(prompt, "Unresolved comments:").expect("write prompt");
    for (index, comment) in comments.iter().enumerate() {
        writeln!(
            prompt,
            "{}. {} ({})",
            index + 1,
            comment.file_path,
            line_label(comment)
        )
        .expect("write prompt");
        writeln!(prompt, "   {}", comment.body).expect("write prompt");
    }
    writeln!(prompt).expect("write prompt");
    writeln!(prompt, "Run context snapshot:").expect("write prompt");
    match snapshot_json {
        Some(snapshot) => writeln!(prompt, "```json\n{snapshot}\n```").expect("write prompt"),
        None => writeln!(
            prompt,
            "No launch-task context snapshot is available for this run."
        )
        .expect("write prompt"),
    }
    prompt
}

pub fn normalize_diff_review_comment_body(body: &str) -> Result<String, CoreError> {
    normalize_body(body)
}

fn normalize_author(author: Option<String>) -> String {
    author
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_REVIEW_AUTHOR.to_string())
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn normalize_body(body: &str) -> Result<String, CoreError> {
    let body = body.trim();
    if body.is_empty() {
        return Err(CoreError::InvalidInput(
            "review comment body must not be empty".into(),
        ));
    }
    Ok(body.to_string())
}

fn validate_line_range(side: &str, start: Option<u32>, end: Option<u32>) -> Result<(), CoreError> {
    let Some(end) = end else {
        return Ok(());
    };
    let Some(start) = start else {
        return Err(CoreError::InvalidInput(format!(
            "{side} review line range requires a start line"
        )));
    };
    if end < start {
        return Err(CoreError::InvalidInput(format!(
            "{side} review line range must end on or after its start line"
        )));
    }
    Ok(())
}

fn line_label(comment: &DiffReviewFixPromptComment) -> String {
    match comment.side {
        DiffReviewLineSide::New => line_span_label("new", comment.new_line, comment.new_line_end),
        DiffReviewLineSide::Old => line_span_label("old", comment.old_line, comment.old_line_end),
        DiffReviewLineSide::Context => match (comment.old_line, comment.new_line) {
            (Some(old_line), Some(new_line)) => {
                let old_label = span_suffix(old_line, comment.old_line_end);
                let new_label = span_suffix(new_line, comment.new_line_end);
                format!("context old line{old_label}, new line{new_label}")
            }
            (Some(line), None) => {
                let suffix = span_suffix(line, comment.old_line_end);
                format!("context old line{suffix}")
            }
            (None, Some(line)) => {
                let suffix = span_suffix(line, comment.new_line_end);
                format!("context new line{suffix}")
            }
            (None, None) => "context line unknown".to_string(),
        },
    }
}

fn line_span_label(side: &str, start: Option<u32>, end: Option<u32>) -> String {
    match start {
        Some(start) => match end {
            Some(end) if end > start => format!("{side} lines {start}-{end}"),
            _ => format!("{side} line {start}"),
        },
        None => format!("{side} line unknown"),
    }
}

fn span_suffix(start: u32, end: Option<u32>) -> String {
    match end {
        Some(end) if end > start => format!("s {start}-{end}"),
        _ => format!(" {start}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn anchor(side: DiffReviewLineSide) -> DiffReviewAnchor {
        DiffReviewAnchor {
            run_id: RunId::new(),
            issue_id: Some("issue-1".into()),
            file_path: "src/lib.rs".into(),
            old_path: None,
            side,
            old_line: None,
            old_line_end: None,
            new_line: None,
            new_line_end: None,
            hunk_header: Some("@@ -1,2 +1,2 @@".into()),
            hunk_index: Some(0),
            base_ref: Some("abc1234".into()),
            head_ref: Some("def5678".into()),
        }
    }

    #[test]
    fn new_thread_rejects_side_without_matching_line() {
        let err = DiffReviewThread::new(NewDiffReviewThread {
            anchor: anchor(DiffReviewLineSide::New),
            author: Some("operator".into()),
            body: "Needs a line.".into(),
        })
        .expect_err("new side without new_line should fail");

        assert!(matches!(err, CoreError::InvalidInput(message) if message.contains("new_line")));
    }

    #[test]
    fn old_thread_rejects_side_without_matching_line() {
        let err = DiffReviewThread::new(NewDiffReviewThread {
            anchor: anchor(DiffReviewLineSide::Old),
            author: Some("operator".into()),
            body: "Needs a line.".into(),
        })
        .expect_err("old side without old_line should fail");

        assert!(matches!(err, CoreError::InvalidInput(message) if message.contains("old_line")));
    }

    #[test]
    fn context_thread_requires_both_lines() {
        let mut review_anchor = anchor(DiffReviewLineSide::Context);
        review_anchor.old_line = Some(3);
        let err = DiffReviewThread::new(NewDiffReviewThread {
            anchor: review_anchor,
            author: Some("operator".into()),
            body: "Context needs both sides.".into(),
        })
        .expect_err("context without both lines should fail");

        assert!(
            matches!(err, CoreError::InvalidInput(message) if message.contains("old_line and new_line"))
        );
    }

    #[test]
    fn context_thread_accepts_both_lines() {
        let mut review_anchor = anchor(DiffReviewLineSide::Context);
        review_anchor.old_line = Some(3);
        review_anchor.new_line = Some(4);
        let thread = DiffReviewThread::new(NewDiffReviewThread {
            anchor: review_anchor,
            author: Some("operator".into()),
            body: "Context is anchored to both sides.".into(),
        })
        .expect("context with both lines");

        assert_eq!(thread.anchor.side, DiffReviewLineSide::Context);
        assert_eq!(thread.anchor.old_line, Some(3));
        assert_eq!(thread.anchor.new_line, Some(4));
    }

    #[test]
    fn new_thread_accepts_line_range() {
        let mut review_anchor = anchor(DiffReviewLineSide::New);
        review_anchor.new_line = Some(4);
        review_anchor.new_line_end = Some(7);
        let thread = DiffReviewThread::new(NewDiffReviewThread {
            anchor: review_anchor,
            author: Some("operator".into()),
            body: "Range needs a single review thread.".into(),
        })
        .expect("new line range");

        assert_eq!(thread.anchor.new_line, Some(4));
        assert_eq!(thread.anchor.new_line_end, Some(7));
    }

    #[test]
    fn new_thread_rejects_line_range_ending_before_start() {
        let mut review_anchor = anchor(DiffReviewLineSide::New);
        review_anchor.new_line = Some(7);
        review_anchor.new_line_end = Some(4);
        let err = DiffReviewThread::new(NewDiffReviewThread {
            anchor: review_anchor,
            author: Some("operator".into()),
            body: "Invalid range.".into(),
        })
        .expect_err("range ending before start should fail");

        assert!(matches!(err, CoreError::InvalidInput(message) if message.contains("line range")));
    }

    #[test]
    fn thread_normalizes_anchor_paths_and_refs() {
        let mut review_anchor = anchor(DiffReviewLineSide::New);
        review_anchor.issue_id = Some(" issue-1 ".into());
        review_anchor.file_path = " src/lib.rs ".into();
        review_anchor.old_path = Some(" src/old_lib.rs ".into());
        review_anchor.new_line = Some(9);
        review_anchor.base_ref = Some(" abc1234 ".into());
        review_anchor.head_ref = Some(" def5678 ".into());

        let thread = DiffReviewThread::new(NewDiffReviewThread {
            anchor: review_anchor,
            author: Some("operator".into()),
            body: "Normalize this.".into(),
        })
        .expect("thread");

        assert_eq!(thread.anchor.issue_id.as_deref(), Some("issue-1"));
        assert_eq!(thread.anchor.file_path, "src/lib.rs");
        assert_eq!(thread.anchor.old_path.as_deref(), Some("src/old_lib.rs"));
        assert_eq!(thread.anchor.base_ref.as_deref(), Some("abc1234"));
        assert_eq!(thread.anchor.head_ref.as_deref(), Some("def5678"));
    }

    #[test]
    fn reviewed_file_state_normalizes_paths() {
        let state = DiffReviewFileState::from_change(DiffReviewFileReviewedChange {
            run_id: RunId::new(),
            issue_id: Some(" issue-1 ".into()),
            file_path: " src/lib.rs ".into(),
            old_path: Some(" src/old_lib.rs ".into()),
            reviewed: true,
            reviewer: Some(" operator ".into()),
        })
        .expect("reviewed file state");

        assert_eq!(state.issue_id.as_deref(), Some("issue-1"));
        assert_eq!(state.file_path, "src/lib.rs");
        assert_eq!(state.old_path.as_deref(), Some("src/old_lib.rs"));
        assert_eq!(state.reviewer.as_deref(), Some("operator"));
    }

    #[test]
    fn fix_prompt_projects_open_thread_comments_only() {
        let run_id = RunId::new();
        let mut open_anchor = anchor(DiffReviewLineSide::New);
        open_anchor.run_id = run_id;
        open_anchor.new_line = Some(12);
        open_anchor.new_line_end = Some(15);
        let mut resolved_anchor = anchor(DiffReviewLineSide::Old);
        resolved_anchor.run_id = run_id;
        resolved_anchor.file_path = "src/other.rs".into();
        resolved_anchor.old_line = Some(6);
        let open = DiffReviewThread::new(NewDiffReviewThread {
            anchor: open_anchor,
            author: Some("operator".into()),
            body: "Fix this branch.".into(),
        })
        .expect("open thread");
        let mut resolved = DiffReviewThread::new(NewDiffReviewThread {
            anchor: resolved_anchor,
            author: Some("operator".into()),
            body: "Already handled.".into(),
        })
        .expect("resolved thread");
        resolved.state = DiffReviewThreadState::Resolved;

        let state = DiffReviewState::new(run_id, vec![open, resolved], Vec::new());
        let comments = unresolved_diff_review_fix_prompt_comments(&state);
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].body, "Fix this branch.");

        let prompt = render_diff_review_fix_prompt(
            "SUP-199",
            run_id,
            Some("superkick/sup-199-run"),
            "abc1234",
            "def5678",
            &comments,
            Some("{\"version\":0}"),
        );
        assert!(prompt.contains("Do not introduce unrelated changes"));
        assert!(prompt.contains("new lines 12-15"));
        assert!(prompt.contains("Fix this branch."));
        assert!(!prompt.contains("Already handled."));
    }
}
