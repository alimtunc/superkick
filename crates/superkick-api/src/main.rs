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

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;

    superkick_api::run_server(ServerConfig {
        config_path,
        database_url,
        cache_dir,
        listener,
    })
    .await
}
