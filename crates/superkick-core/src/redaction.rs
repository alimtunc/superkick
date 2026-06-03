//! Credential-shape scanner for the SUP-148 memory entry write boundary.
//!
//! The guard is intentionally narrow: it rejects entries whose text matches a
//! small, hand-curated set of well-known credential shapes (bearer tokens,
//! AWS access keys, OpenAI / Anthropic API keys, basic-auth URLs, GitHub
//! PATs). A false positive on a legitimate fragment costs the operator one
//! rewrite; a false negative on a real secret pollutes the ledger and may
//! later be replayed into an agent prompt -- so the trade-off favours
//! over-rejection.
//!
//! The aggregate must reject, not strip: silent stripping would change the
//! semantics of the entry without the operator noticing. `scan` returns the
//! `kind` of the first matching pattern so the API layer can surface it in
//! the 422 body.

use regex::Regex;
use std::borrow::Cow;
use std::sync::LazyLock;

/// Ordered list of `(kind, regex)` pairs. Iteration stops at the first
/// match -- the order matters for kind reporting when multiple patterns
/// could match the same fragment (rare; the patterns are largely disjoint).
static PATTERNS: LazyLock<Vec<(&'static str, Regex)>> = LazyLock::new(|| {
    let raw: &[(&'static str, &'static str)] = &[
        ("bearer_token", r"(?i)\bbearer\s+[A-Za-z0-9._~+/=\-]{16,}\b"),
        ("aws_access_key", r"\bAKIA[0-9A-Z]{16}\b"),
        (
            "openai_api_key",
            r"\bsk-(?:proj-|ant-|live-)?[A-Za-z0-9_\-]{20,}\b",
        ),
        (
            "basic_auth_url",
            r"\b[a-z][a-z0-9+.\-]*://[^\s:/@]+:[^\s@/]+@\S+",
        ),
        ("github_pat", r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    ];
    raw.iter()
        .map(|(kind, pattern)| {
            let regex = Regex::new(pattern).expect("bug: invalid hardcoded redaction pattern");
            (*kind, regex)
        })
        .collect()
});

/// Return the kind of the first credential-shaped pattern that matches
/// `input`, or `None` if the input looks clean. The kinds are stable string
/// constants (used in the wire error body) -- adding a new pattern requires
/// adding a fresh constant.
pub fn scan(input: &str) -> Option<&'static str> {
    PATTERNS
        .iter()
        .find_map(|(kind, regex)| regex.is_match(input).then_some(*kind))
}

/// Mask every credential-shaped span in `input` with a stable
/// `[redacted:<kind>]` placeholder, reusing the exact patterns [`scan`] uses.
///
/// `scan` *rejects* (the memory-entry write boundary refuses to persist a
/// matching entry); `redact` *masks* and never fails. The split exists because
/// a derived projection (SUP-187 `RunContextSnapshot`) aggregates free text
/// from many canonical sources and must always build — refusing to render one
/// summary because a fragment looks like a token would defeat the projection.
/// Clean input is returned borrowed, so the common path allocates nothing.
pub fn redact(input: &str) -> Cow<'_, str> {
    if scan(input).is_none() {
        return Cow::Borrowed(input);
    }
    let mut masked = input.to_owned();
    for (kind, regex) in PATTERNS.iter() {
        let placeholder = format!("[redacted:{kind}]");
        masked = regex
            .replace_all(&masked, placeholder.as_str())
            .into_owned();
    }
    Cow::Owned(masked)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_bearer_token() {
        let hit = scan("Authorization: Bearer abcdef0123456789ghijklmn");
        assert_eq!(hit, Some("bearer_token"));
    }

    #[test]
    fn ignores_short_bearer_word() {
        assert!(scan("bearer of bad news").is_none());
    }

    #[test]
    fn detects_aws_access_key() {
        assert_eq!(scan("AKIAIOSFODNN7EXAMPLE prod"), Some("aws_access_key"));
    }

    #[test]
    fn ignores_aws_lookalike() {
        assert!(scan("akiaioscfodnn7example").is_none());
    }

    #[test]
    fn detects_openai_api_key() {
        let secret = "use sk-proj-AbCdEfGhIjKlMnOpQrStUv now";
        assert_eq!(scan(secret), Some("openai_api_key"));
    }

    #[test]
    fn detects_anthropic_api_key() {
        let secret = "sk-ant-AbCdEfGhIjKlMnOpQrStUv";
        assert_eq!(scan(secret), Some("openai_api_key"));
    }

    #[test]
    fn ignores_short_sk_prefix() {
        assert!(scan("sk-short").is_none());
    }

    #[test]
    fn detects_basic_auth_url() {
        let hit = scan("clone https://user:hunter2@example.com/repo.git");
        assert_eq!(hit, Some("basic_auth_url"));
    }

    #[test]
    fn ignores_plain_url() {
        assert!(scan("https://example.com/no/secret/here").is_none());
    }

    #[test]
    fn detects_github_pat() {
        let secret = "token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        assert_eq!(scan(secret), Some("github_pat"));
    }

    #[test]
    fn ignores_short_github_prefix() {
        assert!(scan("ghp_short").is_none());
    }

    #[test]
    fn ignores_garbage_text() {
        let payload = "Plan: split this into three steps and ship behind a flag. \
                       Nothing here is sensitive -- just plain narrative text.";
        assert!(scan(payload).is_none());
    }

    #[test]
    fn redact_returns_clean_text_borrowed() {
        let clean = "Plan: split this into three steps and ship behind a flag.";
        let out = redact(clean);
        assert!(
            matches!(out, Cow::Borrowed(_)),
            "clean text must not allocate"
        );
        assert_eq!(out, clean);
    }

    #[test]
    fn redact_masks_each_credential_kind() {
        let cases = [
            (
                "Authorization: Bearer abcdef0123456789ghijklmn",
                "bearer_token",
            ),
            ("key AKIAIOSFODNN7EXAMPLE here", "aws_access_key"),
            ("use sk-proj-AbCdEfGhIjKlMnOpQrStUv now", "openai_api_key"),
            (
                "clone https://user:hunter2@example.com/repo.git",
                "basic_auth_url",
            ),
            (
                "token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                "github_pat",
            ),
        ];
        for (input, kind) in cases {
            let out = redact(input);
            assert!(
                out.contains(&format!("[redacted:{kind}]")),
                "expected `{kind}` placeholder in `{out}`",
            );
        }
    }

    #[test]
    fn redact_strips_the_secret_value() {
        let secret = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let input = format!("here is the token {secret} keep going");
        let out = redact(&input);
        assert!(!out.contains(secret), "secret leaked through: {out}");
        assert!(out.contains("here is the token"));
        assert!(out.contains("keep going"));
    }

    #[test]
    fn redact_masks_multiple_occurrences() {
        let out = redact("AKIAIOSFODNN7EXAMPLE and AKIA1234567890ABCDEF");
        assert_eq!(
            out,
            "[redacted:aws_access_key] and [redacted:aws_access_key]"
        );
    }
}
