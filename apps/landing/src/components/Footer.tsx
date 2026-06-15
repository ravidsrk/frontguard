const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Comparison', href: '#comparison' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    title: 'Docs',
    links: [
      { label: 'Documentation', href: 'https://docs.frontguard.dev', external: true },
      { label: 'CLI reference', href: 'https://docs.frontguard.dev/docs/cli', external: true },
      { label: 'Playwright plugin', href: 'https://docs.frontguard.dev/docs/playwright', external: true },
      { label: 'GitHub Actions', href: 'https://docs.frontguard.dev/docs/ci-cd/github-actions', external: true },
      { label: 'Self-host', href: 'https://docs.frontguard.dev/docs/self-host', external: true },
      { label: 'MCP server', href: 'https://docs.frontguard.dev/docs/integrations/mcp', external: true },
      { label: 'GitHub', href: 'https://github.com/ravidsrk/frontguard', external: true },
      { label: 'Contributing', href: 'https://github.com/ravidsrk/frontguard/blob/main/CONTRIBUTING.md', external: true },
    ],
  },
  {
    title: 'Compare',
    links: [
      { label: 'vs Percy', href: 'https://docs.frontguard.dev/docs/comparison/percy', external: true },
      { label: 'vs Chromatic', href: 'https://docs.frontguard.dev/docs/comparison/chromatic', external: true },
      { label: 'vs Argos', href: 'https://docs.frontguard.dev/docs/comparison/argos', external: true },
      { label: 'Migrate from BackstopJS', href: 'https://docs.frontguard.dev/docs/migrate/backstopjs', external: true },
      { label: 'Migrate from Lost Pixel', href: 'https://docs.frontguard.dev/docs/migrate/lost-pixel', external: true },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'GitHub', href: 'https://github.com/ravidsrk/frontguard', external: true },
      { label: 'Changelog', href: 'https://github.com/ravidsrk/frontguard/blob/main/CHANGELOG.md', external: true },
      { label: 'Contributing', href: 'https://github.com/ravidsrk/frontguard/blob/main/CONTRIBUTING.md', external: true },
      { label: 'MIT License', href: 'https://github.com/ravidsrk/frontguard/blob/main/LICENSE', external: true },
      { label: 'Validation results', href: 'https://github.com/ravidsrk/frontguard/blob/main/validation/results-v0.2.md', external: true },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] py-16" role="contentinfo">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)] md:gap-10">
          {/* Logo + tagline */}
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/logo-48.png" alt="" width={24} height={24} className="rounded-sm" aria-hidden="true" />
              <span className="font-[family-name:var(--font-mono)] text-lg font-medium text-[var(--color-accent)]">
                frontguard
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--color-text-muted)]">
              AI-powered frontend visual regression testing for web teams.
              Open source under the MIT License.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href="https://github.com/ravidsrk"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="ravidsrk on GitHub"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-bright)] hover:text-[var(--color-text)]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </a>
              <a
                href="https://x.com/ravidsrk"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="ravidsrk on X"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-bright)] hover:text-[var(--color-text)]"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M9.52 6.78 14.93 0h-1.28L8.95 5.88 5.19 0H.86l5.67 8.88L.86 16h1.28l4.96-6.21L11.07 16h4.33L9.52 6.78ZM7.75 8.95l-.57-.88L2.6 1.04h1.97l3.69 5.71.57.88 4.8 7.43h-1.97L7.75 8.95Z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Link columns */}
          {footerColumns.map((column) => (
            <nav key={column.title} aria-label={`${column.title} links`}>
              <h3 className="mb-4 text-sm font-semibold text-[var(--color-text)] [text-wrap:balance]">
                {column.title}
              </h3>
              <ul className="flex flex-col gap-1">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="inline-flex min-h-[44px] items-center text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                      {...('external' in link && link.external
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-16 border-t border-[var(--color-border)] pt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--color-text-dim)]">
            &copy; {new Date().getFullYear()} Frontguard. Open source under the MIT License.
          </p>
          <p className="text-xs text-[var(--color-text-dim)]">
            Built by{' '}
            <a
              href="https://github.com/ravidsrk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
            >
              @ravidsrk
            </a>
            . No fabricated stats on this page — sources in{' '}
            <a
              href="https://github.com/ravidsrk/frontguard/blob/main/docs/research.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
            >
              docs/research.md
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
