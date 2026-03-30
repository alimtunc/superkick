use std::sync::Arc;

use anyhow::{Context, Result, bail};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;
use tracing::info;

use superkick_core::{EventKind, EventLevel, RunStep};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, InterruptRepo, RunEventRepo, RunRepo, RunStepRepo,
};

use super::{StepEngine, emit_event, kill_child};

impl<R, ST, E, A, AR, I> StepEngine<R, ST, E, A, AR, I>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    AR: ArtifactRepo + 'static,
    I: InterruptRepo + 'static,
{
    /// Execute the Commands step: run each command as a subprocess in the worktree.
    pub(super) async fn execute_commands(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        commands: &[String],
        worktree: &std::path::Path,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
        for cmd_str in commands {
            if cancel_token.is_cancelled() {
                bail!("run cancelled before command: {cmd_str}");
            }
            info!(run_id = %run.id, command = %cmd_str, "running command");

            self.emit(
                run,
                Some(step.id),
                EventKind::CommandOutput,
                EventLevel::Info,
                format!("$ {cmd_str}"),
            )
            .await;

            let mut child = Command::new("sh")
                .args(["-c", cmd_str])
                .current_dir(worktree)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .with_context(|| format!("failed to spawn command: {cmd_str}"))?;

            let stdout = child.stdout.take();
            let event_repo = Arc::clone(&self.event_repo);
            let run_id = run.id;
            let step_id = step.id;
            let stdout_task = tokio::spawn(async move {
                if let Some(out) = stdout {
                    let mut lines = BufReader::new(out).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        emit_event(
                            &*event_repo,
                            run_id,
                            Some(step_id),
                            EventKind::CommandOutput,
                            EventLevel::Info,
                            line,
                        )
                        .await;
                    }
                }
            });

            let stderr = child.stderr.take();
            let event_repo = Arc::clone(&self.event_repo);
            let stderr_task = tokio::spawn(async move {
                if let Some(err) = stderr {
                    let mut lines = BufReader::new(err).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        emit_event(
                            &*event_repo,
                            run_id,
                            Some(step_id),
                            EventKind::CommandOutput,
                            EventLevel::Warn,
                            line,
                        )
                        .await;
                    }
                }
            });

            let status = tokio::select! {
                status = child.wait() => {
                    status.with_context(|| format!("failed to wait on command: {cmd_str}"))?
                }
                _ = cancel_token.cancelled() => {
                    kill_child(&mut child).await;
                    let _ = tokio::join!(stdout_task, stderr_task);
                    bail!("run cancelled during command execution");
                }
            };

            let _ = tokio::join!(stdout_task, stderr_task);

            if !status.success() {
                bail!(
                    "command `{cmd_str}` failed with exit code {}",
                    status.code().unwrap_or(-1)
                );
            }
        }

        Ok(())
    }
}
