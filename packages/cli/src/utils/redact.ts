/**
 * Secret redaction utility.
 * Scans text for patterns matching API keys and tokens, replaces with [REDACTED].
 * Used in ALL error messages, logs, and report output to prevent secret leakage.
 */

/** Patterns that match common API key and token formats */
const SECRET_PATTERNS: RegExp[] = [
  // OpenAI (project keys first — more specific)
  /sk-proj-[a-zA-Z0-9_-]{50,}/g,
  /sk-[a-zA-Z0-9_-]{20,}/g,
  // Anthropic
  /anthropic-[a-zA-Z0-9_-]{20,}/g,
  /sk-ant-[a-zA-Z0-9_-]{20,}/g,
  // GitHub (fine-grained first — more specific)
  /github_pat_[a-zA-Z0-9_]{22,}/g,
  /ghp_[a-zA-Z0-9]{36,}/g,
  /ghs_[a-zA-Z0-9]{36,}/g,
  /gho_[a-zA-Z0-9]{36,}/g,
  // GitLab
  /glpat-[a-zA-Z0-9_-]{20,}/g,
  // xAI
  /xai-[a-zA-Z0-9]{20,}/g,
  // AWS
  /AKIA[0-9A-Z]{16}/g,
  // Generic long base64 tokens (40+ chars)
  /(?:key|token|secret|password|apikey|api_key)["']?\s*[:=]\s*["']?([a-zA-Z0-9_\-/.+]{40,})["']?/gi,
  // Bearer tokens in headers
  /Bearer\s+[a-zA-Z0-9_\-/.+]{20,}/g,
  // Slack tokens
  /xox[bpors]-[a-zA-Z0-9-]{10,}/g,
  // Stripe
  /sk_live_[a-zA-Z0-9]{24,}/g,
  /sk_test_[a-zA-Z0-9]{24,}/g,
  // Vercel
  /vercel_[a-zA-Z0-9_-]{24,}/g,
];

/**
 * Redacts potential secrets from a string.
 * Replaces matched patterns with [REDACTED] to prevent accidental exposure.
 *
 * @param text - The text to scan and redact
 * @returns The text with all detected secrets replaced
 */
export function redact(text: string): string {
  if (!text) return text;

  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Checks if a string contains what appears to be a secret.
 *
 * @param value - The value to check
 * @returns true if the value matches a known secret pattern
 */
export function containsSecret(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) return true;
  }
  return false;
}
