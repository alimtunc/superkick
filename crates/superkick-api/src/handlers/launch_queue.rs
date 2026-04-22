//! Launch-queue HTTP surface — SUP-80.
//!
//! - `GET /launch-queue` returns a derived snapshot grouping every tracked
//!   Linear issue and every live-or-recent Superkick run into one of eight
//!   buckets (`launchable`, `waiting-capacity`, `waiting-approval`,
//!   `blocked`, `active`, `needs-human`, `in-pr`, `done`) with a
//!   human-readable `reason` per item.
//! - `POST /launch-queue/{issue_identifier}/dispatch` is a thin wrapper
//!   around the shared spawn path in `handlers::runs`. It does not
//!   duplicate the duplicate-run guard or the spawn wiring; it exists so
//!   the operator can hit "Dispatch" on a `launchable` card without
//!   assembling a `CreateRunRequest` body manually.
//!
//! Submodules:
//! - [`wire`] — response types (serialization contract only).
//! - [`routes`] — axum handlers (`get_queue`, `dispatch_from_queue`).
//! - [`merge`] — projects the pure `LaunchQueueClassification` onto the
//!   wire buckets.

mod merge;
mod routes;
mod wire;

pub use routes::{dispatch_from_queue, get_queue};
