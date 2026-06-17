import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { FOOTER_COLUMNS, REPO_URL, X_URL, type NavLink } from '../../lib/site';

function FooterLink({ link }: { link: NavLink }) {
  const className =
    'inline-flex min-h-[36px] items-center text-[14px] text-ink-soft transition-colors duration-[180ms] hover:text-ink-hi';
  if (link.external) {
    return (
      <a href={link.to} target="_blank" rel="noopener noreferrer" className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link to={link.to} className={className}>
      {link.label}
    </Link>
  );
}

/** Shared marketing footer: brand blurb + four route-aware link columns + sub-bar. */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer role="contentinfo" className="border-t border-border-faint bg-canvas py-16">
      <div className="mx-auto max-w-[1200px] px-7">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.6fr_repeat(4,1fr)]">
          <div>
            <Logo variant="primary" height={26} />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-ink-soft">
              Catch the regression, not the noise. AI-powered visual regression testing for teams
              who ship fast. Open source under the MIT License.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Frontguard on GitHub"
                className="inline-flex h-9 w-9 items-center justify-center border border-border-card text-ink-soft transition-colors hover:border-border-hover hover:text-ink-hi"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </a>
              <a
                href={X_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Frontguard on X"
                className="inline-flex h-9 w-9 items-center justify-center border border-border-card text-ink-soft transition-colors hover:border-border-hover hover:text-ink-hi"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M9.52 6.78 14.93 0h-1.28L8.95 5.88 5.19 0H.86l5.67 8.88L.86 16h1.28l4.96-6.21L11.07 16h4.33L9.52 6.78ZM7.75 8.95l-.57-.88L2.6 1.04h1.97l3.69 5.71.57.88 4.8 7.43h-1.97L7.75 8.95Z" />
                </svg>
              </a>
            </div>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={`${column.title} links`}>
              <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                {column.title}
              </h3>
              <ul className="flex flex-col gap-1">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-border-faint pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[12px] text-ink-dim">© {year} Frontguard · MIT License</p>
          <p className="font-mono text-[12px] text-ink-dim">Built for teams who ship fast.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
