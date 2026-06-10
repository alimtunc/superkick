//! Pure classifier that turns the observable signals from one supervised
//! agent run into exactly one [`FailureClassification`], or `None` when the
//! step succeeded cleanly.
//!
//! The classifier is intentionally I/O-free except via the injected
//! [`DiffProbe`] trait: that keeps unit tests deterministic and the
//! production path narrow. Production wires [`GitDiffProbe`], which shells
//! out to `git diff --quiet HEAD` against the step's worktree.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use superkick_core::{
    AgentProvider, FailureClassification, LaunchStepKind, SessionLifecyclePhase, StepResult,
    StepResultStatus,
};

use crate::protocol_adapter::{MarkerError, TranscriptHints};

/// Inputs to the classifier. Lifetimes keep it cheap to construct at the
/// call site without `Arc`s.
#[derive(Debug)]
pub struct ClassifyInputs<'a> {
    pub provider: AgentProvider,
    pub role: &'a str,
    pub step_kind: LaunchStepKind,
    pub session_exit_code: Option<i32>,
    pub lifecycle_phase: &'a SessionLifecyclePhase,
    /// Elapsed wall-clock budget when `lifecycle_phase == TimedOut`, else
    /// `None`. Propagated verbatim into `FailureClassification::Timeout`.
    pub timeout_after: Option<Duration>,
    pub marker_outcome: Result<Option<&'a StepResult>, &'a MarkerError>,
    pub transcript_hints: &'a TranscriptHints,
    /// Rendered spawn-error message when `AgentSupervisor::launch` failed
    /// before producing an [`AgentResult`]. `None` when spawn succeeded.
    ///
    /// [`AgentResult`]: crate::agent_supervisor::AgentResult
    pub spawn_error: Option<&'a str>,
    pub diff_probe: &'a dyn DiffProbe,
}

/// Pluggable diff inspector. Production checks `git diff --quiet HEAD` in
/// the worktree; tests inject stubs.
pub trait DiffProbe: std::fmt::Debug + Send + Sync {
    /// `true` when the worktree has uncommitted changes (i.e. the agent
    /// produced a diff). Probe errors are absorbed as `true` — a probe
    /// failure must not trigger a spurious `NoDiff` classification, since
    /// that would mis-classify a real success as `NeedsHuman`.
    fn has_changes(&self) -> bool;
}

/// `git diff --quiet HEAD` probe used in production.
#[derive(Debug, Clone)]
pub struct GitDiffProbe {
    worktree: PathBuf,
}

impl GitDiffProbe {
    pub fn new(worktree: impl Into<PathBuf>) -> Self {
        Self {
            worktree: worktree.into(),
        }
    }

    fn workdir(&self) -> &Path {
        &self.worktree
    }

    /// Run the blocking `git diff --quiet HEAD` probe on a blocking thread and
    /// capture the verdict, so the synchronous classifier — invoked from the
    /// async step-completion path — never shells out on a tokio worker thread.
    ///
    /// Only `Implement` steps can be classified `NoDiff`, so the probe is
    /// skipped (and the verdict left unconsulted) for every other step kind.
    pub(crate) async fn probe_for(self, step_kind: LaunchStepKind) -> PrecomputedDiffProbe {
        if !matches!(step_kind, LaunchStepKind::Implement) {
            return PrecomputedDiffProbe { has_changes: true };
        }
        let has_changes = tokio::task::spawn_blocking(move || self.has_changes())
            .await
            .unwrap_or(true);
        PrecomputedDiffProbe { has_changes }
    }
}

/// A [`DiffProbe`] whose verdict was computed ahead of time. Lets the blocking
/// `git` probe run on a blocking thread (via [`GitDiffProbe::probe`]) while the
/// classifier stays synchronous and I/O-free.
#[derive(Debug, Clone, Copy)]
pub(crate) struct PrecomputedDiffProbe {
    has_changes: bool,
}

impl DiffProbe for PrecomputedDiffProbe {
    fn has_changes(&self) -> bool {
        self.has_changes
    }
}

impl DiffProbe for GitDiffProbe {
    fn has_changes(&self) -> bool {
        // `git diff --quiet HEAD` returns 1 when there is a diff, 0 when
        // there is none, and other codes on error. We only treat exit-1 as
        // "yes, has changes" so a missing repo / inaccessible cwd does not
        // trigger a spurious NoDiff verdict.
        match Command::new("git")
            .args(["diff", "--quiet", "HEAD"])
            .current_dir(self.workdir())
            .status()
        {
            Ok(status) => matches!(status.code(), Some(1)),
            Err(err) => {
                tracing::warn!(
                    workdir = %self.workdir().display(),
                    error = %err,
                    "git diff probe failed — assuming has_changes=true to avoid spurious NoDiff",
                );
                true
            }
        }
    }
}

/// Content fingerprint of a worktree's uncommitted changes (SUP-191).
///
/// Used by the auto-resume gate to decide whether a resumed segment made
/// progress: two consecutive timed-out segments with the same `Known` digest
/// mean the agent produced no new diff, so the step is parked instead of
/// resumed again. `Unknown` is the fail-open value when the `git` probe could
/// not run — it never compares equal to anything (not even another
/// `Unknown`), so a probe error can never trigger a spurious "no progress"
/// park, mirroring [`GitDiffProbe::has_changes`]'s error handling.
#[derive(Debug, Clone)]
pub enum DiffSnapshot {
    Known(u64),
    Unknown,
}

impl DiffSnapshot {
    /// Hash an arbitrary byte payload into a `Known` snapshot. Used by tests
    /// to mint deterministic progress / no-progress fingerprints.
    pub fn of(bytes: &[u8]) -> Self {
        let mut hasher = DefaultHasher::new();
        bytes.hash(&mut hasher);
        DiffSnapshot::Known(hasher.finish())
    }

    /// `true` only when both snapshots are `Known` and equal. `Unknown` on
    /// either side means "treat as changed" so the gate fails open.
    pub fn same_as(&self, other: &DiffSnapshot) -> bool {
        matches!(
            (self, other),
            (DiffSnapshot::Known(a), DiffSnapshot::Known(b)) if a == b
        )
    }
}

/// Snapshot the worktree's uncommitted diff into a [`DiffSnapshot`]. Hashes
/// `git diff HEAD` (tracked, staged + unstaged) plus the content of every
/// untracked file so a brand-new file the agent created still registers as
/// progress. Runs the blocking `git` shells on a blocking thread so the async
/// step-completion path never stalls a tokio worker. Any `git` failure yields
/// [`DiffSnapshot::Unknown`] (fail-open).
pub(crate) async fn capture_diff_snapshot(worktree: PathBuf) -> DiffSnapshot {
    tokio::task::spawn_blocking(move || compute_diff_snapshot(&worktree))
        .await
        .unwrap_or(DiffSnapshot::Unknown)
}

fn compute_diff_snapshot(worktree: &Path) -> DiffSnapshot {
    let Ok(diff) = Command::new("git")
        .args(["diff", "HEAD"])
        .current_dir(worktree)
        .output()
    else {
        return DiffSnapshot::Unknown;
    };
    if !diff.status.success() {
        // Not a git repo / inaccessible cwd — fail open rather than parking.
        return DiffSnapshot::Unknown;
    }

    let mut hasher = DefaultHasher::new();
    diff.stdout.hash(&mut hasher);

    if let Ok(untracked) = Command::new("git")
        .args(["ls-files", "--others", "--exclude-standard", "-z"])
        .current_dir(worktree)
        .output()
        && untracked.status.success()
    {
        let mut paths: Vec<&[u8]> = untracked
            .stdout
            .split(|b| *b == 0)
            .filter(|s| !s.is_empty())
            .collect();
        paths.sort_unstable();
        for path in paths {
            path.hash(&mut hasher);
            if let Ok(rel) = std::str::from_utf8(path)
                && let Ok(contents) = std::fs::read(worktree.join(rel))
            {
                contents.hash(&mut hasher);
            }
        }
    }

    DiffSnapshot::Known(hasher.finish())
}

/// Classify the observed signals into a [`FailureClassification`].
/// Returns `None` only when the step completed cleanly (marker says
/// `Completed`, no diff probe disagreement, no lifecycle failure).
pub fn classify(inputs: ClassifyInputs<'_>) -> Option<FailureClassification> {
    // 1. Spawn errors win — there is no AgentResult to consult.
    if let Some(detail) = inputs.spawn_error {
        return Some(classify_spawn_error(inputs.provider, detail));
    }

    // 2. Supervisor's own terminal verdict beats anything in the byte stream.
    if matches!(inputs.lifecycle_phase, SessionLifecyclePhase::TimedOut) {
        return Some(FailureClassification::Timeout {
            after: inputs.timeout_after.unwrap_or(Duration::ZERO),
        });
    }

    // 3. Non-zero exit — try to attribute to auth/quota first, then fall
    //    through to the generic role/exit-code variant.
    let exit = inputs.session_exit_code;
    let non_zero_exit = matches!(exit, Some(code) if code != 0);
    if non_zero_exit
        && let Some(hint) = classify_from_hints(inputs.provider, inputs.transcript_hints)
    {
        return Some(hint);
    }
    if non_zero_exit {
        return Some(FailureClassification::AgentNonZeroExit {
            exit_code: exit.unwrap_or(-1),
            role: inputs.role.to_owned(),
        });
    }

    // 4. Marker outcome takes over now that the supervisor exited 0.
    match inputs.marker_outcome {
        Err(err) => Some(FailureClassification::MalformedMarker {
            detail: err.to_string(),
        }),
        Ok(None) => {
            // The marker is silent — let transcript hints attribute the
            // failure when possible, else fall back to MissingMarker.
            classify_from_hints(inputs.provider, inputs.transcript_hints)
                .or(Some(FailureClassification::MissingMarker))
        }
        Ok(Some(step_result)) => {
            classify_marker_outcome(step_result, inputs.step_kind, inputs.diff_probe)
        }
    }
}

/// Map a pre-spawn failure (worktree setup, role resolve, supervisor.launch
/// returning Err) into the right terminal classification — `CliMissing` when
/// the detail names a missing binary, otherwise `SpawnError`.
pub fn classify_spawn_error(provider: AgentProvider, detail: &str) -> FailureClassification {
    if is_cli_missing_detail(detail) {
        let binary = provider.to_string();
        let install_hint = install_hint_for(provider);
        FailureClassification::CliMissing {
            binary,
            install_hint,
        }
    } else {
        FailureClassification::SpawnError {
            detail: detail.to_owned(),
        }
    }
}

fn is_cli_missing_detail(detail: &str) -> bool {
    let lower = detail.to_ascii_lowercase();
    lower.contains("no such file or directory")
        || lower.contains("command not found")
        || lower.contains("not found")
        || lower.contains("entity not found")
        || lower.contains("os error 2")
}

fn install_hint_for(provider: AgentProvider) -> String {
    match provider {
        AgentProvider::Claude => {
            "install the `claude` CLI from https://docs.anthropic.com/claude/cli and confirm it is on $PATH".to_owned()
        }
        AgentProvider::Codex => {
            "install the `codex` CLI from https://github.com/openai/codex and confirm it is on $PATH".to_owned()
        }
    }
}

fn classify_from_hints(
    provider: AgentProvider,
    hints: &TranscriptHints,
) -> Option<FailureClassification> {
    if hints.quota_exceeded {
        return Some(FailureClassification::QuotaExceeded {
            provider,
            reset_at: hints.quota_reset_at.clone(),
        });
    }
    if hints.auth_required {
        return Some(FailureClassification::AuthRequired { provider });
    }
    if let Some(summary) = &hints.tests_failed {
        return Some(FailureClassification::TestsFailed {
            summary: summary.clone(),
        });
    }
    None
}

fn classify_marker_outcome(
    step_result: &StepResult,
    step_kind: LaunchStepKind,
    diff_probe: &dyn DiffProbe,
) -> Option<FailureClassification> {
    match step_result.status {
        StepResultStatus::Completed => {
            if matches!(step_kind, LaunchStepKind::Implement) && !diff_probe.has_changes() {
                Some(FailureClassification::NoDiff)
            } else {
                None
            }
        }
        StepResultStatus::NeedsHuman | StepResultStatus::Failed => {
            Some(FailureClassification::AgentReported {
                status: step_result.status,
                summary: step_result.summary.clone(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use superkick_core::{FailureDisposition, LaunchStepKind};

    #[test]
    fn diff_snapshot_same_payload_compares_equal() {
        assert!(DiffSnapshot::of(b"diff-a").same_as(&DiffSnapshot::of(b"diff-a")));
    }

    #[test]
    fn diff_snapshot_distinct_payload_compares_unequal() {
        assert!(!DiffSnapshot::of(b"diff-a").same_as(&DiffSnapshot::of(b"diff-b")));
    }

    #[test]
    fn diff_snapshot_unknown_never_matches() {
        // Fail-open: a probe error must never look like "no progress".
        assert!(!DiffSnapshot::Unknown.same_as(&DiffSnapshot::Unknown));
        assert!(!DiffSnapshot::Unknown.same_as(&DiffSnapshot::of(b"x")));
        assert!(!DiffSnapshot::of(b"x").same_as(&DiffSnapshot::Unknown));
    }

    #[derive(Debug, Default)]
    struct StubProbe {
        has_changes: bool,
    }

    impl DiffProbe for StubProbe {
        fn has_changes(&self) -> bool {
            self.has_changes
        }
    }

    fn base_inputs<'a>(
        lifecycle: &'a SessionLifecyclePhase,
        marker: Result<Option<&'a StepResult>, &'a MarkerError>,
        hints: &'a TranscriptHints,
        probe: &'a dyn DiffProbe,
    ) -> ClassifyInputs<'a> {
        ClassifyInputs {
            provider: AgentProvider::Claude,
            role: "implementer",
            step_kind: LaunchStepKind::Implement,
            session_exit_code: Some(0),
            lifecycle_phase: lifecycle,
            timeout_after: None,
            marker_outcome: marker,
            transcript_hints: hints,
            spawn_error: None,
            diff_probe: probe,
        }
    }

    #[test]
    fn completed_marker_with_diff_is_success() {
        let probe = StubProbe { has_changes: true };
        let hints = TranscriptHints::default();
        let marker = StepResult {
            status: StepResultStatus::Completed,
            summary: "done".into(),
            changed_files: vec!["a.rs".into()],
            questions: vec![],
        };
        let phase = SessionLifecyclePhase::Completed { exit_code: 0 };
        let result = classify(base_inputs(&phase, Ok(Some(&marker)), &hints, &probe));
        assert!(result.is_none(), "got {result:?}");
    }

    #[test]
    fn completed_implement_with_no_diff_yields_no_diff() {
        let probe = StubProbe { has_changes: false };
        let hints = TranscriptHints::default();
        let marker = StepResult {
            status: StepResultStatus::Completed,
            summary: "done".into(),
            changed_files: vec![],
            questions: vec![],
        };
        let phase = SessionLifecyclePhase::Completed { exit_code: 0 };
        let result = classify(base_inputs(&phase, Ok(Some(&marker)), &hints, &probe))
            .expect("classification");
        assert_eq!(result, FailureClassification::NoDiff);
        assert_eq!(result.disposition(), FailureDisposition::NeedsHuman);
    }

    #[test]
    fn non_implement_completed_ignores_diff_probe() {
        let probe = StubProbe { has_changes: false };
        let hints = TranscriptHints::default();
        let marker = StepResult {
            status: StepResultStatus::Completed,
            summary: "review ok".into(),
            changed_files: vec![],
            questions: vec![],
        };
        let phase = SessionLifecyclePhase::Completed { exit_code: 0 };
        let mut inputs = base_inputs(&phase, Ok(Some(&marker)), &hints, &probe);
        inputs.step_kind = LaunchStepKind::Review;
        assert!(classify(inputs).is_none());
    }

    #[test]
    fn marker_needs_human_routes_to_agent_reported() {
        let probe = StubProbe { has_changes: true };
        let hints = TranscriptHints::default();
        let marker = StepResult {
            status: StepResultStatus::NeedsHuman,
            summary: "blocked on rate limit".into(),
            changed_files: vec![],
            questions: vec![],
        };
        let phase = SessionLifecyclePhase::Completed { exit_code: 0 };
        let c = classify(base_inputs(&phase, Ok(Some(&marker)), &hints, &probe)).expect("some");
        assert_eq!(
            c,
            FailureClassification::AgentReported {
                status: StepResultStatus::NeedsHuman,
                summary: "blocked on rate limit".into(),
            }
        );
        assert_eq!(c.disposition(), FailureDisposition::NeedsHuman);
    }

    #[test]
    fn marker_failed_routes_to_terminal_failed() {
        let probe = StubProbe { has_changes: false };
        let hints = TranscriptHints::default();
        let marker = StepResult {
            status: StepResultStatus::Failed,
            summary: "give up".into(),
            changed_files: vec![],
            questions: vec![],
        };
        let phase = SessionLifecyclePhase::Completed { exit_code: 0 };
        let c = classify(base_inputs(&phase, Ok(Some(&marker)), &hints, &probe)).expect("some");
        assert_eq!(c.disposition(), FailureDisposition::Failed);
    }

    #[test]
    fn missing_marker_yields_missing_marker_when_no_hints() {
        let probe = StubProbe::default();
        let hints = TranscriptHints::default();
        let phase = SessionLifecyclePhase::Completed { exit_code: 0 };
        let c = classify(base_inputs(&phase, Ok(None), &hints, &probe)).expect("some");
        assert_eq!(c, FailureClassification::MissingMarker);
        assert_eq!(c.disposition(), FailureDisposition::NeedsHuman);
    }

    #[test]
    fn malformed_marker_yields_malformed_marker() {
        let probe = StubProbe::default();
        let hints = TranscriptHints::default();
        let phase = SessionLifecyclePhase::Completed { exit_code: 0 };
        // Provoke a real MarkerError by feeding the marker scanner garbage.
        // The wrapper here only needs Display, so we synthesise one via the
        // From<serde_json::Error> impl on MarkerError.
        let serde_err = serde_json::from_str::<StepResult>("not json").unwrap_err();
        let err: MarkerError = serde_err.into();
        let c = classify(base_inputs(&phase, Err(&err), &hints, &probe)).expect("some");
        match c {
            FailureClassification::MalformedMarker { detail } => {
                assert!(!detail.is_empty(), "detail must be non-empty");
            }
            other => panic!("expected MalformedMarker, got {other:?}"),
        }
    }

    #[test]
    fn quota_hint_overrides_missing_marker() {
        let probe = StubProbe::default();
        let hints = TranscriptHints {
            quota_exceeded: true,
            quota_reset_at: Some("3:42pm".into()),
            ..TranscriptHints::default()
        };
        let phase = SessionLifecyclePhase::Completed { exit_code: 0 };
        let c = classify(base_inputs(&phase, Ok(None), &hints, &probe)).expect("some");
        assert_eq!(
            c,
            FailureClassification::QuotaExceeded {
                provider: AgentProvider::Claude,
                reset_at: Some("3:42pm".into()),
            }
        );
    }

    #[test]
    fn auth_hint_overrides_missing_marker() {
        let probe = StubProbe::default();
        let hints = TranscriptHints {
            auth_required: true,
            ..TranscriptHints::default()
        };
        let phase = SessionLifecyclePhase::Completed { exit_code: 0 };
        let c = classify(base_inputs(&phase, Ok(None), &hints, &probe)).expect("some");
        assert_eq!(
            c,
            FailureClassification::AuthRequired {
                provider: AgentProvider::Claude,
            }
        );
    }

    #[test]
    fn timeout_phase_wins_over_marker() {
        let probe = StubProbe::default();
        let hints = TranscriptHints::default();
        // Marker says completed, but the supervisor reported a timeout — the
        // supervisor's verdict beats the byte stream.
        let marker = StepResult {
            status: StepResultStatus::Completed,
            summary: "x".into(),
            changed_files: vec![],
            questions: vec![],
        };
        let phase = SessionLifecyclePhase::TimedOut;
        let mut inputs = base_inputs(&phase, Ok(Some(&marker)), &hints, &probe);
        inputs.timeout_after = Some(Duration::from_secs(600));
        let c = classify(inputs).expect("some");
        assert_eq!(
            c,
            FailureClassification::Timeout {
                after: Duration::from_secs(600),
            }
        );
        assert_eq!(c.disposition(), FailureDisposition::NeedsHuman);
    }

    #[test]
    fn non_zero_exit_with_auth_hint_picks_auth() {
        let probe = StubProbe::default();
        let hints = TranscriptHints {
            auth_required: true,
            ..TranscriptHints::default()
        };
        let phase = SessionLifecyclePhase::Failed {
            exit_code: Some(2),
            reason: "exit 2".into(),
        };
        let mut inputs = base_inputs(&phase, Ok(None), &hints, &probe);
        inputs.session_exit_code = Some(2);
        let c = classify(inputs).expect("some");
        assert!(matches!(c, FailureClassification::AuthRequired { .. }));
    }

    #[test]
    fn non_zero_exit_without_hints_falls_back_to_non_zero_exit() {
        let probe = StubProbe::default();
        let hints = TranscriptHints::default();
        let phase = SessionLifecyclePhase::Failed {
            exit_code: Some(137),
            reason: "killed".into(),
        };
        let mut inputs = base_inputs(&phase, Ok(None), &hints, &probe);
        inputs.session_exit_code = Some(137);
        let c = classify(inputs).expect("some");
        assert_eq!(
            c,
            FailureClassification::AgentNonZeroExit {
                exit_code: 137,
                role: "implementer".into(),
            }
        );
    }

    #[test]
    fn spawn_error_cli_missing_yields_cli_missing() {
        let probe = StubProbe::default();
        let hints = TranscriptHints::default();
        let phase = SessionLifecyclePhase::Spawning;
        let mut inputs = base_inputs(&phase, Ok(None), &hints, &probe);
        let detail = "No such file or directory (os error 2)";
        inputs.spawn_error = Some(detail);
        let c = classify(inputs).expect("some");
        match c {
            FailureClassification::CliMissing {
                binary,
                install_hint,
            } => {
                assert_eq!(binary, "claude");
                assert!(!install_hint.is_empty());
            }
            other => panic!("expected CliMissing, got {other:?}"),
        }
    }

    #[test]
    fn spawn_error_other_yields_spawn_error() {
        let probe = StubProbe::default();
        let hints = TranscriptHints::default();
        let phase = SessionLifecyclePhase::Spawning;
        let mut inputs = base_inputs(&phase, Ok(None), &hints, &probe);
        let detail = "permission denied";
        inputs.spawn_error = Some(detail);
        let c = classify(inputs).expect("some");
        match c {
            FailureClassification::SpawnError { detail } => {
                assert_eq!(detail, "permission denied");
            }
            other => panic!("expected SpawnError, got {other:?}"),
        }
        assert_eq!(
            FailureClassification::SpawnError { detail: "x".into() }.disposition(),
            FailureDisposition::Failed,
        );
    }
}
