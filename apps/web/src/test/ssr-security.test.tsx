import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { act, cleanup, render, screen } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCspHeader,
  buildSecurityHeaders,
  extractNonceFromCsp,
  generateCspNonce,
} from '../lib/security-headers'
import { getRouter } from '../router'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ENTRY = path.resolve(__dirname, '../../dist/server/index.js')

describe('security headers and CSP nonce helpers', () => {
  it('generates distinct cryptographic nonces and embeds them in script-src without unsafe-inline', () => {
    const first = generateCspNonce()
    const second = generateCspNonce()
    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(20)

    const csp = buildCspHeader(first)
    expect(csp).toContain(`script-src 'self' 'nonce-${first}'`)
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain('upgrade-insecure-requests')
    expect(extractNonceFromCsp(csp)).toBe(first)

    const headers = buildSecurityHeaders(first)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()')
    expect(headers['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains; preload',
    )
  })
})

describe('/privacy disclosures', () => {
  afterEach(() => {
    cleanup()
  })

  it('discloses all AI providers, Google Fonts, Cloudflare hosting, DELETE /v1/account, and contact emails', async () => {
    const router = getRouter()
    await act(async () => {
      await router.navigate({ to: '/privacy' })
    })
    render(<RouterProvider router={router} />)

    const text = document.body.textContent ?? ''
    expect(text).toContain('OpenAI')
    expect(text).toContain('Anthropic')
    expect(text).toContain('Google Gemini')
    expect(text).toContain('baseUrl')
    expect(text).toContain('fonts.googleapis.com')
    expect(text).toContain('fonts.gstatic.com')
    expect(text).toContain('Cloudflare Workers')
    expect(text).toContain('DELETE /v1/account')
    expect(screen.getByRole('link', { name: 'hello@frontguard.dev' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:hello@frontguard.dev'),
    )
    expect(screen.getByRole('link', { name: 'security@frontguard.dev' })).toHaveAttribute(
      'href',
      'mailto:security@frontguard.dev',
    )
  })
})

describe('built SSR middleware security headers, redirects, and docs 404', () => {
  type ServerEntry = { fetch: (req: Request) => Promise<Response> }

  async function loadServer(): Promise<ServerEntry | null> {
    if (!fs.existsSync(SERVER_ENTRY)) return null
    const mod = (await import(pathToFileURL(SERVER_ENTRY).href)) as { default: ServerEntry }
    return mod.default
  }

  function expectSecurityHeaders(res: Response): string {
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()')
    expect(res.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains; preload',
    )
    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain('upgrade-insecure-requests')
    const nonce = extractNonceFromCsp(csp)
    expect(nonce).toBeTruthy()
    return nonce!
  }

  function expectExecutableScriptsHaveNonce(html: string, nonce: string) {
    expect(html).toContain(`property="csp-nonce" content="${nonce}"`)
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1])
    const executable = scripts.filter((attrs) => !/type=["']application\/ld\+json["']/i.test(attrs))
    expect(executable.length).toBeGreaterThan(0)
    for (const attrs of executable) {
      expect(attrs, `<script${attrs}> missing nonce`).toContain(`nonce="${nonce}"`)
    }
  }

  it('applies per-request CSP nonces and security headers across 200, 307 redirects, and 404 docs slugs', async () => {
    const server = await loadServer()
    if (!server) return

    const home1 = await server.fetch(
      new Request('https://frontguard.dev/', { headers: { Accept: 'text/html' } }),
    )
    expect(home1.status).toBe(200)
    const nonce1 = expectSecurityHeaders(home1)
    expectExecutableScriptsHaveNonce(await home1.text(), nonce1)

    const home2 = await server.fetch(
      new Request('https://frontguard.dev/', { headers: { Accept: 'text/html' } }),
    )
    expect(home2.status).toBe(200)
    const nonce2 = expectSecurityHeaders(home2)
    expect(nonce2).not.toBe(nonce1)
    expectExecutableScriptsHaveNonce(await home2.text(), nonce2)

    const docsTrailing = await server.fetch(
      new Request('https://frontguard.dev/docs/', { headers: { Accept: 'text/html' } }),
    )
    expect(docsTrailing.status).toBe(307)
    expectSecurityHeaders(docsTrailing)

    const docsIndex = await server.fetch(
      new Request('https://frontguard.dev/docs', { headers: { Accept: 'text/html' } }),
    )
    expect(docsIndex.status).toBe(307)
    expect(docsIndex.headers.get('location')).toBe('/docs/index')
    expectSecurityHeaders(docsIndex)

    const validDoc = await server.fetch(
      new Request('https://frontguard.dev/docs/quick-start', { headers: { Accept: 'text/html' } }),
    )
    expect(validDoc.status).toBe(200)
    const validNonce = expectSecurityHeaders(validDoc)
    expectExecutableScriptsHaveNonce(await validDoc.text(), validNonce)

    const unknownDoc = await server.fetch(
      new Request('https://frontguard.dev/docs/getting-started/quickstart', {
        headers: { Accept: 'text/html' },
      }),
    )
    expect(unknownDoc.status).toBe(404)
    const notFoundNonce = expectSecurityHeaders(unknownDoc)
    const notFoundHtml = await unknownDoc.text()
    expect(notFoundHtml).toContain('Page not found')
    expectExecutableScriptsHaveNonce(notFoundHtml, notFoundNonce)
  })
})
