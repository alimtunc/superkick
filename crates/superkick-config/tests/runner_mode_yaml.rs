use indoc::indoc;

use superkick_config::load_str;
use superkick_core::{AgentProvider, BillingProfile, RoleRouter, RunPolicy, RunnerMode};

#[test]
fn interactive_pty_yaml_round_trips() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local, repo_root: ., base_branch: main, worktree_prefix: superkick }
        workflow:
          steps:
            - type: commands
              run: [echo hi]
        agents:
          planner:
            provider: claude
            runner_mode: interactive_pty
    "};
    let cfg = load_str(yaml).expect("yaml parse");
    let planner = cfg.agents.get("planner").expect("planner present");
    assert_eq!(planner.runner_mode, Some(RunnerMode::InteractivePty));
    assert_eq!(planner.billing_profile, None);

    let catalog = cfg.agent_catalog();
    let policy = RunPolicy::allow_all();
    let resolved = RoleRouter::new(&catalog, &policy)
        .resolve("planner")
        .expect("resolve");
    assert_eq!(resolved.runner_mode, RunnerMode::InteractivePty);
    assert_eq!(resolved.billing_profile, BillingProfile::Subscription);
}

#[test]
fn print_stream_json_yaml_round_trips_with_explicit_billing() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local, repo_root: ., base_branch: main, worktree_prefix: superkick }
        workflow:
          steps:
            - type: commands
              run: [echo hi]
        agents:
          headless:
            provider: claude
            runner_mode: print_stream_json
            billing_profile: agent_sdk_credits
    "};
    let cfg = load_str(yaml).expect("yaml parse");
    let agent_def = cfg.agents.get("headless").expect("headless present");
    assert_eq!(agent_def.runner_mode, Some(RunnerMode::PrintStreamJson));
    assert_eq!(
        agent_def.billing_profile,
        Some(BillingProfile::AgentSdkCredits)
    );

    let catalog = cfg.agent_catalog();
    let policy = RunPolicy::allow_all();
    let resolved = RoleRouter::new(&catalog, &policy)
        .resolve("headless")
        .expect("resolve");
    assert_eq!(resolved.runner_mode, RunnerMode::PrintStreamJson);
    assert_eq!(resolved.billing_profile, BillingProfile::AgentSdkCredits);
}

#[test]
fn omitted_keys_fall_through_to_provider_defaults() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local, repo_root: ., base_branch: main, worktree_prefix: superkick }
        workflow:
          steps:
            - type: commands
              run: [echo hi]
        agents:
          coder:
            provider: claude
          reviewer:
            provider: codex
    "};
    let cfg = load_str(yaml).expect("yaml parse");
    assert!(cfg.agents["coder"].runner_mode.is_none());
    assert!(cfg.agents["reviewer"].runner_mode.is_none());

    let catalog = cfg.agent_catalog();
    let policy = RunPolicy::allow_all();
    let router = RoleRouter::new(&catalog, &policy);
    let claude = router.resolve("coder").unwrap();
    let codex = router.resolve("reviewer").unwrap();

    assert_eq!(claude.provider, AgentProvider::Claude);
    assert_eq!(claude.runner_mode, RunnerMode::InteractivePty);
    assert_eq!(claude.billing_profile, BillingProfile::Subscription);

    assert_eq!(codex.provider, AgentProvider::Codex);
    assert_eq!(codex.runner_mode, RunnerMode::ExecJson);
    assert_eq!(codex.billing_profile, BillingProfile::Subscription);
}

#[test]
fn claude_print_stream_json_forces_agent_sdk_credits_against_yaml_override() {
    let yaml = indoc! {"
        version: 1
        issue_source: { provider: linear, trigger: in_progress }
        runner: { mode: local, repo_root: ., base_branch: main, worktree_prefix: superkick }
        workflow:
          steps:
            - type: commands
              run: [echo hi]
        agents:
          forced:
            provider: claude
            runner_mode: print_stream_json
            billing_profile: subscription
    "};
    let cfg = load_str(yaml).expect("yaml parse");
    let catalog = cfg.agent_catalog();
    let policy = RunPolicy::allow_all();
    let resolved = RoleRouter::new(&catalog, &policy)
        .resolve("forced")
        .unwrap();
    assert_eq!(resolved.billing_profile, BillingProfile::AgentSdkCredits);
}
