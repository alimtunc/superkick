//! Terminal takeover modes for protocol-first runs (SUP-101).
//!
//! Protocol runs (`claude stream-json`, `codex exec --json`) do not expose a
//! PTY the operator can attach to mid-turn. "Open the terminal" therefore has
//! three honest meanings, modelled here as `TakeoverMode`:
//!
//! - `Inspect` — spawn a shell in the run's worktree to look around without
//!   touching the agent. Always available.
//! - `InteractiveContinuation` — start the provider CLI in interactive mode
//!   (with `--resume <session_id>` when the adapter advertises support, no
//!   resume otherwise). Lets the operator continue the conversation from a
//!   terminal once the protocol turn finishes.
//! - `ForceTakeover` — cancel the live protocol turn first, then drop into one
//!   of the two modes above. The operator must opt in explicitly via
//!   `confirm_force: true` because it discards the in-flight turn.
//!
//! Architecture contract: see `docs/architecture/terminal-takeover.md`.

use serde::{Deserialize, Serialize};

use crate::id::TakeoverSessionId;

/// Mode passed by the operator when opening a takeover. The wire form is
/// snake-cased and tagged so the API request body reads like
/// `{ "mode": "inspect" }` or `{ "mode": "force_takeover", "sub_mode": ... }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum TakeoverMode {
    /// New shell in the run's worktree. Read-only against the agent.
    Inspect,
    /// Provider CLI in interactive mode, resuming the protocol session when
    /// the adapter supports it.
    InteractiveContinuation,
    /// Cancel the active protocol turn first, then enter the chosen sub-mode.
    ForceTakeover {
        sub_mode: ForceTakeoverSubMode,
        /// Operator must set this to `true` for the request to succeed.
        /// The API rejects anything else with 400 — there is no "default
        /// confirm" to keep the destructive nature visible.
        #[serde(default)]
        confirm_force: bool,
    },
}

/// Sub-mode entered after a force takeover cancels the active turn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ForceTakeoverSubMode {
    Inspect,
    InteractiveContinuation,
}

/// Stable kind tag, independent of the data carried by `TakeoverMode`. Used
/// for availability queries (`GET /modes`) and event payloads where we only
/// need to know *which* mode, not its parameters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TakeoverModeKind {
    Inspect,
    InteractiveContinuation,
    ForceTakeover,
}

/// How a takeover actually connected to the agent. Where [`TakeoverMode`] is
/// what the operator *asked* for, this is the honest outcome of the
/// `attach → resume → fresh` strategy — so the UI never claims a resume that
/// did not happen or an attach to a process with no PTY.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TakeoverPath {
    /// Attached to an already-live interactive PTY for the run. No new process
    /// is spawned and no context is injected — the operator joins the stream.
    Attach,
    /// Spawned the provider CLI with a resume key (`--resume`), restoring the
    /// provider-side conversation.
    Resume,
    /// Spawned a fresh interactive process, seeding it with the redacted
    /// `RunContextSnapshot` as opening context.
    Fresh,
}

impl TakeoverMode {
    /// Project a `TakeoverMode` onto its kind tag.
    pub fn kind(&self) -> TakeoverModeKind {
        match self {
            Self::Inspect => TakeoverModeKind::Inspect,
            Self::InteractiveContinuation => TakeoverModeKind::InteractiveContinuation,
            Self::ForceTakeover { .. } => TakeoverModeKind::ForceTakeover,
        }
    }
}

/// Per-mode availability snapshot returned by
/// `GET /api/runs/{id}/terminal-takeover/modes`. The UI displays these flags
/// verbatim — a mode that is unavailable carries a human-readable `reason` so
/// the operator never wonders why a button is greyed out.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TakeoverModeAvailability {
    pub mode: TakeoverModeKind,
    pub available: bool,
    /// Filled when `available` is `false`. `None` when the mode can be opened.
    pub reason: Option<String>,
    /// Whether the provider CLI accepts a resume key. Only meaningful for
    /// `InteractiveContinuation`; `false` for the two other modes (the field
    /// is still present so the UI can render a uniform row layout).
    pub resume_supported: bool,
}

/// Snapshot of an active takeover session, returned by `GET /takeovers`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveTakeover {
    pub takeover_session_id: TakeoverSessionId,
    pub mode: TakeoverModeKind,
    pub opened_at: chrono::DateTime<chrono::Utc>,
    /// Free-form operator identifier (matches `OperatorId` semantics from the
    /// ownership service). Optional so callers without a notion of operator
    /// can still log honest events.
    pub operator_id: Option<String>,
}

/// Response payload for `POST /terminal-takeover/open`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenedTakeover {
    pub takeover_session_id: TakeoverSessionId,
    pub mode: TakeoverModeKind,
    /// Which strategy actually connected the operator: attach, resume, or fresh.
    pub takeover_path: TakeoverPath,
    /// Relative WebSocket URL the UI should connect to. For `Fresh`/`Resume`
    /// this is the takeover PTY; for `Attach` it is the run's primary terminal.
    pub terminal_ws: String,
}
