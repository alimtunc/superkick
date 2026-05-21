//! SUP-137 — runner-availability probe shared between the V1 release
//! validation harness and any future "is this machine ready to ship?" CLI
//! command.
//!
//! Kept out of `cfg(test)` deliberately: the same logic that decides whether
//! `cargo test … --test release_validation -- --ignored` should *run* the
//! happy path or skip it is also what an operator-facing diagnostic command
//! would want to print. One definition, two callers.

use std::path::PathBuf;

use superkick_core::AgentProvider;

/// Verdict from probing one agent provider's CLI on the local machine.
#[derive(Debug, Clone)]
pub enum RunnerAvailability {
    /// Binary is on `PATH` and reported a version. The harness can launch
    /// it for the happy-path / cancel / retry scenarios.
    Available {
        executable: PathBuf,
        version: Option<String>,
    },
    /// The binary is missing from `PATH`. The release-validation harness
    /// skips the real-CLI scenarios with an explanatory log; the failure-
    /// mode scenarios (which deliberately stub the CLI) still run.
    Missing,
}

impl RunnerAvailability {
    /// `true` when the harness can launch the provider's CLI; `false` when
    /// it must skip the scenarios that need a live spawn.
    pub fn is_available(&self) -> bool {
        matches!(self, Self::Available { .. })
    }

    /// Operator-readable one-liner. Mirrors the shape `detector::capabilities_for`
    /// reports so the release-check summary and the runtime tab line up.
    pub fn describe(&self, provider: AgentProvider) -> String {
        match self {
            Self::Available {
                executable,
                version,
            } => {
                let suffix = match version {
                    Some(v) => format!(" ({v})"),
                    None => String::new(),
                };
                format!("{provider}: available at {}{suffix}", executable.display())
            }
            Self::Missing => format!("{provider}: CLI not found on PATH"),
        }
    }
}

/// Synchronously probe whether `provider`'s CLI is reachable on `PATH`.
///
/// Intentionally synchronous: the only operations are `which::which` (a fast
/// path lookup) and an optional `--version` spawn. Callers that want to fan
/// this out can wrap it in `tokio::task::spawn_blocking`; the harness calls
/// it once per provider before any task scheduling so the cost is negligible.
pub fn runner_available(provider: AgentProvider) -> RunnerAvailability {
    let binary = provider_executable(provider);
    let Ok(path) = which::which(binary) else {
        return RunnerAvailability::Missing;
    };

    let version = probe_version_blocking(&path);
    RunnerAvailability::Available {
        executable: path,
        version,
    }
}

/// Same mapping `detector::provider_executable` uses, lifted here so this
/// module doesn't depend on the detector's private surface.
fn provider_executable(provider: AgentProvider) -> &'static str {
    match provider {
        AgentProvider::Claude => "claude",
        AgentProvider::Codex => "codex",
    }
}

fn probe_version_blocking(path: &std::path::Path) -> Option<String> {
    let output = std::process::Command::new(path)
        .arg("--version")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        None
    } else {
        Some(stdout)
    }
}

/// Parse the `SUPERKICK_RELEASE_RUNNERS` env into the matrix the harness
/// will exercise. Defaults to `codex,claude`. Unknown tokens are ignored
/// with a stderr warning rather than treated as a hard failure — operators
/// can add new providers without breaking older test binaries.
pub fn requested_runners(raw: Option<&str>) -> Vec<AgentProvider> {
    let raw = raw.unwrap_or("codex,claude");
    let mut out = Vec::new();
    for token in raw.split(',') {
        let token = token.trim();
        if token.is_empty() {
            continue;
        }
        match token.to_ascii_lowercase().as_str() {
            "codex" => out.push(AgentProvider::Codex),
            "claude" => out.push(AgentProvider::Claude),
            other => eprintln!("skip: unknown runner '{other}' in SUPERKICK_RELEASE_RUNNERS"),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requested_runners_defaults_to_both_providers() {
        let runners = requested_runners(None);
        assert!(runners.contains(&AgentProvider::Codex));
        assert!(runners.contains(&AgentProvider::Claude));
    }

    #[test]
    fn requested_runners_accepts_comma_separated_tokens() {
        let runners = requested_runners(Some("claude"));
        assert_eq!(runners, vec![AgentProvider::Claude]);
    }

    #[test]
    fn requested_runners_ignores_unknown_tokens() {
        let runners = requested_runners(Some("codex,bogus,claude"));
        assert_eq!(
            runners,
            vec![AgentProvider::Codex, AgentProvider::Claude],
            "unknown tokens warn and skip"
        );
    }

    #[test]
    fn requested_runners_handles_empty_segments() {
        let runners = requested_runners(Some(",, claude ,"));
        assert_eq!(runners, vec![AgentProvider::Claude]);
    }

    #[test]
    fn missing_runner_describes_clearly() {
        let v = RunnerAvailability::Missing;
        assert!(!v.is_available());
        let line = v.describe(AgentProvider::Claude);
        assert!(line.contains("CLI not found"));
    }
}
