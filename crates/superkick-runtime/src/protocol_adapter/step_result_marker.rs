//! Pure line scanner that extracts the `SUPERKICK_STEP_RESULT_*` marker block from a raw byte stream. Behavior is covered by the test module.

use thiserror::Error;

use superkick_core::{STEP_RESULT_BEGIN, STEP_RESULT_END, StepResult};

#[derive(Debug, Error)]
#[error("step result marker body was not valid JSON: {0}")]
pub struct MarkerError(#[from] serde_json::Error);

/// Stateful line scanner; feed raw byte chunks, then call `finish`.
#[derive(Debug, Default)]
pub(crate) struct StepResultScanner {
    line_buf: Vec<u8>,
    inside: Option<String>,
    last_complete: Option<String>,
}

impl StepResultScanner {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Feed a chunk of raw bytes from the PTY. Returns the freshly-completed
    /// marker block on the chunk that closes one with a `STEP_RESULT_END`, so
    /// callers can act on a self-iterating REPL's completion mid-stream instead
    /// of waiting for PTY EOF. `Ok(None)` = no block closed in this chunk;
    /// `Err` = the closed block's body was not valid JSON.
    pub(crate) fn feed(&mut self, chunk: &[u8]) -> Result<Option<StepResult>, MarkerError> {
        let mut completed = false;
        for &b in chunk {
            if b == b'\n' {
                let line_bytes = std::mem::take(&mut self.line_buf);
                let line = String::from_utf8_lossy(&line_bytes);
                completed |= self.handle_line(line.trim_end_matches('\r'));
            } else {
                self.line_buf.push(b);
            }
        }
        if !completed {
            return Ok(None);
        }
        match &self.last_complete {
            Some(raw) => Ok(Some(serde_json::from_str(raw.trim())?)),
            None => Ok(None),
        }
    }

    /// Returns `true` when this line closed a marker block.
    fn handle_line(&mut self, line: &str) -> bool {
        if line == STEP_RESULT_BEGIN {
            self.inside = Some(String::new());
            return false;
        }
        if line == STEP_RESULT_END {
            if let Some(body) = self.inside.take() {
                self.last_complete = Some(body);
                return true;
            }
            return false;
        }
        if let Some(body) = self.inside.as_mut() {
            if !body.is_empty() {
                body.push('\n');
            }
            body.push_str(line);
        }
        false
    }

    /// Finalise. `Ok(None)` covers both "no marker" and "BEGIN without END".
    pub(crate) fn finish(self) -> Result<Option<StepResult>, MarkerError> {
        match self.last_complete {
            None => Ok(None),
            Some(raw) => {
                let parsed: StepResult = serde_json::from_str(raw.trim())?;
                Ok(Some(parsed))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use superkick_core::StepResultStatus;

    fn happy_block() -> String {
        format!(
            "{begin}\n{body}\n{end}\n",
            begin = STEP_RESULT_BEGIN,
            body = r#"{"status":"completed","summary":"did it","changed_files":["a.rs"],"questions":[]}"#,
            end = STEP_RESULT_END,
        )
    }

    fn scan(chunks: &[&[u8]]) -> Result<Option<StepResult>, MarkerError> {
        let mut s = StepResultScanner::new();
        for c in chunks {
            s.feed(c)?;
        }
        s.finish()
    }

    #[test]
    fn parses_well_formed_marker_block() {
        let bytes = happy_block();
        let sr = scan(&[bytes.as_bytes()]).expect("ok").expect("some");
        assert_eq!(sr.status, StepResultStatus::Completed);
        assert_eq!(sr.summary, "did it");
        assert_eq!(sr.changed_files, vec!["a.rs"]);
    }

    #[test]
    fn returns_none_when_marker_absent() {
        let bytes = b"just some agent chatter\nno markers here\n";
        let sr = scan(&[bytes]).expect("ok");
        assert!(sr.is_none());
    }

    #[test]
    fn returns_none_when_begin_has_no_end() {
        let bytes = format!(
            "{begin}\n{body}\n",
            begin = STEP_RESULT_BEGIN,
            body = r#"{"status":"completed","summary":"x"}"#,
        );
        let sr = scan(&[bytes.as_bytes()]).expect("ok");
        assert!(sr.is_none(), "truncated block must yield None, not Err");
    }

    #[test]
    fn malformed_json_body_surfaces_as_error() {
        let bytes = format!(
            "{begin}\nnot json at all\n{end}\n",
            begin = STEP_RESULT_BEGIN,
            end = STEP_RESULT_END,
        );
        scan(&[bytes.as_bytes()]).expect_err("must error");
    }

    #[test]
    fn last_complete_marker_wins() {
        let bytes = format!(
            "{begin}\n{stale}\n{end}\nintermediate chatter\n{begin}\n{fresh}\n{end}\n",
            begin = STEP_RESULT_BEGIN,
            end = STEP_RESULT_END,
            stale = r#"{"status":"needs_human","summary":"first attempt"}"#,
            fresh = r#"{"status":"completed","summary":"final"}"#,
        );
        let sr = scan(&[bytes.as_bytes()]).expect("ok").expect("some");
        assert_eq!(sr.summary, "final");
        assert_eq!(sr.status, StepResultStatus::Completed);
    }

    #[test]
    fn second_begin_resets_partial_block() {
        let bytes = format!(
            "{begin}\nthis would be malformed\n{begin}\n{body}\n{end}\n",
            begin = STEP_RESULT_BEGIN,
            end = STEP_RESULT_END,
            body = r#"{"status":"completed","summary":"recovered"}"#,
        );
        let sr = scan(&[bytes.as_bytes()]).expect("ok").expect("some");
        assert_eq!(sr.summary, "recovered");
    }

    #[test]
    fn marker_split_across_chunks_is_recovered() {
        let block = happy_block();
        // Split right inside the BEGIN sentinel so the line straddles two
        // feed calls; the buffer must hold the partial line.
        let split_at = STEP_RESULT_BEGIN.len() - 5;
        let (left, right) = block.as_bytes().split_at(split_at);
        let sr = scan(&[left, right]).expect("ok").expect("some");
        assert_eq!(sr.status, StepResultStatus::Completed);
        assert_eq!(sr.summary, "did it");
    }

    #[test]
    fn marker_mid_line_is_ignored() {
        // A marker substring embedded in another line (no leading newline)
        // must not trigger the state machine.
        let bytes =
            b"prefix SUPERKICK_STEP_RESULT_BEGIN inline noise SUPERKICK_STEP_RESULT_END suffix\n";
        let sr = scan(&[bytes]).expect("ok");
        assert!(sr.is_none());
    }

    #[test]
    fn handles_crlf_line_endings() {
        let bytes = format!(
            "{begin}\r\n{body}\r\n{end}\r\n",
            begin = STEP_RESULT_BEGIN,
            end = STEP_RESULT_END,
            body = r#"{"status":"completed","summary":"crlf works"}"#,
        );
        let sr = scan(&[bytes.as_bytes()]).expect("ok").expect("some");
        assert_eq!(sr.summary, "crlf works");
    }

    #[test]
    fn utf8_multibyte_split_across_chunks_does_not_corrupt_body() {
        // The summary contains "café" (the é is two UTF-8 bytes). Split the
        // input mid-character — `String::from_utf8_lossy` substitutes a
        // replacement character only inside the partial chunk, but since we
        // only decode after a full `\n` lands, the recovered line is intact.
        let body = r#"{"status":"completed","summary":"café"}"#;
        let block = format!(
            "{begin}\n{body}\n{end}\n",
            begin = STEP_RESULT_BEGIN,
            end = STEP_RESULT_END,
        );
        let bytes = block.as_bytes();
        // Slice index that lands between the two bytes of `é`.
        let e_byte_idx = block.find('é').expect("é present") + 1;
        let (left, right) = bytes.split_at(e_byte_idx);
        let sr = scan(&[left, right]).expect("ok").expect("some");
        assert_eq!(sr.summary, "café");
    }

    #[test]
    fn empty_stream_yields_none() {
        let sr = scan(&[]).expect("ok");
        assert!(sr.is_none());
    }

    #[test]
    fn feed_returns_the_block_on_the_closing_chunk() {
        let mut s = StepResultScanner::new();
        // No block closes while the REPL is still streaming the body.
        assert!(
            s.feed(format!("{STEP_RESULT_BEGIN}\n").as_bytes())
                .expect("ok")
                .is_none()
        );
        let sr = s
            .feed(
                format!(
                    "{body}\n{STEP_RESULT_END}\n",
                    body = r#"{"status":"completed","summary":"mid-stream"}"#,
                )
                .as_bytes(),
            )
            .expect("ok")
            .expect("block closed");
        assert_eq!(sr.status, StepResultStatus::Completed);
        assert_eq!(sr.summary, "mid-stream");
    }

    #[test]
    fn feed_propagates_malformed_block_error_mid_stream() {
        let mut s = StepResultScanner::new();
        let err = s.feed(format!("{STEP_RESULT_BEGIN}\nnot json\n{STEP_RESULT_END}\n").as_bytes());
        assert!(
            err.is_err(),
            "closing a malformed block must surface an error"
        );
    }
}
