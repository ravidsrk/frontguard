/**
 * Secret redaction utility.
 * Scans text for patterns matching API keys, tokens, credentials, and private
 * keys, replacing them with [REDACTED]. Used in error messages, logs, and all
 * report outputs to prevent secret leakage.
 */

/** Patterns that match common API key, token, and private key formats. */
const SECRET_PATTERNS: RegExp[] = [
  // PEM private keys
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  // OpenAI (project keys first — more specific)
  /sk-proj-[a-zA-Z0-9_-]{20,}/g,
  // Anthropic
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  /anthropic-[a-zA-Z0-9_-]{20,}/g,
  // Generic sk- keys (OpenAI, etc.)
  /sk-[a-zA-Z0-9_-]{20,}/g,
  // Gemini / Google API keys
  /AIza[0-9A-Za-z_-]{35}/g,
  // Figma personal access tokens
  /figd_[a-zA-Z0-9_-]{20,}/g,
  // Frontguard API keys
  /fg_[a-zA-Z0-9_-]{20,}/g,
  // GitHub (fine-grained first — more specific)
  /github_pat_[a-zA-Z0-9_]{22,}/g,
  /gh[psor]_[a-zA-Z0-9]{36,}/g,
  // GitLab
  /glpat-[a-zA-Z0-9_-]{20,}/g,
  // xAI
  /xai-[a-zA-Z0-9]{20,}/g,
  // AWS access keys
  /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
  // Bearer / Basic auth headers
  /\b(?:Bearer|Basic)\s+[a-zA-Z0-9_\-/.+=]{16,}/gi,
  // Slack tokens
  /xox[bpors]-[a-zA-Z0-9-]{10,}/g,
  // Stripe
  /sk_(?:live|test)_[a-zA-Z0-9]{24,}/g,
  // Vercel
  /vercel_[a-zA-Z0-9_-]{24,}/g,
  // Generic long key/token/secret assignments (40+ chars)
  /(?:key|token|secret|password|apikey|api_key)["']?\s*[:=]\s*["']?([a-zA-Z0-9_\-/.+=]{40,})["']?/gi,
];

/** Matches URLs carrying inline userinfo credentials (e.g. `https://user:pass@host`). */
const URL_USERINFO_RE = /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s@]+)@/gi;

/**
 * Redacts potential secrets and inline URL credentials from a string.
 *
 * @param text - The text to scan and redact
 * @returns The text with all detected secrets replaced
 */
export function redact(text: string): string {
  if (!text) return text;

  let result = text.replace(URL_USERINFO_RE, '$1[REDACTED]@');
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Checks if a string contains what appears to be a secret or inline URL credential.
 */
export function containsSecret(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  URL_USERINFO_RE.lastIndex = 0;
  if (URL_USERINFO_RE.test(value)) return true;

  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) return true;
  }
  return false;
}

/**
 * Deeply redacts all string values inside an object or array, guarding against
 * circular references. Used to sanitize serialized JSON reports and webhook payloads.
 */
export function redactDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]' as unknown as T;
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, seen)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactDeep(v, seen);
  }
  return out as T;
}
