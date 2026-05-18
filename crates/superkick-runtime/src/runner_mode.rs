//! argv/stdin shaping for [`RunnerMode`].
//!
//! Pure function over `(provider, runner_mode, prompt)` returning argv
//! mutations + optional stdin payload the supervisor applies at spawn time.

use superkick_core::{AgentProvider, ResolvedAgent, RunnerMode};

/// Argv + stdin mutations derived from one `(provider, runner_mode)` pair.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RunnerModeApplied {
    /// Argv tokens injected **before** the existing `resolved.args` flag list.
    pub prepend_args: Vec<String>,
    /// Argv tokens appended after `resolved.args`.
    pub append_args: Vec<String>,
    /// When `Some`, the prompt is written to the PTY master after spawn
    /// instead of being appended as a positional argv.
    pub stdin_payload: Option<String>,
}

/// Shape argv + stdin for a resolved agent. Pure; the only inputs are the
/// agent's `(provider, runner_mode)` pair and the prompt.
pub fn apply_runner_mode(resolved: &ResolvedAgent, prompt: String) -> RunnerModeApplied {
    use AgentProvider::*;
    use RunnerMode::*;
    match (resolved.provider, resolved.runner_mode) {
        (Claude, InteractivePty) => RunnerModeApplied {
            prepend_args: Vec::new(),
            append_args: Vec::new(),
            stdin_payload: Some(prompt),
        },
        (Claude, PrintStreamJson) => RunnerModeApplied {
            prepend_args: Vec::new(),
            append_args: vec![
                "--print".into(),
                "--output-format".into(),
                "stream-json".into(),
            ],
            stdin_payload: None,
        },
        (Codex, InteractivePty) => RunnerModeApplied {
            prepend_args: Vec::new(),
            append_args: Vec::new(),
            stdin_payload: Some(prompt),
        },
        (Codex, ExecJson) => RunnerModeApplied {
            prepend_args: vec!["exec".into()],
            append_args: Vec::new(),
            stdin_payload: None,
        },
        (provider, mode) => unreachable!(
            "apply_runner_mode received an invalid (provider, runner_mode) pair: \
             ({provider:?}, {mode:?}); RoleRouter::resolve must reject this via \
             RunnerMode::validate_with before calling into the runtime"
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use superkick_core::{
        BillingProfile, LinearContextMode, ResolvedMcpPolicy, ResolvedToolPolicy,
    };

    fn resolved(provider: AgentProvider, mode: RunnerMode, args: &[&str]) -> ResolvedAgent {
        ResolvedAgent {
            name: "test".into(),
            role: "planner".into(),
            provider,
            model: None,
            system_prompt: None,
            program: "/usr/bin/true".into(),
            args: args.iter().map(|s| (*s).to_string()).collect(),
            timeout: None,
            max_turns: None,
            linear_context: LinearContextMode::None,
            mcp_policy: ResolvedMcpPolicy::default(),
            tool_policy: ResolvedToolPolicy::default(),
            backend: None,
            runner_mode: mode,
            billing_profile: BillingProfile::default_for(provider, mode),
        }
    }

    #[test]
    fn apply_runner_mode_claude_print_stream_json_appends_flags() {
        let r = resolved(
            AgentProvider::Claude,
            RunnerMode::PrintStreamJson,
            &["--dangerously-skip-permissions"],
        );
        let out = apply_runner_mode(&r, "prompt".into());
        assert_eq!(
            out.append_args,
            vec![
                "--print".to_string(),
                "--output-format".to_string(),
                "stream-json".to_string()
            ]
        );
        assert!(out.prepend_args.is_empty());
        assert!(out.stdin_payload.is_none());
    }

    #[test]
    fn apply_runner_mode_codex_prepends_subcommand() {
        let r = resolved(AgentProvider::Codex, RunnerMode::ExecJson, &["--verbose"]);
        let out = apply_runner_mode(&r, "prompt".into());
        assert_eq!(out.prepend_args, vec!["exec".to_string()]);
        assert!(out.append_args.is_empty());
        assert!(out.stdin_payload.is_none());
    }

    #[test]
    fn apply_runner_mode_claude_interactive_returns_stdin_payload() {
        let r = resolved(AgentProvider::Claude, RunnerMode::InteractivePty, &[]);
        let out = apply_runner_mode(&r, "the prompt".into());
        assert!(out.prepend_args.is_empty());
        assert!(out.append_args.is_empty());
        assert_eq!(out.stdin_payload.as_deref(), Some("the prompt"));
    }

    #[test]
    fn apply_runner_mode_codex_interactive_returns_stdin_payload() {
        let r = resolved(AgentProvider::Codex, RunnerMode::InteractivePty, &[]);
        let out = apply_runner_mode(&r, "the prompt".into());
        assert!(out.prepend_args.is_empty());
        assert!(out.append_args.is_empty());
        assert_eq!(out.stdin_payload.as_deref(), Some("the prompt"));
    }
}
