import { createFileRoute, Link } from '@tanstack/react-router'
import { articles, FIRST_DOC_SLUG } from '../../lib/docs-content'
import { buildSeoHead } from '../../lib/seo'
import { s } from '../../lib/style'

export const Route = createFileRoute('/docs/$')({
  head: ({ params }) => {
    const slug = params._splat
    const article = articles.find((a) => a.id === slug)
    if (!article) {
      return buildSeoHead({
        title: 'Page not found — Frontguard Docs',
        description: 'No docs article matches this path.',
        path: `/docs/${slug}`,
        robots: 'noindex',
      })
    }
    return buildSeoHead({
      title: `${article.label} — Frontguard Docs`,
      description: `Frontguard documentation: ${article.label}. ${article.section} guide for visual regression testing.`,
      path: `/docs/${slug}`,
      ogType: 'article',
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