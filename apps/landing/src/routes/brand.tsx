import { Card, Container, Logo, SectionHeader } from '../components/ui';
import { Seo } from '../components/Seo';
import { HERO_Y } from '../lib/responsive';

/** `/brand` — foundation stub. Shows the three lockups; t-brand fills the full styleguide. */
export function Component() {
  return (
    <>
      <Seo
        title="Brand — The Frontguard brand system"
        description="The Frontguard brand system: the amber shield mark, three lockups, color tokens, typography, and voice."
        path="/brand"
      />
      <section data-route="brand" className={HERO_Y}>
        <Container width="brand">
          <SectionHeader
            as="h1"
            titleClassName="text-[clamp(2rem,5.5vw,3.25rem)] tracking-[-0.04em] leading-[1.0]"
            title="The Frontguard brand system."
            lead="A terminal-native identity: sharp, precise, mono-forward."
          />
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            <Card className="flex flex-col items-center gap-5 px-7 py-9">
              <Logo variant="primary" height={36} cursor />
              <span className="font-mono text-[11px] text-ink-faint">PRIMARY LOCKUP</span>
            </Card>
            <Card className="flex flex-col items-center gap-5 bg-ink-hi px-7 py-9">
              <Logo variant="mono-light" height={36} />
              <span className="font-mono text-[11px] text-ink-soft2">MONO · ON LIGHT</span>
            </Card>
            <Card className="flex flex-col items-center gap-5 px-7 py-9">
              <Logo variant="mark" height={46} />
              <span className="font-mono text-[11px] text-ink-faint">MARK · APP ICON</span>
            </Card>
          </div>
        </Container>
      </section>
    </>
  );
}
