import { Link } from '@tanstack/react-router'
import { s } from '../lib/style'
import { Shield } from './Shield'

const COLS: {
  head: string
  links: { label: string; to?: string; href?: string }[]
}[] = [
  {
    head: 'PRODUCT',
    links: [
      { label: 'Features', to: '/' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Comparison', to: '/comparisons' },
    ],
  },
  {
    head: 'RESOURCES',
    links: [
      { label: 'Documentation', to: '/docs' },
      { label: 'Changelog', to: '/changelog' },
      { label: 'Brand', to: '/brand' },
    ],
  },
  {
    head: 'COMMUNITY',
    links: [
      { label: 'GitHub', href: 'https://github.com/ravidsrk/frontguard' },
      { label: 'npm', href: 'https://www.npmjs.com/package/@frontguard/cli' },
      { label: 'Support', href: 'https://github.com/ravidsrk/frontguard/issues' },
    ],
  },
  {
    head: 'LEGAL',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
      { label: 'Status', to: '/status' },
    ],
  },
]

const linkStyle = s(
  'display: block; font-size: 14px; color: var(--text-secondary); text-decoration: none; margin-bottom: 10px;',
)

export function Footer() {
  return (
    <footer className="fg-footer" style={s('border-top: 1px solid var(--border); background: var(--bg);')}>
      <div
        className="fg-footer-grid"
        style={s(
          'max-width: 1200px; margin: 0 auto; padding: 64px 28px; display: grid; grid-template-columns: 1.6fr repeat(4, 1fr); gap: 36px;',
        )}
      >
        <div>
          <Link
            to="/"
            style={s(
              'display: flex; align-items: center; gap: 11px; text-decoration: none; color: var(--text-primary); margin-bottom: 14px;',
            )}
          >
            <Shield w={20} h={24} />
            <span
              style={s(
                "font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 15px; color: var(--text-primary);",
              )}
            >
              frontguard
            </span>
          </Link>
          <p
            style={s(
              'font-size: 14px; color: var(--text-secondary); margin: 0; max-width: 280px; line-height: 1.6;',
            )}
          >
            Local visual regression testing with optional AI assistance. MIT
            licensed and free to run without a hosted account.
          </p>
        </div>
        {COLS.map((col) => (
          <div key={col.head}>
            <div
              style={s(
                "font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; color: var(--text-muted); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 14px;",
              )}
            >
              {col.head}
            </div>
            {col.links.map((l) =>
              l.to ? (
                <Link key={l.label} to={l.to} className="fg-link" style={linkStyle}>
                  {l.label}
                </Link>
              ) : (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fg-link"
                  style={linkStyle}
                >
                  {l.label}
                </a>
              ),
            )}
          </div>
        ))}
      </div>
      <div style={s('border-top: 1px solid var(--border);')}>
        <div
          style={s(
            'max-width: 1200px; margin: 0 auto; padding: 22px 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;',
          )}
        >
          <span
            style={s(
              "font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted);",
            )}
          >
            © 2026 Frontguard · MIT License
          </span>
          <span
            style={s(
              "font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted);",
            )}
          >
            Built for teams who ship fast.
          </span>
        </div>
      </div>
    </footer>
  )
}
