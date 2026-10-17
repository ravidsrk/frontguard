import { Link } from '@tanstack/react-router'
import { s } from '../lib/style'
import { Shield } from './Shield'

export type ActivePage =
  | 'home'
  | 'pricing'
  | 'docs'
  | 'changelog'
  | 'brand'
  | 'compare'
  | 'comparisons'

const NAV_LINKS: { key: ActivePage; label: string; to: string }[] = [
  { key: 'home', label: 'features', to: '/' },
  { key: 'pricing', label: 'pricing', to: '/pricing' },
  { key: 'docs', label: 'docs', to: '/docs' },
  { key: 'changelog', label: 'changelog', to: '/changelog' },
]

export function Nav({ active }: { active?: ActivePage }) {
  return (
    <header
      className="fg-nav"
      style={s(
        'position: sticky; top: 0; z-index: 40; background: rgba(13,12,11,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border);',
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
        <div
          className="fg-nav-brand"
          style={s('display: flex; align-items: center; gap: 11px;')}
        >
          <Link
            to="/"
            style={s(
              'display: flex; align-items: center; gap: 11px; text-decoration: none; color: var(--text-primary);',
            )}
          >
            <Shield w={22} h={26} />
            <span
              style={s(
                "font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 16px; letter-spacing: -0.02em; color: var(--text-primary);",
              )}
            >
              frontguard
            </span>
          </Link>
          <Link
            to="/changelog"
            style={s(
              "font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted); padding: 2px 7px; border: 1px solid var(--border); border-radius: 4px; margin-left: 4px; text-decoration: none;",
            )}
          >
            v0.2.3
          </Link>
        </div>

        <nav
          className="fg-nav-links"
          aria-label="Primary"
          style={s('display: flex; align-items: center; gap: 28px; font-size: 14px;')}
        >
          {NAV_LINKS.map((it) => {
            const isActive = active === it.key
            return (
              <Link
                key={it.key}
                to={it.to}
                className="fg-navlink"
                style={s(
                  `color: ${isActive ? 'var(--text-primary)' : 'var(--text-secondary)'}; text-decoration: none; font-weight: ${isActive ? 600 : 400};`,
                )}
              >
                {it.label}
              </Link>
            )
          })}
          <a
            href="https://github.com/ravidsrk/frontguard"
            target="_blank"
            rel="noopener noreferrer"
            className="fg-navlink"
            title="TODO: wire live GitHub star count"
            style={s(
              "font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-secondary); padding: 5px 10px; border: 1px solid var(--border); border-radius: 4px; text-decoration: none;",
            )}
          >
            ★ Star
          </a>
        </nav>

        <Link
          to="/docs/$"
          params={{ _splat: 'getting-started/quickstart' }}
          className="fg-btn-primary fg-nav-cta"
          style={s(
            'padding: 8px 16px; background: var(--accent); color: var(--bg); font-weight: 600; font-size: 13px; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;',
          )}
        >
          Get started →
        </Link>
      </div>
    </header>
  )
}
