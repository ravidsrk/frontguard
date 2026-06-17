import type { ReactNode } from 'react';
import { type Status, STATUS_GLYPH, STATUS_COLOR_CLASS } from './status';

interface StatusGlyphProps {
  status: Status;
  /** Optional trailing label (e.g. "REGRESSION"). */
  label?: ReactNode;
  className?: string;
}

/**
 * Maps ✓/⚠/✘/★ onto the pass/warning/regression/new colors. Used in terminal
 * output, verdict cards, and comparison tables.
 */
export function StatusGlyph({ status, label, className = '' }: StatusGlyphProps) {
  return (
    <span className={['inline-flex items-center gap-2 font-mono', className].join(' ')}>
      <span aria-hidden="true" className={STATUS_COLOR_CLASS[status]} data-status={status}>
        {STATUS_GLYPH[status]}
      </span>
      {label != null && <span className={STATUS_COLOR_CLASS[status]}>{label}</span>}
      <span className="sr-only">{status}</span>
    </span>
  );
}

export default StatusGlyph;
