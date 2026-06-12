use std::sync::Arc;

use anyhow::{Context, Result, bail};
use tokio_util::sync::CancellationToken;
use tracing::warn;

use superkick_core::{
    EventKind, EventLevel, LaunchReason, ReviewFinding, ReviewSwarmResult, RunEvent, RunStep,
};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, AttentionRequestRepo, InterruptRepo, InterruptTxRepo,
    RunEventRepo, RunRepo, RunStepRepo, TranscriptRepo,
};

use super::prompts::{PromptStepKind, step_body_for};
use super::{DEFAULT_AGENT_TIMEOUT, StepEngine, build_full_prompt};
use crate::agent_spawn::{LaunchConfigInputs, build_launch_config, resolve_spawn_plan};
use crate::agent_supervisor::AgentHandle;

impl<R, ST, E, A, AR, I, AT, T> StepEngine<R, ST, E, A, AR, I, AT, T>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    AR: ArtifactRepo + 'static,
    I: InterruptRepo + InterruptTxRepo + 'static,
    AT: AttentionRequestRepo + 'static,
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

            let spawn_plan = resolve_spawn_plan(
                run,
                &resolved,
                worktree,
                step.id,
                &*self.event_repo,
                self.mcp_registry(),
                &self.linear_client,
            )
            .await?;

            let base_prompt = format!(
                "You are working on issue {} (id: {}). {}",
                run.issue_identifier,
                run.issue_id,
                step_body_for(PromptStepKind::Review),
            );
            // Route through the shared prompt builder so reviewers see the same
            // section ordering/headers as Plan/Code agents. Reviewers don't get
            // operator instructions or handoff blocks by design.
            let review_prompt = build_full_prompt(
                &base_prompt,
                None,
                None,
                None,
                resolved.system_prompt.as_deref(),
                spawn_plan.snapshot_block.as_deref(),
            );

            let launch_cfg = build_launch_config(
                &spawn_plan,
                LaunchConfigInputs {
                    run_id: run.id,
                    step_id: step.id,
                    resolved: &resolved,
                    prompt: review_prompt,
                    workdir: worktree.to_path_buf(),
                    default_timeout: DEFAULT_AGENT_TIMEOUT,
                    purpose: format!(
                        "review agent '{}' for issue {}",
                        agent_name, run.issue_identifier
                    ),
                    launch_reason: LaunchReason::ReviewFanout,
                    reasoning: None,
                },
            );

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
            self.step_repo
                .update(&updated_step)
                .await
                .context("failed to persist review swarm step output")?;
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
    pub(super) fn find_review_swarm_config(
        &self,
        run: &superkick_core::Run,
    ) -> Result<(Vec<String>, u32)> {
        let workflow = self.config.workflow.steps.iter().find_map(|ws| match ws {
            superkick_config::WorkflowStep::ReviewSwarm {
                agents,
                findings_threshold,
            } => Some((agents.clone(), *findings_threshold)),
            _ => None,
        });
        // A run-level reviewer override collapses the swarm to that single
        // reviewer, keeping the workflow's findings threshold (default 1).
        if let Some(reviewer) = run.agent_overrides.reviewer.as_deref() {
            let threshold = workflow.map_or(1, |(_, t)| t);
            return Ok((vec![reviewer.to_string()], threshold));
        }
        match workflow {
            Some(cfg) => Ok(cfg),
            None => bail!("no ReviewSwarm step found in workflow config"),
        }
    }
}
