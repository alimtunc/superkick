//! Agent-write invariants + catalog-rebuild liveness against a real SQLite.
//! Covers the handler-facing rules (force Custom origin, preserve origin on
//! patch, conflict on duplicate, builtin-undeletable) and the load-bearing
//! Phase-2 seam: a successful write must be visible in the shared catalog
//! snapshot the step runners resolve against — without a restart.

use std::sync::Arc;

use anyhow::Result;
use superkick_core::{
    AgentCatalog, AgentOrigin, AgentProvider, CoreAgentDefinition, LinearContextMode, McpMode,
    ReasoningEffort, ResolvedMcpPolicy, ResolvedToolPolicy, RunnerMode,
};
use superkick_runtime::{AgentCatalogProvider, AgentService, AgentServiceError};
use superkick_storage::repo::AgentDefinitionRepo;
use superkick_storage::{SqliteAgentDefinitionRepo, connect};

async fn service() -> Result<(
    AgentService<SqliteAgentDefinitionRepo>,
    AgentCatalogProvider,
)> {
    let pool = connect("sqlite::memory:").await?;
    let repo = Arc::new(SqliteAgentDefinitionRepo::new(pool));
    let catalog = AgentCatalogProvider::new(AgentCatalog::from_definitions(repo.list().await?));
    Ok((AgentService::new(repo, catalog.clone()), catalog))
}

fn custom(name: &str) -> CoreAgentDefinition {
    CoreAgentDefinition {
        name: name.into(),
        provider: AgentProvider::Claude,
        role: Some("specialist".into()),
        model: None,
        system_prompt: Some("focus".into()),
        timeout_secs: None,
        max_turns: None,
        // Deliberately try to forge a builtin origin — create() must override it.
        origin: AgentOrigin::Builtin,
        linear_context: LinearContextMode::Snapshot,
        mcp_policy: ResolvedMcpPolicy {
            mode: McpMode::Servers,
            servers: vec!["linear".into()],
        },
        tool_policy: ResolvedToolPolicy::default(),
        backend: None,
        runner_mode: Some(RunnerMode::InteractivePty),
        billing_profile: None,
        default_reasoning: ReasoningEffort::High,
        enabled: true,
        skills: Vec::new(),
        avatar: None,
        description: None,
    }
}

#[tokio::test]
async fn create_forces_custom_origin_and_is_visible_in_catalog() -> Result<()> {
    let (svc, catalog) = service().await?;
    let created = svc.create(custom("my-agent")).await?;
    assert_eq!(
        created.origin,
        AgentOrigin::Custom,
        "origin forced to Custom"
    );
    // Load-bearing: the shared catalog snapshot reflects the write immediately.
    assert!(catalog.snapshot().get("my-agent").is_some());
    Ok(())
}

#[tokio::test]
async fn create_rejects_duplicate_name() -> Result<()> {
    let (svc, _) = service().await?;
    svc.create(custom("dup")).await?;
    let err = svc.create(custom("dup")).await.unwrap_err();
    assert!(matches!(err, AgentServiceError::Conflict(_)));
    Ok(())
}

#[tokio::test]
async fn create_rejects_unsafe_name() -> Result<()> {
    let (svc, _) = service().await?;
    let err = svc.create(custom("Bad Name")).await.unwrap_err();
    assert!(matches!(err, AgentServiceError::Invalid(_)));
    Ok(())
}

#[tokio::test]
async fn patch_preserves_builtin_origin_and_blocks_delete() -> Result<()> {
    let (svc, catalog) = service().await?;
    // Patch a seeded builtin, trying to flip it to deletable custom.
    let mut body = svc.get("claude-plan").await?;
    body.origin = AgentOrigin::Custom;
    body.model = Some("claude-opus-4-8".into());
    let patched = svc.update("claude-plan".into(), body).await?;
    assert_eq!(patched.origin, AgentOrigin::Builtin, "origin preserved");
    assert_eq!(patched.model.as_deref(), Some("claude-opus-4-8"));
    assert_eq!(
        catalog
            .snapshot()
            .get("claude-plan")
            .and_then(|a| a.model.clone()),
        Some("claude-opus-4-8".into()),
        "edit visible in catalog"
    );
    let err = svc.delete("claude-plan").await.unwrap_err();
    assert!(matches!(err, AgentServiceError::BuiltinUndeletable));
    Ok(())
}

#[tokio::test]
async fn update_unknown_name_is_not_found() -> Result<()> {
    let (svc, _) = service().await?;
    let err = svc
        .update("ghost".into(), custom("ghost"))
        .await
        .unwrap_err();
    assert!(matches!(err, AgentServiceError::NotFound));
    Ok(())
}

#[tokio::test]
async fn restore_default_resets_a_builtin_and_rebuilds_catalog() -> Result<()> {
    let (svc, catalog) = service().await?;
    // Operator edits a builtin's model, then restores it.
    let mut body = svc.get("claude-plan").await?;
    body.model = Some("claude-opus-4-8".into());
    svc.update("claude-plan".into(), body).await?;

    let restored = svc.restore_default("claude-plan").await?;
    assert_eq!(restored.origin, AgentOrigin::Builtin);
    assert_eq!(restored.model, None, "model reset to the shipped default");
    assert_eq!(
        restored.skills,
        vec!["plan".to_string()],
        "shipped skill re-attached"
    );
    assert_eq!(
        catalog
            .snapshot()
            .get("claude-plan")
            .and_then(|a| a.model.clone()),
        None,
        "restore visible in catalog"
    );
    Ok(())
}

#[tokio::test]
async fn restore_default_rejects_custom_and_unknown_names() -> Result<()> {
    let (svc, _) = service().await?;
    svc.create(custom("mine")).await?;
    assert!(matches!(
        svc.restore_default("mine").await.unwrap_err(),
        AgentServiceError::NotFound
    ));
    assert!(matches!(
        svc.restore_default("ghost").await.unwrap_err(),
        AgentServiceError::NotFound
    ));
    Ok(())
}

#[tokio::test]
async fn delete_custom_removes_from_catalog() -> Result<()> {
    let (svc, catalog) = service().await?;
    svc.create(custom("temp")).await?;
    assert!(catalog.snapshot().get("temp").is_some());
    svc.delete("temp").await?;
    assert!(
        catalog.snapshot().get("temp").is_none(),
        "removed from catalog"
    );
    Ok(())
}
