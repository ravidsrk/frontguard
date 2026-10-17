import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Footer } from './Footer'
import { Nav } from './Nav'
import { s } from '../lib/style'

export function InfoPage({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string
  title: string
  summary: string
  children: ReactNode
}) {
  return (
    <div style={s('background: #0d0c0b; color: #c8c0b6; min-height: 100vh;')}>
      <Nav />
      <main id="main-content" style={s('max-width: 820px; margin: 0 auto; padding: 80px 28px 112px;')}>
        <nav
          aria-label="Breadcrumb"
          style={s(
            "font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #a89f94; margin: 0 0 18px; display: flex; align-items: center; gap: 8px;",
          )}
        >
          <Link to="/" className="fg-link" style={s('color: #a89f94; text-decoration: none;')}>
            Home
          </Link>
          <span aria-hidden="true" style={s('color: #a89f94;')}>
            /
          </span>
          <span style={s('color: #e8862e; font-weight: 600;')}>{eyebrow}</span>
        </nav>
        <h1 style={s('font-size: clamp(34px, 5vw, 52px); line-height: 1.08; letter-spacing: -0.035em; color: #f5f1ea; margin: 0 0 20px;')}>
          {title}
        </h1>
        <p style={s('font-size: 18px; line-height: 1.65; color: #c8c0b6; margin: 0 0 44px; max-width: 68ch;')}>
          {summary}
        </p>
        <div className="fg-info-content">{children}</div>
      </main>
      <Footer />
    </div>
  )
}
