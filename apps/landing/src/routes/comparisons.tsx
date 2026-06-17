import { Container, SectionHeader } from '../components/ui';
import { Seo } from '../components/Seo';
import { HERO_Y } from '../lib/responsive';

/** `/comparisons` — foundation stub (t-comparisons fills the full 11-row matrix). */
export function Component() {
  return (
    <>
      <Seo
        title="Comparisons — Frontguard vs. everyone else"
        description="How Frontguard compares to Percy, Chromatic, BackstopJS, Lost Pixel, and Argos — validated against real repos."
        path="/comparisons"
      />
      <section data-route="comparisons" className={HERO_Y}>
        <Container>
          <SectionHeader
            as="h1"
            titleClassName="text-[clamp(2rem,6vw,3.25rem)] tracking-[-0.035em] leading-[1.04]"
            title="Frontguard vs. everyone else."
            lead="Validated against real repositories — not marketing claims."
          />
        </Container>
      </section>
    </>
  );
}
