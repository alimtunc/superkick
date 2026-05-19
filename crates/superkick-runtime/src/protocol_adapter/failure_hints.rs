//! Provider-aware transcript scanner that captures hints (auth required,
//! quota exhausted, tests failed) from a raw byte stream.
//!
//! Mirrors the [`StepResultScanner`](super::step_result_marker::StepResultScanner)
//! shape: stateful, fed `&[u8]` chunks line-by-line, finalised at EOF.
//! Used by the agent supervisor to extract free-form provider strings the
//! marker contract does not expose, so the runtime classifier can turn them
//! into typed [`FailureClassification`] variants.
//!
//! Each pattern is anchored to a named const that documents the observed
//! string + provider version. When a CLI release changes the wording, the
//! unit tests in this module fail loud rather than silently mis-classifying.
//!
//! [`FailureClassification`]: superkick_core::FailureClassification
//!
//! # Codex coverage
//!
//! Claude patterns are populated from the SUP-135 PTY work. Codex patterns
//! are stubbed (`&[]`) with a TODO — once the Codex CLI's auth/quota error
//! strings are confirmed on real spawns, drop them into [`CODEX_AUTH`] /
//! [`CODEX_QUOTA`] / [`CODEX_TESTS`].

use std::sync::LazyLock;

use regex::Regex;

use superkick_core::AgentProvider;

/// Transcript-derived hints accumulated while a PTY stream is live.
/// All fields default to `None`/`false`; once observed, they latch on (later
/// chunks cannot un-set an earlier match).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct TranscriptHints {
    pub auth_required: bool,
    pub quota_exceeded: bool,
    /// Wall-clock label parsed from the transcript (e.g. `"3:42pm"`). Stored
    /// as a string because providers print local times without timezone or
    /// date — see SUP-140 plan "Risks / unknowns".
    pub quota_reset_at: Option<String>,
    pub tests_failed: Option<String>,
}

impl TranscriptHints {
    pub fn is_empty(&self) -> bool {
        !self.auth_required
            && !self.quota_exceeded
            && self.quota_reset_at.is_none()
            && self.tests_failed.is_none()
    }
}

// Claude patterns are observed in `claude` CLI 0.5.x — the strings appear in
// the rendered terminal output, not via the JSON-stream contract.

/// `claude` prints this on the line where the 5-hour rolling quota trips.
const CLAUDE_QUOTA: &str = r"(?i)5-hour limit reached";
/// Capture group on the same (or next) line. Wall-clock only — no date or TZ.
const CLAUDE_QUOTA_RESET: &str = r"(?i)resets?\s+at\s+(\d{1,2}:\d{2}\s?(?:am|pm)?)";
/// Surfaces when the local OAuth/token storage is missing or expired.
const CLAUDE_AUTH: &str = r"(?i)(please log in|authentication required|run\s+claude\s+login)";
/// Surfaces in Implement/Review steps when the agent ran tests itself.
const CLAUDE_TESTS: &str = r"(?i)(tests? failed|FAIL: )";

// Codex patterns are empty until calibrated against real spawns
// (TODO SUP-140 follow-up) — see module docs. With empty pattern sets the
// scanner short-circuits per line at the `is_empty()` check, so there's no cost.

static CLAUDE_QUOTA_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(CLAUDE_QUOTA).expect("bug: CLAUDE_QUOTA must be a valid regex literal")
});
static CLAUDE_QUOTA_RESET_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(CLAUDE_QUOTA_RESET).expect("bug: CLAUDE_QUOTA_RESET must be a valid regex literal")
});
static CLAUDE_AUTH_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(CLAUDE_AUTH).expect("bug: CLAUDE_AUTH must be a valid regex literal")
});
static CLAUDE_TESTS_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(CLAUDE_TESTS).expect("bug: CLAUDE_TESTS must be a valid regex literal")
});

/// Stateful line scanner. Feed raw byte chunks via [`feed`]; call
/// [`into_hints`] at EOF to retrieve the accumulated [`TranscriptHints`].
///
/// [`feed`]: FailureHintScanner::feed
/// [`into_hints`]: FailureHintScanner::into_hints
#[derive(Debug)]
pub(crate) struct FailureHintScanner {
    provider: AgentProvider,
    line_buf: Vec<u8>,
    hints: TranscriptHints,
}

impl FailureHintScanner {
    pub(crate) fn new(provider: AgentProvider) -> Self {
        Self {
            provider,
            line_buf: Vec::new(),
            hints: TranscriptHints::default(),
        }
    }

    pub(crate) fn feed(&mut self, chunk: &[u8]) {
        for &b in chunk {
            if b == b'\n' {
                let line_bytes = std::mem::take(&mut self.line_buf);
                let line = String::from_utf8_lossy(&line_bytes);
                self.handle_line(line.trim_end_matches('\r'));
            } else {
                self.line_buf.push(b);
            }
        }
    }

    pub(crate) fn into_hints(mut self) -> TranscriptHints {
        // Flush any final line that didn't end in `\n` so a trailing
        // "auth required" without a newline is still captured.
        if !self.line_buf.is_empty() {
            let line_bytes = std::mem::take(&mut self.line_buf);
            let line = String::from_utf8_lossy(&line_bytes);
            self.handle_line(line.trim_end_matches('\r'));
        }
        self.hints
    }

    fn handle_line(&mut self, line: &str) {
        match self.provider {
            AgentProvider::Claude => self.scan_claude(line),
            // TODO(SUP-140 follow-up): populate Codex patterns once observed
            // on real spawns. Until then, Codex auth/quota surfaces as
            // `AgentNonZeroExit` and the operator retries manually.
            AgentProvider::Codex => {}
        }
    }

    fn scan_claude(&mut self, line: &str) {
        if !self.hints.quota_exceeded && CLAUDE_QUOTA_RE.is_match(line) {
            self.hints.quota_exceeded = true;
        }
        if self.hints.quota_reset_at.is_none()
            && let Some(caps) = CLAUDE_QUOTA_RESET_RE.captures(line)
            && let Some(m) = caps.get(1)
        {
            self.hints.quota_reset_at = Some(m.as_str().trim().to_owned());
        }
        if !self.hints.auth_required && CLAUDE_AUTH_RE.is_match(line) {
            self.hints.auth_required = true;
        }
        if self.hints.tests_failed.is_none() && CLAUDE_TESTS_RE.is_match(line) {
            self.hints.tests_failed = Some(line.trim().to_owned());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scan(provider: AgentProvider, chunks: &[&[u8]]) -> TranscriptHints {
        let mut s = FailureHintScanner::new(provider);
        for c in chunks {
            s.feed(c);
        }
        s.into_hints()
    }

    #[test]
    fn empty_stream_yields_no_hints() {
        let hints = scan(AgentProvider::Claude, &[]);
        assert!(hints.is_empty(), "got {hints:?}");
    }

    #[test]
    fn unrelated_chatter_does_not_match() {
        let hints = scan(
            AgentProvider::Claude,
            &[b"reading file foo.rs\nrunning step\nall good\n"],
        );
        assert!(hints.is_empty(), "got {hints:?}");
    }

    #[test]
    fn claude_quota_matches_5_hour_limit_line() {
        let hints = scan(
            AgentProvider::Claude,
            &[b"warning: 5-hour limit reached for your plan\n"],
        );
        assert!(hints.quota_exceeded);
    }

    #[test]
    fn claude_quota_reset_captures_wall_clock() {
        let hints = scan(
            AgentProvider::Claude,
            &[b"5-hour limit reached\nUsage resets at 3:42pm\n"],
        );
        assert!(hints.quota_exceeded);
        assert_eq!(hints.quota_reset_at.as_deref(), Some("3:42pm"));
    }

    #[test]
    fn claude_auth_matches_login_prompt() {
        let hints = scan(AgentProvider::Claude, &[b"Please log in to continue.\n"]);
        assert!(hints.auth_required);

        let hints = scan(
            AgentProvider::Claude,
            &[b"Run claude login to authenticate.\n"],
        );
        assert!(hints.auth_required);

        let hints = scan(AgentProvider::Claude, &[b"Authentication required\n"]);
        assert!(hints.auth_required);
    }

    #[test]
    fn claude_tests_failed_captures_line() {
        let hints = scan(
            AgentProvider::Claude,
            &[b"running 5 tests\nFAIL: superkick_core::launch_task::tests::transitions\n"],
        );
        assert_eq!(
            hints.tests_failed.as_deref(),
            Some("FAIL: superkick_core::launch_task::tests::transitions")
        );
    }

    #[test]
    fn first_match_wins_for_quota_reset() {
        let hints = scan(
            AgentProvider::Claude,
            &[b"resets at 9:00am\nresets at 5:00pm\n"],
        );
        assert_eq!(hints.quota_reset_at.as_deref(), Some("9:00am"));
    }

    #[test]
    fn split_chunks_preserve_line() {
        let hints = scan(
            AgentProvider::Claude,
            &[b"5-hour ", b"limit reached", b"\n"],
        );
        assert!(hints.quota_exceeded);
    }

    #[test]
    fn handles_crlf_line_endings() {
        let hints = scan(AgentProvider::Claude, &[b"please log in\r\n"]);
        assert!(hints.auth_required);
    }

    #[test]
    fn trailing_line_without_newline_is_flushed() {
        let hints = scan(AgentProvider::Claude, &[b"please log in"]);
        assert!(hints.auth_required);
    }

    #[test]
    fn codex_provider_currently_matches_nothing() {
        // TODO(SUP-140 follow-up): once Codex patterns are calibrated, replace
        // this with positive cases.
        let hints = scan(
            AgentProvider::Codex,
            &[b"5-hour limit reached\nplease log in\n"],
        );
        assert!(hints.is_empty(), "Codex regex table is intentionally empty");
    }
}
