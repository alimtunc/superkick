//! Provider CLI helpers for terminal takeover (SUP-101).
//!
//! Builds the `tokio::process::Command` instances spawned inside a takeover
//! PTY. Each helper is deliberately thin — the goal is to keep the takeover
//! service free of provider-specific knowledge while leaving the actual CLI
//! flag set in one obvious place per provider.

use std::path::Path;

use portable_pty::CommandBuilder;
use superkick_core::{AgentProvider, SnapshotProvider};

use crate::conversation_runner::RunChatSnapshot;

/// Whether the provider's CLI accepts a resume key when launched
/// interactively. Drives the `resume_supported` flag exposed to the UI so
/// the operator never sees a fake "Resume" badge.
///
/// Codex's `exec --json` mode prints a thread id but the interactive `codex`
/// CLI does not yet take that id back as input. Flip this to `true` once
/// upstream ships the matching flag and we have a working manual test.
pub fn resume_supported(provider: AgentProvider) -> bool {
    match provider {
        AgentProvider::Claude => true,
        AgentProvider::Codex => false,
    }
}

/// Inspect mode: spawn an interactive shell rooted in the worktree. Used
/// when the operator just wants to look around without disturbing the agent.
pub fn inspect_shell_command(cwd: &Path) -> CommandBuilder {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let mut cmd = CommandBuilder::new(shell);
    cmd.cwd(cwd);
    cmd
}

/// Interactive provider CLI command. When `resume_session_id` is `Some` and
/// the provider supports resume, the command is built with the relevant
/// resume flag. Returns the command alongside a boolean indicating whether
/// resume was actually wired in — the caller surfaces that flag to the UI
/// so the operator knows whether the conversation will be restored.
pub fn interactive_command(
    provider: AgentProvider,
    cwd: &Path,
    resume_session_id: Option<&str>,
) -> (CommandBuilder, bool) {
    match provider {
        AgentProvider::Claude => claude_interactive(cwd, resume_session_id),
        AgentProvider::Codex => codex_interactive(cwd),
    }
}

fn claude_interactive(cwd: &Path, resume: Option<&str>) -> (CommandBuilder, bool) {
    let mut cmd = CommandBuilder::new("claude");
    cmd.cwd(cwd);
    let resume_attempted = match resume {
        Some(session_id) if !session_id.is_empty() => {
            cmd.arg("--resume");
            cmd.arg(session_id);
            true
        }
        _ => false,
    };
    (cmd, resume_attempted)
}

fn codex_interactive(cwd: &Path) -> (CommandBuilder, bool) {
    // Codex interactive CLI does not yet accept a resume key issued by
    // `codex exec --json`. Until upstream ships the flag, we launch the CLI
    // fresh and tell the UI `resume_attempted = false`.
    let mut cmd = CommandBuilder::new("codex");
    cmd.cwd(cwd);
    (cmd, false)
}

/// Pick the provider + resume key that drive the interactive CLI. For a
/// launch-task shadow run the agent-session thread id and its provider are the
/// honest target; otherwise fall back to the run-scoped conversation. Launch-
/// task structured sessions carry no usable interactive resume key, so this
/// naturally routes them to a fresh spawn.
pub fn resolve_resume_target(
    chat: &RunChatSnapshot,
    snapshot: Option<&SnapshotProvider>,
) -> (AgentProvider, Option<String>) {
    if let Some(provider) = snapshot
        .and_then(|p| p.provider.as_deref())
        .and_then(AgentProvider::from_cli_name)
    {
        return (
            provider,
            snapshot.and_then(|p| p.provider_session_id.clone()),
        );
    }
    (chat.provider, chat.provider_session_id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chat(provider: AgentProvider, session: Option<&str>) -> RunChatSnapshot {
        RunChatSnapshot {
            provider,
            provider_session_id: session.map(str::to_string),
            has_active_turn: false,
            has_conversation: session.is_some(),
        }
    }

    fn snapshot_provider(provider: Option<&str>, session: Option<&str>) -> SnapshotProvider {
        SnapshotProvider {
            provider: provider.map(str::to_string),
            agent: None,
            model: None,
            provider_session_id: session.map(str::to_string),
        }
    }

    #[test]
    fn launch_task_snapshot_provider_takes_precedence_over_conversation() {
        let chat = chat(AgentProvider::Claude, Some("chat-thread"));
        let snap = snapshot_provider(Some("codex"), Some("codex-thread"));
        let (provider, session) = resolve_resume_target(&chat, Some(&snap));
        assert_eq!(provider, AgentProvider::Codex);
        assert_eq!(session.as_deref(), Some("codex-thread"));
        // Honest degradation: Codex has no usable interactive resume key, so
        // the caller routes this to a fresh spawn, never a fake resume.
        assert!(!resume_supported(provider));
    }

    #[test]
    fn chat_run_without_snapshot_resumes_via_conversation() {
        let chat = chat(AgentProvider::Claude, Some("chat-thread"));
        let (provider, session) = resolve_resume_target(&chat, None);
        assert_eq!(provider, AgentProvider::Claude);
        assert_eq!(session.as_deref(), Some("chat-thread"));
        assert!(resume_supported(provider));
    }

    #[test]
    fn snapshot_without_provider_falls_back_to_conversation() {
        let chat = chat(AgentProvider::Claude, Some("chat-thread"));
        let snap = snapshot_provider(None, Some("ignored"));
        let (provider, session) = resolve_resume_target(&chat, Some(&snap));
        assert_eq!(provider, AgentProvider::Claude);
        assert_eq!(session.as_deref(), Some("chat-thread"));
    }
}
