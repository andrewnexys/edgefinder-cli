import { Command } from 'commander'
import { askCommand } from './commands/ask.js'
import { scheduleCommand } from './commands/schedule.js'
import { oddsCommand } from './commands/odds.js'
import { standingsCommand } from './commands/standings.js'
import { portfolioCommand } from './commands/portfolio.js'
import { configCommand } from './commands/config.js'
import { statusCommand } from './commands/status.js'
import { loginCommand } from './commands/login.js'
import { logoutCommand } from './commands/logout.js'

export function createCli(): Command {
  const program = new Command()

  program
    .name('edgefinder')
    .description('EdgeFinder CLI — AI-powered sports analysis from your terminal')
    .version('0.1.0')

  program.addCommand(loginCommand)
  program.addCommand(logoutCommand)
  program.addCommand(askCommand)
  program.addCommand(scheduleCommand)
  program.addCommand(oddsCommand)
  program.addCommand(standingsCommand)
  program.addCommand(portfolioCommand)
  program.addCommand(configCommand)
  program.addCommand(statusCommand)

  // MCP subcommand is handled in bin.ts before commander parses

  return program
}
