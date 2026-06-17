import { useParams } from 'react-router-dom';
import { Pager } from '../components/ui';
import { Seo } from '../components/Seo';
import { getDocsPage, getDocsNeighbors } from '../lib/docs';

/** `/docs/:page` — foundation stub. The ordered page list drives breadcrumb,
 *  prev/next, and SSG getStaticPaths; t-docs fills each page's body + TOC. */
export function Component() {
  const { page = '' } = useParams();
  const doc = getDocsPage(page);

  if (!doc) {
    return (
      <div data-route="docs-page">
        <Seo title="Not found — Frontguard docs" path={`/docs/${page}`} />
        <h1 className="font-sans text-[28px] font-bold text-ink-hi">Page not found</h1>
        <p className="mt-3 text-ink-mid">No docs page exists at this address.</p>
      </div>
    );
  }

  const { prev, next } = getDocsNeighbors(doc.slug);

  return (
    <>
      <Seo title={`${doc.title} — Frontguard docs`} path={`/docs/${doc.slug}`} />
      <div data-route="docs-page" className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_224px]">
        <article className="min-w-0">
          <nav aria-label="Breadcrumb" className="font-mono text-[12px] text-ink-faint">
            {doc.section} / {doc.title}
          </nav>
          <h1
            id="overview"
            className="mt-3 font-sans text-[clamp(1.75rem,4vw,2.625rem)] font-bold tracking-[-0.035em] text-ink-hi"
          >
            {doc.title}
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-mid">
            This page is part of the Frontguard docs. Content for “{doc.title}” lands with the docs
            task; the route, navigation, and prerendering are wired here.
          </p>
          <div className="mt-12 border-t border-border-faint pt-6">
            <Pager
              prev={prev ? { label: prev.title, to: `/docs/${prev.slug}` } : { label: 'Overview' }}
              next={next ? { label: next.title, to: `/docs/${next.slug}` } : { label: "You're all caught up" }}
            />
          </div>
        </article>
        <aside aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-[88px]">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">On this page</div>
            <ul className="mt-3 flex flex-col gap-1.5">
              <li>
                <a href="#overview" className="text-[13px] text-ink-soft transition-colors hover:text-ink-bright2">
                  Overview
                </a>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
