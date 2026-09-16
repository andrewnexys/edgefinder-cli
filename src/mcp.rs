use anyhow::{bail, Result};
use regex::Regex;
use serde_json::{json, Map, Value};
use std::io::{self, BufRead, Write};

use crate::{
    client::{EdgeFinderClient, EdgeFinderError, League},
    config,
};

pub async fn run() -> Result<()> {
    let Some(api_key) = config::api_key() else {
        eprintln!("Error: No API key configured.");
        eprintln!("Set EDGEFINDER_API_KEY in your MCP config.\n");
        eprintln!("Example configuration:");
        eprintln!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "mcpServers": {
                    "edgefinder": {
                        "command": "edgefinder",
                        "args": ["mcp"],
                        "env": { "EDGEFINDER_API_KEY": "ef_live_..." }
                    }
                }
            }))?
        );
        bail!("No API key configured")
    };

    let client = EdgeFinderClient::new(api_key, config::base_url());
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Value>(&line) {
            Ok(message) => handle_message(&client, message).await,
            Err(_) => Some(rpc_error(Value::Null, -32700, "Parse error")),
        };
        if let Some(response) = response {
            serde_json::to_writer(&mut stdout, &response)?;
            writeln!(stdout)?;
            stdout.flush()?;
        }
    }
    Ok(())
}

async fn handle_message(client: &EdgeFinderClient, message: Value) -> Option<Value> {
    let object = match message.as_object() {
        Some(value) => value,
        None => return Some(rpc_error(Value::Null, -32600, "Invalid Request")),
    };
    let id = object.get("id").cloned();
    let method = object.get("method").and_then(Value::as_str);
    if method.is_some_and(|value| value.starts_with("notifications/")) || id.is_none() {
        return None;
    }
    let id = id.unwrap_or(Value::Null);

    match method {
        Some("initialize") => Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "protocolVersion": object.get("params").and_then(Value::as_object).and_then(|params| params.get("protocolVersion")).and_then(Value::as_str).unwrap_or("2024-11-05"),
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "edgefinder", "version": env!("CARGO_PKG_VERSION") }
            }
        })),
        Some("ping") => Some(json!({ "jsonrpc": "2.0", "id": id, "result": {} })),
        Some("tools/list") => {
            Some(json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tools() } }))
        }
        Some("tools/call") => {
            let params = object.get("params").and_then(Value::as_object);
            let name = params
                .and_then(|value| value.get("name"))
                .and_then(Value::as_str);
            let args = params
                .and_then(|value| value.get("arguments"))
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            match name {
                Some(name) if tool_names().contains(&name) => {
                    let result = call_tool(client, name, &args).await;
                    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
                }
                _ => Some(rpc_error(id, -32602, "Unknown tool")),
            }
        }
        Some(method) => Some(rpc_error(
            id,
            -32601,
            &format!("Method not found: {method}"),
        )),
        None => Some(rpc_error(id, -32600, "Invalid Request")),
    }
}

fn rpc_error(id: Value, code: i32, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn tool_names() -> [&'static str; 7] {
    [
        "ask",
        "get_schedule",
        "get_standings",
        "get_odds",
        "get_portfolio",
        "analyze_position",
        "get_status",
    ]
}

fn tools() -> Value {
    Value::Array(vec![
        tool("ask", "Ask EdgeFinder for NFL, NBA, or MLB sports analysis — betting recommendations, player stats, matchup breakdowns, odds analysis, injury reports, and more.", json!({
            "question": string_schema("Your sports analysis question"),
            "league": enum_schema(&["nfl", "nba", "mlb"], "Which league to analyze", Some("nfl"))
        }), &["question"]),
        tool("get_schedule", "Get the current game schedule and scores for NFL or NBA.", json!({
            "league": enum_schema(&["nfl", "nba"], "Which league schedule to retrieve", None),
            "date": string_schema("For NBA: specific date (YYYY-MM-DD). Omit for today's games.")
        }), &["league"]),
        tool("get_standings", "Get current league standings for NFL or NBA.", json!({
            "league": enum_schema(&["nfl", "nba"], "Which league standings to retrieve", None)
        }), &["league"]),
        tool("get_odds", "Get Polymarket betting odds for NFL or NBA games.", json!({
            "league": enum_schema(&["nfl", "nba"], "Which league odds to retrieve", None),
            "week": { "type": "number", "description": "For NFL: specific week number" },
            "date": string_schema("For NBA: specific date (YYYY-MM-DD)")
        }), &["league"]),
        tool("get_portfolio", "Get Polymarket portfolio data — summary, open positions, or trade history. Requires a connected Polymarket wallet.", json!({
            "view": enum_schema(&["summary", "positions", "trades"], "Which portfolio view to retrieve", Some("summary")),
            "league": enum_schema(&["nfl", "nba", "all"], "Filter by league", Some("all"))
        }), &[]),
        tool("analyze_position", "Analyze a specific Polymarket portfolio position using EdgeFinder AI. Searches open positions, trade history, or closed positions by title/team name.", json!({
            "search": string_schema("Search term to match a position by title or team name"),
            "view": enum_schema(&["open", "trade", "closed"], "Which portfolio tab to search", Some("open")),
            "league": enum_schema(&["nfl", "nba", "all"], "Filter by league", Some("all"))
        }), &["search"]),
        tool("get_status", "Check your EdgeFinder account status — subscription plan, query usage, and access level.", json!({}), &[]),
    ])
}

fn tool(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": false
        }
    })
}

fn string_schema(description: &str) -> Value {
    json!({ "type": "string", "description": description })
}

fn enum_schema(values: &[&str], description: &str, default: Option<&str>) -> Value {
    let mut schema = json!({ "type": "string", "enum": values, "description": description });
    if let Some(default) = default {
        schema["default"] = Value::String(default.to_owned());
    }
    schema
}

async fn call_tool(client: &EdgeFinderClient, name: &str, args: &Map<String, Value>) -> Value {
    let result = match name {
        "ask" => call_ask(client, args).await,
        "get_schedule" => call_schedule(client, args).await,
        "get_standings" => call_standings(client, args).await,
        "get_odds" => call_odds(client, args).await,
        "get_portfolio" => call_portfolio(client, args).await,
        "analyze_position" => analyze_position(client, args).await,
        "get_status" => client
            .subscription_status_value()
            .await
            .map(|value| pretty(&value)),
        _ => unreachable!(),
    };
    match result {
        Ok(text) => tool_result(text, false),
        Err(error) => tool_result(format!("Error: {}", format_error(&error)), true),
    }
}

fn tool_result(text: String, is_error: bool) -> Value {
    let mut value = json!({ "content": [{ "type": "text", "text": text }] });
    if is_error {
        value["isError"] = Value::Bool(true);
    }
    value
}

async fn call_ask(
    client: &EdgeFinderClient,
    args: &Map<String, Value>,
) -> Result<String, EdgeFinderError> {
    let question = required_string(args, "question")?;
    let league = league(args.get("league").and_then(Value::as_str).unwrap_or("nfl"))?;
    Ok(client.ask(question, league, &[], None).await?.response)
}

async fn call_schedule(
    client: &EdgeFinderClient,
    args: &Map<String, Value>,
) -> Result<String, EdgeFinderError> {
    let league = required_string(args, "league")?;
    let date = args.get("date").and_then(Value::as_str);
    let value = match league {
        "nba" => client.nba_schedule(date).await?,
        "nfl" => client.nfl_schedule().await?,
        _ => return Err(validation("league must be nfl or nba")),
    };
    Ok(pretty(&value))
}

async fn call_standings(
    client: &EdgeFinderClient,
    args: &Map<String, Value>,
) -> Result<String, EdgeFinderError> {
    let value = match required_string(args, "league")? {
        "nba" => client.nba_standings().await?,
        "nfl" => client.nfl_standings().await?,
        _ => return Err(validation("league must be nfl or nba")),
    };
    Ok(pretty(&value))
}

async fn call_odds(
    client: &EdgeFinderClient,
    args: &Map<String, Value>,
) -> Result<String, EdgeFinderError> {
    let value = match required_string(args, "league")? {
        "nba" => {
            client
                .nba_odds(args.get("date").and_then(Value::as_str))
                .await?
        }
        "nfl" => {
            client
                .nfl_odds(
                    args.get("week")
                        .and_then(Value::as_u64)
                        .map(|value| value as u32),
                )
                .await?
        }
        _ => return Err(validation("league must be nfl or nba")),
    };
    Ok(pretty(&value))
}

async fn call_portfolio(
    client: &EdgeFinderClient,
    args: &Map<String, Value>,
) -> Result<String, EdgeFinderError> {
    let view = args
        .get("view")
        .and_then(Value::as_str)
        .unwrap_or("summary");
    let league = optional_portfolio_league(args)?;
    let value = match view {
        "positions" => client.portfolio_positions(league).await?,
        "trades" => client.portfolio_trades(league, Some(50)).await?,
        "summary" => client.portfolio_summary(league).await?,
        _ => return Err(validation("view must be summary, positions, or trades")),
    };
    Ok(pretty(&value))
}

async fn analyze_position(
    client: &EdgeFinderClient,
    args: &Map<String, Value>,
) -> Result<String, EdgeFinderError> {
    let search = required_string(args, "search")?;
    let view = args.get("view").and_then(Value::as_str).unwrap_or("open");
    let league_filter = optional_portfolio_league(args)?;
    let (items, label) = match view {
        "open" => (
            client.portfolio_positions(league_filter).await?["positions"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
            "open position",
        ),
        "trade" => (
            client.portfolio_trades(league_filter, Some(50)).await?["trades"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
            "trade",
        ),
        "closed" => (
            client.portfolio_closed(league_filter, Some(50)).await?["positions"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
            "closed position",
        ),
        _ => return Err(validation("view must be open, trade, or closed")),
    };
    let search_lower = search.to_lowercase();
    let Some(item) = items
        .iter()
        .find(|item| field(item, "title").to_lowercase().contains(&search_lower))
    else {
        let available = items
            .iter()
            .take(10)
            .map(|item| field(item, "title"))
            .collect::<Vec<_>>()
            .join("\n  - ");
        return Ok(format!(
            "No {label} matching \"{search}\" found.\n\nAvailable entries:\n  - {}",
            if available.is_empty() {
                "(none)"
            } else {
                &available
            }
        ));
    };

    let title = field(item, "title");
    let slug = field(item, "slug");
    let event_slug = item.get("eventSlug").and_then(Value::as_str);
    let Some((analysis_league, date)) = parse_slug(&slug, event_slug) else {
        return Ok(format!(
            "Found \"{title}\" but could not parse game details from slug \"{slug}\"."
        ));
    };
    let Some((away, home)) = parse_teams(&title) else {
        return Ok(format!(
            "Found \"{title}\" but could not parse the matchup teams."
        ));
    };
    let prompt = position_prompt(view, item, analysis_league, &date, &away, &home);
    Ok(client
        .ask(&prompt, analysis_league, &[], None)
        .await?
        .response)
}

fn position_prompt(
    view: &str,
    item: &Value,
    league: League,
    date: &str,
    away: &str,
    home: &str,
) -> String {
    let title = field(item, "title");
    let outcome = field(item, "outcome");
    let history_tool = if league == League::Nba {
        "get_nba_polymarket_odds_history"
    } else {
        "get_polymarket_odds_history"
    };
    match view {
        "open" => format!(
            "I have an open Polymarket position: {:.1} shares of \"{}\" on {}, bought at avg ${:.2} (PnL: {:+.2}).\n\nAnalyze whether this bet still makes sense:\n1. Use {history_tool} with homeTeam=\"{home}\", awayTeam=\"{away}\", gameDate=\"{date}\" to show odds movement\n2. Compare both teams' current form and records\n3. Check both teams' injury reports\n4. Make the strongest data-backed case for and against \"{outcome}\"\n5. Identify hidden risks\n6. Give a direct hold/exit recommendation.",
            number(item, "size"), outcome, title, number(item, "avgPrice"), number(item, "cashPnl")
        ),
        "trade" => format!(
            "I {} {:.1} shares of \"{}\" on {} at ${:.2}.\n\nAnalyze whether this was a smart trade:\n1. Use {history_tool} with homeTeam=\"{home}\", awayTeam=\"{away}\", gameDate=\"{date}\" to compare my entry with subsequent movement\n2. Assess the entry price using information available at the time\n3. Compare both teams' form and injury reports\n4. Make the case for and against \"{outcome}\" using concrete data\n5. Explain what I got right or missed.",
            if field(item, "side") == "BUY" { "bought" } else { "sold" }, number(item, "size"), outcome, title, number(item, "price")
        ),
        _ => {
            let pnl = number(item, "realizedPnl");
            let result = if pnl >= 0.0 { "WON" } else { "LOST" };
            let game_tool = if league == League::Nba { "get_game_box_score" } else { "find_game_by_teams followed by get_postgame_analysis" };
            format!(
                "Post-mortem my closed Polymarket position: \"{}\" on {}, avg entry ${:.2}, resolved at ${:.2}, realized PnL {:+.2}. I {result}.\n\n1. Use {game_tool} for the actual {away} vs {home} game on {date}; do not invent stats\n2. Use {history_tool} to show the full odds arc\n3. Assess my entry timing\n4. Explain the key outcome factors\n5. Explain what I read correctly or missed\n6. Give one actionable lesson.",
                outcome, title, number(item, "avgPrice"), number(item, "curPrice"), pnl
            )
        }
    }
}

fn parse_slug(slug: &str, event_slug: Option<&str>) -> Option<(League, String)> {
    let regex = Regex::new(r"^(nba|nfl)-.*-(\d{4}-\d{2}-\d{2})$").ok()?;
    for candidate in [Some(slug), event_slug].into_iter().flatten() {
        if let Some(captures) = regex.captures(candidate) {
            let league = if &captures[1] == "nba" {
                League::Nba
            } else {
                League::Nfl
            };
            return Some((league, captures[2].to_owned()));
        }
    }
    None
}

fn parse_teams(title: &str) -> Option<(String, String)> {
    let (away, rest) = title.split_once(" vs. ")?;
    let home = rest.split(':').next()?.trim();
    Some((away.trim().to_owned(), home.to_owned()))
}

fn required_string<'a>(
    args: &'a Map<String, Value>,
    name: &str,
) -> Result<&'a str, EdgeFinderError> {
    args.get(name)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| validation(&format!("missing required argument: {name}")))
}

fn optional_portfolio_league(args: &Map<String, Value>) -> Result<Option<&str>, EdgeFinderError> {
    match args.get("league").and_then(Value::as_str).unwrap_or("all") {
        "all" => Ok(None),
        league @ ("nfl" | "nba") => Ok(Some(league)),
        _ => Err(validation("league must be nfl, nba, or all")),
    }
}

fn league(value: &str) -> Result<League, EdgeFinderError> {
    match value {
        "nfl" => Ok(League::Nfl),
        "nba" => Ok(League::Nba),
        "mlb" => Ok(League::Mlb),
        _ => Err(validation("league must be nfl, nba, or mlb")),
    }
}

fn field(value: &Value, name: &str) -> String {
    value
        .get(name)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn number(value: &Value, name: &str) -> f64 {
    value.get(name).and_then(Value::as_f64).unwrap_or_default()
}

fn validation(message: &str) -> EdgeFinderError {
    EdgeFinderError::Api {
        status: 0,
        message: message.to_owned(),
    }
}

fn pretty(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

fn format_error(error: &EdgeFinderError) -> String {
    match error.status() {
        Some(401) => "Authentication failed. Check EDGEFINDER_API_KEY or generate a new key in EdgeFinder settings.".to_owned(),
        Some(403) => "Monthly query limit reached. Upgrade your EdgeFinder plan for more access.".to_owned(),
        _ => error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_game_details() {
        assert_eq!(
            parse_slug("nba-mavericks-lakers-2026-02-20", None),
            Some((League::Nba, "2026-02-20".to_owned()))
        );
        assert_eq!(
            parse_teams("Mavericks vs. Lakers: O/U 236.5"),
            Some(("Mavericks".to_owned(), "Lakers".to_owned()))
        );
    }

    #[test]
    fn publishes_all_tools() {
        assert_eq!(tools().as_array().map(Vec::len), Some(7));
    }
}
