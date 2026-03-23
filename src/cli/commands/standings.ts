import { Command } from 'commander'
import { EdgeFinderError } from '../../core/client.js'
import { ensureAuthenticated } from '../../core/auth.js'

export const standingsCommand = new Command('standings')
  .description('Get league standings')
  .argument('<league>', 'nfl or nba')
  .option('--json', 'Output raw JSON')
  .action(async (league: string, opts: { json?: boolean }) => {
    if (!['nfl', 'nba'].includes(league)) {
      console.error('Error: league must be "nfl" or "nba"')
      process.exit(1)
    }

    try {
      const client = await ensureAuthenticated()
      const data = league === 'nba'
        ? await client.getNBAStandings()
        : await client.getNFLStandings()

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
