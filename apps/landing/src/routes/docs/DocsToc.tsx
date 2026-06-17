import type { MouseEvent } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { REPO_URL } from '../../lib/site';
import type { TocEntry } from './shell-types';

/**
 * Right-rail "On this page" TOC. The design renders it as static text; the spec
 * (§5 t-docs / §2.6) upgrades it to real, keyboard-navigable anchor links that
 * smooth-scroll to the section — and honor `prefers-reduced-motion` by falling
 * back to an instant jump. Hidden below `lg` (the column collapses on mobile).
 */
export function DocsToc({ entries }: { entries: TocEntry[] }) {
  const reduced = usePrefersReducedMotion();

  function handleClick(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!el) return; // no target yet: let the browser do the default hash jump
    e.preventDefault();
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    // Reflect the section in the URL without a second (instant) jump.
    if (typeof history !== 'undefined' && history.replaceState) {
      history.replaceState(null, '', `#${id}`);
    }
  }

  return (
    <div className="sticky top-[84px]">
      <div className="mb-3.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
        On this page
      </div>
      <ul className="flex flex-col">
        {entries.map((t) => (
          <li key={t.id}>
            <a
              href={`#${t.id}`}
              onClick={(e) => handleClick(e, t.id)}
              className="block py-[5px] text-[13px] leading-[1.4] text-ink-muted transition-colors hover:text-ink-bright2"
            >
              {t.label}
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-6 border-t border-border-faint pt-5">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-amber px-3 py-2.5 text-center font-mono text-[12px] font-bold text-canvas transition-colors hover:bg-amber-hover"
        >
          ★ Star on GitHub
        </a>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block text-center font-mono text-[11px] text-ink-dim transition-colors hover:text-ink-hi"
        >
          Edit this page ↗
        </a>
      </div>
    </div>
  );
}

export default DocsToc;
