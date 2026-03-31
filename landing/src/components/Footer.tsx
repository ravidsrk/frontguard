const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Docs', href: '#getting-started' },
      { label: 'Changelog', href: '#' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'GitHub', href: 'https://github.com/ravidsrk/frontguard', external: true },
      { label: 'Blog', href: '#' },
      { label: 'Contributing', href: 'https://github.com/ravidsrk/frontguard/blob/main/CONTRIBUTING.md', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'MIT License', href: 'https://github.com/ravidsrk/frontguard/blob/main/LICENSE', external: true },
      { label: 'Privacy', href: '#' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-4">
          {/* Logo + tagline */}
          <div className="md:col-span-1">
            <span className="font-[family-name:var(--font-mono)] text-lg font-medium text-[var(--color-accent)]">
              frontguard
            </span>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">
              AI-powered visual regression testing for modern web teams.
            </p>
          </div>

          {/* Link columns */}
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h4 className="mb-4 text-sm font-semibold text-[var(--color-text)]">
                {column.title}
              </h4>
              <ul className="flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                      {...('external' in link && link.external
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
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
