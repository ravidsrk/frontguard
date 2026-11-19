const GOOGLE_FONTS_STYLE_ORIGIN = 'https://fonts.googleapis.com'
const GOOGLE_FONTS_FONT_ORIGIN = 'https://fonts.gstatic.com'

export const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
}

/**
 * Generates a cryptographically random 128-bit base64 CSP nonce.
 * Uses Web Crypto (`crypto.getRandomValues`) so it runs in both Cloudflare Workers and Node.
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/**
 * Builds the Content-Security-Policy header value.
 * When a per-request nonce is provided (SSR), `script-src` allows only `'self'`
 * and `'nonce-<nonce>'` (no `'unsafe-inline'` and no `'unsafe-eval'`).
 */
export function buildCspHeader(nonce?: string): string {
  const scriptSrc = nonce ? `script-src 'self' 'nonce-${nonce}'` : "script-src 'self'"
  return [
    "default-src 'self'",
    scriptSrc,
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_STYLE_ORIGIN}`,
    `font-src 'self' ${GOOGLE_FONTS_FONT_ORIGIN} data:`,
    "img-src 'self' data: https:",
    "connect-src 'self' https://frontguard.dev",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
}

export function buildSecurityHeaders(nonce?: string): Record<string, string> {
  return {
    ...BASE_SECURITY_HEADERS,
    'Content-Security-Policy': buildCspHeader(nonce),
  }
}

export function extractNonceFromCsp(csp?: string): string | undefined {
  if (!csp) return undefined
  const match = csp.match(/'nonce-([^']+)'/)
  return match?.[1]
}
