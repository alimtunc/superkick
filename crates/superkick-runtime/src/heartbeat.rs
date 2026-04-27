//! Heartbeat listener (SUP-73). Subscribes to the in-process [`SessionBus`]
//! and stamps `runs.last_heartbeat_at` for every observed lifecycle event on
//! an active run.
//!
//! The heartbeat is an *internal* derived signal — explicitly **not** an HTTP
//! endpoint — so the only thing producing it is the runtime itself. The
//! recovery scheduler reads `last_heartbeat_at` along with `updated_at` to
//! decide whether a run is healthy or stalled. Terminal runs are filtered at
//! the SQL level by `update_heartbeat`, so a late event for a finished run
//! cannot revive its heartbeat clock.

use std::sync::Arc;

use chrono::Utc;
use tokio::sync::broadcast::error::RecvError;
use tokio::task::JoinHandle;
use tracing::{debug, warn};

use superkick_storage::repo::RunRepo;

use crate::session_bus::SessionBus;

/// Spawn a background task that listens to the shared [`SessionBus`] and
/// stamps `runs.last_heartbeat_at` on every observed event.
///
/// The task lives for the life of the server; it exits cleanly when the
/// session bus closes. Errors writing the heartbeat are logged at `warn` and
/// otherwise swallowed — a missed heartbeat is non-fatal (the recovery
/// scheduler will simply pick the run up on its next tick if it stays
/// silent), and we don't want a transient sqlite error to kill the listener.
pub fn spawn_heartbeat_listener<R>(session_bus: Arc<SessionBus>, run_repo: Arc<R>) -> JoinHandle<()>
where
    R: RunRepo + 'static,
{
    tokio::spawn(async move {
        let mut rx = session_bus.subscribe();
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let run_id = event.run_id;
                    if let Err(err) = run_repo.update_heartbeat(run_id, Utc::now()).await {
                        warn!(
                            %run_id,
                            error = %err,
                            "failed to stamp run heartbeat"
                        );
                    }
                }
                Err(RecvError::Lagged(skipped)) => {
                    warn!(
                        skipped,
                        "heartbeat listener lagged; recovery scheduler will pick the run \
                         up on its next tick"
                    );
                }
                Err(RecvError::Closed) => {
                    debug!("session bus closed; heartbeat listener exiting");
                    break;
                }
            }
        }
    })
}
