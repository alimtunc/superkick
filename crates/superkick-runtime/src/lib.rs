//! Runtime services — worktree lifecycle, agent supervision, subprocess control.

pub mod agent_supervisor;
pub mod attention_service;
pub mod git;
pub mod handoff_service;
pub mod interrupt_service;
pub mod linear_context;
pub mod pty_session;
pub mod repo_cache;
pub mod step_engine;
pub mod worktree;

pub use agent_supervisor::{
    AgentHandle, AgentLaunchConfig, AgentResult, AgentSupervisor, SessionLaunchInfo,
};
pub use attention_service::AttentionService;
pub use handoff_service::HandoffService;
pub use interrupt_service::InterruptService;
pub use pty_session::{PtySession, PtySessionRegistry, WriterHolder};
pub use repo_cache::RepoCache;
pub use step_engine::{StepEngine, StepEngineDeps};
pub use worktree::{WorktreeInfo, WorktreeManager};
