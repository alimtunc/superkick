//! Broadcast bus for `LaunchTask` execution events (SUP-118).
//!
//! Mirrors `WorkspaceEventBus` but is kept parallel rather than folded into the
//! workspace bus so the launch-task fan-out has its own back-pressure budget.
//! Subscribers (the SSE feed at `GET /launch-tasks/events`, future watchers)
//! see every step transition without serialising on the run-event traffic.
//!
//! Persistence remains authoritative: every transition written here is also
//! persisted via `LaunchTaskRepo`. The bus is best-effort live fan-out, never
//! a source of truth — on `Lagged` the consumer reconciles by refetching the
//! affected task from the repo.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tracing::{debug, trace};

use chrono::{DateTime, Utc};

use superkick_core::{
    FailureClassification, LaunchStepKind, LaunchTaskId, LaunchTaskInterventionId,
    LaunchTaskStatus, LaunchTaskStepId, LaunchTaskStepStatus, MemoryEntryId, RunId, RunState,
};

const BUS_CAPACITY: usize = 1024;

/// One observable transition in a launch task's lifecycle. Carries the
/// `linear_issue_id` redundantly so consumers can filter without joining
/// against the launch_tasks table.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LaunchTaskEvent {
    StepStarted {
        task_id: LaunchTaskId,
        linear_issue_id: String,
        step_id: LaunchTaskStepId,
        step_kind: LaunchStepKind,
        agent_name: String,
        sequence: u32,
    },
    StepFinished {
        task_id: LaunchTaskId,
        linear_issue_id: String,
        step_id: LaunchTaskStepId,
        step_kind: LaunchStepKind,
        status: LaunchTaskStepStatus,
        summary: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        failure_classification: Option<FailureClassification>,
        /// Empty on non-success paths; lets clients correlate the event
        /// with rows in the workspace memory panel.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        memory_entry_ids: Vec<MemoryEntryId>,
    },
    TaskStatusChanged {
        task_id: LaunchTaskId,
        linear_issue_id: String,
        status: LaunchTaskStatus,
        current_step_id: Option<LaunchTaskStepId>,
        reason: Option<String>,
    },
    /// Shadow `Run` state transition for a Launch Task. Shadow runs change
    /// state via direct field writes that bypass the workspace event bus, so
    /// without this variant the front-end never learns that `linked_runs` on
    /// the issue (and the `/runs/<id>` detail) need to refetch between the
    /// `StepStarted`/`StepFinished` pulses.
    ShadowRunStateChanged {
        task_id: LaunchTaskId,
        linear_issue_id: String,
        run_id: RunId,
        state: RunState,
    },
    /// SUP-154 — operator left a free-text intervention for the task.
    /// Published from the POST handler so the feed updates without polling.
    InterventionAdded {
        task_id: LaunchTaskId,
        linear_issue_id: String,
        intervention_id: LaunchTaskInterventionId,
        target_step_id: Option<LaunchTaskStepId>,
        body: String,
        created_at: DateTime<Utc>,
    },
    /// SUP-154 — an intervention was just injected into a step's prompt and
    /// stamped consumed. Published from the runtime at step-start.
    InterventionConsumed {
        task_id: LaunchTaskId,
        linear_issue_id: String,
        intervention_id: LaunchTaskInterventionId,
        step_id: LaunchTaskStepId,
        consumed_at: DateTime<Utc>,
    },
}

impl LaunchTaskEvent {
    pub fn task_id(&self) -> LaunchTaskId {
        match self {
            Self::StepStarted { task_id, .. }
            | Self::StepFinished { task_id, .. }
            | Self::TaskStatusChanged { task_id, .. }
            | Self::ShadowRunStateChanged { task_id, .. }
            | Self::InterventionAdded { task_id, .. }
            | Self::InterventionConsumed { task_id, .. } => *task_id,
        }
    }

    pub fn linear_issue_id(&self) -> &str {
        match self {
            Self::StepStarted {
                linear_issue_id, ..
            }
            | Self::StepFinished {
                linear_issue_id, ..
            }
            | Self::TaskStatusChanged {
                linear_issue_id, ..
            }
            | Self::ShadowRunStateChanged {
                linear_issue_id, ..
            }
            | Self::InterventionAdded {
                linear_issue_id, ..
            }
            | Self::InterventionConsumed {
                linear_issue_id, ..
            } => linear_issue_id,
        }
    }
}

/// Process-scope broadcast bus. Cheap to clone — holds a single `Sender`
/// inside an `Arc`. Callers keep an `Arc<LaunchTaskEventBus>` and hand out
/// receivers on demand.
pub struct LaunchTaskEventBus {
    tx: broadcast::Sender<LaunchTaskEvent>,
}

impl LaunchTaskEventBus {
    pub fn new() -> Arc<Self> {
        let (tx, _) = broadcast::channel(BUS_CAPACITY);
        Arc::new(Self { tx })
    }

    pub fn publish(&self, event: LaunchTaskEvent) {
        match self.tx.send(event) {
            Ok(n) => trace!(subscribers = n, "launch task event published"),
            Err(_) => debug!("launch task event published with no subscribers"),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<LaunchTaskEvent> {
        self.tx.subscribe()
    }

    pub fn subscriber_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step_started_event() -> LaunchTaskEvent {
        LaunchTaskEvent::StepStarted {
            task_id: LaunchTaskId::new(),
            linear_issue_id: "TEAM-1".into(),
            step_id: LaunchTaskStepId::new(),
            step_kind: LaunchStepKind::Plan,
            agent_name: "planner".into(),
            sequence: 1,
        }
    }

    #[tokio::test]
    async fn subscriber_receives_published_events() {
        let bus = LaunchTaskEventBus::new();
        let mut rx = bus.subscribe();
        bus.publish(step_started_event());
        let got = rx.recv().await.unwrap();
        assert_eq!(got.linear_issue_id(), "TEAM-1");
    }

    #[tokio::test]
    async fn publish_without_subscribers_is_noop() {
        let bus = LaunchTaskEventBus::new();
        bus.publish(step_started_event());
        assert_eq!(bus.subscriber_count(), 0);
    }

    #[tokio::test]
    async fn multiple_subscribers_each_get_events() {
        let bus = LaunchTaskEventBus::new();
        let mut a = bus.subscribe();
        let mut b = bus.subscribe();
        let event = step_started_event();
        let task_id = event.task_id();
        bus.publish(event);
        assert_eq!(a.recv().await.unwrap().task_id(), task_id);
        assert_eq!(b.recv().await.unwrap().task_id(), task_id);
    }
}
