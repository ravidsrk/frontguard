import { act, cleanup, render, screen, within } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from '../router'
import {
  articles,
  DOC_SLUGS,
  FIRST_DOC_SLUG,
  navGroups,
} from '../lib/docs-content'

const EXPECTED_NAV_LABELS = [
  'GETTING STARTED',
  'REFERENCE',
  'CI/CD',
  'GUIDES — FEATURES',
  'GUIDES — EXTENDING',
  'GUIDES — MIGRATION',
  'INTEGRATIONS',
  'COMPARISONS',
  'DEPLOYMENT & SANDBOXING',
  'TRUST',
]

async function renderAt(path: string) {
  const router = getRouter()
  await act(async () => {
    await router.navigate({ to: path as '/' })
  })
  const view = render(<RouterProvider router={router} />)
  return { ...view, router }
}

async function renderArticle(slug: string) {
  const router = getRouter()
  await act(async () => {
    await router.navigate({ to: '/docs/$', params: { _splat: slug } })
  })
  const view = render(<RouterProvider router={router} />)
  const article = view.container.querySelector('article')
  return { ...view, article, html: article?.innerHTML ?? '' }
}

function assertNoRawMarkdownArtifacts(html: string, slug: string) {
  expect(html, `${slug}: triple-backtick`).not.toContain('```')
  expect(html, `${slug}: <script`).not.toMatch(/<script/i)
  expect(html, `${slug}: markdown link`).not.toMatch(/\[[^\]]+\]\([^)]+\)/)
  expect(html, `${slug}: raw **bold**`).not.toMatch(/\*\*[^*]+\*\*/)
}

describe('docs content store', () => {
  it('has all 37 articles with unique ids', () => {
    expect(articles).toHaveLength(37)
    expect(new Set(DOC_SLUGS).size).toBe(37)
  })

  it('exposes nav groups matching the real docs section tree', () => {
    const navIds = navGroups.flatMap((g) => g.ids)
    expect(navIds).toHaveLength(37)
    expect(navGroups.map((g) => g.label)).toEqual(EXPECTED_NAV_LABELS)

    const reference = navGroups.find((g) => g.label === 'REFERENCE')
    expect(reference?.ids).toEqual([
      'cli/index',
      'cli/commands',
      'cli/configuration',
      'playwright/index',
      'playwright/setup',
      'playwright/api',
    ])

    const comparisons = navGroups.find((g) => g.label === 'COMPARISONS')
    expect(comparisons?.ids).toHaveLength(3)

    for (const slug of DOC_SLUGS) {
      expect(navIds).toContain(slug)
    }
  })

  it('has no raw-markdown artifacts in any article body', () => {
    for (const article of articles) {
      assertNoRawMarkdownArtifacts(article.html, article.id)
    }
  })

  it('has no broken internal doc links', () => {
    const slugs = new Set(DOC_SLUGS)
    const linkRe = /href="(\/docs\/[^"#?]+)"/g
    for (const article of articles) {
      let m
      while ((m = linkRe.exec(article.html)) !== null) {
        const href = m[1].replace(/^\/docs\//, '')
        expect(slugs.has(href)).toBe(true)
      }
    }
  })

  it('fixes netlify github-app link to integrations/github', () => {
    const netlify = articles.find((a) => a.id === 'integrations/netlify')
    expect(netlify?.html).toContain('/docs/integrations/github')
    expect(netlify?.html).not.toContain('/docs/integrations/github-app')
  })

  it('uses @v0 for frontguard action refs in workflow examples', () => {
    const ghActions = articles.find((a) => a.id === 'ci-cd/github-actions')
    expect(ghActions?.html).toContain('ravidsrk/frontguard@v0')
    expect(ghActions?.html).not.toMatch(/ravidsrk\/frontguard@(v1|main)/)
  })

  it('cross-os-rendering doc gates --docker on local build and image preflight', () => {
    const crossOs = articles.find((a) => a.id === 'cross-os-rendering')!
    expect(crossOs.html).toContain('not yet published')
    expect(crossOs.html).toContain('docker image inspect')
    expect(crossOs.html).toContain('docker manifest inspect')
    expect(crossOs.html).toContain('Building the image locally')
    expect(crossOs.html).not.toContain('Docker will pull')
    expect(crossOs.html).not.toMatch(/first pull on a cold machine/i)
  })

  it('marks Cloud API URL as required on integration docs (no live hosted default)', () => {
    for (const id of [
      'integrations/netlify',
      'integrations/vercel',
      'integrations/slack',
      'integrations/mcp',
      'guides/cloud-api',
      'distribution',
    ] as const) {
      const article = articles.find((a) => a.id === id)
      expect(article?.html, id).toMatch(/Cloud API URL required|Self-host or bring your own API URL|no working hosted default/i)
      expect(article?.html, id).not.toContain('apiUrl = &quot;https://api.frontguard.dev&quot;')
      expect(article?.html, id).not.toContain('apiUrl   = &quot;https://api.frontguard.dev&quot;')
    }
  })

  it('documents the repo-root action shim for marketplace consumers', () => {
    const ghActions = articles.find((a) => a.id === 'ci-cd/github-actions')
    expect(ghActions?.html).toMatch(/action\.yml/i)
  })

  it('hedges marketplace listings on integration docs (no live 404 URLs)', () => {
    const deadUrls = [
      'github.com/marketplace/frontguard',
      'github.com/apps/frontguard',
      'frontguard/frontguard-action',
    ]
    for (const id of [
      'integrations/github',
      'integrations/slack',
      'integrations/vercel',
      'integrations/netlify',
      'distribution',
    ] as const) {
      const article = articles.find((a) => a.id === id)!
      expect(article.html, id).toMatch(/in review|Coming soon/i)
      for (const dead of deadUrls) {
        expect(article.html, `${id}:${dead}`).not.toContain(dead)
      }
    }
  })

  it('pins bootstrap workflow examples to @v0 on the GitHub App doc', () => {
    const github = articles.find((a) => a.id === 'integrations/github')
    expect(github?.html).toContain('ravidsrk/frontguard@v0')
    expect(github?.html).not.toMatch(/ravidsrk\/frontguard@(v1|main)/)
  })

  it('has no C15 hygiene violations across all articles', () => {
    const allHtml = articles.map((a) => a.html).join('\n')
    expect(allHtml).not.toMatch(/--baseline-strategy\b/)
    expect(allHtml).not.toMatch(/--ai\b/)
    expect(allHtml).not.toContain('frontguard approve')
    expect(allHtml).not.toContain('scheduled-monitors')
    expect(allHtml).not.toMatch(/guides\/frontguard-vs-(percy|chromatic)/)
    expect(allHtml).not.toContain('Docker will pull')
    expect(allHtml).not.toContain('docs.frontguard.dev')
  })

  it('registers deployment pages in the sidebar nav', () => {
    const deployment = navGroups.find((g) => g.label === 'DEPLOYMENT & SANDBOXING')
    expect(deployment?.ids).toEqual([
      'self-host',
      'sandbox',
      'cross-os-rendering',
      'distribution',
    ])
  })

  it('gates self-host behind build-from-source (no published GHCR image)', () => {
    const selfHost = articles.find((a) => a.id === 'self-host')!
    expect(selfHost.html).toContain('build from source')
    expect(selfHost.html).toContain('not published yet')
    expect(selfHost.html).toContain('&quot;version&quot;:&quot;0.2.0&quot;')
    expect(selfHost.html).not.toContain('&quot;version&quot;:&quot;0.1.0&quot;')
  })

  it('storybook CI recipe uses only real CLI flags', () => {
    const storybook = articles.find((a) => a.id === 'integrations/storybook')!
    expect(storybook.html).not.toMatch(/--baseline-strategy\b/)
    expect(storybook.html).not.toMatch(/--ai\b/)
    expect(storybook.html).toContain('verify-fixes')
  })

  it('cross-os-rendering labels playwright setup correctly', () => {
    const crossOs = articles.find((a) => a.id === 'cross-os-rendering')!
    expect(crossOs.html).toContain('Playwright plugin setup')
    expect(crossOs.html).toContain('/docs/playwright/setup')
    expect(crossOs.html).not.toContain('Cloud API: setup')
  })
})

describe('docs article HTML quality', () => {
  it('installation article has table, code blocks, and converted inline code', () => {
    const article = articles.find((a) => a.id === 'installation')!
    expect(article.html).toContain('<table')
    expect(article.html).toContain('<pre')
    expect(article.html).toContain('<code')
    expect(article.html).toContain('<h2')
    expect(article.html).not.toContain('`@frontguard/cli`')
  })

  it('cli/commands article has styled headings and code fences', () => {
    const article = articles.find((a) => a.id === 'cli/commands')!
    expect(article.html).toContain('<h2')
    expect(article.html).toContain('<pre')
    expect(article.html).toContain('<table')
    expect(article.html).toContain('<strong')
  })

  it('comparison article has no script tag and renders FAQ content as HTML', () => {
    const article = articles.find((a) => a.id === 'comparisons/frontguard-vs-argos')!
    expect(article.html).not.toMatch(/<script/i)
    expect(article.html).toContain('<h1')
    expect(article.html).toContain('<h2')
    expect(article.html).toContain('<table')
    expect(article.html).toContain('<strong')
    expect(article.html).toContain('Argos')
  })
})

describe('docs routes', () => {
  it('redirects /docs to the first article', async () => {
    const router = getRouter()
    await act(async () => {
      await router.navigate({ to: '/docs' })
    })
    expect(router.state.location.pathname).toBe(`/docs/${FIRST_DOC_SLUG}`)
  })

  it('renders every article slug with real HTML elements', async () => {
    for (const slug of DOC_SLUGS) {
      const { html } = await renderArticle(slug)
      expect(html.length).toBeGreaterThan(50)
      expect(html).toContain('<h1')
      assertNoRawMarkdownArtifacts(html, slug)
      cleanup()
    }
  })

  it('renders representative articles with expected DOM structure', async () => {
    const { html: installHtml } = await renderArticle('installation')
    expect(installHtml).toContain('<table')
    expect(installHtml).toContain('<pre')
    cleanup()

    const { html: compareHtml } = await renderArticle('comparisons/frontguard-vs-argos')
    expect(compareHtml).toContain('<h2')
    expect(compareHtml).not.toMatch(/<script/i)
    cleanup()

    const { html: cliHtml } = await renderArticle('cli/commands')
    expect(cliHtml).toContain('<code')
    expect(cliHtml).toContain('<table')
    cleanup()
  })

  it('shows 404 fallback for unknown slug', async () => {
    await renderAt('/docs/this-slug-does-not-exist')
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.getByText(/no docs article matches/i)).toBeInTheDocument()
  })

  it('disables prev at the first article and next at the last', async () => {
    const first = articles[0]
    const last = articles[articles.length - 1]

    const { container: firstView } = await renderAt(`/docs/${first.id}`)
    expect(within(firstView).getByText('Overview')).toBeInTheDocument()
    expect(within(firstView).getByText('NEXT →')).toBeInTheDocument()
    expect(within(firstView).getByText(articles[1].label, { selector: '.fg-link-title' })).toBeInTheDocument()

    cleanup()
    const { container: lastView } = await renderAt(`/docs/${last.id}`)
    expect(within(lastView).getByText(/all caught up/i)).toBeInTheDocument()
    expect(
      within(lastView).getByText(articles[articles.length - 2].label, { selector: '.fg-link-title' }),
    ).toBeInTheDocument()
  })

  it('renders sidebar nav groups from the corrected structure', async () => {
    await renderAt(`/docs/${FIRST_DOC_SLUG}`)
    for (const label of ['GETTING STARTED', 'REFERENCE', 'CI/CD', 'COMPARISONS', 'TRUST']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('ON THIS PAGE')).toBeInTheDocument()
  })
})