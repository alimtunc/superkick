//! Runtime detector — discovers which agent provider CLIs are installed on the
//! local machine and writes the result into the runtime registry (SUP-96).
//!
//! V1 surface:
//! - `RuntimeDetector::detect_local` calls `ensure_local()` to obtain the V1
//!   local runtime row, probes each known `AgentProvider` on PATH, and upserts
//!   one `runtime_provider` row per provider with status / version / hard-coded
//!   capabilities.
//! - `capabilities_for` is the V1 lookup table. It's intentionally hard-coded
//!   per provider rather than probed, because the upstream CLIs do not expose a
//!   structured capability manifest yet. When they do, replace the body with a
//!   real probe and keep the public signature stable.
//!
//! Detection is informational: the agent supervisor still resolves providers
//! through `AgentCatalog`. A provider returning `Unavailable` does NOT cancel
//! in-flight runs — the registry is the operator's view of the install, not a
//! gate.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use futures_util::future::join_all;
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::task::spawn_blocking;
use tokio::time::timeout;
use tracing::{debug, warn};

use superkick_core::{AgentProvider, ProviderStatus, RuntimeCapabilities, RuntimeWithProviders};
use superkick_storage::{ProviderUpsert, SqliteRuntimeRepo};

/// Hard upper bound on how long we wait for `<cli> --version` before giving up.
/// A hung CLI shouldn't block the boot or the operator's "Refresh" click.
const VERSION_PROBE_TIMEOUT: Duration = Duration::from_secs(3);

/// Detects local-runtime providers and writes the result into the registry.
///
/// `serial` is shared across calls so `POST /runtimes/refresh` can serialise
/// concurrent operator clicks without race-on-upsert. Holders past the API
/// boundary should reuse the same `Arc<Mutex<()>>`.
pub struct RuntimeDetector {
    repo: Arc<SqliteRuntimeRepo>,
    serial: Arc<Mutex<()>>,
}

impl RuntimeDetector {
    pub fn new(repo: Arc<SqliteRuntimeRepo>) -> Self {
        Self {
            repo,
            serial: Arc::new(Mutex::new(())),
        }
    }

    /// Run a full detection cycle and return the canonical inventory snapshot.
    /// Serialises against concurrent callers via the internal mutex, so two
    /// "Refresh" clicks won't race on upserts.
    pub async fn detect_local(&self) -> Result<RuntimeWithProviders> {
        let _guard = self.serial.lock().await;
        self.detect_local_inner().await
    }

    /// Try to run a detection cycle without blocking. Returns `Ok(None)` when
    /// another detection is already in flight — the caller should surface this
    /// as 503 / "busy" rather than queueing.
    pub async fn try_detect_local(&self) -> Result<Option<RuntimeWithProviders>> {
        let Ok(_guard) = self.serial.try_lock() else {
            return Ok(None);
        };
        Ok(Some(self.detect_local_inner().await?))
    }

    async fn detect_local_inner(&self) -> Result<RuntimeWithProviders> {
        let host = hostname().await;
        let mut runtime = self
            .repo
            .ensure_local(
                host.as_deref(),
                Some(std::env::consts::OS),
                Some(std::env::consts::ARCH),
            )
            .await
            .context("ensure local runtime")?;

        // Probe providers concurrently — a hung CLI on one shouldn't block the
        // other, and the per-probe timeout caps total wall time.
        let detections = join_all(KNOWN_PROVIDERS.iter().map(|p| detect_provider(*p))).await;

        let mut providers = Vec::with_capacity(detections.len());
        for (provider, detected) in KNOWN_PROVIDERS.iter().zip(detections) {
            let saved = self
                .repo
                .upsert_provider(
                    runtime.id,
                    ProviderUpsert {
                        kind: *provider,
                        executable_path: detected.executable_path.as_deref(),
                        version: detected.version.as_deref(),
                        status: detected.status,
                        capabilities: capabilities_for(*provider),
                        seen_at: detected.last_seen_at,
                    },
                )
                .await
                .with_context(|| format!("upsert provider {provider}"))?;
            providers.push(saved);
        }

        let now = Utc::now();
        self.repo
            .touch_seen(runtime.id, now)
            .await
            .context("touch local runtime last_seen_at")?;
        runtime.last_seen_at = Some(now);
        runtime.updated_at = now;

        Ok(RuntimeWithProviders { runtime, providers })
    }

    /// Read the current snapshot without re-running detection.
    pub async fn read_snapshot(&self) -> Result<Vec<RuntimeWithProviders>> {
        let runtimes = self.repo.list_all().await.context("list runtimes")?;
        let mut out = Vec::with_capacity(runtimes.len());
        for runtime in runtimes {
            let providers = self
                .repo
                .list_providers(runtime.id)
                .await
                .context("list runtime providers")?;
            out.push(RuntimeWithProviders { runtime, providers });
        }
        Ok(out)
    }
}

/// Best-effort boot-time refresh. Logs and continues on failure so a hung CLI
/// can't block the API from coming up.
pub async fn boot_refresh(detector: &RuntimeDetector) {
    if let Err(err) = detector.detect_local().await {
        warn!("initial runtime detection failed: {err:#}");
    }
}

/// Providers we currently know how to launch. Adding a new provider only
/// requires extending this list and `capabilities_for`.
const KNOWN_PROVIDERS: &[AgentProvider] = &[AgentProvider::Claude, AgentProvider::Codex];

/// V1 capability table. Hard-coded because the upstream CLIs don't expose a
/// machine-readable capability manifest yet — replace this with a real probe
/// when they do, but keep the function signature stable.
pub fn capabilities_for(provider: AgentProvider) -> RuntimeCapabilities {
    match provider {
        AgentProvider::Claude => RuntimeCapabilities {
            supports_pty: true,
            supports_protocol: false,
            supports_resume: true,
            supports_mcp_config: true,
            supports_structured_tools: true,
            supports_usage: true,
        },
        AgentProvider::Codex => RuntimeCapabilities {
            supports_pty: true,
            supports_protocol: true,
            supports_resume: true,
            supports_mcp_config: false,
            supports_structured_tools: true,
            supports_usage: false,
        },
    }
}

struct Detected {
    executable_path: Option<String>,
    version: Option<String>,
    status: ProviderStatus,
    last_seen_at: Option<chrono::DateTime<Utc>>,
}

async fn detect_provider(provider: AgentProvider) -> Detected {
    let now = Utc::now();
    let bin = provider_executable(provider);

    // `which::which` walks PATH synchronously — push it off the runtime so a
    // slow filesystem doesn't stall other concurrent probes.
    let resolved: Option<PathBuf> = spawn_blocking(move || which::which(bin).ok())
        .await
        .ok()
        .flatten();

    let Some(path) = resolved else {
        return Detected {
            executable_path: None,
            version: None,
            status: ProviderStatus::Unavailable,
            last_seen_at: None,
        };
    };

    // Probe the exact resolved binary so `executable_path` and the reported
    // version always come from the same file even if PATH mutates between calls.
    let version = match probe_version(&path).await {
        Ok(v) => v,
        Err(err) => {
            debug!("version probe for {bin} failed: {err:#}");
            None
        }
    };

    Detected {
        executable_path: Some(path.to_string_lossy().into_owned()),
        version,
        status: ProviderStatus::Available,
        last_seen_at: Some(now),
    }
}

fn provider_executable(provider: AgentProvider) -> &'static str {
    match provider {
        AgentProvider::Claude => "claude",
        AgentProvider::Codex => "codex",
    }
}

async fn probe_version(path: &Path) -> Result<Option<String>> {
    let fut = Command::new(path)
        .arg("--version")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    let output = match timeout(VERSION_PROBE_TIMEOUT, fut).await {
        Ok(res) => res.with_context(|| format!("spawn `{} --version`", path.display()))?,
        Err(_) => {
            warn!(
                "`{} --version` timed out after {:?}",
                path.display(),
                VERSION_PROBE_TIMEOUT
            );
            return Ok(None);
        }
    };

    let combined = String::from_utf8_lossy(if output.stdout.is_empty() {
        &output.stderr
    } else {
        &output.stdout
    })
    .trim()
    .to_string();

    if combined.is_empty() {
        return Ok(None);
    }

    Ok(Some(extract_version(&combined)))
}

fn extract_version(raw: &str) -> String {
    // Pull out the first `MAJOR.MINOR.PATCH(-suffix)?` token if present;
    // otherwise return the trimmed first line so operators still see something
    // useful in the UI rather than `unknown`.
    static SEMVER: OnceLock<regex::Regex> = OnceLock::new();
    let re = SEMVER.get_or_init(|| {
        regex::Regex::new(r"\d+\.\d+\.\d+(?:[-+][\w.\-]+)?").expect("static semver regex compiles")
    });
    if let Some(m) = re.find(raw) {
        return m.as_str().to_string();
    }
    raw.lines().next().unwrap_or(raw).trim().to_string()
}

async fn hostname() -> Option<String> {
    if let Ok(value) = std::env::var("HOSTNAME") {
        if !value.is_empty() {
            return Some(value);
        }
    }
    if let Ok(value) = std::env::var("COMPUTERNAME") {
        if !value.is_empty() {
            return Some(value);
        }
    }
    let output = Command::new("hostname").output().await.ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() { None } else { Some(value) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_semver_from_typical_outputs() {
        assert_eq!(extract_version("claude 1.2.3"), "1.2.3");
        assert_eq!(extract_version("v0.4.1"), "0.4.1");
        assert_eq!(
            extract_version("codex version 1.0.0-beta.1"),
            "1.0.0-beta.1"
        );
    }

    #[test]
    fn falls_back_to_first_line_when_no_semver() {
        assert_eq!(extract_version("nightly-build"), "nightly-build");
        assert_eq!(extract_version("foo\nbar"), "foo");
    }

    #[test]
    fn capability_table_is_complete_for_known_providers() {
        for provider in KNOWN_PROVIDERS {
            // Just checks the match is exhaustive; will fail to compile if a
            // new variant is added without updating the table.
            let _ = capabilities_for(*provider);
        }
    }
}
