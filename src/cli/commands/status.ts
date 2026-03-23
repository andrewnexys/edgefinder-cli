import { Command } from 'commander'
import { EdgeFinderError } from '../../core/client.js'
import { ensureAuthenticated } from '../../core/auth.js'

export const statusCommand = new Command('status')
  .description('Check your EdgeFinder account and subscription status')
  .option('--json', 'Output raw JSON')
  .action(async (opts: { json?: boolean }) => {
    try {
      const client = await ensureAuthenticated()
      const data = await client.getSubscriptionStatus()

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2))
      } else {
        console.log(`Plan:           ${data.subscriptionPlan}`)
        console.log(`Status:         ${data.subscriptionStatus}`)
        console.log(`Access:         ${data.hasAccess ? 'Yes' : 'No'} (${data.reason})`)
        console.log(`Unlimited:      ${data.hasUnlimitedAccess ? 'Yes' : 'No'}`)
        if (data.isTrialing && data.trialDaysLeft !== null) {
          console.log(`Trial:          ${data.trialDaysLeft} days remaining`)
        }
        if (data.trialEndsAt) {
          console.log(`Trial ends:     ${new Date(data.trialEndsAt).toLocaleDateString()}`)
        }
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
