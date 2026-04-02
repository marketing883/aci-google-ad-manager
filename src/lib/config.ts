// ============================================================
// Application Configuration
// ============================================================

export const CONFIG = {
  // AI Model tiers
  models: {
    orchestrator: {
      provider: 'anthropic' as const,
      model: 'claude-opus-4-20250514',
      maxTokens: 16384,
      temperature: 0.5,
      fallbacks: [
        { provider: 'openai' as const, model: 'gpt-4o' },
        { provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514' },
      ],
    },
    strategy: {
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      temperature: 0.7,
      fallbacks: [
        { provider: 'openai' as const, model: 'gpt-4o' },
        { provider: 'openai' as const, model: 'gpt-4o-mini' },
      ],
    },
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

  // Per-stage model assignment + loop limits
  stageModels: {
    gather:     { model: 'claude-sonnet-4-20250514', maxTokens: 4096, maxLoops: 3, fallback: 'gpt-4o-mini' },
    research:   { model: 'claude-opus-4-20250514', maxTokens: 8192, maxLoops: 5, fallback: 'gpt-4o' },
    strategy:   { model: 'claude-opus-4-20250514', maxTokens: 8192, maxLoops: 3, fallback: 'gpt-4o' },
    build:      { model: 'claude-opus-4-20250514', maxTokens: 8192, maxLoops: 15, fallback: 'gpt-4o' },
    present:    { model: 'claude-sonnet-4-20250514', maxTokens: 4096, maxLoops: 3, fallback: 'gpt-4o-mini' },
    edit:       { model: 'claude-opus-4-20250514', maxTokens: 8192, maxLoops: 5, fallback: 'gpt-4o' },
    approve:    { model: 'claude-sonnet-4-20250514', maxTokens: 4096, maxLoops: 3, fallback: 'gpt-4o-mini' },
    standalone: { model: 'claude-opus-4-20250514', maxTokens: 8192, maxLoops: 10, fallback: 'gpt-4o' },
  } as Record<string, { model: string; maxTokens: number; maxLoops: number; fallback: string }>,

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

// Helpers
export function dollarsToMicros(dollars: number): number {
  return Math.round(dollars * CONFIG.MICROS_PER_DOLLAR);
}

export function microsToDollars(micros: number): number {
  return micros / CONFIG.MICROS_PER_DOLLAR;
}

export function formatMicros(micros: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(microsToDollars(micros));
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
