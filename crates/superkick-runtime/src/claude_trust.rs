//! Pre-seed Claude Code's per-project trust so a freshly-created run worktree
//! does not open the blocking "Is this a project you trust?" modal on first
//! launch. That modal paints before the composer and swallows the supervisor's
//! injected opening prompt — its Enter confirms the modal instead of submitting
//! the directive, leaving the prompt sitting unsent (SUP-66).

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde_json::{Map, Value};
use tracing::warn;

/// Best-effort: mark `workdir` as a trusted project in Claude's config so the
/// interactive TUI skips its trust/onboarding modal. Idempotent — a no-op once
/// the path is already trusted. Failures are logged and swallowed; the run
/// proceeds (an operator can dismiss the modal manually).
pub(crate) fn ensure_claude_trusts(workdir: &Path) {
    if let Err(err) = seed(workdir) {
        warn!(
            workdir = %workdir.display(),
            error = %err,
            "failed to pre-seed Claude trust for worktree; the trust modal may swallow the opening prompt"
        );
    }
}

/// `~/.claude.json`, or `$CLAUDE_CONFIG_DIR/.claude.json` when that override is set.
fn config_path() -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("CLAUDE_CONFIG_DIR") {
        return Ok(Path::new(&dir).join(".claude.json"));
    }
    let home = std::env::var("HOME").context("HOME not set")?;
    Ok(Path::new(&home).join(".claude.json"))
}

fn seed(workdir: &Path) -> Result<()> {
    seed_at(&config_path()?, workdir)
}

fn seed_at(path: &Path, workdir: &Path) -> Result<()> {
    let key = workdir
        .canonicalize()
        .unwrap_or_else(|_| workdir.to_path_buf())
        .to_string_lossy()
        .into_owned();

    let mut root: Value = match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).context("parse claude config")?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Value::Object(Map::new()),
        Err(e) => return Err(e).context("read claude config"),
    };

    let projects = root
        .as_object_mut()
        .context("claude config is not a JSON object")?
        .entry("projects")
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .context("`projects` is not a JSON object")?;
    let entry = projects
        .entry(key)
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .context("project entry is not a JSON object")?;

    // Already trusted: leave the file untouched so we never race Claude's own
    // writes for a session that has no modal to skip.
    if entry.get("hasTrustDialogAccepted").and_then(Value::as_bool) == Some(true) {
        return Ok(());
    }
    entry.insert("hasTrustDialogAccepted".into(), Value::Bool(true));
    entry.insert("hasCompletedProjectOnboarding".into(), Value::Bool(true));
    entry
        .entry("projectOnboardingSeenCount")
        .or_insert_with(|| Value::from(1));

    let tmp = path.with_file_name(format!(
        "{}.superkick-tmp",
        path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(".claude.json")
    ));
    let serialized = serde_json::to_string_pretty(&root).context("serialize claude config")?;
    std::fs::write(&tmp, serialized).context("write temp claude config")?;
    std::fs::rename(&tmp, path).context("atomically replace claude config")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeds_trust_for_a_fresh_path_and_is_idempotent() {
        let dir = tempfile::tempdir().expect("tmp");
        let path = dir.path().join(".claude.json");
        let workdir = dir.path().join(".worktrees/sup-66");
        std::fs::create_dir_all(&workdir).expect("mkdir worktree");
        let key = workdir
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned();

        seed_at(&path, &workdir).expect("seed");
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            v["projects"][&key]["hasTrustDialogAccepted"],
            Value::Bool(true)
        );

        // Second call is a no-op and must not corrupt the file.
        seed_at(&path, &workdir).expect("seed idempotent");
        let v2: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(v, v2);
    }

    #[test]
    fn preserves_existing_unrelated_config() {
        let dir = tempfile::tempdir().expect("tmp");
        let path = dir.path().join(".claude.json");
        std::fs::write(
            &path,
            r#"{"oauthAccount":{"keep":"me"},"projects":{"/other":{"hasTrustDialogAccepted":true}}}"#,
        )
        .unwrap();

        let workdir = dir.path().join("wt");
        std::fs::create_dir_all(&workdir).expect("mkdir");
        seed_at(&path, &workdir).expect("seed");

        let v: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(v["oauthAccount"]["keep"], "me");
        assert_eq!(
            v["projects"]["/other"]["hasTrustDialogAccepted"],
            Value::Bool(true)
        );
    }
}
