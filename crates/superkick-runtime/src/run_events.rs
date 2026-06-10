//! Best-effort run-event ledger writes shared by every runtime service.
//! Failures are logged, never propagated — a dropped audit event must not
//! block the domain transition that produced it.

use tracing::warn;

use superkick_core::{EventKind, EventLevel, RunEvent, RunId, StepId};
use superkick_storage::repo::RunEventRepo;

pub(crate) async fn emit_event<E: RunEventRepo>(
    repo: &E,
    run_id: RunId,
    step_id: Option<StepId>,
    kind: EventKind,
    level: EventLevel,
    message: String,
) {
    let event = RunEvent::new(run_id, step_id, kind, level, message);
    emit_built_event(repo, &event, "run").await;
}

/// Insert a pre-built run event, folding `log_subject` into the failure log so
/// readers can tell which emitter dropped an event (`attention`, `ownership`, …).
pub(crate) async fn emit_built_event<E: RunEventRepo>(
    repo: &E,
    event: &RunEvent,
    log_subject: &str,
) {
    if let Err(e) = repo.insert(event).await {
        warn!("failed to emit {log_subject} event: {e}");
    }
}
