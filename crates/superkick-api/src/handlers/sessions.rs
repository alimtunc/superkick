use axum::extract::{Path, State};
use axum::response::{IntoResponse, Json};
use serde::Serialize;

use superkick_core::{AgentSessionId, AgentStatus, EventKind, EventLevel, RunEvent, RunId};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo, RunRepo};

use crate::AppState;
use crate::error::AppError;

#[derive(Serialize)]
pub struct AttachResponse {
    attach_kind: String,
    title: String,
    summary: String,
    command: String,
    worktree_path: String,
    limitations: Vec<String>,
}

pub async fn prepare_attach(
    State(state): State<AppState>,
    Path((run_id, session_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(run_id);
    let session_id = AgentSessionId(session_id);

    // 1. Run exists
    let Some(run) = state.run_repo.get(run_id).await? else {
        return Err(AppError::NotFound("run not found"));
    };

    // 2. Session exists
    let Some(session) = state.session_repo.get(session_id).await? else {
        return Err(AppError::NotFound("session not found"));
    };

    // 3. Session belongs to this run
    if session.run_id != run_id {
        return Err(AppError::BadRequest(
            "session does not belong to this run".into(),
        ));
    }

    // 4. Run is not in terminal state
    if run.state.is_terminal() {
        return Err(AppError::BadRequest("run is in terminal state".into()));
    }

    // 5. Session is eligible for attach
    if !matches!(
        session.status,
        AgentStatus::Starting | AgentStatus::Running | AgentStatus::Failed
    ) {
        return Err(AppError::BadRequest(
            "session not eligible for attach".into(),
        ));
    }

    // 6. Worktree path available
    let Some(ref worktree_path) = run.worktree_path else {
        return Err(AppError::BadRequest(
            "no worktree path available for this run".into(),
        ));
    };

    let is_failed = session.status == AgentStatus::Failed;
    let attach_kind = if is_failed {
        "recovery_shell"
    } else {
        "workspace_attach"
    };
    let title = if is_failed {
        "Recovery shell"
    } else {
        "Workspace attach"
    };

    let summary = if is_failed {
        let exit_code = session
            .exit_code
            .map(|c| c.to_string())
            .unwrap_or_else(|| "unknown".into());
        format!(
            "Opens a recovery shell in the worktree for the failed session \
             (exit code {exit_code}). Inspect logs, fix issues, and retry manually."
        )
    } else {
        "Opens an independent shell attached to the worktree of the running session. \
         Useful for inspecting state, running tests, or making manual edits alongside \
         the supervised agent."
            .to_string()
    };

    let status_str = match session.status {
        AgentStatus::Starting => "starting",
        AgentStatus::Running => "running",
        AgentStatus::Completed => "completed",
        AgentStatus::Failed => "failed",
        AgentStatus::Cancelled => "cancelled",
    };

    let command = build_shell_command(
        worktree_path,
        run_id,
        &run.issue_identifier,
        session_id,
        &session.provider.to_string(),
        status_str,
    );

    let limitations = vec![
        "This opens an independent shell adjacent to the supervised session, not the session itself.".into(),
        "The original agent process is not affected and continues running under Superkick supervision.".into(),
        "Changes made in this shell are not tracked by Superkick.".into(),
    ];

    // Event trace
    let event = RunEvent::new(
        run_id,
        None,
        EventKind::ExternalAttach,
        EventLevel::Info,
        format!("External attach prepared for session {session_id} ({attach_kind})"),
    );
    state.event_repo.insert(&event).await?;

    Ok(Json(AttachResponse {
        attach_kind: attach_kind.into(),
        title: title.into(),
        summary,
        command,
        worktree_path: worktree_path.clone(),
        limitations,
    }))
}

/// Escape a value for inclusion in a single-quoted shell string.
fn shell_escape(value: &str) -> String {
    value.replace('\'', "'\\''")
}

fn build_shell_command(
    worktree_path: &str,
    run_id: RunId,
    issue_identifier: &str,
    session_id: AgentSessionId,
    provider: &str,
    session_status: &str,
) -> String {
    format!(
        "cd '{wt}' && \
         export SUPERKICK_RUN_ID='{run_id}' && \
         export SUPERKICK_ISSUE_IDENTIFIER='{issue}' && \
         export SUPERKICK_SESSION_ID='{session_id}' && \
         export SUPERKICK_PROVIDER='{provider}' && \
         export SUPERKICK_SESSION_STATUS='{status}' && \
         export SUPERKICK_WORKTREE='{wt}' && \
         exec $SHELL",
        wt = shell_escape(worktree_path),
        run_id = shell_escape(&run_id.0.to_string()),
        issue = shell_escape(issue_identifier),
        session_id = shell_escape(&session_id.0.to_string()),
        provider = shell_escape(provider),
        status = shell_escape(session_status),
    )
}
