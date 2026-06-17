import type { ReactNode } from 'react';

export type CmpGlyph = 'full' | 'partial' | 'none';

export type CmpCell =
  | { kind: 'glyph'; glyph: CmpGlyph; note?: string }
  | { kind: 'text'; text: string; tone?: 'amber' | 'ink' | 'muted' | 'pass' };

export interface CmpRow {
  capability: string;
  cells: CmpCell[];
}

interface ComparisonTableProps {
  /** Column headers; the first is the capability column. */
  columns: string[];
  rows: CmpRow[];
  /** 1-based data column to emphasize (Frontguard). */
  highlightColumn?: number;
  caption?: ReactNode;
  className?: string;
}

const GLYPH: Record<CmpGlyph, { ch: string; cls: string; label: string }> = {
  full: { ch: '✓', cls: 'text-pass', label: 'full support' },
  partial: { ch: '◐', cls: 'text-amber', label: 'partial / limited' },
  none: { ch: '✕', cls: 'text-ink-dim', label: 'not available' },
};

const TEXT_TONE = {
  amber: 'text-amber',
  ink: 'text-ink-bright2',
  muted: 'text-ink-soft',
  pass: 'text-pass',
} as const;

function Cell({ cell, emphasize }: { cell: CmpCell; emphasize: boolean }) {
  if (cell.kind === 'glyph') {
    const g = GLYPH[cell.glyph];
    return (
      <span className={['font-mono', emphasize && cell.glyph === 'full' ? 'text-pass' : g.cls].join(' ')}>
        <span aria-hidden="true">{g.ch}</span>
        {cell.note ? ` ${cell.note}` : ''}
        <span className="sr-only">{g.label}</span>
      </span>
    );
  }
  return <span className={['font-mono text-[13px]', TEXT_TONE[cell.tone ?? 'muted']].join(' ')}>{cell.text}</span>;
}

/**
 * Data-driven comparison matrix. Columns and the cell-to-color mapping are props
 * so the same component serves the 5-col landing summary, the pricing matrix, and
 * the 7-col comparisons table. Wrapped for horizontal scroll on mobile.
 */
export function ComparisonTable({
  columns,
  rows,
  highlightColumn = 1,
  caption,
  className = '',
}: ComparisonTableProps) {
  return (
    <div className={['overflow-x-auto', className].join(' ')}>
      <table className="w-full border-collapse text-left">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="bg-surface-strip">
            {columns.map((col, i) => (
              <th
                key={col}
                scope="col"
                className={[
                  'px-4 py-3 font-mono text-[12px] uppercase tracking-[0.04em]',
                  i === 0 ? 'text-ink-soft' : 'text-center',
                  i === highlightColumn ? 'text-amber' : i === 0 ? '' : 'text-ink-bright',
                ].join(' ')}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.capability}
              className="border-t border-border-faint transition-colors duration-[180ms] hover:bg-surface-strip"
            >
              <th scope="row" className="px-4 py-3 text-left text-[14px] font-normal text-ink-bright2">
                {row.capability}
              </th>
              {row.cells.map((cell, i) => (
                <td key={i} className="px-4 py-3 text-center">
                  <Cell cell={cell} emphasize={i + 1 === highlightColumn} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ComparisonTable;
