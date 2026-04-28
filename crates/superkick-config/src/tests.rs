use indoc::indoc;

use crate::{LINEAR_MCP_SERVER_NAME, LINEAR_MCP_URL, load_str, model::*};
use superkick_core::{AgentProvider, LinearContextMode, McpMode};

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

// ── SUP-104: MCP registry + per-agent policy ────────────────────────

#[test]
fn parse_mcp_servers_registry_and_per_agent_policy() {
    let yaml = indoc! {r#"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        mcp_servers:
          linear:
            type: http
            url: https://mcp.linear.app/mcp
          fs:
            type: stdio
            command: mcp-fs
            args: ["--root", "/tmp"]
            env_passthrough: ["FS_AUTH"]
        agents:
          planner:
            provider: claude
            mcp:
              mode: servers
              servers: [linear, fs]
            tool_policy:
              allow: [read, grep]
              deny: [bash]
              require_approval: true
              persist_results: false
        workflow:
          steps:
            - type: plan
              agent: planner
    "#};
    let config = load_str(yaml).unwrap();

    assert_eq!(config.mcp_servers.len(), 2);
    match &config.mcp_servers["linear"] {
        McpServerSpec::Http { url, .. } => assert_eq!(url, "https://mcp.linear.app/mcp"),
        other => panic!("expected http, got {other:?}"),
    }
    match &config.mcp_servers["fs"] {
        McpServerSpec::Stdio {
            command,
            args,
            env_passthrough,
        } => {
            assert_eq!(command, "mcp-fs");
            assert_eq!(args, &vec!["--root".to_string(), "/tmp".to_string()]);
            assert_eq!(env_passthrough, &vec!["FS_AUTH".to_string()]);
        }
        other => panic!("expected stdio, got {other:?}"),
    }

    let planner = &config.agents["planner"];
    let mcp = planner.mcp.as_ref().expect("mcp block");
    assert_eq!(mcp.mode, McpMode::Servers);
    assert_eq!(mcp.servers, vec!["linear".to_string(), "fs".to_string()]);

    let tools = planner.tool_policy.as_ref().expect("tool_policy block");
    assert_eq!(
        tools.allow.as_deref(),
        Some(&["read".to_string(), "grep".to_string()][..])
    );
    assert_eq!(tools.deny.as_deref(), Some(&["bash".to_string()][..]));
    assert!(tools.require_approval);
    assert!(!tools.persist_results);
}

#[test]
fn missing_mcp_block_resolves_to_none_in_catalog() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        agents:
          coder:
            provider: claude
            linear_context: snapshot
        workflow:
          steps:
            - type: plan
              agent: coder
    "};
    let config = load_str(yaml).unwrap();
    let catalog = config.agent_catalog();
    let coder = catalog.get("coder").unwrap();
    assert_eq!(coder.mcp_policy.mode, McpMode::None);
    assert!(coder.mcp_policy.servers.is_empty());

    // Tool policy defaults: no allowlist, no approval, results persisted.
    assert!(coder.tool_policy.allow.is_none());
    assert!(coder.tool_policy.deny.is_none());
    assert!(!coder.tool_policy.require_approval);
    assert!(coder.tool_policy.persist_results);
}

#[test]
fn legacy_tools_field_becomes_allowlist_in_resolved_policy() {
    // SUP-104: existing configs that listed `tools: [...]` for documentation
    // now see those tools become the audit allowlist snapshot. No new YAML
    // is required for backward compat.
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        agents:
          coder:
            provider: claude
            tools: [read, grep]
        workflow:
          steps:
            - type: plan
              agent: coder
    "};
    let config = load_str(yaml).unwrap();
    let catalog = config.agent_catalog();
    let coder = catalog.get("coder").unwrap();
    assert_eq!(
        coder.tool_policy.allow.as_deref(),
        Some(&["read".to_string(), "grep".to_string()][..])
    );
}

#[test]
fn legacy_tools_field_combines_with_explicit_tool_policy_deny() {
    // SUP-104: when a role declares the legacy `tools:` field for the
    // allowlist *and* an explicit `tool_policy.deny`, the resolver should
    // honour both — the legacy field becomes `allow`, the explicit
    // `deny` flows through unchanged.
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        agents:
          coder:
            provider: claude
            tools: [read, grep]
            tool_policy:
              deny: [bash]
        workflow:
          steps:
            - type: plan
              agent: coder
    "};
    let config = load_str(yaml).unwrap();
    let catalog = config.agent_catalog();
    let coder = catalog.get("coder").unwrap();
    assert_eq!(
        coder.tool_policy.allow.as_deref(),
        Some(&["read".to_string(), "grep".to_string()][..])
    );
    assert_eq!(
        coder.tool_policy.deny.as_deref(),
        Some(&["bash".to_string()][..])
    );
}

#[test]
fn explicit_tool_policy_allow_wins_over_legacy_tools_field() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        agents:
          coder:
            provider: claude
            tools: [read, grep]
            tool_policy:
              allow: [read]
        workflow:
          steps:
            - type: plan
              agent: coder
    "};
    let config = load_str(yaml).unwrap();
    let catalog = config.agent_catalog();
    let coder = catalog.get("coder").unwrap();
    assert_eq!(
        coder.tool_policy.allow.as_deref(),
        Some(&["read".to_string()][..])
    );
}

#[test]
fn snapshot_plus_mcp_sugar_desugars_into_linear_server_in_catalog() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        agents:
          planner:
            provider: claude
            linear_context: snapshot_plus_mcp
        workflow:
          steps:
            - type: plan
              agent: planner
    "};
    let config = load_str(yaml).unwrap();

    // Per-role catalog projection has the desugared policy.
    let catalog = config.agent_catalog();
    let planner = catalog.get("planner").unwrap();
    assert_eq!(planner.mcp_policy.mode, McpMode::Servers);
    assert_eq!(
        planner.mcp_policy.servers,
        vec![LINEAR_MCP_SERVER_NAME.to_string()]
    );

    // Effective registry auto-injects the Linear MCP entry.
    let registry = config.effective_mcp_servers();
    match registry
        .get(LINEAR_MCP_SERVER_NAME)
        .expect("linear injected")
    {
        McpServerSpec::Http {
            url,
            env_passthrough,
        } => {
            assert_eq!(url, LINEAR_MCP_URL);
            assert!(env_passthrough.is_empty());
        }
        other => panic!("expected http, got {other:?}"),
    }
}

#[test]
fn explicit_linear_registry_entry_is_not_overridden_by_sugar() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        mcp_servers:
          linear:
            type: http
            url: https://mcp.linear.app/custom-edge
        agents:
          planner:
            provider: claude
            linear_context: snapshot_plus_mcp
        workflow:
          steps:
            - type: plan
              agent: planner
    "};
    let config = load_str(yaml).unwrap();
    let registry = config.effective_mcp_servers();
    match registry.get(LINEAR_MCP_SERVER_NAME).unwrap() {
        McpServerSpec::Http { url, .. } => assert_eq!(url, "https://mcp.linear.app/custom-edge"),
        other => panic!("unexpected variant {other:?}"),
    }
}

#[test]
fn snapshot_plus_mcp_sugar_keeps_explicit_extra_servers() {
    // Sugar adds `linear` to the allowlist but must not erase what the
    // operator listed explicitly.
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        mcp_servers:
          fs:
            type: stdio
            command: mcp-fs
        agents:
          planner:
            provider: claude
            linear_context: snapshot_plus_mcp
            mcp:
              mode: servers
              servers: [fs]
        workflow:
          steps:
            - type: plan
              agent: planner
    "};
    let config = load_str(yaml).unwrap();
    let catalog = config.agent_catalog();
    let planner = catalog.get("planner").unwrap();
    assert!(planner.mcp_policy.servers.contains(&"fs".to_string()));
    assert!(
        planner
            .mcp_policy
            .servers
            .contains(&LINEAR_MCP_SERVER_NAME.to_string())
    );
    assert_eq!(planner.mcp_policy.mode, McpMode::Servers);
}

#[test]
fn default_linear_context_does_not_inject_linear_server() {
    // No agent uses `snapshot_plus_mcp` → no auto-injection. Backward-compat
    // for configs that pre-date SUP-104.
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local }
        agents:
          coder:
            provider: claude
            linear_context: snapshot
        workflow:
          steps:
            - type: code
              agent: coder
    "};
    let config = load_str(yaml).unwrap();
    assert!(config.effective_mcp_servers().is_empty());
    let catalog = config.agent_catalog();
    let coder = catalog.get("coder").unwrap();
    assert_eq!(coder.linear_context, LinearContextMode::Snapshot);
    assert_eq!(coder.mcp_policy.mode, McpMode::None);
}
