use std::process::Command;

#[derive(Debug)]
struct ToolCheck {
    name: &'static str,
    binary: &'static str,
    purpose: &'static str,
    install_hint: &'static str,
    required: bool,
}

const TOOLS: &[ToolCheck] = &[
    ToolCheck {
        name: "Git",
        binary: "git",
        purpose: "repository operations",
        install_hint: "Install via your system package manager",
        required: true,
    },
    ToolCheck {
        name: "GitHub CLI",
        binary: "gh",
        purpose: "PR creation and GitHub API",
        install_hint: "brew install gh  or  https://cli.github.com",
        required: true,
    },
    ToolCheck {
        name: "Claude Code",
        binary: "claude",
        purpose: "AI agent (plan, code, review)",
        install_hint: "https://claude.ai/download",
        required: false,
    },
    ToolCheck {
        name: "Codex CLI",
        binary: "codex",
        purpose: "AI agent (alternative provider)",
        install_hint: "npm install -g @openai/codex",
        required: false,
    },
];

fn find_binary(binary: &str) -> Option<String> {
    which::which(binary).ok().map(|p| p.display().to_string())
}

fn get_version(binary: &str) -> Option<String> {
    Command::new(binary)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if out.is_empty() {
                String::from_utf8_lossy(&o.stderr).trim().to_string()
            } else {
                out
            }
        })
}

pub fn run() -> anyhow::Result<()> {
    println!("superkick doctor");
    println!("================");
    println!();
    println!("Checking machine-level prerequisites...");
    println!();

    let mut required_missing: Vec<&ToolCheck> = Vec::new();
    let mut agent_missing: Vec<&ToolCheck> = Vec::new();
    let mut has_agent = false;

    for tool in TOOLS {
        match find_binary(tool.binary) {
            Some(path) => {
                let version = get_version(tool.binary).unwrap_or_default();
                let ver_display = if version.is_empty() {
                    String::new()
                } else {
                    format!(" ({version})")
                };
                println!("  [ok]  {:<16} {}{}", tool.name, path, ver_display);
                if !tool.required {
                    has_agent = true;
                }
            }
            None => {
                println!("  [!!]  {:<16} not found", tool.name);
                if tool.required {
                    required_missing.push(tool);
                } else {
                    agent_missing.push(tool);
                }
            }
        }
    }

    println!();

    if !required_missing.is_empty() {
        println!("Required tools missing:");
        for tool in &required_missing {
            println!(
                "  - {} ({}): {}",
                tool.name, tool.purpose, tool.install_hint
            );
        }
        println!();
        anyhow::bail!("Fix the required tools above before using Superkick.");
    }

    if !has_agent {
        println!("No agent CLI found. Install at least one:");
        for tool in &agent_missing {
            println!(
                "  - {} ({}): {}",
                tool.name, tool.purpose, tool.install_hint
            );
        }
        println!();
        anyhow::bail!("Superkick needs an agent CLI to plan, code, and review.");
    }

    println!("Your machine is ready.");
    println!();
    println!("Next step:");
    println!("  cd <your-repo> && superkick init");

    Ok(())
}
