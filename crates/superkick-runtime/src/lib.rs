//! Runtime services — worktree lifecycle, agent supervision, subprocess control.

pub mod agent_spawn;
pub mod agent_supervisor;
pub mod attention_service;
pub mod cli_resume;
pub mod conversation_runner;
pub mod detector;
pub mod git;
pub mod git_ship;
pub mod heartbeat;
pub mod interrupt_service;
pub mod issue_pr_service;
pub mod launch_profile_service;
pub mod launch_queue_blockers;
pub mod launch_task_context;
pub mod launch_task_event_bus;
pub mod launch_task_executor;
pub mod launch_task_liveness;
pub mod launch_task_registry;
pub mod launch_task_step_runner;
pub mod linear_context;
pub mod mcp_policy;
pub mod ownership_service;
pub mod protocol_adapter;
pub mod pty_io;
pub mod pty_session;
pub mod pull_request_service;
pub mod queue_triage_service;
pub mod recovery_scheduler;
pub mod release_validation;
pub mod repo_cache;
pub mod run_context_snapshot_builder;
pub mod run_diff;
mod run_events;
pub mod run_service;
pub mod runner_mode;
pub mod session_bus;
pub mod step_engine;
pub mod step_failure_classifier;
pub mod terminal_takeover;
#[doc(hidden)]
pub mod test_support;
mod text;
pub mod turn_event_bus;
pub mod workspace_bus;
pub mod worktree;

pub use agent_supervisor::{
    AgentHandle, AgentLaunchConfig, AgentResult, AgentSupervisor, SessionLaunchInfo,
};
pub use attention_service::{AttentionService, AttentionServiceError};
pub use conversation_runner::{
    ChatPermissionMode, ConversationAdapters, ConversationRunner, ConversationRunnerError,
    RunChatSnapshot, TurnOverrides, TurnStreamItem,
};
pub use detector::{RuntimeDetector, boot_refresh, capabilities_for};
pub use heartbeat::spawn_heartbeat_listener;
pub use interrupt_service::InterruptService;
pub use issue_pr_service::{IssuePullRequestDiff, IssuePullRequestError, IssuePullRequestService};
pub use launch_queue_blockers::reconcile_blockers;
pub use launch_task_event_bus::{LaunchTaskEvent, LaunchTaskEventBus};
pub use launch_task_executor::{
    CancelOutcome, DEFAULT_MAX_AUTO_RESUMES, LaunchTaskExecutor, ReconcileOutcome, RetryError,
    RetryOutcome, ShadowRunTerminal, StepLinks, StepOutcome, StepRunner, StubStepRunner,
};
pub use launch_task_liveness::{
    DEFAULT_LIVENESS_SWEEP_INTERVAL, ReconcileReport, reconcile_launch_task_orphans,
    spawn_launch_task_liveness_sweep,
};
pub use launch_task_registry::{CancelDecision, LaunchTaskRegistry, ReservedSlot};

/// Namespace for the SUP-124 production `StepRunner` and its construction
/// deps. Grouped under their own path so the flat crate prelude doesn't grow
/// every time the launch-task surface gains a type.
pub mod launch_task {
    pub use crate::launch_task_step_runner::{RealStepRunner, RealStepRunnerDeps};
}
pub use launch_profile_service::{LaunchCompositionError, LaunchProfileService};
pub use ownership_service::{OwnershipService, ServiceError as OwnershipServiceError};
pub use protocol_adapter::{
    ClaudeAdapterOptions, ClaudePermissionMode, ClaudeProtocolAdapter, CodexAdapterOptions,
    CodexProtocolAdapter, CodexSandboxMode, DEFAULT_EVENT_CHANNEL_CAPACITY, ProtocolAdapter,
    ProtocolEventReceiver, ProtocolEventSender, ProtocolStream, TurnHandle, protocol_event_channel,
};
pub use pty_session::{PtySession, PtySessionRegistry, TakeoverEntry, WriterHolder};
pub use pull_request_service::{PullRequestService, ShipError, ShipOutcome};
pub use queue_triage_service::{QueueTriageService, RunTriage};
pub use recovery_scheduler::spawn_recovery_scheduler;
pub use release_validation::{RunnerAvailability, requested_runners, runner_available};
pub use repo_cache::RepoCache;
pub use run_context_snapshot_builder::{
    SnapshotError, build_run_context_snapshot, refresh_run_context_snapshot,
};
pub use run_diff::{DiffError, collect_run_diff};
pub use run_service::{LaunchTaskCanceller, RunService, RunServiceError, RunSpawn};
pub use session_bus::SessionBus;
pub use step_engine::{StepEngine, StepEngineDeps};
pub use step_failure_classifier::DiffSnapshot;
pub use terminal_takeover::{OpenTakeoverParams, SpawnedTakeover, TerminalTakeoverService};
pub use turn_event_bus::TurnEventBus;
pub use workspace_bus::{PublishingRunEventRepo, WorkspaceEventBus};
pub use worktree::{WorktreeInfo, WorktreeManager};
