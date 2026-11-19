import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import { setResponseHeaders } from '@tanstack/react-start/server'
import { buildSecurityHeaders, generateCspNonce } from './lib/security-headers'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

/**
 * Applies HTTP security headers and a per-request CSP nonce to every SSR
 * response — including 200 renders, thrown redirects (e.g. /docs/), 404s,
 * and server errors.
 */
export const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const nonce = generateCspNonce()
  setResponseHeaders(new Headers(buildSecurityHeaders(nonce)))
  return next({
    context: {
      nonce,
    },
  })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
}))
