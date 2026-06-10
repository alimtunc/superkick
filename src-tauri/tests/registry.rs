use std::path::Path;

use superkick_desktop_lib::registry::{Project, ProjectRegistry, RegistryError};

const LEGACY_REGISTRY_JSON: &str =
    r#"{"projects":[{"id":"a","name":"a","path":"/tmp/a","last_opened_at":null}],"active_id":"a"}"#;

fn git_repo(dir: &Path, name: &str) -> std::path::PathBuf {
    let repo = dir.join(name);
    std::fs::create_dir_all(repo.join(".git")).expect("create fake git repo");
    repo
}

fn seeded_registry() -> (tempfile::TempDir, ProjectRegistry, Project) {
    let dir = tempfile::tempdir().expect("tempdir");
    let repo = git_repo(dir.path(), "repo");
    let mut registry = ProjectRegistry::default();
    let project = registry.add(&repo).expect("add");
    (dir, registry, project)
}

#[test]
fn load_returns_empty_registry_when_file_is_missing() {
    let dir = tempfile::tempdir().expect("tempdir");
    let registry = ProjectRegistry::load(&dir.path().join("projects.json")).expect("load");
    assert!(registry.projects.is_empty());
    assert!(registry.active_id.is_none());
}

#[test]
fn load_rejects_corrupt_registry_file() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("projects.json");
    std::fs::write(&path, "{not json").expect("write corrupt file");
    assert!(matches!(
        ProjectRegistry::load(&path),
        Err(RegistryError::Parse { .. })
    ));
}

#[test]
fn add_save_load_roundtrip_preserves_projects_and_selection() {
    let dir = tempfile::tempdir().expect("tempdir");
    let repo = git_repo(dir.path(), "my-repo");
    let registry_file = dir.path().join("data").join("projects.json");

    let mut registry = ProjectRegistry::default();
    let project = registry.add(&repo).expect("add project");
    registry
        .select(&project.id, chrono::Utc::now())
        .expect("select project");
    registry.save(&registry_file).expect("save registry");

    let reloaded = ProjectRegistry::load(&registry_file).expect("reload");
    assert_eq!(reloaded.projects.len(), 1);
    assert_eq!(reloaded.active_id.as_deref(), Some(project.id.as_str()));
    let stored = &reloaded.projects[0];
    assert_eq!(stored.name, "my-repo");
    assert_eq!(stored.path, repo.canonicalize().expect("canonicalize"));
    assert!(stored.last_opened_at.is_some());
}

#[test]
fn add_rejects_a_missing_directory() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut registry = ProjectRegistry::default();
    assert!(matches!(
        registry.add(&dir.path().join("absent")),
        Err(RegistryError::NotADirectory { .. })
    ));
}

#[test]
fn add_rejects_a_directory_without_git() {
    let dir = tempfile::tempdir().expect("tempdir");
    let plain = dir.path().join("plain");
    std::fs::create_dir(&plain).expect("create dir");
    let mut registry = ProjectRegistry::default();
    assert!(matches!(
        registry.add(&plain),
        Err(RegistryError::NotAGitRepository { .. })
    ));
}

#[test]
fn add_accepts_a_worktree_style_git_file() {
    let dir = tempfile::tempdir().expect("tempdir");
    let worktree = dir.path().join("worktree");
    std::fs::create_dir(&worktree).expect("create dir");
    std::fs::write(worktree.join(".git"), "gitdir: /elsewhere").expect("write .git file");
    let mut registry = ProjectRegistry::default();
    registry
        .add(&worktree)
        .expect("worktree-style repo is valid");
}

#[test]
fn add_deduplicates_by_canonical_path() {
    let dir = tempfile::tempdir().expect("tempdir");
    let repo = git_repo(dir.path(), "repo");
    let mut registry = ProjectRegistry::default();
    let first = registry.add(&repo).expect("first add");
    let second = registry.add(&repo).expect("second add");
    assert_eq!(first.id, second.id);
    assert_eq!(registry.projects.len(), 1);
}

#[test]
fn select_sets_active_and_stamps_last_opened() {
    let (_dir, mut registry, project) = seeded_registry();
    assert!(project.last_opened_at.is_none());

    let stamp = chrono::Utc::now();
    let selected = registry.select(&project.id, stamp).expect("select");
    assert_eq!(selected.last_opened_at, Some(stamp));
    assert_eq!(registry.active_id.as_deref(), Some(project.id.as_str()));
    assert_eq!(
        registry.active().map(|p| p.id.as_str()),
        Some(project.id.as_str())
    );
}

#[test]
fn select_rejects_an_unknown_id() {
    let mut registry = ProjectRegistry::default();
    assert!(matches!(
        registry.select("nope", chrono::Utc::now()),
        Err(RegistryError::UnknownProject { .. })
    ));
}

#[test]
fn remove_drops_an_inactive_project() {
    let dir = tempfile::tempdir().expect("tempdir");
    let repo_a = git_repo(dir.path(), "a");
    let repo_b = git_repo(dir.path(), "b");
    let mut registry = ProjectRegistry::default();
    let a = registry.add(&repo_a).expect("add a");
    let b = registry.add(&repo_b).expect("add b");
    registry
        .select(&a.id, chrono::Utc::now())
        .expect("select a");

    registry.remove(&b.id).expect("remove inactive");
    assert_eq!(registry.projects.len(), 1);
    assert_eq!(registry.projects[0].id, a.id);
}

#[test]
fn remove_refuses_the_active_project() {
    let (_dir, mut registry, project) = seeded_registry();
    registry
        .select(&project.id, chrono::Utc::now())
        .expect("select");
    assert!(matches!(
        registry.remove(&project.id),
        Err(RegistryError::RemoveActive)
    ));
}

#[test]
fn remove_rejects_an_unknown_id() {
    let mut registry = ProjectRegistry::default();
    assert!(matches!(
        registry.remove("nope"),
        Err(RegistryError::UnknownProject { .. })
    ));
}

#[test]
fn set_linear_api_key_trims_clears_and_persists() {
    let (dir, mut registry, project) = seeded_registry();
    let registry_file = dir.path().join("projects.json");

    let updated = registry
        .set_linear_api_key(&project.id, Some("  lin_api_123  ".into()))
        .expect("set key");
    assert_eq!(updated.linear_api_key.as_deref(), Some("lin_api_123"));

    registry.save(&registry_file).expect("save");
    let reloaded = ProjectRegistry::load(&registry_file).expect("reload");
    assert_eq!(
        reloaded.projects[0].linear_api_key.as_deref(),
        Some("lin_api_123")
    );

    let cleared = registry
        .set_linear_api_key(&project.id, Some("   ".into()))
        .expect("blank clears");
    assert!(cleared.linear_api_key.is_none());
}

#[test]
fn set_linear_api_key_rejects_an_unknown_id() {
    let mut registry = ProjectRegistry::default();
    assert!(matches!(
        registry.set_linear_api_key("nope", None),
        Err(RegistryError::UnknownProject { .. })
    ));
}

#[test]
fn set_attention_count_persists_across_reload() {
    let (dir, mut registry, project) = seeded_registry();
    let registry_file = dir.path().join("projects.json");
    assert_eq!(project.attention_count, 0);

    let changed = registry
        .set_attention_count(&project.id, 3)
        .expect("set count");
    assert!(changed);

    registry.save(&registry_file).expect("save");
    let reloaded = ProjectRegistry::load(&registry_file).expect("reload");
    assert_eq!(reloaded.projects[0].attention_count, 3);
}

#[test]
fn set_attention_count_reports_unchanged_value() {
    let (_dir, mut registry, project) = seeded_registry();

    assert!(
        !registry
            .set_attention_count(&project.id, 0)
            .expect("same value")
    );
    assert!(
        registry
            .set_attention_count(&project.id, 2)
            .expect("new value")
    );
    assert!(
        !registry
            .set_attention_count(&project.id, 2)
            .expect("same value again")
    );
}

#[test]
fn set_attention_count_rejects_an_unknown_id() {
    let mut registry = ProjectRegistry::default();
    assert!(matches!(
        registry.set_attention_count("nope", 1),
        Err(RegistryError::UnknownProject { .. })
    ));
}

#[test]
fn registry_without_attention_count_field_loads_with_zero() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("projects.json");
    std::fs::write(&path, LEGACY_REGISTRY_JSON).expect("write legacy registry");
    let registry = ProjectRegistry::load(&path).expect("load legacy file");
    assert_eq!(registry.projects[0].attention_count, 0);
}

#[test]
fn registry_without_linear_key_field_still_loads() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("projects.json");
    std::fs::write(&path, LEGACY_REGISTRY_JSON).expect("write legacy registry");
    let registry = ProjectRegistry::load(&path).expect("load legacy file");
    assert!(registry.projects[0].linear_api_key.is_none());
}

#[test]
fn save_is_atomic_enough_to_leave_no_temp_file() {
    let dir = tempfile::tempdir().expect("tempdir");
    let registry_file = dir.path().join("projects.json");
    ProjectRegistry::default()
        .save(&registry_file)
        .expect("save");
    assert!(registry_file.exists());
    assert!(!registry_file.with_extension("json.tmp").exists());
}
