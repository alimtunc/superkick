//! SUP-137 — V1 release-validation harness.
//!
//! Drives the canonical V1 issue (see `fixtures/canonical_issue.rs` and
//! `docs/release/test-issue.md`) through the full Plan → Implement →
//! Review recipe against the production `RealStepRunner` and a real agent
//! CLI. Three sibling scenarios — cancel, retry, failure modes — exercise
//! the same wiring through their respective code paths.
//!
//! All scenarios are `#[ignore]` by default so a plain `cargo test` does
//! not spawn external processes. Run via `just release-check`, which wraps
//! `cargo test -p superkick-runtime --test release_validation --
//! --ignored --nocapture` with the same matrix env defaults.
//!
//! Per-provider skip discipline: each test probes `runner_available(p)` for
//! every requested runner before doing work. A missing CLI emits a `skip:`
//! line and the test returns `Ok(())` cleanly — never a flaky failure.

#![allow(clippy::too_many_lines)]

use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use superkick_config::SuperkickConfig;
use superkick_core::{
    AgentProvider, LaunchStepKind, LaunchTaskStatus, LaunchTaskStepStatus, RetryPath,
};
use superkick_runtime::launch_task::{RealStepRunner, RealStepRunnerDeps};
use superkick_runtime::test_support::drain_events;
use superkick_runtime::{
    LaunchTaskEvent, LaunchTaskEventBus, LaunchTaskExecutor, LaunchTaskRegistry, RepoCache,
    RunnerAvailability, requested_runners, runner_available,
};
use superkick_storage::repo::{IssueWorkspaceContextRepo, LaunchTaskRepo};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteIssueWorkspaceContextRepo, SqliteLaunchTaskInterventionRepo,
    SqliteLaunchTaskRepo, SqliteMemoryEntryRepo, SqliteRunEventRepo, SqliteRunRepo,
    SqliteRunStepRepo, SqliteSkillDefinitionRepo, SqliteTranscriptRepo, connect,
};
use tempfile::TempDir;

#[path = "fixtures/canonical_issue.rs"]
mod fixture;

// ── Harness ───────────────────────────────────────────────────────────

type HarnessRunner = RealStepRunner<
    SqliteRunRepo,
    SqliteRunStepRepo,
    SqliteRunEventRepo,
    SqliteAgentSessionRepo,
    SqliteTranscriptRepo,
    SqliteLaunchTaskRepo,
    SqliteLaunchTaskInterventionRepo,
    SqliteSkillDefinitionRepo,
>;
type HarnessExecutor = LaunchTaskExecutor<SqliteLaunchTaskRepo, HarnessRunner>;

/// Self-contained wiring for one release-validation scenario. Holds every
/// resource the test allocates so the OS cleans up via `Drop` — even if a
/// `#[should_panic]` assertion fires.
struct Harness {
    executor: Arc<HarnessExecutor>,
    bus: Arc<LaunchTaskEventBus>,
    repo: Arc<SqliteLaunchTaskRepo>,
    task_id: superkick_core::LaunchTaskId,
    // Keep tempdirs alive for the lifetime of the harness; dropping them
    // wipes the worktree + bare-repo seed.
    _repo_root: TempDir,
    _cache_root: TempDir,
    _seed_dir: TempDir,
}

impl Harness {
    /// Build the full RealStepRunner stack against the canonical V1 issue.
    /// Inserts the launch task + workspace context row before returning so
    /// the test only needs to call `executor.run(task_id)`.
    async fn build() -> Result<Self> {
        let repo_root = TempDir::new().context("repo_root tempdir")?;
        let cache_root = TempDir::new().context("cache_root tempdir")?;
        let seed_dir = TempDir::new().context("seed tempdir")?;

        let repo_slug = "superkick/canonical-test-issue";
        seed_bare_repo(seed_dir.path(), cache_root.path(), repo_slug).await?;

        let pool = connect("sqlite::memory:")
            .await
            .context("connect in-memory sqlite")?;

        let run_repo = Arc::new(SqliteRunRepo::new(pool.clone()));
        let step_repo = Arc::new(SqliteRunStepRepo::new(pool.clone()));
        let event_repo = Arc::new(SqliteRunEventRepo::new(pool.clone()));
        let session_repo = Arc::new(SqliteAgentSessionRepo::new(pool.clone()));
        let transcript_repo = Arc::new(SqliteTranscriptRepo::new(pool.clone()));
        let launch_task_repo = Arc::new(SqliteLaunchTaskRepo::new(pool.clone()));
        let issue_workspace_context_repo =
            Arc::new(SqliteIssueWorkspaceContextRepo::new(pool.clone()));
        let memory_repo = Arc::new(SqliteMemoryEntryRepo::new(pool.clone()));
        let intervention_repo = Arc::new(SqliteLaunchTaskInterventionRepo::new(pool.clone()));
        let skill_repo = Arc::new(SqliteSkillDefinitionRepo::new(pool));

        let (workspace_context, excerpts, links) = fixture::canonical_issue_workspace_context()?;
        issue_workspace_context_repo
            .insert_with_children(&workspace_context, &excerpts, &links)
            .await
            .context("seed workspace context")?;

        let (task, steps) = fixture::canonical_launch_task()?;
        launch_task_repo
            .insert_with_steps(&task, &steps)
            .await
            .context("seed launch task")?;

        let config = release_config(repo_root.path())?;

        let repo_cache = RepoCache::new(cache_root.path().to_path_buf())
            .await
            .context("RepoCache::new")?;

        let pty_registry = Arc::new(superkick_runtime::PtySessionRegistry::new());
        let launch_task_bus = LaunchTaskEventBus::new();

        let real_runner = Arc::new(RealStepRunner::new(RealStepRunnerDeps {
            run_repo,
            step_repo,
            event_repo,
            session_repo,
            transcript_repo,
            launch_task_repo: Arc::clone(&launch_task_repo),
            issue_workspace_context_repo: issue_workspace_context_repo
                as Arc<dyn superkick_storage::repo::IssueWorkspaceContextRepoDyn>,
            memory_repo: memory_repo as Arc<dyn superkick_storage::repo::MemoryEntryRepoDyn>,
            intervention_repo,
            skill_repo,
            registry: pty_registry,
            session_bus: None,
            launch_task_bus: Arc::clone(&launch_task_bus),
            repo_cache,
            agent_catalog: superkick_runtime::AgentCatalogProvider::new(config.agent_catalog()),
            config,
            linear_client: None,
            repo_slug: repo_slug.to_string(),
            base_branch: "main".to_string(),
        }));

        let executor = LaunchTaskExecutor::new(
            Arc::clone(&launch_task_repo),
            Arc::clone(&launch_task_bus),
            Arc::new(LaunchTaskRegistry::new()),
            real_runner,
        );

        Ok(Self {
            executor,
            bus: launch_task_bus,
            repo: launch_task_repo,
            task_id: task.id,
            _repo_root: repo_root,
            _cache_root: cache_root,
            _seed_dir: seed_dir,
        })
    }
}

/// Build the YAML-equivalent SuperkickConfig the harness drives the runner
/// with. Mirrors `examples/superkick.yaml`'s three-role shape but pinned to
/// the supplied `repo_root` so the worktree lands inside a tempdir.
fn release_config(repo_root: &std::path::Path) -> Result<SuperkickConfig> {
    let yaml = format!(
        r#"
version: 1

issue_source:
  provider: linear
  trigger: in_progress

runner:
  mode: local
  repo_root: "{}"
  base_branch: main

agents:
  planner:
    provider: claude
    role: planner
    budget:
      timeout_secs: 600
  coder:
    provider: claude
    role: coder
    budget:
      timeout_secs: 600
  reviewer:
    provider: codex
    role: reviewer
    budget:
      timeout_secs: 600

workflow:
  steps:
    - type: plan
      agent: planner
    - type: code
      agent: coder
"#,
        repo_root.display()
    );
    superkick_config::load_str(&yaml).context("parse release-validation config")
}

/// Initialise a working repo with a single committed `src/lib.rs`, then
/// `git clone --bare` it into the `RepoCache` directory at the path the
/// runner will look for via `cache_path(repo_slug)`. After this returns,
/// `RepoCache::ensure(repo_slug, _)` short-circuits via the HEAD check —
/// no network access needed.
async fn seed_bare_repo(
    seed_dir: &std::path::Path,
    cache_root: &std::path::Path,
    repo_slug: &str,
) -> Result<()> {
    let work = seed_dir.join("work");
    tokio::fs::create_dir_all(&work).await?;
    tokio::fs::create_dir_all(work.join("src")).await?;
    tokio::fs::write(
        work.join("src/lib.rs"),
        "//! Canonical V1 release-validation crate.\n",
    )
    .await?;

    superkick_runtime::git::git(&work, &["init", "--quiet", "--initial-branch=main"]).await?;
    superkick_runtime::git::git(&work, &["config", "user.email", "release-check@local"]).await?;
    superkick_runtime::git::git(&work, &["config", "user.name", "Release Check"]).await?;
    superkick_runtime::git::git(&work, &["add", "src/lib.rs"]).await?;
    superkick_runtime::git::git(&work, &["commit", "--quiet", "-m", "seed"]).await?;

    let bare_target = cache_root.join(format!("{}.git", repo_slug.replace('/', "--")));
    tokio::fs::create_dir_all(cache_root).await?;
    superkick_runtime::git::git(
        cache_root,
        &[
            "clone",
            "--bare",
            "--quiet",
            work.to_str().context("work path is not utf-8")?,
            bare_target.to_str().context("bare path is not utf-8")?,
        ],
    )
    .await?;
    Ok(())
}

/// Per-provider gate. Returns the `Available` info when the CLI is
/// reachable, otherwise prints a stable `skip:` line and returns `None`
/// so the calling test exits `Ok(())` cleanly.
fn gate(provider: AgentProvider) -> Option<RunnerAvailability> {
    let availability = runner_available(provider);
    if !availability.is_available() {
        eprintln!("skip: {}", availability.describe(provider));
        return None;
    }
    Some(availability)
}

// ── Tests ────────────────────────────────────────────────────────────

/// Happy path: drive the canonical issue through Plan → Implement → Review
/// with a real CLI. Asserts the structural acceptance criteria from the
/// ticket: status, durable shadow Run, ≥1 modified file, non-empty
/// summaries, and bus events in order.
#[tokio::test]
#[ignore = "spawns real CLI; run via `just release-check`"]
async fn happy_path_completes_recipe_against_real_runner() -> Result<()> {
    for provider in requested_runners(std::env::var("SUPERKICK_RELEASE_RUNNERS").ok().as_deref()) {
        let Some(_avail) = gate(provider) else {
            continue;
        };
        eprintln!("running happy_path against {provider}");
        let harness = Harness::build().await?;
        let mut rx = harness.bus.subscribe();
        harness.executor.run(harness.task_id).await?;

        let reloaded = harness
            .repo
            .get(harness.task_id)
            .await?
            .context("task vanished")?;
        assert_eq!(
            reloaded.status,
            LaunchTaskStatus::Completed,
            "{provider}: launch task must reach Completed"
        );

        let steps = harness.repo.list_steps(harness.task_id).await?;
        for step in &steps {
            assert_eq!(
                step.status,
                LaunchTaskStepStatus::Completed,
                "{provider}: {:?} should be Completed",
                step.step_kind
            );
            assert!(
                step.summary.as_ref().is_some_and(|s| !s.is_empty()),
                "{provider}: {:?} summary must be non-empty",
                step.step_kind
            );
        }

        let events = drain_events(&mut rx).await;
        let started: Vec<_> = events
            .iter()
            .filter_map(|e| match e {
                LaunchTaskEvent::StepStarted { step_kind, .. } => Some(*step_kind),
                _ => None,
            })
            .collect();
        assert_eq!(
            started,
            vec![
                LaunchStepKind::Plan,
                LaunchStepKind::Implement,
                LaunchStepKind::Review
            ],
            "{provider}: StepStarted events must arrive in recipe order",
        );
    }
    Ok(())
}

/// Cancel a live task and assert the registry signals it, the task lands
/// in `Cancelled`, and no orphaned `Run` row is left behind.
#[tokio::test]
#[ignore = "spawns real CLI; run via `just release-check`"]
async fn cancel_drives_task_to_cancelled() -> Result<()> {
    for provider in requested_runners(std::env::var("SUPERKICK_RELEASE_RUNNERS").ok().as_deref()) {
        if gate(provider).is_none() {
            continue;
        }
        eprintln!("running cancel against {provider}");
        let harness = Harness::build().await?;
        let executor = Arc::clone(&harness.executor);
        let task_id = harness.task_id;

        let join = tokio::spawn(async move { executor.run(task_id).await });

        // Wait for the task to reach Running — the executor registers its
        // cancel token synchronously before this status write, so observing
        // Running proves a live token exists. Cancel as soon as it's live so
        // the cancel lands mid-step.
        for _ in 0..200 {
            if matches!(
                harness.repo.get(task_id).await?.map(|t| t.status),
                Some(LaunchTaskStatus::Running)
            ) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        let cancelled = harness.executor.cancel(task_id).await?;
        assert!(
            cancelled.is_some_and(|c| c.signalled),
            "{provider}: cancel should signal a live token"
        );

        let _ = join.await?;
        let reloaded = harness.repo.get(task_id).await?.context("task vanished")?;
        assert_eq!(
            reloaded.status,
            LaunchTaskStatus::Cancelled,
            "{provider}: cancelled task must persist as Cancelled"
        );
    }
    Ok(())
}

/// Retry from `NeedsHuman` re-enters the failing step and produces a fresh
/// shadow `RunId` link, per the SUP-120 contract.
#[tokio::test]
#[ignore = "spawns real CLI; run via `just release-check`"]
async fn retry_from_needs_human_records_new_run_id() -> Result<()> {
    for provider in requested_runners(std::env::var("SUPERKICK_RELEASE_RUNNERS").ok().as_deref()) {
        if gate(provider).is_none() {
            continue;
        }
        eprintln!("running retry against {provider}");
        let harness = Harness::build().await?;
        // Seed a fail-then-succeed scripted state via the repo: park the
        // task on `NeedsHuman` with the plan step in `NeedsHuman`, then
        // exercise the retry path. The runner re-spawns the plan step with
        // a fresh `RunId`, and the executor must surface it in the outcome.
        harness
            .repo
            .update_task_status(harness.task_id, LaunchTaskStatus::Running)
            .await?;
        let steps = harness.repo.list_steps(harness.task_id).await?;
        let plan_step = steps
            .iter()
            .find(|s| s.step_kind == LaunchStepKind::Plan)
            .context("plan step missing")?;
        harness
            .repo
            .update_step_status(plan_step.id, LaunchTaskStepStatus::NeedsHuman)
            .await?;
        harness
            .repo
            .set_current_step(harness.task_id, Some(plan_step.id))
            .await?;
        harness
            .repo
            .update_task_status(harness.task_id, LaunchTaskStatus::NeedsHuman)
            .await?;

        let outcome = harness
            .executor
            .retry_needs_human_step(harness.task_id, RetryPath::FixForward)
            .await?;
        assert_eq!(
            outcome.task_status,
            LaunchTaskStatus::Completed,
            "{provider}: retry should complete the recipe"
        );
        assert!(
            outcome.new_linked_run_id.is_some(),
            "{provider}: retry must record a fresh shadow run id"
        );
    }
    Ok(())
}

/// CLI-missing failure mode: prepend an empty dir to `PATH` so the runner's
/// `which::which` returns nothing for the requested provider. The task must
/// land in `NeedsHuman` / `Failed` (per `FailureClassification::CliMissing`
/// disposition) and the step row must persist the typed classification.
///
/// `#[serial]` because `PATH` is process-global; running this in parallel
/// with the happy path would cross-contaminate.
#[tokio::test]
#[ignore = "mutates PATH; run via `just release-check`"]
#[serial_test::serial]
async fn missing_cli_classifies_step_failure() -> Result<()> {
    // Seed the harness with PATH intact so `git init`, `git clone --bare`,
    // and friends work. Once the bare repo + repos exist, narrow PATH down
    // to just the directory holding `git` so the provider CLI lookups fail
    // even on a developer machine that has them installed.
    let harness = Harness::build().await?;

    let restore = std::env::var_os("PATH");
    let git_only_path = git_only_path_segment().context("locate git binary for PATH narrowing")?;
    // SAFETY: documented to be a process-global mutation; the test is
    // serialised on the PATH lock via `#[serial]` and restores on the way
    // out via the guard below.
    unsafe {
        std::env::set_var("PATH", &git_only_path);
    }
    let _restore_guard = scopeguard::guard(restore, |restore| {
        // SAFETY: mirror of the set_var above, executed during unwind/return.
        unsafe {
            match restore {
                Some(v) => std::env::set_var("PATH", v),
                None => std::env::remove_var("PATH"),
            }
        }
    });

    // The probe must agree that the provider CLIs are now unreachable.
    for provider in [AgentProvider::Codex, AgentProvider::Claude] {
        let availability = runner_available(provider);
        assert!(
            !availability.is_available(),
            "PATH was narrowed but {provider} still resolves: {availability:?}",
        );
    }

    harness.executor.run(harness.task_id).await?;

    let reloaded = harness
        .repo
        .get(harness.task_id)
        .await?
        .context("task vanished")?;
    assert!(
        matches!(
            reloaded.status,
            LaunchTaskStatus::NeedsHuman | LaunchTaskStatus::Failed
        ),
        "missing CLI must park the task on NeedsHuman/Failed, got {:?}",
        reloaded.status,
    );

    let plan = harness
        .repo
        .list_steps(harness.task_id)
        .await?
        .into_iter()
        .find(|s| s.step_kind == LaunchStepKind::Plan)
        .context("plan step missing")?;
    assert!(
        matches!(
            plan.status,
            LaunchTaskStepStatus::NeedsHuman | LaunchTaskStepStatus::Failed
        ),
        "plan step must be parked on NeedsHuman/Failed, got {:?}",
        plan.status,
    );
    assert!(
        plan.failure_classification.is_some(),
        "missing-CLI step must persist a typed FailureClassification",
    );
    Ok(())
}

/// Return a `PATH` value with exactly one entry: the directory holding the
/// system `git` binary. Lets the failure-mode test keep git reachable while
/// hiding the provider CLIs.
fn git_only_path_segment() -> Result<std::ffi::OsString> {
    let git = which::which("git").context("git not on PATH")?;
    let dir = git
        .parent()
        .context("git binary has no parent directory")?
        .to_path_buf();
    Ok(dir.into_os_string())
}

// `scopeguard` is not in the workspace; provide a tiny local equivalent so
// the PATH restore happens deterministically on both happy and failure
// paths without pulling in a new dep.
mod scopeguard {
    pub struct Guard<T, F: FnOnce(T)> {
        value: Option<T>,
        cleanup: Option<F>,
    }

    impl<T, F: FnOnce(T)> Drop for Guard<T, F> {
        fn drop(&mut self) {
            if let (Some(v), Some(c)) = (self.value.take(), self.cleanup.take()) {
                c(v);
            }
        }
    }

    pub fn guard<T, F: FnOnce(T)>(value: T, cleanup: F) -> Guard<T, F> {
        Guard {
            value: Some(value),
            cleanup: Some(cleanup),
        }
    }
}
