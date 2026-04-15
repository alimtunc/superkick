//! Structured handoff contract for child-session coordination.
//!
//! A handoff is the only legitimate coordination channel between child agent
//! sessions and the orchestrator. It is a durable, typed artifact that moves
//! work between sessions — replacing terminal scraping, free-form chatter, and
//! implicit subprocess exit-code semantics.
//!
//! Lifecycle:
//!
//! ```text
//! Pending ─▶ Delivered ─▶ Accepted ─▶ Completed
//!                                    ├─▶ Failed    ─▶ (retry: new Handoff)
//!                                    └─▶ Escalated ─▶ (SUP-76 AttentionRequest)
//!         ─▶ Cancelled / Superseded
//! ```
//!
//! Failure, retry, and escalation are first-class: a retry is a new handoff
//! whose `parent_handoff` points at the failed one; an escalation is terminal
//! and carries the `AttentionRequestId` that was raised in SUP-76.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::artifact::ArtifactKind;
use crate::attention::AttentionKind;
use crate::error::CoreError;
use crate::id::{AgentSessionId, ArtifactId, AttentionRequestId, HandoffId, RunId, StepId};
use crate::review::ReviewFinding;

/// Kind of handoff — each kind constrains its payload shape.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HandoffKind {
    /// Produce an implementation plan for a scope.
    Plan,
    /// Apply changes for a scope — typically follows a Plan handoff.
    Implement,
    /// Review a diff against criteria.
    Review,
    /// Resolve specific findings raised by a prior Review.
    Fix,
    /// Route a failure/decision to the operator. Completes by producing an
    /// `AttentionRequestId` that callers can observe via the failure record.
    Escalate,
}

impl std::fmt::Display for HandoffKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Plan => "plan",
            Self::Implement => "implement",
            Self::Review => "review",
            Self::Fix => "fix",
            Self::Escalate => "escalate",
        };
        f.write_str(s)
    }
}

/// Lifecycle status of a handoff. See module-level doc for the diagram.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HandoffStatus {
    /// Created but no session has been spawned yet.
    Pending,
    /// A session has been spawned to fulfil this handoff.
    Delivered,
    /// The fulfilling session is `Running`.
    Accepted,
    /// Session completed successfully and produced a `HandoffResult`.
    Completed,
    /// Session failed to produce a valid result.
    Failed,
    /// Failure was routed to the operator via SUP-76. Terminal.
    Escalated,
    /// Cancelled by an operator or superseded by a replacement handoff.
    Superseded,
}

impl HandoffStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Escalated | Self::Superseded
        )
    }

    fn can_transition_to(self, target: Self) -> bool {
        use HandoffStatus::*;
        match self {
            Pending => matches!(target, Delivered | Superseded),
            Delivered => matches!(target, Accepted | Failed | Superseded),
            Accepted => matches!(target, Completed | Failed | Superseded),
            Failed => matches!(target, Escalated),
            Completed | Escalated | Superseded => false,
        }
    }
}

impl std::fmt::Display for HandoffStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Pending => "pending",
            Self::Delivered => "delivered",
            Self::Accepted => "accepted",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Escalated => "escalated",
            Self::Superseded => "superseded",
        };
        f.write_str(s)
    }
}

/// Payload body — one shape per `HandoffKind`. Validated against `kind` at
/// construction so storage only ever sees consistent rows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum HandoffPayload {
    Plan {
        scope_summary: String,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        constraints: Vec<String>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        reference_artifacts: Vec<ArtifactId>,
    },
    Implement {
        scope_summary: String,
        plan_handoff: Option<HandoffId>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        reference_artifacts: Vec<ArtifactId>,
    },
    Review {
        target_ref: String,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        criteria: Vec<String>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        reference_artifacts: Vec<ArtifactId>,
    },
    Fix {
        parent_review: HandoffId,
        findings: Vec<ReviewFinding>,
    },
    Escalate {
        reason: String,
        attention_kind: AttentionKind,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        options: Option<Vec<String>>,
    },
}

impl HandoffPayload {
    pub fn kind(&self) -> HandoffKind {
        match self {
            Self::Plan { .. } => HandoffKind::Plan,
            Self::Implement { .. } => HandoffKind::Implement,
            Self::Review { .. } => HandoffKind::Review,
            Self::Fix { .. } => HandoffKind::Fix,
            Self::Escalate { .. } => HandoffKind::Escalate,
        }
    }
}

/// Structured result produced by a child session that fulfilled a handoff.
/// Carries references to durable artifacts — never the raw terminal output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffResult {
    /// Short machine/human-readable summary.
    pub summary: String,
    /// Artifacts produced by the session.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub artifact_ids: Vec<ArtifactId>,
    /// Optional git ref the result points at (commit SHA, branch name).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub git_ref: Option<String>,
    /// Kind-specific structured payload (e.g. review findings).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured: Option<serde_json::Value>,
    /// Convenience pointer to the primary artifact kind, if applicable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primary_artifact_kind: Option<ArtifactKind>,
}

/// Failure record for a handoff that could not produce a valid result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffFailure {
    pub reason: String,
    #[serde(default)]
    pub retry_count: u32,
    /// When the failure was escalated via SUP-76, the resulting request id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub escalated_attention_id: Option<AttentionRequestId>,
}

/// A structured unit of work moving between sessions (or from the orchestrator
/// into a session).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Handoff {
    pub id: HandoffId,
    pub run_id: RunId,
    /// The run step that owns this handoff — used so the orchestrator can
    /// correlate handoffs with the step-level state machine.
    pub origin_step_id: StepId,
    /// Parent session that requested this handoff. `None` means the
    /// orchestrator itself issued it.
    pub from_session_id: Option<AgentSessionId>,
    /// The catalog role the handoff targets. Routed through `RoleRouter` at
    /// spawn time — the handoff does not carry a provider or command.
    pub to_role: String,
    /// Session spawned to fulfil this handoff. Set when the handoff moves to
    /// `Delivered`.
    pub to_session_id: Option<AgentSessionId>,
    pub kind: HandoffKind,
    pub payload: HandoffPayload,
    pub status: HandoffStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<HandoffResult>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<HandoffFailure>,
    /// The handoff this one retries or supersedes. Chain walkable for audit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_handoff: Option<HandoffId>,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivered_at: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
}

impl Handoff {
    /// Create a new handoff in the `Pending` state. Validates that the
    /// payload matches the declared kind and that required fields are
    /// non-empty.
    pub fn new(
        run_id: RunId,
        origin_step_id: StepId,
        from_session_id: Option<AgentSessionId>,
        to_role: String,
        payload: HandoffPayload,
        parent_handoff: Option<HandoffId>,
    ) -> Result<Self, CoreError> {
        if to_role.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "handoff to_role must not be empty".into(),
            ));
        }
        validate_payload(&payload)?;
        Ok(Self {
            id: HandoffId::new(),
            run_id,
            origin_step_id,
            from_session_id,
            to_role,
            to_session_id: None,
            kind: payload.kind(),
            payload,
            status: HandoffStatus::Pending,
            result: None,
            failure: None,
            parent_handoff,
            created_at: Utc::now(),
            delivered_at: None,
            completed_at: None,
        })
    }

    fn transition(&mut self, target: HandoffStatus) -> Result<(), CoreError> {
        if !self.status.can_transition_to(target) {
            return Err(CoreError::InvalidInput(format!(
                "invalid handoff transition: {} -> {}",
                self.status, target
            )));
        }
        self.status = target;
        Ok(())
    }

    /// Mark the handoff as delivered to the fulfilling session.
    pub fn mark_delivered(&mut self, to_session_id: AgentSessionId) -> Result<(), CoreError> {
        self.transition(HandoffStatus::Delivered)?;
        self.to_session_id = Some(to_session_id);
        self.delivered_at = Some(Utc::now());
        Ok(())
    }

    /// Mark the fulfilling session as accepted (running).
    pub fn mark_accepted(&mut self) -> Result<(), CoreError> {
        self.transition(HandoffStatus::Accepted)
    }

    /// Record a successful completion with a structured result.
    pub fn complete(&mut self, result: HandoffResult) -> Result<(), CoreError> {
        self.transition(HandoffStatus::Completed)?;
        self.result = Some(result);
        self.completed_at = Some(Utc::now());
        Ok(())
    }

    /// Record a terminal failure. If the orchestrator decides to retry, it
    /// creates a new handoff whose `parent_handoff` points at this one.
    pub fn fail(&mut self, failure: HandoffFailure) -> Result<(), CoreError> {
        self.transition(HandoffStatus::Failed)?;
        self.failure = Some(failure);
        self.completed_at = Some(Utc::now());
        Ok(())
    }

    /// Escalate a failed handoff to the operator via SUP-76. The
    /// `AttentionRequestId` is stored on the failure record so the
    /// orchestrator can later reconcile the operator's reply.
    pub fn escalate(&mut self, attention_id: AttentionRequestId) -> Result<(), CoreError> {
        if self.status != HandoffStatus::Failed {
            return Err(CoreError::InvalidInput(
                "only a Failed handoff may be escalated".into(),
            ));
        }
        let failure = self.failure.get_or_insert_with(|| HandoffFailure {
            reason: "escalated without explicit reason".into(),
            retry_count: 0,
            escalated_attention_id: None,
        });
        failure.escalated_attention_id = Some(attention_id);
        self.status = HandoffStatus::Escalated;
        self.completed_at = Some(Utc::now());
        Ok(())
    }

    /// Cancel a non-terminal handoff (operator abort, or superseded by a
    /// replacement).
    pub fn supersede(&mut self) -> Result<(), CoreError> {
        self.transition(HandoffStatus::Superseded)?;
        self.completed_at = Some(Utc::now());
        Ok(())
    }
}

fn validate_payload(payload: &HandoffPayload) -> Result<(), CoreError> {
    match payload {
        HandoffPayload::Plan { scope_summary, .. }
        | HandoffPayload::Implement { scope_summary, .. } => {
            if scope_summary.trim().is_empty() {
                return Err(CoreError::InvalidInput(
                    "scope_summary must not be empty".into(),
                ));
            }
        }
        HandoffPayload::Review { target_ref, .. } => {
            if target_ref.trim().is_empty() {
                return Err(CoreError::InvalidInput(
                    "review target_ref must not be empty".into(),
                ));
            }
        }
        HandoffPayload::Fix { findings, .. } => {
            if findings.is_empty() {
                return Err(CoreError::InvalidInput(
                    "fix handoff must carry at least one finding".into(),
                ));
            }
        }
        HandoffPayload::Escalate {
            reason,
            attention_kind,
            options,
        } => {
            if reason.trim().is_empty() {
                return Err(CoreError::InvalidInput(
                    "escalate reason must not be empty".into(),
                ));
            }
            if matches!(attention_kind, AttentionKind::Decision) {
                match options {
                    Some(opts) if !opts.is_empty() => {}
                    _ => {
                        return Err(CoreError::InvalidInput(
                            "decision escalation requires at least one option".into(),
                        ));
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan_payload() -> HandoffPayload {
        HandoffPayload::Plan {
            scope_summary: "plan SUP-46".into(),
            constraints: vec!["no new spawn substrate".into()],
            reference_artifacts: vec![],
        }
    }

    fn make_handoff() -> Handoff {
        Handoff::new(
            RunId::new(),
            StepId::new(),
            None,
            "planner".into(),
            plan_payload(),
            None,
        )
        .unwrap()
    }

    #[test]
    fn new_sets_kind_from_payload() {
        let h = make_handoff();
        assert_eq!(h.kind, HandoffKind::Plan);
        assert_eq!(h.status, HandoffStatus::Pending);
    }

    #[test]
    fn empty_role_rejected() {
        let err = Handoff::new(
            RunId::new(),
            StepId::new(),
            None,
            "".into(),
            plan_payload(),
            None,
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn empty_scope_summary_rejected() {
        let err = Handoff::new(
            RunId::new(),
            StepId::new(),
            None,
            "planner".into(),
            HandoffPayload::Plan {
                scope_summary: "   ".into(),
                constraints: vec![],
                reference_artifacts: vec![],
            },
            None,
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn happy_path_lifecycle() {
        let mut h = make_handoff();
        let sess = AgentSessionId::new();
        h.mark_delivered(sess).unwrap();
        assert_eq!(h.to_session_id, Some(sess));
        h.mark_accepted().unwrap();
        h.complete(HandoffResult {
            summary: "done".into(),
            artifact_ids: vec![],
            git_ref: Some("deadbeef".into()),
            structured: None,
            primary_artifact_kind: None,
        })
        .unwrap();
        assert_eq!(h.status, HandoffStatus::Completed);
        assert!(h.completed_at.is_some());
    }

    #[test]
    fn cannot_complete_from_pending() {
        let mut h = make_handoff();
        let err = h
            .complete(HandoffResult {
                summary: "x".into(),
                artifact_ids: vec![],
                git_ref: None,
                structured: None,
                primary_artifact_kind: None,
            })
            .unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn fail_then_escalate() {
        let mut h = make_handoff();
        h.mark_delivered(AgentSessionId::new()).unwrap();
        h.fail(HandoffFailure {
            reason: "crashed".into(),
            retry_count: 0,
            escalated_attention_id: None,
        })
        .unwrap();
        assert_eq!(h.status, HandoffStatus::Failed);
        let att = AttentionRequestId::new();
        h.escalate(att).unwrap();
        assert_eq!(h.status, HandoffStatus::Escalated);
        assert_eq!(
            h.failure.as_ref().unwrap().escalated_attention_id,
            Some(att)
        );
    }

    #[test]
    fn cannot_escalate_non_failed() {
        let mut h = make_handoff();
        let err = h.escalate(AttentionRequestId::new()).unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn supersede_from_pending() {
        let mut h = make_handoff();
        h.supersede().unwrap();
        assert_eq!(h.status, HandoffStatus::Superseded);
    }

    #[test]
    fn supersede_terminal_rejected() {
        let mut h = make_handoff();
        h.supersede().unwrap();
        assert!(h.supersede().is_err());
    }

    #[test]
    fn fix_requires_findings() {
        let err = Handoff::new(
            RunId::new(),
            StepId::new(),
            None,
            "fixer".into(),
            HandoffPayload::Fix {
                parent_review: HandoffId::new(),
                findings: vec![],
            },
            None,
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn escalate_decision_requires_options() {
        let err = Handoff::new(
            RunId::new(),
            StepId::new(),
            None,
            "operator".into(),
            HandoffPayload::Escalate {
                reason: "need a choice".into(),
                attention_kind: AttentionKind::Decision,
                options: None,
            },
            None,
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }
}
