use anyhow::{bail, ensure};

use crate::model::{SuperkickConfig, WorkflowStep};

/// Validate internal consistency of a parsed config.
pub fn validate(config: &SuperkickConfig) -> anyhow::Result<()> {
    ensure!(config.version == 1, "unsupported config version: {} (expected 1)", config.version);
    ensure!(!config.agents.is_empty(), "at least one agent must be defined");
    ensure!(!config.workflow.steps.is_empty(), "workflow must have at least one step");

    for (i, step) in config.workflow.steps.iter().enumerate() {
        validate_step(config, step, i)?;
    }

    Ok(())
}

fn validate_step(config: &SuperkickConfig, step: &WorkflowStep, index: usize) -> anyhow::Result<()> {
    match step {
        WorkflowStep::Plan { agent } | WorkflowStep::Code { agent } => {
            if !config.agents.contains_key(agent) {
                bail!(
                    "workflow step {index}: agent \"{agent}\" is not defined in the agents section"
                );
            }
        }
        WorkflowStep::Commands { run } => {
            if run.is_empty() {
                bail!("workflow step {index}: commands step must have at least one command in `run`");
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
            }
        }
        WorkflowStep::Pr { .. } => {}
    }
    Ok(())
}
