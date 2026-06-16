//! Core domain types, run state machine, and step definitions.

pub mod agent;
pub mod artifact;
pub mod attach;
pub mod attention;
pub mod blocker;
pub mod conversation;
pub mod diff_review;
pub mod error;
pub mod event;
pub mod handoff;
pub mod id;
pub mod interrupt;
pub mod issue_event;
pub mod issue_workspace_context;
pub mod launch_profile;
pub mod launch_queue;
pub mod launch_task;
pub mod launch_task_intervention;
pub mod linear_context;
pub mod mcp_policy;
pub mod memory_entry;
pub mod orchestrator_session;
pub mod output_expectation;
pub mod ownership;
pub mod protocol;
pub mod provider_models;
pub mod provider_settings;
pub mod pull_request;
pub mod queue;
pub mod reasoning;
pub mod recovery;
pub mod redaction;
pub mod review;
pub mod role_router;
pub mod run;
pub mod run_context_snapshot;
pub mod run_diff;
pub mod runner_mode;
pub mod runtime;
pub mod search;
mod serde_util;
pub mod session_lifecycle;
pub mod session_policy;
pub mod skill;
pub mod slug;
pub mod step;
pub mod step_executor;
pub mod step_result;
pub mod terminal_takeover;
pub mod transcript;
pub mod workspace_event;

pub use agent::{AgentProvider, AgentSession, AgentStatus, LaunchReason};
pub use artifact::{Artifact, ArtifactKind};
pub use attach::{AttachKind, AttachPayload};
pub use attention::{AttentionKind, AttentionReply, AttentionRequest, AttentionStatus};
pub use blocker::{IssueBlocker, TERMINAL_BLOCKER_STATES, is_terminal_blocker_state};
pub use conversation::{
    Conversation, ConversationStatus, ConversationSubject, Turn, TurnEvent, TurnFailure, TurnStatus,
};
pub use diff_review::{
    DEFAULT_REVIEW_AUTHOR, DiffReviewAnchor, DiffReviewComment, DiffReviewFileReviewedChange,
    DiffReviewFileState, DiffReviewFixPromptComment, DiffReviewLineSide, DiffReviewState,
    DiffReviewSubject, DiffReviewThread, DiffReviewThreadState, NewDiffReviewComment,
    NewDiffReviewThread, normalize_diff_review_comment_body, render_diff_review_fix_prompt,
    unresolved_diff_review_fix_prompt_comments,
};
pub use error::CoreError;
pub use event::{EventKind, EventLevel, RunEvent};
pub use handoff::{
    Handoff, HandoffFailure, HandoffKind, HandoffPayload, HandoffResult, HandoffStatus,
};
pub use id::{
    AgentSessionId, ArtifactId, AttentionRequestId, ConversationId, DiffReviewCommentId,
    DiffReviewThreadId, EventId, HandoffId, InterruptId, IssueWorkspaceContextCommentExcerptId,
    IssueWorkspaceContextId, IssueWorkspaceContextLinkId, LaunchTaskId, LaunchTaskInterventionId,
    LaunchTaskStepId, MemoryEntryId, OrchestratorCheckpointId, OrchestratorSessionId,
    OwnershipEventId, PullRequestId, RunId, RuntimeId, RuntimeProviderId, SessionLifecycleEventId,
    StepId, TakeoverSessionId, TranscriptChunkId, TurnEventId, TurnId,
};
pub use interrupt::{Interrupt, InterruptAction, InterruptStatus};
pub use issue_event::{DependencyResolvedPayload, IssueEvent};
pub use issue_workspace_context::{
    IssueWorkspaceContext, IssueWorkspaceContextCommentExcerpt, IssueWorkspaceContextLink,
    IssueWorkspaceContextLinkKind, IssueWorkspaceContextSnapshot,
    NewCommentExcerpt as IssueWorkspaceContextNewCommentExcerpt,
    NewLink as IssueWorkspaceContextNewLink,
};
pub use launch_profile::{
    LaunchProfile, ProfileKind, ProfileSnapshot, ProfileStep, ProfileUsage, StepSnapshot,
};
pub use launch_queue::{
    ClassifiedIssue, ClassifiedRun, LaunchQueue, LaunchQueueClassification, OrchestrationInputs,
    QueueIssueBlocker, QueueIssueInput, QueueRunInput, classify_launch_queue,
};
pub use launch_task::{
    LaunchRecipe, LaunchStepKind, LaunchTask, LaunchTaskOverrides, LaunchTaskStatus,
    LaunchTaskStep, LaunchTaskStepStatus, PlanImplementReviewAgents, RetryPath, ReuseWorktree,
};
pub use launch_task_intervention::{DEFAULT_INTERVENTION_AUTHOR, LaunchTaskIntervention};
pub use linear_context::{
    ISSUE_COMMENT_CHAR_LIMIT, ISSUE_COMMENT_MAX_COUNT, ISSUE_DESCRIPTION_CHAR_LIMIT, IssueContext,
    IssueContextComment, IssueContextParent, LinearContextMode,
};
pub use mcp_policy::{McpMode, ResolvedMcpPolicy, ResolvedToolPolicy};
pub use memory_entry::{MemoryCursor, MemoryEntry, MemoryPage};
pub use orchestrator_session::{
    OrchestratorCheckpoint, OrchestratorScope, OrchestratorSession, OrchestratorStatus,
};
pub use output_expectation::OutputExpectation;
pub use ownership::{
    OperatorId, OrchestrationOwner, OwnershipError, OwnershipEvent, OwnershipTransitionReason,
    SessionOwnership, SuspendReason, WriterLeaseInfo, transition_release, transition_resume,
    transition_suspend, transition_takeover,
};
pub use protocol::{
    Cancelled, Completion, Failure, LogEntry, LogLevel, ProtocolEvent, ProtocolEventEnvelope,
    ResumeKey, SessionMeta, TextBlock, TextDelta, Thinking, ToolCallResult, ToolCallStart,
    TurnOptions, TurnOutcome, TurnRequest, UsageSnapshot,
};
pub use provider_models::{ModelInfo, provider_models};
pub use provider_settings::{
    AuthState, InstallState, PermissionPolicy, ProviderAvailability, ProviderSettings,
    SandboxPolicy,
};
pub use pull_request::{
    GitHubPullRequestRef, GithubReviewDecision, IssuePullRequest, IssuePullRequestSource,
    LinkedPrSummary, PrActivityEvent, PrActivityKind, PrChecksState, PrChecksSummary, PrDiffFile,
    PrDiffFileStatus, PrInboxItem, PrReviewDetail, PrReviewEvent, PrReviewer, PrState, PullRequest,
    ReviewBucket, ShipMode, classify_review_bucket, parse_github_pr_url, parse_pr_number,
};
pub use queue::{
    DONE_COLUMN_LIMIT, OperatorQueue, QueueInputs, classify as classify_queue, queue_card_reason,
    trim_for_queue,
};
pub use reasoning::ReasoningEffort;
pub use recovery::{
    LatestEventTag, RecoveryAction, RecoveryCandidate, RecoveryConfig, RecoveryStatus,
    StalledReason, classify as classify_recovery, decide_action as decide_recovery_action,
};
pub use review::{ReviewFinding, ReviewSwarmResult};
pub use role_router::{
    AgentAvatar, AgentBackend, AgentCatalog, AgentDefinition as CoreAgentDefinition, AgentOrigin,
    CLAUDE_IMPLEMENT, CLAUDE_PLAN, CLAUDE_REVIEW, CODEX_IMPLEMENT, CODEX_PLAN, CODEX_REVIEW,
    LINEAR_MCP_SERVER_NAME, ResolvedAgent, RoleRouter, RouterError, RunPolicy,
};
pub use run::{
    ExecutionMode, LinkedRunSummary, PauseKind, Run, RunAgentOverrides, RunBudget, RunBudgetGrant,
    RunState, TriggerSource,
};
pub use run_context_snapshot::{
    BlockingKind, PendingDecisionKind, RUN_CONTEXT_SNAPSHOT_VERSION, RunContextSnapshot,
    SnapshotBlocking, SnapshotChangedFiles, SnapshotCurrentStep, SnapshotDiffRef,
    SnapshotEventPointer, SnapshotIssue, SnapshotMemoryRef, SnapshotPendingDecision,
    SnapshotProvider, SnapshotRun, SnapshotStep, SnapshotTask, SnapshotWorktree,
};
pub use run_diff::{FileDiff, FileDiffStatus, RunDiff};
pub use runner_mode::{BillingProfile, RunnerMode, RunnerModeError};
pub use runtime::{
    LOCAL_RUNTIME_NAME, ProviderStatus, Runtime, RuntimeCapabilities, RuntimeMode, RuntimeProvider,
    RuntimeStatus, RuntimeWithProviders,
};
pub use search::{
    SNIPPET_RADIUS, SearchActionKind, SearchActionRow, SearchCommentRow, SearchFileRow,
    SearchIssueRow, SearchResponse, SearchRunRow, SearchScope, Snippet, comment_snippet,
    find_ascii_ci,
};
pub use session_lifecycle::{SessionLifecycleEvent, SessionLifecyclePhase};
pub use session_policy::{SessionPolicy, SessionPolicyError};
pub use skill::{
    MAX_PROMPT_TEMPLATE_CHARS, SkillArtifact, SkillDefinition, SkillKind, SkillOrigin, SkillSource,
};
pub use step::{RunStep, StepKey, StepStatus};
pub use step_executor::StepExecutor;
pub use step_result::{
    FailureClassification, FailureDisposition, STEP_RESULT_BEGIN, STEP_RESULT_END, StepResult,
    StepResultStatus,
};
pub use terminal_takeover::{
    ActiveTakeover, ForceTakeoverSubMode, OpenedTakeover, TakeoverMode, TakeoverModeAvailability,
    TakeoverModeKind, TakeoverPath,
};
pub use transcript::TranscriptChunk;
pub use workspace_event::{RunRecoveredPayload, RunStalledPayload, WorkspaceRunEvent};
