# @edgefinder/cli

CLI and MCP server for [EdgeFinder](https://edgefinder.io) sports analysis. Get AI-powered NFL, NBA, and MLB betting recommendations, player stats, odds, schedules, and Polymarket portfolio tracking from your terminal or AI agent.

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
edgefinder ask --mlb "Yankees vs Red Sox prediction"  # MLB

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

### Interactive Mode

Run `edgefinder` without a subcommand to start an interactive session. Use `/nfl`, `/nba`, or `/mlb` to switch the active league before asking follow-up questions.

## MCP Server

Use EdgeFinder as a tool in AI agents like Claude Desktop, Openclaw, or any MCP-compatible client.

EdgeFinder supports two MCP connection modes:

- **Local stdio MCP**: run by this CLI package with `npx @edgefinder/cli mcp`. Use this for desktop/local agent clients that can launch a command.
- **Remote HTTP MCP**: hosted by EdgeFinder at `https://chat.edgefinder.io/api/mcp`. Use this for URL-based connector UIs such as Grok or ChatGPT custom apps/connectors.

### Local stdio setup

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

This mode reads credentials from `EDGEFINDER_API_KEY`, `edgefinder login`, or `edgefinder config set api-key`.

### Remote HTTP setup

For clients that ask for an MCP server URL, use:

```text
https://chat.edgefinder.io/api/mcp
```

Tool calls require an EdgeFinder API key. Prefer clients that support request headers:

```text
Authorization: Bearer YOUR_EDGEFINDER_API_KEY
```

If a connector UI only accepts a URL and does not provide a way to set headers, use:

```text
https://chat.edgefinder.io/api/mcp?api_key=YOUR_EDGEFINDER_API_KEY
```

Use the remote HTTP URL for Grok and ChatGPT because their connector flows connect to a hosted MCP server over HTTPS. The `@edgefinder/cli` package is still useful for local MCP clients, but it does not host a public URL by itself.

### Available Tools

| Tool | Description |
|------|-------------|
| `ask` | AI sports analysis for NFL, NBA, or MLB -- betting picks, player stats, matchups |
| `get_schedule` | Game schedules and scores |
| `get_standings` | League standings |
| `get_odds` | Polymarket betting odds |
| `get_portfolio` | Polymarket portfolio data (summary, positions, trades) |
| `analyze_position` | Analyze a portfolio position -- searches by team/title, runs AI analysis with hold/exit advice, entry assessment, or win/loss post-mortem |
| `get_status` | Account and subscription status |

`analyze_position` is currently available in the local stdio MCP server. The hosted remote MCP endpoint currently exposes `ask`, `get_schedule`, `get_standings`, `get_odds`, `get_portfolio`, and `get_status`.

## Codex Plugin

This repo is also a [Codex Marketplace](https://www.codex-marketplace.com) plugin. The manifest lives at [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json) and bundles the EdgeFinder MCP server (`.mcp.json`) plus the [`edgefinder` skill](./skills/edgefinder/SKILL.md). The plugin reads credentials the same way the CLI does — `edgefinder login`, `edgefinder config set api-key`, or `EDGEFINDER_API_KEY` in the plugin environment.

## OpenClaw Plugin

This repo also includes a local-installable OpenClaw plugin package in [`openclaw-plugin/`](./openclaw-plugin).

Local install:

```bash
openclaw plugins install /absolute/path/to/openclaw-plugin
```

OpenClaw can also install it by package name:

```bash
openclaw plugins install @edgefinder/openclaw-plugin
```

## License

MIT
