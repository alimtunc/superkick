use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use superkick_core::{
    AgentProvider, LOCAL_RUNTIME_NAME, ProviderStatus, Runtime, RuntimeCapabilities, RuntimeId,
    RuntimeMode, RuntimeProvider, RuntimeProviderId, RuntimeStatus,
};

use super::codec::{deserialize_enum, serialize_enum};
use crate::is_unique_violation;

/// Caller-supplied snapshot for a single provider upsert. Bundles the
/// detection result so the repo signature stays compact and easy to extend.
pub struct ProviderUpsert<'a> {
    pub kind: AgentProvider,
    pub executable_path: Option<&'a str>,
    pub version: Option<&'a str>,
    pub status: ProviderStatus,
    pub capabilities: RuntimeCapabilities,
    pub seen_at: Option<DateTime<Utc>>,
}

pub struct SqliteRuntimeRepo {
    pool: SqlitePool,
}

impl SqliteRuntimeRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Idempotently create the V1 local runtime row. Returns the existing row
    /// on subsequent boots — the schema's partial unique index on
    /// `mode='local'` guarantees we never end up with two. If a concurrent
    /// boot wins the insert race, the unique violation is swallowed and we
    /// return the row the winner wrote.
    pub async fn ensure_local(
        &self,
        host_label: Option<&str>,
        platform: Option<&str>,
        arch: Option<&str>,
    ) -> Result<Runtime> {
        if let Some(existing) = self.find_local().await? {
            return Ok(existing);
        }
        let now = Utc::now();
        let runtime = Runtime {
            id: RuntimeId::new(),
            name: LOCAL_RUNTIME_NAME.to_string(),
            mode: RuntimeMode::Local,
            status: RuntimeStatus::Online,
            host_label: host_label.map(str::to_string),
            platform: platform.map(str::to_string),
            arch: arch.map(str::to_string),
            last_seen_at: None,
            created_at: now,
            updated_at: now,
        };
        let insert = sqlx::query(
            "INSERT INTO runtimes (id, name, mode, status, host_label, platform, arch, last_seen_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )
        .bind(runtime.id.0.to_string())
        .bind(&runtime.name)
        .bind(serialize_enum(&runtime.mode)?)
        .bind(serialize_enum(&runtime.status)?)
        .bind(&runtime.host_label)
        .bind(&runtime.platform)
        .bind(&runtime.arch)
        .bind(runtime.last_seen_at.map(|t| t.to_rfc3339()))
        .bind(runtime.created_at.to_rfc3339())
        .bind(runtime.updated_at.to_rfc3339())
        .execute(&self.pool)
        .await
        .map_err(anyhow::Error::from)
        .context("insert local runtime");

        if let Err(err) = insert {
            // Concurrent boot raced us — fall through to the second `find_local`
            // and surface whatever they wrote.
            if !is_unique_violation(&err) {
                return Err(err);
            }
        }
        self.find_local()
            .await?
            .context("local runtime missing after insert")
    }

    pub async fn find_local(&self) -> Result<Option<Runtime>> {
        let row =
            sqlx::query_as::<_, RuntimeRow>("SELECT * FROM runtimes WHERE mode = 'local' LIMIT 1")
                .fetch_optional(&self.pool)
                .await
                .context("find local runtime")?;
        row.map(RuntimeRow::into_domain).transpose()
    }

    pub async fn get(&self, id: RuntimeId) -> Result<Option<Runtime>> {
        let row = sqlx::query_as::<_, RuntimeRow>("SELECT * FROM runtimes WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await
            .context("get runtime")?;
        row.map(RuntimeRow::into_domain).transpose()
    }

    pub async fn list_all(&self) -> Result<Vec<Runtime>> {
        let rows = sqlx::query_as::<_, RuntimeRow>("SELECT * FROM runtimes ORDER BY created_at")
            .fetch_all(&self.pool)
            .await
            .context("list runtimes")?;
        rows.into_iter().map(RuntimeRow::into_domain).collect()
    }

    pub async fn touch_seen(&self, runtime_id: RuntimeId, now: DateTime<Utc>) -> Result<()> {
        sqlx::query("UPDATE runtimes SET last_seen_at = ?1, updated_at = ?1 WHERE id = ?2")
            .bind(now.to_rfc3339())
            .bind(runtime_id.0.to_string())
            .execute(&self.pool)
            .await
            .context("touch runtime last_seen_at")?;
        Ok(())
    }

    /// Insert-or-update a provider row keyed by `(runtime_id, kind)`. The
    /// statement is a single `INSERT … ON CONFLICT … RETURNING *` so cross-
    /// process callers cannot race on a SELECT-then-INSERT split: SQLite
    /// resolves the conflict atomically and returns the canonical row.
    pub async fn upsert_provider(
        &self,
        runtime_id: RuntimeId,
        upsert: ProviderUpsert<'_>,
    ) -> Result<RuntimeProvider> {
        let now = Utc::now();
        let kind_str = serialize_enum(&upsert.kind)?;
        let status_str = serialize_enum(&upsert.status)?;
        let new_id = RuntimeProviderId::new();
        let row = sqlx::query_as::<_, RuntimeProviderRow>(
            "INSERT INTO runtime_providers (
                id, runtime_id, kind, executable_path, version, status,
                supports_pty, supports_protocol, supports_resume,
                supports_mcp_config, supports_structured_tools, supports_usage,
                last_seen_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            ON CONFLICT(runtime_id, kind) DO UPDATE SET
                executable_path = excluded.executable_path,
                version = excluded.version,
                status = excluded.status,
                supports_pty = excluded.supports_pty,
                supports_protocol = excluded.supports_protocol,
                supports_resume = excluded.supports_resume,
                supports_mcp_config = excluded.supports_mcp_config,
                supports_structured_tools = excluded.supports_structured_tools,
                supports_usage = excluded.supports_usage,
                last_seen_at = excluded.last_seen_at,
                updated_at = excluded.updated_at
            RETURNING *",
        )
        .bind(new_id.0.to_string())
        .bind(runtime_id.0.to_string())
        .bind(&kind_str)
        .bind(upsert.executable_path)
        .bind(upsert.version)
        .bind(&status_str)
        .bind(upsert.capabilities.supports_pty as i64)
        .bind(upsert.capabilities.supports_protocol as i64)
        .bind(upsert.capabilities.supports_resume as i64)
        .bind(upsert.capabilities.supports_mcp_config as i64)
        .bind(upsert.capabilities.supports_structured_tools as i64)
        .bind(upsert.capabilities.supports_usage as i64)
        .bind(upsert.seen_at.map(|t| t.to_rfc3339()))
        .bind(now.to_rfc3339())
        .bind(now.to_rfc3339())
        .fetch_one(&self.pool)
        .await
        .context("upsert runtime provider")?;
        row.into_domain()
    }

    pub async fn list_providers(&self, runtime_id: RuntimeId) -> Result<Vec<RuntimeProvider>> {
        let rows = sqlx::query_as::<_, RuntimeProviderRow>(
            "SELECT * FROM runtime_providers WHERE runtime_id = ?1 ORDER BY kind",
        )
        .bind(runtime_id.0.to_string())
        .fetch_all(&self.pool)
        .await
        .context("list runtime providers")?;
        rows.into_iter()
            .map(RuntimeProviderRow::into_domain)
            .collect()
    }
}

#[derive(sqlx::FromRow)]
struct RuntimeRow {
    id: String,
    name: String,
    mode: String,
    status: String,
    host_label: Option<String>,
    platform: Option<String>,
    arch: Option<String>,
    last_seen_at: Option<String>,
    created_at: String,
    updated_at: String,
}

impl RuntimeRow {
    fn into_domain(self) -> Result<Runtime> {
        Ok(Runtime {
            id: RuntimeId(uuid::Uuid::parse_str(&self.id)?),
            name: self.name,
            mode: deserialize_enum::<RuntimeMode>(&self.mode)?,
            status: deserialize_enum::<RuntimeStatus>(&self.status)?,
            host_label: self.host_label,
            platform: self.platform,
            arch: self.arch,
            last_seen_at: parse_optional_rfc3339(self.last_seen_at.as_deref())?,
            created_at: DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
            updated_at: DateTime::parse_from_rfc3339(&self.updated_at)?.to_utc(),
        })
    }
}

#[derive(sqlx::FromRow)]
struct RuntimeProviderRow {
    id: String,
    runtime_id: String,
    kind: String,
    executable_path: Option<String>,
    version: Option<String>,
    status: String,
    supports_pty: i64,
    supports_protocol: i64,
    supports_resume: i64,
    supports_mcp_config: i64,
    supports_structured_tools: i64,
    supports_usage: i64,
    last_seen_at: Option<String>,
    created_at: String,
    updated_at: String,
}

impl RuntimeProviderRow {
    fn into_domain(self) -> Result<RuntimeProvider> {
        Ok(RuntimeProvider {
            id: RuntimeProviderId(uuid::Uuid::parse_str(&self.id)?),
            runtime_id: RuntimeId(uuid::Uuid::parse_str(&self.runtime_id)?),
            kind: deserialize_enum::<AgentProvider>(&self.kind)?,
            executable_path: self.executable_path,
            version: self.version,
            status: deserialize_enum::<ProviderStatus>(&self.status)?,
            capabilities: RuntimeCapabilities {
                supports_pty: self.supports_pty != 0,
                supports_protocol: self.supports_protocol != 0,
                supports_resume: self.supports_resume != 0,
                supports_mcp_config: self.supports_mcp_config != 0,
                supports_structured_tools: self.supports_structured_tools != 0,
                supports_usage: self.supports_usage != 0,
            },
            last_seen_at: parse_optional_rfc3339(self.last_seen_at.as_deref())?,
            created_at: DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
            updated_at: DateTime::parse_from_rfc3339(&self.updated_at)?.to_utc(),
        })
    }
}

fn parse_optional_rfc3339(value: Option<&str>) -> Result<Option<DateTime<Utc>>> {
    value
        .map(|s| DateTime::parse_from_rfc3339(s).map(|d| d.to_utc()))
        .transpose()
        .map_err(Into::into)
}
