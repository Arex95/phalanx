import { NetworkError, ServerError } from '@/errors';
import { computeDelay } from '@/realtime/backoff';

export interface RetryConfig {
  retries?: number;
  retryDelay?: number;
  retryCondition?: (error: unknown) => boolean;
  maxRetryDelay?: number;
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  retries: 3,
  retryDelay: 1000,
  maxRetryDelay: 10000,
  backoffMultiplier: 2,
  retryCondition: (error: unknown) => {
    if (error instanceof NetworkError || error instanceof ServerError) {
      const statusCode = error.statusCode;
      if (!statusCode) return true;
      if (statusCode >= 500) return true;
      if (statusCode === 408 || statusCode === 429) return true;
      return false;
    }
    if (error instanceof Error) {
      return error.message.includes('timeout') || error.message.includes('network');
    }
    return false;
  },
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
  random: () => number = Math.random
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const backoff = {
    baseMs: finalConfig.retryDelay,
    factor: finalConfig.backoffMultiplier,
    capMs: finalConfig.maxRetryDelay,
    maxAttempts: finalConfig.retries,
  };
  let lastError: unknown;

  for (let attempt = 0; attempt <= finalConfig.retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === finalConfig.retries) {
        break;
      }

      if (!finalConfig.retryCondition(error)) {
        throw error;
      }

      // Shared with the realtime reconnection, jitter included: two subsystems
      // spacing retries differently was a difference nobody chose.
      await new Promise((resolve) =>
        setTimeout(resolve, computeDelay(attempt + 1, backoff, random))
      );
    }
  }

  throw lastError;
}

