import type { ReactNode } from 'react';

interface CodeBlockProps {
  /** Filename shown beside the three macOS-style dots. */
  filename?: string;
  children: ReactNode;
  /** Deep drop shadow for "floating" panels (hero terminal, config block). */
  elevated?: boolean;
  className?: string;
}

const SHADOW = '0 24px 60px rgba(0,0,0,0.5)';

/**
 * Terminal-style card: a header strip with three dots + filename over a mono
 * `<pre>` body. Syntax coloring is applied by callers via the code-syntax token
 * classes (text-code-keyword, text-code-string, …).
 */
export function CodeBlock({ filename, children, elevated = false, className = '' }: CodeBlockProps) {
  return (
    <div
      className={['border border-border-card bg-surface-term', className].join(' ')}
      style={elevated ? { boxShadow: SHADOW } : undefined}
    >
      <div className="flex items-center gap-2 border-b border-border-faint bg-surface-strip px-4 py-2.5">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-faint" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-faint" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-faint" />
        </span>
        {filename && <span className="ml-2 font-mono text-[12px] text-ink-muted">{filename}</span>}
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-relaxed text-code-default">
        {children}
      </pre>
    </div>
  );
}

export default CodeBlock;
