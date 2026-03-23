import { Command } from 'commander'
import { EdgeFinderError } from '../../core/client.js'
import { ensureAuthenticated } from '../../core/auth.js'

export const oddsCommand = new Command('odds')
  .description('Get Polymarket betting odds')
  .argument('<league>', 'nfl or nba')
  .option('--week <week>', 'NFL week number', parseInt)
  .option('--date <date>', 'NBA date (YYYY-MM-DD)')
  .option('--json', 'Output raw JSON')
  .action(async (league: string, opts: { week?: number; date?: string; json?: boolean }) => {
    if (!['nfl', 'nba'].includes(league)) {
      console.error('Error: league must be "nfl" or "nba"')
      process.exit(1)
    }

    try {
      const client = await ensureAuthenticated()
      let data: unknown

      if (league === 'nba') {
        data = await client.getNBAOdds(opts.date)
      } else {
        data = await client.getNFLOdds(opts.week)
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
