//! Provider CLI helpers for terminal takeover (SUP-101).
//!
//! Builds the `tokio::process::Command` instances spawned inside a takeover
//! PTY. Each helper is deliberately thin — the goal is to keep the takeover
//! service free of provider-specific knowledge while leaving the actual CLI
//! flag set in one obvious place per provider.

use std::path::Path;

use portable_pty::CommandBuilder;
use superkick_core::AgentProvider;

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
        AgentProvider::Codex => codex_interactive(cwd, resume_session_id),
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

fn codex_interactive(cwd: &Path, _resume: Option<&str>) -> (CommandBuilder, bool) {
    // Codex interactive CLI does not yet accept a resume key issued by
    // `codex exec --json`. Until upstream ships the flag, we launch the CLI
    // fresh and tell the UI `resume_attempted = false`.
    let mut cmd = CommandBuilder::new("codex");
    cmd.cwd(cwd);
    (cmd, false)
}
