import { getApiKey, getBaseUrl } from './config.js'
import type {
  ChatRequest,
  ChatResponse,
  PortfolioSummary,
  PortfolioPosition,
  PortfolioClosedPosition,
  PortfolioTrade,
  SubscriptionStatus,
  ApiError,
} from './types.js'

class EdgeFinderError extends Error {
  constructor(
    message: string,
    public status: number,
    public apiError?: ApiError
  ) {
    super(message)
    this.name = 'EdgeFinderError'
  }
}

export class EdgeFinderClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey || getApiKey()
    if (!key) {
      throw new EdgeFinderError(
        'No API key configured. Run: edgefinder login',
        0
      )
    }
    this.apiKey = key
    this.baseUrl = baseUrl || getBaseUrl()
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    }

    // Add auth header for non-public endpoints
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    const data = await response.json()

    if (!response.ok) {
      const apiError = data as ApiError
      throw new EdgeFinderError(
        apiError.message || apiError.error || `HTTP ${response.status}`,
        response.status,
        apiError
      )
    }

    return data as T
  }

  // ── Chat (core analysis) ──────────────────────────────────────────

  async ask(req: ChatRequest): Promise<ChatResponse> {
    return this.request<ChatResponse>('/api/v1/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: req.message,
        league: req.league || 'nfl',
        conversationHistory: req.conversationHistory || [],
      }),
    })
  }

  // ── Discover (public, no auth needed) ─────────────────────────────

  async getNFLSchedule(): Promise<unknown> {
    return this.request('/api/discover/nfl-schedule')
  }

  async getNBASchedule(date?: string): Promise<unknown> {
    const params = date ? `?date=${date}` : ''
    return this.request(`/api/discover/nba-schedule${params}`)
  }

  async getNFLStandings(): Promise<unknown> {
    return this.request('/api/discover/nfl-standings')
  }

  async getNBAStandings(): Promise<unknown> {
    return this.request('/api/discover/nba-standings')
  }

  async getNFLOdds(week?: number): Promise<unknown> {
    const params = week ? `?week=${week}` : ''
    return this.request(`/api/discover/nfl-polymarket-odds${params}`)
  }

  async getNBAOdds(date?: string): Promise<unknown> {
    const params = date ? `?date=${date}` : ''
    return this.request(`/api/discover/nba-polymarket-odds${params}`)
  }

  // ── Portfolio (requires auth) ─────────────────────────────────────

  async getPortfolioSummary(league?: string): Promise<PortfolioSummary> {
    const params = league ? `?league=${league}` : ''
    return this.request<PortfolioSummary>(`/api/portfolio/summary${params}`)
  }

  async getPortfolioPositions(league?: string): Promise<{ positions: PortfolioPosition[] }> {
    const params = league ? `?league=${league}` : ''
    return this.request(`/api/portfolio/positions${params}`)
  }

  async getPortfolioTrades(league?: string, limit?: number): Promise<{ trades: PortfolioTrade[]; total: number }> {
    const searchParams = new URLSearchParams()
    if (league) searchParams.set('league', league)
    if (limit) searchParams.set('limit', String(limit))
    const qs = searchParams.toString()
    return this.request(`/api/portfolio/trades${qs ? '?' + qs : ''}`)
  }

  async getPortfolioClosed(league?: string, limit?: number): Promise<{ positions: PortfolioClosedPosition[]; total: number }> {
    const searchParams = new URLSearchParams()
    if (league) searchParams.set('league', league)
    if (limit) searchParams.set('limit', String(limit))
    const qs = searchParams.toString()
    return this.request(`/api/portfolio/closed${qs ? '?' + qs : ''}`)
  }

  // ── Account ───────────────────────────────────────────────────────

  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    return this.request<SubscriptionStatus>('/api/subscription/status')
  }

  // ── Static methods for CLI login (no API key required) ────────────

  static async cliLogin(
    email: string,
    baseUrl?: string
  ): Promise<{ sessionToken: string; email: string }> {
    const url = `${baseUrl || getBaseUrl()}/api/v2/auth/cli-login`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await response.json()
    if (!response.ok || !data.success) {
      const msg = data.error?.message || data.error || `HTTP ${response.status}`
      throw new EdgeFinderError(msg, response.status, data)
    }
    return data.data
  }

  static async cliPoll(
    sessionToken: string,
    baseUrl?: string
  ): Promise<{
    status: 'pending' | 'authenticated' | 'expired'
    apiKey?: string
    user?: {
      email: string
      subscriptionPlan: string | null
      subscriptionStatus: string | null
      hasUnlimitedAccess: boolean
      trialEndsAt: string | null
      stripeCurrentPeriodEnd: string | null
    }
  }> {
    const url = `${baseUrl || getBaseUrl()}/api/v2/auth/cli-poll?session=${sessionToken}`
    const response = await fetch(url)
    const data = await response.json()
    return data
  }
}

export { EdgeFinderError }
