import { Command } from 'commander'
import { EdgeFinderError } from '../../core/client.js'
import { ensureAuthenticated } from '../../core/auth.js'

export const portfolioCommand = new Command('portfolio')
  .description('Get Polymarket portfolio data')
  .argument('[view]', 'summary, positions, or trades', 'summary')
  .option('--league <league>', 'Filter by league (nfl, nba, all)', 'all')
  .option('--limit <limit>', 'Max results for trades', parseInt)
  .option('--json', 'Output raw JSON')
  .action(async (view: string, opts: { league?: string; limit?: number; json?: boolean }) => {
    if (!['summary', 'positions', 'trades'].includes(view)) {
      console.error('Error: view must be "summary", "positions", or "trades"')
      process.exit(1)
    }

    try {
      const client = await ensureAuthenticated()
      const leagueParam = opts.league === 'all' ? undefined : opts.league
      let data: unknown

      if (view === 'positions') {
        data = await client.getPortfolioPositions(leagueParam)
      } else if (view === 'trades') {
        data = await client.getPortfolioTrades(leagueParam, opts.limit)
      } else {
        data = await client.getPortfolioSummary(leagueParam)
      }

      console.log(JSON.stringify(data, null, 2))
    } catch (error) {
      if (error instanceof EdgeFinderError) {
        console.error(`Error: ${error.message}`)
      } else {
        console.error('Error:', error instanceof Error ? error.message : error)
      }
      process.exit(1)
    }
  })
