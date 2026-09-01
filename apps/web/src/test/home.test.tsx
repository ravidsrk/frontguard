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
        // jsdom 29 renders <br> as display:inline, so the accessible name has no
        // space at the line break; tolerate the missing whitespace.
        name: /^Catch the regression,\s*not the noise\.$/,
      }),
    ).toBeInTheDocument()
  })

  it('renders the published validation limits instead of unsupported market statistics', () => {
    expect(
      screen.getByText('route rechecks completed in the published local harness'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('fixture repositories booted successfully'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('classifier accuracy was not measured in that run'),
    ).toBeInTheDocument()
    expect(screen.getByText('macOS only; cross-OS equivalence remains unproven')).toBeInTheDocument()
  })

  it('renders all nine plugin lifecycle hook names', () => {
    const hooks = screen.getByText(
      /setup · beforeDiscover · afterDiscover · beforeRender · afterRender · afterCompare · afterRun · onError · teardown/,
    )
    expect(hooks).toBeInTheDocument()
  })

  it('shows explicit baseline acceptance in the CLI install flow', () => {
    expect(screen.getByText(/Start your app in another terminal/)).toBeInTheDocument()
    expect(screen.getByText(/frontguard update-baselines/)).toBeInTheDocument()
    expect(screen.getByText(/generated config/)).toHaveTextContent('baseUrl')
    expect(screen.queryByText(/frontguard run --url/)).not.toBeInTheDocument()
  })

  it('gates the unvalidated Action and describes AI as optional assistance', () => {
    expect(screen.queryByText('ravidsrk/frontguard@v0')).not.toBeInTheDocument()
    expect(screen.getByText(/external Action smoke is still pending/i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Optional model-assisted classification for visual diffs/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Kills the #1 pain/i)).not.toBeInTheDocument()
  })

  it('exposes privacy, terms, status, and support paths', () => {
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Status' })).toHaveAttribute('href', '/status')
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute(
      'href',
      'https://github.com/ravidsrk/frontguard/issues',
    )
  })

  it('renders the comparison summary heading and deep link', () => {
    expect(
      screen.getByRole('heading', {
        name: 'Experimental CSS suggestion verification, clearly labeled.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /See all 11 capabilities across 6 tools/i }),
    ).toHaveAttribute('href', '/comparisons')
  })

  it('renders validation harness numbers from the real payload', () => {
    expect(screen.getByRole('heading', { name: /Numbers from a real harness/i })).toBeInTheDocument()
    expect(screen.getAllByText('2 / 5').length).toBeGreaterThan(0)
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
            'Open-source visual regression testing with local pixel comparison and optional model-assisted analysis. MIT-licensed CLI.',
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
      [expect.objectContaining({ name: 'Free CLI', price: '0' })],
    )
    expect(jsonLd).not.toHaveProperty('aggregateRating')
  })
})
