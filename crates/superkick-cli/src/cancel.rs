#[derive(clap::Args)]
pub struct CancelArgs {
    /// Run ID to cancel
    pub run_id: String,

    /// Server port
    #[arg(short, long, default_value_t = 3100)]
    pub port: u16,
}

pub fn run(args: CancelArgs) -> anyhow::Result<()> {
    let base = format!("http://127.0.0.1:{}", args.port);

    crate::net::ensure_server_reachable(args.port)?;

    let run_id = &args.run_id;

    let resp = ureq::post(format!("{base}/runs/{run_id}/cancel")).send_empty();

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
