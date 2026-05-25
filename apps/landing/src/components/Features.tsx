import { useInView } from '../hooks/useInView';

const features = [
  {
    eyebrow: 'AI analysis',
    title: 'It tells you why, not where',
    description:
      'Instead of "pixels differ at coordinates 340,890," you get: "the submit button overflows on mobile because the new padding pushes it outside the flex container." GPT-4o vision reads the screenshot the way a senior engineer would.',
  },
  {
    eyebrow: 'Anti-flake consensus',
    title: '3 screenshots, majority wins',
    description:
      'Spinner mid-animation? Loading flicker? A blinking cursor in your hero? Frontguard takes three captures, keeps the consensus, drops the outlier. Flake noise stops drowning real regressions.',
  },
  {
    eyebrow: 'Smart route discovery',
    title: 'Point at a URL. It tests every page.',
    description:
      'No config files. No route lists. No baseline directories to maintain. The crawler walks your sitemap, finds every reachable page, and builds the test matrix for you.',
  },
  {
    eyebrow: 'PR-native review',
    title: 'Diffs render in the GitHub thread',
    description:
      'Every PR gets a comment with side-by-side visual diffs and the AI explanation inline. Approve or reject without leaving the review tab.',
  },
  {
    eyebrow: 'Multi-browser',
    title: 'Chromium, Firefox, WebKit — one command',
    description:
      'That Safari flexbox bug a customer found last quarter? It would have been caught at PR time. WebKit gets the same screenshot pipeline as Chromium.',
  },
  {
    eyebrow: 'Plugin system',
    title: '6 lifecycle hooks for whatever you need',
    description:
      'Compare production against Figma. Set performance budgets. Monitor live pages. Build your own with onBeforeCapture / onAfterDiff / onReport hooks.',
  },
];

export default function Features() {
  const { ref, inView } = useInView();

  // Asymmetric bento layout: one prominent feature spanning 2 cols on desktop,
  // five smaller features in alternating rows. No icon-card trios.
  return (
    <section ref={ref} id="features" aria-labelledby="features-heading" className="border-t border-[var(--color-border)] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`mb-16 max-w-3xl ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <h2
            id="features-heading"
            className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl"
          >
            Built for the problems{' '}
            <span className="text-[var(--color-text-muted)]">pixel diffs can{'\u2019'}t solve.</span>
          </h2>
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3 lg:grid-rows-[auto_auto]">
          {features.map((feature, i) => {
            // First feature spans 2 columns (prominent), rest fill remaining slots
            const isProminent = i === 0;
            return (
              <article
                key={feature.title}
                className={`flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 sm:p-8 transition-[border-color,background-color] hover:border-[var(--color-border-bright)] hover:bg-[var(--color-bg-card-hover)] ${
                  isProminent ? 'lg:col-span-2 lg:row-span-1' : ''
                } ${inView ? 'animate-fade-up' : 'opacity-0'}`}
                style={{ animationDelay: `${100 + i * 80}ms` }}
              >
                <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-accent)]">
                  {feature.eyebrow}
                </span>
                <h3
                  className={`mt-3 font-[family-name:var(--font-display)] font-semibold text-[var(--color-text)] [text-wrap:balance] ${
                    isProminent ? 'text-xl sm:text-2xl' : 'text-lg'
                  }`}
                >
                  {feature.title}
                </h3>
                <p
                  className={`mt-3 leading-relaxed text-[var(--color-text-muted)] ${
                    isProminent ? 'text-base' : 'text-sm'
                  }`}
                >
                  {feature.description}
                </p>
                {isProminent ? (
                  <div className="mt-6 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                    <div className="border-b border-[var(--color-border)] px-4 py-2 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-dim)]">
                      regression-report.md
                    </div>
                    <pre className="overflow-x-auto p-4 font-[family-name:var(--font-mono)] text-xs sm:text-sm leading-relaxed">
                      <code>
                        <span className="text-[var(--color-danger)]">/checkout @ 375px — REGRESSION (4.2% diff)</span>{'\n'}
                        <span className="text-[var(--color-accent)]">  AI: The submit button is being pushed outside its{'\n'}       parent flex container by the new 24px padding.{'\n'}       Visible from 320px to 414px viewports.</span>{'\n'}
                        <span className="text-[var(--color-text-muted)]">  Suggested fix: reduce padding to 16px or add{'\n'}                   `flex-shrink: 0` to .submit-btn.</span>
                      </code>
                    </pre>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
