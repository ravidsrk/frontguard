import { createFileRoute, Link } from '@tanstack/react-router'
import { articles, FIRST_DOC_SLUG, type Article } from '../../lib/docs-content'
import { buildSeoHead, canonicalUrl } from '../../lib/seo'
import {
  FRONTGUARD_ORGANIZATION_REF,
  FRONTGUARD_WEBSITE_REF,
  breadcrumbListJsonLd,
  docsArticleDescription,
  jsonLdScript,
} from '../../lib/schema-org'
import { s } from '../../lib/style'

const docArticlePath = (slug: string) => `/docs/${slug}`
const docArticleTitle = (article: Article) => `${article.label} — Frontguard Docs`

function docArticleJsonLd(article: Article) {
  const path = docArticlePath(article.id)
  const canonical = canonicalUrl(path)
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${canonical}#techarticle`,
    name: article.label,
    headline: article.label,
    description: docsArticleDescription(article),
    articleSection: article.section,
    keywords: article.toc.join(', '),
    url: canonical,
    mainEntityOfPage: canonical,
    isPartOf: FRONTGUARD_WEBSITE_REF,
    author: FRONTGUARD_ORGANIZATION_REF,
    publisher: FRONTGUARD_ORGANIZATION_REF,
  }
}

function docArticleBreadcrumbJsonLd(article: Article) {
  return breadcrumbListJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Documentation', path: '/docs' },
    { name: article.label, path: docArticlePath(article.id) },
  ])
}

export const Route = createFileRoute('/docs/$')({
  head: ({ params }) => {
    const slug = params._splat
    const article = articles.find((a) => a.id === slug)
    if (!article) {
      return buildSeoHead({
        title: 'Page not found — Frontguard Docs',
        description: 'No docs article matches this path.',
        path: docArticlePath(slug),
        robots: 'noindex',
      })
    }
    return buildSeoHead({
      title: docArticleTitle(article),
      description: docsArticleDescription(article),
      path: docArticlePath(article.id),
      ogType: 'article',
      scripts: [
        jsonLdScript(docArticleJsonLd(article)),
        jsonLdScript(docArticleBreadcrumbJsonLd(article)),
      ],
    })
  },
  component: DocArticle,
})

const MONO = "'JetBrains Mono', monospace"

function DocArticle() {
  const { _splat: slug } = Route.useParams()
  const idx = articles.findIndex((a) => a.id === slug)

  if (idx === -1) {
    return (
      <div style={s('padding: 40px 0;')}>
        <h1 style={s('font-size: 32px; font-weight: 700; color: #f5f1ea; margin: 0 0 12px;')}>Page not found</h1>
        <p style={s('font-size: 15px; color: #b8b0a6; margin: 0 0 20px;')}>No docs article matches “{slug}”.</p>
        <Link
          to="/docs/$"
          params={{ _splat: FIRST_DOC_SLUG }}
          className="fg-btn-primary"
          style={s(`display: inline-block; background: #e8862e; color: #0d0c0b; font-family: ${MONO}; font-weight: 700; font-size: 13px; padding: 12px 18px; text-decoration: none;`)}
        >
          ← Back to Getting Started
        </Link>
      </div>
    )
  }

  const cur = articles[idx]
  const prev = articles[idx - 1]
  const next = articles[idx + 1]

  return (
    <>
      <div style={s(`font-family: ${MONO}; font-size: 12px; color: #7c746b; margin-bottom: 18px;`)}>
        <span style={s('color: #e8862e;')}>{cur.section}</span> / {cur.label}
      </div>

      <article dangerouslySetInnerHTML={{ __html: cur.html }} />

      <div style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding-top: 28px; margin-top: 16px; border-top: 1px solid #211e1b;')}>
        {prev ? (
          <Link to="/docs/$" params={{ _splat: prev.id }} className="fg-link" style={s('border: 1px solid #2a2622; padding: 18px 20px; text-decoration: none;')}>
            <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; margin-bottom: 6px;`)}>← PREVIOUS</div>
            <div className="fg-link-title" style={s('font-size: 15px; color: #d8d0c5;')}>{prev.label}</div>
          </Link>
        ) : (
          <span style={s('border: 1px solid #2a2622; padding: 18px 20px; opacity: 0.4;')}>
            <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; margin-bottom: 6px;`)}>← PREVIOUS</div>
            <div style={s('font-size: 15px; color: #d8d0c5;')}>Overview</div>
          </span>
        )}
        {next ? (
          <Link to="/docs/$" params={{ _splat: next.id }} className="fg-link" style={s('border: 1px solid #2a2622; padding: 18px 20px; text-decoration: none; text-align: right;')}>
            <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; margin-bottom: 6px;`)}>NEXT →</div>
            <div className="fg-link-title" style={s('font-size: 15px; color: #d8d0c5;')}>{next.label}</div>
          </Link>
        ) : (
          <span style={s('border: 1px solid #2a2622; padding: 18px 20px; text-align: right; opacity: 0.4;')}>
            <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; margin-bottom: 6px;`)}>NEXT →</div>
            <div style={s('font-size: 15px; color: #d8d0c5;')}>You&apos;re all caught up</div>
          </span>
        )}
      </div>
    </>
  )
}
