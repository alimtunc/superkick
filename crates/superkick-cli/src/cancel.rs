use std::net::TcpStream;
use std::time::Duration;

#[derive(clap::Args)]
pub struct CancelArgs {
    /// Run ID to cancel (omit to cancel the latest active run)
    pub run_id: Option<String>,

    /// Server port
    #[arg(short, long, default_value_t = 3100)]
    pub port: u16,
}

pub fn run(args: CancelArgs) -> anyhow::Result<()> {
    let base = format!("http://127.0.0.1:{}", args.port);

    // Check server is reachable
    let addr: std::net::SocketAddr = format!("127.0.0.1:{}", args.port).parse()?;
    if TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_err() {
        anyhow::bail!(
            "No Superkick server on port {}. Start one with: superkick serve",
            args.port
        );
    }

    let run_id = match args.run_id {
        Some(id) => id,
        None => find_latest_active_run(&base)?,
    };

    let resp = ureq::post(format!("{base}/runs/{run_id}/cancel"))
        .send_empty();

    match resp {
        Ok(resp) if resp.status() == 200 => {
            println!("Run {run_id} cancelled.");
        }
        Ok(resp) => {
            let body = resp.into_body().read_to_string()?;
            anyhow::bail!("Failed to cancel run: {}", body);
        }
        Err(e) => {
            anyhow::bail!("Failed to cancel run: {e}");
        }
    }

    Ok(())
}

fn find_latest_active_run(base: &str) -> anyhow::Result<String> {
    let resp = ureq::get(format!("{base}/runs")).call()?;
    let body = resp.into_body().read_to_string()?;
    let runs: Vec<serde_json::Value> = serde_json::from_str(&body)?;

    let active = runs.iter().find(|r| {
        let state = r["state"].as_str().unwrap_or("");
        !matches!(state, "completed" | "failed" | "cancelled")
    });

    match active {
        Some(r) => {
            let id = r["id"].as_str().unwrap_or("").to_string();
            if id.is_empty() {
                anyhow::bail!("Found active run but could not read its ID");
            }
            println!("Found active run: {id}");
            Ok(id)
        }
        None => anyhow::bail!("No active runs found."),
    }
}
