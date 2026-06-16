import { useInView } from '../hooks/useInView';

// Generated from validation/results-v0.2.md — re-run
// `node validation/aggregate-results.mjs --landing` after a fresh harness to
// refresh these numbers. Source of truth: validation/results/*.json.
const data = {
  runDate: '2026-06-16',
  cliVersion: '0.2.0',
  aiEnabled: false,
  aggregate: {
    reposAttempted: 5,
    reposBooted: 2,
    reposSkipped: 3,
    recheckRouteCount: 43,
    recheckPositiveCount: 0,
    pixelFalsePositiveRate: 0,
  },
  repos: [
    {
      name: 'tailwind-dashboard',
      category: 'Tailwind dashboard',
      bootSucceeded: true,
      recheckPass: 18,
      recheckFalsePositive: 0,
      recheckError: 1,
      pixelFalsePositiveRate: 0,
    },
    {
      name: 'chakra-ui-docs',
      category: 'Component library docs',
      bootSucceeded: true,
      recheckPass: 21,
      recheckFalsePositive: 0,
      recheckError: 3,
      pixelFalsePositiveRate: 0,
    },
    {
      name: 'taxonomy',
      category: 'Next.js app',
      bootSucceeded: false,
      skipReason: 'next 13.3.2-canary dev server crashed on Node 22',
    },
    {
      name: 'medusa-storefront',
      category: 'E-commerce storefront',
      bootSucceeded: false,
      skipReason: 'requires a running Medusa backend + publishable API key',
    },
    {
      name: 'nextra-docs',
      category: 'Docs site',
      bootSucceeded: false,
      skipReason: 'monorepo dev server did not bind a port within 120 s',
    },
  ],
} as const;

function pct(n: number | null): string {
  if (n == null || Number.isNaN(n)) return 'n/a';
  return `${(n * 100).toFixed(1)}%`;
}

const stats = [
  {
    value: pct(data.aggregate.pixelFalsePositiveRate),
    label: 'Pixel false-positive rate on unchanged-code recheck',
  },
  {
    value: `${data.aggregate.reposBooted}/${data.aggregate.reposAttempted}`,
    label: 'Repos booted end-to-end (clone → install → dev server → render)',
  },
  {
    value: String(data.aggregate.recheckRouteCount),
    label: 'Route × viewport × browser checks measured on the recheck pass',
  },
  {
    value: data.aiEnabled ? 'Measured' : 'Pending',
    label: 'AI classification accuracy (requires provider key in CI)',
  },
] as const;

export default function Validation() {
  const { ref, inView } = useInView();

  return (
    <section
      ref={ref}
      id="validation"
      aria-labelledby="validation-heading"
      className="border-t border-[var(--color-border)] py-24 lg:py-32"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className={`text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            Validation results
          </p>
          <h2
            id="validation-heading"
            className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl"
          >
            We point Frontguard at real open-source frontends —{' '}
            <span className="text-[var(--color-text-secondary)]">
              and publish what we measured.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-text-secondary)]">
            Run date <span className="font-mono">{data.runDate}</span> ·
            Frontguard <span className="font-mono">{data.cliVersion}</span>.
            The harness clones each repo, boots its dev server, takes
            baselines, then re-runs against the same unchanged code. Anything
            that fails on the recheck is, by definition, a pixel-only false
            positive.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-8">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--color-text)] [font-variant-numeric:tabular-nums] sm:text-2xl md:text-4xl">
                {stat.value}
              </div>
              <div className="mt-1 text-xs sm:text-sm text-[var(--color-text-muted)]">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        <div
          className={`mt-10 overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] ${inView ? 'animate-fade-up' : 'opacity-0'}`}
          style={{ animationDelay: '320ms' }}
        >
          <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
            <thead className="bg-[var(--color-bg-elevated)]">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">
                  Repo
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">
                  Category
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">
                  Booted
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">
                  Recheck pass
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">
                  Pixel FP rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] [font-variant-numeric:tabular-nums]">
              {data.repos.map((repo) => (
                <tr key={repo.name}>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text)]">
                    {repo.name}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">
                    {repo.category}
                  </td>
                  <td className="px-4 py-3">
                    {repo.bootSucceeded ? (
                      <span className="text-[var(--color-success)]">yes</span>
                    ) : (
                      <span className="text-[var(--color-text-dim)]">
                        skipped — {'skipReason' in repo ? repo.skipReason : 'see methodology'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--color-text)]">
                    {repo.bootSucceeded ? repo.recheckPass : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--color-text)]">
                    {repo.bootSucceeded ? pct(repo.pixelFalsePositiveRate) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-[var(--color-text-muted)]">
          {data.aiEnabled
            ? null
            : 'AI classification accuracy is pending API-key configuration in CI — this run measured pixel-only. '}
          Full methodology, raw artifacts, and skip notes:{' '}
          <a
            href="https://github.com/ravidsrk/frontguard/blob/main/validation/results-v0.2.md"
            className="font-medium text-[var(--color-accent)] underline-offset-2 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            validation/results-v0.2.md
          </a>
          . Source repos:{' '}
          <a
            href="https://github.com/ravidsrk/frontguard/blob/main/validation/repos.json"
            className="font-medium text-[var(--color-accent)] underline-offset-2 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            validation/repos.json
          </a>
          .
        </p>
      </div>
    </section>
  );
}
