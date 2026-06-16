//! SQLite persistence for launch profiles + their ordered steps.
//!
//! `upsert` rewrites a profile and its full step list in one transaction;
//! `insert_if_absent` (the seed path) inserts a builtin only when its id is
//! absent so operator edits survive a reboot. Steps cascade with their profile.

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::{SqliteConnection, SqlitePool};
use superkick_core::{
    AgentProvider, LaunchProfile, OutputExpectation, ProfileKind, ProfileStep, ProfileUsage,
    ReasoningEffort, SessionPolicy, StepExecutor,
};

use super::codec::{deserialize_enum, serialize_enum};
use super::ensure_updated;
use crate::repo::LaunchProfileRepo;

pub struct SqliteLaunchProfileRepo {
    pool: SqlitePool,
}

impl SqliteLaunchProfileRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    async fn load_steps(&self, profile_id: &str) -> Result<Vec<ProfileStep>> {
        let rows = sqlx::query_as::<_, ProfileStepRow>(
            "SELECT * FROM launch_profile_steps WHERE profile_id = ?1 ORDER BY ordering",
        )
        .bind(profile_id)
        .fetch_all(&self.pool)
        .await
        .with_context(|| format!("list steps for launch_profile {profile_id}"))?;
        rows.into_iter().map(|r| r.into_domain()).collect()
    }
}

const PROFILE_UPSERT_SQL: &str = "INSERT INTO launch_profiles (\
     id, name, kind, is_default, is_readonly, created_at, updated_at\
 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) \
 ON CONFLICT(id) DO UPDATE SET \
     name = ?2, kind = ?3, is_default = ?4, is_readonly = ?5, updated_at = ?6";

const PROFILE_INSERT_IF_ABSENT_SQL: &str = "INSERT INTO launch_profiles (\
     id, name, kind, is_default, is_readonly, created_at, updated_at\
 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) ON CONFLICT(id) DO NOTHING";

const PROFILES_USING_SKILL_SQL: &str = "SELECT p.id AS profile_id, p.name AS profile_name, \
     s.label AS step_label FROM launch_profile_steps s \
     JOIN launch_profiles p ON p.id = s.profile_id \
     WHERE s.skill_ref = ?1 ORDER BY p.created_at, p.id, s.ordering";

const PROFILES_USING_AGENT_SQL: &str = "SELECT p.id AS profile_id, p.name AS profile_name, \
     s.label AS step_label FROM launch_profile_steps s \
     JOIN launch_profiles p ON p.id = s.profile_id \
     WHERE s.agent_ref = ?1 ORDER BY p.created_at, p.id, s.ordering";

/// Collapse the join's per-step rows (ordered so a profile's rows are
/// contiguous) into one [`ProfileUsage`] per profile, carrying the labels of the
/// matching steps.
fn group_usages(rows: Vec<ProfileUsageRow>) -> Vec<ProfileUsage> {
    let mut out: Vec<ProfileUsage> = Vec::new();
    for row in rows {
        match out.last_mut() {
            Some(last) if last.id == row.profile_id => last.steps.push(row.step_label),
            _ => out.push(ProfileUsage {
                id: row.profile_id,
                name: row.profile_name,
                steps: vec![row.step_label],
            }),
        }
    }
    out
}

async fn insert_profile_row(
    conn: &mut SqliteConnection,
    profile: &LaunchProfile,
    sql: &'static str,
) -> Result<u64> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(sql)
        .bind(&profile.id)
        .bind(&profile.name)
        .bind(serialize_enum(&profile.kind)?)
        .bind(i64::from(profile.is_default))
        .bind(i64::from(profile.is_readonly))
        .bind(now)
        .execute(conn)
        .await
        .with_context(|| format!("write launch_profile {}", profile.id))?;
    Ok(result.rows_affected())
}

async fn insert_step(
    conn: &mut SqliteConnection,
    profile_id: &str,
    step: &ProfileStep,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO launch_profile_steps (\
             profile_id, ordering, label, skill_ref, agent_ref, provider, model, reasoning, \
             executor, session_policy, output_expectation, enabled\
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    )
    .bind(profile_id)
    .bind(i64::from(step.ordering))
    .bind(&step.label)
    .bind(&step.skill_ref)
    .bind(step.agent_ref.clone())
    .bind(serialize_enum(&step.provider)?)
    .bind(step.model.clone())
    .bind(serialize_enum(&step.reasoning)?)
    .bind(serialize_enum(&step.executor)?)
    .bind(serialize_enum(&step.session_policy)?)
    .bind(serialize_enum(&step.output_expectation)?)
    .bind(i64::from(step.enabled))
    .execute(conn)
    .await
    .with_context(|| {
        format!(
            "insert step {} for launch_profile {profile_id}",
            step.ordering
        )
    })?;
    Ok(())
}

impl LaunchProfileRepo for SqliteLaunchProfileRepo {
    async fn list(&self) -> Result<Vec<LaunchProfile>> {
        let profile_rows = sqlx::query_as::<_, LaunchProfileRow>(
            "SELECT * FROM launch_profiles ORDER BY created_at, id",
        )
        .fetch_all(&self.pool)
        .await
        .context("list launch_profiles")?;
        let mut profiles = Vec::with_capacity(profile_rows.len());
        for row in profile_rows {
            let steps = self.load_steps(&row.id).await?;
            profiles.push(row.into_domain(steps)?);
        }
        Ok(profiles)
    }

    async fn get(&self, id: &str) -> Result<Option<LaunchProfile>> {
        let row =
            sqlx::query_as::<_, LaunchProfileRow>("SELECT * FROM launch_profiles WHERE id = ?1")
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .with_context(|| format!("get launch_profile {id}"))?;
        match row {
            Some(row) => {
                let steps = self.load_steps(&row.id).await?;
                Ok(Some(row.into_domain(steps)?))
            }
            None => Ok(None),
        }
    }

    async fn upsert(&self, profile: &LaunchProfile) -> Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for launch_profile upsert")?;
        insert_profile_row(&mut tx, profile, PROFILE_UPSERT_SQL).await?;
        sqlx::query("DELETE FROM launch_profile_steps WHERE profile_id = ?1")
            .bind(&profile.id)
            .execute(&mut *tx)
            .await
            .with_context(|| format!("clear steps for launch_profile {}", profile.id))?;
        for step in &profile.steps {
            insert_step(&mut tx, &profile.id, step).await?;
        }
        tx.commit().await.context("commit launch_profile upsert")?;
        Ok(())
    }

    async fn insert_if_absent(&self, profile: &LaunchProfile) -> Result<()> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin transaction for launch_profile seed")?;
        let inserted = insert_profile_row(&mut tx, profile, PROFILE_INSERT_IF_ABSENT_SQL).await?;
        if inserted > 0 {
            for step in &profile.steps {
                insert_step(&mut tx, &profile.id, step).await?;
            }
        }
        tx.commit().await.context("commit launch_profile seed")?;
        Ok(())
    }

    async fn delete(&self, id: &str) -> Result<()> {
        let result = sqlx::query("DELETE FROM launch_profiles WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await
            .with_context(|| format!("delete launch_profile {id}"))?;
        ensure_updated(result, "launch_profile", id)
    }

    async fn profiles_using_skill(&self, skill_ref: &str) -> Result<Vec<ProfileUsage>> {
        let rows = sqlx::query_as::<_, ProfileUsageRow>(PROFILES_USING_SKILL_SQL)
            .bind(skill_ref)
            .fetch_all(&self.pool)
            .await
            .with_context(|| format!("list launch profiles using skill {skill_ref}"))?;
        Ok(group_usages(rows))
    }

    async fn profiles_using_agent(&self, agent_ref: &str) -> Result<Vec<ProfileUsage>> {
        let rows = sqlx::query_as::<_, ProfileUsageRow>(PROFILES_USING_AGENT_SQL)
            .bind(agent_ref)
            .fetch_all(&self.pool)
            .await
            .with_context(|| format!("list launch profiles using agent {agent_ref}"))?;
        Ok(group_usages(rows))
    }
}

#[derive(sqlx::FromRow)]
struct ProfileUsageRow {
    profile_id: String,
    profile_name: String,
    step_label: String,
}

#[derive(sqlx::FromRow)]
struct LaunchProfileRow {
    id: String,
    name: String,
    kind: String,
    is_default: i64,
    is_readonly: i64,
}

impl LaunchProfileRow {
    fn into_domain(self, steps: Vec<ProfileStep>) -> Result<LaunchProfile> {
        Ok(LaunchProfile {
            id: self.id,
            name: self.name,
            kind: deserialize_enum::<ProfileKind>(&self.kind)?,
            is_default: self.is_default != 0,
            is_readonly: self.is_readonly != 0,
            steps,
        })
    }
}

#[derive(sqlx::FromRow)]
struct ProfileStepRow {
    ordering: i64,
    label: String,
    skill_ref: String,
    agent_ref: Option<String>,
    provider: String,
    model: Option<String>,
    reasoning: String,
    executor: String,
    session_policy: String,
    output_expectation: String,
    enabled: i64,
}

impl ProfileStepRow {
    fn into_domain(self) -> Result<ProfileStep> {
        Ok(ProfileStep {
            ordering: u32::try_from(self.ordering)
                .with_context(|| format!("profile step ordering overflow: {}", self.ordering))?,
            label: self.label,
            skill_ref: self.skill_ref,
            agent_ref: self.agent_ref,
            provider: deserialize_enum::<AgentProvider>(&self.provider)?,
            model: self.model,
            reasoning: deserialize_enum::<ReasoningEffort>(&self.reasoning)?,
            executor: deserialize_enum::<StepExecutor>(&self.executor)?,
            session_policy: deserialize_enum::<SessionPolicy>(&self.session_policy)?,
            output_expectation: deserialize_enum::<OutputExpectation>(&self.output_expectation)?,
            enabled: self.enabled != 0,
        })
    }
}
