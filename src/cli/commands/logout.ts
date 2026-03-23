import { Command } from 'commander'
import { getApiKey, clearApiKey } from '../../core/config.js'

export const logoutCommand = new Command('logout')
  .description('Log out of EdgeFinder')
  .action(() => {
    const existingKey = getApiKey()
    if (!existingKey) {
      console.log('Not currently logged in.')
      return
    }

    clearApiKey()
    console.log('Logged out. API key removed from ~/.edgefinder/config.json')
  })
