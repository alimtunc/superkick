use std::collections::HashSet;

use anyhow::{bail, ensure};
use superkick_core::AgentProvider;

use crate::builtin_agents::builtin_names;
use crate::model::{SuperkickConfig, WorkflowStep};

/// Validate internal consistency of a parsed config.
pub fn validate(config: &SuperkickConfig) -> anyhow::Result<()> {
    ensure!(
        config.version == 1,
        "unsupported config version: {} (expected 1)",
        config.version
    );
    ensure!(
        !config.workflow.steps.is_empty(),
        "workflow must have at least one step"
    );
    ensure!(
        config.budget.max_parallel_agents >= 1,
        "budget.max_parallel_agents must be at least 1 — 0 would deadlock every review swarm"
    );
    ensure!(
        config.orchestration.max_concurrent_active_runs >= 1,
        "orchestration.max_concurrent_active_runs must be at least 1 — 0 parks every issue at waiting-capacity"
    );

    let known_agents: HashSet<String> = builtin_names()
        .into_iter()
        .chain(config.agents.keys().cloned())
        .collect();

    for (name, def) in &config.agents {
        if let Some(backend) = &def.backend
            && backend.requires_claude()
            && def.provider != AgentProvider::Claude
        {
            bail!(
                "agent \"{name}\": backend `{}` requires provider `claude` but the role declares provider `{}`",
                backend.audit_tag(),
                def.provider
            );
        }
    }

    if let Some(allowed) = &config.launch_profile.allowed_agents {
        for name in allowed {
            if !known_agents.contains(name) {
                bail!(
                    "launch_profile.allowed_agents references \"{name}\" which is not defined in the agents catalog (built-in or custom)"
                );
            }
        }
    }

    let mut seen = HashSet::new();
    for (i, step) in config.workflow.steps.iter().enumerate() {
        validate_step(config, &known_agents, step, i)?;
        let kind = step_kind(step);
        if !seen.insert(kind) {
            bail!(
                "workflow step {i}: step type \"{kind}\" appears more than once; each step type may only appear once in the workflow"
            );
        }
    }

    Ok(())
}

fn step_kind(step: &WorkflowStep) -> &'static str {
    match step {
        WorkflowStep::Plan { .. } => "plan",
        WorkflowStep::Code { .. } => "code",
        WorkflowStep::Commands { .. } => "commands",
        WorkflowStep::ReviewSwarm { .. } => "review_swarm",
        WorkflowStep::Pr { .. } => "pr",
    }
}

/// One agent reference check: the name must exist in the catalog and, when
/// `launch_profile.allowed_agents` is set, be part of that allowlist.
fn assert_agent_ref(
    config: &SuperkickConfig,
    known_agents: &HashSet<String>,
    agent: &str,
    index: usize,
) -> anyhow::Result<()> {
    if !known_agents.contains(agent) {
        bail!(
            "workflow step {index}: agent \"{agent}\" is not defined in the agents section or built-in catalog"
        );
    }
    if let Some(allowed) = &config.launch_profile.allowed_agents
        && !allowed.iter().any(|a| a == agent)
    {
        bail!("workflow step {index}: agent \"{agent}\" is not in launch_profile.allowed_agents");
    }
    Ok(())
}

fn validate_step(
    config: &SuperkickConfig,
    known_agents: &HashSet<String>,
    step: &WorkflowStep,
    index: usize,
) -> anyhow::Result<()> {
    match step {
        WorkflowStep::Plan { agent } | WorkflowStep::Code { agent } => {
            assert_agent_ref(config, known_agents, agent, index)?;
        }
        WorkflowStep::Commands { run } => {
            if run.is_empty() {
                bail!(
                    "workflow step {index}: commands step must have at least one command in `run`"
                );
            }
        }
        WorkflowStep::ReviewSwarm {
            agents,
            findings_threshold,
            ..
        } => {
            if agents.is_empty() {
                bail!("workflow step {index}: review_swarm must have at least one agent");
            }
            ensure!(
                *findings_threshold >= 1,
                "workflow step {index}: review_swarm findings_threshold must be at least 1 — 0 makes the gate fail even with zero findings"
            );
            for agent in agents {
                assert_agent_ref(config, known_agents, agent, index)?;
            }
        }
        WorkflowStep::Pr { .. } => {}
    }
    Ok(())
}
