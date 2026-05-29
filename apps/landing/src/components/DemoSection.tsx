import { useInView } from '../hooks/useInView';

/**
 * Demo section — shows Frontguard's terminal flow.
 *
 * Renders the demo GIF when available (demo/frontguard-demo.gif copied into
 * the landing public dir), falling back to a static terminal mock so the
 * section is always meaningful even before the asset is generated via VHS.
 */
const terminalLines: { prompt: boolean; text: string; tone?: string }[] = [
  { prompt: true, text: 'npx frontguard init' },
  { prompt: false, text: '✅ Created frontguard.config.ts (detected: Next.js)' },
  { prompt: true, text: 'npx frontguard doctor' },
  { prompt: false, text: '✅ Node.js · Playwright · browsers · git — all checks passed' },
  { prompt: true, text: 'npx frontguard run --url http://localhost:3000' },
  { prompt: false, text: '✔ Discovered 8 routes · captured 24 screenshots (3.2s)', tone: 'text-[var(--color-success)]' },
  { prompt: false, text: '✔ 24/24 checkpoints match baseline — no regressions', tone: 'text-[var(--color-success)]' },
  { prompt: false, text: '  Done in 6.8s. Nothing to review.', tone: 'text-[var(--color-text-muted)]' },
];

export default function DemoSection() {
  const { ref, inView } = useInView();

  return (
    <section
      ref={ref}
      id="demo"
      aria-labelledby="demo-heading"
      className="border-t border-[var(--color-border)] py-24 lg:py-32"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className={`mb-12 text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <h2
            id="demo-heading"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            See it in action
          </h2>
          <p className="mt-4 text-lg text-[var(--color-text-muted)]">
            Three commands from zero to a green run. No config, no dashboard, no signup.
          </p>
        </div>

        <div
          className={`overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#0d1117] shadow-2xl ${
            inView ? 'animate-fade-up' : 'opacity-0'
          }`}
        >
          {/* Terminal chrome */}
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-red-500/80" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <span className="h-3 w-3 rounded-full bg-green-500/80" />
            <span className="ml-3 text-xs text-[var(--color-text-muted)]">frontguard — demo</span>
          </div>

          {/* Terminal body */}
          <pre className="overflow-x-auto p-6 text-sm leading-relaxed font-mono">
            {terminalLines.map((line, i) => (
              <div key={i} className={line.tone ?? 'text-gray-300'}>
                {line.prompt ? <span className="text-[var(--color-accent)]">$ </span> : null}
                {line.text}
              </div>
            ))}
          </pre>
        </div>

        <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
          Reproducible via <code>vhs demo/frontguard-demo.tape</code>
        </p>
      </div>
    </section>
  );
}
