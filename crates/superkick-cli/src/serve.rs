use std::path::Path;

use superkick_api::ServerConfig;

#[derive(clap::Args)]
pub struct ServeArgs {
    /// Path to superkick.yaml
    #[arg(short, long, default_value = "superkick.yaml")]
    pub config: String,

    /// SQLite database URL
    #[arg(short, long, default_value = "sqlite:superkick.db")]
    pub db: String,

    /// HTTP listen port
    #[arg(short, long, default_value_t = 3100)]
    pub port: u16,

    /// Cache directory for bare clones
    #[arg(long, default_value = ".superkick-cache")]
    pub cache_dir: String,
}

pub async fn run(args: ServeArgs) -> anyhow::Result<()> {
    if !Path::new(&args.config).exists() {
        anyhow::bail!(
            "Config file not found: {}\n\
             Run `superkick init` first, or pass --config <path>.",
            args.config
        );
    }

    let addr = format!("0.0.0.0:{}", args.port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::AddrInUse => anyhow::anyhow!(
                "Port {} is already in use.\n\n\
                 Check what's running:  lsof -i :{}\n\
                 Kill it:               kill $(lsof -ti :{})\n\
                 Or use another port:   superkick serve -p {}",
                args.port,
                args.port,
                args.port,
                args.port + 1
            ),
            std::io::ErrorKind::PermissionDenied => anyhow::anyhow!(
                "Permission denied binding to port {}.\n\
                 Try a port above 1024:  superkick serve -p {}",
                args.port,
                args.port.max(1025)
            ),
            _ => anyhow::anyhow!("Failed to bind to {}: {}", addr, e),
        })?;

    superkick_api::run_server(ServerConfig {
        config_path: args.config,
        database_url: args.db,
        cache_dir: args.cache_dir,
        listener,
    })
    .await
}
