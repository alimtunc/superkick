const DEFAULT_PORTS: &[u16] = &[3100, 3000];

#[derive(clap::Args)]
pub struct StatusArgs {
    /// Port to check (checks 3000 and 3100 by default)
    #[arg(short, long)]
    pub port: Option<u16>,
}

fn check_health(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/health");
    match ureq::get(&url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(2)))
        .build()
        .call()
    {
        Ok(resp) if resp.status() == 200 => resp
            .into_body()
            .read_to_string()
            .map(|body| body.trim() == "ok")
            .unwrap_or(false),
        _ => false,
    }
}

fn print_active_runs(port: u16) {
    let url = format!("http://127.0.0.1:{port}/runs");
    let Ok(resp) = ureq::get(&url)
        .config()
        .timeout_global(Some(std::time::Duration::from_secs(2)))
        .build()
        .call()
    else {
        return;
    };
    let Ok(body) = resp.into_body().read_to_string() else {
        return;
    };
    let Ok(runs) = serde_json::from_str::<Vec<serde_json::Value>>(&body) else {
        return;
    };

    let active: Vec<_> = runs
        .iter()
        .filter(|r| {
            let state = r["state"].as_str().unwrap_or("");
            !matches!(state, "completed" | "failed" | "cancelled")
        })
        .collect();

    if active.is_empty() {
        println!("        No active runs");
    } else {
        println!();
        for r in &active {
            let id = r["id"].as_str().unwrap_or("?");
            let issue = r["issue_identifier"].as_str().unwrap_or("?");
            let state = r["state"].as_str().unwrap_or("?");
            let step = r["current_step_key"].as_str().unwrap_or("-");
            println!("  [>>]  {issue}  {state}/{step}  {id}");
        }
    }
}

pub fn run(args: StatusArgs) -> anyhow::Result<()> {
    let ports: Vec<u16> = match args.port {
        Some(p) => vec![p],
        None => DEFAULT_PORTS.to_vec(),
    };

    let mut found = false;

    for port in &ports {
        if check_health(*port) {
            println!("  [ok]  Superkick server running on port {port}");
            println!("        http://127.0.0.1:{port}");
            found = true;
            print_active_runs(*port);
        }
    }

    if !found {
        let checked = ports
            .iter()
            .map(|p| p.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        println!("  [!!]  No Superkick server found (checked ports: {checked})");
        println!();
        println!("Start one with:");
        println!("  superkick serve");
    }

    Ok(())
}
