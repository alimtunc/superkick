//! SQLite persistence for app-managed provider settings.
//!
//! Only the operator-editable columns live here. The detection-derived
//! `availability` / `install_state` / `auth_state` are reconstructed as
//! `Unknown` and overlaid live by the runtime service at read time.

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::SqlitePool;
use superkick_core::{
    AgentProvider, AuthState, BillingProfile, InstallState, PermissionPolicy, ProviderAvailability,
    ProviderSettings, ReasoningEffort, SandboxPolicy, StepExecutor,
};

use super::codec::{deserialize_enum, serialize_enum};
use crate::repo::ProviderSettingsRepo;

pub struct SqliteProviderSettingsRepo {
    pool: SqlitePool,
}

impl SqliteProviderSettingsRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

const UPSERT_SQL: &str = "INSERT INTO provider_settings (\
     provider, billing_mode, default_model, default_reasoning, default_executor, \
     sandbox_policy, permission_policy, enabled, created_at, updated_at\
 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9) \
 ON CONFLICT(provider) DO UPDATE SET \
     billing_mode = ?2, default_model = ?3, default_reasoning = ?4, default_executor = ?5, \
     sandbox_policy = ?6, permission_policy = ?7, enabled = ?8, updated_at = ?9";

const INSERT_IF_ABSENT_SQL: &str = "INSERT INTO provider_settings (\
     provider, billing_mode, default_model, default_reasoning, default_executor, \
     sandbox_policy, permission_policy, enabled, created_at, updated_at\
 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9) ON CONFLICT(provider) DO NOTHING";

struct Encoded {
    provider: String,
    billing_mode: String,
    default_reasoning: String,
    default_executor: String,
    sandbox_policy: String,
    permission_policy: String,
}

fn encode(settings: &ProviderSettings) -> Result<Encoded> {
    Ok(Encoded {
        provider: serialize_enum(&settings.provider)?,
        billing_mode: serialize_enum(&settings.billing_mode)?,
        default_reasoning: serialize_enum(&settings.default_reasoning)?,
        default_executor: serialize_enum(&settings.default_executor)?,
        sandbox_policy: serialize_enum(&settings.sandbox_policy)?,
        permission_policy: serialize_enum(&settings.permission_policy)?,
    })
}

impl SqliteProviderSettingsRepo {
    async fn write(&self, settings: &ProviderSettings, sql: &'static str) -> Result<()> {
        let e = encode(settings)?;
        let now = Utc::now().to_rfc3339();
        sqlx::query(sql)
            .bind(e.provider)
            .bind(e.billing_mode)
            .bind(settings.default_model.clone())
            .bind(e.default_reasoning)
            .bind(e.default_executor)
            .bind(e.sandbox_policy)
            .bind(e.permission_policy)
            .bind(i64::from(settings.enabled))
            .bind(now)
            .execute(&self.pool)
            .await
            .with_context(|| format!("write provider_settings {}", settings.provider))?;
        Ok(())
    }
}

impl ProviderSettingsRepo for SqliteProviderSettingsRepo {
    async fn list(&self) -> Result<Vec<ProviderSettings>> {
        let rows = sqlx::query_as::<_, ProviderSettingsRow>(
            "SELECT * FROM provider_settings ORDER BY provider",
        )
        .fetch_all(&self.pool)
        .await
        .context("list provider_settings")?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }

    async fn get(&self, provider: AgentProvider) -> Result<Option<ProviderSettings>> {
        let row = sqlx::query_as::<_, ProviderSettingsRow>(
            "SELECT * FROM provider_settings WHERE provider = ?1",
        )
        .bind(serialize_enum(&provider)?)
        .fetch_optional(&self.pool)
        .await
        .with_context(|| format!("get provider_settings {provider}"))?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn upsert(&self, settings: &ProviderSettings) -> Result<()> {
        self.write(settings, UPSERT_SQL).await
    }

    async fn insert_if_absent(&self, settings: &ProviderSettings) -> Result<()> {
        self.write(settings, INSERT_IF_ABSENT_SQL).await
    }
}

#[derive(sqlx::FromRow)]
struct ProviderSettingsRow {
    provider: String,
    billing_mode: String,
    default_model: Option<String>,
    default_reasoning: String,
    default_executor: String,
    sandbox_policy: String,
    permission_policy: String,
    enabled: i64,
}

impl ProviderSettingsRow {
    fn into_domain(self) -> Result<ProviderSettings> {
        Ok(ProviderSettings {
            provider: deserialize_enum::<AgentProvider>(&self.provider)?,
            availability: ProviderAvailability::Unknown,
            install_state: InstallState::Unknown,
            auth_state: AuthState::Unknown,
            billing_mode: deserialize_enum::<BillingProfile>(&self.billing_mode)?,
            default_model: self.default_model,
            default_reasoning: deserialize_enum::<ReasoningEffort>(&self.default_reasoning)?,
            default_executor: deserialize_enum::<StepExecutor>(&self.default_executor)?,
            sandbox_policy: deserialize_enum::<SandboxPolicy>(&self.sandbox_policy)?,
            permission_policy: deserialize_enum::<PermissionPolicy>(&self.permission_policy)?,
            enabled: self.enabled != 0,
        })
    }
}
