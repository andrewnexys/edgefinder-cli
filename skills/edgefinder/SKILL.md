---
name: edgefinder
description: Use EdgeFinder for NFL, NBA, and MLB sports betting analysis, schedules, standings, odds, and Polymarket portfolio analysis.
---

# EdgeFinder

Use this skill when the user asks for sports betting analysis, NFL, NBA, or MLB matchup research, schedules, standings, Polymarket odds, or portfolio position review.

Prefer the EdgeFinder MCP tools over shell commands when they are available.

## Authentication

EdgeFinder requires an active paid subscription and an API key.

Configure `EDGEFINDER_API_KEY` in the plugin or MCP environment. Never print, echo, or reveal the full API key to the user.

## Tools

- `ask`: AI-powered NFL, NBA, or MLB analysis, including betting picks, player stats, matchups, injuries, and odds.
- `get_schedule`: NFL or NBA game schedules and scores.
- `get_standings`: NFL or NBA league standings.
- `get_odds`: NFL or NBA Polymarket betting odds.
- `get_portfolio`: Polymarket portfolio summary, open positions, or trade history.
- `analyze_position`: Search a Polymarket position by team or title and run EdgeFinder analysis.
- `get_status`: EdgeFinder account, subscription, and query usage status.

## Usage Guidance

For broad analysis questions, use `ask` with the right league:

- Use `league: "nba"` for NBA games, players, props, injuries, standings, and odds.
- Use `league: "nfl"` for NFL games, players, injuries, standings, and odds.
- Use `league: "mlb"` for MLB conversational analysis.

For structured lookups, prefer the narrower tool:

- Use `get_schedule` for schedules or scores.
- Use `get_standings` for standings.
- Use `get_odds` for current betting odds.
- Use `get_portfolio` for portfolio summaries, positions, and trades.
- Use `analyze_position` when the user asks whether to hold, exit, review, or post-mortem a specific Polymarket position.

Do not expose internal tool names in the final user-facing answer unless the user explicitly asks how the plugin works.
