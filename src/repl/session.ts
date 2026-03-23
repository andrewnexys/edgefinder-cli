import { ensureAuthenticated } from '../core/auth.js'
import { parseAndExecute } from './commands.js'
import type { SessionState } from './commands.js'
import type { League } from '../core/types.js'
import { promptLine } from './input.js'

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
} as const

const VERSION = '0.1.11'

export async function startInteractiveSession(): Promise<void> {
  process.stdout.write(`\n  ${ANSI.bold}EdgeFinder v${VERSION}${ANSI.reset}\n`)
  process.stdout.write(`  ${ANSI.dim}Type a question or / for commands.${ANSI.reset}\n\n`)

  const client = await ensureAuthenticated()

  const state: SessionState = {
    client,
    league: 'nfl' as League,
    conversationHistory: [],
  }

  while (true) {
    const line = await promptLine()
    if (line === null) break

    const input = line.trim()
    if (!input) continue

    const isAiQuery = !input.startsWith('/') || input.startsWith('/ask')
    if (isAiQuery) {
      process.stdout.write(`  ${ANSI.dim}Analyzing (${state.league.toUpperCase()})...${ANSI.reset}\n`)
    }

    try {
      const result = await parseAndExecute(input, state)
      if (result.quit) break
      if (result.output !== null) {
        process.stdout.write(`\n${result.output}\n\n`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      process.stdout.write(`  ${ANSI.red}Error: ${msg}${ANSI.reset}\n\n`)
    }
  }

  process.stdout.write(`\n  ${ANSI.dim}Goodbye.${ANSI.reset}\n\n`)
  process.exit(0)
}
