/**
 * Generic retry wrapper with exponential backoff.
 * Used for API calls, network requests, and flaky operations.
 */

/** Options for configuring retry behavior */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  retries: number;
  /** Base backoff delay in ms — doubles each attempt (default: 1000) */
  backoff: number;
  /** Maximum backoff delay in ms (default: 30000) */
  maxBackoff?: number;
  /** Callback invoked before each retry attempt */
  onRetry?: (error: Error, attempt: number) => void;
  /** Optional function to determine if an error is retryable (default: all errors) */
  isRetryable?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  retries: 3,
  backoff: 1000,
  maxBackoff: 30000,
};

/**
 * Retries an async function with exponential backoff.
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration
 * @returns The result of the function if it succeeds
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```ts
 * const data = await retry(
 *   () => fetchFromAPI(url),
 *   { retries: 3, backoff: 1000, onRetry: (err, n) => console.log(`Retry ${n}`) }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if this error is retryable
      if (opts.isRetryable && !opts.isRetryable(lastError)) {
        throw lastError;
      }

      // If this was the last attempt, don't wait — just throw
      if (attempt >= opts.retries) {
        break;
      }

      // Calculate backoff with jitter
      const baseDelay = opts.backoff * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelay * 0.1;
      const delay = Math.min(baseDelay + jitter, opts.maxBackoff ?? 30000);

      // Notify caller
      opts.onRetry?.(lastError, attempt + 1);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('Retry failed with no error captured');
}

/**
 * Creates a retry wrapper with pre-configured options.
 * Useful for creating API-specific retry policies.
 *
 * @param defaultOptions - Default retry options for all calls
 * @returns A retry function with baked-in defaults
 */
export function createRetrier(defaultOptions: Partial<RetryOptions>) {
  return <T>(fn: () => Promise<T>, overrides?: Partial<RetryOptions>): Promise<T> => {
    return retry(fn, { ...defaultOptions, ...overrides });
  };
}
