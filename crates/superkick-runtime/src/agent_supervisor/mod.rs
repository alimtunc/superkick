//! Local agent supervisor — spawns and manages CLI agent processes (claude, codex).
//!
//! Owns the full lifecycle: spawn → stream output → wait/timeout/cancel → record result.
//!
//! The agent is spawned inside a PTY so that TTY-aware CLIs see a real terminal
//! and stream output incrementally. Claude runs in interactive mode (no `--print`)
//! with the initial prompt supplied as the positional `prompt` argument, so the
//! browser-attached terminal mirrors a live Claude Code session.
//! Because a PTY merges stdout and stderr into a single terminal stream, all output
//! is emitted as `EventLevel::Info`. Lifecycle events retain their original levels.

mod lifecycle;
pub(crate) mod output;
mod process;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::Utc;
use tokio_util::sync::CancellationToken;

use superkick_core::{
    AgentProvider, AgentSession, AgentSessionId, AgentStatus, LinearContextMode, RunId, StepId,
};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo, TranscriptRepo};

use crate::pty_session::PtySessionRegistry;

/// Configuration for launching an agent session.
pub struct AgentLaunchConfig {
    pub run_id: RunId,
    pub step_id: StepId,
    pub provider: AgentProvider,
    /// Full command-line arguments (e.g. `["claude", "--dangerously-skip-permissions", "fix the bug"]`).
    pub args: Vec<String>,
    /// Working directory (worktree path).
    pub workdir: PathBuf,
    /// Maximum duration before the process is killed.
    pub timeout: Duration,
    /// How Linear context was delivered to this spawn. Recorded on the
    /// `AgentSession` so the run log makes the decision inspectable.
    pub linear_context_mode: LinearContextMode,
}

/// Result of a completed agent session.
#[derive(Debug)]
pub struct AgentResult {
    pub session: AgentSession,
}

/// Handle to a running agent session, used for cancellation.
#[derive(Clone)]
pub struct AgentHandle {
    session_id: AgentSessionId,
    cancel_token: CancellationToken,
}

impl AgentHandle {
    pub fn session_id(&self) -> AgentSessionId {
        self.session_id
    }

    /// Request cancellation of the running agent.
    pub fn cancel(&self) {
        self.cancel_token.cancel();
    }
}

/// Process supervisor for local CLI agents.
pub struct AgentSupervisor<S, E, T> {
    session_repo: Arc<S>,
    event_repo: Arc<E>,
    transcript_repo: Arc<T>,
    registry: Arc<PtySessionRegistry>,
}

impl<S, E, T> AgentSupervisor<S, E, T>
where
    S: AgentSessionRepo + 'static,
    E: RunEventRepo + 'static,
    T: TranscriptRepo + 'static,
{
    pub fn new(
        session_repo: Arc<S>,
        event_repo: Arc<E>,
        transcript_repo: Arc<T>,
        registry: Arc<PtySessionRegistry>,
    ) -> Self {
        Self {
            session_repo,
            event_repo,
            transcript_repo,
            registry,
        }
    }

    /// Launch an agent process and supervise it to completion.
    ///
    /// Returns an `AgentHandle` for cancellation and a `JoinHandle` for the result.
    pub async fn launch(
        &self,
        config: AgentLaunchConfig,
    ) -> Result<(AgentHandle, tokio::task::JoinHandle<Result<AgentResult>>)> {
        let session_id = AgentSessionId::new();
        let command_str = config.args.join(" ");

        let session = AgentSession {
            id: session_id,
            run_id: config.run_id,
            run_step_id: config.step_id,
            provider: config.provider,
            command: command_str,
            pid: None,
            status: AgentStatus::Starting,
            started_at: Utc::now(),
            finished_at: None,
            exit_code: None,
            linear_context_mode: Some(config.linear_context_mode),
        };

        self.session_repo.insert(&session).await?;

        let cancel_token = CancellationToken::new();
        let handle = AgentHandle {
            session_id,
            cancel_token: cancel_token.clone(),
        };

        let session_repo = Arc::clone(&self.session_repo);
        let event_repo = Arc::clone(&self.event_repo);
        let transcript_repo = Arc::clone(&self.transcript_repo);
        let registry = Arc::clone(&self.registry);

        let deps = lifecycle::SupervisedDeps {
            session_repo,
            event_repo,
            transcript_repo,
            registry,
        };

        let join = tokio::spawn(lifecycle::run_supervised(
            session,
            config.args,
            config.workdir,
            config.timeout,
            cancel_token,
            deps,
        ));

        Ok((handle, join))
    }
}
