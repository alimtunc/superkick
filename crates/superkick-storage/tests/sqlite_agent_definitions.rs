//! Real-SQLite round-trip for the migration 049 `agent_definitions` table.
//! A custom agent carrying the JSON-encoded policy columns (mcp servers, tool
//! deny list, backend) must survive an upsert/read cycle; the six builtins must
//! seed as editable `Builtin` rows; and a re-seed must be idempotent and never
//! clobber an operator edit.

use anyhow::Result;
use superkick_core::{
    AgentAvatar, AgentBackend, AgentOrigin, AgentProvider, CoreAgentDefinition, LinearContextMode,
    McpMode, ReasoningEffort, ResolvedMcpPolicy, ResolvedToolPolicy, RunnerMode,
};
use superkick_storage::repo::AgentDefinitionRepo;
use superkick_storage::seed::seed_defaults;
use superkick_storage::{SqliteAgentDefinitionRepo, connect, connect_with_capacity};

fn custom_agent() -> CoreAgentDefinition {
    CoreAgentDefinition {
        name: "custom-claude".into(),
        provider: AgentProvider::Claude,
        role: Some("specialist".into()),
        model: Some("claude-opus-4-8".into()),
        system_prompt: Some("You focus on tricky refactors.".into()),
        timeout_secs: Some(900),
        max_turns: Some(40),
        origin: AgentOrigin::Custom,
        linear_context: LinearContextMode::SnapshotPlusMcp,
        mcp_policy: ResolvedMcpPolicy {
            mode: McpMode::Servers,
            servers: vec!["linear".into(), "fs".into()],
        },
        tool_policy: ResolvedToolPolicy {
            allow: Some(vec!["read".into(), "edit".into()]),
            deny: Some(vec!["bash".into()]),
            require_approval: true,
            persist_results: false,
        },
        backend: Some(AgentBackend::ClaudeSkill {
            skills: vec!["ticket-plan".into(), "review".into()],
        }),
        runner_mode: Some(RunnerMode::PrintStreamJson),
        billing_profile: None,
        default_reasoning: ReasoningEffort::High,
        enabled: true,
        skills: vec!["plan".into(), "review".into()],
        avatar: Some(AgentAvatar {
            icon: "🛠️".into(),
            color: "#a855f7".into(),
        }),
        description: Some("Specialist for tricky refactors.".into()),
    }
}

#[tokio::test]
async fn custom_agent_round_trips_through_json_policy_columns() -> Result<()> {
    let pool = connect_with_capacity("sqlite::memory:", 1).await?;
    let repo = SqliteAgentDefinitionRepo::new(pool);

    let agent = custom_agent();
    repo.upsert(&agent).await?;

    let fetched = repo.get("custom-claude").await?.expect("agent present");
    assert_eq!(fetched, agent);

    Ok(())
}

#[tokio::test]
async fn builtins_seed_as_editable_builtin_rows() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteAgentDefinitionRepo::new(pool);

    let listed = repo.list().await?;
    for builtin in CoreAgentDefinition::builtins() {
        let seeded = listed
            .iter()
            .find(|a| a.name == builtin.name)
            .unwrap_or_else(|| panic!("builtin `{}` seeded", builtin.name));
        assert_eq!(seeded, &builtin, "seeded builtin matches code constant");
        assert_eq!(seeded.origin, AgentOrigin::Builtin);
        assert!(!seeded.is_deletable());
    }

    Ok(())
}

#[tokio::test]
async fn reseed_is_idempotent_and_preserves_operator_edits() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteAgentDefinitionRepo::new(pool.clone());

    // Operator edits a builtin's model before a reboot — must survive the reseed.
    let edited = CoreAgentDefinition {
        model: Some("claude-opus-4-8".into()),
        ..repo.get("claude-plan").await?.expect("claude-plan present")
    };
    repo.upsert(&edited).await?;

    seed_defaults(&pool).await?;

    let after = repo.get("claude-plan").await?.expect("claude-plan present");
    assert_eq!(
        after.model,
        Some("claude-opus-4-8".into()),
        "operator edit must not be clobbered by reseed"
    );
    // A custom agent stays put across reseed.
    repo.upsert(&custom_agent()).await?;
    seed_defaults(&pool).await?;
    assert!(repo.get("custom-claude").await?.is_some());

    Ok(())
}
