import { createRouter } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getResponseHeader } from '@tanstack/react-start/server'
import { extractNonceFromCsp } from './lib/security-headers'
import { routeTree } from './routeTree.gen'

const getSsrNonce = createIsomorphicFn()
  .server(() => {
    try {
      return extractNonceFromCsp(getResponseHeader('Content-Security-Policy'))
    } catch {
      return undefined
    }
  })
  .client(() => undefined)

export function getRouter() {
  const nonce = getSsrNonce()
  const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    ...(nonce ? { ssr: { nonce } } : {}),
  })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}