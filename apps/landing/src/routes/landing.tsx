import { Badge, Button, Container, CopyCommand } from '../components/ui';
import { Seo } from '../components/Seo';
import { HERO_Y, HERO_H1 } from '../lib/responsive';

/**
 * `/` — foundation stub. The t-landing task fills the 14 Landing sections; this
 * establishes the route, the per-route metadata, and the kit wiring.
 */
export function Component() {
  return (
    <>
      <Seo
        title="Frontguard — Catch the regression, not the noise"
        description="AI-powered visual regression testing. Detect, understand, and fix visual bugs before they ship. Open-source CLI under MIT."
        path="/"
      />
      <section data-route="landing" className={HERO_Y}>
        <Container>
          <Badge tone="amber" dot pulse>
            open source · MIT · self-hostable
          </Badge>
          <h1 className={`mt-6 max-w-3xl text-ink-hi ${HERO_H1}`}>
            Catch the regression, not the noise.
          </h1>
          <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-ink-mid">
            AI vision tells a real regression from intentional change and content, so a red run
            means something again.
          </p>
          <div className="mt-7 max-w-md">
            <CopyCommand command="npm install @frontguard/cli" />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button href="/docs" size="lg">
              Get started →
            </Button>
            <Button href="https://github.com/ravidsrk/frontguard" external variant="ghost" size="lg">
              ★ Star on GitHub
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
