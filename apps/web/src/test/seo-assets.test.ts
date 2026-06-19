import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOC_SLUGS } from '../lib/docs-content'
import { MARKETING_PATHS, OG_IMAGE, SITE } from '../lib/seo'
import { Route as BrandRoute } from '../routes/brand'
import { Route as ChangelogRoute } from '../routes/changelog'
import { Route as ComparisonsRoute } from '../routes/comparisons'
import { Route as DocsRoute } from '../routes/docs'
import { Route as DocArticleRoute } from '../routes/docs/$'
import { Route as HomeRoute } from '../routes/index'
import { Route as PricingRoute } from '../routes/pricing'
import { Route as RootRoute } from '../routes/__root'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.resolve(__dirname, '../../public')

function readPublic(name: string) {
  return fs.readFileSync(path.join(PUBLIC, name), 'utf8')
}

function expectSeoHead(head: { meta?: unknown[]; links?: unknown[] } | undefined, canonicalPath: string) {
  const meta = (head?.meta ?? []) as Array<Record<string, string>>
  const links = (head?.links ?? []) as Array<Record<string, string>>

  const canonical =
    canonicalPath === '/'
      ? SITE
      : `${SITE}${canonicalPath}`

  expect(links).toEqual(expect.arrayContaining([{ rel: 'canonical', href: canonical }]))
  expect(meta).toEqual(
    expect.arrayContaining([
      { property: 'og:url', content: canonical },
      { property: 'og:image', content: OG_IMAGE },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:type', content: expect.any(String) },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: '@ravidsrk' },
      { name: 'twitter:creator', content: '@ravidsrk' },
      { name: 'twitter:image', content: OG_IMAGE },
    ]),
  )
  expect(meta.some((m) => m.property === 'og:title' && m.content)).toBe(true)
  expect(meta.some((m) => m.name === 'twitter:title' && m.content)).toBe(true)
}

describe('public SEO assets', () => {
  it('serves og-image.png and llms.txt', () => {
    expect(fs.existsSync(path.join(PUBLIC, 'og-image.png'))).toBe(true)
    expect(fs.statSync(path.join(PUBLIC, 'og-image.png')).size).toBeGreaterThan(10_000)
    const llms = readPublic('llms.txt')
    expect(llms).toContain('https://frontguard.dev/docs')
    expect(llms).toContain('ravidsrk/frontguard@v0')
    expect(llms).not.toContain('ravidsrk/frontguard@v1')
  })

  it('robots.txt references the sitemap', () => {
    const robots = readPublic('robots.txt')
    expect(robots).toContain('Sitemap: https://frontguard.dev/sitemap.xml')
  })

  it('sitemap.xml lists all marketing routes and doc slugs', () => {
    const sitemap = readPublic('sitemap.xml')
    const locCount = (sitemap.match(/<loc>/g) ?? []).length
    expect(locCount).toBe(43)
    for (const route of MARKETING_PATHS) {
      const loc = route === '/' ? `${SITE}/` : `${SITE}${route}`
      expect(sitemap, `missing ${loc}`).toContain(`<loc>${loc}</loc>`)
    }
    for (const slug of DOC_SLUGS) {
      expect(sitemap, `missing /docs/${slug}`).toContain(`<loc>${SITE}/docs/${slug}</loc>`)
    }
    expect(sitemap).not.toContain('docs.frontguard.dev')
    expect(sitemap).not.toContain('/docs/introduction')
    expect(sitemap).not.toContain('/docs/self-hosting')
  })
})

describe('root route — global head', () => {
  it('includes sized favicons, apple-touch-icon, and global meta tags', async () => {
    const head = await RootRoute.options.head?.({} as never)
    const meta = (head?.meta ?? []) as Array<Record<string, string>>
    const links = (head?.links ?? []) as Array<Record<string, string>>

    expect(links).toEqual(
      expect.arrayContaining([
        { rel: 'icon', href: '/logo-16.png', type: 'image/png', sizes: '16x16' },
        { rel: 'icon', href: '/logo-32.png', type: 'image/png', sizes: '32x32' },
        { rel: 'apple-touch-icon', href: '/logo-180.png' },
      ]),
    )
    expect(meta).toEqual(
      expect.arrayContaining([
        { name: 'theme-color', content: '#0d0c0b' },
        { name: 'author', content: 'Ravindra Kumar' },
        {
          name: 'keywords',
          content:
            'visual regression testing, AI visual testing, Playwright, Storybook visual testing, frontend testing, CSS regression, screenshot testing, open source visual testing, MCP server',
        },
        { name: 'referrer', content: 'strict-origin-when-cross-origin' },
        { httpEquiv: 'X-Content-Type-Options', content: 'nosniff' },
      ]),
    )
  })
})

describe('route SEO head', () => {
  it('home exposes canonical, OG, Twitter, and SoftwareApplication JSON-LD', async () => {
    const head = await HomeRoute.options.head?.({} as never)
    expectSeoHead(head, '/')
    const meta = head?.meta as Array<Record<string, unknown>>
    const jsonLd = meta.find((m) => 'script:ld+json' in m)?.['script:ld+json'] as {
      '@type': string
    }
    expect(jsonLd['@type']).toBe('SoftwareApplication')
  })

  it('pricing exposes canonical, OG, Twitter, and FAQPage JSON-LD script', async () => {
    const head = await PricingRoute.options.head?.({} as never)
    expectSeoHead(head, '/pricing')
    expect(head?.scripts?.[0]?.type).toBe('application/ld+json')
  })

  it('comparisons, changelog, and brand expose canonical + OG + Twitter', async () => {
    for (const [route, path] of [
      [ComparisonsRoute, '/comparisons'],
      [ChangelogRoute, '/changelog'],
      [BrandRoute, '/brand'],
    ] as const) {
      const head = await route.options.head?.({} as never)
      expectSeoHead(head, path)
    }
  })

  it('docs layout and article routes expose canonical + OG + Twitter', async () => {
    const docsHead = await DocsRoute.options.head?.({} as never)
    expectSeoHead(docsHead, '/docs')

    const articleHead = await DocArticleRoute.options.head?.({
      params: { _splat: 'installation' },
    } as never)
    expectSeoHead(articleHead, '/docs/installation')
    const meta = articleHead?.meta as Array<Record<string, string>>
    expect(meta).toEqual(expect.arrayContaining([{ property: 'og:type', content: 'article' }]))
  })
})