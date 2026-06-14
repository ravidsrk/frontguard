import { useInView } from '../hooks/useInView';

interface Row {
  feature: string;
  frontguard: string;
  percy: string;
  chromatic: string;
  argos: string;
}

const rows: Row[] = [
  {
    feature: 'Free tier',
    frontguard: 'CLI is free forever (MIT, BYO AI key)',
    percy: '5,000 screenshots/mo · all browsers',
    chromatic: '5,000 snapshots/mo · Chrome-only · no a11y · no TurboSnap',
    argos: '5,000 screenshots/mo · unlimited Playwright traces',
  },
  {
    feature: 'Paid entry tier',
    frontguard: 'Pro $29/mo (cloud + dashboard + GitHub App)',
    percy: 'Desktop ≈ $199/mo (per percy.io 2026 roundup)',
    chromatic: 'Starter $179/mo (35K snapshots · adds UI Review + a11y)',
    argos: 'Pro from $100/mo (35K screenshots)',
  },
  {
    feature: 'Snapshot overage',
    frontguard: 'Spend cap, no per-screenshot surcharge',
    percy: 'Quote-walled above tier',
    chromatic: '$0.008 / snapshot on Starter & Pro',
    argos: '$0.004 / extra screenshot · $0.0015 Storybook',
  },
  {
    feature: 'AI diff explanation',
    frontguard: 'Plain-English category + confidence + cause',
    percy: 'Visual Review Agent (NL summaries) · late 2025',
    chromatic: 'No diff-classification AI (pixel + SteadySnap)',
    argos: 'Explicitly markets "no AI overhead"',
  },
  {
    feature: 'Sandbox-verified fixes',
    frontguard: 'Patch + re-render in local Playwright / Daytona',
    percy: 'Not advertised',
    chromatic: 'Not advertised',
    argos: 'Not advertised',
  },
  {
    feature: 'Self-host',
    frontguard: 'docker-compose recipe · MIT cloud',
    percy: 'SaaS only (BrowserStack dashboard)',
    chromatic: 'SaaS only',
    argos: 'Repo is MIT; self-host possible from source',
  },
  {
    feature: 'Storybook integration',
    frontguard: 'Detector + play()-aware adapter',
    percy: 'SDK',
    chromatic: 'Native (@chromatic-com/storybook is the in-box add-on)',
    argos: '@argos-ci/storybook',
  },
  {
    feature: 'MCP server for in-IDE agents',
    frontguard: '@frontguard/mcp (list_regressions, get_suggested_fix)',
    percy: 'Not shipped',
    chromatic: 'Per-branch /mcp endpoint · Storybook 10.3+ · React-first',
    argos: 'Not shipped',
  },
  {
    feature: 'PR comment with thumbnail triplet',
    frontguard: 'Single update-in-place comment · baseline/current/diff',
    percy: 'PR check + comment',
    chromatic: 'PR check + UI Review thread',
    argos: 'PR check + thumbnails inline',
  },
  {
    feature: 'Cross-OS render normalisation',
    frontguard: '--docker pinned Chromium/Firefox/WebKit image',
    percy: 'Cloud DOM snapshotting',
    chromatic: 'Cloud render farm',
    argos: 'Runs whatever you upload',
  },
  {
    feature: 'Enterprise SSO/SAML',
    frontguard: 'On-demand (Enterprise)',
    percy: 'Sales quote',
    chromatic: 'Enterprise tier',
    argos: 'Enterprise tier (GitHub SSO add-on $50/mo)',
  },
];

const competitors = [
  { key: 'frontguard' as const, label: 'Frontguard', highlight: true },
  { key: 'percy' as const, label: 'Percy', highlight: false },
  { key: 'chromatic' as const, label: 'Chromatic', highlight: false },
  { key: 'argos' as const, label: 'Argos', highlight: false },
];

export default function Comparison() {
  const { ref, inView } = useInView();

  return (
    <section
      ref={ref}
      id="comparison"
      aria-labelledby="comparison-heading"
      className="border-t border-[var(--color-border)] py-24 lg:py-32"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className={`mx-auto max-w-3xl text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            Vs Percy / Chromatic / Argos
          </p>
          <h2
            id="comparison-heading"
            className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl"
          >
            How Frontguard stacks up.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Every cell describes documented competitor behaviour — pulled
            from each vendor's pricing page, docs, or 2026 release notes.
            See <a href="https://github.com/ravidsrk/frontguard/blob/main/docs/research.md" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline-offset-2 hover:underline">docs/research.md</a> for sources.
          </p>
        </div>

        {/* Desktop table */}
        <div
          className={`mt-12 hidden md:block overflow-x-auto ${inView ? 'animate-fade-up' : 'opacity-0'}`}
          style={{ animationDelay: '200ms' }}
        >
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">
              Feature comparison between Frontguard, Percy, Chromatic, and Argos.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-bg)] py-4 pr-4 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
                  Feature
                </th>
                {competitors.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`border-b border-[var(--color-border)] py-4 px-3 text-left text-xs font-semibold uppercase tracking-wide ${
                      c.highlight ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.feature} className="comparison-row">
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 border-b border-[var(--color-border)]/50 bg-[var(--color-bg)] py-4 pr-4 text-left text-sm font-medium text-[var(--color-text)] ${i === rows.length - 1 ? 'border-b-0' : ''}`}
                  >
                    {row.feature}
                  </th>
                  {competitors.map((c) => (
                    <td
                      key={c.key}
                      className={`border-b border-[var(--color-border)]/50 py-4 px-3 align-top text-sm leading-relaxed ${
                        c.highlight
                          ? 'font-medium text-[var(--color-text)]'
                          : 'text-[var(--color-text-secondary)]'
                      } ${i === rows.length - 1 ? 'border-b-0' : ''}`}
                    >
                      {row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="mt-10 md:hidden flex flex-col gap-5">
          {rows.map((row, i) => (
            <div
              key={row.feature}
              className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 ${inView ? 'animate-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${150 + i * 40}ms` }}
            >
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-dim)]">
                {row.feature}
              </h3>
              <dl className="mt-3 space-y-3">
                {competitors.map((c) => (
                  <div key={c.key} className="flex flex-col gap-1">
                    <dt
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        c.highlight ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'
                      }`}
                    >
                      {c.label}
                    </dt>
                    <dd
                      className={`text-sm leading-relaxed ${
                        c.highlight ? 'text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {row[c.key]}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
