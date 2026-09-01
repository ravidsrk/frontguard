import type { ReactNode } from 'react'
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
    <div style={s('background: #0d0c0b; color: #b8b0a6; min-height: 100vh;')}>
      <Nav />
      <main style={s('max-width: 820px; margin: 0 auto; padding: 88px 28px 112px;')}>
        <p style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #e8862e; letter-spacing: 0.09em; margin: 0 0 16px;")}>
          // {eyebrow}
        </p>
        <h1 style={s('font-size: clamp(38px, 7vw, 64px); line-height: 1; letter-spacing: -0.045em; color: #f5f1ea; margin: 0 0 22px;')}>
          {title}
        </h1>
        <p style={s('font-size: 18px; line-height: 1.65; color: #c8c0b6; margin: 0 0 44px; max-width: 700px;')}>
          {summary}
        </p>
        <div className="fg-info-content">{children}</div>
      </main>
      <Footer />
    </div>
  )
}
