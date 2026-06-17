import { Seo } from '../../components/Seo';
import { useHashRedirect } from './useHashRedirect';
import { Reveal } from './Reveal';
import { Hero } from './sections/Hero';
import { ProblemStrip } from './sections/ProblemStrip';
import { Pillars } from './sections/Pillars';
import { TwoWaysIn } from './sections/TwoWaysIn';
import { Pipeline } from './sections/Pipeline';
import { AiExample } from './sections/AiExample';
import { Features } from './sections/Features';
import { ConfigBlock } from './sections/ConfigBlock';
import { ComparisonSummary } from './sections/ComparisonSummary';
import { Plugins } from './sections/Plugins';
import { Honest } from './sections/Honest';
import { Validation } from './sections/Validation';
import { Cta } from './sections/Cta';

/*
  `/` — the 14-section landing page (nav + footer come from MarketingLayout).
  Sections below the fold fade in on scroll (floor item 13, degrades under
  reduced motion / no-JS). `useHashRedirect` maps legacy `/#pricing`, `/#faq`,
  and `/#comparison` links to their new routes (decisions 2–3).
*/
export function Component() {
  useHashRedirect();
  return (
    <>
      <Seo
        title="Frontguard — Catch the regression, not the noise"
        description="AI-powered visual regression testing. AI vision tells a real regression from an intentional change or content, so a red run means something again. Open-source CLI under MIT."
        path="/"
      />
      <Hero />
      <Reveal>
        <ProblemStrip />
      </Reveal>
      <Reveal>
        <Pillars />
      </Reveal>
      <Reveal>
        <TwoWaysIn />
      </Reveal>
      <Reveal>
        <Pipeline />
      </Reveal>
      <Reveal>
        <AiExample />
      </Reveal>
      <Reveal>
        <Features />
      </Reveal>
      <Reveal>
        <ConfigBlock />
      </Reveal>
      <Reveal>
        <ComparisonSummary />
      </Reveal>
      <Reveal>
        <Plugins />
      </Reveal>
      <Reveal>
        <Honest />
      </Reveal>
      <Reveal>
        <Validation />
      </Reveal>
      <Reveal>
        <Cta />
      </Reveal>
    </>
  );
}

export default Component;
