import { useEffect, useRef, useState } from 'react'
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
import { copyText } from '../../lib/clipboard'

const docArticlePath = (slug: string) => `/docs/${slug}`
const docArticleTitle = (article: Article) => `${article.label} — Frontguard Docs`

const QUICK_TRACKS: { label: string; slug: string }[] = [
  { label: 'Quick Start', slug: 'quick-start' },
  { label: 'CLI Commands', slug: 'cli/commands' },
  { label: 'Configuration', slug: 'cli/configuration' },
  { label: 'Playwright API', slug: 'playwright/api' },
  { label: 'MCP Server', slug: 'integrations/mcp' },
  { label: 'GitHub Actions', slug: 'guides/github-actions' },
]

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
        path: docArticlePath(slug ?? ''),
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
  const articleRef = useRef<HTMLDivElement>(null)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [copyErrorSlug, setCopyErrorSlug] = useState<string | null>(null)
  const pageCopyAttempt = useRef({ value: 0 })
  const pageCopyTimer = useRef<number | undefined>(undefined)
  const activeId = idx !== -1 ? articles[idx]?.id : undefined
  const copiedPage = Boolean(activeId && copiedSlug === activeId)
  const copyFailed = Boolean(activeId && copyErrorSlug === activeId)

  useEffect(() => () => {
    window.clearTimeout(pageCopyTimer.current)
  }, [])

  useEffect(() => {
    const root = articleRef.current
    if (!root || !activeId) return
    const timers: number[] = []
    const createdButtons: HTMLButtonElement[] = []
    const pageAttempt = pageCopyAttempt.current
    let disposed = false

    const pres = root.querySelectorAll('pre')
    pres.forEach((pre) => {
      const header = pre.previousElementSibling as HTMLElement | null
      const target = header ?? pre.parentElement
      if (!target || target.querySelector('.fg-code-copy-btn')) return

      if (header) {
        header.style.display = 'flex'
        header.style.alignItems = 'center'
        header.style.justifyContent = 'space-between'
        header.style.gap = '12px'
      }

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'fg-code-copy-btn fg-btn-ghost'
      btn.setAttribute('aria-label', 'Copy code snippet')
      btn.setAttribute('aria-live', 'polite')
      btn.textContent = 'Copy'
      btn.style.cssText =
        "font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #c8c0b6; background: #1f1c19; border: 1px solid #322d28; padding: 4px 10px; cursor: pointer;"

      let attempt = 0
      let feedbackTimer: number | undefined
      btn.addEventListener('click', async () => {
        const request = ++attempt
        window.clearTimeout(feedbackTimer)
        btn.textContent = 'Copy'
        const text = pre.textContent ?? ''
        const copied = await copyText(text)
        if (disposed || request !== attempt) return
        btn.textContent = copied ? 'Copied ✓' : 'Copy failed'
        feedbackTimer = window.setTimeout(() => {
          btn.textContent = 'Copy'
        }, 1800)
        timers.push(feedbackTimer)
      })

      target.appendChild(btn)
      createdButtons.push(btn)
    })

    return () => {
      disposed = true
      pageAttempt.value++
      timers.forEach((t) => window.clearTimeout(t))
      createdButtons.forEach((b) => b.remove())
    }
  }, [activeId])

  if (idx === -1) {
    return (
      <div style={s('padding: 40px 0;')}>
        <h1 style={s('font-size: 32px; font-weight: 700; color: #f5f1ea; margin: 0 0 12px;')}>Page not found</h1>
        <p style={s('font-size: 15px; color: #c8c0b6; margin: 0 0 20px;')}>No docs article matches “{slug}”.</p>
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

  const handleCopyArticle = async () => {
    const request = ++pageCopyAttempt.current.value
    const targetSlug = cur.id
    window.clearTimeout(pageCopyTimer.current)
    setCopiedSlug(null)
    setCopyErrorSlug(null)
    const text = articleRef.current?.innerText ?? articleRef.current?.textContent ?? ''
    const copied = await copyText(text)
    if (request !== pageCopyAttempt.current.value) return
    if (!copied) {
      setCopyErrorSlug(targetSlug)
      return
    }
    setCopiedSlug(targetSlug)
    pageCopyTimer.current = window.setTimeout(() => setCopiedSlug((prevSlug) => (prevSlug === targetSlug ? null : prevSlug)), 1800)
  }

  return (
    <>
      <div
        style={s(
          'display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-bottom: 16px; margin-bottom: 20px; border-bottom: 1px solid #211e1b;',
        )}
      >
        <span
          style={s(
            `font-family: ${MONO}; font-size: 12px; color: #a89f94; letter-spacing: 0.06em; text-transform: uppercase; margin-right: 6px;`,
          )}
        >
          JUMP TO:
        </span>
        {QUICK_TRACKS.map((track) => {
          const isCurrent = cur.id === track.slug
          return (
            <Link
              key={track.slug}
              to="/docs/$"
              params={{ _splat: track.slug }}
              style={s(
                `font-family: ${MONO}; font-size: 12px; padding: 4px 10px; border-radius: 4px; text-decoration: none; border: 1px solid ${isCurrent ? '#e8862e' : '#2a2622'}; background: ${isCurrent ? '#1a130b' : '#131210'}; color: ${isCurrent ? '#e8862e' : '#c8c0b6'};`,
              )}
            >
              {track.label}
            </Link>
          )
        })}
      </div>

      <div
        style={s(
          'display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px;',
        )}
      >
        <div style={s(`font-family: ${MONO}; font-size: 12px; color: #a89f94;`)}>
          <span style={s('color: #e8862e;')}>{cur.section}</span> / {cur.label}
          <span style={s('color: #a89f94; margin-left: 10px;')}>
            ({idx + 1} of {articles.length})
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopyArticle}
          aria-label="Copy article content"
          aria-live="polite"
          style={s(
            `font-family: ${MONO}; font-size: 12px; color: ${copiedPage ? '#4fb477' : '#c8c0b6'}; background: #141210; border: 1px solid ${copiedPage ? '#255c3b' : '#2a2622'}; border-radius: 4px; padding: 4px 10px; cursor: pointer;`,
          )}
        >
          {copiedPage ? 'Copied page ✓' : copyFailed ? 'Copy failed — retry' : 'Copy page text'}
        </button>
      </div>

      <div ref={articleRef}>
        <article key={cur.id} dangerouslySetInnerHTML={{ __html: cur.html }} />
      </div>

      <div className="fg-docs-pagination" style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding-top: 28px; margin-top: 32px; border-top: 1px solid #211e1b;')}>
        {prev ? (
          <Link to="/docs/$" params={{ _splat: prev.id }} className="fg-link" style={s('border: 1px solid #2a2622; border-radius: 6px; background: #121110; padding: 18px 20px; text-decoration: none;')}>
            <div style={s(`font-family: ${MONO}; font-size: 12px; color: #a89f94; margin-bottom: 6px;`)}>← PREVIOUS</div>
            <div className="fg-link-title" style={s('font-size: 15px; color: #d8d0c5;')}>{prev.label}</div>
          </Link>
        ) : (
          <span style={s('border: 1px dashed #2a2622; border-radius: 6px; background: #100f0e; padding: 18px 20px;')}>
            <div style={s(`font-family: ${MONO}; font-size: 12px; color: #a89f94; margin-bottom: 6px;`)}>← PREVIOUS</div>
            <div style={s('font-size: 15px; color: #b8b0a6;')}>Overview</div>
          </span>
        )}
        {next ? (
          <Link to="/docs/$" params={{ _splat: next.id }} className="fg-link" style={s('border: 1px solid #2a2622; border-radius: 6px; background: #121110; padding: 18px 20px; text-decoration: none; text-align: right;')}>
            <div style={s(`font-family: ${MONO}; font-size: 12px; color: #a89f94; margin-bottom: 6px;`)}>NEXT →</div>
            <div className="fg-link-title" style={s('font-size: 15px; color: #d8d0c5;')}>{next.label}</div>
          </Link>
        ) : (
          <span style={s('border: 1px dashed #2a2622; border-radius: 6px; background: #100f0e; padding: 18px 20px; text-align: right;')}>
            <div style={s(`font-family: ${MONO}; font-size: 12px; color: #a89f94; margin-bottom: 6px;`)}>NEXT →</div>
            <div style={s('font-size: 15px; color: #b8b0a6;')}>You&apos;re all caught up</div>
          </span>
        )}
      </div>
    </>
  )
}

