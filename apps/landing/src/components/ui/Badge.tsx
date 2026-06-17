import type { ReactNode } from 'react';

export type BadgeTone = 'amber' | 'pass' | 'regression' | 'new' | 'neutral';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** Show a leading status dot; pulsing when `pulse` is set (hero badge). */
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

const TONES: Record<BadgeTone, { text: string; border: string; bg: string; dot: string }> = {
  amber: { text: 'text-amber', border: 'border-amber-brd', bg: 'bg-amber-tint', dot: 'bg-amber' },
  pass: { text: 'text-pass', border: 'border-pass-brd', bg: 'bg-pass-bg', dot: 'bg-pass' },
  regression: {
    text: 'text-regression',
    border: 'border-regression-brd',
    bg: 'bg-regression-bg',
    dot: 'bg-regression',
  },
  new: { text: 'text-new', border: 'border-amber-brd', bg: 'bg-amber-tint', dot: 'bg-new' },
  neutral: { text: 'text-ink-soft', border: 'border-border-card', bg: 'bg-panel', dot: 'bg-ink-soft' },
};

/**
 * Mono, tracked, uppercase pill. Tones map to the status palette. Used for the
 * hero "OPEN SOURCE · MIT · SELF-HOSTABLE" badge, pricing pills, "MOST POPULAR",
 * and the changelog status tags.
 */
export function Badge({ children, tone = 'amber', dot = false, pulse = false, className = '' }: BadgeProps) {
  const t = TONES[tone];
  return (
    <span
      className={[
        'inline-flex items-center gap-2 border px-3 py-1',
        'font-mono text-[11px] uppercase tracking-[0.08em]',
        t.text,
        t.border,
        t.bg,
        className,
      ].join(' ')}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={['inline-block h-1.5 w-1.5 rounded-full', t.dot, pulse ? 'animate-pulse-dot' : ''].join(' ')}
        />
      )}
      {children}
    </span>
  );
}

export default Badge;
