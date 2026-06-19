import { Link } from '@tanstack/react-router'
import { Shield } from './Shield'
import { s } from '../lib/style'

const MONO = "'JetBrains Mono', monospace"

/** Amber-branded 404 — mirrors apps/landing/public/404.html design tokens. */
export function NotFound() {
  return (
    <div
      style={s(
        'background: #0d0c0b; color: #b8b0a6; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;',
      )}
    >
      <main style={s('width: 100%; max-width: 32rem; text-align: center;')}>
        <span style={s('display: inline-block; margin-bottom: 28px;')}>
          <Shield w={47} h={56} />
        </span>
        <p
          style={s(
            `font-family: ${MONO}; font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; color: #e8862e; margin: 0 0 12px;`,
          )}
        >
          Error 404
        </p>
        <h1
          style={s(
            'font-size: clamp(1.75rem, 6vw, 2.5rem); font-weight: 700; letter-spacing: -0.02em; color: #f5f1ea; margin: 0 0 14px; line-height: 1.1;',
          )}
        >
          This page didn&apos;t render.
        </h1>
        <p style={s('font-size: 16px; line-height: 1.6; color: #b8b0a6; margin: 0 auto 32px; max-width: 26rem;')}>
          The address you followed doesn&apos;t exist. Frontguard catches the visual regressions that do — head
          back and pick up where you left off.
        </p>
        <div style={s('display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;')}>
          <Link
            to="/"
            className="fg-btn-primary"
            style={s(
              `background: #e8862e; color: #0d0c0b; font-family: ${MONO}; font-weight: 700; font-size: 14px; padding: 11px 22px; text-decoration: none;`,
            )}
          >
            Back to home
          </Link>
          <Link
            to="/docs"
            className="fg-btn-ghost"
            style={s(
              `border: 1px solid #322d28; color: #f5f1ea; font-family: ${MONO}; font-size: 14px; padding: 11px 22px; text-decoration: none;`,
            )}
          >
            Read the docs
          </Link>
        </div>
      </main>
    </div>
  )
}