import { Command } from 'commander'
import { EdgeFinderError } from '../../core/client.js'
import { ensureAuthenticated } from '../../core/auth.js'
import type { League } from '../../core/types.js'

export const askCommand = new Command('ask')
  .description('Ask EdgeFinder for sports analysis')
  .argument('<question>', 'Your sports analysis question')
  .option('--nba', 'Query NBA (default is NFL)')
  .option('--nfl', 'Query NFL (default)')
  .option('--json', 'Output raw JSON')
  .action(async (question: string, opts: { nba?: boolean; nfl?: boolean; json?: boolean }) => {
    try {
      const league: League = opts.nba ? 'nba' : 'nfl'

      const client = await ensureAuthenticated()

      if (!opts.json) {
        process.stderr.write(`Analyzing (${league.toUpperCase()})...\n`)
      }

      const response = await client.ask({ message: question, league })

      if (opts.json) {
        console.log(JSON.stringify(response, null, 2))
      } else {
        console.log(response.response)
      }
    } catch (error) {
      if (error instanceof EdgeFinderError) {
        console.error(`Error: ${error.message}`)
      } else {
        console.error('Error:', error instanceof Error ? error.message : error)
      }
      process.exit(1)
    }
  })
