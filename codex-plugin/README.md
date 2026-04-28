# EdgeFinder Codex Plugin

This plugin packages the existing `@edgefinder/cli` MCP server for Codex.

It is additive to the CLI repo and does not modify the OpenClaw plugin.

## Authentication

The MCP server reads credentials the same way the CLI does:

```bash
edgefinder login
```

or:

```bash
edgefinder config set api-key ef_live_...
```

You can also provide `EDGEFINDER_API_KEY` in the Codex/plugin environment. Do not commit a real API key into `.mcp.json`.

## MCP Server

Codex launches the existing CLI package:

```json
{
  "mcpServers": {
    "edgefinder": {
      "command": "npx",
      "args": ["-y", "@edgefinder/cli", "mcp"]
    }
  }
}
```

## Included Files

- `.codex-plugin/plugin.json`: Codex plugin metadata.
- `.mcp.json`: MCP server launcher config.
- `skills/edgefinder/SKILL.md`: Codex usage guidance.
