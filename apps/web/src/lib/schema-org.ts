import { canonicalUrl, SITE } from './seo'
import { REPO_URL } from './site'
import type { Article } from './docs-content'

export const SCHEMA_CONTEXT = 'https://schema.org'
export const ORGANIZATION_ID = `${SITE}/#organization`
export const WEBSITE_ID = `${SITE}/#website`

export type JsonLdNode = Record<string, unknown>

export function jsonLdScript(data: JsonLdNode) {
  return {
    type: 'application/ld+json',
    children: JSON.stringify(data).replace(/</g, '\\u003c'),
  }
}

export const FRONTGUARD_ORGANIZATION = {
  '@context': SCHEMA_CONTEXT,
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: 'Frontguard',
  url: SITE,
  logo: `${SITE}/logo-192.png`,
  description:
    'Frontguard is an open-source visual regression testing tool for frontend teams.',
  founder: {
    '@type': 'Person',
    name: 'Ravindra Kumar',
    url: 'https://github.com/ravidsrk',
  },
  sameAs: [REPO_URL],
}

export const FRONTGUARD_ORGANIZATION_REF = {
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: 'Frontguard',
  url: SITE,
}

export const FRONTGUARD_WEBSITE_REF = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: 'Frontguard',
  url: SITE,
  publisher: FRONTGUARD_ORGANIZATION_REF,
}

export function breadcrumbListJsonLd(items: Array<{ name: string; path: string }>): JsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  }
}

export function docsArticleDescription(article: Pick<Article, 'label' | 'section'>): string {
  return `Frontguard documentation: ${article.label}. ${article.section} guide for visual regression testing.`
}
