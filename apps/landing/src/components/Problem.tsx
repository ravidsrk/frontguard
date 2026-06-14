import { useInView } from '../hooks/useInView';

const failures = [
  {
    eyebrow: '01 — The OSS exit',
    title: 'Lost Pixel sunset; the OSS path narrowed.',
    body: (
      <>
        Lost Pixel was acqui-hired by Figma in 2026 and the repository was
        archived in April. The OSS tools that remain — Playwright built-in,
        BackstopJS, reg-suit — all stop at "a pixel diff happened": no
        review UI, no anti-flake, no AI to explain what changed.
        Self-hosting visual regression on Playwright today means writing
        the missing pieces yourself, or paying for a SaaS dashboard.
      </>
    ),
    source: 'lost-pixel.com · github.com/lost-pixel/lost-pixel (archived 2026-04-22)',
  },
  {
    eyebrow: '02 — Playwright cross-OS flake',
    title: "Playwright's own docs warn rendering differs by OS.",
    body: (
      <>
        Playwright's <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">toHaveScreenshot</code> embeds <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">chromium-darwin</code> in the
        baseline filename for a reason: macOS renders one outline width,
        Linux another. A baseline captured on a dev's M2 silently rejects
        every CI run on Linux. The choice becomes committing three sets of
        baselines per snapshot, or running every render inside a
        normalised image.
      </>
    ),
    source: 'playwright.dev/docs/test-snapshots',
  },
  {
    eyebrow: '03 — The Percy / Chromatic cliff',
    title: 'Cross the free tier; price jumps an order of magnitude.',
    body: (
      <>
        Chromatic's Free tier is Chrome-only and excludes accessibility,
        TurboSnap, and UI Review — the next step is Starter at $179/mo.
        Argos's published comparison puts 100K snapshots at $510/mo on
        Argos vs $8,999/mo on Percy. "Paid" for visual regression starts
        in the low hundreds of dollars per month, before anyone has
        reviewed a single diff.
      </>
    ),
    source: 'chromatic.com/pricing · argos-ci.com/pricing',
  },
];

export default function Problem() {
  const { ref, inView } = useInView();

  return (
    <section
      ref={ref}
      id="problem"
      aria-labelledby="problem-heading"
      className="border-t border-[var(--color-border)] py-24 lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`mx-auto max-w-3xl text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            Why pixel diffs alone fail
          </p>
          <h2
            id="problem-heading"
            className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl"
          >
            The visual-regression space, mid-2026.
          </h2>
          <p className="mt-4 text-base text-[var(--color-text-secondary)]">
            Three concrete failure modes a paying team hits when they reach
            for an existing tool. Every claim cites a source — no invented
            stats.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:mt-16 sm:gap-6 lg:grid-cols-3">
          {failures.map((f, i) => (
            <article
              key={f.eyebrow}
              className={`flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 sm:p-7 transition-colors hover:border-[var(--color-border-bright)] ${inView ? 'animate-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${150 + i * 120}ms` }}
            >
              <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-accent)]">
                {f.eyebrow}
              </span>
              <h3 className="mt-3 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-text)] [text-wrap:balance] sm:text-xl">
                {f.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {f.body}
              </p>
              <p className="mt-5 pt-4 border-t border-[var(--color-border)] font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
                Source: {f.source}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
