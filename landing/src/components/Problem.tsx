import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const painCards = [
  {
    title: 'CSS changes break layouts silently',
    description:
      'A padding change in your component breaks the checkout button on mobile. Functional tests pass. You find out from a customer screenshot in Slack.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <line x1="14" y1="14" x2="21" y2="21" className="text-[var(--color-danger)]" />
        <line x1="21" y1="14" x2="14" y2="21" className="text-[var(--color-danger)]" />
      </svg>
    ),
  },
  {
    title: 'Screenshot diffs are 90% noise',
    description:
      'Your team approved 47 baseline updates last sprint without looking at them. Because when everything is flagged, nothing is.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    title: "Manual QA doesn\u2019t scale",
    description:
      'Every deploy needs eyes on 30 pages across 3 breakpoints. That\u2019s 90 manual checks. Every. Single. Time.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
];

export default function Problem() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl text-center font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-tight text-[var(--color-text)] [text-wrap:balance] md:text-4xl"
        >
          Your CI catches code bugs.{' '}
          <span className="text-[var(--color-text-muted)]">
            But who catches the visual ones?
          </span>
        </motion.h2>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {painCards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.12, duration: 0.5 }}
              className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 transition-colors hover:border-[var(--color-border-bright)] hover:bg-[var(--color-bg-card-hover)]"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-danger-dim)] text-[var(--color-danger)]">
                {card.icon}
              </div>
              <h3 className="mb-2 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-text)]">
                {card.title}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                {card.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
