//! `SuperkickConfig::bootstrap()` is the product-default config used
//! when no `superkick.yaml` is present (fresh-boot-no-yaml contract).

use superkick_config::{SuperkickConfig, WorkflowStep};

#[test]
fn bootstrap_targets_linear_main_and_a_local_runner() {
    let config = SuperkickConfig::bootstrap();
    assert_eq!(config.version, 1);
    assert_eq!(config.runner.base_branch, "main");
}

#[test]
fn bootstrap_agent_catalog_resolves_the_codex_builtins() {
    let config = SuperkickConfig::bootstrap();
    // Empty `agents` falls back to the builtin Codex/Claude catalog.
    let catalog = config.agent_catalog();
    assert!(catalog.get("codex-plan").is_some());
    assert!(catalog.get("codex-implement").is_some());
    assert!(catalog.get("codex-review").is_some());
}

#[test]
fn bootstrap_workflow_is_the_standard_playbook() {
    let config = SuperkickConfig::bootstrap();
    let kinds: Vec<&str> = config
        .workflow
        .steps
        .iter()
        .map(|step| match step {
            WorkflowStep::Plan { .. } => "plan",
            WorkflowStep::Code { .. } => "code",
            WorkflowStep::Commands { .. } => "commands",
            WorkflowStep::ReviewSwarm { .. } => "review_swarm",
            WorkflowStep::Pr { .. } => "pr",
        })
        .collect();
    assert_eq!(kinds, ["plan", "code", "review_swarm", "pr"]);
}

#[test]
fn example_config_parses_and_validates() {
    let path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/superkick.yaml");
    let config = superkick_config::load_file(&path).expect("example config should parse");
    assert_eq!(config.version, 1);
    assert_eq!(config.workflow.steps.len(), 5);
}
