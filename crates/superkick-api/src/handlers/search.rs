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
    SearchCommentRow, SearchFileRow, SearchIssueRow, SearchResponse, SearchRunRow, SearchScope,
    build_actions, comment_snippet, find_ascii_ci,
};
use superkick_integrations::linear::CachedComment;
use superkick_storage::repo::RunRepo;

use crate::AppState;
use crate::error::AppError;
use crate::search_state::FileIndexEntry;

const DEFAULT_LIMIT_PER_SECTION: u32 = 5;
const MAX_LIMIT_PER_SECTION: u32 = 25;
/// Upper bound on runs scanned per search request — the table grows
/// monotonically and this endpoint fires per keystroke.
const RUN_SCAN_LIMIT: u32 = 200;

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
        .list_recent(RUN_SCAN_LIMIT)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_done_state_matches_linear_terminal_states() {
        assert!(is_done_state("completed"));
        assert!(is_done_state("canceled"));
        assert!(!is_done_state("started"));
        assert!(!is_done_state("backlog"));
    }
}
