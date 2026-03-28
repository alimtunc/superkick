use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

mod cancel;
mod doctor;
mod init;
mod run;
mod serve;
mod status;

#[derive(Parser)]
#[command(name = "superkick", about = "Superkick — turn issues into pull requests")]
#[command(version, propagate_version = true)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Cancel an active run
    Cancel(cancel::CancelArgs),
    /// Check that your machine has the tools Superkick needs
    Doctor,
    /// Initialize a repository for Superkick
    Init,
    /// Trigger a run for an issue
    Run(run::RunArgs),
    /// Start the Superkick server
    Serve(serve::ServeArgs),
    /// Check if the Superkick server is running
    Status(status::StatusArgs),
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Cancel(args) => cancel::run(args),
        Commands::Doctor => doctor::run(),
        Commands::Init => init::run(),
        Commands::Run(args) => run::run(args),
        Commands::Serve(args) => {
            tracing_subscriber::fmt()
                .with_env_filter(EnvFilter::from_default_env())
                .init();

            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()?
                .block_on(serve::run(args))
        }
        Commands::Status(args) => status::run(args),
    }
}
