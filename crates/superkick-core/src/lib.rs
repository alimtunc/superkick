//! Core domain types, run state machine, and step definitions.

pub mod agent;
pub mod artifact;
pub mod attach;
pub mod error;
pub mod event;
pub mod id;
pub mod interrupt;
pub mod pull_request;
pub mod review;
pub mod run;
pub mod step;
pub mod transcript;

// Re-export primary types for ergonomic imports.
pub use agent::{AgentProvider, AgentSession, AgentStatus};
pub use artifact::{Artifact, ArtifactKind};
pub use attach::{AttachKind, AttachPayload};
pub use error::CoreError;
pub use event::{EventKind, EventLevel, RunEvent};
pub use id::{
    AgentSessionId, ArtifactId, EventId, InterruptId, PullRequestId, RunId, StepId,
    TranscriptChunkId,
};
pub use interrupt::{Interrupt, InterruptAction, InterruptStatus};
pub use pull_request::{LinkedPrSummary, PrState, PullRequest, parse_pr_number};
pub use review::{ReviewFinding, ReviewSwarmResult};
pub use run::{ExecutionMode, LinkedRunSummary, Run, RunState, TriggerSource};
pub use step::{RunStep, StepKey, StepStatus};
pub use transcript::TranscriptChunk;
