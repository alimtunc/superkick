//! Idempotent seeding of the builtin providers, skills, and profiles.
//!
//! The canonical definitions are code constants in `superkick-core`
//! (`ProviderSettings::builtins`, `SkillDefinition::builtins`,
//! `LaunchProfile::builtins`). This seeds editable DB copies, inserting each
//! only if its key is absent — so a fresh install boots with defaults, operator
//! edits survive a reboot, and a factory reset (delete rows, reboot) re-seeds.
//! Runs automatically after migrations in `connect_with_capacity`.

use anyhow::{Context, Result};
use sqlx::SqlitePool;
use superkick_core::{LaunchProfile, ProviderSettings, SkillDefinition};

use crate::repo::{LaunchProfileRepo, ProviderSettingsRepo, SkillDefinitionRepo};
use crate::sqlite::{
    SqliteLaunchProfileRepo, SqliteProviderSettingsRepo, SqliteSkillDefinitionRepo,
};

pub async fn seed_defaults(pool: &SqlitePool) -> Result<()> {
    let providers = SqliteProviderSettingsRepo::new(pool.clone());
    for settings in ProviderSettings::builtins() {
        providers
            .insert_if_absent(&settings)
            .await
            .with_context(|| format!("seed provider_settings {}", settings.provider))?;
    }

    let skills = SqliteSkillDefinitionRepo::new(pool.clone());
    for skill in SkillDefinition::builtins() {
        skills
            .insert_if_absent(&skill)
            .await
            .with_context(|| format!("seed skill_definition {}", skill.id))?;
        // Pre-`body` installs carry builtin rows with body=NULL; fill them in
        // without clobbering a later operator edit (no-op once body is set).
        skills
            .backfill_builtin_body(&skill)
            .await
            .with_context(|| format!("backfill skill_definition {}", skill.id))?;
    }

    let profiles = SqliteLaunchProfileRepo::new(pool.clone());
    for profile in LaunchProfile::builtins() {
        profiles
            .insert_if_absent(&profile)
            .await
            .with_context(|| format!("seed launch_profile {}", profile.id))?;
    }

    Ok(())
}
