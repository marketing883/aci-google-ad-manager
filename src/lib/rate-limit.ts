import { CONFIG } from './config';
import { createLogger } from './utils/logger';

const logger = createLogger('RateLimiter');

// ============================================================
// Token Bucket Rate Limiter for AI API calls
// Prevents exceeding Anthropic/OpenAI rate limits
// ============================================================

interface BucketState {
  requests: number;
  tokens: number;
  windowStart: number;
}

const buckets: Record<string, BucketState> = {};

function getBucket(provider: string): BucketState {
  const now = Date.now();
  const bucket = buckets[provider];

  // Reset bucket if window has passed (1 minute)
  if (!bucket || now - bucket.windowStart >= 60_000) {
    buckets[provider] = { requests: 0, tokens: 0, windowStart: now };
    return buckets[provider];
  }

  return bucket;
}

function getLimits(provider: string) {
  if (provider === 'anthropic') return CONFIG.rateLimits.anthropic;
  if (provider === 'openai') return CONFIG.rateLimits.openai;
  return { requestsPerMin: 30, inputTokensPerMin: 50_000 }; // safe defaults
}

/**
 * Check if we can make a request without exceeding limits
 */
export function canMakeRequest(provider: string, estimatedTokens: number): boolean {
  const bucket = getBucket(provider);
  const limits = getLimits(provider);

  return (
    bucket.requests < limits.requestsPerMin &&
    bucket.tokens + estimatedTokens < limits.inputTokensPerMin
  );
}

/**
 * Record a request after it's made
 */
export function recordRequest(provider: string, tokensUsed: number): void {
  const bucket = getBucket(provider);
  bucket.requests++;
  bucket.tokens += tokensUsed;
}

/**
 * Wait until we can make a request (blocks if rate limited)
 */
export async function waitForCapacity(
  provider: string,
  estimatedTokens: number,
  maxWaitMs = 30_000,
): Promise<void> {
  const startWait = Date.now();

  while (!canMakeRequest(provider, estimatedTokens)) {
    if (Date.now() - startWait > maxWaitMs) {
      logger.warn(`Rate limit wait timeout for ${provider} after ${maxWaitMs}ms`);
      // Allow the request anyway after timeout — let the API handle it
      return;
    }

    const bucket = getBucket(provider);
    const timeUntilReset = 60_000 - (Date.now() - bucket.windowStart);
    const waitTime = Math.min(timeUntilReset + 100, 5000); // Wait up to 5s at a time

    logger.info(`Rate limited on ${provider}, waiting ${waitTime}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
}

/**
 * Get current usage stats for a provider
 */
export function getUsageStats(provider: string): {
  requests: number;
  tokens: number;
  requestsRemaining: number;
  tokensRemaining: number;
} {
  const bucket = getBucket(provider);
  const limits = getLimits(provider);

  return {
    requests: bucket.requests,
    tokens: bucket.tokens,
    requestsRemaining: Math.max(0, limits.requestsPerMin - bucket.requests),
    tokensRemaining: Math.max(0, limits.inputTokensPerMin - bucket.tokens),
  };
}
