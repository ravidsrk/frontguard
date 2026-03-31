import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

export default function FinalCTA() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="relative overflow-hidden py-24 lg:py-32">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(34, 211, 238, 0.08) 0%, transparent 60%)',
        }}
      />

      <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center gap-6"
        >
          <h2 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[var(--color-text)] [text-wrap:balance] md:text-5xl">
            Ship with confidence
          </h2>
          <p className="max-w-xl text-lg text-[var(--color-text-muted)]">
            Join teams who never ship visual regressions again.
          </p>
          <a
            href="#getting-started"
            className="touch-manipulation mt-2 inline-flex items-center gap-2 rounded-xl bg-[var(--color-cta)] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-orange-500/20 transition-[background-color,box-shadow] hover:bg-[var(--color-cta-hover)] hover:shadow-orange-500/30"
          >
            Get Started — It{'\u2019'}s Free
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3.5 9h11M10 4.5l4.5 4.5-4.5 4.5" />
            </svg>
          </a>
          <p className="text-sm text-[var(--color-text-dim)]">
            No credit card required. Free forever for individual developers.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
