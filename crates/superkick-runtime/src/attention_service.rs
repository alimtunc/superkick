//! Attention-request service — product-level coordination layer above the PTY
//! substrate. Creates structured operator asks and records structured replies.
//!
//! Distinct from `InterruptService`: attention requests do NOT transition the
//! run state or pause the step engine. They are a higher-level signal for the
//! operator/orchestrator, audited via run events and persisted against the run.

use std::sync::Arc;

use tracing::info;

use superkick_core::{
    AttentionKind, AttentionReply, AttentionRequest, AttentionRequestId, AttentionStatus,
    CoreError, EventKind, EventLevel, RunEvent, RunId, RunState,
};
use superkick_storage::repo::{AttentionRequestRepo, RunEventRepo, RunRepo};

use crate::step_engine::emit_built_event;

#[derive(Debug, thiserror::Error)]
pub enum AttentionServiceError {
    #[error("run not found")]
    RunNotFound,
    #[error("attention request not found")]
    RequestNotFound,
    #[error("attention request does not belong to run {0}")]
    WrongRun(RunId),
    #[error("cannot raise attention request on run in terminal state {0}")]
    RunTerminal(RunState),
    #[error(transparent)]
    Core(#[from] CoreError),
    #[error(transparent)]
    Storage(anyhow::Error),
}

type Result<T> = std::result::Result<T, AttentionServiceError>;

pub struct AttentionService<A, E, R> {
    attention_repo: Arc<A>,
    event_repo: Arc<E>,
    run_repo: Arc<R>,
}

impl<A, E, R> AttentionService<A, E, R>
where
    A: AttentionRequestRepo + 'static,
    E: RunEventRepo + 'static,
    R: RunRepo + 'static,
{
    pub fn new(attention_repo: Arc<A>, event_repo: Arc<E>, run_repo: Arc<R>) -> Self {
        Self {
            attention_repo,
            event_repo,
            run_repo,
        }
    }

    pub async fn create(
        &self,
        run_id: RunId,
        kind: AttentionKind,
        title: String,
        body: String,
        options: Option<Vec<String>>,
    ) -> Result<AttentionRequest> {
        let run = self
            .run_repo
            .get(run_id)
            .await
            .map_err(AttentionServiceError::Storage)?
            .ok_or(AttentionServiceError::RunNotFound)?;
        if run.state.is_terminal() {
            return Err(AttentionServiceError::RunTerminal(run.state));
        }

        let request = AttentionRequest::new(run_id, kind, title, body, options)?;
        self.attention_repo
            .insert(&request)
            .await
            .map_err(AttentionServiceError::Storage)?;

        self.emit(
            run_id,
            EventKind::AttentionRequested,
            EventLevel::Warn,
            format!(
                "attention requested ({:?}): {}",
                request.kind, request.title
            ),
            request_event_payload(&request),
        )
        .await;
        info!(
            run_id = %run_id,
            request_id = %request.id,
            kind = ?request.kind,
            "attention request created"
        );
        Ok(request)
    }

    pub async fn reply(
        &self,
        run_id: RunId,
        request_id: AttentionRequestId,
        reply: AttentionReply,
        replied_by: Option<String>,
    ) -> Result<AttentionRequest> {
        let mut request = self
            .attention_repo
            .get(request_id)
            .await
            .map_err(AttentionServiceError::Storage)?
            .ok_or(AttentionServiceError::RequestNotFound)?;
        if request.run_id != run_id {
            return Err(AttentionServiceError::WrongRun(run_id));
        }

        request.record_reply(reply, replied_by)?;
        self.attention_repo
            .update(&request)
            .await
            .map_err(AttentionServiceError::Storage)?;

        self.emit(
            run_id,
            EventKind::AttentionReplied,
            EventLevel::Info,
            format!("attention replied: {}", request.title),
            request_event_payload(&request),
        )
        .await;
        info!(
            run_id = %run_id,
            request_id = %request.id,
            "attention request replied"
        );
        Ok(request)
    }

    pub async fn cancel(
        &self,
        run_id: RunId,
        request_id: AttentionRequestId,
    ) -> Result<AttentionRequest> {
        let mut request = self
            .attention_repo
            .get(request_id)
            .await
            .map_err(AttentionServiceError::Storage)?
            .ok_or(AttentionServiceError::RequestNotFound)?;
        if request.run_id != run_id {
            return Err(AttentionServiceError::WrongRun(run_id));
        }
        if request.status != AttentionStatus::Pending {
            return Ok(request);
        }
        request.cancel();
        self.attention_repo
            .update(&request)
            .await
            .map_err(AttentionServiceError::Storage)?;

        self.emit(
            run_id,
            EventKind::AttentionCancelled,
            EventLevel::Info,
            format!("attention cancelled: {}", request.title),
            None,
        )
        .await;
        Ok(request)
    }

    async fn emit(
        &self,
        run_id: RunId,
        kind: EventKind,
        level: EventLevel,
        message: String,
        payload: Option<serde_json::Value>,
    ) {
        let mut event = RunEvent::new(run_id, None, kind, level, message);
        event.payload_json = payload;
        emit_built_event(&*self.event_repo, &event, "attention").await;
    }
}

/// Serialize an attention-request event payload, logging (rather than silently
/// dropping) a serialization failure so the lost structured body is visible.
fn request_event_payload(request: &AttentionRequest) -> Option<serde_json::Value> {
    match serde_json::to_value(request) {
        Ok(payload) => Some(payload),
        Err(e) => {
            tracing::warn!(request_id = %request.id, error = %e, "dropping attention event payload: serialization failed");
            None
        }
    }
}
