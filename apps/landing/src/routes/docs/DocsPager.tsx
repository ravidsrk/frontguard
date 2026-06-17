import { Link } from 'react-router-dom';
import type { PagerLink } from './shell-types';

/**
 * Docs prev/next pager matching `Docs.dc.html`: two bordered boxes with a
 * `← PREVIOUS` / `NEXT →` kicker over the page title. Ends (no `to`) render at
 * 0.4 opacity and are non-interactive ("Overview" / "You're all caught up").
 * The shared kit `Pager` uses an inline text layout; the design needs the
 * bordered-box treatment, so this is docs-scoped.
 */
export function DocsPager({ prev, next }: { prev: PagerLink; next: PagerLink }) {
  return (
    <nav
      aria-label="Pagination"
      className="grid grid-cols-2 gap-4 border-t border-border-faint pt-7"
    >
      <PagerBox link={prev} direction="prev" />
      <PagerBox link={next} direction="next" />
    </nav>
  );
}

function PagerBox({ link, direction }: { link: PagerLink; direction: 'prev' | 'next' }) {
  const isNext = direction === 'next';
  const align = isNext ? 'text-right' : 'text-left';
  const inner = (
    <>
      <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-ink-faint">
        {isNext ? 'Next →' : '← Previous'}
      </div>
      <div className="text-[15px] text-ink-bright2 transition-colors">{link.label}</div>
    </>
  );

  const box = 'border border-border-card px-5 py-[18px] block';

  if (!link.to) {
    return (
      <span aria-disabled="true" className={[box, align, 'cursor-default opacity-40'].join(' ')}>
        {inner}
      </span>
    );
  }

  return (
    <Link
      to={link.to}
      className={[
        box,
        align,
        'group transition-colors hover:border-border-hover [&_div:last-child]:hover:text-ink-hi',
      ].join(' ')}
    >
      {inner}
    </Link>
  );
}

export default DocsPager;
