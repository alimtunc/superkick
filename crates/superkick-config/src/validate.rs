use anyhow::{bail, ensure};

use crate::model::{SuperkickConfig, WorkflowStep};

/// Validate internal consistency of a parsed config.
pub fn validate(config: &SuperkickConfig) -> anyhow::Result<()> {
    ensure!(
        config.version == 1,
        "unsupported config version: {} (expected 1)",
        config.version
    );
    ensure!(
        !config.agents.is_empty(),
        "at least one agent must be defined"
    );
    ensure!(
        !config.workflow.steps.is_empty(),
        "workflow must have at least one step"
    );

    if let Some(allowed) = &config.launch_profile.allowed_agents {
        for name in allowed {
            if !config.agents.contains_key(name) {
                bail!(
                    "launch_profile.allowed_agents references \"{name}\" which is not defined in the agents catalog"
                );
            }
        }
    }

    let mut seen = std::collections::HashSet::new();
    for (i, step) in config.workflow.steps.iter().enumerate() {
        validate_step(config, step, i)?;
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

fn assert_role_allowed(config: &SuperkickConfig, agent: &str, index: usize) -> anyhow::Result<()> {
    if let Some(allowed) = &config.launch_profile.allowed_agents
        && !allowed.iter().any(|a| a == agent)
    {
        bail!("workflow step {index}: agent \"{agent}\" is not in launch_profile.allowed_agents");
    }
    Ok(())
}

fn validate_step(
    config: &SuperkickConfig,
    step: &WorkflowStep,
    index: usize,
) -> anyhow::Result<()> {
    match step {
        WorkflowStep::Plan { agent } | WorkflowStep::Code { agent } => {
            if !config.agents.contains_key(agent) {
                bail!(
                    "workflow step {index}: agent \"{agent}\" is not defined in the agents section"
                );
            }
            assert_role_allowed(config, agent, index)?;
        }
        WorkflowStep::Commands { run } => {
            if run.is_empty() {
                bail!(
                    "workflow step {index}: commands step must have at least one command in `run`"
                );
            }
        }
        WorkflowStep::ReviewSwarm { agents, .. } => {
            if agents.is_empty() {
                bail!("workflow step {index}: review_swarm must have at least one agent");
            }
            for agent in agents {
                if !config.agents.contains_key(agent) {
                    bail!(
                        "workflow step {index}: agent \"{agent}\" is not defined in the agents section"
                    );
                }
                assert_role_allowed(config, agent, index)?;
            }
        }
        WorkflowStep::Pr { .. } => {}
    }
    Ok(())
}
