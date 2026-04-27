//! Core domain types, run state machine, and step definitions.

pub mod agent;
pub mod artifact;
pub mod attach;
pub mod attention;
pub mod blocker;
pub mod error;
pub mod event;
pub mod handoff;
pub mod id;
pub mod interrupt;
pub mod issue_event;
pub mod launch_queue;
pub mod linear_context;
pub mod ownership;
pub mod pull_request;
pub mod queue;
pub mod review;
pub mod role_router;
pub mod run;
pub mod session_lifecycle;
pub mod step;
pub mod transcript;
pub mod workspace_event;

// Re-export primary types for ergonomic imports.
pub use agent::{AgentProvider, AgentSession, AgentStatus, LaunchReason};
pub use artifact::{Artifact, ArtifactKind};
pub use attach::{AttachKind, AttachPayload};
pub use attention::{AttentionKind, AttentionReply, AttentionRequest, AttentionStatus};
pub use blocker::{IssueBlocker, TERMINAL_BLOCKER_STATES, is_terminal_blocker_state};
pub use error::CoreError;
pub use event::{EventKind, EventLevel, RunEvent};
pub use handoff::{
    Handoff, HandoffFailure, HandoffKind, HandoffPayload, HandoffResult, HandoffStatus,
};
pub use id::{
    AgentSessionId, ArtifactId, AttentionRequestId, EventId, HandoffId, InterruptId,
    OwnershipEventId, PullRequestId, RunId, SessionLifecycleEventId, StepId, TranscriptChunkId,
};
pub use interrupt::{Interrupt, InterruptAction, InterruptStatus};
pub use issue_event::{DependencyResolvedPayload, IssueEvent};
pub use launch_queue::{
    ClassifiedIssue, ClassifiedRun, LaunchQueue, LaunchQueueClassification, OrchestrationInputs,
    QueueIssueBlocker, QueueIssueInput, QueueRunInput, classify_launch_queue,
};
pub use linear_context::{
    ISSUE_COMMENT_CHAR_LIMIT, ISSUE_COMMENT_MAX_COUNT, ISSUE_DESCRIPTION_CHAR_LIMIT, IssueContext,
    IssueContextComment, IssueContextParent, LinearContextMode,
};
pub use ownership::{
    OperatorId, OrchestrationOwner, OwnershipError, OwnershipEvent, OwnershipTransitionReason,
    SessionOwnership, SuspendReason, WriterLeaseInfo, transition_release, transition_resume,
    transition_suspend, transition_takeover,
};
pub use pull_request::{LinkedPrSummary, PrState, PullRequest, parse_pr_number};
pub use queue::{
    DONE_COLUMN_LIMIT, OperatorQueue, QueueInputs, classify as classify_queue, has_pending_handoff,
    queue_card_reason, trim_for_queue,
};
pub use review::{ReviewFinding, ReviewSwarmResult};
pub use role_router::{
    AgentCatalog, AgentDefinition as CoreAgentDefinition, ResolvedAgent, RoleRouter, RouterError,
    RunPolicy,
};
pub use run::{
    ExecutionMode, LinkedRunSummary, PauseKind, Run, RunBudget, RunBudgetGrant, RunState,
    TriggerSource,
};
pub use session_lifecycle::{SessionLifecycleEvent, SessionLifecyclePhase};
pub use step::{RunStep, StepKey, StepStatus};
pub use transcript::TranscriptChunk;
pub use workspace_event::WorkspaceRunEvent;
