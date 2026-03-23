import { Command } from 'commander'
import { EdgeFinderError } from '../../core/client.js'
import { ensureAuthenticated } from '../../core/auth.js'

export const scheduleCommand = new Command('schedule')
  .description('Get game schedule and scores')
  .argument('<league>', 'nfl or nba')
  .option('--date <date>', 'Date for NBA schedule (YYYY-MM-DD)')
  .option('--json', 'Output raw JSON')
  .action(async (league: string, opts: { date?: string; json?: boolean }) => {
    if (!['nfl', 'nba'].includes(league)) {
      console.error('Error: league must be "nfl" or "nba"')
      process.exit(1)
    }

    try {
      const client = await ensureAuthenticated()
      let data: unknown

      if (league === 'nba') {
        data = await client.getNBASchedule(opts.date)
      } else {
        data = await client.getNFLSchedule()
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
