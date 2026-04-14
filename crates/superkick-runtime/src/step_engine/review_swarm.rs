use std::sync::Arc;

use anyhow::{Context, Result, bail};
use tokio_util::sync::CancellationToken;
use tracing::warn;

use superkick_core::{EventKind, EventLevel, ReviewFinding, ReviewSwarmResult, RunEvent, RunStep};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, InterruptRepo, InterruptTxRepo, RunEventRepo, RunRepo,
    RunStepRepo, TranscriptRepo,
};

use super::{DEFAULT_AGENT_TIMEOUT, StepEngine};
use crate::agent_supervisor::{AgentHandle, AgentLaunchConfig};

impl<R, ST, E, A, AR, I, T> StepEngine<R, ST, E, A, AR, I, T>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    AR: ArtifactRepo + 'static,
    I: InterruptRepo + InterruptTxRepo + 'static,
    T: TranscriptRepo + 'static,
{
    /// Execute the ReviewSwarm step: launch N review agents in parallel, aggregate findings.
    pub(super) async fn execute_review_swarm(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        agent_names: &[String],
        findings_threshold: u32,
        worktree: &std::path::Path,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
        let max_parallel = self.config.budget.max_parallel_agents as usize;

        self.emit(
            run,
            Some(step.id),
            EventKind::AgentOutput,
            EventLevel::Info,
            format!(
                "review swarm: launching {} agent(s) (max parallel: {})",
                agent_names.len(),
                max_parallel
            ),
        )
        .await;

        let semaphore = Arc::new(tokio::sync::Semaphore::new(max_parallel));
        let mut handles: Vec<(
            String,
            AgentHandle,
            tokio::task::JoinHandle<Result<crate::agent_supervisor::AgentResult>>,
        )> = Vec::new();

        for agent_name in agent_names {
            let resolved = self
                .router()
                .resolve(agent_name)
                .with_context(|| format!("failed to resolve review agent '{agent_name}'"))?;

            let mut args = vec![resolved.program.clone()];
            args.extend(resolved.args.iter().cloned());

            let base_prompt = format!(
                "You are a code reviewer for issue {} (id: {}). \
                 Review the changes on this branch. Look for bugs, logic errors, \
                 security issues, and code quality problems. \
                 If the code looks good, say 'LGTM'. \
                 If there are issues, list them clearly. \
                 IMPORTANT: Do NOT update the issue status in Linear or any external tracker. \
                 Do NOT mark the issue as done, closed, or resolved. Only review code.",
                run.issue_identifier, run.issue_id,
            );
            let review_prompt =
                if let Some(sys) = resolved.system_prompt.as_deref().filter(|s| !s.is_empty()) {
                    format!("--- Role system prompt ---\n{sys}\n\n{base_prompt}")
                } else {
                    base_prompt
                };
            args.push(review_prompt);

            let launch_cfg = AgentLaunchConfig {
                run_id: run.id,
                step_id: step.id,
                provider: resolved.provider,
                args,
                workdir: worktree.to_path_buf(),
                timeout: resolved.timeout.unwrap_or(DEFAULT_AGENT_TIMEOUT),
            };

            let permit = semaphore
                .clone()
                .acquire_owned()
                .await
                .context("review swarm semaphore closed")?;

            let (agent_handle, join) = self
                .supervisor
                .launch(launch_cfg)
                .await
                .with_context(|| format!("failed to launch review agent '{agent_name}'"))?;

            let name = agent_name.clone();
            let gated = tokio::spawn(async move {
                let _permit = permit;
                join.await.context("review agent task panicked")?
            });

            handles.push((name, agent_handle, gated));
        }

        let findings = self
            .collect_review_results(run, step, handles, cancel_token)
            .await;

        if cancel_token.is_cancelled() {
            bail!("review swarm cancelled");
        }

        let total_agents = findings.len();
        let passed_count = findings.iter().filter(|f| f.passed).count();
        let failed_count = total_agents - passed_count;
        let gate_passed = (failed_count as u32) < findings_threshold;

        let swarm_result = ReviewSwarmResult {
            findings,
            total_agents,
            passed_count,
            failed_count,
            gate_passed,
        };

        let payload = serde_json::to_value(&swarm_result).ok();
        {
            let mut updated_step = step.clone();
            updated_step.output_json = payload.clone();
            let _ = self.step_repo.update(&updated_step).await;
        }

        let summary_msg = format!(
            "review swarm complete: {passed_count}/{total_agents} passed, {failed_count} failed — gate {}",
            if gate_passed { "PASSED" } else { "FAILED" }
        );

        let mut event = RunEvent::new(
            run.id,
            Some(step.id),
            EventKind::ReviewCompleted,
            if gate_passed {
                EventLevel::Info
            } else {
                EventLevel::Warn
            },
            summary_msg.clone(),
        );
        event.payload_json = payload.clone();
        if let Err(e) = self.event_repo.insert(&event).await {
            warn!("failed to emit review completed event: {e}");
        }

        if !gate_passed {
            bail!(
                "review gate failed: {failed_count} agent(s) reported findings (threshold: {findings_threshold})"
            );
        }

        Ok(())
    }

    async fn collect_review_results(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        handles: Vec<(
            String,
            AgentHandle,
            tokio::task::JoinHandle<Result<crate::agent_supervisor::AgentResult>>,
        )>,
        cancel_token: &CancellationToken,
    ) -> Vec<ReviewFinding> {
        let mut findings = Vec::with_capacity(handles.len());
        let agent_handles: Vec<AgentHandle> = handles.iter().map(|(_, h, _)| h.clone()).collect();

        // Watch cancellation and propagate to all in-flight agents.
        let watcher_token = cancel_token.clone();
        let watcher = tokio::spawn(async move {
            watcher_token.cancelled().await;
            for h in &agent_handles {
                h.cancel();
            }
        });

        for (agent_name, _agent_handle, handle) in handles {
            let flattened: Result<crate::agent_supervisor::AgentResult> = match handle.await {
                Ok(r) => r,
                Err(e) => Err(anyhow::anyhow!("review agent task panicked: {e}")),
            };

            match flattened {
                Ok(agent_result) => {
                    let passed = agent_result.session.exit_code == Some(0);
                    findings.push(ReviewFinding {
                        agent_name: agent_name.clone(),
                        session_id: agent_result.session.id,
                        passed,
                        exit_code: agent_result.session.exit_code,
                    });

                    self.emit(
                        run,
                        Some(step.id),
                        EventKind::AgentOutput,
                        EventLevel::Info,
                        format!(
                            "review agent '{}' finished (exit {}): {}",
                            agent_name,
                            agent_result.session.exit_code.unwrap_or(-1),
                            if passed {
                                "passed"
                            } else {
                                "findings detected"
                            }
                        ),
                    )
                    .await;
                }
                Err(e) => {
                    findings.push(ReviewFinding {
                        agent_name: agent_name.clone(),
                        session_id: superkick_core::AgentSessionId::new(),
                        passed: false,
                        exit_code: None,
                    });
                    self.emit(
                        run,
                        Some(step.id),
                        EventKind::AgentOutput,
                        EventLevel::Error,
                        format!("review agent '{agent_name}' failed: {e:#}"),
                    )
                    .await;
                }
            }
        }

        watcher.abort();
        let _ = watcher.await;

        findings
    }

    /// Find the review swarm config from the workflow steps.
    pub(super) fn find_review_swarm_config(&self) -> Result<(Vec<String>, u32)> {
        for ws in &self.config.workflow.steps {
            if let superkick_config::WorkflowStep::ReviewSwarm {
                agents,
                findings_threshold,
            } = ws
            {
                return Ok((agents.clone(), *findings_threshold));
            }
        }
        bail!("no ReviewSwarm step found in workflow config")
    }
}
