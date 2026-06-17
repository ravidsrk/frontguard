import {
  Badge,
  Button,
  Container,
  ComparisonTable,
  CopyCommand,
  FaqItem,
} from '../components/ui';
import type { CmpCell, CmpRow } from '../components/ui';
import { Seo } from '../components/Seo';
import { HERO_Y, BAND_Y } from '../lib/responsive';

/* ---- Data ---------------------------------------------------------------- */

type TierAccent = 'neutral' | 'amber' | 'new';

/** Per-tier accent drives the tier label and the check glyphs (design colors
 *  the ✓ by tier: neutral grey / amber / blue, not a uniform green). */
const ACCENT_CLASS: Record<TierAccent, string> = {
  neutral: 'text-ink-soft',
  amber: 'text-amber',
  new: 'text-new',
};

interface Tier {
  name: string;
  accent: TierAccent;
  featured: boolean;
  price: string;
  per: string;
  tagline: string;
  /** Floor CTAs: install anchor, external signup (new tab), mailto enterprise. */
  cta: { label: string; href: string; external: boolean };
  featuresLabel: string;
  features: string[];
}

const TIERS: Tier[] = [
  {
    name: 'OPEN SOURCE',
    accent: 'neutral',
    featured: false,
    price: '$0',
    per: '/ forever',
    tagline: 'The full CLI. Everything you need to catch visual bugs in CI.',
    cta: { label: 'npm install @frontguard/cli', href: '/#install', external: false },
    featuresLabel: 'INCLUDES',
    features: [
      'Unlimited screenshots & routes',
      'Multi-browser & multi-viewport',
      'AI analysis (bring your own key)',
      'AI fix generation + sandbox verification',
      'Git-native baselines',
      'GitHub Action + PR comments',
      'All 5 plugins, self-hostable',
    ],
  },
  {
    name: 'PRO',
    accent: 'amber',
    featured: true,
    price: '$29',
    per: '/ month',
    tagline: 'A hosted dashboard and managed baselines for solo devs and small teams.',
    cta: { label: 'Start 14-day trial', href: 'https://app.frontguard.dev/signup', external: true },
    featuresLabel: 'EVERYTHING IN OPEN SOURCE, PLUS',
    features: [
      'Hosted dashboard & report history',
      'Managed baseline storage (R2)',
      'Slack & PagerDuty alerts',
      'Cross-OS reference rendering',
      'Priority support',
    ],
  },
  {
    name: 'TEAM',
    accent: 'new',
    featured: false,
    price: "Let's talk",
    per: '',
    tagline: 'Multi-tenant teams, roles, approvals and SSO for organizations.',
    cta: {
      label: 'Contact us',
      href: 'mailto:hello@frontguard.dev?subject=Enterprise%20Frontguard',
      external: true,
    },
    featuresLabel: 'EVERYTHING IN PRO, PLUS',
    features: [
      'Teams, roles & invitations',
      'Baseline approval workflows',
      'Activity feed & audit log',
      'Usage metering & seat billing',
      'OpenTelemetry metrics export',
      'SSO & dedicated support',
    ],
  },
];

const yes: CmpCell = { kind: 'glyph', glyph: 'full' };
const dash: CmpCell = { kind: 'text', text: '—', tone: 'muted' };
const text = (t: string, tone: 'ink' | 'amber'): CmpCell => ({ kind: 'text', text: t, tone });

/** Compare-plans matrix: 9 rows over Open Source / Pro / Team. Cell-to-color
 *  mapping (✓ pass-green, — muted, Git/CLI/Webhook ink, R2 amber) is data. */
const MATRIX: CmpRow[] = [
  { capability: 'CLI — render, diff, report', cells: [yes, yes, yes] },
  { capability: 'AI analysis (BYOK)', cells: [yes, yes, yes] },
  { capability: 'AI fix generation & verification', cells: [yes, yes, yes] },
  { capability: 'Hosted dashboard & history', cells: [dash, yes, yes] },
  {
    capability: 'Managed baseline storage',
    cells: [text('Git', 'ink'), text('R2', 'amber'), text('R2', 'amber')],
  },
  { capability: 'Production monitoring scheduler', cells: [text('CLI', 'ink'), dash, yes] },
  { capability: 'Slack / PagerDuty alerts', cells: [text('Webhook', 'ink'), yes, yes] },
  { capability: 'Teams, roles & approvals', cells: [dash, dash, yes] },
  { capability: 'SSO & audit log', cells: [dash, dash, yes] },
];

interface Faq {
  q: string;
  a: string;
}

/** Floor FAQ: all eight questions (GAP-FILL from the 5 design cards), with the
 *  truthful answers carried over from the original FAQPage JSON-LD. One source
 *  for both the rendered accordions and the structured data below. */
const FAQS: Faq[] = [
  {
    q: 'How do I install Frontguard?',
    a: 'Run npm install @frontguard/cli to install the engine, then npx frontguard init to write a typed config and npx frontguard run --url <your URL> to do your first scan. The Playwright plugin is a thin wrapper: npm install -D @frontguard/cli @frontguard/playwright.',
  },
  {
    q: 'How does Frontguard handle cross-OS rendering differences?',
    a: "Playwright's own docs warn that local rendering varies by OS and hardware. Frontguard ships a pinned Docker renderer image with Chromium, Firefox, and WebKit so baselines render byte-equivalently on macOS, Linux, and CI. Enable with frontguard run --docker.",
  },
  {
    q: 'Can I self-host the cloud?',
    a: 'Yes. The cloud (Hono on Cloudflare Workers with D1 and R2) is MIT-licensed and runs locally via docker-compose up — miniflare for the Worker runtime, SQLite in place of D1, and a local-disk adapter in place of R2.',
  },
  {
    q: 'What environment variables does Frontguard read?',
    a: 'For AI: FRONTGUARD_OPENAI_KEY or FRONTGUARD_ANTHROPIC_KEY. The Playwright plugin also accepts unprefixed OPENAI_API_KEY / ANTHROPIC_API_KEY when present. For the hosted cloud: FRONTGUARD_API_URL and FRONTGUARD_API_KEY. frontguard doctor reads exactly the same env names the runtime reads.',
  },
  {
    q: 'OpenAI or Anthropic — which should I use?',
    a: 'Either works. Frontguard sends the diff image, the DOM snapshot, console errors, and axe-core findings. Claude Sonnet is the default when both keys are present; GPT-4o is the fallback. Switch with ai.provider in frontguard.config.ts.',
  },
  {
    q: 'Does Frontguard work with Storybook?',
    a: "Yes. frontguard init detects an existing Storybook (looks for .storybook/main.ts) and scaffolds a Storybook-aware config. The adapter walks the Storybook iframe, runs each story's play() function, and produces one screenshot per story by viewport.",
  },
  {
    q: 'Is there an MCP server for in-IDE agents?',
    a: '@frontguard/mcp exposes list_regressions(pr_id), get_suggested_fix(diff_id), accept_baseline(diff_id), and recent_runs(repo, branch) to Claude Code, Cursor, Cline, and Copilot. Run as npx @frontguard/mcp and drop the snippet into your mcp.json.',
  },
  {
    q: "What's the data retention policy for screenshots?",
    a: 'The CLI never sends screenshots anywhere except the AI provider you configured. On the hosted cloud, baselines and diff thumbnails are stored in R2 under your team scope; default retention is 30 days on Pro, configurable up to 1 year on Enterprise.',
  },
];

/** FAQPage structured data for this route, derived from the same FAQS. */
const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

/* ---- Subcomponents ------------------------------------------------------- */

function TierCard({ tier }: { tier: Tier }) {
  return (
    <div
      className={[
        'relative flex flex-col px-7 py-8',
        tier.featured ? 'border border-amber-brd bg-amber-tint2' : 'border border-border-card bg-panel',
      ].join(' ')}
    >
      {tier.featured && (
        <span className="absolute -top-px right-6 whitespace-nowrap bg-amber px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-canvas">
          Most popular
        </span>
      )}
      <div className={['font-mono text-[13px] tracking-[0.04em]', ACCENT_CLASS[tier.accent]].join(' ')}>
        {tier.name}
      </div>
      <div className="mt-3.5 flex items-baseline gap-1.5">
        <span className="font-sans text-[44px] font-bold leading-none tracking-[-0.03em] text-ink-hi">
          {tier.price}
        </span>
        {tier.per && <span className="font-mono text-[13px] text-ink-muted">{tier.per}</span>}
      </div>
      <p className="mb-[22px] mt-1.5 min-h-[42px] text-[14px] leading-[1.5] text-ink-soft">{tier.tagline}</p>
      <Button
        href={tier.cta.href}
        external={tier.cta.external}
        variant={tier.featured ? 'primary' : 'ghost'}
        size="md"
        className="w-full"
      >
        {tier.cta.label}
      </Button>
      <div className="my-6 h-px bg-border-faint" />
      <div className="mb-3.5 font-mono text-[11px] tracking-[0.06em] text-ink-faint">{tier.featuresLabel}</div>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {tier.features.map((f) => (
          <li key={f} className="flex gap-2.5 text-[14px] leading-[1.45] text-ink-bright">
            <span aria-hidden="true" className={['flex-shrink-0 font-mono', ACCENT_CLASS[tier.accent]].join(' ')}>
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---- Route --------------------------------------------------------------- */

/** `/pricing` — hero, three tiers, compare-plans matrix, FAQ, CTA band. */
export function Component() {
  return (
    <>
      <Seo
        title="Pricing — Frontguard"
        description="The CLI is free forever under MIT. Pro hosted cloud at $29/mo. No per-screenshot pricing cliff, no dashboard lock-in."
        path="/pricing"
      />
      {/* FAQPage structured data (floor item 16). Escape `<` so no answer text
          can break out of the script element. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD).replace(/</g, '\\u003c') }}
      />

      {/* Hero */}
      <section data-route="pricing" className={`${HERO_Y} text-center`}>
        <Container>
          <div className="flex justify-center">
            <Badge tone="pass" dot>
              the CLI is free forever · MIT
            </Badge>
          </div>
          <h1 className="mx-auto mt-6 max-w-[12ch] text-[clamp(2rem,6vw,3.375rem)] font-bold leading-[1.04] tracking-[-0.035em] text-ink-hi">
            Pricing that respects open source.
          </h1>
          <p className="mx-auto mt-[18px] max-w-[560px] text-[18px] leading-[1.55] text-ink-mid">
            No per-screenshot pricing cliff. No dashboard lock-in. Run the full CLI for free, forever — and add a
            hosted layer only when your team needs one.
          </p>
        </Container>
      </section>

      {/* Tiers */}
      <section aria-label="Pricing tiers" className="pb-10">
        <Container>
          <div className="grid grid-cols-1 items-stretch gap-[18px] lg:grid-cols-3">
            {TIERS.map((tier) => (
              <TierCard key={tier.name} tier={tier} />
            ))}
          </div>
          <p className="mt-7 text-center font-mono text-[12.5px] text-ink-dim">
            The hosted platform is itself open source — every Pro and Team feature can run on your own Cloudflare
            account.
          </p>
        </Container>
      </section>

      {/* Compare plans matrix */}
      <section aria-labelledby="compare-plans" className="py-16">
        <Container width="matrix">
          <h2
            id="compare-plans"
            className="mb-8 text-center font-sans text-[30px] font-bold tracking-[-0.03em] text-ink-hi"
          >
            Compare plans
          </h2>
          <div className="border border-border-card">
            <ComparisonTable
              columns={['Capability', 'Open Source', 'Pro', 'Team']}
              highlightColumn={2}
              caption="Frontguard plan comparison: capabilities across the Open Source, Pro, and Team plans."
              rows={MATRIX}
            />
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-heading" className="border-t border-border-faint bg-surface-alt">
        <Container width="faq" className="py-[72px]">
          <h2
            id="faq-heading"
            className="mb-8 text-center font-sans text-[30px] font-bold tracking-[-0.03em] text-ink-hi"
          >
            Questions
          </h2>
          <div className="grid gap-3">
            {FAQS.map((f) => (
              <FaqItem key={f.q} question={f.q}>
                {f.a}
              </FaqItem>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA band */}
      <section aria-labelledby="pricing-cta" className="border-t border-border-faint">
        <Container className={`${BAND_Y} text-center`}>
          <h2
            id="pricing-cta"
            className="text-[clamp(2rem,5vw,2.5rem)] font-bold tracking-[-0.035em] text-ink-hi"
          >
            Start free. Upgrade if you outgrow it.
          </h2>
          <p className="mx-auto mt-4 max-w-[460px] text-[17px] leading-[1.55] text-ink-mid">
            Install the CLI and run your first visual check in two minutes — no account, no credit card.
          </p>
          <div className="mx-auto mt-8 max-w-md">
            <CopyCommand command="npm install @frontguard/cli" />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3.5">
            <Button href="/docs" size="lg">
              Get started →
            </Button>
            <Button href="/comparisons" variant="ghost" size="lg">
              See how it compares
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}

export default Component;
