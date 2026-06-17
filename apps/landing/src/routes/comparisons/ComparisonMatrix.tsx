import { REPO_URL } from '../../lib/site';
import { MATRIX, VENDORS } from './data';

const RESEARCH_URL = `${REPO_URL}/blob/main/docs/research.md`;

/**
 * Status glyphs are colored ONLY when the cell is the bare glyph (matching the
 * design's `cell()` rule); a mixed string like "✓ MIT" renders in neutral ink.
 */
const GLYPH_META: Record<string, { cls: string; label: string }> = {
  '✓': { cls: 'text-pass', label: 'supported' },
  '◐': { cls: 'text-amber', label: 'partial support' },
  '✕': { cls: 'text-ink-dim', label: 'not supported' },
};

function MatrixCell({ value }: { value: string }) {
  const meta = GLYPH_META[value];
  if (meta) {
    return (
      <span className={meta.cls} data-glyph={value}>
        <span aria-hidden="true">{value}</span>
        <span className="sr-only">{meta.label}</span>
      </span>
    );
  }
  return <span className="text-ink-bright">{value}</span>;
}

/**
 * The full 7-column comparison matrix (CAPABILITY + 6 vendors). The capability
 * column is sticky-left so it stays readable while the vendor columns scroll
 * horizontally on narrow viewports (floor item 10). Rows highlight on hover and
 * the Frontguard column is emphasized.
 */
export function ComparisonMatrix() {
  return (
    <div>
      <div className="overflow-x-auto border border-border-card bg-canvas">
        <table className="w-full min-w-[860px] border-collapse text-left text-[13.5px]">
          <caption className="sr-only">
            Capability comparison between Frontguard, Percy, Chromatic, BackstopJS, Lost Pixel, and
            Argos. A check means full support, a half-circle means partial or limited support, and a
            cross means not available.
          </caption>
          <thead>
            <tr className="bg-surface-strip">
              <th
                scope="col"
                className="sticky left-0 z-20 bg-surface-strip px-[18px] py-[18px] font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-muted"
              >
                Capability
              </th>
              {VENDORS.map((vendor, i) => (
                <th
                  key={vendor}
                  scope="col"
                  className={[
                    'px-3 py-[18px] text-center font-mono',
                    i === 0 ? 'text-[13px] font-bold text-amber' : 'text-[12px] font-medium text-ink-soft',
                  ].join(' ')}
                >
                  {vendor}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((row) => (
              <tr
                key={row.capability}
                data-origin={row.origin}
                className="group border-t border-border-faint transition-colors duration-[180ms] hover:bg-surface-strip"
              >
                <th
                  scope="row"
                  className={[
                    'sticky left-0 z-10 bg-canvas px-[18px] py-[15px] text-left text-ink-bright2 transition-colors duration-[180ms] group-hover:bg-surface-strip',
                    row.emphasize ? 'font-semibold' : 'font-normal',
                  ].join(' ')}
                >
                  {row.capability}
                </th>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={[
                      'px-3 py-[15px] text-center font-mono',
                      i === 0 ? 'text-[13.5px] font-bold' : 'text-[12.5px]',
                    ].join(' ')}
                  >
                    <MatrixCell value={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-[22px] font-mono text-[11.5px] text-ink-dim">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="text-pass">
            ✓
          </span>
          <span>full support</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="text-amber">
            ◐
          </span>
          <span>partial / limited</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="text-ink-dim">
            ✕
          </span>
          <span>not available</span>
        </span>
      </div>

      <p className="mt-3 font-mono text-[11.5px] text-ink-dim">
        Every cell traces to documented vendor behaviour —{' '}
        <a
          href={RESEARCH_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-soft underline-offset-2 transition-colors hover:text-ink-hi"
        >
          see docs/research.md
        </a>
        .
      </p>
    </div>
  );
}

export default ComparisonMatrix;
