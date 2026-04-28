//! Runtime registry — machines that can execute agent work + the CLI providers
//! detected on each one (SUP-96).
//!
//! V1 only ever materialises a single `local` runtime, but the model is shaped
//! for future remote runtimes (SSH/HTTP) and additional providers, so the
//! storage and wire formats already accept N runtimes × N providers. The
//! registry is informational: it does not gate run scheduling. The supervisor
//! still resolves providers via `AgentCatalog`; we simply give the operator a
//! truthful view of what is actually installed and which capabilities each
//! provider exposes.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;
use crate::id::{RuntimeId, RuntimeProviderId};

/// How a runtime is reachable. Local runtimes execute on the same host as the
/// API; remote runtimes are reserved for future SSH/HTTP-driven hosts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeMode {
    Local,
    Remote,
}

/// Liveness of a runtime as a whole. `Online` means the most recent detection
/// succeeded; `Offline` means the runtime was reachable in the past but is
/// currently unreachable; `Degraded` means partially reachable (e.g. detection
/// succeeded but no providers were found).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeStatus {
    Online,
    Offline,
    Degraded,
}

/// State of one provider on a given runtime.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderStatus {
    /// Detected on PATH, version captured if printable.
    Available,
    /// Was detected previously but is not on PATH right now.
    Unavailable,
    /// Detected, but the cached row is older than the staleness threshold.
    Stale,
}

/// Capability flags a provider exposes on a given runtime. Hard-coded per
/// provider in V1 (see `superkick_runtime::detector::capabilities_for`); a
/// later iteration may probe the CLI to discover these dynamically.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeCapabilities {
    pub supports_pty: bool,
    pub supports_protocol: bool,
    pub supports_resume: bool,
    pub supports_mcp_config: bool,
    pub supports_structured_tools: bool,
    pub supports_usage: bool,
}

/// One executable runtime — V1 always has exactly one, the local machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Runtime {
    pub id: RuntimeId,
    pub name: String,
    pub mode: RuntimeMode,
    pub status: RuntimeStatus,
    /// Hostname or operator-friendly label (e.g. `alimtunc-mbp`).
    pub host_label: Option<String>,
    /// Operating system family, e.g. `darwin`, `linux`. Mirrors `std::env::consts::OS`.
    pub platform: Option<String>,
    /// CPU architecture, e.g. `aarch64`, `x86_64`. Mirrors `std::env::consts::ARCH`.
    pub arch: Option<String>,
    /// Last time detection landed for this runtime (any provider). `None` for
    /// freshly created rows that have never been refreshed.
    pub last_seen_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// One CLI installation on a runtime. The `(runtime_id, kind)` pair is unique:
/// detection upserts on it so re-running detection updates the existing row in
/// place rather than accumulating duplicates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeProvider {
    pub id: RuntimeProviderId,
    pub runtime_id: RuntimeId,
    pub kind: AgentProvider,
    pub executable_path: Option<String>,
    pub version: Option<String>,
    pub status: ProviderStatus,
    pub capabilities: RuntimeCapabilities,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// API-friendly bundle of a runtime with its providers nested. The HTTP layer
/// returns `Vec<RuntimeWithProviders>`; storage returns the two halves
/// separately so callers can compose without an extra round-trip.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeWithProviders {
    #[serde(flatten)]
    pub runtime: Runtime,
    pub providers: Vec<RuntimeProvider>,
}

/// Canonical name of the V1 local runtime. `ensure_local` looks this up to
/// guarantee idempotence across boots — exposed publicly so the storage layer
/// and tests agree on the lookup key.
pub const LOCAL_RUNTIME_NAME: &str = "Local";
