---
name: edgefinder-cli
description: Use the EdgeFinder CLI for NFL and NBA analysis, schedules, standings, Polymarket odds, and portfolio lookups from the terminal.
homepage: https://github.com/andrewnexys/edgefinder-cli
user-invocable: false
metadata: {"openclaw":{"homepage":"https://github.com/andrewnexys/edgefinder-cli","requires":{"anyBins":["edgefinder","npx"]},"primaryEnv":"EDGEFINDER_API_KEY","install":[{"id":"node","kind":"node","package":"@edgefinder/cli","bins":["edgefinder"],"label":"Install EdgeFinder CLI"}]}}
---

# EdgeFinder CLI

Use this skill when the user wants NFL or NBA betting analysis, schedules, standings, Polymarket odds, or EdgeFinder portfolio data.

## Setup

- Prefer the `edgefinder` binary if it is already installed.
- Otherwise use `npx -y @edgefinder/cli ...`.
- Authenticate in one of these ways:
  - Run `edgefinder login` for the interactive magic-link flow.
  - Set `EDGEFINDER_API_KEY=ef_live_...`.
  - Or set `skills."edgefinder-cli".apiKey` / `skills."edgefinder-cli".env.EDGEFINDER_API_KEY` in `~/.openclaw/openclaw.json`.

## Usage

For conversational analysis, use `ask`:

```bash
edgefinder ask "Who should I bet on tonight?"
edgefinder ask --nba "Lakers vs Celtics prediction"
```

For structured data, prefer JSON output:

```bash
edgefinder schedule nfl --json
edgefinder schedule nba --date 2026-03-23 --json
edgefinder standings nba --json
edgefinder odds nfl --week 12 --json
edgefinder odds nba --date 2026-03-23 --json
edgefinder portfolio summary --json
edgefinder portfolio positions --league nba --json
edgefinder portfolio trades --league nfl --limit 20 --json
edgefinder status --json
```

## Notes

- NFL is the default league unless `--nba` is passed.
- The bare `edgefinder` command starts the interactive REPL. In automated agent runs, prefer explicit subcommands.
- CLI access requires an active paid EdgeFinder subscription. If auth is missing, `edgefinder login` will prompt for email and may open the subscription page.
- Never print or echo the full API key back to the user.
