import { Link } from 'react-router-dom';
import { Card } from '../components/ui';
import { Seo } from '../components/Seo';
import { DOCS_NAV, DOCS_PAGES } from '../lib/docs';
import { DocsPageShell } from './docs/DocsPageShell';
import { Lead } from './docs/primitives';

/**
 * `/docs` — the docs overview. The design opens directly on the Introduction
 * page, but the foundation routing splits that into an overview index plus
 * `/docs/:page` sub-pages (one prerendered HTML each, better for crawl/deep
 * links). This page orients the reader and routes into the twelve pages; the
 * full Introduction (DETECT/UNDERSTAND, PREREQUISITES, pipeline) lives at
 * `/docs/introduction`.
 */

const START_HERE = [
  { slug: 'introduction', title: 'Introduction', blurb: 'What Frontguard is and how the six-stage pipeline works.' },
  { slug: 'installation', title: 'Installation', blurb: 'Install the CLI, detect your framework, set env vars.' },
  { slug: 'quick-start', title: 'Quick start', blurb: 'Run your first visual check in two minutes.' },
];

export function Component() {
  const first = DOCS_PAGES[0];

  return (
    <>
      <Seo
        title="Documentation — Frontguard"
        description="Frontguard documentation: installation, CLI reference, configuration, AI analysis, CI/CD, and self-hosting."
        path="/docs"
      />
      <DocsPageShell
        section="docs"
        page="overview"
        toc={[
          { id: 'start-here', label: 'Start here' },
          { id: 'browse', label: 'Browse the docs' },
        ]}
        prev={{ label: 'Overview' }}
        next={{ label: first.title, to: `/docs/${first.slug}` }}
      >
        <div data-route="docs" className="flex flex-col gap-8">
          <header className="flex flex-col gap-[18px]">
            <h1 className="font-sans text-[clamp(2rem,5vw,2.625rem)] font-bold leading-[1.05] tracking-[-0.035em] text-ink-hi">
              Frontguard documentation
            </h1>
            <Lead>
              Everything you need to detect, understand, and fix visual regressions — from your first
              scan to self-hosting the cloud. CLI-first, MIT licensed, bring your own AI key.
            </Lead>
          </header>

          <section id="start-here" className="flex scroll-mt-24 flex-col gap-3.5">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
              Start here
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              {START_HERE.map((p) => (
                <Card key={p.slug} as="article" hoverLift className="p-0">
                  <Link to={`/docs/${p.slug}`} className="block p-[22px]">
                    <div className="mb-2 text-[16px] font-semibold text-ink-hi">{p.title}</div>
                    <p className="text-[13.5px] leading-[1.55] text-ink-soft">{p.blurb}</p>
                    <span className="mt-3 inline-block font-mono text-[12px] text-amber">Read →</span>
                  </Link>
                </Card>
              ))}
            </div>
          </section>

          <section id="browse" className="flex scroll-mt-24 flex-col gap-3.5">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
              Browse the docs
            </div>
            <div className="grid grid-cols-1 gap-px border border-border-faint bg-border-faint sm:grid-cols-2">
              {DOCS_NAV.map((group) => (
                <div key={group.section} className="bg-canvas px-5 py-[18px]">
                  <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                    {group.section}
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {group.items.map((item) => (
                      <li key={item.slug}>
                        <Link
                          to={`/docs/${item.slug}`}
                          className="text-[14px] text-ink-soft transition-colors hover:text-ink-hi"
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DocsPageShell>
    </>
  );
}
