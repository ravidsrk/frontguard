export const SITE = 'https://frontguard.dev'
export const OG_IMAGE = `${SITE}/og-image.png`
export const TWITTER_SITE = '@ravidsrk'

/** Marketing routes included in sitemap.xml (excluding per-slug docs). */
export const MARKETING_PATHS = [
  '/',
  '/pricing',
  '/comparisons',
  '/changelog',
  '/brand',
  '/docs',
] as const

export type SeoHeadInput = {
  title: string
  description?: string
  /** Route path starting with / (e.g. `/pricing`, `/docs/cli/index`). */
  path: string
  ogType?: 'website' | 'article'
  extraMeta?: Array<Record<string, unknown>>
  scripts?: Array<{ type: string; children: string }>
  robots?: string
}

export function canonicalUrl(path: string): string {
  if (path === '/') return SITE
  return `${SITE}${path}`
}

/** Per-route document head: title, description, canonical, Open Graph, and Twitter card. */
export function buildSeoHead(input: SeoHeadInput) {
  const {
    title,
    description,
    path,
    ogType = 'website',
    extraMeta = [],
    scripts,
    robots,
  } = input
  const canonical = canonicalUrl(path)

  const meta: Array<Record<string, unknown>> = [
    { title },
    ...(description ? [{ name: 'description', content: description }] : []),
    ...(robots ? [{ name: 'robots', content: robots }] : []),
    { property: 'og:title', content: title },
    { property: 'og:url', content: canonical },
    { property: 'og:type', content: ogType },
    { property: 'og:site_name', content: 'Frontguard' },
    { property: 'og:image', content: OG_IMAGE },
    ...(description ? [{ property: 'og:description', content: description }] : []),
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:site', content: TWITTER_SITE },
    { name: 'twitter:creator', content: TWITTER_SITE },
    { name: 'twitter:title', content: title },
    { name: 'twitter:image', content: OG_IMAGE },
    ...(description ? [{ name: 'twitter:description', content: description }] : []),
    ...extraMeta,
  ]

  return {
    meta,
    links: [{ rel: 'canonical', href: canonical }],
    ...(scripts ? { scripts } : {}),
  }
}