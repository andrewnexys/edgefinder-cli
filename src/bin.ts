#!/usr/bin/env node

import { startMcpServer } from './mcp/server.js'
import { createCli } from './cli/index.js'
import { startInteractiveSession } from './repl/session.js'

const args = process.argv.slice(2)

// If the first argument is "mcp", start the MCP server directly
// (bypasses commander so stdin/stdout stay clean for stdio transport)
if (args[0] === 'mcp') {
  startMcpServer().catch((error) => {
    console.error('MCP server error:', error)
    process.exit(1)
  })
} else if (args.length === 0) {
  // No subcommand: launch interactive REPL
  startInteractiveSession().catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
} else {
  const program = createCli()
  program.parse(process.argv)
}
