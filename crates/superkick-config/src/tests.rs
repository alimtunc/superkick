use indoc::indoc;

use crate::{load_str, model::*};
use superkick_core::AgentProvider;

const FULL_YAML: &str = indoc! {"
    version: 1

    issue_source:
      provider: linear
      trigger: in_progress

    runner:
      mode: local
      repo_root: .
      base_branch: main
      worktree_prefix: superkick

    agents:
      implementation:
        provider: claude
      review:
        provider: codex

    workflow:
      steps:
        - type: plan
          agent: implementation
        - type: code
          agent: implementation
        - type: commands
          run:
            - pnpm lint
            - pnpm test
        - type: review_swarm
          agents:
            - review
            - review
            - review
        - type: pr
          create: true
          generate_description: true

    interrupts:
      on_blocked: ask_human
      on_review_conflict: ask_human

    budget:
      max_retries_per_step: 2
      max_parallel_agents: 3
      token_budget: medium
"};

#[test]
fn parse_full_config() {
    let config = load_str(FULL_YAML).unwrap();

    assert_eq!(config.version, 1);
    assert_eq!(config.issue_source.provider, IssueProvider::Linear);
    assert_eq!(config.issue_source.trigger, IssueTrigger::InProgress);
    assert_eq!(config.runner.mode, RunnerMode::Local);
    assert_eq!(config.runner.base_branch, "main");
    assert_eq!(config.agents.len(), 2);
    assert_eq!(
        config.agents["implementation"].provider,
        AgentProvider::Claude
    );
    assert_eq!(config.agents["review"].provider, AgentProvider::Codex);
    assert_eq!(config.workflow.steps.len(), 5);
    assert_eq!(config.interrupts.on_blocked, InterruptPolicy::AskHuman);
    assert_eq!(config.budget.max_retries_per_step, 2);
    assert_eq!(config.budget.token_budget, TokenBudget::Medium);
}

#[test]
fn defaults_applied_when_optional_sections_omitted() {
    let yaml = indoc! {"
        version: 1
        issue_source:
          provider: linear
          trigger: in_progress
        runner:
          mode: local
        agents:
          bot:
            provider: claude
        workflow:
          steps:
            - type: plan
              agent: bot
    "};
    let config = load_str(yaml).unwrap();

    assert_eq!(config.runner.repo_root, ".");
    assert_eq!(config.runner.base_branch, "main");
    assert_eq!(config.runner.worktree_prefix, "superkick");
    assert_eq!(config.interrupts.on_blocked, InterruptPolicy::AskHuman);
    assert_eq!(config.budget.max_retries_per_step, 2);
    assert_eq!(config.budget.max_parallel_agents, 3);
    assert_eq!(config.budget.token_budget, TokenBudget::Medium);
}

#[test]
fn reject_unknown_version() {
    let yaml = indoc! {"
        version: 99
        issue_source:
          provider: linear
          trigger: in_progress
        runner:
          mode: local
        agents:
          bot:
            provider: claude
        workflow:
          steps:
            - type: plan
              agent: bot
    "};
    let err = load_str(yaml).unwrap_err();
    assert!(
        err.to_string().contains("unsupported config version"),
        "unexpected error: {err}"
    );
}

#[test]
fn reject_undefined_agent_reference() {
    let yaml = indoc! {"
        version: 1
        issue_source:
          provider: linear
          trigger: in_progress
        runner:
          mode: local
        agents:
          bot:
            provider: claude
        workflow:
          steps:
            - type: plan
              agent: nonexistent
    "};
    let err = load_str(yaml).unwrap_err();
    assert!(
        err.to_string().contains("nonexistent"),
        "unexpected error: {err}"
    );
}

#[test]
fn reject_empty_commands_run() {
    let yaml = indoc! {"
        version: 1
        issue_source:
          provider: linear
          trigger: in_progress
        runner:
          mode: local
        agents:
          bot:
            provider: claude
        workflow:
          steps:
            - type: commands
              run: []
    "};
    let err = load_str(yaml).unwrap_err();
    assert!(
        err.to_string().contains("at least one command"),
        "unexpected error: {err}"
    );
}

#[test]
fn reject_empty_review_swarm_agents() {
    let yaml = indoc! {"
        version: 1
        issue_source:
          provider: linear
          trigger: in_progress
        runner:
          mode: local
        agents:
          bot:
            provider: claude
        workflow:
          steps:
            - type: review_swarm
              agents: []
    "};
    let err = load_str(yaml).unwrap_err();
    assert!(
        err.to_string().contains("at least one agent"),
        "unexpected error: {err}"
    );
}

#[test]
fn reject_empty_workflow() {
    let yaml = indoc! {"
        version: 1
        issue_source:
          provider: linear
          trigger: in_progress
        runner:
          mode: local
        agents:
          bot:
            provider: claude
        workflow:
          steps: []
    "};
    let err = load_str(yaml).unwrap_err();
    assert!(
        err.to_string().contains("at least one step"),
        "unexpected error: {err}"
    );
}

#[test]
fn reject_no_agents() {
    let yaml = indoc! {"
        version: 1
        issue_source:
          provider: linear
          trigger: in_progress
        runner:
          mode: local
        agents: {}
        workflow:
          steps:
            - type: pr
    "};
    let err = load_str(yaml).unwrap_err();
    assert!(
        err.to_string().contains("at least one agent"),
        "unexpected error: {err}"
    );
}

#[test]
fn reject_malformed_yaml() {
    let err = load_str("not: [valid: yaml: config").unwrap_err();
    assert!(
        err.to_string().contains("failed to parse"),
        "unexpected error: {err}"
    );
}

#[test]
fn reject_review_swarm_with_undefined_agent() {
    let yaml = indoc! {"
        version: 1
        issue_source:
          provider: linear
          trigger: in_progress
        runner:
          mode: local
        agents:
          bot:
            provider: claude
        workflow:
          steps:
            - type: review_swarm
              agents:
                - bot
                - ghost
    "};
    let err = load_str(yaml).unwrap_err();
    assert!(err.to_string().contains("ghost"), "unexpected error: {err}");
}

#[test]
fn load_example_file() {
    let path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/superkick.yaml");
    let config = crate::load_file(&path).expect("example config should parse successfully");
    assert_eq!(config.version, 1);
    assert_eq!(config.workflow.steps.len(), 5);
}
