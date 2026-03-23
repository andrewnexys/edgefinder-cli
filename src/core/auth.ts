import { createInterface } from 'node:readline'
import { exec } from 'node:child_process'
import { getApiKey, setApiKey, getBaseUrl } from './config.js'
import { EdgeFinderClient } from './client.js'

const SUBSCRIPTION_PAGE_URL = 'https://chat.edgefinder.io/subscription'

const PAID_PLANS = new Set(['starter', 'pro', 'ultimate'])

const POLL_INTERVAL_MS = 2000
const AUTH_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const SUBSCRIPTION_POLL_INTERVAL_MS = 3000
const SUBSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open'
  exec(`${cmd} "${url}"`, (err) => {
    if (err) {
      process.stderr.write(`  Open this URL in your browser:\n  ${url}\n`)
    }
  })
}

function hasPaidAccess(user: {
  subscriptionPlan: string | null
  subscriptionStatus: string | null
  hasUnlimitedAccess: boolean
  stripeCurrentPeriodEnd: string | null
}): boolean {
  if (user.hasUnlimitedAccess) return true
  if (!user.subscriptionPlan || !PAID_PLANS.has(user.subscriptionPlan)) return false
  return user.subscriptionStatus === 'active'
}

async function pollForAuth(sessionToken: string): Promise<{
  apiKey: string
  user: {
    email: string
    subscriptionPlan: string | null
    subscriptionStatus: string | null
    hasUnlimitedAccess: boolean
    stripeCurrentPeriodEnd: string | null
  }
}> {
  const deadline = Date.now() + AUTH_TIMEOUT_MS

  while (Date.now() < deadline) {
    const result = await EdgeFinderClient.cliPoll(sessionToken)

    if (result.status === 'authenticated' && result.apiKey && result.user) {
      return { apiKey: result.apiKey, user: result.user }
    }

    if (result.status === 'expired') {
      throw new Error('Login session expired. Please try again.')
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error('Login timed out. Please try again.')
}

async function pollForSubscription(client: EdgeFinderClient): Promise<boolean> {
  const deadline = Date.now() + SUBSCRIPTION_TIMEOUT_MS

  while (Date.now() < deadline) {
    try {
      const status = await client.getSubscriptionStatus()
      if (
        status.hasUnlimitedAccess ||
        (PAID_PLANS.has(status.subscriptionPlan) && status.subscriptionStatus === 'active')
      ) {
        return true
      }
    } catch {
      // Ignore errors during polling — subscription webhook may not have fired yet
    }

    await new Promise((resolve) => setTimeout(resolve, SUBSCRIPTION_POLL_INTERVAL_MS))
  }

  return false
}

/**
 * Run the full interactive login flow: email prompt → magic link → poll → save API key.
 * Handles paid subscription gating with Stripe checkout redirect.
 *
 * @param skipAlreadyLoggedInCheck - If true, skip the "already logged in" prompt (used by ensureAuthenticated)
 */
export async function runLoginFlow(skipAlreadyLoggedInCheck = false): Promise<void> {
  // Check if already logged in
  if (!skipAlreadyLoggedInCheck) {
    const existingKey = getApiKey()
    if (existingKey) {
      const answer = await prompt(
        `You're already logged in (${existingKey.substring(0, 15)}...). Log in with a different account? (y/N) `
      )
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        return
      }
    }
  }

  // Prompt for email
  const email = await prompt('Enter your email: ')
  if (!email) {
    process.stderr.write('Email is required.\n')
    process.exit(1)
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    process.stderr.write('Invalid email format.\n')
    process.exit(1)
  }

  // Initiate CLI login
  process.stderr.write('\n')
  let loginResult: { sessionToken: string; email: string }
  try {
    loginResult = await EdgeFinderClient.cliLogin(email)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to send magic link'
    process.stderr.write(`Error: ${msg}\n`)
    process.exit(1)
  }

  process.stderr.write(`  Magic link sent to ${loginResult.email}\n`)
  process.stderr.write('  Check your inbox and click the link to sign in.\n\n')
  process.stderr.write('  Waiting for you to click the link...\n')

  // Poll for authentication
  let authResult: Awaited<ReturnType<typeof pollForAuth>>
  try {
    authResult = await pollForAuth(loginResult.sessionToken)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Authentication failed'
    process.stderr.write(`\n  ${msg}\n`)
    process.exit(1)
  }

  // Save the API key
  setApiKey(authResult.apiKey)
  process.stderr.write(`\n  Authenticated as ${authResult.user.email}\n`)

  // Check subscription status
  if (hasPaidAccess(authResult.user)) {
    const plan = authResult.user.subscriptionPlan ?? 'paid'
    process.stderr.write(`  ${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription active. You're all set!\n\n`)
    return
  }

  // User needs a paid plan — offer upgrade
  process.stderr.write('\n  CLI access requires a paid subscription (Starter $20/mo, Pro $50/mo, or Ultimate $150/mo).\n')
  const upgradeAnswer = await prompt('  Open subscription page in your browser? (Y/n) ')

  if (upgradeAnswer.toLowerCase() === 'n' || upgradeAnswer.toLowerCase() === 'no') {
    process.stderr.write(`\n  You can upgrade anytime at ${SUBSCRIPTION_PAGE_URL}\n`)
    process.stderr.write('  Note: CLI commands require a paid subscription to work.\n')
    return
  }

  // Open subscription page
  process.stderr.write('\n  Opening subscription page in your browser...\n')
  openBrowser(SUBSCRIPTION_PAGE_URL)

  process.stderr.write('  Waiting for subscription activation...\n')

  // Poll for subscription upgrade
  const client = new EdgeFinderClient(authResult.apiKey, getBaseUrl())
  const upgraded = await pollForSubscription(client)

  if (upgraded) {
    process.stderr.write('\n  Subscription activated! You\'re all set.\n\n')
  } else {
    process.stderr.write('\n  Subscription not detected yet.\n')
    process.stderr.write('  If you completed checkout, it may take a moment to activate.\n')
    process.stderr.write('  Check with: edgefinder status\n')
  }
}

/**
 * Ensure the user is authenticated. If no API key is found,
 * automatically starts the interactive login flow.
 *
 * Returns a ready-to-use EdgeFinderClient.
 */
export async function ensureAuthenticated(): Promise<EdgeFinderClient> {
  let key = getApiKey()

  if (!key) {
    process.stderr.write('Not logged in. Let\'s set up your account.\n\n')
    await runLoginFlow(true)
    key = getApiKey()
    if (!key) {
      process.stderr.write('Login did not complete. Run: edgefinder login\n')
      process.exit(1)
    }
    process.stderr.write('\n') // Blank line before command output
  }

  return new EdgeFinderClient(key, getBaseUrl())
}
