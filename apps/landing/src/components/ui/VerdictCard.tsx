import type { ReactNode } from 'react';
import { type Status, STATUS_GLYPH } from './status';

interface VerdictCardProps {
  status: Status;
  /** Verdict label, e.g. "REGRESSION" / "INTENTIONAL". */
  verdict: string;
  /** 0–100 confidence; rendered as a chip. */
  confidence?: number;
  children: ReactNode;
  /** Optional suggested-fix line. */
  fix?: ReactNode;
  className?: string;
}

const TONE: Record<Status, { border: string; bg: string; text: string }> = {
  pass: { border: 'border-pass-brd', bg: 'bg-pass-bg', text: 'text-pass' },
  warning: { border: 'border-amber-brd', bg: 'bg-amber-tint', text: 'text-warning' },
  regression: { border: 'border-regression-brd', bg: 'bg-regression-bg', text: 'text-regression' },
  new: { border: 'border-amber-brd', bg: 'bg-amber-tint', text: 'text-new' },
};

/** AI verdict card: tinted by status, with a confidence chip and optional fix line. */
export function VerdictCard({ status, verdict, confidence, children, fix, className = '' }: VerdictCardProps) {
  const t = TONE[status];
  return (
    <div className={['border p-5', t.border, t.bg, className].join(' ')}>
      <div className="flex items-center justify-between gap-3">
        <span className={['font-mono text-[12px] tracking-[0.06em]', t.text].join(' ')}>
          <span aria-hidden="true">{STATUS_GLYPH[status]}</span> {verdict}
        </span>
        {confidence != null && (
          <span className="font-mono text-[11px] text-ink-soft">{confidence}% confidence</span>
        )}
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-mid">{children}</p>
      {fix && (
        <p className="mt-3 border-t border-border-faint pt-3 font-mono text-[12px] text-ink-soft">{fix}</p>
      )}
    </div>
  );
}

export default VerdictCard;
