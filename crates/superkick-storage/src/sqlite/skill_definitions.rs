//! SQLite persistence for app-managed skill definitions.

use anyhow::{Context, Result, anyhow};
use chrono::Utc;
use sqlx::SqlitePool;
use superkick_core::{
    AgentProvider, OutputExpectation, ReasoningEffort, SessionPolicy, SkillDefinition, SkillKind,
    SkillOrigin, SkillSource, StepExecutor,
};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::SkillDefinitionRepo;

pub struct SqliteSkillDefinitionRepo {
    pool: SqlitePool,
}

impl SqliteSkillDefinitionRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

const UPSERT_SQL: &str = "INSERT INTO skill_definitions (\
     id, label, kind, source_kind, source_value, default_provider, default_model, \
     default_reasoning, default_executor, default_session_policy, \
     default_output_expectation, enabled, origin, created_at, updated_at\
 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14) \
 ON CONFLICT(id) DO UPDATE SET \
     label = ?2, kind = ?3, source_kind = ?4, source_value = ?5, default_provider = ?6, \
     default_model = ?7, default_reasoning = ?8, default_executor = ?9, \
     default_session_policy = ?10, default_output_expectation = ?11, enabled = ?12, \
     origin = ?13, updated_at = ?14";

const INSERT_IF_ABSENT_SQL: &str = "INSERT INTO skill_definitions (\
     id, label, kind, source_kind, source_value, default_provider, default_model, \
     default_reasoning, default_executor, default_session_policy, \
     default_output_expectation, enabled, origin, created_at, updated_at\
 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14) \
 ON CONFLICT(id) DO NOTHING";

impl SqliteSkillDefinitionRepo {
    async fn write(&self, skill: &SkillDefinition, sql: &'static str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(sql)
            .bind(&skill.id)
            .bind(&skill.label)
            .bind(serialize_enum(&skill.kind)?)
            .bind(skill.source.kind_tag())
            .bind(skill.source.value().to_string())
            .bind(serialize_enum(&skill.default_provider)?)
            .bind(skill.default_model.clone())
            .bind(serialize_enum(&skill.default_reasoning)?)
            .bind(serialize_enum(&skill.default_executor)?)
            .bind(serialize_enum(&skill.default_session_policy)?)
            .bind(serialize_enum(&skill.default_output_expectation)?)
            .bind(i64::from(skill.enabled))
            .bind(serialize_enum(&skill.origin)?)
            .bind(now)
            .execute(&self.pool)
            .await
            .with_context(|| format!("write skill_definition {}", skill.id))?;
        Ok(())
    }
}

impl SkillDefinitionRepo for SqliteSkillDefinitionRepo {
    async fn list(&self) -> Result<Vec<SkillDefinition>> {
        let rows = sqlx::query_as::<_, SkillDefinitionRow>(
            "SELECT * FROM skill_definitions ORDER BY created_at, id",
        )
        .fetch_all(&self.pool)
        .await
        .context("list skill_definitions")?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn get(&self, id: &str) -> Result<Option<SkillDefinition>> {
        let row = sqlx::query_as::<_, SkillDefinitionRow>(
            "SELECT * FROM skill_definitions WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get skill_definition {id}"))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn upsert(&self, skill: &SkillDefinition) -> Result<()> {
        self.write(skill, UPSERT_SQL).await
    }

    async fn insert_if_absent(&self, skill: &SkillDefinition) -> Result<()> {
        self.write(skill, INSERT_IF_ABSENT_SQL).await
    }

    async fn delete(&self, id: &str) -> Result<()> {
        let result = sqlx::query("DELETE FROM skill_definitions WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await
            .with_context(|| format!("delete skill_definition {id}"))?;
        if result.rows_affected() == 0 {
            return Err(anyhow!("skill_definition {id} not found"));
        }
        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct SkillDefinitionRow {
    id: String,
    label: String,
    kind: String,
    source_kind: String,
    source_value: String,
    default_provider: String,
    default_model: Option<String>,
    default_reasoning: String,
    default_executor: String,
    default_session_policy: String,
    default_output_expectation: String,
    enabled: i64,
    origin: String,
}

impl SkillDefinitionRow {
    fn into_domain(self) -> Result<SkillDefinition> {
        Ok(SkillDefinition {
            id: self.id,
            label: self.label,
            kind: deserialize_enum::<SkillKind>(&self.kind)?,
            source: SkillSource::from_parts(&self.source_kind, self.source_value)?,
            default_provider: deserialize_enum::<AgentProvider>(&self.default_provider)?,
            default_model: self.default_model,
            default_reasoning: deserialize_enum::<ReasoningEffort>(&self.default_reasoning)?,
            default_executor: deserialize_enum::<StepExecutor>(&self.default_executor)?,
            default_session_policy: deserialize_enum::<SessionPolicy>(
                &self.default_session_policy,
            )?,
            default_output_expectation: deserialize_enum::<OutputExpectation>(
                &self.default_output_expectation,
            )?,
            enabled: self.enabled != 0,
            origin: deserialize_enum::<SkillOrigin>(&self.origin)?,
        })
    }
}
