//! Local agent supervisor — spawns and manages CLI agent processes (claude, codex).
//!
//! Owns the full lifecycle: spawn → stream output → wait/timeout/cancel → record result.
//!
//! The agent is spawned inside a PTY so that TTY-aware CLIs (e.g. `claude --print`)
//! see a real terminal and stream output incrementally instead of buffering.
//! Because a PTY merges stdout and stderr into a single terminal stream, all output
//! is emitted as `EventLevel::Info`. Lifecycle events retain their original levels.

mod lifecycle;
mod output;
mod process;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::Utc;
use tokio_util::sync::CancellationToken;

use superkick_core::{AgentProvider, AgentSession, AgentSessionId, AgentStatus, RunId, StepId};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo};

/// Configuration for launching an agent session.
pub struct AgentLaunchConfig {
    pub run_id: RunId,
    pub step_id: StepId,
    pub provider: AgentProvider,
    /// Full command-line arguments (e.g. `["claude", "--print", "fix the bug"]`).
    pub args: Vec<String>,
    /// Working directory (worktree path).
    pub workdir: PathBuf,
    /// Maximum duration before the process is killed.
    pub timeout: Duration,
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
pub struct AgentSupervisor<S, E> {
    session_repo: Arc<S>,
    event_repo: Arc<E>,
}

impl<S, E> AgentSupervisor<S, E>
where
    S: AgentSessionRepo + 'static,
    E: RunEventRepo + 'static,
{
    pub fn new(session_repo: Arc<S>, event_repo: Arc<E>) -> Self {
        Self {
            session_repo,
            event_repo,
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
        };

        self.session_repo.insert(&session).await?;

        let cancel_token = CancellationToken::new();
        let handle = AgentHandle {
            session_id,
            cancel_token: cancel_token.clone(),
        };

        let session_repo = Arc::clone(&self.session_repo);
        let event_repo = Arc::clone(&self.event_repo);

        let join = tokio::spawn(lifecycle::run_supervised(
            session,
            config.args,
            config.workdir,
            config.timeout,
            cancel_token,
            session_repo,
            event_repo,
        ));

        Ok((handle, join))
    }
}
