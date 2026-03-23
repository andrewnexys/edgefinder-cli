# @edgefinder/cli

CLI and MCP server for [EdgeFinder](https://edgefinder.io) sports analysis. Get AI-powered NFL and NBA betting recommendations, player stats, odds, schedules, and Polymarket portfolio tracking from your terminal or AI agent.

## Requirements

- Node.js 18+
- EdgeFinder subscription (Starter $20/mo, Pro $50/mo, or Ultimate $150/mo)

## Getting Started

```bash
# Install
npm install -g @edgefinder/cli

# Log in (opens magic link in your email)
edgefinder login

# Start asking questions
edgefinder ask "Who should I bet on tonight?"
```

`edgefinder login` will walk you through everything — enter your email, click the magic link, and if you don't have a subscription yet, it'll open the pricing page in your browser. Once you're set up, your API key is saved automatically.

To log out:

```bash
edgefinder logout
```

### Manual Configuration

You can also set your API key directly if you already have one from [chat.edgefinder.io/settings/integrations](https://chat.edgefinder.io/settings/integrations):

```bash
# Environment variable
export EDGEFINDER_API_KEY=ef_live_...

# Or save to config file (~/.edgefinder/config.json)
edgefinder config set api-key ef_live_...
```

## CLI Usage

```bash
# AI-powered analysis
edgefinder ask "Who should I bet on tonight?"         # NFL (default)
edgefinder ask --nba "Lakers vs Celtics prediction"   # NBA

# Schedules and scores
edgefinder schedule nfl
edgefinder schedule nba --date 2026-02-20

# Polymarket odds
edgefinder odds nfl --week 12
edgefinder odds nba

# Standings
edgefinder standings nba

# Portfolio tracking (requires connected Polymarket wallet)
edgefinder portfolio summary
edgefinder portfolio positions
edgefinder portfolio trades

# Account status
edgefinder status
```

All commands support `--json` for machine-readable output.

## MCP Server

Use EdgeFinder as a tool in AI agents like Claude Desktop, Openclaw, or any MCP-compatible client.

### Setup

Add to your MCP client config:

```json
{
  "mcpServers": {
    "edgefinder": {
      "command": "npx",
      "args": ["-y", "@edgefinder/cli", "mcp"],
      "env": {
        "EDGEFINDER_API_KEY": "ef_live_..."
      }
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `ask` | AI sports analysis -- betting picks, player stats, matchups |
| `get_schedule` | Game schedules and scores |
| `get_standings` | League standings |
| `get_odds` | Polymarket betting odds |
| `get_portfolio` | Polymarket portfolio data (summary, positions, trades) |
| `analyze_position` | Analyze a portfolio position -- searches by team/title, runs AI analysis with hold/exit advice, entry assessment, or win/loss post-mortem |
| `get_status` | Account and subscription status |

## OpenClaw Plugin

This repo also includes a local-installable OpenClaw plugin package in [`openclaw-plugin/`](./openclaw-plugin).

Local install:

```bash
openclaw plugins install /absolute/path/to/openclaw-plugin
```

After npm publication, OpenClaw can also install it by package name:

```bash
openclaw plugins install @edgefinder/openclaw-plugin
```

## License

MIT
