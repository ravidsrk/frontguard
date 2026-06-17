import type { ReactNode } from 'react';
import { DocsToc } from './DocsToc';
import { DocsPager } from './DocsPager';
import type { PagerLink, TocEntry } from './shell-types';

/**
 * The content + right-rail layout shared by `/docs` (overview) and
 * `/docs/:page`. The 256px sidebar lives in `DocsLayout`; this fills the
 * remaining columns: a breadcrumb, the article body, the prev/next pager, and a
 * 224px TOC rail that collapses below `lg` (spec §2.6 responsive rule).
 */
export function DocsPageShell({
  section,
  page,
  toc,
  prev,
  next,
  children,
}: {
  section: string;
  page: string;
  toc: TocEntry[];
  prev: PagerLink;
  next: PagerLink;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_224px]">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-[18px] font-mono text-[12px]">
          <span className="text-amber">{section}</span>
          <span className="text-ink-muted"> / {page}</span>
        </nav>
        {children}
        <div className="mt-12">
          <DocsPager prev={prev} next={next} />
        </div>
      </div>
      <aside aria-label="On this page" className="hidden lg:block">
        <DocsToc entries={toc} />
      </aside>
    </div>
  );
}

export default DocsPageShell;
