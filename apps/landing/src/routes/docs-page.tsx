import { useParams } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { getDocsPage, getDocsNeighbors } from '../lib/docs';
import { getDocContent } from './docs/content';
import { DocsPageShell } from './docs/DocsPageShell';

/**
 * `/docs/:page` — a single docs page. The ordered page list (`lib/docs.ts`)
 * drives the breadcrumb and prev/next pager; the content registry
 * (`docs/content.tsx`) supplies the body and the section list that becomes the
 * right-rail TOC. Unknown slugs render a not-found body (never prerendered:
 * `getStaticPaths` only enumerates real slugs).
 */
export function Component() {
  const { page = '' } = useParams();
  const doc = getDocsPage(page);

  if (!doc) {
    return (
      <div data-route="docs-page">
        <Seo title="Not found — Frontguard docs" path={`/docs/${page}`} />
        <nav aria-label="Breadcrumb" className="mb-[18px] font-mono text-[12px]">
          <span className="text-amber">docs</span>
          <span className="text-ink-muted"> / not found</span>
        </nav>
        <h1 className="font-sans text-[28px] font-bold text-ink-hi">Page not found</h1>
        <p className="mt-3 text-ink-mid">No docs page exists at this address.</p>
      </div>
    );
  }

  const content = getDocContent(doc.slug);
  const { prev, next } = getDocsNeighbors(doc.slug);
  const toc = content?.sections.map((s) => ({ id: s.id, label: s.label })) ?? [];

  return (
    <>
      <Seo
        title={`${doc.title} — Frontguard docs`}
        description={`${doc.title} — Frontguard documentation. ${doc.section} guide for AI-powered visual regression testing.`}
        path={`/docs/${doc.slug}`}
      />
      <DocsPageShell
        section={doc.section}
        page={doc.title}
        toc={toc}
        prev={prev ? { label: prev.title, to: `/docs/${prev.slug}` } : { label: 'Overview', to: '/docs' }}
        next={next ? { label: next.title, to: `/docs/${next.slug}` } : { label: "You're all caught up" }}
      >
        <article data-route="docs-page" className="flex flex-col gap-8">
          <header className="flex flex-col gap-[18px]">
            <h1 className="font-sans text-[clamp(2rem,5vw,2.625rem)] font-bold leading-[1.05] tracking-[-0.035em] text-ink-hi">
              {doc.title}
            </h1>
            {content?.lead}
          </header>
          {content?.sections.map((s) => <section key={s.id}>{s.node}</section>)}
        </article>
      </DocsPageShell>
    </>
  );
}
