//! Real-SQLite round-trip for the migration 041 `body` + `artifact_kind`
//! columns. A managed (imported, command-form) skill with a markdown body must
//! survive an upsert/read cycle, the seeded builtins must carry their editable
//! body, and a re-seed must backfill a NULL builtin body without clobbering an
//! operator edit.

use anyhow::Result;
use superkick_core::{SkillArtifact, SkillDefinition, SkillOrigin};
use superkick_storage::connect;
use superkick_storage::repo::SkillDefinitionRepo;
use superkick_storage::seed::seed_defaults;
use superkick_storage::{SqliteSkillDefinitionRepo, connect_with_capacity};

#[tokio::test]
async fn managed_skill_with_body_and_command_artifact_round_trips() -> Result<()> {
    let pool = connect_with_capacity("sqlite::memory:", 1).await?;
    let repo = SqliteSkillDefinitionRepo::new(pool);

    let mut skill = SkillDefinition::builtins().remove(0);
    skill.id = "imported-ticket".into();
    skill.label = "Imported Ticket".into();
    skill.origin = SkillOrigin::Imported;
    skill.body = Some("# Ticket\n\nA→Z workflow body.\n".repeat(40));
    skill.artifact_kind = SkillArtifact::Command;

    repo.upsert(&skill).await?;

    let fetched = repo.get("imported-ticket").await?.expect("skill present");
    assert_eq!(fetched, skill);
    assert_eq!(fetched.origin, SkillOrigin::Imported);
    assert_eq!(fetched.artifact_kind, SkillArtifact::Command);
    assert_eq!(fetched.body, skill.body);

    Ok(())
}

#[tokio::test]
async fn seeded_builtins_load_with_their_editable_body() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteSkillDefinitionRepo::new(pool);

    let listed = repo.list().await?;
    for builtin in SkillDefinition::builtins() {
        let seeded = listed
            .iter()
            .find(|s| s.id == builtin.id)
            .unwrap_or_else(|| panic!("builtin `{}` seeded", builtin.id));
        assert_eq!(seeded.origin, SkillOrigin::Builtin);
        assert_eq!(seeded.body, builtin.body);
        assert!(
            seeded.body.is_some(),
            "builtin `{}` carries a body",
            builtin.id
        );
        assert_eq!(seeded.artifact_kind, builtin.artifact_kind);
    }

    Ok(())
}

#[tokio::test]
async fn reseed_backfills_null_builtin_body_but_not_operator_edits() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteSkillDefinitionRepo::new(pool.clone());

    // Simulate a pre-`body` install: builtin rows exist with body = NULL.
    sqlx::query("UPDATE skill_definitions SET body = NULL WHERE origin = 'builtin'")
        .execute(&pool)
        .await?;

    // Operator edited one builtin's body before the upgrade — must survive.
    let edited = "# my own plan body".to_string();
    repo.upsert(&SkillDefinition {
        body: Some(edited.clone()),
        ..repo.get("plan").await?.expect("plan builtin present")
    })
    .await?;

    seed_defaults(&pool).await?;

    let plan = repo.get("plan").await?.expect("plan builtin present");
    assert_eq!(
        plan.body,
        Some(edited),
        "operator-edited body must not be clobbered"
    );

    let implement = repo
        .get("implement")
        .await?
        .expect("implement builtin present");
    let default_body = SkillDefinition::builtins()
        .into_iter()
        .find(|s| s.id == "implement")
        .and_then(|s| s.body)
        .expect("implement builtin has a default body");
    assert_eq!(
        implement.body,
        Some(default_body),
        "NULL builtin body must be backfilled to the default",
    );

    // Idempotent: a second re-seed leaves both rows untouched.
    seed_defaults(&pool).await?;
    assert_eq!(
        repo.get("plan").await?.and_then(|s| s.body).as_deref(),
        Some("# my own plan body"),
    );

    Ok(())
}
