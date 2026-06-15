import { useInView } from '../hooks/useInView';

interface QA {
  q: string;
  a: React.ReactNode;
}

const faqs: QA[] = [
  {
    q: 'How do I install Frontguard?',
    a: (
      <>
        <p>
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">npm install @frontguard/cli</code> installs the engine. Run <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">npx frontguard init</code> to write a typed
          config and <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">npx frontguard run --url …</code> to do your first scan. The
          Playwright plugin is a thin wrapper:{' '}
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">npm install -D @frontguard/cli @frontguard/playwright</code>.
        </p>
      </>
    ),
  },
  {
    q: 'How does Frontguard handle cross-OS rendering differences?',
    a: (
      <>
        <p>
          Playwright's own docs warn that local rendering varies by OS and
          hardware — that's why <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">toHaveScreenshot</code> embeds <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">chromium-darwin</code> in
          the baseline filename. Frontguard ships a pinned Docker
          renderer image (Chromium / Firefox / WebKit + system fonts) so
          baselines render byte-equivalently on macOS, Linux and CI.
          Enable with <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">frontguard run --docker</code>.
        </p>
      </>
    ),
  },
  {
    q: 'Can I self-host the cloud?',
    a: (
      <>
        <p>
          Yes. The cloud (Hono on Cloudflare Workers + D1 + R2) is
          MIT-licensed and runs locally via{' '}
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">docker-compose up</code> — miniflare for the
          Worker runtime, SQLite in place of D1, and a local-disk adapter
          in place of R2. The same images that run on Cloudflare run on
          your laptop.
        </p>
      </>
    ),
  },
  {
    q: 'What environment variables does Frontguard read?',
    a: (
      <>
        <p>
          AI: <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">FRONTGUARD_OPENAI_KEY</code> or <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">FRONTGUARD_ANTHROPIC_KEY</code> (the
          Playwright plugin also accepts the unprefixed{' '}
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">OPENAI_API_KEY</code> / <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">ANTHROPIC_API_KEY</code> when present).
          Cloud:{' '}
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">FRONTGUARD_API_URL</code> and{' '}
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">FRONTGUARD_API_KEY</code> point the CLI at your
          hosted or self-hosted endpoint. <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">frontguard doctor</code> reads exactly
          the same env names the runtime reads — no silent mismatch.
        </p>
      </>
    ),
  },
  {
    q: 'OpenAI or Anthropic — which should I use?',
    a: (
      <>
        <p>
          Either works. Frontguard sends the diff image, the DOM
          snapshot, console errors and axe-core findings; the model
          returns a structured classification + fix. Anthropic's Claude
          Sonnet is the default when both keys are present (longer
          context for the a11y-fused prompt); OpenAI's GPT-4o is the
          fallback. Switch at any time with{' '}
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">ai.provider</code> in <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">frontguard.config.ts</code>.
        </p>
      </>
    ),
  },
  {
    q: 'Does Frontguard work with Storybook?',
    a: (
      <>
        <p>
          Yes. <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">frontguard init</code> detects an existing
          Storybook (looks for <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">.storybook/main.ts</code>) and scaffolds a
          Storybook-aware config. The adapter walks the Storybook iframe,
          runs each story's <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">play()</code> function, and produces one
          screenshot per story × viewport — the same component-level
          visual tests Chromatic ships, against an open-source engine.
        </p>
      </>
    ),
  },
  {
    q: 'Is there an MCP server for in-IDE agents?',
    a: (
      <>
        <p>
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">@frontguard/mcp</code> exposes <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">list_regressions(pr_id)</code>,
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]"> get_suggested_fix(diff_id)</code>,{' '}
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">accept_baseline(diff_id)</code> and{' '}
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">recent_runs(repo, branch)</code> to Claude Code,
          Cursor, Cline and Copilot. Authenticated with the same API key
          the cloud uses; run as{' '}
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">npx @frontguard/mcp</code> and drop the snippet
          into your <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">mcp.json</code>.
        </p>
      </>
    ),
  },
  {
    q: "What's the data retention policy for screenshots?",
    a: (
      <>
        <p>
          The CLI never sends screenshots anywhere except the AI
          provider you configured (your key, your account). On the
          hosted cloud, baselines and diff thumbnails are stored in R2
          under your team scope; default retention is 30 days on Pro,
          configurable up to 1 year on Enterprise. Activity-feed PII is
          redacted per the policy at{' '}
          <a
            href="https://github.com/ravidsrk/frontguard/blob/main/docs/retention.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-2 hover:underline"
          >
            docs/retention.md
          </a>
          . Delete everything for a team with one{' '}
          <code className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-accent)]">DELETE /v1/teams/:id/data</code> call.
        </p>
      </>
    ),
  },
];

export default function FAQ() {
  const { ref, inView } = useInView();

  return (
    <section
      ref={ref}
      id="faq"
      aria-labelledby="faq-heading"
      className="border-t border-[var(--color-border)] py-24 lg:py-32"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className={`text-center ${inView ? 'animate-fade-up' : 'opacity-0'}`}>
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-[var(--color-text-dim)]">
            FAQ
          </p>
          <h2
            id="faq-heading"
            className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)] [text-wrap:balance] sm:text-3xl md:text-4xl"
          >
            Eight questions, eight straight answers.
          </h2>
        </div>

        <div className="mt-12 flex flex-col gap-3">
          {faqs.map((faq, i) => (
            <details
              key={faq.q}
              className={`group rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] transition-colors hover:border-[var(--color-border-bright)] open:border-[var(--color-border-bright)] ${inView ? 'animate-fade-up' : 'opacity-0'}`}
              style={{ animationDelay: `${100 + i * 60}ms` }}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-text)] [&::-webkit-details-marker]:hidden">
                <span className="[text-wrap:balance]">{faq.q}</span>
                <svg
                  className="h-4 w-4 shrink-0 text-[var(--color-text-dim)] transition-transform group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 16 16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="4 6 8 10 12 6" />
                </svg>
              </summary>
              <div className="border-t border-[var(--color-border)] px-5 py-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
