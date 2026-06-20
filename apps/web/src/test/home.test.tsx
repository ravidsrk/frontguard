import { act, render, screen } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from '../router'
import { Route } from '../routes/index'

describe('home route — real product content', () => {
  beforeEach(async () => {
    const router = getRouter()
    await act(async () => {
      await router.navigate({ to: '/' })
    })
    render(<RouterProvider router={router} />)
  })

  it('renders the hero h1 with exact product copy', () => {
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Catch the regression, not the noise.',
      }),
    ).toBeInTheDocument()
  })

  it('renders all four problem-strip stats', () => {
    expect(
      screen.getByText("of visual-diff runs fail for reasons that aren't real bugs"),
    ).toBeInTheDocument()
    expect(
      screen.getByText('of teams have lost faith in test automation to flake'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('of frontend teams run visual regression testing at all'),
    ).toBeInTheDocument()
    expect(screen.getByText('a single mobile CSS bug cost on Prime Day')).toBeInTheDocument()
  })

  it('renders the six plugin lifecycle hook names', () => {
    const hooks = screen.getByText(/beforeDiscover · afterDiscover · afterRender · afterCompare · afterRun · onError/)
    expect(hooks).toBeInTheDocument()
  })

  it('renders the comparison summary heading and deep link', () => {
    expect(
      screen.getByRole('heading', { name: 'The only one with AI fix verification.' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /See all 11 capabilities across 6 tools/i }),
    ).toHaveAttribute('href', '/comparisons')
  })

  it('renders validation harness numbers from the real payload', () => {
    expect(screen.getByRole('heading', { name: /Numbers from a real harness/i })).toBeInTheDocument()
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
    expect(screen.getAllByTestId('skipped-repo')).toHaveLength(3)
  })
})

describe('home route — SEO head', () => {
  it('sets the product SEO title, description, canonical, social tags, and JSON-LD', async () => {
    const head = await Route.options.head?.({} as never)
    const meta = head?.meta ?? []

    expect(meta).toEqual(
      expect.arrayContaining([
        { title: 'Frontguard — Catch the regression, not the noise' },
        {
          name: 'description',
          content:
            'AI-powered visual regression testing. AI vision tells a real regression from an intentional change or content, so a red run means something again. Open-source CLI under MIT.',
        },
        { property: 'og:url', content: 'https://frontguard.dev' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ]),
    )
    expect(head?.links).toEqual(
      expect.arrayContaining([{ rel: 'canonical', href: 'https://frontguard.dev' }]),
    )

    const jsonLdEntry = meta.find((m): m is Record<string, unknown> => !!m && 'script:ld+json' in m)
    const jsonLd = jsonLdEntry?.['script:ld+json'] as {
      '@type': string
      offers: Array<{ name: string; price: string }>
    }
    expect(jsonLd['@type']).toBe('SoftwareApplication')
    expect(jsonLd.offers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Free CLI', price: '0' }),
        expect.objectContaining({ name: 'Pro', price: '29' }),
      ]),
    )
    expect(jsonLd).not.toHaveProperty('aggregateRating')
  })
})