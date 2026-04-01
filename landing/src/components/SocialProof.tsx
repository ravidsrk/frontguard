import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const stats = [
  { value: '395', label: 'tests' },
  { value: '< 3s', label: 'per page' },
  { value: 'Zero', label: 'config needed' },
  { value: '3', label: 'browsers' },
  { value: 'MIT', label: 'licensed' },
];

export default function SocialProof() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="border-y border-[var(--color-border)] py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center text-sm font-medium tracking-wide text-[var(--color-text-dim)] uppercase"
        >
          Built for developers who ship daily
        </motion.p>

        {/* Stats */}
        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-5">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="text-center"
            >
              <div className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--color-text)] [font-variant-numeric:tabular-nums] md:text-4xl">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-[var(--color-text-muted)]">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>


      </div>
    </section>
  );
}
