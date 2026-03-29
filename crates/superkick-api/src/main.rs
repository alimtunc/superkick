use tracing_subscriber::EnvFilter;

use superkick_api::ServerConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let config_path = std::env::var("SUPERKICK_CONFIG").unwrap_or_else(|_| "superkick.yaml".into());
    let database_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:superkick.db".into());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3100);
    let cache_dir =
        std::env::var("SUPERKICK_CACHE_DIR").unwrap_or_else(|_| ".superkick-cache".into());

    let (listener, actual_port) = bind_with_fallback(port, 10).await?;

    // Write the actual port so the frontend dev server can discover it.
    let port_file = std::path::Path::new(&config_path)
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .join(".superkick-port");
    std::fs::write(&port_file, actual_port.to_string())?;

    let result = superkick_api::run_server(ServerConfig {
        config_path,
        database_url,
        cache_dir,
        listener,
    })
    .await;

    // Clean up port file on shutdown.
    let _ = std::fs::remove_file(&port_file);

    result
}

/// Try binding to `start_port`, incrementing up to `max_attempts` times on failure.
async fn bind_with_fallback(
    start_port: u16,
    max_attempts: u16,
) -> anyhow::Result<(tokio::net::TcpListener, u16)> {
    for offset in 0..max_attempts {
        let port = start_port
            .checked_add(offset)
            .ok_or_else(|| anyhow::anyhow!("port overflow while scanning from {start_port}"))?;
        match tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await {
            Ok(listener) => {
                if offset > 0 {
                    eprintln!("Port {start_port} was busy — using {port} instead");
                }
                return Ok((listener, port));
            }
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(e) => return Err(e.into()),
        }
    }
    anyhow::bail!(
        "could not bind to any port in range {}..{}",
        start_port,
        start_port + max_attempts
    )
}
