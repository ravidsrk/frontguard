import { Card, SectionHeader } from '../../../components/ui';
import { GRID_2 } from '../../../lib/responsive';
import { InstallTabs } from './InstallTabs';

function CardHeader({ name, pkg }: { name: string; pkg: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-faint px-5 py-3.5">
      <span className="font-mono text-[13px] font-medium text-ink-hi">{name}</span>
      <span className="font-mono text-[11px] text-ink-faint">{pkg}</span>
    </div>
  );
}

/*
  "Run it your way": the design's two entry-point cards (Standalone CLI +
  Playwright-native) followed by the floor's full 3-path install surface as a
  keyboard-accessible tablist (CLI / Playwright / GitHub Action).
*/
export function TwoWaysIn() {
  return (
    <section className="mx-auto max-w-[1200px] px-7 pt-[84px]">
      <SectionHeader
        kicker="// RUN IT YOUR WAY"
        kickerTone="amber"
        title="One command, or three lines."
        lead="Run it standalone against any URL, or drop visual assertions straight into the Playwright suite you already have. No proprietary snapshot format, no test files to port."
        as="h2"
      />

      <div className={`mt-11 ${GRID_2}`}>
        <Card hoverLift className="overflow-hidden">
          <CardHeader name="Standalone CLI" pkg="@frontguard/cli" />
          <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-[1.8] text-ink-bright2">
            <span className="text-ink-muted">$</span> npx frontguard run \{'\n'}
            {'    --url http://localhost:3000'}
            {'\n\n'}
            <span className="text-pass">{'  ✓ 11 passed'}</span>
            {'   '}
            <span className="text-regression">✘ 1 regression</span>
            {'\n'}
            <span className="text-ink-faint">{'  AI: "submit button lost its background"'}</span>
          </pre>
          <p className="px-5 pb-5 text-[13.5px] leading-[1.55] text-ink-soft">
            Point it at any URL. It auto-discovers routes, renders, diffs, and posts the verdict —
            zero test files to write.
          </p>
        </Card>

        <Card hoverLift className="overflow-hidden">
          <CardHeader name="Playwright-native" pkg="@frontguard/playwright" />
          <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-[1.8] text-ink-mid">
            <span className="text-code-keyword">import</span> {'{ expectVisual } '}
            <span className="text-code-keyword">from</span>{' '}
            <span className="text-code-string">'@frontguard/playwright'</span>;{'\n\n'}
            test(<span className="text-code-string">'home page'</span>,{' '}
            <span className="text-code-keyword">async</span> ({'{ page }'}) =&gt; {'{'}
            {'\n  '}
            <span className="text-code-keyword">await</span> page.goto(
            <span className="text-code-string">'/'</span>);
            {'\n  '}
            <span className="text-code-keyword">await</span> expectVisual(page);
            {'\n'}
            {'});'}
          </pre>
          <p className="px-5 pb-5 text-[13.5px] leading-[1.55] text-ink-soft">
            Three lines in a test you already wrote. Reuses the page Playwright just rendered — no
            second browser launch.
          </p>
        </Card>
      </div>

      <InstallTabs />
    </section>
  );
}

export default TwoWaysIn;
