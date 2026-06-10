//! SUP-187 — builders for the [`RunContextSnapshot`] projection.
//!
//! [`build_run_context_snapshot`] derives a redacted projection by reading the
//! existing repos; [`refresh_run_context_snapshot`] additionally persists the
//! regenerable cache row. Neither transitions business state, and `now` is a
//! parameter so the build is deterministic. Rationale:
//! `docs/adr/SUP-187-run-context-snapshot.md`.

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use superkick_core::{
    BlockingKind, LaunchTask, LaunchTaskId, LaunchTaskStatus, LaunchTaskStep, LaunchTaskStepStatus,
    PauseKind, PendingDecisionKind, RUN_CONTEXT_SNAPSHOT_VERSION, Run, RunContextSnapshot,
    RunState, SnapshotBlocking, SnapshotChangedFiles, SnapshotCurrentStep, SnapshotDiffRef,
    SnapshotEventPointer, SnapshotIssue, SnapshotMemoryRef, SnapshotPendingDecision,
    SnapshotProvider, SnapshotRun, SnapshotStep, SnapshotTask, SnapshotWorktree,
};
use superkick_storage::repo::{
    AgentSessionRepo, IssueWorkspaceContextRepo, LaunchTaskRepo, RunContextSnapshotRepo,
    RunEventRepo, RunRepo,
};

/// Max characters of the issue body kept as an excerpt (the full body is in the
/// workspace context).
const BODY_EXCERPT_MAX_CHARS: usize = 1000;
/// Max changed-file pointers carried before truncating (full diff is fetched on
/// demand via the run diff endpoint).
const MAX_CHANGED_FILES: usize = 100;
/// Max tail of `run_events` summarised into the snapshot.
const MAX_RECENT_EVENTS: usize = 20;

/// Failure modes for [`build_run_context_snapshot`].
#[derive(Debug, thiserror::Error)]
pub enum SnapshotError {
    /// No launch task with this id — the projection cannot be derived.
    #[error("launch task {0} not found")]
    LaunchTaskNotFound(LaunchTaskId),
    /// A repository read failed.
    #[error(transparent)]
    Storage(#[from] anyhow::Error),
}

/// Derive a redacted [`RunContextSnapshot`] for `launch_task_id` from canonical
/// state. Reads only; never transitions state. Returns
/// [`SnapshotError::LaunchTaskNotFound`] when the task does not exist.
pub async fn build_run_context_snapshot(
    launch_tasks: &impl LaunchTaskRepo,
    runs: &impl RunRepo,
    sessions: &impl AgentSessionRepo,
    events: &impl RunEventRepo,
    workspace_contexts: &impl IssueWorkspaceContextRepo,
    launch_task_id: LaunchTaskId,
    now: DateTime<Utc>,
) -> Result<RunContextSnapshot, SnapshotError> {
    let task = launch_tasks
        .get(launch_task_id)
        .await?
        .ok_or(SnapshotError::LaunchTaskNotFound(launch_task_id))?;
    let steps = launch_tasks.list_steps(launch_task_id).await?;

    // A Launch Task drives one synthetic shadow run, linked from its steps.
    let run_id = steps.iter().find_map(|s| s.linked_run_id);
    let run = match run_id {
        Some(id) => runs.get(id).await?,
        None => None,
    };
    let sessions_list = match run_id {
        Some(id) => sessions.list_by_run(id).await?,
        None => Vec::new(),
    };
    let events_list = match run_id {
        Some(id) => events.list_by_run(id).await?,
        None => Vec::new(),
    };
    let workspace = workspace_contexts
        .find_latest_by_linear_issue_id(&task.linear_issue_id)
        .await?;

    let issue = SnapshotIssue {
        linear_issue_id: task.linear_issue_id.clone(),
        identifier: workspace
            .as_ref()
            .map(|w| w.linear_issue_identifier.clone()),
        title: workspace.as_ref().map(|w| redact_text(&w.snapshot_title)),
        status_name: workspace
            .as_ref()
            .map(|w| redact_text(&w.snapshot_status_name)),
        body_excerpt: workspace.as_ref().map(|w| {
            redact_text(&crate::text::truncate_chars(
                &w.snapshot_body_md,
                BODY_EXCERPT_MAX_CHARS,
            ))
        }),
        workspace_context_id: workspace.as_ref().map(|w| w.id),
    };

    let task_proj = SnapshotTask {
        status: task.status,
        recipe: task.recipe_kind,
        objective: run
            .as_ref()
            .and_then(|r| r.operator_instructions.as_deref())
            .map(redact_text),
        summary: task.summary.as_deref().map(redact_text),
        created_at: task.created_at,
        updated_at: task.updated_at,
    };

    let run_proj = run.as_ref().map(|r| SnapshotRun {
        state: r.state,
        trigger_source: r.trigger_source,
        error_message: r.error_message.as_deref().map(redact_text),
        finished_at: r.finished_at,
    });

    let step_projs: Vec<SnapshotStep> = steps
        .iter()
        .map(|s| SnapshotStep {
            sequence: s.sequence,
            kind: s.step_kind,
            agent: s.agent_name.clone(),
            provider: s.provider.clone(),
            model: s.model.clone(),
            status: s.status,
            summary: s.summary.as_deref().map(redact_text),
            result_status: s.structured_result.as_ref().map(|r| r.status),
            failure_reason: s
                .failure_classification
                .as_ref()
                .map(|f| redact_text(&f.human_summary())),
            linked_run_id: s.linked_run_id,
        })
        .collect();

    let current_step = task.current_step_id.and_then(|cid| {
        steps
            .iter()
            .find(|s| s.id == cid)
            .map(|s| SnapshotCurrentStep {
                step_id: s.id,
                sequence: s.sequence,
                kind: s.step_kind,
                status: s.status,
            })
    });

    let focus_step = focus_step(&task, &steps);
    let provider = SnapshotProvider {
        provider: focus_step.and_then(|s| s.provider.clone()),
        agent: focus_step.map(|s| s.agent_name.clone()),
        model: focus_step.and_then(|s| s.model.clone()),
        // Opaque provider thread id (resume key) — not a credential, carried as-is.
        provider_session_id: sessions_list
            .iter()
            .rev()
            .find_map(|s| s.provider_session_id.clone()),
    };

    let worktree = run.as_ref().map(|r| SnapshotWorktree {
        path: r.worktree_path.clone(),
        base_branch: r.base_branch.clone(),
        run_branch: r.branch_name.clone(),
    });

    let changed_files = aggregate_changed_files(&steps);

    let diff_ref = run.as_ref().map(|r| SnapshotDiffRef {
        run_id: r.id,
        base_branch: r.base_branch.clone(),
        head_branch: r.branch_name.clone(),
        worktree_recorded: r.worktree_path.is_some(),
    });

    let start = events_list.len().saturating_sub(MAX_RECENT_EVENTS);
    let recent_events: Vec<SnapshotEventPointer> = events_list[start..]
        .iter()
        .map(|e| SnapshotEventPointer {
            seq: e.seq,
            at: e.ts,
            kind: e.kind,
            level: e.level,
            message: redact_text(&e.message),
        })
        .collect();

    let pending_decisions = derive_pending_decisions(&task, run.as_ref(), &steps);
    let blocking = derive_blocking(&task, run.as_ref(), &steps);

    let memory = workspace.as_ref().map(|w| SnapshotMemoryRef {
        workspace_context_id: w.id,
        ledger_pointer: w.memory_ledger_pointer.clone(),
    });

    Ok(RunContextSnapshot {
        version: RUN_CONTEXT_SNAPSHOT_VERSION,
        generated_at: now,
        launch_task_id,
        run_id,
        issue,
        task: task_proj,
        run: run_proj,
        steps: step_projs,
        current_step,
        provider,
        worktree,
        changed_files,
        diff_ref,
        recent_events,
        pending_decisions,
        blocking,
        memory,
    })
}

/// Derive a fresh [`RunContextSnapshot`] and persist it as the current
/// (regenerable) cache row for the task, returning the derived projection.
///
/// The only write is the snapshot cache upsert; a cache-write failure is logged
/// but does **not** fail the call, since the projection is regenerated on the
/// next build. Returns [`SnapshotError::LaunchTaskNotFound`] when the task does
/// not exist.
#[allow(clippy::too_many_arguments)]
pub async fn refresh_run_context_snapshot(
    launch_tasks: &impl LaunchTaskRepo,
    runs: &impl RunRepo,
    sessions: &impl AgentSessionRepo,
    events: &impl RunEventRepo,
    workspace_contexts: &impl IssueWorkspaceContextRepo,
    snapshots: &impl RunContextSnapshotRepo,
    launch_task_id: LaunchTaskId,
    now: DateTime<Utc>,
) -> Result<RunContextSnapshot, SnapshotError> {
    let snapshot = build_run_context_snapshot(
        launch_tasks,
        runs,
        sessions,
        events,
        workspace_contexts,
        launch_task_id,
        now,
    )
    .await?;
    if let Err(error) = snapshots.upsert(&snapshot).await {
        tracing::warn!(
            launch_task_id = %launch_task_id,
            error = %error,
            "failed to persist run context snapshot cache; returning derived projection"
        );
    }
    Ok(snapshot)
}

/// The step whose provider/agent/model best represents "where the task is":
/// the current step, else the latest started step, else the first step (the
/// next one to run on a not-yet-started task).
fn focus_step<'a>(task: &LaunchTask, steps: &'a [LaunchTaskStep]) -> Option<&'a LaunchTaskStep> {
    task.current_step_id
        .and_then(|cid| steps.iter().find(|s| s.id == cid))
        .or_else(|| {
            steps
                .iter()
                .rev()
                .find(|s| s.status != LaunchTaskStepStatus::Pending)
        })
        .or_else(|| steps.first())
}

fn aggregate_changed_files(steps: &[LaunchTaskStep]) -> SnapshotChangedFiles {
    let mut seen = HashSet::new();
    let mut paths = Vec::new();
    for step in steps {
        if let Some(result) = &step.structured_result {
            for file in &result.changed_files {
                if seen.insert(file.as_str()) {
                    paths.push(file.clone());
                }
            }
        }
    }
    let truncated = paths.len() > MAX_CHANGED_FILES;
    paths.truncate(MAX_CHANGED_FILES);
    SnapshotChangedFiles { paths, truncated }
}

fn derive_pending_decisions(
    task: &LaunchTask,
    run: Option<&Run>,
    steps: &[LaunchTaskStep],
) -> Vec<SnapshotPendingDecision> {
    let mut decisions = Vec::new();

    if task.status == LaunchTaskStatus::NeedsHuman {
        decisions.push(SnapshotPendingDecision {
            kind: PendingDecisionKind::TaskNeedsHuman,
            detail: task
                .summary
                .as_deref()
                .map(redact_text)
                .unwrap_or_else(|| "launch task needs human input".into()),
            step_sequence: None,
        });
    }

    for step in steps {
        if step.status == LaunchTaskStepStatus::NeedsHuman {
            let detail = step
                .failure_classification
                .as_ref()
                .map(|f| redact_text(&f.human_summary()))
                .or_else(|| step.summary.as_deref().map(redact_text))
                .unwrap_or_else(|| format!("{} step needs human input", step.step_kind));
            decisions.push(SnapshotPendingDecision {
                kind: PendingDecisionKind::StepNeedsHuman,
                detail,
                step_sequence: Some(step.sequence),
            });
        }
        if let Some(result) = &step.structured_result {
            for question in &result.questions {
                decisions.push(SnapshotPendingDecision {
                    kind: PendingDecisionKind::OpenQuestion,
                    detail: redact_text(question),
                    step_sequence: Some(step.sequence),
                });
            }
        }
    }

    if let Some(run) = run {
        if run.pause_kind != PauseKind::None {
            decisions.push(SnapshotPendingDecision {
                kind: PendingDecisionKind::RunPaused,
                detail: run
                    .pause_reason
                    .as_deref()
                    .map(redact_text)
                    .unwrap_or_else(|| format!("run paused ({})", run.pause_kind)),
                step_sequence: None,
            });
        }
        if run.state == RunState::WaitingHuman {
            decisions.push(SnapshotPendingDecision {
                kind: PendingDecisionKind::RunWaitingHuman,
                detail: "run is waiting for human input".into(),
                step_sequence: None,
            });
        }
    }

    decisions
}

/// The single most relevant blocking reason for retry/takeover. Run-level
/// blocks (waiting-human / failed / cancelled / paused) take priority because
/// retry acts on the run; task-level NeedsHuman / Failed are the fallback.
fn derive_blocking(
    task: &LaunchTask,
    run: Option<&Run>,
    steps: &[LaunchTaskStep],
) -> Option<SnapshotBlocking> {
    if let Some(run) = run {
        let from_run = match run.state {
            RunState::WaitingHuman => Some((
                BlockingKind::RunWaitingHuman,
                run.pause_reason
                    .clone()
                    .or_else(|| needs_human_reason(steps))
                    .unwrap_or_else(|| "run is waiting for human input".into()),
            )),
            RunState::Failed => Some((
                BlockingKind::RunFailed,
                run.error_message
                    .clone()
                    .or_else(|| failure_reason(steps))
                    .unwrap_or_else(|| "run failed".into()),
            )),
            RunState::Cancelled => {
                Some((BlockingKind::RunCancelled, "run was cancelled".to_string()))
            }
            _ if run.pause_kind != PauseKind::None => Some((
                BlockingKind::RunPaused,
                run.pause_reason
                    .clone()
                    .unwrap_or_else(|| format!("run paused ({})", run.pause_kind)),
            )),
            _ => None,
        };
        if let Some((kind, reason)) = from_run {
            return Some(SnapshotBlocking {
                kind,
                reason: redact_text(&reason),
            });
        }
    }

    match task.status {
        LaunchTaskStatus::NeedsHuman => Some(SnapshotBlocking {
            kind: BlockingKind::TaskNeedsHuman,
            reason: redact_text(
                &needs_human_reason(steps)
                    .unwrap_or_else(|| "launch task needs human input".into()),
            ),
        }),
        LaunchTaskStatus::Failed => Some(SnapshotBlocking {
            kind: BlockingKind::TaskFailed,
            reason: redact_text(
                &failure_reason(steps)
                    .or_else(|| task.summary.clone())
                    .unwrap_or_else(|| "launch task failed".into()),
            ),
        }),
        _ => None,
    }
}

fn failure_reason(steps: &[LaunchTaskStep]) -> Option<String> {
    steps
        .iter()
        .rev()
        .find_map(|s| s.failure_classification.as_ref().map(|f| f.human_summary()))
}

fn needs_human_reason(steps: &[LaunchTaskStep]) -> Option<String> {
    steps
        .iter()
        .rev()
        .filter(|s| s.status == LaunchTaskStepStatus::NeedsHuman)
        .find_map(|s| {
            s.failure_classification
                .as_ref()
                .map(|f| f.human_summary())
                .or_else(|| s.summary.clone())
        })
}

/// Redact a free-text field. Clean text passes through unchanged.
fn redact_text(text: &str) -> String {
    superkick_core::redaction::redact(text).into_owned()
}
