/** Base URL failures the CLI turns into one exit instead of one per viewport. */



/**
 * Thrown by the pipeline when the configured base URL cannot be reached
 * (ECONNREFUSED, getaddrinfo ENOTFOUND, etc.). The CLI catches this and
 * exits with a single actionable message instead of the
 * one-per-viewport stack of identical connection errors that the render
 * stage would otherwise produce.
 */
export class UnreachableBaseUrlError extends Error {
  readonly baseUrl: string;
  constructor(baseUrl: string, cause?: unknown) {
    super(`Base URL ${baseUrl} is unreachable. Start your dev server, or pass --url <reachable-url>.`);
    this.name = 'UnreachableBaseUrlError';
    this.baseUrl = baseUrl;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

/**
 * Returns true if `message` looks like a transport-layer failure that means
 * "we never reached the host" — connection refused, DNS lookup failure,
 * unreachable network, or a Playwright net::ERR_CONNECTION_* error. These
 * are exactly the failures where falling back to `/` would just re-fail
 * identically on every viewport.
 */
export function isUnreachableHostError(message: string): boolean {
  if (!message) return false;
  return (
    /ECONNREFUSED/i.test(message) ||
    /ENOTFOUND/i.test(message) ||
    /ECONNRESET/i.test(message) ||
    /EHOSTUNREACH/i.test(message) ||
    /ENETUNREACH/i.test(message) ||
    /net::ERR_CONNECTION_REFUSED/i.test(message) ||
    /net::ERR_CONNECTION_RESET/i.test(message) ||
    /net::ERR_NAME_NOT_RESOLVED/i.test(message)
  );
}
