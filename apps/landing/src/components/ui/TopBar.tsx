import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { GitHubStars } from './GitHubStars';
import { REPO_URL } from '../../lib/site';

/**
 * Docs top bar variant: wordmark + "DOCS" label, a presentational search
 * affordance, and right-side links. The search field is non-functional in the
 * design; left as an affordance for the docs task to wire client-side filtering.
 */
export function TopBar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border-faint bg-canvas/85 backdrop-blur-[12px]">
      <div className="flex h-16 items-center justify-between gap-4 px-7">
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Toggle docs navigation"
              className="flex h-10 w-10 items-center justify-center text-ink-hi lg:hidden cursor-pointer"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>
          )}
          <Link to="/" aria-label="Frontguard home" className="flex items-center gap-2">
            <Logo variant="primary" height={24} />
            <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-faint">docs</span>
          </Link>
        </div>

        <div className="hidden flex-1 justify-center md:flex">
          <div
            aria-hidden="true"
            className="flex w-full max-w-sm items-center justify-between border border-border-card bg-panel px-3 py-1.5 font-mono text-[12px] text-ink-soft"
          >
            <span>Search docs</span>
            <span className="text-ink-faint">⌘K</span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <Link to="/" className="hidden font-mono text-[13px] text-ink-mid transition-colors hover:text-ink-hi sm:block">
            home
          </Link>
          <Link to="/pricing" className="hidden font-mono text-[13px] text-ink-mid transition-colors hover:text-ink-hi sm:block">
            pricing
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden font-mono text-[13px] text-ink-mid transition-colors hover:text-ink-hi sm:block"
          >
            github
          </a>
          <GitHubStars />
        </div>
      </div>
    </header>
  );
}

export default TopBar;
