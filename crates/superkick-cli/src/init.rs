use std::path::Path;
use std::process::Command;

const CONFIG_FILENAME: &str = "superkick.yaml";

const STARTER_CONFIG: &str = r#"version: 1

# Where issues come from. Superkick watches for status changes.
issue_source:
  provider: linear
  trigger: in_progress

# How Superkick runs locally.
runner:
  mode: local
  repo_root: .
  base_branch: main
  worktree_prefix: superkick
  # Commands to run in the worktree before agents start (e.g. install deps):
  # setup_commands:
  #   - pnpm install --frozen-lockfile

# Agent CLIs that Superkick can invoke.
# Keys are referenced by workflow steps below.
agents:
  implementation:
    provider: claude
  review:
    provider: claude

# The playbook Superkick follows for each issue.
workflow:
  steps:
    - type: plan
      agent: implementation
    - type: code
      agent: implementation
    - type: commands
      run:
        - echo "add your lint/test commands here"
    - type: review_swarm
      agents:
        - review
        - review
        - review
    - type: pr
      create: true
      generate_description: true

# When Superkick gets stuck, what should it do?
interrupts:
  on_blocked: ask_human
  on_review_conflict: ask_human

# Resource limits.
budget:
  max_retries_per_step: 2
  max_parallel_agents: 3
  token_budget: medium
"#;

pub fn run() -> anyhow::Result<()> {
    // Must be inside a git repo at its root
    let in_git = Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !in_git {
        anyhow::bail!(
            "Not inside a git repository.\n\
             Run `superkick init` from the root of your project."
        );
    }

    let config_path = Path::new(CONFIG_FILENAME);

    if config_path.exists() {
        println!("{CONFIG_FILENAME} already exists.");
        println!();
        println!("To start fresh, remove it first:");
        println!("  rm {CONFIG_FILENAME}");
        println!("  superkick init");
        return Ok(());
    }

    std::fs::write(config_path, STARTER_CONFIG)?;

    println!("Created {CONFIG_FILENAME}");
    println!();
    println!("What to edit next:");
    println!("  1. runner.base_branch  — set to your default branch (main, master, develop...)");
    println!("  2. runner.setup_commands — uncomment and set your install command");
    println!("  3. workflow.steps[commands].run — replace with your lint/test commands");
    println!("  4. agents — pick claude or codex for each role");
    println!();
    println!("When ready:");
    println!("  superkick doctor   — verify your machine");
    println!("  superkick serve    — start the server");

    Ok(())
}
