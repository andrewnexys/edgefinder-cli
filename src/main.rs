mod auth;
mod cli;
mod client;
mod config;
mod mcp;
mod repl;

use clap::Parser;

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("Error: {error}");
        std::process::exit(1);
    }
}

async fn run() -> anyhow::Result<()> {
    let args = cli::Cli::parse();
    match args.command {
        Some(command) => cli::run(command).await,
        None => repl::run().await,
    }
}
