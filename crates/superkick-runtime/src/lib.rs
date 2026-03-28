//! Runtime services — worktree lifecycle, agent supervision, subprocess control.

pub mod agent_supervisor;
pub mod git;
pub mod interrupt_service;
pub mod repo_cache;
pub mod step_engine;
pub mod worktree;

pub use agent_supervisor::{AgentHandle, AgentLaunchConfig, AgentResult, AgentSupervisor};
pub use interrupt_service::InterruptService;
pub use repo_cache::RepoCache;
pub use step_engine::{StepEngine, StepEngineDeps};
pub use worktree::{WorktreeInfo, WorktreeManager};
