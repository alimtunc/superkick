//! Runtime services — worktree lifecycle, agent supervision, subprocess control.

pub mod agent_spawn;
pub mod agent_supervisor;
pub mod attention_service;
pub mod cli_resume;
pub mod conversation_runner;
pub mod detector;
pub mod git;
pub mod handoff_service;
pub mod heartbeat;
pub mod interrupt_service;
pub mod launch_task_event_bus;
pub mod launch_task_executor;
pub mod launch_task_registry;
pub mod launch_task_step_runner;
pub mod linear_context;
pub mod mcp_policy;
pub mod orchestrator;
pub mod ownership_service;
pub mod protocol_adapter;
pub mod pty_io;
pub mod pty_session;
pub mod repo_cache;
pub mod session_bus;
pub mod step_engine;
pub mod terminal_takeover;
pub mod turn_event_bus;
pub mod workspace_bus;
pub mod worktree;

pub use agent_supervisor::{
    AgentHandle, AgentLaunchConfig, AgentResult, AgentSupervisor, SessionLaunchInfo,
};
pub use attention_service::AttentionService;
pub use conversation_runner::{
    ChatPermissionMode, ConversationAdapters, ConversationRunner, ConversationRunnerError,
    RunChatSnapshot, TurnOverrides, TurnStreamItem,
};
pub use detector::{RuntimeDetector, boot_refresh, capabilities_for};
pub use handoff_service::HandoffService;
pub use heartbeat::spawn_heartbeat_listener;
pub use interrupt_service::InterruptService;
pub use launch_task_event_bus::{LaunchTaskEvent, LaunchTaskEventBus};
pub use launch_task_executor::{
    CancelOutcome, LaunchTaskExecutor, RetryError, RetryOutcome, StepLinks, StepOutcome,
    StepRunner, StubStepRunner,
};
pub use launch_task_registry::{CancelDecision, LaunchTaskRegistry, ReservedSlot};

/// Namespace for the SUP-124 production `StepRunner` and its construction
/// deps. Grouped under their own path so the flat crate prelude doesn't grow
/// every time the launch-task surface gains a type.
pub mod launch_task {
    pub use crate::launch_task_step_runner::{RealStepRunner, RealStepRunnerDeps};
}
pub use orchestrator::{
    OrchestratedSession, Orchestrator, SessionObservation, spawn_lifecycle_persistence_sink,
};
pub use ownership_service::{OwnershipService, ServiceError as OwnershipServiceError};
pub use protocol_adapter::{
    ClaudeAdapterOptions, ClaudePermissionMode, ClaudeProtocolAdapter, CodexAdapterOptions,
    CodexProtocolAdapter, CodexSandboxMode, DEFAULT_EVENT_CHANNEL_CAPACITY, NoopProtocolAdapter,
    ProtocolAdapter, ProtocolEventReceiver, ProtocolEventSender, ProtocolStream, StubScript,
    TurnHandle, protocol_event_channel,
};
pub use pty_session::{PtySession, PtySessionRegistry, TakeoverEntry, WriterHolder};
pub use repo_cache::RepoCache;
pub use session_bus::SessionBus;
pub use step_engine::{StepEngine, StepEngineDeps};
pub use terminal_takeover::{SpawnedTakeover, TerminalTakeoverService};
pub use turn_event_bus::TurnEventBus;
pub use workspace_bus::{PublishingRunEventRepo, WorkspaceEventBus};
pub use worktree::{WorktreeInfo, WorktreeManager};
