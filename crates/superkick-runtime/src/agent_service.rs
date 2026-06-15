//! Agent-write business logic.
//!
//! Thin orchestration over [`AgentDefinitionRepo`] that owns the invariants the
//! HTTP handlers must not encode themselves (module-boundary rule): force a
//! `Custom` origin on create, preserve origin on patch, block builtin deletes,
//! and — the part skills do not need — rebuild the shared [`AgentCatalogProvider`]
//! from the repo after every successful write so the next launch resolves the
//! edit without a restart.

use std::sync::Arc;

use superkick_core::{AgentCatalog, AgentOrigin, CoreAgentDefinition, CoreError};
use superkick_storage::repo::AgentDefinitionRepo;

use crate::agent_catalog_provider::AgentCatalogProvider;

#[derive(Debug, thiserror::Error)]
pub enum AgentServiceError {
    #[error("agent not found")]
    NotFound,
    #[error("agent '{0}' already exists")]
    Conflict(String),
    #[error("builtin agents cannot be deleted — disable them instead")]
    BuiltinUndeletable,
    #[error(transparent)]
    Invalid(#[from] CoreError),
    #[error(transparent)]
    Db(#[from] anyhow::Error),
}

pub struct AgentService<R> {
    repo: Arc<R>,
    catalog: AgentCatalogProvider,
}

impl<R: AgentDefinitionRepo> AgentService<R> {
    pub fn new(repo: Arc<R>, catalog: AgentCatalogProvider) -> Self {
        Self { repo, catalog }
    }

    pub async fn list(&self) -> Result<Vec<CoreAgentDefinition>, AgentServiceError> {
        Ok(self.repo.list().await?)
    }

    /// Fetch one agent by name. A missing name is the typed `NotFound` so the
    /// HTTP boundary maps it to 404 through the single `From<AgentServiceError>`
    /// rather than re-encoding "agent not found" per handler.
    pub async fn get(&self, name: &str) -> Result<CoreAgentDefinition, AgentServiceError> {
        self.repo
            .get(name)
            .await?
            .ok_or(AgentServiceError::NotFound)
    }

    /// Create a custom agent. The client cannot forge a builtin origin (only a
    /// server-side seed produces those), so origin is forced to `Custom`.
    pub async fn create(
        &self,
        mut agent: CoreAgentDefinition,
    ) -> Result<CoreAgentDefinition, AgentServiceError> {
        agent.origin = AgentOrigin::Custom;
        agent.validate()?;
        if self.repo.get(&agent.name).await?.is_some() {
            return Err(AgentServiceError::Conflict(agent.name.clone()));
        }
        self.repo.upsert(&agent).await?;
        self.rebuild_catalog().await?;
        Ok(agent)
    }

    /// Patch an existing agent. `name` (the path) is authoritative and origin is
    /// preserved so a client PATCH can never flip a builtin into deletable-custom.
    pub async fn update(
        &self,
        name: String,
        mut agent: CoreAgentDefinition,
    ) -> Result<CoreAgentDefinition, AgentServiceError> {
        let existing = self
            .repo
            .get(&name)
            .await?
            .ok_or(AgentServiceError::NotFound)?;
        agent.name = name;
        agent.origin = existing.origin;
        agent.validate()?;
        self.repo.upsert(&agent).await?;
        self.rebuild_catalog().await?;
        Ok(agent)
    }

    pub async fn delete(&self, name: &str) -> Result<(), AgentServiceError> {
        let agent = self
            .repo
            .get(name)
            .await?
            .ok_or(AgentServiceError::NotFound)?;
        if !agent.is_deletable() {
            return Err(AgentServiceError::BuiltinUndeletable);
        }
        self.repo.delete(name).await?;
        self.rebuild_catalog().await?;
        Ok(())
    }

    /// Restore a built-in agent to its shipped defaults, overwriting any
    /// operator edits (origin stays `Builtin`, the row is undeletable as before).
    /// Only built-ins have a canonical default, so an unknown or custom name is a
    /// 404 — the same `NotFound` the rest of the surface uses.
    pub async fn restore_default(
        &self,
        name: &str,
    ) -> Result<CoreAgentDefinition, AgentServiceError> {
        let builtin = CoreAgentDefinition::builtins()
            .into_iter()
            .find(|b| b.name == name)
            .ok_or(AgentServiceError::NotFound)?;
        self.repo.upsert(&builtin).await?;
        self.rebuild_catalog().await?;
        Ok(builtin)
    }

    async fn rebuild_catalog(&self) -> Result<(), AgentServiceError> {
        let defs = self.repo.list().await?;
        self.catalog.replace(AgentCatalog::from_definitions(defs));
        Ok(())
    }
}
