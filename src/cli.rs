use anyhow::{bail, Result};
use clap::{Args, Parser, Subcommand, ValueEnum};
use serde_json::Value;

use crate::{
    auth,
    client::{EdgeFinderClient, League, SubscriptionStatus},
    config,
};

#[derive(Debug, Parser)]
#[command(
    name = "edgefinder",
    version,
    about = "AI-powered sports analysis from your terminal"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Log in to EdgeFinder.
    Login,
    /// Log out of EdgeFinder.
    Logout,
    /// Ask EdgeFinder for sports analysis.
    Ask(AskArgs),
    /// Get game schedules and scores.
    Schedule(ScheduleArgs),
    /// Get Polymarket betting odds.
    Odds(OddsArgs),
    /// Get league standings.
    Standings(StandingsArgs),
    /// Get Polymarket portfolio data.
    Portfolio(PortfolioArgs),
    /// Manage EdgeFinder CLI configuration.
    Config(ConfigArgs),
    /// Check account and subscription status.
    Status(OutputArgs),
    /// Run the local stdio MCP server.
    Mcp,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum DiscoverLeague {
    Nfl,
    Nba,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum PortfolioLeague {
    Nfl,
    Nba,
    All,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum PortfolioView {
    Summary,
    Positions,
    Trades,
}

#[derive(Debug, Args)]
pub struct AskArgs {
    /// Your sports analysis question.
    pub question: String,
    #[arg(long, conflicts_with_all = ["nba", "mlb"])]
    pub nfl: bool,
    #[arg(long, conflicts_with_all = ["nfl", "mlb"])]
    pub nba: bool,
    #[arg(long, conflicts_with_all = ["nfl", "nba"])]
    pub mlb: bool,
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct ScheduleArgs {
    pub league: DiscoverLeague,
    #[arg(long)]
    pub date: Option<String>,
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct OddsArgs {
    pub league: DiscoverLeague,
    #[arg(long)]
    pub week: Option<u32>,
    #[arg(long)]
    pub date: Option<String>,
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct StandingsArgs {
    pub league: DiscoverLeague,
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct PortfolioArgs {
    #[arg(value_enum, default_value_t = PortfolioView::Summary)]
    pub view: PortfolioView,
    #[arg(long, value_enum, default_value_t = PortfolioLeague::All)]
    pub league: PortfolioLeague,
    #[arg(long)]
    pub limit: Option<u32>,
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct OutputArgs {
    #[arg(long)]
    pub json: bool,
}

#[derive(Debug, Args)]
pub struct ConfigArgs {
    #[command(subcommand)]
    command: ConfigCommand,
}

#[derive(Debug, Subcommand)]
enum ConfigCommand {
    /// Set api-key or base-url.
    Set { key: String, value: String },
    /// Show the current configuration.
    Show,
}

pub async fn run(command: Command) -> Result<()> {
    match command {
        Command::Login => {
            auth::login(false).await?;
            eprintln!("  Try: edgefinder ask \"Who should I bet on tonight?\"");
        }
        Command::Logout => logout()?,
        Command::Ask(args) => ask(args).await?,
        Command::Schedule(args) => schedule(args).await?,
        Command::Odds(args) => odds(args).await?,
        Command::Standings(args) => standings(args).await?,
        Command::Portfolio(args) => portfolio(args).await?,
        Command::Config(args) => run_config(args)?,
        Command::Status(args) => status(args).await?,
        Command::Mcp => crate::mcp::run().await?,
    }
    Ok(())
}

fn logout() -> Result<()> {
    if config::api_key().is_none() {
        println!("Not currently logged in.");
        return Ok(());
    }
    config::clear_api_key()?;
    println!("Logged out. API key removed from ~/.edgefinder/config.json");
    Ok(())
}

async fn ask(args: AskArgs) -> Result<()> {
    let league = if args.mlb {
        League::Mlb
    } else if args.nba {
        League::Nba
    } else {
        League::Nfl
    };
    let client = auth::ensure_authenticated().await?;
    if !args.json {
        eprintln!("Analyzing ({})...", league.as_str().to_uppercase());
    }
    let response = client.ask(&args.question, league, &[], None).await?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&response.raw)?);
    } else {
        println!("{}", response.response);
    }
    Ok(())
}

async fn schedule(args: ScheduleArgs) -> Result<()> {
    let client = auth::ensure_authenticated().await?;
    let data = match args.league {
        DiscoverLeague::Nfl => client.nfl_schedule().await?,
        DiscoverLeague::Nba => client.nba_schedule(args.date.as_deref()).await?,
    };
    print_json(&data)
}

async fn odds(args: OddsArgs) -> Result<()> {
    let client = auth::ensure_authenticated().await?;
    let data = match args.league {
        DiscoverLeague::Nfl => client.nfl_odds(args.week).await?,
        DiscoverLeague::Nba => client.nba_odds(args.date.as_deref()).await?,
    };
    print_json(&data)
}

async fn standings(args: StandingsArgs) -> Result<()> {
    let client = auth::ensure_authenticated().await?;
    let data = match args.league {
        DiscoverLeague::Nfl => client.nfl_standings().await?,
        DiscoverLeague::Nba => client.nba_standings().await?,
    };
    print_json(&data)
}

async fn portfolio(args: PortfolioArgs) -> Result<()> {
    let client = auth::ensure_authenticated().await?;
    let league = match args.league {
        PortfolioLeague::Nfl => Some("nfl"),
        PortfolioLeague::Nba => Some("nba"),
        PortfolioLeague::All => None,
    };
    let data = match args.view {
        PortfolioView::Summary => client.portfolio_summary(league).await?,
        PortfolioView::Positions => client.portfolio_positions(league).await?,
        PortfolioView::Trades => client.portfolio_trades(league, args.limit).await?,
    };
    print_json(&data)
}

async fn status(args: OutputArgs) -> Result<()> {
    let client = auth::ensure_authenticated().await?;
    if args.json {
        print_json(&client.subscription_status_value().await?)
    } else {
        print_status(&client.subscription_status().await?);
        Ok(())
    }
}

pub fn print_status(data: &SubscriptionStatus) {
    println!("Plan:           {}", data.subscription_plan);
    println!("Status:         {}", data.subscription_status);
    println!(
        "Access:         {} ({})",
        if data.has_access { "Yes" } else { "No" },
        data.reason
    );
    println!(
        "Unlimited:      {}",
        if data.has_unlimited_access {
            "Yes"
        } else {
            "No"
        }
    );
    if data.is_trialing {
        if let Some(days) = data.trial_days_left {
            println!("Trial:          {days} days remaining");
        }
    }
    if let Some(end) = &data.trial_ends_at {
        println!("Trial ends:     {end}");
    }
}

fn run_config(args: ConfigArgs) -> Result<()> {
    match args.command {
        ConfigCommand::Set { key, value } if key == "api-key" => {
            if !value.starts_with("ef_live_") {
                bail!("API key must start with \"ef_live_\"");
            }
            let preview = value[..value.len().min(15)].to_owned();
            config::set_api_key(value)?;
            println!("API key saved ({preview}...)");
        }
        ConfigCommand::Set { key, value } if key == "base-url" => {
            config::set_base_url(value.clone())?;
            println!("Base URL set to: {}", value.trim_end_matches('/'));
        }
        ConfigCommand::Set { key, .. } => {
            bail!("Unknown config key: {key}. Valid keys: api-key, base-url")
        }
        ConfigCommand::Show => {
            let summary = config::summary();
            println!(
                "API Key:     {}",
                summary.api_key.as_deref().unwrap_or("(not set)")
            );
            println!("Base URL:    {}", summary.base_url);
            println!("Config file: {}", summary.config_path.display());
        }
    }
    Ok(())
}

fn print_json(value: &Value) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}

pub fn format_api_error(error: &crate::client::EdgeFinderError) -> String {
    match error.status() {
        Some(401) => "Session expired. Run: edgefinder login".to_owned(),
        _ => format!("Error: {error}"),
    }
}

#[allow(dead_code)]
fn _assert_client_send_sync(_: &EdgeFinderClient) {}
