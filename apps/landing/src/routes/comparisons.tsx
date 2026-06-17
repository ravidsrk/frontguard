import { Button, Card, Container, SectionHeader } from '../components/ui';
import { Seo } from '../components/Seo';
import { HERO_Y, GRID_2 } from '../lib/responsive';
import { DOCS_EXTERNAL } from '../lib/site';
import { ComparisonMatrix } from './comparisons/ComparisonMatrix';
import { ALTERNATIVES, MIGRATIONS, VERSUS } from './comparisons/data';

const docs = (path: string) => `${DOCS_EXTERNAL}/docs/${path}`;

const ALT_TONE = { amber: 'text-amber', regression: 'text-regression' } as const;

/** `/comparisons` — Frontguard vs. everyone else (parity-spec §5 t-comparisons). */
export function Component() {
  return (
    <>
      <Seo
        title="Comparisons — Frontguard vs. everyone else"
        description="How Frontguard compares to Percy, Chromatic, BackstopJS, Lost Pixel, and Argos — capability by capability, with sources you can check."
        path="/comparisons"
      />

      {/* hero */}
      <section data-route="comparisons" className={HERO_Y}>
        <Container>
          <SectionHeader
            as="h1"
            center
            kicker="// HOW IT COMPARES"
            kickerTone="amber"
            titleClassName="text-[clamp(2rem,6vw,3.25rem)] tracking-[-0.035em] leading-[1.04]"
            title="Frontguard vs. everyone else."
            lead={
              <>
                Visual testing tools all take a screenshot and diff it. Only Frontguard explains{' '}
                <em className="not-italic text-ink-hi">why</em> something changed, verifies a fix,
                and stays open source and self-hostable.
              </>
            }
          />
        </Container>
      </section>

      {/* alternatives strip */}
      <section className="pb-3">
        <Container>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ALTERNATIVES.map((alt) => (
              <li key={alt.name} data-testid="alternative">
                <Card as="div" className="px-[18px] py-4">
                  <div className="mb-1.5 font-mono text-[13px] text-ink-bright2">{alt.name}</div>
                  <div className={['font-mono text-[12px]', ALT_TONE[alt.tone]].join(' ')}>
                    {alt.status}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* full matrix */}
      <section className="pb-10 pt-2">
        <Container>
          <ComparisonMatrix />
        </Container>
      </section>

      {/* head to head */}
      <section className="py-14">
        <Container>
          <h2 className="text-[clamp(1.75rem,4vw,2rem)] font-bold tracking-[-0.03em] text-ink-hi">
            Head to head
          </h2>
          <p className="mb-9 mt-2 text-[16px] text-ink-mid">
            The honest version — what each tool is genuinely good at, and where Frontguard pulls
            ahead.
          </p>
          <div className={GRID_2}>
            {VERSUS.map((v) => (
              <Card
                key={v.name}
                as="article"
                className="p-7 transition-[border-color] duration-150 hover:border-border-hover"
              >
                <div className="mb-[18px] flex items-center gap-3">
                  <span className="font-mono text-[13px] font-bold text-amber">frontguard</span>
                  <span className="font-mono text-[12px] text-ink-faint">vs</span>
                  <span className="font-mono text-[13px] text-ink-bright2">{v.name}</span>
                </div>
                <div className="mb-4">
                  <div className="mb-[7px] font-mono text-[11px] uppercase tracking-[0.04em] text-ink-soft">
                    {v.name} is good at
                  </div>
                  <p className="text-[14px] leading-[1.55] text-ink-mid">{v.their}</p>
                </div>
                <div className="mb-5">
                  <div className="mb-[7px] font-mono text-[11px] uppercase tracking-[0.04em] text-amber">
                    Where Frontguard wins
                  </div>
                  <p className="text-[14px] leading-[1.55] text-ink-bright2">{v.ours}</p>
                </div>
                <a
                  href={docs(v.href)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[12.5px] text-ink-soft transition-colors hover:text-ink-hi"
                >
                  {v.cta} →
                </a>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* migration */}
      <section className="border-t border-border-faint bg-surface-alt">
        <Container className="py-16">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <h2 className="mb-4 text-[clamp(1.625rem,3.5vw,1.875rem)] font-bold tracking-[-0.03em] text-ink-hi">
                Switching is a config file, not a rewrite.
              </h2>
              <p className="text-[15.5px] leading-[1.6] text-ink-mid">
                Frontguard reads your app by URL — no test files to port, no proprietary snapshot
                format. Point it at your dev server and you have baselines in one run. Migration
                guides walk through the rest.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {MIGRATIONS.map((m) => (
                <a
                  key={m.name}
                  href={docs(m.href)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="migration"
                  className="border border-border-card bg-panel px-5 py-[18px] transition-[border-color] duration-150 hover:border-border-hover"
                >
                  <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-ink-faint">
                    Migrate from
                  </div>
                  <div className="text-[16px] font-semibold text-ink-hi">{m.name}</div>
                  <div className="mt-2 font-mono text-[12px] text-amber">Read guide →</div>
                </a>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="border-t border-border-faint">
        <Container className="py-20 text-center">
          <h2 className="text-[clamp(2rem,5vw,2.5rem)] font-bold tracking-[-0.035em] text-ink-hi">
            See the difference yourself.
          </h2>
          <p className="mx-auto mb-7 mt-4 max-w-[440px] text-[17px] leading-[1.55] text-ink-mid">
            Install the CLI and run your first AI-explained visual check in two minutes.
          </p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <Button href="/docs" size="lg">
              Get started →
            </Button>
            <Button href="/pricing" variant="ghost" size="lg">
              View pricing
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}

export default Component;
