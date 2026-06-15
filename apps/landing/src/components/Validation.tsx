import { useInView } from '../hooks/useInView';

export default function Validation() {
  const { ref, inView } = useInView();

  return (
    <section
      ref={ref}
      id="validation"
      aria-labelledby="validation-heading"
      className="border-t border-[var(--color-border)] py-24 lg:py-32"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className={`text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            Trust
          </p>
          <h2
            id="validation-heading"
            className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl"
          >
            Validation results coming soon.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
            Frontguard's AI classifier is validated against real diffs from
            five open-source repos: shadcn-ui taxonomy, shadcn-ui
            next-template, chakra-ui-docs, medusajs storefront, and shuding
            nextra. We publish the measured accuracy, false-positive rate,
            and per-category breakdown — and gate the launch on accuracy
            ≥ 70% and FPR &lt; 15%.
          </p>
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">
            No accuracy number ships on this page until that run lands. If
            you see an unsourced percentage anywhere on this site, file an
            issue — it's not us.
          </p>
        </div>

        <div
          className={`mt-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 ${inView ? 'animate-fade-up' : 'opacity-0'}`}
          style={{ animationDelay: '200ms' }}
        >
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
                Overall accuracy
              </dt>
              <dd className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-text-muted)]">
                Pending live run
              </dd>
            </div>
            <div>
              <dt className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
                False-positive rate
              </dt>
              <dd className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-text-muted)]">
                Pending live run
              </dd>
            </div>
            <div>
              <dt className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
                Launch gate
              </dt>
              <dd className="mt-2 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-text)]">
                ≥ 70% / &lt; 15%
              </dd>
            </div>
          </dl>
          <p className="mt-6 border-t border-[var(--color-border)] pt-4 text-sm text-[var(--color-text-muted)]">
            Live harness: <a href="https://github.com/ravidsrk/frontguard/blob/main/validation/results-v0.2.md" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline-offset-2 hover:underline">validation/results-v0.2.md</a>. Source repos enumerated in <a href="https://github.com/ravidsrk/frontguard/blob/main/validation/repos.json" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] underline-offset-2 hover:underline">validation/repos.json</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
