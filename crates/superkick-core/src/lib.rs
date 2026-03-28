//! Core domain types, run state machine, and step definitions.

pub mod agent;
pub mod artifact;
pub mod error;
pub mod event;
pub mod id;
pub mod interrupt;
pub mod review;
pub mod run;
pub mod step;

// Re-export primary types for ergonomic imports.
pub use agent::{AgentProvider, AgentSession, AgentStatus};
pub use artifact::{Artifact, ArtifactKind};
pub use error::CoreError;
pub use event::{EventKind, EventLevel, RunEvent};
pub use id::{AgentSessionId, ArtifactId, EventId, InterruptId, RunId, StepId};
pub use interrupt::{Interrupt, InterruptAction, InterruptStatus};
pub use review::{ReviewFinding, ReviewSwarmResult};
pub use run::{Run, RunState, TriggerSource};
pub use step::{RunStep, StepKey, StepStatus};
