import { createRequire } from 'node:module'
import { act, cleanup, render } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { chromium, type Browser, type Page } from 'playwright'
import { getRouter } from '../router'
import { FIRST_DOC_SLUG } from '../lib/docs-content'
import siteCss from '../styles.css?raw'

/**
 * Marketing-site accessibility check for issue #297.
 * axe-core runs in Chromium against the routed page markup. This is not the
 * CLI accessibility plugin, and it does not gate pixelmatch.
 *
 * Keyboard pass — Chromium itself moves focus and activates the link:
 * - Tab through the header (skip link, brand, primary nav)
 * - Enter on the focused primary link
 * The test fails if that control is not in the tab sequence or Enter does not activate it.
 *
 * jsdom cannot compute contrast (no canvas, no pseudo-elements, unresolved
 * custom properties). Playwright applies apps/web/src/styles.css for real.
 */

const require = createRequire(import.meta.url)
const axeScript = require.resolve('axe-core')

type AxeNode = {
  target: string[]
  html: string
  any: { id: string; message: string }[]
  all: { id: string; message: string }[]
  none: { id: string; message: string }[]
}

type AxeRule = {
  id: string
  impact?: string | null
  help: string
  nodes: AxeNode[]
  error?: { message?: string }
}

type AxeReport = {
  violations: AxeRule[]
  passes: { id: string }[]
  incomplete: AxeRule[]
  inapplicable: { id: string }[]
}

type RouteCase = {
  id: string
  to: string
  pathname: string
  primaryName: RegExp
  tabStops: string[]
}

const ROUTES: RouteCase[] = [
  {
    id: 'home',
    to: '/',
    pathname: '/',
    primaryName: /^get started/i,
    tabStops: ['Skip to main content', 'frontguard', 'features', 'pricing', 'docs', 'changelog'],
  },
  {
    id: 'docs',
    to: '/docs',
    pathname: `/docs/${FIRST_DOC_SLUG}`,
    primaryName: /^home$/,
    tabStops: [
      'Skip to main content',
      'frontguard',
      'home',
      'pricing',
      'compare',
      'changelog',
      'github',
    ],
  },
  {
    id: 'pricing',
    to: '/pricing',
    pathname: '/pricing',
    primaryName: /^get started/i,
    tabStops: ['Skip to main content', 'frontguard', 'features', 'pricing', 'docs', 'changelog'],
  },
]

/**
 * Violations removed from the failure set. Keep the reason on the same line
 * as the rule id. Empty means every axe violation fails the test.
 */
const WAIVERS: Record<string, string> = {}

let browser: Browser | undefined

/** Names of controls Chromium actually focused while Tab was still in the header. */
async function headerTabNames(page: Page): Promise<string[]> {
  const names: string[] = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const name = await page.evaluate(() => {
      const el = document.activeElement
      const header = document.querySelector('header.fg-nav, header.fg-docs-header')
      if (!(el instanceof HTMLElement) || !header || el === document.body) return null
      const inHeader = header.contains(el)
      const before = (header.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
      if (!inHeader && !before) return null
      return (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
    })
    if (name == null) break
    names.push(name)
  }
  return names
}

function siteHeader(): HTMLElement {
  const header = document.querySelector<HTMLElement>('header.fg-nav, header.fg-docs-header')
  if (!header) throw new Error('site header was not rendered')
  return header
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;',
  )
}

function renderedDocument(): string {
  const shell = siteHeader().parentElement
  if (!shell) throw new Error('page shell was not rendered')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(document.title)}</title><style>${siteCss}</style></head><body>${shell.outerHTML}</body></html>`
}

function checkMessages(node: AxeNode): string {
  return [...node.any, ...node.all, ...node.none].map((check) => check.message).join(' ')
}

function formatRule(rule: AxeRule): string {
  const nodes = rule.nodes
    .slice(0, 12)
    .map((node) => `  - ${node.target.join(' ')} :: ${checkMessages(node)} :: ${node.html.slice(0, 180)}`)
    .join('\n')
  const error = rule.error?.message ? ` (${rule.error.message})` : ''
  return `${rule.id} [${rule.impact ?? 'unknown'}] ${rule.help}${error}\n${nodes}`
}

async function renderRoute(to: string) {
  const router = getRouter()
  await act(async () => {
    await router.navigate({ to: to as '/' })
  })
  const view = render(<RouterProvider router={router} />)
  return { ...view, router }
}

async function audit(to: string): Promise<{ report: AxeReport; pathname: string }> {
  const { router } = await renderRoute(to)
  const html = renderedDocument()
  if (!browser) throw new Error('chromium was not launched')
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await page.setContent(html, { waitUntil: 'load' })
    await page.addScriptTag({ path: axeScript })
    const report = (await page.evaluate(async () => {
      const api = (
        window as unknown as {
          axe: { run: (node: Document, options: object) => Promise<unknown> }
        }
      ).axe
      return api.run(document, { iframes: false, preload: false })
    })) as AxeReport
    return { report, pathname: router.state.location.pathname }
  } finally {
    await page.close()
  }
}

describe('marketing site accessibility', () => {
  beforeAll(async () => {
    browser = await chromium.launch()
  }, 30000)

  afterAll(async () => {
    await browser?.close()
    browser = undefined
  })

  afterEach(() => {
    cleanup()
  })

  it.each(ROUTES)(
    'runs axe on $id ($pathname) with no unwaved violations',
    async (route) => {
      const { report, pathname } = await audit(route.to)
      expect(pathname).toBe(route.pathname)

      expect(report.passes.map((rule) => rule.id)).toEqual(
        expect.arrayContaining([
          'html-has-lang',
          'document-title',
          'button-name',
          'link-name',
          'color-contrast',
          'landmark-one-main',
          'page-has-heading-one',
        ]),
      )

      for (const rule of report.violations) {
        if (rule.id in WAIVERS) {
          expect(WAIVERS[rule.id].trim().length, `${rule.id} waiver needs a reason`).toBeGreaterThan(
            0,
          )
        }
      }
      const violations = report.violations.filter((rule) => !(rule.id in WAIVERS))
      expect(violations.map(formatRule).join('\n\n')).toBe('')
    },
    30000,
  )

  it.each(ROUTES)(
    'Tab reaches header controls on $id and Enter activates the primary link',
    async (route) => {
      const { router } = await renderRoute(route.to)
      expect(router.state.location.pathname).toBe(route.pathname)
      if (!browser) throw new Error('chromium was not launched')
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      try {
        const html = renderedDocument()
        await page.setContent(html, { waitUntil: 'load' })
        const names = await headerTabNames(page)
        expect(names, `${route.id} tab sequence`).toEqual(expect.arrayContaining(route.tabStops))
        let previous = -1
        for (const stop of route.tabStops) {
          const index = names.findIndex((name, i) => i > previous && name === stop)
          expect(index, `${route.id} Tab missed "${stop}" in ${names.join(' | ')}`).toBeGreaterThan(
            previous,
          )
          previous = index
        }

        await page.setContent(html, { waitUntil: 'load' })
        await page.evaluate(() => {
          document.addEventListener(
            'click',
            (event) => {
              const target = event.target
              if (!(target instanceof Element)) return
              const anchor = target.closest('a')
              if (!anchor) return
              event.preventDefault()
              ;(window as unknown as { __fgActivated?: string }).__fgActivated =
                anchor.getAttribute('href') ?? ''
            },
            true,
          )
        })
        const header = page.locator('header.fg-nav, header.fg-docs-header').first()
        const primary = header.getByRole('link', { name: route.primaryName })
        let reached = false
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press('Tab')
          reached = await primary.evaluate((el) => el === document.activeElement)
          if (reached) break
        }
        expect(reached, `${route.id} primary link was not reached by Tab`).toBe(true)
        const href = await primary.getAttribute('href')
        expect(href).toBeTruthy()
        await page.keyboard.press('Enter')
        const activated = await page.evaluate(
          () => (window as unknown as { __fgActivated?: string }).__fgActivated ?? '',
        )
        expect(activated).toBe(href)
      } finally {
        await page.close()
      }
    },
    30000,
  )
})
