// ============================================================
// Retry utility with exponential backoff
// ============================================================

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  onRetry?: (attempt: number, error: Error) => void,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxAttempts) break;

      // Check for non-retryable errors
      if (isNonRetryable(lastError)) break;

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs,
      );

      onRetry?.(attempt, lastError);
      await sleep(delay);
    }
  }

  throw lastError;
}

function isNonRetryable(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('invalid_api_key') ||
    message.includes('authentication') ||
    message.includes('permission') ||
    message.includes('not_found') ||
    message.includes('400')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
