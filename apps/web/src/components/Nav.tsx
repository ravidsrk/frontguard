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
      aria-label="Primary navigation"
      className="fg-nav"
      style={s(
        'position: sticky; top: 0; z-index: 50; background: rgba(13,12,11,0.82); backdrop-filter: blur(12px); border-bottom: 1px solid #211e1b;',
      )}
    >
      <a href="#main-content" className="fg-skip-link">
        Skip to main content
      </a>
      <div
        className="fg-nav-inner"
        style={s(
          'max-width: 1200px; margin: 0 auto; padding: 0 28px; height: 64px; display: flex; align-items: center; justify-content: space-between;',
        )}
      >
        <Link
          to="/"
          className="fg-link fg-nav-brand"
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
          className="fg-nav-links"
          style={s(
            "display: flex; align-items: center; gap: 28px; font-family: 'JetBrains Mono', monospace; font-size: 13px;",
          )}
        >
          {LINKS.map((l) => {
            const isCurrent = active === l.label
            return (
              <Link
                key={l.to}
                to={l.to as '/'}
                aria-current={isCurrent ? 'page' : undefined}
                className="fg-navlink"
                style={s(
                  `color: ${isCurrent ? '#f5f1ea' : '#b8b0a6'}; text-decoration: none; ${isCurrent ? 'border-bottom: 2px solid #e8862e; padding-bottom: 2px;' : ''}`,
                )}
              >
                {l.label}
              </Link>
            )
          })}
          <a
            href="https://github.com/ravidsrk/frontguard"
            target="_blank"
            rel="noopener noreferrer"
            className="fg-btn-primary fg-nav-cta"
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
