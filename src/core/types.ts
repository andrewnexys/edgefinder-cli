export type League = 'nfl' | 'nba'

export interface ChatRequest {
  message: string
  league?: League
  conversationHistory?: Array<{ role: string; content: string }>
}

export interface ChatResponse {
  response: string
  conversationHistory: Array<{ role: string; content: string }>
  userId: string
  usage?: {
    tokensUsed: number
    promptTokens: number
    completionTokens: number
    rateLimitRemaining: {
      hour: number
      minute: number
    }
  }
}

export interface PortfolioSummary {
  connected: boolean
  wallet?: string
  username?: string
  avatar?: string
  connectedAt?: string
  valueLabel?: string
  totalValue?: number
  positionsValue?: number
  cashBalance?: number | null
  dayPnl?: number | null
  totalPnl?: number
  percentPnl?: number
  positionCount?: number
  snapshots?: Array<{ date: string; pnl: number }>
  lastSyncedAt?: string | null
}

export interface PortfolioPosition {
  id: string
  title: string
  slug: string
  outcome: string
  size: number
  avgPrice: number
  currentPrice: number
  currentValue: number
  initialValue: number
  cashPnl: number
  isRedeemable: boolean
  [key: string]: unknown
}

export interface PortfolioTrade {
  id: string
  title: string
  slug: string
  outcome: string
  side: string
  size: number
  price: number
  timestamp: string
  [key: string]: unknown
}

export interface PortfolioClosedPosition {
  id: string
  title: string
  slug: string
  outcome: string
  avgPrice: number
  totalBought: number
  realizedPnl: number
  curPrice: number
  endDate: string | null
  [key: string]: unknown
}

export interface SubscriptionStatus {
  subscriptionPlan: string
  subscriptionStatus: string
  hasUnlimitedAccess: boolean
  hasAccess: boolean
  reason: string
  trialEndsAt: string | null
  trialDaysLeft: number | null
  isTrialing: boolean
  [key: string]: unknown
}

export interface ApiError {
  error: string
  message?: string
}
