use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(clap::Args)]
pub struct RunArgs {
    /// Issue identifier (e.g. SK-123)
    pub issue: String,

    /// Server port
    #[arg(short, long, default_value_t = 3100)]
    pub port: u16,

    /// Follow the event stream in the terminal
    #[arg(short, long)]
    pub follow: bool,
}

fn get_repo_slug() -> anyhow::Result<String> {
    let output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .output()
        .map_err(|_| anyhow::anyhow!("Could not run git. Is git installed?"))?;

    if !output.status.success() {
        anyhow::bail!("Could not read git remote origin. Is this a git repository with a remote?");
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    let url = raw.trim();
    superkick_config::parse_repo_slug(url)
        .ok_or_else(|| anyhow::anyhow!("Could not parse repo slug from remote URL: {url}"))
}

fn load_base_branch() -> anyhow::Result<String> {
    let config_path = Path::new(superkick_config::CONFIG_FILENAME);
    if !config_path.exists() {
        anyhow::bail!(
            "No {} found. Run 'superkick init' first.",
            superkick_config::CONFIG_FILENAME,
        );
    }
    let config = superkick_config::load_file(config_path)?;
    Ok(config.runner.base_branch)
}

fn create_run(
    base_url: &str,
    repo_slug: &str,
    issue: &str,
    base_branch: &str,
) -> anyhow::Result<String> {
    let payload = serde_json::json!({
        "repo_slug": repo_slug,
        "issue_id": issue,
        "issue_identifier": issue,
        "base_branch": base_branch,
    });

    let resp = ureq::post(format!("{base_url}/runs"))
        .header("Content-Type", "application/json")
        .send(payload.to_string().as_bytes());

    match resp {
        Ok(resp) if resp.status() == 201 => {
            let body = resp.into_body().read_to_string()?;
            let run: serde_json::Value = serde_json::from_str(&body)?;
            let id = run["id"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Server returned a run without an id"))?;
            Ok(id.to_string())
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.into_body().read_to_string()?;
            anyhow::bail!("Server returned {status}: {body}");
        }
        Err(e) => {
            anyhow::bail!("Failed to create run: {e}");
        }
    }
}

fn follow_events(base_url: &str, run_id: &str) -> anyhow::Result<()> {
    let detached = Arc::new(AtomicBool::new(false));
    let detached_clone = Arc::clone(&detached);

    ctrlc::set_handler(move || {
        detached_clone.store(true, Ordering::SeqCst);
    })
    .map_err(|e| anyhow::anyhow!("Failed to install Ctrl-C handler: {e}"))?;

    let resp = ureq::get(format!("{base_url}/runs/{run_id}/events")).call();

    let reader = match resp {
        Ok(resp) => BufReader::new(resp.into_body().into_reader()),
        Err(e) => {
            eprintln!("Could not connect to event stream: {e}");
            eprintln!("Run continues server-side. Check: superkick status");
            return Ok(());
        }
    };

    let mut current_event = String::new();

    for line in reader.lines() {
        if detached.load(Ordering::SeqCst) {
            println!();
            println!("  Detached. Run continues server-side.");
            break;
        }

        let line = match line {
            Ok(l) => l,
            Err(_) => {
                println!();
                println!("  Stream disconnected. Run continues server-side.");
                println!("  Check: superkick status");
                break;
            }
        };

        if let Some(event) = line.strip_prefix("event: ") {
            current_event = event.trim().to_string();
        } else if let Some(data) = line.strip_prefix("data: ") {
            handle_sse_line(&current_event, data);
            if current_event == "done" || current_event == "error" {
                break;
            }
        }
    }

    Ok(())
}

fn handle_sse_line(event: &str, data: &str) {
    match event {
        "run_event" => {
            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(data) {
                let kind = payload["kind"].as_str().unwrap_or_else(|| {
                    eprintln!("  [warn] run_event missing 'kind' field");
                    "event"
                });
                let message = payload["message"].as_str().unwrap_or("");

                if kind == "state_changed" || !message.is_empty() {
                    let display = if message.is_empty() { kind } else { message };
                    println!("  {display}");
                }
            }
        }
        "done" => {
            println!("  Run finished.");
        }
        "error" => {
            eprintln!("  Error: {data}");
        }
        _ => {}
    }
}

pub fn run(args: RunArgs) -> anyhow::Result<()> {
    let base_branch = load_base_branch()?;
    let repo_slug = get_repo_slug()?;
    let base_url = format!("http://127.0.0.1:{}", args.port);

    crate::net::ensure_server_reachable(args.port)?;

    // Create the run
    let run_id = create_run(&base_url, &repo_slug, &args.issue, &base_branch)?;

    println!();
    println!("  Run {run_id} created");
    println!("  {base_url}/runs/{run_id}");
    println!();

    if args.follow {
        follow_events(&base_url, &run_id)?;
    }

    Ok(())
}
