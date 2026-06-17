import type { ReactNode } from 'react';

export interface Stat {
  value: ReactNode;
  label: ReactNode;
}

interface StatGridProps {
  stats: Stat[];
  /** Columns at the widest breakpoint (default 2 → a 2×2 grid). */
  columns?: 2 | 3;
  className?: string;
}

/**
 * N-up stat grid where the 1px gap reveals a hairline gridline (the cells sit on
 * a faint-bordered backing). Collapses to a single column on mobile.
 */
export function StatGrid({ stats, columns = 2, className = '' }: StatGridProps) {
  const cols = columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2';
  return (
    <div
      className={['grid grid-cols-1 gap-px bg-border-faint border border-border-faint', cols, className].join(
        ' ',
      )}
    >
      {stats.map((s, i) => (
        <div key={i} className="bg-canvas p-6">
          <div className="font-sans text-[28px] font-bold text-ink-hi">{s.value}</div>
          <div className="mt-1 text-[14px] leading-snug text-ink-soft">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export default StatGrid;
