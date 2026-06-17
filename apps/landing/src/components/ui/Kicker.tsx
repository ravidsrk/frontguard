import type { ReactNode } from 'react';

interface KickerProps {
  children: ReactNode;
  /** amber for numbered section labels ("01 / DETECT"), faint for "// ..." kickers. */
  tone?: 'amber' | 'faint' | 'ink';
  className?: string;
}

const TONES = {
  amber: 'text-amber',
  faint: 'text-ink-faint',
  ink: 'text-ink-soft',
} as const;

/** Uppercase, tracked JetBrains-Mono label used for section kickers and card tags. */
export function Kicker({ children, tone = 'faint', className = '' }: KickerProps) {
  return (
    <span
      className={[
        'font-mono text-[11px] uppercase tracking-[0.08em]',
        TONES[tone],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}

export default Kicker;
