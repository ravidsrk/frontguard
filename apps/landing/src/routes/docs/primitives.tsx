import type { ReactNode } from 'react';
import { CodeBlock } from '../../components/ui';

/**
 * Docs-local presentational primitives. These mirror the exact element styles in
 * `docs/design-extract/source/Docs.dc.html` (lead/body type scale, amber
 * callouts, gridline step lists, definition tables, terminal/code syntax spans)
 * using the foundation design tokens. They are intentionally docs-scoped rather
 * than promoted to the shared kit: only the docs surface needs them.
 */

/** 17px lead paragraph (`#c8c0b6`, line-height 1.65). */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="text-[17px] leading-[1.65] text-ink-bright">{children}</p>;
}

/** 16px body paragraph. */
export function Body({ children }: { children: ReactNode }) {
  return <p className="text-[16px] leading-[1.65] text-ink-bright">{children}</p>;
}

/**
 * Section heading. Carries the anchor `id` the right-rail TOC scrolls to, with a
 * scroll-margin so the sticky 60px top bar never covers the target.
 */
export function H2({ id, children, size = 24 }: { id: string; children: ReactNode; size?: 24 | 26 }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 font-sans font-semibold tracking-[-0.02em] text-ink-hi"
      style={{ fontSize: `${size}px` }}
    >
      {children}
    </h2>
  );
}

/** 17px sub-heading (h3). */
export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-24 text-[17px] font-semibold text-ink-hi">
      {children}
    </h3>
  );
}

/** Inline `code` token: amber on amber-tint, the design's `<code>` treatment. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-[14px] text-amber bg-amber-tint px-1.5 py-0.5">{children}</code>
  );
}

/** Strong emphasis recolored to ink-hi (design uses 600-weight ink-hi). */
export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink-hi">{children}</strong>;
}

/** Amber prerequisite/note callout with the `▍` marker and optional kicker. */
export function Callout({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5 border border-amber-brd bg-amber-tint px-5 py-[18px]">
      <span aria-hidden="true" className="font-mono text-[15px] leading-none text-amber">
        ▍
      </span>
      <div>
        {label && (
          <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.03em] text-amber">
            {label}
          </div>
        )}
        <div className="text-[14px] leading-[1.55] text-ink-bright">{children}</div>
      </div>
    </div>
  );
}

/** 1px-gridline container (pipeline / quick-step / action-step lists). */
export function GridList({ children }: { children: ReactNode }) {
  return <div className="grid gap-px border border-border-faint bg-border-faint">{children}</div>;
}

/** A single cell-row inside a GridList (canvas fill over the gridline gaps). */
export function GridRow({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-4 bg-canvas px-5 py-4" style={{ gridTemplateColumns: cols }}>
      {children}
    </div>
  );
}

/** Bordered definition table (FLAG / OPTION / INPUT reference rows). */
export function DefTable({ children }: { children: ReactNode }) {
  return <div className="border border-border-card">{children}</div>;
}

/** A row in a DefTable. `header` renders the muted column-label band. */
export function DefRow({
  cols,
  header = false,
  children,
}: {
  cols: string;
  header?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        'grid items-baseline gap-3.5 px-5 py-3 border-b border-border-faint last:border-b-0',
        header
          ? 'bg-surface-strip font-mono text-[11px] uppercase tracking-[0.04em] text-ink-faint'
          : '',
      ].join(' ')}
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

/** Mono amber identifier cell (a flag / option / env-var name). */
export function MonoKey({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[12.5px] text-amber">{children}</code>;
}

/** Muted mono default-value cell. */
export function MonoDim({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[12px] text-ink-soft">{children}</code>;
}

/** A terminal/code panel using the kit CodeBlock with a docs-tuned `<pre>`. */
export function Terminal({ filename, children }: { filename?: string; children: ReactNode }) {
  return <CodeBlock filename={filename}>{children}</CodeBlock>;
}

/* ---- Code-syntax span helpers (map to the code-* token palette) ---- */
export const Kw = ({ children }: { children: ReactNode }) => (
  <span className="text-code-keyword">{children}</span>
);
export const Str = ({ children }: { children: ReactNode }) => (
  <span className="text-code-string">{children}</span>
);
export const Num = ({ children }: { children: ReactNode }) => (
  <span className="text-code-number">{children}</span>
);
export const Cmt = ({ children }: { children: ReactNode }) => (
  <span className="text-code-comment">{children}</span>
);
export const Blu = ({ children }: { children: ReactNode }) => (
  <span className="text-code-blue">{children}</span>
);
/** The `$` shell prompt (muted). */
export const Prompt = () => <span className="text-ink-muted">$ </span>;
