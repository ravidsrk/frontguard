import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface ComparisonRow {
  feature: string;
  frontguard: boolean;
  percy: boolean | 'partial';
  chromatic: boolean | 'partial';
  playwright: boolean;
}

const rows: ComparisonRow[] = [
  { feature: 'AI analysis', frontguard: true, percy: false, chromatic: false, playwright: false },
  { feature: 'Open source', frontguard: true, percy: false, chromatic: 'partial', playwright: true },
  { feature: 'No per-screenshot fees', frontguard: true, percy: false, chromatic: false, playwright: true },
  { feature: 'Anti-flake consensus', frontguard: true, percy: false, chromatic: false, playwright: false },
  { feature: 'Playwright native', frontguard: true, percy: false, chromatic: false, playwright: true },
  { feature: 'Works without Storybook', frontguard: true, percy: true, chromatic: false, playwright: true },
  { feature: 'Auto-fix suggestions', frontguard: true, percy: false, chromatic: false, playwright: false },
];

function CellValue({ value }: { value: boolean | 'partial' }) {
  if (value === true) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-success-dim)] text-[var(--color-success)]" role="img" aria-label="Yes">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 7.5 5.5 10 11 4" />
        </svg>
      </span>
    );
  }
  if (value === 'partial') {
    return (
      <span className="text-xs font-medium text-[var(--color-text-dim)]">Partial</span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-bg-elevated)] text-[var(--color-text-dim)]" role="img" aria-label="No">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <line x1="4" y1="7" x2="10" y2="7" />
      </svg>
    </span>
  );
}

export default function Comparison() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section ref={ref} className="border-t border-[var(--color-border)] py-24 lg:py-32">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-16 text-center"
        >
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--color-text)] [text-wrap:balance] md:text-4xl">
            Why not Percy? Or Chromatic?{' '}
            <span className="text-[var(--color-text-muted)]">
              Or just Playwright screenshots?
            </span>
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="overflow-x-auto"
        >
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="pb-4 pr-4 text-left text-sm font-medium text-[var(--color-text-dim)]">
                  Feature
                </th>
                <th className="pb-4 text-center text-sm font-bold text-[var(--color-accent)]">
                  Frontguard
                </th>
                <th className="pb-4 text-center text-sm font-medium text-[var(--color-text-dim)]">
                  Percy
                </th>
                <th className="pb-4 text-center text-sm font-medium text-[var(--color-text-dim)]">
                  Chromatic
                </th>
                <th className="pb-4 text-center text-sm font-medium text-[var(--color-text-dim)]">
                  Playwright
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <motion.tr
                  key={row.feature}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.3 + i * 0.05, duration: 0.3 }}
                  className="border-b border-[var(--color-border)]/50"
                >
                  <td className="py-4 pr-4 text-sm text-[var(--color-text)]">
                    {row.feature}
                  </td>
                  <td className="py-4 text-center">
                    <div className="flex justify-center">
                      <CellValue value={row.frontguard} />
                    </div>
                  </td>
                  <td className="py-4 text-center">
                    <div className="flex justify-center">
                      <CellValue value={row.percy} />
                    </div>
                  </td>
                  <td className="py-4 text-center">
                    <div className="flex justify-center">
                      <CellValue value={row.chromatic} />
                    </div>
                  </td>
                  <td className="py-4 text-center">
                    <div className="flex justify-center">
                      <CellValue value={row.playwright} />
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
