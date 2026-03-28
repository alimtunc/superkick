use std::time::Duration;

const DEFAULT_PORTS: &[u16] = &[3100, 3000];

#[derive(clap::Args)]
pub struct StatusArgs {
    /// Port to check (checks 3000 and 3100 by default)
    #[arg(short, long)]
    pub port: Option<u16>,
}

fn check_health(port: u16) -> bool {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
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
