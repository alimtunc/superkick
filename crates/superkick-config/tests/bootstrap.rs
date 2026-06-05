//! `SuperkickConfig::bootstrap()` is the product-default config used
//! when no `superkick.yaml` is present (fresh-boot-no-yaml contract).

use superkick_config::SuperkickConfig;

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
    assert_eq!(config.workflow.steps.len(), 4);
}
