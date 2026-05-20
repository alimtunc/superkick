//! SUP-148: append-only memory entries scoped to an `IssueWorkspaceContext`.
//!
//! Every write goes through `MemoryEntry::new`, which validates the shape and
//! runs the text through [`crate::redaction::scan`]. There is no path that
//! constructs a persistable entry around the redaction guard -- the storage
//! layer takes `&MemoryEntry` only.
//!
//! Cursor design: opaque base64-encoded JSON `{ created_at, id }`. Opaque
//! because (a) clients should not parse it (we want to add fields later
//! without breaking compatibility), and (b) the row-value comparison against
//! `(created_at, id)` requires both halves -- a single timestamp does not
//! disambiguate two entries written in the same millisecond.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::id::{IssueWorkspaceContextId, MemoryEntryId};

/// One persisted memory entry. The aggregate enforces validation on
/// construction; the storage layer treats this as an opaque payload to
/// append.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: MemoryEntryId,
    pub context_id: IssueWorkspaceContextId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub role: String,
    pub text: String,
    pub created_at: DateTime<Utc>,
}

impl MemoryEntry {
    /// Build a fresh entry. Rejects empty `role` / `text` and runs the text
    /// through the credential-shape scanner. The `created_at` timestamp is
    /// minted here so callers cannot accidentally backdate a persisted row.
    pub fn new(
        context_id: IssueWorkspaceContextId,
        role: String,
        author: Option<String>,
        text: String,
    ) -> Result<Self, CoreError> {
        if role.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "memory entry role must not be empty".into(),
            ));
        }
        if text.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "memory entry text must not be empty".into(),
            ));
        }
        if let Some(kind) = crate::redaction::scan(&text) {
            return Err(CoreError::CredentialLikely { kind });
        }
        Ok(MemoryEntry {
            id: MemoryEntryId::new(),
            context_id,
            author,
            role,
            text,
            created_at: Utc::now(),
        })
    }
}

/// Opaque pagination cursor for newest-first memory listings. The wire form
/// is `URL_SAFE_NO_PAD` base64 of the JSON encoding; both halves are needed
/// because two entries can share a millisecond timestamp.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct MemoryCursor {
    pub created_at: DateTime<Utc>,
    pub id: MemoryEntryId,
}

impl MemoryCursor {
    pub fn to_opaque(&self) -> String {
        let json = serde_json::to_vec(self).expect("MemoryCursor json encode is infallible");
        URL_SAFE_NO_PAD.encode(json)
    }

    pub fn from_opaque(opaque: &str) -> Result<Self, CoreError> {
        let bytes = URL_SAFE_NO_PAD
            .decode(opaque.as_bytes())
            .map_err(|err| CoreError::InvalidInput(format!("invalid memory cursor: {err}")))?;
        serde_json::from_slice(&bytes)
            .map_err(|err| CoreError::InvalidInput(format!("invalid memory cursor body: {err}")))
    }
}

/// One page of memory entries plus the next cursor (None when the page is
/// the last one). The storage repo decides on the page boundary using the
/// `limit + 1` lookahead trick so the API never has to issue a separate
/// `COUNT(*)` to detect whether more pages exist.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryPage {
    pub entries: Vec<MemoryEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<MemoryCursor>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> IssueWorkspaceContextId {
        IssueWorkspaceContextId::new()
    }

    #[test]
    fn new_rejects_empty_role() {
        let err = MemoryEntry::new(ctx(), "  ".into(), None, "ok".into())
            .expect_err("empty role must be rejected");
        match err {
            CoreError::InvalidInput(msg) => assert!(msg.contains("role"), "msg = {msg}"),
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    #[test]
    fn new_rejects_empty_text() {
        let err = MemoryEntry::new(ctx(), "note".into(), None, "".into())
            .expect_err("empty text must be rejected");
        match err {
            CoreError::InvalidInput(msg) => assert!(msg.contains("text"), "msg = {msg}"),
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    #[test]
    fn new_returns_credential_likely_for_bearer_token() {
        let err = MemoryEntry::new(
            ctx(),
            "note".into(),
            None,
            "Auth: Bearer abcdef0123456789ghijklmn".into(),
        )
        .expect_err("bearer token must be rejected");
        match err {
            CoreError::CredentialLikely { kind } => assert_eq!(kind, "bearer_token"),
            other => panic!("expected CredentialLikely, got {other:?}"),
        }
    }

    #[test]
    fn new_returns_credential_likely_for_aws_access_key() {
        let err = MemoryEntry::new(
            ctx(),
            "note".into(),
            None,
            "AKIAIOSFODNN7EXAMPLE leaked".into(),
        )
        .expect_err("aws key must be rejected");
        assert!(matches!(
            err,
            CoreError::CredentialLikely {
                kind: "aws_access_key"
            }
        ));
    }

    #[test]
    fn new_returns_credential_likely_for_openai_api_key() {
        let err = MemoryEntry::new(
            ctx(),
            "note".into(),
            None,
            "use sk-proj-AbCdEfGhIjKlMnOpQrStUv".into(),
        )
        .expect_err("openai key must be rejected");
        assert!(matches!(
            err,
            CoreError::CredentialLikely {
                kind: "openai_api_key"
            }
        ));
    }

    #[test]
    fn new_returns_credential_likely_for_basic_auth_url() {
        let err = MemoryEntry::new(
            ctx(),
            "note".into(),
            None,
            "clone https://user:hunter2@example.com/repo.git".into(),
        )
        .expect_err("basic-auth url must be rejected");
        assert!(matches!(
            err,
            CoreError::CredentialLikely {
                kind: "basic_auth_url"
            }
        ));
    }

    #[test]
    fn new_returns_credential_likely_for_github_pat() {
        let err = MemoryEntry::new(
            ctx(),
            "note".into(),
            None,
            "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".into(),
        )
        .expect_err("github pat must be rejected");
        assert!(matches!(
            err,
            CoreError::CredentialLikely { kind: "github_pat" }
        ));
    }

    #[test]
    fn cursor_round_trip() {
        let original = MemoryCursor {
            created_at: chrono::Utc::now(),
            id: MemoryEntryId::new(),
        };
        let opaque = original.to_opaque();
        let decoded = MemoryCursor::from_opaque(&opaque).expect("round trip");
        assert_eq!(decoded.id.0, original.id.0);
        assert_eq!(
            decoded.created_at.timestamp_micros(),
            original.created_at.timestamp_micros()
        );
    }

    #[test]
    fn cursor_rejects_garbage_input() {
        let err =
            MemoryCursor::from_opaque("!!not-valid-base64!!").expect_err("garbage must reject");
        match err {
            CoreError::InvalidInput(msg) => {
                assert!(msg.contains("memory cursor"), "msg = {msg}")
            }
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    #[test]
    fn cursor_rejects_valid_base64_with_wrong_body() {
        let bogus = URL_SAFE_NO_PAD.encode(b"not json");
        let err = MemoryCursor::from_opaque(&bogus).expect_err("body must validate");
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }
}
