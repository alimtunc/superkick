//! Global command-bar search (SUP-158).
//!
//! Fan-out endpoint that returns sectioned results in one HTTP round trip.
//! Comments + files are matched against in-memory caches; issues hit Linear
//! synchronously; runs hit local SQLite. The hardcoded action registry is
//! always included so the typing state is never blank.

use axum::extract::{Query, State};
use axum::response::{IntoResponse, Json};
use serde::Deserialize;
use superkick_core::search::{
    SearchActionKind, SearchActionRow, SearchCommentRow, SearchFileRow, SearchIssueRow,
    SearchResponse, SearchRunRow, SearchScope, comment_snippet, find_ascii_ci,
};
use superkick_integrations::linear::CachedComment;
use superkick_storage::repo::RunRepo;

use crate::AppState;
use crate::error::AppError;
use crate::search_state::FileIndexEntry;

const DEFAULT_LIMIT_PER_SECTION: u32 = 5;
const MAX_LIMIT_PER_SECTION: u32 = 25;

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    #[serde(default)]
    pub q: String,
    #[serde(default)]
    pub scope: Option<SearchScope>,
    #[serde(default, alias = "includeDone")]
    pub include_done: Option<bool>,
    #[serde(default, alias = "limit")]
    pub limit_per_section: Option<u32>,
}

pub async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<impl IntoResponse, AppError> {
    let query = params.q.trim().to_string();
    let scope = params.scope.unwrap_or(SearchScope::All);
    let include_done = params.include_done.unwrap_or(false);
    let limit = params
        .limit_per_section
        .unwrap_or(DEFAULT_LIMIT_PER_SECTION)
        .clamp(1, MAX_LIMIT_PER_SECTION);

    let mut response = SearchResponse::empty();

    if scope.includes(SearchScope::Actions) {
        response.actions = build_actions(&query);
    }

    if scope.includes(SearchScope::Issues) && !query.is_empty() {
        response.issues = search_issues_section(&state, &query, limit, include_done).await;
    }

    if scope.includes(SearchScope::Comments) && !query.is_empty() {
        response.comments = search_comments_section(&state, &query, limit).await;
    }

    if scope.includes(SearchScope::Files) && !query.is_empty() {
        response.files = search_files_section(&state, &query, limit).await;
    }

    if scope.includes(SearchScope::Runs) {
        response.runs = search_runs_section(&state, &query, limit, include_done).await?;
    }

    response.recompute_total();
    Ok(Json(response))
}

pub async fn refresh_files(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let count = state
        .file_index
        .refresh()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("file index refresh failed: {e}")))?;
    Ok(Json(serde_json::json!({ "indexed": count })))
}

async fn search_issues_section(
    state: &AppState,
    query: &str,
    limit: u32,
    include_done: bool,
) -> Vec<SearchIssueRow> {
    let Some(client) = state.linear_client.as_ref() else {
        return Vec::new();
    };
    let limit_with_buffer = if include_done { limit } else { limit * 2 };
    let response = match client.search_issues(query, limit_with_buffer).await {
        Ok(r) => r,
        Err(err) => {
            tracing::warn!(error = %err, "issue search failed");
            return Vec::new();
        }
    };
    response
        .issues
        .into_iter()
        .filter(|i| include_done || !is_done_state(&i.status.state_type))
        .take(limit as usize)
        .map(|i| SearchIssueRow {
            id: i.id,
            identifier: i.identifier,
            title: i.title,
            state_type: i.status.state_type,
            priority_value: i.priority.value,
            project: i.project.map(|p| p.name),
            assignee_name: i.assignee.map(|a| a.name),
            updated_at: i.updated_at,
        })
        .collect()
}

async fn search_comments_section(
    state: &AppState,
    query: &str,
    limit: u32,
) -> Vec<SearchCommentRow> {
    let snapshot = state.comment_cache.snapshot().await;
    snapshot
        .comments
        .into_iter()
        .filter_map(|c| build_comment_row(c, query))
        .take(limit as usize)
        .collect()
}

fn build_comment_row(comment: CachedComment, query: &str) -> Option<SearchCommentRow> {
    let range = find_ascii_ci(&comment.body, query)?;
    let snippet = comment_snippet(&comment.body, range);
    Some(SearchCommentRow {
        comment_id: comment.id,
        issue_id: comment.issue_id,
        issue_identifier: comment.issue_identifier,
        author_name: comment.author_name,
        created_at: comment.created_at,
        snippet: snippet.text,
        match_start: u32::try_from(snippet.match_start).unwrap_or(0),
        match_end: u32::try_from(snippet.match_end).unwrap_or(0),
    })
}

async fn search_files_section(state: &AppState, query: &str, limit: u32) -> Vec<SearchFileRow> {
    let snapshot = state.file_index.snapshot().await;
    let q_lower = query.to_ascii_lowercase();
    snapshot
        .entries
        .into_iter()
        .filter(|e| e.path.to_ascii_lowercase().contains(&q_lower))
        .take(limit as usize)
        .map(file_index_entry_to_row)
        .collect()
}

fn file_index_entry_to_row(entry: FileIndexEntry) -> SearchFileRow {
    SearchFileRow {
        path: entry.path,
        repo: entry.repo,
        modified_at: entry.modified_at,
    }
}

async fn search_runs_section(
    state: &AppState,
    query: &str,
    limit: u32,
    include_done: bool,
) -> Result<Vec<SearchRunRow>, AppError> {
    let runs = state
        .run_repo
        .list_all()
        .await
        .map_err(AppError::Internal)?;
    let q_lower = query.to_ascii_lowercase();
    let matches = runs
        .into_iter()
        .filter(|r| include_done || !r.state.is_terminal())
        .filter(|r| {
            if query.is_empty() {
                return true;
            }
            let hay = format!(
                "{} {} {} {}",
                r.id,
                r.issue_identifier,
                r.repo_slug,
                r.current_step_key
                    .map(|k| k.to_string())
                    .unwrap_or_default()
            )
            .to_ascii_lowercase();
            hay.contains(&q_lower)
        })
        .take(limit as usize)
        .map(|r| SearchRunRow {
            run_id: r.id.to_string(),
            issue_identifier: Some(r.issue_identifier),
            repo_slug: r.repo_slug,
            state: r.state,
            current_step: r.current_step_key.map(|k| k.to_string()),
            agent_name: None,
            created_at: r.started_at,
        })
        .collect();
    Ok(matches)
}

fn is_done_state(state_type: &str) -> bool {
    matches!(state_type, "completed" | "canceled")
}

fn build_actions(query: &str) -> Vec<SearchActionRow> {
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
    fn build_actions_includes_launch_task_when_query_present() {
        let actions = build_actions("webhook");
        assert!(
            actions
                .iter()
                .any(|a| a.kind == SearchActionKind::LaunchTask)
        );
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
                .any(|a| a.kind == SearchActionKind::LaunchTask)
        );
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

    #[test]
    fn is_done_state_matches_linear_terminal_states() {
        assert!(is_done_state("completed"));
        assert!(is_done_state("canceled"));
        assert!(!is_done_state("started"));
        assert!(!is_done_state("backlog"));
    }
}
