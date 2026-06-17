import { Container, SectionHeader } from '../components/ui';
import { Seo } from '../components/Seo';
import { HERO_Y } from '../lib/responsive';

/** `/changelog` — foundation stub (t-changelog fills the release timeline). */
export function Component() {
  return (
    <>
      <Seo
        title="Changelog — Frontguard"
        description="What's new in Frontguard: releases, added features, and changes, sourced from the project CHANGELOG."
        path="/changelog"
      />
      <section data-route="changelog" className={HERO_Y}>
        <Container width="changelog">
          <SectionHeader
            as="h1"
            titleClassName="text-[clamp(1.9rem,5.5vw,3rem)] tracking-[-0.035em] leading-[1.04]"
            title="What's new in Frontguard"
            lead="Every release, what it added, and what changed."
          />
        </Container>
      </section>
    </>
  );
}
