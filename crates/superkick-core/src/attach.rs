use std::fmt;

use serde::Serialize;

use crate::agent::{AgentSession, AgentStatus};
use crate::error::CoreError;
use crate::event::{EventKind, EventLevel, RunEvent};
use crate::run::Run;

/// What kind of attach operation is being prepared.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AttachKind {
    RecoveryShell,
    WorkspaceAttach,
}

impl fmt::Display for AttachKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RecoveryShell => write!(f, "recovery_shell"),
            Self::WorkspaceAttach => write!(f, "workspace_attach"),
        }
    }
}

/// Everything the caller needs to open an external shell in a run's worktree.
#[derive(Debug, Clone, Serialize)]
pub struct AttachPayload {
    pub attach_kind: AttachKind,
    pub title: String,
    pub summary: String,
    pub command: String,
    pub worktree_path: String,
    pub limitations: Vec<String>,
    #[serde(skip)]
    pub event: RunEvent,
}

/// Validate preconditions and build the attach payload.
pub fn prepare_attach(run: &Run, session: &AgentSession) -> Result<AttachPayload, CoreError> {
    // Session belongs to this run
    if session.run_id != run.id {
        return Err(CoreError::InvalidInput(
            "session does not belong to this run".into(),
        ));
    }

    // Run is not in terminal state
    if run.state.is_terminal() {
        return Err(CoreError::InvalidInput("run is in terminal state".into()));
    }

    // Session is eligible for attach
    if !matches!(
        session.status,
        AgentStatus::Starting | AgentStatus::Running | AgentStatus::Failed
    ) {
        return Err(CoreError::InvalidInput(
            "session not eligible for attach".into(),
        ));
    }

    // Worktree path available
    let Some(ref worktree_path) = run.worktree_path else {
        return Err(CoreError::InvalidInput(
            "no worktree path available for this run".into(),
        ));
    };

    let is_failed = session.status == AgentStatus::Failed;

    let attach_kind = if is_failed {
        AttachKind::RecoveryShell
    } else {
        AttachKind::WorkspaceAttach
    };

    let title = if is_failed {
        "Recovery shell".to_string()
    } else {
        "Workspace attach".to_string()
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
        AgentStatus::Failed => "failed",
        _ => unreachable!("filtered by eligibility check above"),
    };

    let command = build_shell_command(
        worktree_path,
        &run.id.0.to_string(),
        &run.issue_identifier,
        &session.id.0.to_string(),
        &session.provider.to_string(),
        status_str,
    );

    let limitations = vec![
        "This opens an independent shell adjacent to the supervised session, not the session itself.".into(),
        "The original agent process is not affected and continues running under Superkick supervision.".into(),
        "Changes made in this shell are not tracked by Superkick.".into(),
    ];

    let event = RunEvent::new(
        run.id,
        None,
        EventKind::ExternalAttach,
        EventLevel::Info,
        format!(
            "External attach prepared for session {} ({attach_kind})",
            session.id
        ),
    );

    Ok(AttachPayload {
        attach_kind,
        title,
        summary,
        command,
        worktree_path: worktree_path.clone(),
        limitations,
        event,
    })
}

/// Escape a value for inclusion in a single-quoted shell string.
fn shell_escape(value: &str) -> String {
    value.replace('\'', "'\\''")
}

fn build_shell_command(
    worktree_path: &str,
    run_id: &str,
    issue_identifier: &str,
    session_id: &str,
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
        run_id = shell_escape(run_id),
        issue = shell_escape(issue_identifier),
        session_id = shell_escape(session_id),
        provider = shell_escape(provider),
        status = shell_escape(session_status),
    )
}
