import { Badge, Container, SectionHeader } from '../components/ui';
import { Seo } from '../components/Seo';
import { HERO_Y } from '../lib/responsive';

/** `/pricing` — foundation stub (t-pricing fills tiers, matrix, FAQ, CTA). */
export function Component() {
  return (
    <>
      <Seo
        title="Pricing — Frontguard"
        description="The CLI is free forever under MIT. Pro hosted cloud at $29/mo. Pricing that respects open source."
        path="/pricing"
      />
      <section data-route="pricing" className={HERO_Y}>
        <Container className="text-center">
          <div className="flex justify-center">
            <Badge tone="pass">the CLI is free forever · MIT</Badge>
          </div>
          <SectionHeader
            as="h1"
            center
            className="mt-6"
            titleClassName="text-[clamp(2rem,6vw,3.375rem)] tracking-[-0.035em] leading-[1.04]"
            title="Pricing that respects open source."
            lead="Free CLI forever. Upgrade to Pro only when you outgrow it."
          />
        </Container>
      </section>
    </>
  );
}
