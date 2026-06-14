import { useInView } from '../hooks/useInView';

const pillars = [
  {
    step: '01',
    title: 'Detect',
    headline: 'Anti-flake consensus + SSIM.',
    description:
      'Capture each route three times across Chromium, Firefox and WebKit. Majority wins; flake noise from spinners, fonts and animation timing drops out before a diff is even computed. SSIM perceptual matching is the fallback when pixel-equality is too strict.',
    illustration: {
      kind: 'consensus' as const,
    },
  },
  {
    step: '02',
    title: 'Understand',
    headline: 'AI classifies what changed.',
    description:
      'Surviving diffs go to GPT-4o / Claude Sonnet vision with the DOM, console errors and axe-core findings inline. The model returns a category (layout · color · content · accessibility), a confidence score, and a plain-English explanation of the root cause — not just "pixels differ at 340,890".',
    illustration: {
      kind: 'classify' as const,
    },
  },
  {
    step: '03',
    title: 'Fix',
    headline: 'Sandbox-verified patch.',
    description:
      'The AI proposes a CSS / HTML / config patch with a target selector. Frontguard applies it in a local Playwright sandbox (or Daytona when configured), re-renders the page, and only ships the suggestion if the diff disappears. Apply with one click in the PR comment.',
    illustration: {
      kind: 'patch' as const,
    },
  },
];

function ConsensusIllo() {
  return (
    <div className="grid grid-cols-3 gap-2 font-[family-name:var(--font-mono)] text-[10px]">
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 text-center">
        <div className="text-[var(--color-text-dim)]">run 1</div>
        <div className="mt-1 text-[var(--color-success)]">match</div>
      </div>
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 text-center">
        <div className="text-[var(--color-text-dim)]">run 2</div>
        <div className="mt-1 text-[var(--color-success)]">match</div>
      </div>
      <div className="rounded border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)]/50 p-2 text-center">
        <div className="text-[var(--color-text-dim)]">run 3</div>
        <div className="mt-1 text-[var(--color-text-dim)] line-through">flake</div>
      </div>
    </div>
  );
}

function ClassifyIllo() {
  return (
    <pre className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 font-[family-name:var(--font-mono)] text-[10px] leading-relaxed">
      <code>
        <span className="text-[var(--color-text-dim)]">{'{'}</span>
        {'\n'}  category: <span className="text-[var(--color-cta)]">"layout"</span>,
        {'\n'}  confidence: <span className="text-[var(--color-success)]">0.91</span>,
        {'\n'}  cause: <span className="text-[var(--color-accent)]">"padding 16→24px in"</span>
        {'\n'}         <span className="text-[var(--color-accent)]">"Button.module.css:42"</span>
        {'\n'}<span className="text-[var(--color-text-dim)]">{'}'}</span>
      </code>
    </pre>
  );
}

function PatchIllo() {
  return (
    <pre className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 font-[family-name:var(--font-mono)] text-[10px] leading-relaxed">
      <code>
        <span className="text-[var(--color-text-dim)]">  Button.module.css</span>
        {'\n'}<span className="text-[var(--color-danger)]">- padding: 24px;</span>
        {'\n'}<span className="text-[var(--color-success)]">+ padding: 16px;</span>
        {'\n'}<span className="text-[var(--color-text-dim)]">  re-render: ✔ diff cleared</span>
      </code>
    </pre>
  );
}

export default function HowItWorks() {
  const { ref, inView } = useInView();

  return (
    <section
      ref={ref}
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="border-t border-[var(--color-border)] py-24 lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className={`mx-auto max-w-3xl text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            How it works
          </p>
          <h2
            id="how-it-works-heading"
            className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl"
          >
            Detect. Understand. <span className="text-[var(--color-accent)]">Fix.</span>
          </h2>
          <p className="mt-4 text-base text-[var(--color-text-secondary)]">
            Three stages, one pipeline. Each stage drops noise before the
            next one runs, so the AI only sees diffs that survived
            consensus.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:mt-16 sm:gap-6 lg:grid-cols-3">
          {pillars.map((p, i) => (
            <article
              key={p.step}
              className={`flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 sm:p-7 transition-colors hover:border-[var(--color-border-bright)] ${inView ? 'animate-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${150 + i * 120}ms` }}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 font-[family-name:var(--font-mono)] text-xs font-bold text-[var(--color-accent)]">
                  {p.step}
                </span>
                <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-text)]">
                  {p.title}
                </h3>
              </div>
              <p className="mt-4 font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-text)] [text-wrap:balance]">
                {p.headline}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {p.description}
              </p>
              <div className="mt-6 pt-5 border-t border-[var(--color-border)]">
                {p.illustration.kind === 'consensus' && <ConsensusIllo />}
                {p.illustration.kind === 'classify' && <ClassifyIllo />}
                {p.illustration.kind === 'patch' && <PatchIllo />}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
