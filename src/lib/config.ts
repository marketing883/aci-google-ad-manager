// ============================================================
// Application Configuration
// ============================================================

export const CONFIG = {
  // AI Model configuration
  models: {
    // Orchestrator tier — highest reasoning for intent parsing, planning, coordination
    orchestrator: {
      provider: 'anthropic' as const,
      model: 'claude-opus-4-0-20250514',
      maxTokens: 16384,
      temperature: 0.5,
      fallbacks: [
        { provider: 'openai' as const, model: 'o3' },
        { provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514' },
      ],
    },
    // Strategy tier — complex reasoning, research, optimization
    strategy: {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      temperature: 0.7,
      fallbacks: [
        { provider: 'anthropic' as const, model: 'claude-3-5-haiku-20241022' },
        { provider: 'openai' as const, model: 'gpt-4o' },
        { provider: 'openai' as const, model: 'gpt-4o-mini' },
      ],
    },
    // Fast tier — bulk generation, templated work
    fast: {
      provider: 'anthropic' as const,
      model: 'claude-3-5-haiku-20241022',
      maxTokens: 4096,
      temperature: 0.7,
      fallbacks: [
        { provider: 'openai' as const, model: 'gpt-4o-mini' },
      ],
    },
  },

  // Rate limits per provider (requests/tokens per minute)
  rateLimits: {
    anthropic: {
      requestsPerMin: 40,
      inputTokensPerMin: 100_000,
    },
    openai: {
      requestsPerMin: 60,
      inputTokensPerMin: 150_000,
    },
  },

  // Agent settings
  agents: {
    maxQARetries: 2,
    // Regex patterns that mean "yes, execute"
    confirmationPattern: /^(go\s*(?:ahead|for it)?|proceed|yes|do it|continue|confirmed?|approved?|execute|run it|let'?s\s*(?:go|do it)|ok(?:ay)?|sure|yep|yup|affirmative|start|begin|launch|make it happen|sounds good|perfect|lgtm|ship it|g\s*ahead|that'?s?\s*(?:good|great|fine|perfect))[\s!.]*$/i,
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

// Helper: estimate token count (rough ~4 chars per token)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
