import { Link } from '@tanstack/react-router'
import { s } from '../lib/style'
import { Shield } from './Shield'

const LINKS = [
  { label: 'docs', to: '/docs' },
  { label: 'pricing', to: '/pricing' },
  { label: 'compare', to: '/comparisons' },
  { label: 'changelog', to: '/changelog' },
] as const

/** Sticky top navigation shared by every route. `active` highlights one link. */
export function Nav({ active }: { active?: string }) {
  return (
    <nav
      style={s(
        'position: sticky; top: 0; z-index: 50; background: rgba(13,12,11,0.82); backdrop-filter: blur(12px); border-bottom: 1px solid #211e1b;',
      )}
    >
      <div
        style={s(
          'max-width: 1200px; margin: 0 auto; padding: 0 28px; height: 64px; display: flex; align-items: center; justify-content: space-between;',
        )}
      >
        <Link
          to="/"
          className="fg-link"
          style={s(
            'display: flex; align-items: center; gap: 11px; text-decoration: none; color: #f5f1ea;',
          )}
        >
          <Shield />
          <span
            style={s(
              "font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 16px; letter-spacing: -0.02em; color: #f5f1ea;",
            )}
          >
            frontguard
          </span>
        </Link>
        <div
          style={s(
            "display: flex; align-items: center; gap: 28px; font-family: 'JetBrains Mono', monospace; font-size: 13px;",
          )}
        >
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to as '/'}
              className="fg-navlink"
              style={s(
                `color: ${active === l.label ? '#f5f1ea' : '#b8b0a6'}; text-decoration: none;`,
              )}
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://github.com/ravidsrk/frontguard"
            className="fg-btn-primary"
            style={s(
              'background: #e8862e; color: #0d0c0b; font-weight: 700; padding: 9px 16px; text-decoration: none;',
            )}
          >
            ★ Star
          </a>
        </div>
      </div>
    </nav>
  )
}
