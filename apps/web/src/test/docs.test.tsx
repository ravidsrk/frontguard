import { act, cleanup, render, screen, within } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from '../router'
import {
  articles,
  DOC_SLUGS,
  FIRST_DOC_SLUG,
  navGroups,
} from '../lib/docs-content'

async function renderAt(path: string) {
  const router = getRouter()
  await act(async () => {
    await router.navigate({ to: path as '/' })
  })
  const view = render(<RouterProvider router={router} />)
  return { ...view, router }
}

describe('docs content store', () => {
  it('has all 37 articles with unique ids', () => {
    expect(articles).toHaveLength(37)
    expect(new Set(DOC_SLUGS).size).toBe(37)
  })

  it('exposes nav groups covering every article', () => {
    const navIds = navGroups.flatMap((g) => g.ids)
    expect(navIds).toHaveLength(37)
    for (const slug of DOC_SLUGS) {
      expect(navIds).toContain(slug)
    }
    expect(navGroups.some((g) => g.label === 'GETTING STARTED')).toBe(true)
    expect(navGroups.some((g) => g.label === 'CLI')).toBe(true)
    expect(navGroups.some((g) => g.label === 'INTEGRATIONS')).toBe(true)
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
})

describe('docs routes', () => {
  it('redirects /docs to the first article', async () => {
    const router = getRouter()
    await act(async () => {
      await router.navigate({ to: '/docs' })
    })
    expect(router.state.location.pathname).toBe(`/docs/${FIRST_DOC_SLUG}`)
  })

  it('renders every article slug', async () => {
    for (const slug of DOC_SLUGS) {
      const router = getRouter()
      await act(async () => {
        await router.navigate({ to: '/docs/$', params: { _splat: slug } })
      })
      const article = articles.find((a) => a.id === slug)!
      const { container } = render(<RouterProvider router={router} />)
      const el = container.querySelector('article')
      expect(el).toBeTruthy()
      expect(el?.innerHTML.length).toBeGreaterThan(50)
      expect(article.html.length).toBeGreaterThan(50)
      cleanup()
    }
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

  it('renders sidebar nav groups', async () => {
    await renderAt(`/docs/${FIRST_DOC_SLUG}`)
    expect(screen.getByText('GETTING STARTED')).toBeInTheDocument()
    expect(screen.getByText('CLI')).toBeInTheDocument()
    expect(screen.getByText('ON THIS PAGE')).toBeInTheDocument()
  })
})