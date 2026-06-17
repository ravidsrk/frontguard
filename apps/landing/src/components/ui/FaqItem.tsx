import type { ReactNode } from 'react';

interface FaqItemProps {
  question: ReactNode;
  children: ReactNode;
  /** Render open by default (the design shows answers expanded). */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Native `<details>` accordion with the design's hover-border. Keeps the floor's
 * accordion semantics while matching the new card styling.
 */
export function FaqItem({ question, children, defaultOpen = false, className = '' }: FaqItemProps) {
  return (
    <details
      open={defaultOpen}
      className={[
        'group border border-border-card bg-panel transition-[border-color] duration-150 hover:border-border-hover',
        className,
      ].join(' ')}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-[15.5px] font-medium text-ink-hi marker:content-['']">
        {question}
        <span aria-hidden="true" className="font-mono text-ink-soft transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="px-5 pb-5 text-[14.5px] leading-relaxed text-ink-mid">{children}</div>
    </details>
  );
}

export default FaqItem;
