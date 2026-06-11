use axum::response::sse::{Event, KeepAlive, Sse};
use futures_util::Stream;
use serde::Serialize;
use tokio::sync::broadcast::Receiver;
use tokio::sync::broadcast::error::RecvError;

use superkick_core::{Run, RunId};
use superkick_storage::repo::RunRepo;

use crate::AppState;
use crate::error::AppError;

pub mod agents;
pub mod attention;
pub mod config;
pub mod conversations;
pub mod dashboard;
pub mod events;
pub mod health;
pub mod interrupts;
pub mod issue_context;
pub mod issues;
pub mod launch_profiles;
pub mod launch_queue;
pub mod launch_tasks;
pub mod linear_options;
pub mod me;
pub mod orchestrator_sessions;
pub mod ownership;
pub mod provider_settings;
pub mod runs;
pub mod runtimes;
pub mod search;
pub mod sessions;
pub mod skills;
pub mod snapshots;
pub mod terminal;
pub mod terminal_takeover;

pub(crate) async fn require_run(state: &AppState, run_id: RunId) -> Result<Run, AppError> {
    state
        .run_repo
        .get(run_id)
        .await?
        .ok_or(AppError::NotFound("run not found"))
}

/// Pump a broadcast receiver into an SSE stream: each event serialises to a
/// named SSE event, serialisation failures emit `error` and continue, lag
/// emits `lagged` (the persisted audit tables stay authoritative), and a
/// closed bus emits `done` then ends the stream.
pub(crate) fn broadcast_sse<T>(
    mut rx: Receiver<T>,
    event_name: &'static str,
    keep: impl Fn(&T) -> bool + Send + 'static,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>
where
    T: Serialize + Clone + Send + 'static,
{
    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    if !keep(&event) {
                        continue;
                    }
                    let data = match serde_json::to_string(&event) {
                        Ok(d) => d,
                        Err(e) => {
                            yield Ok::<Event, std::convert::Infallible>(
                                Event::default().event("error").data(e.to_string())
                            );
                            continue;
                        }
                    };
                    yield Ok(Event::default().event(event_name).data(data));
                }
                Err(RecvError::Lagged(skipped)) => {
                    yield Ok(
                        Event::default()
                            .event("lagged")
                            .data(skipped.to_string()),
                    );
                }
                Err(RecvError::Closed) => {
                    yield Ok(Event::default().event("done").data("bus closed"));
                    break;
                }
            }
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default())
}
