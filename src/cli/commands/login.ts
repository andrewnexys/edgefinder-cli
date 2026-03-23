import { Command } from 'commander'
import { runLoginFlow } from '../../core/auth.js'

export const loginCommand = new Command('login')
  .description('Log in to EdgeFinder')
  .action(async () => {
    try {
      await runLoginFlow()
      process.stderr.write('  Try: edgefinder ask "Who should I bet on tonight?"\n')
    } catch (error) {
      if (error instanceof Error && error.message.includes('SIGINT')) {
        process.stderr.write('\n  Login cancelled.\n')
        return
      }
      process.stderr.write(`Error: ${error instanceof Error ? error.message : error}\n`)
      process.exit(1)
    }
  })
