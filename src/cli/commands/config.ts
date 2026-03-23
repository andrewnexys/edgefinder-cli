import { Command } from 'commander'
import { setApiKey, setBaseUrl, getConfigSummary } from '../../core/config.js'

export const configCommand = new Command('config')
  .description('Manage EdgeFinder CLI configuration')

configCommand
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'Config key: api-key or base-url')
  .argument('<value>', 'Config value')
  .action((key: string, value: string) => {
    if (key === 'api-key') {
      if (!value.startsWith('ef_live_')) {
        console.error('Error: API key must start with "ef_live_"')
        process.exit(1)
      }
      setApiKey(value)
      console.log(`API key saved (${value.substring(0, 15)}...)`)
    } else if (key === 'base-url') {
      setBaseUrl(value)
      console.log(`Base URL set to: ${value}`)
    } else {
      console.error(`Unknown config key: ${key}. Valid keys: api-key, base-url`)
      process.exit(1)
    }
  })

configCommand
  .command('show')
  .description('Show current configuration')
  .action(() => {
    const summary = getConfigSummary()
    console.log(`API Key:     ${summary.apiKey || '(not set)'}`)
    console.log(`Base URL:    ${summary.baseUrl}`)
    console.log(`Config file: ${summary.configPath}`)
  })
