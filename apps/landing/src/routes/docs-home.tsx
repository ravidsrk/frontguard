import { Pager } from '../components/ui';
import { Seo } from '../components/Seo';
import { DOCS_PAGES } from '../lib/docs';

/** `/docs` — foundation stub for the docs home (t-docs fills the introduction page). */
export function Component() {
  const first = DOCS_PAGES[0];
  return (
    <>
      <Seo
        title="Documentation — Frontguard"
        description="Frontguard documentation: installation, CLI reference, configuration, AI analysis, CI/CD, and self-hosting."
        path="/docs"
      />
      <div data-route="docs">
        <nav aria-label="Breadcrumb" className="font-mono text-[12px] text-ink-faint">
          docs / overview
        </nav>
        <h1 className="mt-3 font-sans text-[clamp(1.75rem,4vw,2.625rem)] font-bold tracking-[-0.035em] text-ink-hi">
          Frontguard documentation
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-mid">
          Everything you need to detect, understand, and fix visual regressions — from your first
          scan to self-hosting the cloud.
        </p>
        <div className="mt-12">
          <Pager next={{ label: first.title, to: `/docs/${first.slug}` }} />
        </div>
      </div>
    </>
  );
}
