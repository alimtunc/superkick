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
fn parse_full_agent_definition() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        agents:
          planner:
            provider: claude
            role: planner
            model: claude-opus-4-6
            system_prompt: |
              You are the planner. Think before acting.
            tools: [read, grep]
            budget:
              timeout_secs: 900
              max_turns: 8
        workflow:
          steps:
            - type: plan
              agent: planner
    "};
    let config = load_str(yaml).unwrap();
    let planner = &config.agents["planner"];
    assert_eq!(planner.provider, AgentProvider::Claude);
    assert_eq!(planner.role.as_deref(), Some("planner"));
    assert_eq!(planner.model.as_deref(), Some("claude-opus-4-6"));
    assert!(
        planner
            .system_prompt
            .as_deref()
            .unwrap()
            .contains("planner")
    );
    assert_eq!(planner.tools.as_ref().unwrap().len(), 2);
    assert_eq!(planner.budget.timeout_secs, Some(900));
    assert_eq!(planner.budget.max_turns, Some(8));
}

#[test]
fn launch_profile_allowed_agents_narrows_policy() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        agents:
          planner: { provider: claude }
          coder: { provider: claude }
        workflow:
          steps:
            - type: plan
              agent: planner
            - type: code
              agent: coder
        launch_profile:
          allowed_agents: [planner, coder]
    "};
    let config = load_str(yaml).unwrap();
    let policy = config.base_run_policy();
    assert!(policy.is_allowed("planner"));
    assert!(policy.is_allowed("coder"));
    assert!(!policy.is_allowed("reviewer"));
}

#[test]
fn reject_workflow_agent_outside_allowed_set() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        agents:
          planner: { provider: claude }
          coder: { provider: claude }
        workflow:
          steps:
            - type: plan
              agent: planner
            - type: code
              agent: coder
        launch_profile:
          allowed_agents: [planner]
    "};
    let err = load_str(yaml).unwrap_err();
    assert!(
        err.to_string().contains("allowed_agents"),
        "unexpected error: {err}"
    );
}

#[test]
fn reject_allowed_agents_referencing_unknown_role() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        agents:
          planner: { provider: claude }
        workflow:
          steps:
            - type: plan
              agent: planner
        launch_profile:
          allowed_agents: [planner, ghost]
    "};
    let err = load_str(yaml).unwrap_err();
    assert!(err.to_string().contains("ghost"), "unexpected error: {err}");
}

#[test]
fn agent_catalog_exposes_all_roles() {
    let config = load_str(FULL_YAML).unwrap();
    let catalog = config.agent_catalog();
    assert_eq!(catalog.len(), 2);
    assert!(catalog.get("implementation").is_some());
    assert!(catalog.get("review").is_some());
}

#[test]
fn load_example_file() {
    let path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/superkick.yaml");
    let config = crate::load_file(&path).expect("example config should parse successfully");
    assert_eq!(config.version, 1);
    assert_eq!(config.workflow.steps.len(), 5);
}
