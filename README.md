# EdgeFinder CLI

A native Rust CLI and MCP server for [EdgeFinder](https://edgefinder.io) sports analysis. Get AI-powered NFL, NBA, and MLB analysis, schedules, standings, Polymarket odds, and portfolio data from a terminal or AI agent.

## Install

Install Rust 1.88 or newer, then build directly from GitHub:

```bash
cargo install --git https://github.com/andrewnexys/edgefinder-cli edgefinder-cli
```

For local development:

```bash
git clone https://github.com/andrewnexys/edgefinder-cli.git
cd edgefinder-cli
cargo install --path .
```

CLI access requires an EdgeFinder Starter, Pro, or Ultimate subscription.

## Sign in

```bash
edgefinder login
edgefinder ask "Who should I bet on tonight?"
```

The login command sends a magic link and saves the resulting API key to `~/.edgefinder/config.json`. On Unix-like systems, the file is created with `0600` permissions.

You can also configure an existing key:

```bash
export EDGEFINDER_API_KEY=ef_live_...
# or
edgefinder config set api-key ef_live_...
```

Use `edgefinder logout` to remove a saved key.

## Commands

```bash
# AI analysis (NFL is the default)
edgefinder ask "Who should I bet on tonight?"
edgefinder ask --nba "Lakers vs Celtics prediction"
edgefinder ask --mlb "Yankees vs Red Sox prediction"

# Schedules, odds, and standings
edgefinder schedule nfl
edgefinder schedule nba --date 2026-02-20
edgefinder odds nfl --week 12
edgefinder odds nba
edgefinder standings nba

# Polymarket portfolio
edgefinder portfolio summary
edgefinder portfolio positions --league nba
edgefinder portfolio trades --limit 20

# Account and configuration
edgefinder status
edgefinder config show
```

Structured commands support `--json`. Run `edgefinder --help` or `edgefinder <command> --help` for the complete interface.

Running `edgefinder` with no subcommand starts an interactive session. Use `/nfl`, `/nba`, or `/mlb` to switch leagues while preserving conversation history.

## MCP server

The same native binary includes a newline-delimited JSON-RPC stdio MCP server:

```json
{
  "mcpServers": {
    "edgefinder": {
      "command": "edgefinder",
      "args": ["mcp"],
      "env": {
        "EDGEFINDER_API_KEY": "ef_live_..."
      }
    }
  }
}
```

Available tools:

| Tool | Description |
| --- | --- |
| `ask` | NFL, NBA, or MLB sports analysis |
| `get_schedule` | NFL or NBA schedules and scores |
| `get_standings` | NFL or NBA standings |
| `get_odds` | NFL or NBA Polymarket odds |
| `get_portfolio` | Portfolio summary, positions, or trades |
| `analyze_position` | AI analysis of an open, traded, or closed position |
| `get_status` | Account and subscription status |

For URL-based connector UIs, use the hosted endpoint at `https://chat.edgefinder.io/api/mcp`. Prefer an `Authorization: Bearer ...` header. Query-string API keys are supported only when a connector cannot set headers, because URLs may be logged.

## Development

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
cargo build --release
```

The Rust implementation uses rustls for TLS and does not require OpenSSL at runtime.

## Plugins

The Codex plugin manifest in `.codex-plugin/plugin.json` uses the installed `edgefinder` binary for MCP. The OpenClaw package in `openclaw-plugin/` bundles the corresponding skill and expects the native binary on `PATH`.

## License

MIT
