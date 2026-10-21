import { createRequire } from 'node:module'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { chromium, type Browser } from 'playwright'
import { getRouter } from '../router'
import { FIRST_DOC_SLUG } from '../lib/docs-content'
import siteCss from '../styles.css?raw'

/**
 * Marketing-site accessibility check for issue #297.
 * axe-core runs in Chromium against the routed page markup. This is not the
 * CLI accessibility plugin, and it does not gate pixelmatch.
 *
 * Keyboard pass — keys exercised:
 * - Tab through the header (skip link, brand, primary nav)
 * - Enter activates the primary link
 * The test fails if that control is not in the tab sequence.
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

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

let browser: Browser | undefined

function accessibleName(el: HTMLElement): string {
  return (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function isHidden(el: HTMLElement): boolean {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return true
  if (el.closest('[hidden], [aria-hidden="true"]')) return true
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = window.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return true
  }
  return false
}

function tabbables(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => {
    if (el.tabIndex < 0) return false
    return !isHidden(el)
  })
}

/** Move focus as Tab would and dispatch the key. Returns the newly focused control. */
function pressTab(): HTMLElement | null {
  const items = tabbables()
  const current = document.activeElement
  const start = current instanceof HTMLElement ? items.indexOf(current) : -1
  const next = items[start + 1]
  if (!next) return null
  if (current instanceof HTMLElement) {
    fireEvent.keyDown(current, { key: 'Tab', code: 'Tab' })
  }
  next.focus()
  return document.activeElement instanceof HTMLElement ? document.activeElement : null
}

function tabThrough(header: HTMLElement): HTMLElement[] {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  const visited: HTMLElement[] = []
  for (let i = 0; i < 40; i++) {
    const next = pressTab()
    if (!next) break
    const inside = header.contains(next)
    const before = Boolean(
      header.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_PRECEDING,
    )
    if (!inside && !before) break
    visited.push(next)
  }
  return visited
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

      const header = siteHeader()
      const primary = within(header).getByRole('link', { name: route.primaryName })
      expect(primary.tabIndex, `${route.id} primary link is not tabbable`).toBeGreaterThanOrEqual(0)

      const visited = tabThrough(header)
      const names = visited.map(accessibleName)
      expect(visited, `${route.id} tab sequence: ${names.join(' | ')}`).toContain(primary)

      let previous = -1
      for (const stop of route.tabStops) {
        const index = names.findIndex((name, i) => i > previous && name === stop)
        expect(index, `${route.id} Tab missed "${stop}" in ${names.join(' | ')}`).toBeGreaterThan(
          previous,
        )
        previous = index
      }

      const href = primary.getAttribute('href')
      expect(href).toBeTruthy()
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      let landed: HTMLElement | null = null
      for (let i = 0; i < 40; i++) {
        const next = pressTab()
        if (!next) break
        if (next === primary) {
          landed = next
          break
        }
      }
      expect(landed, `${route.id} primary link was not reached by Tab`).toBe(primary)
      expect(document.activeElement).toBe(primary)
      await act(async () => {
        fireEvent.keyDown(primary, { key: 'Enter', code: 'Enter' })
        fireEvent.click(primary)
      })
      expect(router.state.location.pathname).toBe(href)
    },
    20000,
  )
})
