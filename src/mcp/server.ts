import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { EdgeFinderClient, EdgeFinderError } from '../core/client.js'
import { getApiKey, getBaseUrl } from '../core/config.js'

function formatError(error: unknown): string {
  if (error instanceof EdgeFinderError) {
    if (error.status === 401) {
      return 'Authentication failed. Check your EDGEFINDER_API_KEY or generate a new key at edgefinder.io/settings/api-keys'
    }
    if (error.status === 403) {
      return 'Monthly query limit reached. Upgrade your plan at edgefinder.io/subscription for more access.'
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export async function startMcpServer(): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) {
    console.error('Error: No API key configured.')
    console.error('Set the EDGEFINDER_API_KEY environment variable in your MCP config.')
    console.error('')
    console.error('Example Claude Code config:')
    console.error(JSON.stringify({
      mcpServers: {
        edgefinder: {
          command: 'npx',
          args: ['-y', '@edgefinder/cli', 'mcp'],
          env: { EDGEFINDER_API_KEY: 'ef_live_...' }
        }
      }
    }, null, 2))
    process.exit(1)
  }

  const client = new EdgeFinderClient(apiKey, getBaseUrl())

  const server = new McpServer({
    name: 'edgefinder',
    version: '0.1.0',
  })

  // ── ask: The core analysis tool ───────────────────────────────────

  server.tool(
    'ask',
    'Ask EdgeFinder for NFL or NBA sports analysis — betting recommendations, player stats, matchup breakdowns, odds analysis, injury reports, and more. This is a powerful AI-powered sports analyst.',
    {
      question: z.string().describe('Your sports analysis question (e.g., "Who should I bet on in tonight\'s NBA games?" or "Give me a breakdown of Chiefs vs Bills")'),
      league: z.enum(['nfl', 'nba']).default('nfl').describe('Which league to analyze'),
    },
    async ({ question, league }) => {
      try {
        const response = await client.ask({ message: question, league })
        return { content: [{ type: 'text' as const, text: response.response }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${formatError(error)}` }], isError: true }
      }
    }
  )

  // ── get_schedule ──────────────────────────────────────────────────

  server.tool(
    'get_schedule',
    'Get the current game schedule and scores for NFL or NBA.',
    {
      league: z.enum(['nfl', 'nba']).describe('Which league schedule to retrieve'),
      date: z.string().optional().describe('For NBA: specific date (YYYY-MM-DD). Omit for today\'s games.'),
    },
    async ({ league, date }) => {
      try {
        let data: unknown
        if (league === 'nba') {
          data = await client.getNBASchedule(date)
        } else {
          data = await client.getNFLSchedule()
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${formatError(error)}` }], isError: true }
      }
    }
  )

  // ── get_standings ─────────────────────────────────────────────────

  server.tool(
    'get_standings',
    'Get current league standings for NFL or NBA.',
    {
      league: z.enum(['nfl', 'nba']).describe('Which league standings to retrieve'),
    },
    async ({ league }) => {
      try {
        const data = league === 'nba'
          ? await client.getNBAStandings()
          : await client.getNFLStandings()
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${formatError(error)}` }], isError: true }
      }
    }
  )

  // ── get_odds ──────────────────────────────────────────────────────

  server.tool(
    'get_odds',
    'Get Polymarket betting odds for NFL or NBA games.',
    {
      league: z.enum(['nfl', 'nba']).describe('Which league odds to retrieve'),
      week: z.number().optional().describe('For NFL: specific week number'),
      date: z.string().optional().describe('For NBA: specific date (YYYY-MM-DD)'),
    },
    async ({ league, week, date }) => {
      try {
        let data: unknown
        if (league === 'nba') {
          data = await client.getNBAOdds(date)
        } else {
          data = await client.getNFLOdds(week)
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${formatError(error)}` }], isError: true }
      }
    }
  )

  // ── get_portfolio ─────────────────────────────────────────────────

  server.tool(
    'get_portfolio',
    'Get Polymarket portfolio data — summary, open positions, or trade history. Requires a connected Polymarket wallet.',
    {
      view: z.enum(['summary', 'positions', 'trades']).default('summary').describe('Which portfolio view to retrieve'),
      league: z.enum(['nfl', 'nba', 'all']).default('all').describe('Filter by league'),
    },
    async ({ view, league }) => {
      try {
        let data: unknown
        const leagueParam = league === 'all' ? undefined : league
        if (view === 'positions') {
          data = await client.getPortfolioPositions(leagueParam)
        } else if (view === 'trades') {
          data = await client.getPortfolioTrades(leagueParam, 50)
        } else {
          data = await client.getPortfolioSummary(leagueParam)
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${formatError(error)}` }], isError: true }
      }
    }
  )

  // ── analyze_position ─────────────────────────────────────────────

  server.tool(
    'analyze_position',
    'Analyze a specific Polymarket portfolio position using EdgeFinder AI. Searches your open positions, trade history, or closed positions by title/team name and runs a detailed analysis with stats, odds history, and recommendations.',
    {
      search: z.string().describe('Search term to match a position by title or team name (e.g., "Mavericks", "Lakers vs Celtics", "Chiefs")'),
      view: z.enum(['open', 'trade', 'closed']).default('open').describe('Which portfolio tab to search: open positions, trade history, or closed positions'),
      league: z.enum(['nfl', 'nba', 'all']).default('all').describe('Filter by league'),
    },
    async ({ search, view, league }) => {
      try {
        const leagueParam = league === 'all' ? undefined : league
        const searchLower = search.toLowerCase()

        // Helper to parse slug for league and date, falling back to eventSlug for O/U and spread markets
        function parseSlug(slug: string, eventSlug?: string | null): { league: 'nba' | 'nfl'; date: string } | null {
          for (const s of [slug, eventSlug]) {
            if (!s) continue
            const match = s.match(/^(nba|nfl)-.*-(\d{4}-\d{2}-\d{2})$/)
            if (match) return { league: match[1] as 'nba' | 'nfl', date: match[2] }
          }
          return null
        }

        // Helper to parse teams from title like "Mavericks vs. Lakers" or "Trail Blazers vs. Jazz: O/U 236.5"
        function parseTeams(title: string): { away: string; home: string } | null {
          const match = title.match(/^(.+?)\s+vs\.\s+([^:]+)/)
          if (!match) return null
          return { away: match[1].trim(), home: match[2].trim() }
        }

        let prompt: string
        let analysisLeague: 'nba' | 'nfl'

        if (view === 'open') {
          const data = await client.getPortfolioPositions(leagueParam)
          const match = data.positions.find(p => p.title.toLowerCase().includes(searchLower))
          if (!match) {
            const available = data.positions.map(p => p.title).slice(0, 10).join('\n  - ')
            return { content: [{ type: 'text' as const, text: `No open position matching "${search}" found.\n\nAvailable positions:\n  - ${available || '(none)'}` }] }
          }

          const parsed = parseSlug(match.slug, match.eventSlug as string | undefined)
          const teams = parseTeams(match.title)
          if (!parsed || !teams) {
            return { content: [{ type: 'text' as const, text: `Found "${match.title}" but could not parse game details from slug "${match.slug}". This market may not be a standard game matchup.` }] }
          }

          analysisLeague = parsed.league
          const { date } = parsed
          const { away, home } = teams
          const pnlSign = match.cashPnl >= 0 ? '+' : ''

          const curPrice = (match as Record<string, unknown>).curPrice as number | undefined
          if (analysisLeague === 'nba') {
            prompt = `I have an open Polymarket position: ${match.size.toFixed(1)} shares of "${match.outcome}" on ${match.title}, bought at avg $${match.avgPrice.toFixed(2)} (current price: $${curPrice !== undefined ? curPrice.toFixed(2) : 'N/A'}, PnL: ${pnlSign}$${match.cashPnl.toFixed(2)}).

Analyze my position and reason through whether this bet makes sense:
1. Use get_nba_polymarket_odds_history with homeTeam="${home}", awayTeam="${away}", gameDate="${date}" to show how odds have moved since I entered
2. Use get_team_record for BOTH "${away}" and "${home}" — compare current form, records, and points per game vs points allowed
3. Use get_team_injury_report for BOTH teams to check for key absences
4. Use get_high_usage_player_pra_analysis to highlight top performers from each team
5. Thesis check: Based on the data above, does my bet on "${match.outcome}" still make sense? What evidence supports it? What evidence works against it? Be specific — cite stats, matchups, or situational factors I might be overlooking.
6. What could go wrong that I might not be seeing? Are there hidden risks (injuries trending worse, schedule fatigue, bad matchup profiles) that weaken my position?
7. Hold/exit recommendation: Given everything, should I hold or look to exit? Be direct.`
          } else {
            prompt = `I have an open Polymarket position: ${match.size.toFixed(1)} shares of "${match.outcome}" on ${match.title}, bought at avg $${match.avgPrice.toFixed(2)} (PnL: ${pnlSign}$${match.cashPnl.toFixed(2)}).

Analyze my position and reason through whether this bet makes sense:
1. Use get_polymarket_odds_history with homeTeam="${home}", awayTeam="${away}", gameDate="${date}" to show how odds have moved since I entered
2. Use get_team_record for BOTH "${away}" and "${home}" — compare current form and records
3. Use get_team_injury_report for BOTH teams to check for key absences
4. Key matchup factors and situational edges
5. Thesis check: Based on the data above, does my bet on "${match.outcome}" still make sense? What evidence supports it? What evidence works against it? Be specific — cite stats, matchups, or situational factors I might be overlooking.
6. What could go wrong that I might not be seeing? Are there hidden risks (injuries trending worse, schedule fatigue, bad matchup profiles) that weaken my position?
7. Hold/exit recommendation: Given everything, should I hold or look to exit? Be direct.`
          }

        } else if (view === 'trade') {
          const data = await client.getPortfolioTrades(leagueParam, 50)
          const match = data.trades.find(t => t.title.toLowerCase().includes(searchLower))
          if (!match) {
            const available = data.trades.map(t => `${t.title} (${t.side})`).slice(0, 10).join('\n  - ')
            return { content: [{ type: 'text' as const, text: `No trade matching "${search}" found.\n\nRecent trades:\n  - ${available || '(none)'}` }] }
          }

          const parsed = parseSlug(match.slug, match.eventSlug as string | undefined)
          const teams = parseTeams(match.title)
          if (!parsed || !teams) {
            return { content: [{ type: 'text' as const, text: `Found trade "${match.title}" but could not parse game details from slug "${match.slug}".` }] }
          }

          analysisLeague = parsed.league
          const { date } = parsed
          const { away, home } = teams

          const tradeDate = new Date(match.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          if (analysisLeague === 'nba') {
            prompt = `I ${match.side === 'BUY' ? 'bought' : 'sold'} ${match.size.toFixed(1)} shares of "${match.outcome}" on ${match.title} at $${match.price.toFixed(2)} on ${tradeDate}.

Analyze this trade and reason through whether it was a smart decision:
1. Use get_nba_polymarket_odds_history with homeTeam="${home}", awayTeam="${away}", gameDate="${date}" to show where odds were at the time of my trade vs how they've moved since
2. Entry assessment: Was $${match.price.toFixed(2)} a good entry? What information was publicly available at the time I traded — were there injury reports, recent results, or line movements I should have factored in?
3. Use get_team_record for BOTH "${away}" and "${home}" — current form, records, and key stats
4. Use get_team_injury_report for BOTH teams to check for key absences
5. What am I betting on and does it hold up? Explain the case FOR and AGAINST "${match.outcome}" using concrete data. What's the strongest argument that I'm right? What's the biggest risk I might be ignoring?
6. If the game has already happened, tell me what I got right or wrong and what I should have seen. If it hasn't, tell me what to watch for.`
          } else {
            prompt = `I ${match.side === 'BUY' ? 'bought' : 'sold'} ${match.size.toFixed(1)} shares of "${match.outcome}" on ${match.title} at $${match.price.toFixed(2)} on ${tradeDate}.

Analyze this trade and reason through whether it was a smart decision:
1. Use get_polymarket_odds_history with homeTeam="${home}", awayTeam="${away}", gameDate="${date}" to show where odds were at the time of my trade vs how they've moved since
2. Entry assessment: Was $${match.price.toFixed(2)} a good entry? What information was publicly available at the time I traded — were there injury reports, recent results, or line movements I should have factored in?
3. Use get_team_record for BOTH "${away}" and "${home}" — current form and records
4. Use get_team_injury_report for BOTH teams to check for key absences
5. What am I betting on and does it hold up? Explain the case FOR and AGAINST "${match.outcome}" using concrete data. What's the strongest argument that I'm right? What's the biggest risk I might be ignoring?
6. If the game has already happened, tell me what I got right or wrong and what I should have seen. If it hasn't, tell me what to watch for.`
          }

        } else {
          // closed
          const data = await client.getPortfolioClosed(leagueParam, 50)
          const match = data.positions.find(p => p.title.toLowerCase().includes(searchLower))
          if (!match) {
            const available = data.positions.map(p => p.title).slice(0, 10).join('\n  - ')
            return { content: [{ type: 'text' as const, text: `No closed position matching "${search}" found.\n\nClosed positions:\n  - ${available || '(none)'}` }] }
          }

          const parsed = parseSlug(match.slug, match.eventSlug as string | undefined)
          const teams = parseTeams(match.title)
          if (!parsed || !teams) {
            return { content: [{ type: 'text' as const, text: `Found "${match.title}" but could not parse game details from slug "${match.slug}".` }] }
          }

          analysisLeague = parsed.league
          const { date } = parsed
          const { away, home } = teams
          const pnlSign = match.realizedPnl >= 0 ? '+' : ''

          const won = match.realizedPnl >= 0
          if (analysisLeague === 'nba') {
            prompt = `Post-mortem on my closed Polymarket position: "${match.outcome}" on ${match.title}, avg entry price $${match.avgPrice.toFixed(2)}, resolved at $${match.curPrice.toFixed(2)}. Realized PnL: ${pnlSign}$${match.realizedPnl.toFixed(2)}. I ${won ? 'WON' : 'LOST'} this bet.

Analyze this position and reason through ${won ? 'why this bet worked' : 'what I missed'}:
1. Use get_game_box_score with dateType="custom", customDate="${date}", teamName="${home}" to get actual player stats — do NOT hallucinate stats
2. Use get_nba_polymarket_odds_history with homeTeam="${home}", awayTeam="${away}", gameDate="${date}" to show the full odds arc during the game
3. Entry timing: Was my entry price of $${match.avgPrice.toFixed(2)} good relative to where odds moved? When was the optimal entry?
4. Key factors that determined the outcome — impact players, shooting efficiency, turnovers from the box score
5. ${won
              ? `Why this bet made sense: What did I read correctly? What matchup advantage, trend, or situational factor justified betting on "${match.outcome}"? Was there genuine edge, or did I get lucky despite weak reasoning?`
              : `What I missed: What signals were available before this game that should have warned me? Were there injury concerns, bad matchup profiles, recent form issues, or market movements I overlooked? What data would have changed my mind if I had looked at it?`}
6. Actionable takeaway: What's the one concrete lesson from this bet I should apply to future similar situations?`
          } else {
            prompt = `Post-mortem on my closed Polymarket position: "${match.outcome}" on ${match.title}, avg entry price $${match.avgPrice.toFixed(2)}, resolved at $${match.curPrice.toFixed(2)}. Realized PnL: ${pnlSign}$${match.realizedPnl.toFixed(2)}. I ${won ? 'WON' : 'LOST'} this bet.

Analyze this position and reason through ${won ? 'why this bet worked' : 'what I missed'}:
1. Use find_game_by_teams with teamNames="${away} ${home}" to get the eventId, then use get_postgame_analysis with that eventId to get actual game stats — do NOT hallucinate stats
2. Use get_polymarket_odds_history with homeTeam="${home}", awayTeam="${away}", gameDate="${date}" to show the full odds arc
3. Entry timing: Was my entry price of $${match.avgPrice.toFixed(2)} good relative to where odds moved? When was the optimal entry?
4. Key factors that determined the outcome
5. ${won
              ? `Why this bet made sense: What did I read correctly? What matchup advantage, trend, or situational factor justified betting on "${match.outcome}"? Was there genuine edge, or did I get lucky despite weak reasoning?`
              : `What I missed: What signals were available before this game that should have warned me? Were there injury concerns, bad matchup profiles, recent form issues, or market movements I overlooked? What data would have changed my mind if I had looked at it?`}
6. Actionable takeaway: What's the one concrete lesson from this bet I should apply to future similar situations?`
          }
        }

        const response = await client.ask({ message: prompt, league: analysisLeague })
        return { content: [{ type: 'text' as const, text: response.response }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${formatError(error)}` }], isError: true }
      }
    }
  )

  // ── get_status ────────────────────────────────────────────────────

  server.tool(
    'get_status',
    'Check your EdgeFinder account status — subscription plan, query usage, and access level.',
    {},
    async () => {
      try {
        const data = await client.getSubscriptionStatus()
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Error: ${formatError(error)}` }], isError: true }
      }
    }
  )

  // ── Start server ──────────────────────────────────────────────────

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
