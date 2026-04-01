import { motion } from 'framer-motion';

const terminalLines = [
  { text: '$ npx frontguard run --url https://myapp.com', type: 'command' as const },
  { text: '', type: 'blank' as const },
  { text: '✔ Discovering routes — Found 8 route(s)', type: 'success' as const },
  { text: '✔ Rendering — Captured 24 screenshot(s) in 3.2s', type: 'success' as const },
  { text: '✔ Comparing — 1 regression detected', type: 'warning' as const },
  { text: '', type: 'blank' as const },
  { text: '  /checkout @ 375px — REGRESSION (4.2% diff)', type: 'danger' as const },
  { text: '  AI: "Submit button overflows container on mobile.', type: 'ai' as const },
  { text: '       The new padding pushes it outside the parent flex."', type: 'ai' as const },
  { text: '', type: 'blank' as const },
  { text: '  Suggested fix: Add `overflow: hidden` to .checkout-form', type: 'fix' as const },
];

const lineColorMap: Record<string, string> = {
  command: 'text-[var(--color-text)]',
  blank: '',
  success: 'text-[var(--color-success)]',
  warning: 'text-[var(--color-cta)]',
  danger: 'text-[var(--color-danger)]',
  ai: 'text-[var(--color-accent)]',
  fix: 'text-[var(--color-text-muted)]',
};

const easeOut = [0.25, 0.46, 0.45, 0.94] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: easeOut as unknown as [number, number, number, number] },
  }),
};

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-32">
      {/* Gradient mesh background */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[600px] w-[900px] -translate-x-1/2 opacity-30"
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(34, 211, 238, 0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(249, 115, 22, 0.08) 0%, transparent 60%)',
        }}
      />

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left column — Copy */}
          <div className="lg:col-span-5">
            <motion.div
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-6"
            >
              <motion.div
                custom={0}
                variants={fadeUp}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-1.5 text-xs font-medium text-[var(--color-text-muted)]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                Open source · MIT Licensed
              </motion.div>

              <motion.h1
                custom={1}
                variants={fadeUp}
                className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] font-extrabold tracking-tight text-[var(--color-text)] [text-wrap:balance] md:text-5xl lg:text-6xl"
              >
                Your CSS broke the checkout page.{' '}
                <span className="text-[var(--color-accent)]">Frontguard caught it.</span>
              </motion.h1>

              <motion.p
                custom={2}
                variants={fadeUp}
                className="max-w-lg text-lg leading-relaxed text-[var(--color-text-muted)]"
              >
                Visual regression testing that tells you what broke, why it
                broke, and how to fix it. Plugs into Playwright. Runs in CI.
                Free and open source.
              </motion.p>

              <motion.div
                custom={3}
                variants={fadeUp}
                className="flex flex-wrap gap-4 pt-2"
              >
                <a
                  href="#getting-started"
                  className="touch-manipulation inline-flex items-center gap-2 rounded-lg bg-[var(--color-cta)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-[background-color,box-shadow] hover:bg-[var(--color-cta-hover)] hover:shadow-orange-500/30"
                >
                  Install in 30 Seconds
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </a>
                <a
                  href="https://github.com/ravidsrk/frontguard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-manipulation inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-6 py-3 text-sm font-medium text-[var(--color-text-muted)] transition-[border-color,color] hover:border-[var(--color-border-bright)] hover:text-[var(--color-text)]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  View on GitHub
                </a>
              </motion.div>
            </motion.div>
          </div>

          {/* Right column — Terminal mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="lg:col-span-7"
          >
            <div className="relative">
              {/* Glow behind terminal */}
              <div
                className="pointer-events-none absolute -inset-4 -z-10 rounded-2xl opacity-40"
                style={{
                  background:
                    'radial-gradient(ellipse at 50% 50%, rgba(34, 211, 238, 0.12) 0%, transparent 70%)',
                }}
              />

              <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                {/* Title bar */}
                <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
                  <span className="h-3 w-3 rounded-full bg-[#ef4444]/60" />
                  <span className="h-3 w-3 rounded-full bg-[#eab308]/60" />
                  <span className="h-3 w-3 rounded-full bg-[#22c55e]/60" />
                  <span className="ml-4 font-[family-name:var(--font-mono)] text-xs text-[var(--color-text-dim)]">
                    terminal
                  </span>
                </div>

                {/* Terminal content */}
                <div className="p-5 lg:p-6">
                  <pre className="font-[family-name:var(--font-mono)] text-xs leading-relaxed sm:text-sm">
                    <code>
                      {terminalLines.map((line, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.6 + i * 0.08, duration: 0.3 }}
                          className={`min-h-[1.5em] ${lineColorMap[line.type] ?? ''}`}
                        >
                          {line.text}
                        </motion.div>
                      ))}
                    </code>
                  </pre>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
