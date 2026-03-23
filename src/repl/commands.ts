import { EdgeFinderClient, EdgeFinderError } from '../core/client.js'
import { clearApiKey } from '../core/config.js'
import type { League } from '../core/types.js'

export interface SessionState {
  client: EdgeFinderClient
  league: League
  conversationHistory: Array<{ role: string; content: string }>
}

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
} as const

function resolveLeague(state: SessionState, args: string): League {
  const arg = args.trim().toLowerCase()
  if (arg === 'nba') return 'nba'
  if (arg === 'nfl') return 'nfl'
  return state.league
}

function formatError(error: unknown): string {
  if (error instanceof EdgeFinderError) {
    if (error.status === 401) {
      return `${ANSI.red}Session expired. Run: edgefinder login${ANSI.reset}`
    }
    return `${ANSI.red}Error: ${error.message}${ANSI.reset}`
  }
  return `${ANSI.red}Error: ${error instanceof Error ? error.message : String(error)}${ANSI.reset}`
}

// ── Handlers ────────────────────────────────────────────────────────

async function handleAsk(state: SessionState, question: string): Promise<string> {
  if (!question) {
    return `${ANSI.dim}Usage: /ask <question>  (or just type your question)${ANSI.reset}`
  }

  try {
    const response = await state.client.ask({
      message: question,
      league: state.league,
      conversationHistory: state.conversationHistory,
    })

    state.conversationHistory = response.conversationHistory

    let output = response.response
    if (response.usage) {
      output += `\n\n${ANSI.dim}Tokens: ${response.usage.tokensUsed} | Remaining: ${response.usage.rateLimitRemaining.hour}/hr${ANSI.reset}`
    }
    return output
  } catch (error) {
    return formatError(error)
  }
}

async function handleOdds(state: SessionState, args: string): Promise<string> {
  try {
    const league = resolveLeague(state, args)
    const data = league === 'nba'
      ? await state.client.getNBAOdds()
      : await state.client.getNFLOdds()
    return JSON.stringify(data, null, 2)
  } catch (error) {
    return formatError(error)
  }
}

async function handleSchedule(state: SessionState, args: string): Promise<string> {
  try {
    const league = resolveLeague(state, args)
    const data = league === 'nba'
      ? await state.client.getNBASchedule()
      : await state.client.getNFLSchedule()
    return JSON.stringify(data, null, 2)
  } catch (error) {
    return formatError(error)
  }
}

async function handleStandings(state: SessionState, args: string): Promise<string> {
  try {
    const league = resolveLeague(state, args)
    const data = league === 'nba'
      ? await state.client.getNBAStandings()
      : await state.client.getNFLStandings()
    return JSON.stringify(data, null, 2)
  } catch (error) {
    return formatError(error)
  }
}

async function handlePortfolio(state: SessionState, args: string): Promise<string> {
  try {
    const parts = args.trim().toLowerCase().split(/\s+/)
    const view = parts[0] || 'summary'

    const leagueArg = parts[1]
    const league = leagueArg === 'nba' || leagueArg === 'nfl' ? leagueArg : undefined

    let data: unknown
    if (view === 'positions') {
      data = await state.client.getPortfolioPositions(league)
    } else if (view === 'trades') {
      data = await state.client.getPortfolioTrades(league)
    } else {
      data = await state.client.getPortfolioSummary(league)
    }

    return JSON.stringify(data, null, 2)
  } catch (error) {
    return formatError(error)
  }
}

async function handleStatus(state: SessionState): Promise<string> {
  try {
    const data = await state.client.getSubscriptionStatus()
    const lines: string[] = [
      `Plan:           ${data.subscriptionPlan}`,
      `Status:         ${data.subscriptionStatus}`,
      `Access:         ${data.hasAccess ? 'Yes' : 'No'} (${data.reason})`,
      `Unlimited:      ${data.hasUnlimitedAccess ? 'Yes' : 'No'}`,
    ]
    if (data.isTrialing && data.trialDaysLeft !== null) {
      lines.push(`Trial:          ${data.trialDaysLeft} days remaining`)
    }
    if (data.trialEndsAt) {
      lines.push(`Trial ends:     ${new Date(data.trialEndsAt).toLocaleDateString()}`)
    }
    return lines.join('\n')
  } catch (error) {
    return formatError(error)
  }
}

function handleLeagueSwitch(state: SessionState, league: League): string {
  state.league = league
  return `Switched to ${ANSI.bold}${league.toUpperCase()}${ANSI.reset}`
}

function handleClear(state: SessionState): string {
  state.conversationHistory = []
  return `${ANSI.dim}Conversation history cleared.${ANSI.reset}`
}

function handleHelp(state: SessionState): string {
  const lines = [
    `${ANSI.bold}Commands${ANSI.reset}`,
    '',
    `  ${ANSI.cyan}/ask <question>${ANSI.reset}     Ask EdgeFinder for analysis`,
    `  ${ANSI.cyan}/odds [league]${ANSI.reset}      Get Polymarket betting odds`,
    `  ${ANSI.cyan}/schedule [league]${ANSI.reset}  Get game schedule`,
    `  ${ANSI.cyan}/standings [league]${ANSI.reset} Get league standings`,
    `  ${ANSI.cyan}/portfolio [view]${ANSI.reset}   Get portfolio (summary|positions|trades)`,
    `  ${ANSI.cyan}/status${ANSI.reset}             Check subscription status`,
    `  ${ANSI.cyan}/nfl${ANSI.reset}                Switch to NFL`,
    `  ${ANSI.cyan}/nba${ANSI.reset}                Switch to NBA`,
    `  ${ANSI.cyan}/clear${ANSI.reset}              Clear conversation history`,
    `  ${ANSI.cyan}/help${ANSI.reset}               Show this help`,
    `  ${ANSI.cyan}/logout${ANSI.reset}             Log out and exit`,
    `  ${ANSI.cyan}/quit${ANSI.reset}               Exit`,
    '',
    `${ANSI.dim}Current league: ${state.league.toUpperCase()}${ANSI.reset}`,
    `${ANSI.dim}Tip: Type any question without / to chat with the AI.${ANSI.reset}`,
  ]
  return lines.join('\n')
}

// ── Command map ─────────────────────────────────────────────────────

interface CommandEntry {
  handler: (state: SessionState, args: string) => Promise<string> | string
}

const commands = new Map<string, CommandEntry>()

commands.set('ask', { handler: (s, a) => handleAsk(s, a) })
commands.set('odds', { handler: (s, a) => handleOdds(s, a) })
commands.set('schedule', { handler: (s, a) => handleSchedule(s, a) })
commands.set('standings', { handler: (s, a) => handleStandings(s, a) })
commands.set('portfolio', { handler: (s, a) => handlePortfolio(s, a) })
commands.set('status', { handler: (s) => handleStatus(s) })
commands.set('nfl', { handler: (s) => handleLeagueSwitch(s, 'nfl') })
commands.set('nba', { handler: (s) => handleLeagueSwitch(s, 'nba') })
commands.set('clear', { handler: (s) => handleClear(s) })
commands.set('help', { handler: (s) => handleHelp(s) })

// ── Router ──────────────────────────────────────────────────────────

export async function parseAndExecute(
  input: string,
  state: SessionState,
): Promise<{ output: string | null; quit: boolean }> {
  // Bare text = AI question
  if (!input.startsWith('/')) {
    const output = await handleAsk(state, input)
    return { output, quit: false }
  }

  // Parse: "/odds nba" -> name="odds", args="nba"
  const spaceIndex = input.indexOf(' ')
  const name = spaceIndex === -1
    ? input.slice(1).toLowerCase()
    : input.slice(1, spaceIndex).toLowerCase()
  const args = spaceIndex === -1
    ? ''
    : input.slice(spaceIndex + 1).trim()

  // Quit aliases
  if (name === 'quit' || name === 'exit' || name === 'q') {
    return { output: null, quit: true }
  }

  // Logout
  if (name === 'logout') {
    clearApiKey()
    return { output: `${ANSI.dim}Logged out. API key removed.${ANSI.reset}`, quit: true }
  }

  const command = commands.get(name)
  if (!command) {
    return {
      output: `${ANSI.red}Unknown command: /${name}${ANSI.reset}. Type /help for available commands.`,
      quit: false,
    }
  }

  const output = await command.handler(state, args)
  return { output, quit: false }
}
