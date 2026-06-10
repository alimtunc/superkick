//! SUP-187 — the [`RunContextSnapshot`] domain type.
//!
//! A derived, versioned, redacted projection of what a future session needs to
//! retry, resume, or take over a Launch Task — built from canonical state, safe
//! to regenerate, and never read as a source of truth. It carries pointers, not
//! payloads (diffs/memory/events are references), represents missing data as
//! `None`/empty rather than fabricating it, and holds only redacted free text.
//! See `docs/adr/SUP-187-run-context-snapshot.md` for the rationale.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::event::{EventKind, EventLevel};
use crate::id::{IssueWorkspaceContextId, LaunchTaskId, LaunchTaskStepId, RunId};
use crate::launch_task::{LaunchRecipe, LaunchStepKind, LaunchTaskStatus, LaunchTaskStepStatus};
use crate::run::{RunState, TriggerSource};
use crate::step_result::StepResultStatus;

/// Schema version of the projection. `v0` == `0`. Bump when the shape changes
/// so a persisted snapshot can be identified (and regenerated) across upgrades.
pub const RUN_CONTEXT_SNAPSHOT_VERSION: u32 = 0;

/// Derived, regenerable, redacted retry/takeover projection for one Launch Task.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunContextSnapshot {
    /// Schema version; equals [`RUN_CONTEXT_SNAPSHOT_VERSION`] at build time.
    pub version: u32,
    /// When this projection was derived. Not a canonical timestamp — it only
    /// dates the projection, which is regenerated on demand.
    pub generated_at: DateTime<Utc>,

    pub launch_task_id: LaunchTaskId,
    /// Shadow run backing the task, once any step has linked one. `None` before
    /// the first step starts.
    pub run_id: Option<RunId>,

    pub issue: SnapshotIssue,
    pub task: SnapshotTask,
    /// Shadow run state, when a run is linked.
    pub run: Option<SnapshotRun>,

    /// The recipe steps (Plan → Implement → Review) in order, with the summary
    /// and outcome of each finished step.
    pub steps: Vec<SnapshotStep>,
    /// Denormalised pointer to the step the executor is currently driving.
    pub current_step: Option<SnapshotCurrentStep>,

    pub provider: SnapshotProvider,
    pub worktree: Option<SnapshotWorktree>,
    /// Changed-file *paths* aggregated from finished step results — pointers,
    /// never contents.
    pub changed_files: SnapshotChangedFiles,
    /// Where to fetch the full (bounded) git diff — a reference, never the diff.
    pub diff_ref: Option<SnapshotDiffRef>,

    /// Summarised tail of the operator ledger (`run_events`), newest last.
    pub recent_events: Vec<SnapshotEventPointer>,

    /// Outstanding human decisions / needs-human / open questions derived from
    /// canonical state.
    pub pending_decisions: Vec<SnapshotPendingDecision>,
    /// Why the task/run is blocked, when it is paused / failed / waiting-human.
    pub blocking: Option<SnapshotBlocking>,

    /// Pointer to the memory ledger (context id), never the entries themselves.
    pub memory: Option<SnapshotMemoryRef>,
}

/// Linear issue facts. `identifier`/`title`/`status` come from the captured
/// `IssueWorkspaceContext`; `None` when no workspace has been attached yet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotIssue {
    pub linear_issue_id: String,
    pub identifier: Option<String>,
    pub title: Option<String>,
    pub status_name: Option<String>,
    /// Redacted, truncated excerpt of the issue body — a summary pointer, not
    /// the full description.
    pub body_excerpt: Option<String>,
    pub workspace_context_id: Option<IssueWorkspaceContextId>,
}

/// Launch Task aggregate facts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotTask {
    pub status: LaunchTaskStatus,
    pub recipe: LaunchRecipe,
    /// Operator-supplied objective seeded into the run, if any (redacted).
    pub objective: Option<String>,
    /// Task-level summary the executor recorded, if any (redacted).
    pub summary: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Shadow run facts relevant to resuming.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRun {
    pub state: RunState,
    pub trigger_source: TriggerSource,
    /// Terminal/failure message on the run, if any (redacted).
    pub error_message: Option<String>,
    pub finished_at: Option<DateTime<Utc>>,
}

/// One recipe step with its outcome.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotStep {
    pub sequence: u32,
    pub kind: LaunchStepKind,
    pub agent: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub status: LaunchTaskStepStatus,
    /// Redacted summary of the step's work, if recorded.
    pub summary: Option<String>,
    /// What the agent self-reported, when a structured result exists.
    pub result_status: Option<StepResultStatus>,
    /// Redacted, operator-readable reason the step did not complete, if any.
    pub failure_reason: Option<String>,
    pub linked_run_id: Option<RunId>,
}

/// Denormalised pointer to the in-flight step.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCurrentStep {
    pub step_id: LaunchTaskStepId,
    pub sequence: u32,
    pub kind: LaunchStepKind,
    pub status: LaunchTaskStepStatus,
}

/// Provider/agent/model and the opaque resume key for a takeover session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotProvider {
    pub provider: Option<String>,
    pub agent: Option<String>,
    pub model: Option<String>,
    /// Opaque provider-side thread id (Claude `session_id`, Codex `thread_id`)
    /// for resuming — not a credential, so it is carried verbatim.
    pub provider_session_id: Option<String>,
}

/// Worktree / branch facts needed to relocate the workspace.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotWorktree {
    pub path: Option<String>,
    pub base_branch: String,
    pub run_branch: Option<String>,
}

/// Changed-file pointers (paths only).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotChangedFiles {
    pub paths: Vec<String>,
    /// True when the list was capped (the full set is larger).
    pub truncated: bool,
}

/// Reference to the full diff — fetched on demand from the run diff endpoint
/// using `run_id`; the snapshot never embeds the diff.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotDiffRef {
    pub run_id: RunId,
    pub base_branch: String,
    pub head_branch: Option<String>,
    /// Whether the run still records a worktree path. When false the worktree
    /// was likely cleaned up and a live diff may be unavailable.
    pub worktree_recorded: bool,
}

/// Summarised `run_events` row — kind/level/message, never `payload_json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotEventPointer {
    pub seq: u64,
    pub at: DateTime<Utc>,
    pub kind: EventKind,
    pub level: EventLevel,
    /// Redacted short message.
    pub message: String,
}

/// Why a pending human decision exists.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PendingDecisionKind {
    TaskNeedsHuman,
    StepNeedsHuman,
    RunWaitingHuman,
    RunPaused,
    OpenQuestion,
}

impl PendingDecisionKind {
    const fn label(self) -> &'static str {
        match self {
            Self::TaskNeedsHuman => "task_needs_human",
            Self::StepNeedsHuman => "step_needs_human",
            Self::RunWaitingHuman => "run_waiting_human",
            Self::RunPaused => "run_paused",
            Self::OpenQuestion => "open_question",
        }
    }
}

/// One outstanding decision the operator (or a takeover session) must resolve.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotPendingDecision {
    pub kind: PendingDecisionKind,
    /// Redacted detail (e.g. an open question or pause reason).
    pub detail: String,
    /// Recipe step this decision is tied to, when applicable.
    pub step_sequence: Option<u32>,
}

/// Why the task/run is blocked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockingKind {
    TaskNeedsHuman,
    TaskFailed,
    RunWaitingHuman,
    RunPaused,
    RunFailed,
    RunCancelled,
}

impl BlockingKind {
    const fn label(self) -> &'static str {
        match self {
            Self::TaskNeedsHuman => "task_needs_human",
            Self::TaskFailed => "task_failed",
            Self::RunWaitingHuman => "run_waiting_human",
            Self::RunPaused => "run_paused",
            Self::RunFailed => "run_failed",
            Self::RunCancelled => "run_cancelled",
        }
    }
}

/// The single most relevant blocking reason for the task/run, if blocked.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotBlocking {
    pub kind: BlockingKind,
    /// Redacted reason.
    pub reason: String,
}

/// Pointer to the issue memory ledger — never the entries.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMemoryRef {
    pub workspace_context_id: IssueWorkspaceContextId,
    pub ledger_pointer: Option<String>,
}

/// Render caps applied when projecting the snapshot into an interactive
/// opening prompt — tighter than the persisted snapshot's own caps so the
/// injected block stays readable and the prompt cost bounded.
const RENDER_MAX_FILES: usize = 20;
const RENDER_MAX_EVENTS: usize = 8;

impl RunContextSnapshot {
    /// Render the snapshot into the opening-context block injected into a
    /// **fresh** interactive takeover. All free text is already redacted at
    /// build time, so this only formats — it never reaches back into canonical
    /// state. The layout is stable and human-readable so the agent can parse it
    /// by inspection.
    pub fn render_for_takeover(&self) -> String {
        let mut out = String::new();
        out.push_str("--- Superkick takeover context (redacted, read-only) ---\n");
        out.push_str(&format!("Issue: {}\n", self.issue_label()));
        out.push_str(&format!(
            "Task: {} · {}\n",
            self.task.recipe, self.task.status
        ));
        if let Some(objective) = &self.task.objective {
            out.push_str(&format!("Objective: {}\n", objective.trim()));
        }
        if let Some(step) = &self.current_step {
            out.push_str(&format!(
                "Current step: {} #{} ({})\n",
                step.kind, step.sequence, step.status
            ));
        }
        if let Some(wt) = &self.worktree {
            let branch = wt.run_branch.as_deref().unwrap_or("(no run branch)");
            out.push_str(&format!("Branch: {branch} (base {})\n", wt.base_branch));
            if let Some(path) = &wt.path {
                out.push_str(&format!("Worktree: {path}\n"));
            }
        }
        if let Some(provider) = &self.provider.provider {
            let model = self.provider.model.as_deref().unwrap_or("?");
            out.push_str(&format!("Prior agent: {provider}/{model}\n"));
        }
        if let Some(blocking) = &self.blocking {
            out.push_str(&format!(
                "Blocked: {} — {}\n",
                blocking.kind.label(),
                blocking.reason.trim()
            ));
        }
        if !self.changed_files.paths.is_empty() {
            let total = self.changed_files.paths.len();
            let extra = if self.changed_files.truncated {
                "+"
            } else {
                ""
            };
            out.push_str(&format!("Changed files ({total}{extra}):\n"));
            for path in self.changed_files.paths.iter().take(RENDER_MAX_FILES) {
                out.push_str(&format!("  - {path}\n"));
            }
            if total > RENDER_MAX_FILES {
                out.push_str(&format!("  … and {} more\n", total - RENDER_MAX_FILES));
            }
        }
        if !self.pending_decisions.is_empty() {
            out.push_str("Pending decisions:\n");
            for d in &self.pending_decisions {
                match d.step_sequence {
                    Some(seq) => out.push_str(&format!(
                        "  - [{} @ step {seq}] {}\n",
                        d.kind.label(),
                        d.detail.trim()
                    )),
                    None => {
                        out.push_str(&format!("  - [{}] {}\n", d.kind.label(), d.detail.trim()))
                    }
                }
            }
        }
        if !self.recent_events.is_empty() {
            let start = self.recent_events.len().saturating_sub(RENDER_MAX_EVENTS);
            out.push_str("Recent activity:\n");
            for e in &self.recent_events[start..] {
                let kind = serde_json::to_value(e.kind)
                    .ok()
                    .and_then(|v| v.as_str().map(str::to_string))
                    .unwrap_or_else(|| format!("{:?}", e.kind));
                out.push_str(&format!("  - [{kind}] {}\n", e.message.trim()));
            }
        }
        out.push_str(&format!(
            "Snapshot generated at {}\n",
            self.generated_at.to_rfc3339()
        ));
        out.push_str(
            "You are taking over this task interactively. The prior agent process is not \
             attached; use the context above to continue the work in this worktree.\n",
        );
        out.push_str("--- end takeover context ---");
        out
    }

    /// One-line header for the **resume** path: the provider restores the
    /// conversation, so the operator only needs a reminder of which task this
    /// terminal belongs to.
    pub fn render_takeover_header(&self) -> String {
        format!(
            "[Superkick] Resumed takeover for {} · {} ({}). Snapshot at {}.",
            self.issue_label(),
            self.task.recipe,
            self.task.status,
            self.generated_at.to_rfc3339()
        )
    }

    /// Best available human label for the issue: identifier — title, falling
    /// back to whichever is present, then the raw Linear id.
    fn issue_label(&self) -> String {
        match (&self.issue.identifier, &self.issue.title) {
            (Some(id), Some(title)) => format!("{id} — {}", title.trim()),
            (Some(id), None) => id.clone(),
            (None, Some(title)) => title.trim().to_string(),
            (None, None) => self.issue.linear_issue_id.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> RunContextSnapshot {
        RunContextSnapshot {
            version: RUN_CONTEXT_SNAPSHOT_VERSION,
            generated_at: Utc::now(),
            launch_task_id: LaunchTaskId::new(),
            run_id: Some(RunId::new()),
            issue: SnapshotIssue {
                linear_issue_id: "issue-uuid".into(),
                identifier: Some("SUP-187".into()),
                title: Some("RunContextSnapshot".into()),
                status_name: Some("In Progress".into()),
                body_excerpt: Some("derive a projection".into()),
                workspace_context_id: Some(IssueWorkspaceContextId::new()),
            },
            task: SnapshotTask {
                status: LaunchTaskStatus::Running,
                recipe: LaunchRecipe::PlanImplementReview,
                objective: Some("ship v0".into()),
                summary: None,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            },
            run: Some(SnapshotRun {
                state: RunState::Coding,
                trigger_source: TriggerSource::LaunchTask,
                error_message: None,
                finished_at: None,
            }),
            steps: vec![SnapshotStep {
                sequence: 1,
                kind: LaunchStepKind::Plan,
                agent: "planner".into(),
                provider: Some("claude".into()),
                model: Some("opus".into()),
                status: LaunchTaskStepStatus::Completed,
                summary: Some("planned".into()),
                result_status: Some(StepResultStatus::Completed),
                failure_reason: None,
                linked_run_id: Some(RunId::new()),
            }],
            current_step: Some(SnapshotCurrentStep {
                step_id: LaunchTaskStepId::new(),
                sequence: 2,
                kind: LaunchStepKind::Implement,
                status: LaunchTaskStepStatus::Running,
            }),
            provider: SnapshotProvider {
                provider: Some("codex".into()),
                agent: Some("coder".into()),
                model: Some("gpt".into()),
                provider_session_id: Some("thread-123".into()),
            },
            worktree: Some(SnapshotWorktree {
                path: Some("/tmp/wt".into()),
                base_branch: "main".into(),
                run_branch: Some("alimtunc/sup-187".into()),
            }),
            changed_files: SnapshotChangedFiles {
                paths: vec!["a.rs".into()],
                truncated: false,
            },
            diff_ref: Some(SnapshotDiffRef {
                run_id: RunId::new(),
                base_branch: "main".into(),
                head_branch: Some("alimtunc/sup-187".into()),
                worktree_recorded: true,
            }),
            recent_events: vec![SnapshotEventPointer {
                seq: 4,
                at: Utc::now(),
                kind: EventKind::StepStarted,
                level: EventLevel::Info,
                message: "implement started".into(),
            }],
            pending_decisions: vec![SnapshotPendingDecision {
                kind: PendingDecisionKind::OpenQuestion,
                detail: "which crate?".into(),
                step_sequence: Some(2),
            }],
            blocking: None,
            memory: Some(SnapshotMemoryRef {
                workspace_context_id: IssueWorkspaceContextId::new(),
                ledger_pointer: None,
            }),
        }
    }

    #[test]
    fn version_constant_is_zero() {
        assert_eq!(RUN_CONTEXT_SNAPSHOT_VERSION, 0);
    }

    #[test]
    fn round_trips_through_json() {
        let snap = sample();
        let json = serde_json::to_string(&snap).expect("serialize");
        let back: RunContextSnapshot = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back, snap);
    }

    #[test]
    fn serializes_field_names_as_camel_case() {
        let snap = sample();
        let json = serde_json::to_string(&snap).expect("serialize");
        assert!(json.contains("\"launchTaskId\""), "got {json}");
        assert!(json.contains("\"generatedAt\""), "got {json}");
        assert!(json.contains("\"providerSessionId\""), "got {json}");
        assert!(json.contains("\"changedFiles\""), "got {json}");
    }

    #[test]
    fn missing_data_is_explicit_null_not_fabricated() {
        let mut snap = sample();
        snap.run_id = None;
        snap.run = None;
        snap.current_step = None;
        snap.worktree = None;
        snap.diff_ref = None;
        snap.memory = None;
        snap.provider = SnapshotProvider {
            provider: None,
            agent: None,
            model: None,
            provider_session_id: None,
        };
        snap.issue.identifier = None;
        snap.issue.title = None;

        let json = serde_json::to_value(&snap).expect("serialize");
        assert!(json["runId"].is_null());
        assert!(json["run"].is_null());
        assert!(json["currentStep"].is_null());
        assert!(json["worktree"].is_null());
        assert!(json["provider"]["providerSessionId"].is_null());
        assert!(json["issue"]["title"].is_null());
    }

    #[test]
    fn blocking_kind_serializes_snake_case() {
        let blocking = SnapshotBlocking {
            kind: BlockingKind::RunWaitingHuman,
            reason: "needs approval".into(),
        };
        let json = serde_json::to_string(&blocking).expect("serialize");
        assert!(json.contains("\"run_waiting_human\""), "got {json}");
    }

    #[test]
    fn render_for_takeover_includes_key_context() {
        let rendered = sample().render_for_takeover();
        assert!(
            rendered.contains("SUP-187 — RunContextSnapshot"),
            "{rendered}"
        );
        assert!(
            rendered.contains("Task: plan_implement_review"),
            "{rendered}"
        );
        assert!(
            rendered.contains("Current step: implement #2"),
            "{rendered}"
        );
        assert!(
            rendered.contains("Branch: alimtunc/sup-187 (base main)"),
            "{rendered}"
        );
        assert!(rendered.contains("Prior agent: codex/gpt"), "{rendered}");
        assert!(rendered.contains("- a.rs"), "{rendered}");
        assert!(rendered.contains("which crate?"), "{rendered}");
        assert!(
            rendered.contains("taking over this task interactively"),
            "{rendered}"
        );
        assert!(
            rendered.ends_with("--- end takeover context ---"),
            "{rendered}"
        );
    }

    #[test]
    fn render_passes_already_redacted_text_through_verbatim() {
        // The builder redacts free text; the renderer must only format, never
        // re-introduce or alter content. A pre-redacted marker survives intact.
        let mut snap = sample();
        snap.blocking = Some(SnapshotBlocking {
            kind: BlockingKind::RunFailed,
            reason: "token [REDACTED] leaked".into(),
        });
        let rendered = snap.render_for_takeover();
        assert!(rendered.contains("token [REDACTED] leaked"), "{rendered}");
    }

    #[test]
    fn render_takeover_header_is_single_line() {
        let header = sample().render_takeover_header();
        assert!(!header.contains('\n'), "{header}");
        assert!(header.contains("SUP-187"), "{header}");
        assert!(header.contains("Resumed takeover"), "{header}");
    }

    #[test]
    fn render_falls_back_to_linear_id_when_issue_unlabelled() {
        let mut snap = sample();
        snap.issue.identifier = None;
        snap.issue.title = None;
        let rendered = snap.render_for_takeover();
        assert!(rendered.contains("Issue: issue-uuid"), "{rendered}");
    }
}
