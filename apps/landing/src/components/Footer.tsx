const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Docs', href: 'https://docs.frontguard.dev', external: true },
      { label: 'Changelog', href: 'https://github.com/ravidsrk/frontguard/blob/main/CHANGELOG.md', external: true },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'CLI Reference', href: 'https://docs.frontguard.dev/docs/cli', external: true },
      { label: 'Playwright Plugin', href: 'https://docs.frontguard.dev/docs/playwright', external: true },
      { label: 'GitHub Actions', href: 'https://docs.frontguard.dev/docs/ci-cd/github-actions', external: true },
      { label: 'Self-host', href: 'https://docs.frontguard.dev/docs/self-host', external: true },
      { label: 'GitHub', href: 'https://github.com/ravidsrk/frontguard', external: true },
      { label: 'Contributing', href: 'https://github.com/ravidsrk/frontguard/blob/main/CONTRIBUTING.md', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'MIT License', href: 'https://github.com/ravidsrk/frontguard/blob/main/LICENSE', external: true },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] py-16" role="contentinfo">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_0.8fr] md:gap-12">
          {/* Logo + tagline */}
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/logo-48.png" alt="" width={24} height={24} className="rounded-sm" aria-hidden="true" />
              <span className="font-[family-name:var(--font-mono)] text-lg font-medium text-[var(--color-accent)]">
                frontguard
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--color-text-muted)]">
              Visual regression testing for Playwright. Open source under the MIT License.
            </p>
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

        <div className="mt-16 border-t border-[var(--color-border)] pt-8">
          <p className="text-center text-sm text-[var(--color-text-dim)]">
            &copy; {new Date().getFullYear()} Frontguard. Open source under the MIT License.
          </p>
        </div>
      </div>
    </footer>
  );
}
