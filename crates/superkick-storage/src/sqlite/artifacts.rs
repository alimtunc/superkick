use anyhow::Result;
use sqlx::SqlitePool;
use superkick_core::{Artifact, ArtifactId, ArtifactKind, RunId};

use crate::repo::ArtifactRepo;

pub struct SqliteArtifactRepo {
    pool: SqlitePool,
}

impl SqliteArtifactRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl ArtifactRepo for SqliteArtifactRepo {
    async fn insert(&self, artifact: &Artifact) -> Result<()> {
        sqlx::query(
            "INSERT INTO artifacts (id, run_id, kind, path_or_url, metadata_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(artifact.id.0.to_string())
        .bind(artifact.run_id.0.to_string())
        .bind(ser_enum(&artifact.kind))
        .bind(&artifact.path_or_url)
        .bind(artifact.metadata_json.as_ref().map(|v| v.to_string()))
        .bind(artifact.created_at.to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get(&self, id: ArtifactId) -> Result<Option<Artifact>> {
        let row = sqlx::query_as::<_, ArtifactRow>("SELECT * FROM artifacts WHERE id = ?1")
            .bind(id.0.to_string())
            .fetch_optional(&self.pool)
            .await?;
        row.map(|r| r.into_domain()).transpose()
    }

    async fn list_by_run(&self, run_id: RunId) -> Result<Vec<Artifact>> {
        let rows = sqlx::query_as::<_, ArtifactRow>(
            "SELECT * FROM artifacts WHERE run_id = ?1 ORDER BY created_at",
        )
        .bind(run_id.0.to_string())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }
}

#[derive(sqlx::FromRow)]
struct ArtifactRow {
    id: String,
    run_id: String,
    kind: String,
    path_or_url: String,
    metadata_json: Option<String>,
    created_at: String,
}

impl ArtifactRow {
    fn into_domain(self) -> Result<Artifact> {
        Ok(Artifact {
            id: ArtifactId(uuid::Uuid::parse_str(&self.id)?),
            run_id: RunId(uuid::Uuid::parse_str(&self.run_id)?),
            kind: de_enum::<ArtifactKind>(&self.kind)?,
            path_or_url: self.path_or_url,
            metadata_json: self
                .metadata_json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()?,
            created_at: chrono::DateTime::parse_from_rfc3339(&self.created_at)?.to_utc(),
        })
    }
}

fn ser_enum<T: serde::Serialize>(val: &T) -> String {
    serde_json::to_string(val)
        .expect("enum serialization cannot fail")
        .trim_matches('"')
        .to_string()
}

fn de_enum<T: serde::de::DeserializeOwned>(s: &str) -> Result<T> {
    let quoted = format!("\"{s}\"");
    Ok(serde_json::from_str(&quoted)?)
}
