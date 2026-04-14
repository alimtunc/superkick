//! Structured attention requests and operator replies.
//!
//! A product-level coordination layer above the PTY terminal substrate. The
//! terminal remains the single live interaction channel for a run; attention
//! requests are higher-level asks for human arbitration (clarification,
//! decision, approval) that are distinct from raw terminal I/O and auditable
//! after the fact.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::id::{AttentionRequestId, RunId};

/// The kind of arbitration being requested. Drives what shape a valid reply
/// takes and how the UI renders the request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttentionKind {
    /// Free-text question needing a written answer.
    Clarification,
    /// Pick one option from a provided list.
    Decision,
    /// Yes/no gate on a proposed action.
    Approval,
}

/// Lifecycle of an attention request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttentionStatus {
    Pending,
    Replied,
    Cancelled,
}

/// Operator reply. Shape validated against the request's kind.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum AttentionReply {
    /// Reply to a `Clarification` request.
    Text { text: String },
    /// Reply to a `Decision` request — `choice` must be one of the request's options.
    Choice { choice: String },
    /// Reply to an `Approval` request.
    Approval {
        approved: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
}

/// A run-scoped, operator-facing request for human arbitration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttentionRequest {
    pub id: AttentionRequestId,
    pub run_id: RunId,
    pub kind: AttentionKind,
    pub title: String,
    pub body: String,
    /// For `Decision` requests: the allowed choices. None for other kinds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    pub status: AttentionStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply: Option<AttentionReply>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replied_by: Option<String>,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replied_at: Option<DateTime<Utc>>,
}

impl AttentionRequest {
    pub fn new(
        run_id: RunId,
        kind: AttentionKind,
        title: String,
        body: String,
        options: Option<Vec<String>>,
    ) -> Result<Self, CoreError> {
        if title.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "attention request title is empty".into(),
            ));
        }
        match (kind, options.as_ref()) {
            (AttentionKind::Decision, Some(opts)) if !opts.is_empty() => {}
            (AttentionKind::Decision, _) => {
                return Err(CoreError::InvalidInput(
                    "decision attention request requires at least one option".into(),
                ));
            }
            (_, Some(_)) => {
                return Err(CoreError::InvalidInput(
                    "options are only valid for decision attention requests".into(),
                ));
            }
            _ => {}
        }
        Ok(Self {
            id: AttentionRequestId::new(),
            run_id,
            kind,
            title,
            body,
            options,
            status: AttentionStatus::Pending,
            reply: None,
            replied_by: None,
            created_at: Utc::now(),
            replied_at: None,
        })
    }

    /// Record an operator reply. Validates the reply shape against the kind.
    pub fn record_reply(
        &mut self,
        reply: AttentionReply,
        replied_by: Option<String>,
    ) -> Result<(), CoreError> {
        if self.status != AttentionStatus::Pending {
            return Err(CoreError::InvalidInput(format!(
                "attention request is not pending (status: {:?})",
                self.status
            )));
        }
        match (&self.kind, &reply) {
            (AttentionKind::Clarification, AttentionReply::Text { text }) if !text.is_empty() => {}
            (AttentionKind::Clarification, AttentionReply::Text { .. }) => {
                return Err(CoreError::InvalidInput(
                    "clarification reply text must not be empty".into(),
                ));
            }
            (AttentionKind::Decision, AttentionReply::Choice { choice }) => {
                let allowed = self.options.as_deref().unwrap_or(&[]);
                if !allowed.iter().any(|o| o == choice) {
                    return Err(CoreError::InvalidInput(format!(
                        "choice {choice:?} is not among the request's options"
                    )));
                }
            }
            (AttentionKind::Approval, AttentionReply::Approval { .. }) => {}
            _ => {
                return Err(CoreError::InvalidInput(
                    "reply shape does not match the request kind".into(),
                ));
            }
        }
        self.status = AttentionStatus::Replied;
        self.reply = Some(reply);
        self.replied_by = replied_by.filter(|s| !s.is_empty());
        self.replied_at = Some(Utc::now());
        Ok(())
    }

    pub fn cancel(&mut self) {
        if self.status == AttentionStatus::Pending {
            self.status = AttentionStatus::Cancelled;
            self.replied_at = Some(Utc::now());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_id() -> RunId {
        RunId::new()
    }

    #[test]
    fn clarification_roundtrip() {
        let mut req = AttentionRequest::new(
            run_id(),
            AttentionKind::Clarification,
            "Need scope confirmation".into(),
            "Should I also touch the frontend?".into(),
            None,
        )
        .unwrap();
        req.record_reply(
            AttentionReply::Text {
                text: "yes, both".into(),
            },
            Some("daisy".into()),
        )
        .unwrap();
        assert_eq!(req.status, AttentionStatus::Replied);
        assert!(req.replied_at.is_some());
    }

    #[test]
    fn decision_requires_options() {
        let err = AttentionRequest::new(
            run_id(),
            AttentionKind::Decision,
            "Pick branch".into(),
            "Which base?".into(),
            None,
        )
        .unwrap_err();
        assert!(format!("{err}").contains("at least one option"));
    }

    #[test]
    fn decision_reply_must_match_option() {
        let mut req = AttentionRequest::new(
            run_id(),
            AttentionKind::Decision,
            "Pick branch".into(),
            "Which base?".into(),
            Some(vec!["main".into(), "develop".into()]),
        )
        .unwrap();
        let err = req
            .record_reply(
                AttentionReply::Choice {
                    choice: "other".into(),
                },
                None,
            )
            .unwrap_err();
        assert!(format!("{err}").contains("not among"));
        req.record_reply(
            AttentionReply::Choice {
                choice: "main".into(),
            },
            None,
        )
        .unwrap();
        assert_eq!(req.status, AttentionStatus::Replied);
    }

    #[test]
    fn approval_reply_accepts_yes_and_no() {
        let mut req = AttentionRequest::new(
            run_id(),
            AttentionKind::Approval,
            "Push branch?".into(),
            "Force push acceptable?".into(),
            None,
        )
        .unwrap();
        req.record_reply(
            AttentionReply::Approval {
                approved: false,
                reason: Some("no force pushes".into()),
            },
            None,
        )
        .unwrap();
        assert_eq!(req.status, AttentionStatus::Replied);
    }

    #[test]
    fn reply_kind_must_match_request_kind() {
        let mut req = AttentionRequest::new(
            run_id(),
            AttentionKind::Clarification,
            "Ask".into(),
            "Body".into(),
            None,
        )
        .unwrap();
        let err = req
            .record_reply(AttentionReply::Choice { choice: "x".into() }, None)
            .unwrap_err();
        assert!(format!("{err}").contains("does not match"));
    }

    #[test]
    fn cannot_reply_twice() {
        let mut req = AttentionRequest::new(
            run_id(),
            AttentionKind::Clarification,
            "Ask".into(),
            "Body".into(),
            None,
        )
        .unwrap();
        req.record_reply(AttentionReply::Text { text: "one".into() }, None)
            .unwrap();
        let err = req
            .record_reply(AttentionReply::Text { text: "two".into() }, None)
            .unwrap_err();
        assert!(format!("{err}").contains("not pending"));
    }

    #[test]
    fn cancel_only_moves_pending() {
        let mut req = AttentionRequest::new(
            run_id(),
            AttentionKind::Clarification,
            "Ask".into(),
            "Body".into(),
            None,
        )
        .unwrap();
        req.cancel();
        assert_eq!(req.status, AttentionStatus::Cancelled);
        req.cancel(); // idempotent, no panic
    }
}
