//! AI-drafted ship metadata: a commit message + PR title + PR description the
//! operator reviews and edits before publishing. Built on the same provider CLI
//! the runs use (no new billing path) and the builtin `ship` skill as the
//! playbook — the generator runs `claude --print` one-shot over the assembled
//! context (issue + diff + run summary + review notes) and returns text.
//!
//! Generation is split so the prompt assembly and JSON parsing are unit-tested
//! and the actual CLI call sits behind [`ProposalGenerator`] (swappable in tests
//! and for a future provider choice). The operator always edits the result and
//! confirms — nothing here publishes anything.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

/// The editable publish metadata returned to the ship dialog. Serialises
/// camelCase for the dashboard; the `*_alias` snake_case forms let the model's
/// reply (which the `ship` skill asks for in snake_case) deserialise directly.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipProposal {
    #[serde(alias = "commit_message")]
    pub commit_message: String,
    #[serde(alias = "pr_title")]
    pub pr_title: String,
    #[serde(alias = "pr_description")]
    pub pr_description: String,
}

/// Everything the prompt needs about the finished work.
#[derive(Debug, Clone, Default)]
pub struct ShipProposalInputs {
    pub issue_identifier: String,
    pub branch: String,
    pub base_branch: String,
    /// Run/activity summary (e.g. the final step's structured result), if any.
    pub summary: Option<String>,
    /// `git diff` of the branch against its base.
    pub diff: String,
    /// Unresolved review notes, if any.
    pub review_notes: Vec<String>,
}

/// Cap the diff fed to the model so a huge changeset can't blow the context
/// window; the tail is dropped with a marker (the summary still carries intent).
const MAX_DIFF_CHARS: usize = 24_000;

/// Assemble the full prompt: the `ship` skill body (the playbook) followed by
/// the labelled context blocks.
pub fn render_prompt(skill_body: &str, inputs: &ShipProposalInputs) -> String {
    let mut prompt = String::with_capacity(skill_body.len() + inputs.diff.len() + 512);
    prompt.push_str(skill_body.trim());
    prompt.push_str("\n\n---\n");
    prompt.push_str(&format!("Issue: {}\n", inputs.issue_identifier));
    prompt.push_str(&format!("Branch: {}\n", inputs.branch));
    prompt.push_str(&format!("Base branch: {}\n", inputs.base_branch));

    if let Some(summary) = inputs
        .summary
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        prompt.push_str("\n## Run summary\n");
        prompt.push_str(summary);
        prompt.push('\n');
    }

    if !inputs.review_notes.is_empty() {
        prompt.push_str("\n## Review notes\n");
        for note in &inputs.review_notes {
            prompt.push_str(&format!("- {}\n", note.trim()));
        }
    }

    prompt.push_str("\n## Diff\n```diff\n");
    if inputs.diff.len() > MAX_DIFF_CHARS {
        prompt.push_str(&inputs.diff[..MAX_DIFF_CHARS]);
        prompt.push_str("\n… diff truncated …\n");
    } else {
        prompt.push_str(&inputs.diff);
    }
    prompt.push_str("\n```\n");
    prompt
}

/// Parse the model's reply into a [`ShipProposal`]. Tolerant of a leading/
/// trailing prose or a ```json code fence: the first balanced-looking `{ … }`
/// span is taken as the JSON object.
pub fn parse_proposal(text: &str) -> Result<ShipProposal> {
    let start = text
        .find('{')
        .context("model reply contained no JSON object")?;
    let end = text
        .rfind('}')
        .context("model reply contained no JSON object")?;
    if end < start {
        bail!("model reply contained no JSON object");
    }
    let json = &text[start..=end];
    let proposal: ShipProposal =
        serde_json::from_str(json).context("model reply was not a valid ship proposal object")?;
    if proposal.commit_message.trim().is_empty() || proposal.pr_title.trim().is_empty() {
        bail!("model reply was missing a commit message or PR title");
    }
    Ok(proposal)
}

/// Runs a prompt and returns the model's raw text reply. The CLI boundary —
/// faked in tests.
pub trait ProposalGenerator: Send + Sync {
    fn generate(
        &self,
        prompt: &str,
        cwd: &Path,
    ) -> impl std::future::Future<Output = Result<String>> + Send;
}

/// Drives `claude --print` (the subscription headless mode — no paid SDK path)
/// one-shot, feeding the prompt on stdin and capturing stdout.
pub struct ClaudePrintGenerator {
    executable: PathBuf,
}

impl ClaudePrintGenerator {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }
}

impl Default for ClaudePrintGenerator {
    fn default() -> Self {
        Self::new("claude")
    }
}

impl ProposalGenerator for ClaudePrintGenerator {
    async fn generate(&self, prompt: &str, cwd: &Path) -> Result<String> {
        let mut child = Command::new(&self.executable)
            .arg("--print")
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| format!("failed to spawn {}", self.executable.display()))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(prompt.as_bytes())
                .await
                .context("failed to write ship prompt to claude stdin")?;
            stdin.shutdown().await.ok();
        }

        let output = child
            .wait_with_output()
            .await
            .context("failed to run claude for ship proposal")?;
        if !output.status.success() {
            bail!(
                "claude exited with {}: {}",
                output.status,
                String::from_utf8_lossy(&output.stderr).trim()
            );
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }
}

/// Render the prompt, run the generator over the worktree, and parse the reply.
pub async fn generate_ship_proposal<G: ProposalGenerator>(
    generator: &G,
    skill_body: &str,
    worktree: &Path,
    inputs: &ShipProposalInputs,
) -> Result<ShipProposal> {
    let prompt = render_prompt(skill_body, inputs);
    let reply = generator.generate(&prompt, worktree).await?;
    parse_proposal(&reply)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn inputs() -> ShipProposalInputs {
        ShipProposalInputs {
            issue_identifier: "SUP-300".into(),
            branch: "alimtunc/sup-300".into(),
            base_branch: "main".into(),
            summary: Some("Removed the legacy launch profiles.".into()),
            diff: "diff --git a/x b/x".into(),
            review_notes: vec!["check the migration".into()],
        }
    }

    #[test]
    fn render_prompt_includes_context_blocks() {
        let prompt = render_prompt("PLAYBOOK", &inputs());
        assert!(prompt.starts_with("PLAYBOOK"));
        assert!(prompt.contains("Issue: SUP-300"));
        assert!(prompt.contains("Base branch: main"));
        assert!(prompt.contains("Run summary"));
        assert!(prompt.contains("Removed the legacy launch profiles."));
        assert!(prompt.contains("Review notes"));
        assert!(prompt.contains("check the migration"));
        assert!(prompt.contains("diff --git a/x b/x"));
    }

    #[test]
    fn render_prompt_truncates_a_huge_diff() {
        let mut i = inputs();
        i.diff = "x".repeat(MAX_DIFF_CHARS + 5_000);
        let prompt = render_prompt("P", &i);
        assert!(prompt.contains("diff truncated"));
        assert!(prompt.len() < MAX_DIFF_CHARS + 2_000);
    }

    #[test]
    fn parse_proposal_reads_a_bare_object() {
        let proposal = parse_proposal(
            r#"{"commit_message":"feat(SUP-300): drop profiles","pr_title":"Drop profiles","pr_description":"body"}"#,
        )
        .unwrap();
        assert_eq!(proposal.commit_message, "feat(SUP-300): drop profiles");
        assert_eq!(proposal.pr_title, "Drop profiles");
        assert_eq!(proposal.pr_description, "body");
    }

    #[test]
    fn parse_proposal_tolerates_prose_and_code_fences() {
        let reply = "Here you go:\n```json\n{\n  \"commit_message\": \"fix: x\",\n  \"pr_title\": \"Fix x\",\n  \"pr_description\": \"d\"\n}\n```\nHope that helps!";
        let proposal = parse_proposal(reply).unwrap();
        assert_eq!(proposal.commit_message, "fix: x");
        assert_eq!(proposal.pr_title, "Fix x");
    }

    #[test]
    fn parse_proposal_rejects_missing_fields_and_non_json() {
        assert!(parse_proposal("no json here").is_err());
        assert!(
            parse_proposal(r#"{"commit_message":"","pr_title":"","pr_description":""}"#).is_err()
        );
    }

    struct FakeGenerator(String);
    impl ProposalGenerator for FakeGenerator {
        async fn generate(&self, _prompt: &str, _cwd: &Path) -> Result<String> {
            Ok(self.0.clone())
        }
    }

    #[tokio::test]
    async fn generate_ship_proposal_renders_and_parses() {
        let generator = FakeGenerator(
            r#"{"commit_message":"feat(SUP-300): x","pr_title":"X","pr_description":"d"}"#.into(),
        );
        let proposal = generate_ship_proposal(&generator, "PLAYBOOK", Path::new("/tmp"), &inputs())
            .await
            .unwrap();
        assert_eq!(proposal.pr_title, "X");
    }
}
