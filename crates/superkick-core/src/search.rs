//! Search domain types and snippet windowing for the global command bar.
//!
//! The contract is consumed by `superkick-api`'s `/search` handler and the
//! React `CommandBar`. Per-type rows are flat (no nested optionals) so the
//! frontend can render them directly without further normalisation.
//!
//! Snippet windowing lives here so the HTTP layer can compute the comment
//! body window server-side once, instead of shipping full bodies to the UI.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::run::RunState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchScope {
    All,
    Issues,
    Comments,
    Files,
    Runs,
    Actions,
}

impl SearchScope {
    #[must_use]
    pub fn includes(self, other: Self) -> bool {
        matches!(self, Self::All) || self == other
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub issues: Vec<SearchIssueRow>,
    pub comments: Vec<SearchCommentRow>,
    pub files: Vec<SearchFileRow>,
    pub runs: Vec<SearchRunRow>,
    pub actions: Vec<SearchActionRow>,
    pub total: u32,
}

impl SearchResponse {
    #[must_use]
    pub fn empty() -> Self {
        Self {
            issues: Vec::new(),
            comments: Vec::new(),
            files: Vec::new(),
            runs: Vec::new(),
            actions: Vec::new(),
            total: 0,
        }
    }

    pub fn recompute_total(&mut self) {
        let total = self.issues.len()
            + self.comments.len()
            + self.files.len()
            + self.runs.len()
            + self.actions.len();
        self.total = u32::try_from(total).unwrap_or(u32::MAX);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchIssueRow {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub state_type: String,
    pub priority_value: u8,
    pub project: Option<String>,
    pub assignee_name: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCommentRow {
    pub comment_id: String,
    pub issue_id: String,
    pub issue_identifier: String,
    pub author_name: Option<String>,
    pub created_at: DateTime<Utc>,
    /// ±40 char window around the match. Caller wraps the matched range in
    /// `<mark>` client-side using `match_start` / `match_end` (byte indices
    /// into `snippet`).
    pub snippet: String,
    pub match_start: u32,
    pub match_end: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFileRow {
    pub path: String,
    pub repo: String,
    pub modified_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRunRow {
    pub run_id: String,
    pub issue_identifier: Option<String>,
    pub repo_slug: String,
    pub state: RunState,
    pub current_step: Option<String>,
    pub agent_name: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SearchActionKind {
    LaunchTask,
    NewIssue,
    SwitchView,
    SwitchRepo,
    OpenInbox,
    JumpToIssues,
    JumpToTasks,
    JumpToRuns,
    JumpToAgents,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchActionRow {
    pub id: String,
    pub kind: SearchActionKind,
    pub label: String,
    pub hint: Option<String>,
    pub target: Option<String>,
    pub kbd_hints: Vec<String>,
}

/// Width of the snippet window on each side of the match.
pub const SNIPPET_RADIUS: usize = 40;

/// Compute a snippet centred on `match_range` inside `body`.
///
/// Returns the snippet plus the byte offsets of the match inside the snippet.
/// Always lands on a UTF-8 char boundary by snapping outward to the nearest
/// boundary. Inserts a leading "…" when the snippet starts mid-text and a
/// trailing "…" when it ends mid-text. The match offsets are adjusted for any
/// inserted ellipsis prefix.
#[must_use]
pub fn comment_snippet(body: &str, match_range: std::ops::Range<usize>) -> Snippet {
    let len = body.len();
    let match_start = match_range.start.min(len);
    let match_end = match_range.end.min(len);

    let raw_start = match_start.saturating_sub(SNIPPET_RADIUS);
    let raw_end = (match_end + SNIPPET_RADIUS).min(len);

    let window_start = floor_char_boundary(body, raw_start);
    let window_end = ceil_char_boundary(body, raw_end);

    let mut text = String::new();
    let mut adjusted_match_start = match_start - window_start;
    if window_start > 0 {
        text.push('…');
        adjusted_match_start += '…'.len_utf8();
    }
    text.push_str(&body[window_start..window_end]);
    if window_end < len {
        text.push('…');
    }

    let adjusted_match_end = adjusted_match_start + (match_end - match_start);

    Snippet {
        text,
        match_start: adjusted_match_start,
        match_end: adjusted_match_end,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snippet {
    pub text: String,
    pub match_start: usize,
    pub match_end: usize,
}

fn floor_char_boundary(s: &str, mut idx: usize) -> usize {
    while idx > 0 && !s.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

fn ceil_char_boundary(s: &str, mut idx: usize) -> usize {
    let len = s.len();
    while idx < len && !s.is_char_boundary(idx) {
        idx += 1;
    }
    idx
}

/// Find the first case-insensitive byte range of `needle` in `haystack`.
/// Returns `None` when `needle` is empty or absent. Operates on ASCII-folded
/// codepoints, which is good enough for V1 comment search.
#[must_use]
pub fn find_ascii_ci(haystack: &str, needle: &str) -> Option<std::ops::Range<usize>> {
    if needle.is_empty() {
        return None;
    }
    let h_lower = haystack.to_ascii_lowercase();
    let n_lower = needle.to_ascii_lowercase();
    h_lower
        .find(&n_lower)
        .map(|start| start..start + n_lower.len())
}

/// The hardcoded command-bar action registry, filtered by `query`. Always
/// non-empty so the typing state is never blank; the launch-task action is
/// only offered when there is a query to prefill.
pub fn build_actions(query: &str) -> Vec<SearchActionRow> {
    let mut actions: Vec<SearchActionRow> = Vec::new();
    let q = query.trim();

    if !q.is_empty() {
        actions.push(SearchActionRow {
            id: format!("launch-task:{q}"),
            kind: SearchActionKind::LaunchTask,
            label: format!("Launch task on \"{q}\"…"),
            hint: Some("opens composer pre-filled".to_string()),
            target: Some(format!("/tasks/new?prefill={}", urlencode(q))),
            kbd_hints: vec!["⌘".to_string(), "↵".to_string()],
        });
    }

    actions.push(SearchActionRow {
        id: "new-issue".to_string(),
        kind: SearchActionKind::NewIssue,
        label: "New issue…".to_string(),
        hint: Some("in current repo".to_string()),
        target: Some("/issues/new".to_string()),
        kbd_hints: vec!["c".to_string()],
    });
    actions.push(SearchActionRow {
        id: "switch-view".to_string(),
        kind: SearchActionKind::SwitchView,
        label: "Switch view…".to_string(),
        hint: Some("My open work · All open · Recently shipped".to_string()),
        target: None,
        kbd_hints: Vec::new(),
    });
    actions.push(SearchActionRow {
        id: "switch-repo".to_string(),
        kind: SearchActionKind::SwitchRepo,
        label: "Switch repo…".to_string(),
        hint: None,
        target: None,
        kbd_hints: vec!["⌘".to_string(), "R".to_string()],
    });
    actions.push(SearchActionRow {
        id: "open-inbox".to_string(),
        kind: SearchActionKind::OpenInbox,
        label: "Open inbox".to_string(),
        hint: None,
        target: Some("/".to_string()),
        kbd_hints: Vec::new(),
    });

    if !q.is_empty() {
        let q_lower = q.to_ascii_lowercase();
        actions.retain(|a| {
            matches!(a.kind, SearchActionKind::LaunchTask)
                || a.label.to_ascii_lowercase().contains(&q_lower)
                || a.hint
                    .as_deref()
                    .map(|h| h.to_ascii_lowercase().contains(&q_lower))
                    .unwrap_or(false)
        });
    }

    actions
}

fn urlencode(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
                c.to_string()
            } else {
                let mut buf = [0u8; 4];
                let bytes = c.encode_utf8(&mut buf).as_bytes().to_vec();
                bytes
                    .into_iter()
                    .map(|b| format!("%{b:02X}"))
                    .collect::<String>()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_all_includes_everything() {
        assert!(SearchScope::All.includes(SearchScope::Issues));
        assert!(SearchScope::All.includes(SearchScope::Files));
    }

    #[test]
    fn scope_specific_includes_only_itself() {
        assert!(SearchScope::Issues.includes(SearchScope::Issues));
        assert!(!SearchScope::Issues.includes(SearchScope::Files));
    }

    #[test]
    fn response_recomputes_total() {
        let mut r = SearchResponse::empty();
        r.issues.push(sample_issue());
        r.actions.push(sample_action());
        r.recompute_total();
        assert_eq!(r.total, 2);
    }

    #[test]
    fn snippet_centres_on_match() {
        let body = "0123456789".repeat(20); // 200 chars
        let s = comment_snippet(&body, 95..100);
        assert!(s.text.starts_with('…'));
        assert!(s.text.ends_with('…'));
        let matched = &s.text[s.match_start..s.match_end];
        assert_eq!(matched, "56789");
    }

    #[test]
    fn snippet_at_start_has_no_leading_ellipsis() {
        let body = "hello world this is a comment".to_string();
        let s = comment_snippet(&body, 0..5);
        assert!(!s.text.starts_with('…'));
        assert_eq!(&s.text[s.match_start..s.match_end], "hello");
    }

    #[test]
    fn snippet_at_end_has_no_trailing_ellipsis() {
        let body = "hello world this is a comment".to_string();
        let len = body.len();
        let s = comment_snippet(&body, len - 7..len);
        assert!(!s.text.ends_with('…'));
        assert_eq!(&s.text[s.match_start..s.match_end], "comment");
    }

    #[test]
    fn snippet_short_body_returns_whole_string() {
        let body = "short";
        let s = comment_snippet(body, 0..5);
        assert_eq!(s.text, "short");
        assert_eq!(s.match_start, 0);
        assert_eq!(s.match_end, 5);
    }

    #[test]
    fn snippet_respects_utf8_boundary() {
        // 4-byte emoji 🚀 + ASCII; window must not slice mid-codepoint.
        let body = "🚀🚀🚀 webhook signature check 🚀🚀🚀";
        let needle = "webhook";
        let range = find_ascii_ci(body, needle).expect("needle present");
        let s = comment_snippet(body, range.clone());
        assert!(s.text.is_char_boundary(s.match_start));
        assert!(s.text.is_char_boundary(s.match_end));
        let matched = &s.text[s.match_start..s.match_end];
        assert_eq!(matched.to_ascii_lowercase(), "webhook");
    }

    #[test]
    fn find_ascii_ci_is_case_insensitive() {
        let r = find_ascii_ci("Hello WORLD", "world").expect("found");
        assert_eq!(r, 6..11);
    }

    #[test]
    fn find_ascii_ci_returns_none_for_empty_needle() {
        assert!(find_ascii_ci("anything", "").is_none());
    }

    #[test]
    fn build_actions_includes_launch_task_when_query_present() {
        let actions = build_actions("webhook");
        let launch = actions
            .iter()
            .find(|a| a.kind == SearchActionKind::LaunchTask)
            .unwrap();
        assert!(launch.label.contains("webhook"));
        assert_eq!(launch.kbd_hints, vec!["⌘".to_string(), "↵".to_string()]);
    }

    #[test]
    fn build_actions_omits_launch_task_when_query_empty() {
        let actions = build_actions("");
        assert!(
            actions
                .iter()
                .all(|a| a.kind != SearchActionKind::LaunchTask)
        );
        assert!(actions.iter().any(|a| a.kind == SearchActionKind::NewIssue));
    }

    #[test]
    fn build_actions_filters_to_matching_when_query_present() {
        let actions = build_actions("repo");
        assert!(
            actions
                .iter()
                .any(|a| a.kind == SearchActionKind::SwitchRepo)
        );
        assert!(
            actions
                .iter()
                .all(|a| a.kind != SearchActionKind::OpenInbox)
        );
    }

    #[test]
    fn url_encoding_preserves_safe_chars() {
        assert_eq!(urlencode("hello-world_42.bar~"), "hello-world_42.bar~");
        assert_eq!(urlencode("a b"), "a%20b");
    }

    fn sample_issue() -> SearchIssueRow {
        SearchIssueRow {
            id: "id".into(),
            identifier: "SUP-1".into(),
            title: "t".into(),
            state_type: "started".into(),
            priority_value: 2,
            project: None,
            assignee_name: None,
            updated_at: Utc::now(),
        }
    }

    fn sample_action() -> SearchActionRow {
        SearchActionRow {
            id: "a".into(),
            kind: SearchActionKind::LaunchTask,
            label: "Launch".into(),
            hint: None,
            target: None,
            kbd_hints: Vec::new(),
        }
    }
}
