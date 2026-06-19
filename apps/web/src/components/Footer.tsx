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
      { label: 'Contributing', href: 'https://github.com/ravidsrk/frontguard' },
    ],
  },
]

const linkStyle = s(
  'display: block; font-size: 13.5px; color: #8c847a; text-decoration: none; margin-bottom: 9px;',
)

export function Footer() {
  return (
    <footer style={s('border-top: 1px solid #211e1b; background: #0d0c0b;')}>
      <div
        style={s(
          'max-width: 1200px; margin: 0 auto; padding: 48px 28px; display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 32px;',
        )}
      >
        <div>
          <Link
            to="/"
            style={s(
              'display: flex; align-items: center; gap: 11px; text-decoration: none; color: #f5f1ea; margin-bottom: 14px;',
            )}
          >
            <Shield w={20} h={24} />
            <span
              style={s(
                "font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 15px; color: #f5f1ea;",
              )}
            >
              frontguard
            </span>
          </Link>
          <p
            style={s(
              'font-size: 13px; color: #6b645c; margin: 0; max-width: 280px; line-height: 1.55;',
            )}
          >
            AI-powered frontend visual regression testing. MIT licensed,
            self-hostable, free forever.
          </p>
        </div>
        {COLS.map((col) => (
          <div key={col.head}>
            <div
              style={s(
                "font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #564f48; letter-spacing: 0.06em; margin-bottom: 14px;",
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
                <a key={l.label} href={l.href} className="fg-link" style={linkStyle}>
                  {l.label}
                </a>
              ),
            )}
          </div>
        ))}
      </div>
      <div style={s('border-top: 1px solid #211e1b;')}>
        <div
          style={s(
            'max-width: 1200px; margin: 0 auto; padding: 20px 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;',
          )}
        >
          <span
            style={s(
              "font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #564f48;",
            )}
          >
            © 2026 Frontguard · MIT License
          </span>
          <span
            style={s(
              "font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #564f48;",
            )}
          >
            Built for teams who ship fast.
          </span>
        </div>
      </div>
    </footer>
  )
}
