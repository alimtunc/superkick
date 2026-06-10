use superkick_api::ServerConfig;

#[derive(clap::Args)]
pub struct ServeArgs {
    /// Path to superkick.yaml
    #[arg(short, long, default_value = superkick_config::CONFIG_FILENAME)]
    pub config: String,

    /// SQLite database URL
    #[arg(short, long, default_value = superkick_config::DEFAULT_DATABASE_URL)]
    pub db: String,

    /// HTTP listen port
    #[arg(short, long, default_value_t = superkick_config::DEFAULT_PORT)]
    pub port: u16,

    /// Cache directory for bare clones
    #[arg(long, default_value = superkick_config::DEFAULT_CACHE_DIR)]
    pub cache_dir: String,

    /// Skip serving the bundled dashboard (API only)
    #[arg(long)]
    pub no_ui: bool,
}

pub async fn run(args: ServeArgs) -> anyhow::Result<()> {
    // `superkick.yaml` is optional — the server boots from product
    // defaults when the file is absent, so no preflight existence check here.
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
        serve_ui: !args.no_ui,
    })
    .await
}
