import { Link } from 'react-router-dom';

interface PagerLink {
  label: string;
  to?: string;
}

interface PagerProps {
  prev?: PagerLink;
  next?: PagerLink;
  className?: string;
}

/** Docs prev/next pager; ends render disabled at 0.4 opacity (no `to`). */
export function Pager({ prev, next, className = '' }: PagerProps) {
  return (
    <nav aria-label="Pagination" className={['flex items-center justify-between gap-4', className].join(' ')}>
      <PagerSide link={prev} direction="prev" />
      <PagerSide link={next} direction="next" />
    </nav>
  );
}

function PagerSide({ link, direction }: { link?: PagerLink; direction: 'prev' | 'next' }) {
  const arrow = direction === 'prev' ? '←' : '→';
  const align = direction === 'prev' ? 'text-left' : 'text-right ml-auto';
  const content = (
    <span className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-faint">
        {direction === 'prev' ? 'Previous' : 'Next'}
      </span>
      <span className="text-[14px] text-ink-hi">
        {direction === 'prev' && <span aria-hidden="true">{arrow} </span>}
        {link?.label}
        {direction === 'next' && <span aria-hidden="true"> {arrow}</span>}
      </span>
    </span>
  );

  if (!link?.to) {
    return (
      <span aria-disabled="true" className={['opacity-40 cursor-default', align].join(' ')}>
        {content}
      </span>
    );
  }
  return (
    <Link
      to={link.to}
      className={['transition-opacity hover:opacity-80', align].join(' ')}
    >
      {content}
    </Link>
  );
}

export default Pager;
