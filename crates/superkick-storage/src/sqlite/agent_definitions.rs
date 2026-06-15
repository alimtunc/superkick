//! SQLite persistence for app-managed agent definitions.
//!
//! Scalar enums round-trip through the shared [`serialize_enum`] codec; the
//! nested policy fields (`mcp_policy`, `tool_policy`, `backend`) are stored as
//! JSON TEXT because their `Vec<String>` payloads cannot live in flat columns.

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::SqlitePool;
use superkick_core::{
    AgentAvatar, AgentBackend, AgentOrigin, AgentProvider, BillingProfile, CoreAgentDefinition,
    LinearContextMode, ReasoningEffort, ResolvedMcpPolicy, ResolvedToolPolicy, RunnerMode,
};

use super::codec::{deserialize_enum, serialize_enum};
use super::ensure_updated;
use crate::repo::AgentDefinitionRepo;

pub struct SqliteAgentDefinitionRepo {
    pool: SqlitePool,
}

impl SqliteAgentDefinitionRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

const UPSERT_SQL: &str = "INSERT INTO agent_definitions (\
     name, provider, role, model, system_prompt, timeout_secs, max_turns, origin, \
     linear_context, default_reasoning, runner_mode, billing_profile, mcp_policy_json, \
     tool_policy_json, backend_json, skills_json, avatar_json, description, enabled, \
     created_at, updated_at\
 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, \
     ?19, ?20, ?20) \
 ON CONFLICT(name) DO UPDATE SET \
     provider = ?2, role = ?3, model = ?4, system_prompt = ?5, timeout_secs = ?6, \
     max_turns = ?7, origin = ?8, linear_context = ?9, default_reasoning = ?10, \
     runner_mode = ?11, billing_profile = ?12, mcp_policy_json = ?13, tool_policy_json = ?14, \
     backend_json = ?15, skills_json = ?16, avatar_json = ?17, description = ?18, \
     enabled = ?19, updated_at = ?20";

const INSERT_IF_ABSENT_SQL: &str = "INSERT INTO agent_definitions (\
     name, provider, role, model, system_prompt, timeout_secs, max_turns, origin, \
     linear_context, default_reasoning, runner_mode, billing_profile, mcp_policy_json, \
     tool_policy_json, backend_json, skills_json, avatar_json, description, enabled, \
     created_at, updated_at\
 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, \
     ?19, ?20, ?20) \
 ON CONFLICT(name) DO NOTHING";

impl SqliteAgentDefinitionRepo {
    async fn write(&self, agent: &CoreAgentDefinition, sql: &'static str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let runner_mode = agent.runner_mode.map(|m| serialize_enum(&m)).transpose()?;
        let billing_profile = agent
            .billing_profile
            .map(|b| serialize_enum(&b))
            .transpose()?;
        let mcp_policy_json = serde_json::to_string(&agent.mcp_policy)
            .with_context(|| format!("serialize mcp_policy for agent {}", agent.name))?;
        let tool_policy_json = serde_json::to_string(&agent.tool_policy)
            .with_context(|| format!("serialize tool_policy for agent {}", agent.name))?;
        let backend_json = agent
            .backend
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .with_context(|| format!("serialize backend for agent {}", agent.name))?;
        let skills_json = serde_json::to_string(&agent.skills)
            .with_context(|| format!("serialize skills for agent {}", agent.name))?;
        let avatar_json = agent
            .avatar
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .with_context(|| format!("serialize avatar for agent {}", agent.name))?;
        sqlx::query(sql)
            .bind(&agent.name)
            .bind(serialize_enum(&agent.provider)?)
            .bind(agent.role.clone())
            .bind(agent.model.clone())
            .bind(agent.system_prompt.clone())
            .bind(agent.timeout_secs.map(|v| v as i64))
            .bind(agent.max_turns.map(i64::from))
            .bind(serialize_enum(&agent.origin)?)
            .bind(serialize_enum(&agent.linear_context)?)
            .bind(serialize_enum(&agent.default_reasoning)?)
            .bind(runner_mode)
            .bind(billing_profile)
            .bind(mcp_policy_json)
            .bind(tool_policy_json)
            .bind(backend_json)
            .bind(skills_json)
            .bind(avatar_json)
            .bind(agent.description.clone())
            .bind(i64::from(agent.enabled))
            .bind(now)
            .execute(&self.pool)
            .await
            .with_context(|| format!("write agent_definition {}", agent.name))?;
        Ok(())
    }
}

impl AgentDefinitionRepo for SqliteAgentDefinitionRepo {
    async fn list(&self) -> Result<Vec<CoreAgentDefinition>> {
        let rows = sqlx::query_as::<_, AgentDefinitionRow>(
            "SELECT * FROM agent_definitions ORDER BY created_at, name",
        )
        .fetch_all(&self.pool)
        .await
        .context("list agent_definitions")?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn get(&self, name: &str) -> Result<Option<CoreAgentDefinition>> {
        let row = sqlx::query_as::<_, AgentDefinitionRow>(
            "SELECT * FROM agent_definitions WHERE name = ?1",
        )
        .bind(name)
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get agent_definition {name}"))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn upsert(&self, agent: &CoreAgentDefinition) -> Result<()> {
        self.write(agent, UPSERT_SQL).await
    }

    async fn insert_if_absent(&self, agent: &CoreAgentDefinition) -> Result<()> {
        self.write(agent, INSERT_IF_ABSENT_SQL).await
    }

    async fn delete(&self, name: &str) -> Result<()> {
        let result = sqlx::query("DELETE FROM agent_definitions WHERE name = ?1")
            .bind(name)
            .execute(&self.pool)
            .await
            .with_context(|| format!("delete agent_definition {name}"))?;
        ensure_updated(result, "agent_definition", name)
    }
}

#[derive(sqlx::FromRow)]
struct AgentDefinitionRow {
    name: String,
    provider: String,
    role: Option<String>,
    model: Option<String>,
    system_prompt: Option<String>,
    timeout_secs: Option<i64>,
    max_turns: Option<i64>,
    origin: String,
    linear_context: String,
    default_reasoning: String,
    runner_mode: Option<String>,
    billing_profile: Option<String>,
    mcp_policy_json: String,
    tool_policy_json: String,
    backend_json: Option<String>,
    skills_json: String,
    avatar_json: Option<String>,
    description: Option<String>,
    enabled: i64,
}

impl AgentDefinitionRow {
    fn into_domain(self) -> Result<CoreAgentDefinition> {
        let mcp_policy: ResolvedMcpPolicy = serde_json::from_str(&self.mcp_policy_json)
            .with_context(|| format!("deserialize mcp_policy for agent {}", self.name))?;
        let tool_policy: ResolvedToolPolicy = serde_json::from_str(&self.tool_policy_json)
            .with_context(|| format!("deserialize tool_policy for agent {}", self.name))?;
        let backend: Option<AgentBackend> = self
            .backend_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .with_context(|| format!("deserialize backend for agent {}", self.name))?;
        let skills: Vec<String> = serde_json::from_str(&self.skills_json)
            .with_context(|| format!("deserialize skills for agent {}", self.name))?;
        let avatar: Option<AgentAvatar> = self
            .avatar_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .with_context(|| format!("deserialize avatar for agent {}", self.name))?;
        Ok(CoreAgentDefinition {
            name: self.name,
            provider: deserialize_enum::<AgentProvider>(&self.provider)?,
            role: self.role,
            model: self.model,
            system_prompt: self.system_prompt,
            timeout_secs: self.timeout_secs.map(|v| v as u64),
            max_turns: self.max_turns.map(|v| v as u32),
            origin: deserialize_enum::<AgentOrigin>(&self.origin)?,
            linear_context: deserialize_enum::<LinearContextMode>(&self.linear_context)?,
            mcp_policy,
            tool_policy,
            backend,
            runner_mode: self
                .runner_mode
                .as_deref()
                .map(deserialize_enum::<RunnerMode>)
                .transpose()?,
            billing_profile: self
                .billing_profile
                .as_deref()
                .map(deserialize_enum::<BillingProfile>)
                .transpose()?,
            default_reasoning: deserialize_enum::<ReasoningEffort>(&self.default_reasoning)?,
            enabled: self.enabled != 0,
            skills,
            avatar,
            description: self.description,
        })
    }
}
