import { CodeBlock, SectionHeader } from '../../../components/ui';

/* Configuration section: copy on the left, a syntax-highlighted config on the right. */
export function ConfigBlock() {
  return (
    <section className="border-t border-border-faint bg-surface-alt">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-7 py-[84px] lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <SectionHeader
            kicker="// CONFIGURATION"
            kickerTone="amber"
            title="One file. Sensible defaults."
            titleClassName="text-[clamp(1.85rem,4.5vw,2.25rem)] tracking-[-0.03em]"
            as="h2"
          />
          <p className="mt-[18px] text-[15.5px] leading-relaxed text-ink-mid">
            Auto-discover routes by crawling, or list them explicitly. Set per-route thresholds —
            strict on <span className="font-mono text-[13px] text-amber">/checkout</span>, relaxed on{' '}
            <span className="font-mono text-[13px] text-amber">/blog</span>.
          </p>
          <p className="mt-4 text-[15.5px] leading-relaxed text-ink-mid">
            <span className="font-mono text-[13px] text-ink-hi">frontguard init</span> auto-detects
            Next.js, Remix, SvelteKit, Nuxt or Astro and writes this for you.
          </p>
        </div>

        <CodeBlock filename="frontguard.config.ts" elevated>
          <span className="text-code-keyword">export default</span> {'{'}
          {'\n  '}baseUrl: <span className="text-code-string">'http://localhost:3000'</span>,{'\n\n  '}
          <span className="text-code-comment">// auto-discover routes (zero config)</span>
          {'\n  '}discover: {'{'}
          {'\n    '}startUrl: <span className="text-code-string">'/'</span>,
          {'\n    '}maxDepth: <span className="text-code-number">3</span>,
          {'\n    '}exclude: [<span className="text-code-string">'/admin/*'</span>,{' '}
          <span className="text-code-string">'/api/*'</span>],
          {'\n  '}
          {'},'}
          {'\n\n  '}viewports: [<span className="text-code-number">375</span>,{' '}
          <span className="text-code-number">768</span>,{' '}
          <span className="text-code-number">1440</span>],
          {'\n  '}browsers: [<span className="text-code-string">'chromium'</span>],
          {'\n  '}threshold: <span className="text-code-number">0.1</span>,{'\n\n  '}
          <span className="text-code-comment">// AI analysis (optional, BYOK)</span>
          {'\n  '}ai: {'{ '}provider: <span className="text-code-string">'openai'</span>, model:{' '}
          <span className="text-code-string">'gpt-4o'</span>
          {' }'},
          {'\n'}
          {'};'}
        </CodeBlock>
      </div>
    </section>
  );
}

export default ConfigBlock;
