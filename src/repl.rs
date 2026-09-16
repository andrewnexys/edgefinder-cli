use anyhow::Result;
use rustyline::{error::ReadlineError, DefaultEditor};
use serde_json::Value;

use crate::{
    auth,
    cli::format_api_error,
    client::{ConversationMessage, EdgeFinderClient, EdgeFinderError, League},
    config,
};

const RESET: &str = "\x1b[0m";
const BOLD: &str = "\x1b[1m";
const DIM: &str = "\x1b[2m";
const GREEN: &str = "\x1b[32m";
const YELLOW: &str = "\x1b[33m";
const CYAN: &str = "\x1b[36m";
const RED: &str = "\x1b[31m";

struct Session {
    client: EdgeFinderClient,
    league: League,
    conversation_history: Vec<ConversationMessage>,
    thread_id: Option<String>,
}

pub async fn run() -> Result<()> {
    println!("\n  {BOLD}EdgeFinder v{}{RESET}", env!("CARGO_PKG_VERSION"));
    println!("  {DIM}Type a question or /help for commands.{RESET}\n");

    let client = auth::ensure_authenticated().await?;
    let mut session = Session {
        client,
        league: League::Nfl,
        conversation_history: Vec::new(),
        thread_id: None,
    };
    let mut editor = DefaultEditor::new()?;

    loop {
        let line = match editor.readline(&format!("{GREEN}> {RESET}")) {
            Ok(line) => line,
            Err(ReadlineError::Interrupted | ReadlineError::Eof) => break,
            Err(error) => return Err(error.into()),
        };
        let input = line.trim();
        if input.is_empty() {
            continue;
        }
        let _ = editor.add_history_entry(input);

        if !input.starts_with('/') || input.starts_with("/ask") {
            println!(
                "  {DIM}Analyzing ({})...{RESET}",
                session.league.as_str().to_uppercase()
            );
        }

        match execute(input, &mut session).await {
            Ok(Action::Continue(Some(output))) => println!("\n{output}\n"),
            Ok(Action::Continue(None)) => {}
            Ok(Action::Quit) => break,
            Err(error) => println!("  {RED}{}{RESET}\n", format_api_error(&error)),
        }
    }

    println!("\n  {DIM}Goodbye.{RESET}\n");
    Ok(())
}

enum Action {
    Continue(Option<String>),
    Quit,
}

async fn execute(input: &str, state: &mut Session) -> Result<Action, EdgeFinderError> {
    if !input.starts_with('/') {
        return Ok(Action::Continue(Some(handle_ask(state, input).await?)));
    }

    let mut parts = input[1..].splitn(2, char::is_whitespace);
    let command = parts.next().unwrap_or_default().to_lowercase();
    let args = parts.next().unwrap_or_default().trim();

    match command.as_str() {
        "quit" | "exit" | "q" => Ok(Action::Quit),
        "logout" => {
            config::clear_api_key().map_err(io_error)?;
            println!("{DIM}Logged out. API key removed.{RESET}");
            Ok(Action::Quit)
        }
        "ask" => Ok(Action::Continue(Some(handle_ask(state, args).await?))),
        "odds" => Ok(Action::Continue(Some(handle_odds(state, args).await?))),
        "schedule" => Ok(Action::Continue(Some(handle_schedule(state, args).await?))),
        "standings" => Ok(Action::Continue(Some(handle_standings(state, args).await?))),
        "portfolio" => Ok(Action::Continue(Some(handle_portfolio(state, args).await?))),
        "status" => Ok(Action::Continue(Some(handle_status(state).await?))),
        "nfl" => Ok(switch_league(state, League::Nfl)),
        "nba" => Ok(switch_league(state, League::Nba)),
        "mlb" => Ok(switch_league(state, League::Mlb)),
        "clear" => {
            state.conversation_history.clear();
            state.thread_id = None;
            Ok(Action::Continue(Some(format!(
                "{DIM}Conversation history cleared.{RESET}"
            ))))
        }
        "help" => Ok(Action::Continue(Some(help(state)))),
        _ => Ok(Action::Continue(Some(format!(
            "{RED}Unknown command: /{command}{RESET}. Type /help for available commands."
        )))),
    }
}

async fn handle_ask(state: &mut Session, question: &str) -> Result<String, EdgeFinderError> {
    if question.is_empty() {
        return Ok(format!(
            "{DIM}Usage: /ask <question>  (or just type your question){RESET}"
        ));
    }
    let response = state
        .client
        .ask(
            question,
            state.league,
            &state.conversation_history,
            state.thread_id.as_deref(),
        )
        .await?;
    state.conversation_history = response.conversation_history;
    if response.thread_id.is_some() {
        state.thread_id = response.thread_id;
    }
    let mut output = response.response;
    if let Some(usage) = response.usage {
        output.push_str(&format!(
            "\n\n{DIM}Tokens: {} | Remaining: {}/hr{RESET}",
            usage.tokens_used, usage.rate_limit_remaining.hour
        ));
    }
    Ok(output)
}

async fn handle_odds(state: &Session, arg: &str) -> Result<String, EdgeFinderError> {
    let league = resolve_league(state, arg);
    if league == League::Mlb {
        return Ok(unsupported("/odds"));
    }
    let value = if league == League::Nba {
        state.client.nba_odds(None).await?
    } else {
        state.client.nfl_odds(None).await?
    };
    pretty(value)
}

async fn handle_schedule(state: &Session, arg: &str) -> Result<String, EdgeFinderError> {
    let league = resolve_league(state, arg);
    if league == League::Mlb {
        return Ok(unsupported("/schedule"));
    }
    let value = if league == League::Nba {
        state.client.nba_schedule(None).await?
    } else {
        state.client.nfl_schedule().await?
    };
    pretty(value)
}

async fn handle_standings(state: &Session, arg: &str) -> Result<String, EdgeFinderError> {
    let league = resolve_league(state, arg);
    if league == League::Mlb {
        return Ok(unsupported("/standings"));
    }
    let value = if league == League::Nba {
        state.client.nba_standings().await?
    } else {
        state.client.nfl_standings().await?
    };
    pretty(value)
}

async fn handle_portfolio(state: &Session, args: &str) -> Result<String, EdgeFinderError> {
    let parts: Vec<_> = args.split_whitespace().collect();
    let view = parts.first().copied().unwrap_or("summary");
    let league = parts
        .get(1)
        .copied()
        .filter(|value| matches!(*value, "nfl" | "nba"));
    let value = match view {
        "positions" => state.client.portfolio_positions(league).await?,
        "trades" => state.client.portfolio_trades(league, None).await?,
        _ => state.client.portfolio_summary(league).await?,
    };
    pretty(value)
}

async fn handle_status(state: &Session) -> Result<String, EdgeFinderError> {
    let data = state.client.subscription_status().await?;
    let mut lines = vec![
        format!("Plan:           {}", data.subscription_plan),
        format!("Status:         {}", data.subscription_status),
        format!(
            "Access:         {} ({})",
            if data.has_access { "Yes" } else { "No" },
            data.reason
        ),
        format!(
            "Unlimited:      {}",
            if data.has_unlimited_access {
                "Yes"
            } else {
                "No"
            }
        ),
    ];
    if data.is_trialing {
        if let Some(days) = data.trial_days_left {
            lines.push(format!("Trial:          {days} days remaining"));
        }
    }
    if let Some(end) = data.trial_ends_at {
        lines.push(format!("Trial ends:     {end}"));
    }
    Ok(lines.join("\n"))
}

fn resolve_league(state: &Session, arg: &str) -> League {
    match arg.trim().to_lowercase().as_str() {
        "nfl" => League::Nfl,
        "nba" => League::Nba,
        "mlb" => League::Mlb,
        _ => state.league,
    }
}

fn switch_league(state: &mut Session, league: League) -> Action {
    state.league = league;
    Action::Continue(Some(format!(
        "Switched to {BOLD}{}{RESET}",
        league.as_str().to_uppercase()
    )))
}

fn unsupported(command: &str) -> String {
    format!("{YELLOW}{command} is not available for MLB in the CLI yet.{RESET}\n{DIM}Use /mlb and ask a question directly for MLB analysis.{RESET}")
}

fn help(state: &Session) -> String {
    format!(
        "{BOLD}Commands{RESET}\n\n  {CYAN}/ask <question>{RESET}     Ask EdgeFinder for analysis\n  {CYAN}/odds [league]{RESET}      Get Polymarket betting odds\n  {CYAN}/schedule [league]{RESET}  Get game schedule\n  {CYAN}/standings [league]{RESET} Get league standings\n  {CYAN}/portfolio [view]{RESET}   Get portfolio (summary|positions|trades)\n  {CYAN}/status{RESET}             Check subscription status\n  {CYAN}/nfl{RESET}                Switch to NFL\n  {CYAN}/nba{RESET}                Switch to NBA\n  {CYAN}/mlb{RESET}                Switch to MLB\n  {CYAN}/clear{RESET}              Clear conversation history\n  {CYAN}/help{RESET}               Show this help\n  {CYAN}/logout{RESET}             Log out and exit\n  {CYAN}/quit{RESET}               Exit\n\n{DIM}Current league: {}{RESET}\n{DIM}Tip: Type any question without / to chat with the AI.{RESET}",
        state.league.as_str().to_uppercase()
    )
}

fn pretty(value: Value) -> Result<String, EdgeFinderError> {
    serde_json::to_string_pretty(&value).map_err(EdgeFinderError::Json)
}

fn io_error(error: std::io::Error) -> EdgeFinderError {
    EdgeFinderError::Api {
        status: 0,
        message: error.to_string(),
    }
}
