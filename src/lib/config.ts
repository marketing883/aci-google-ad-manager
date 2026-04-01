// ============================================================
// Application Configuration
// ============================================================

export const CONFIG = {
  // AI Model configuration
  models: {
    // Strategy tier — complex reasoning, research, optimization
    strategy: {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      temperature: 0.7,
    },
    // Fast tier — bulk generation, templated work
    fast: {
      provider: 'anthropic' as const,
      model: 'claude-3-5-haiku-20241022',
      maxTokens: 4096,
      temperature: 0.7,
    },
    // Fallback chain
    fallbacks: [
      { provider: 'anthropic' as const, model: 'claude-3-5-haiku-20241022' },
      { provider: 'openai' as const, model: 'gpt-4o' },
      { provider: 'openai' as const, model: 'gpt-4o-mini' },
    ],
  },

  // Google Ads
  googleAds: {
    apiVersion: 'v18',
    scopes: ['https://www.googleapis.com/auth/adwords'],
    redirectUri: process.env.GOOGLE_ADS_REDIRECT_URI || 'http://localhost:3000/api/google-ads/auth/callback',
  },

  // Approval settings
  approvals: {
    expirationDays: 7,
    defaultPriority: 'normal' as const,
  },

  // Performance sync
  sync: {
    intervalHours: 6,
    lookbackDays: 30,
  },

  // Rate limiting
  rateLimit: {
    maxRequests: 60,
    windowMs: 60_000,
  },

  // Micros conversion
  MICROS_PER_DOLLAR: 1_000_000,
} as const;

// Helper: convert dollars to micros
export function dollarsToMicros(dollars: number): number {
  return Math.round(dollars * CONFIG.MICROS_PER_DOLLAR);
}

// Helper: convert micros to dollars
export function microsToDollars(micros: number): number {
  return micros / CONFIG.MICROS_PER_DOLLAR;
}

// Helper: format micros as currency string
export function formatMicros(micros: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(microsToDollars(micros));
}
