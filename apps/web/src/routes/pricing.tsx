import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Footer } from '../components/Footer'
import { Nav } from '../components/Nav'
import { s } from '../lib/style'
import { buildSeoHead } from '../lib/seo'

export const Route = createFileRoute('/pricing')({
  head: () => ({
    ...buildSeoHead({
      title: 'Pricing — Frontguard',
      description:
        'The CLI is free forever under MIT. Pro hosted cloud at $29/mo. No per-screenshot pricing cliff, no dashboard lock-in.',
      path: '/pricing',
    }),
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(FAQ_JSONLD).replace(/</g, '\\u003c'),
      },
    ],
  }),
  component: Pricing,
})

const MONO = "'JetBrains Mono', monospace"
const YES = '#4fb477'
const NO = '#564f48'
const AMBER = '#e8862e'
const INK = '#d8d0c5'

type Tier = {
  name: string
  accent: string
  border: string
  bg: string
  price: string
  per: string
  featured: boolean
  tagline: string
  cta: string
  ctaHref: string
  external: boolean
  featuresLabel: string
  features: string[]
}

const tiers: Tier[] = [
  {
    name: 'OPEN SOURCE',
    accent: '#8c847a',
    border: '#2a2622',
    bg: '#131210',
    price: '$0',
    per: '/ forever',
    featured: false,
    tagline: 'The full CLI. Everything you need to catch visual bugs in CI.',
    cta: 'npm install @frontguard/cli',
    ctaHref: '/#install',
    external: false,
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
    accent: '#e8862e',
    border: '#3a2a18',
    bg: '#15110c',
    price: '$29',
    per: '/ month',
    featured: true,
    tagline: 'A hosted dashboard and managed baselines for solo devs and small teams.',
    cta: 'Start 14-day trial',
    ctaHref: 'https://app.frontguard.dev/signup',
    external: true,
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
    accent: '#5b8def',
    border: '#2a2622',
    bg: '#131210',
    price: "Let's talk",
    per: '',
    featured: false,
    tagline: 'Multi-tenant teams, roles, approvals and SSO for organizations.',
    cta: 'Contact us',
    ctaHref: 'mailto:hello@frontguard.dev?subject=Enterprise%20Frontguard',
    external: true,
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
]

const matrix = [
  { cap: 'CLI — render, diff, report', v1: '✓', c1: YES, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'AI analysis (BYOK)', v1: '✓', c1: YES, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'AI fix generation & verification', v1: '✓', c1: YES, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'Hosted dashboard & history', v1: '—', c1: NO, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'Managed baseline storage', v1: 'Git', c1: INK, v2: 'R2', c2: AMBER, v3: 'R2', c3: AMBER },
  { cap: 'Production monitoring scheduler', v1: 'CLI', c1: INK, v2: '—', c2: NO, v3: '✓', c3: YES },
  { cap: 'Slack / PagerDuty alerts', v1: 'Webhook', c1: INK, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'Teams, roles & approvals', v1: '—', c1: NO, v2: '—', c2: NO, v3: '✓', c3: YES },
  { cap: 'SSO & audit log', v1: '—', c1: NO, v2: '—', c2: NO, v3: '✓', c3: YES },
]

const faqs = [
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
]

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

function TierCta({ tier }: { tier: Tier }) {
  const ghost =
    "border: 1px solid #322d28; color: #f5f1ea; font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 13px; padding: 12px; text-align: center; text-decoration: none; display: block;"
  const primary =
    "background: #e8862e; color: #0d0c0b; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 13px; padding: 12px; text-align: center; text-decoration: none; display: block;"
  const cls = tier.featured ? 'fg-btn-primary' : 'fg-btn-ghost'
  const st = s(tier.featured ? primary : ghost)
  if (tier.external) {
    return (
      <a
        href={tier.ctaHref}
        className={cls}
        style={st}
        target="_blank"
        rel="noopener noreferrer"
      >
        {tier.cta}
      </a>
    )
  }
  return (
    <Link to={tier.ctaHref} className={cls} style={st}>
      {tier.cta}
    </Link>
  )
}

function Pricing() {
  const [copyLabel, setCopyLabel] = useState('copy')
  const copyInstall = () => {
    try {
      navigator.clipboard?.writeText('npm install @frontguard/cli')
    } catch {
      /* noop */
    }
    setCopyLabel('copied ✓')
    window.setTimeout(() => setCopyLabel('copy'), 1600)
  }

  return (
    <div style={s('background: #0d0c0b; color: #b8b0a6; min-height: 100vh;')}>
      <Nav active="pricing" />

      <header style={s('max-width: 1200px; margin: 0 auto; padding: 80px 28px 48px; text-align: center;')}>
        <div
          style={s(
            `display: inline-flex; align-items: center; gap: 10px; font-family: ${MONO}; font-size: 12px; color: #4fb477; border: 1px solid #24472f; background: #0e1410; padding: 6px 12px; margin-bottom: 26px; white-space: nowrap;`,
          )}
        >
          <span style={s('display: inline-block; width: 6px; height: 6px; background: #4fb477;')} />
          THE CLI IS FREE FOREVER · MIT
        </div>
        <h1
          style={s(
            'font-size: 54px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 18px;',
          )}
        >
          Pricing that respects
          <br />
          open source.
        </h1>
        <p
          style={s(
            'font-size: 18px; line-height: 1.55; color: #b8b0a6; margin: 0 auto; max-width: 560px;',
          )}
        >
          No per-screenshot pricing cliff. No dashboard lock-in. Run the full CLI for free,
          forever — and add a hosted layer only when your team needs one.
        </p>
      </header>

      <section style={s('max-width: 1200px; margin: 0 auto; padding: 8px 28px 40px;')}>
        <div
          style={s(
            'display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; align-items: stretch;',
          )}
        >
          {tiers.map((t) => (
            <div
              key={t.name}
              data-testid="pricing-tier"
              style={s(
                `border: 1px solid ${t.border}; background: ${t.bg}; padding: 32px 28px; display: flex; flex-direction: column; position: relative;`,
              )}
            >
              {t.featured && (
                <span
                  style={s(
                    `position: absolute; top: -1px; right: 24px; background: #e8862e; color: #0d0c0b; font-family: ${MONO}; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; padding: 4px 10px; white-space: nowrap;`,
                  )}
                >
                  MOST POPULAR
                </span>
              )}
              <div
                style={s(
                  `font-family: ${MONO}; font-size: 13px; color: ${t.accent}; letter-spacing: 0.04em; margin-bottom: 14px;`,
                )}
              >
                {t.name}
              </div>
              <div style={s('display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px;')}>
                <span
                  data-testid="tier-price"
                  style={s(
                    'font-size: 44px; font-weight: 700; color: #f5f1ea; letter-spacing: -0.03em;',
                  )}
                >
                  {t.price}
                </span>
                <span style={s(`font-family: ${MONO}; font-size: 13px; color: #7c746b;`)}>
                  {t.per}
                </span>
              </div>
              <p
                style={s(
                  'font-size: 14px; line-height: 1.5; color: #8c847a; margin: 0 0 22px; min-height: 42px;',
                )}
              >
                {t.tagline}
              </p>
              <TierCta tier={t} />
              <div style={s('height: 1px; background: #211e1b; margin: 24px 0;')} />
              <div
                style={s(
                  `font-family: ${MONO}; font-size: 11px; color: #564f48; letter-spacing: 0.06em; margin-bottom: 14px;`,
                )}
              >
                {t.featuresLabel}
              </div>
              <ul style={s('list-style: none; padding: 0; margin: 0; display: grid; gap: 11px;')}>
                {t.features.map((f) => (
                  <li
                    key={f}
                    style={s(
                      'display: flex; gap: 11px; font-size: 14px; color: #c8c0b6; line-height: 1.45;',
                    )}
                  >
                    <span style={s(`color: ${t.accent}; font-family: ${MONO}; flex-shrink: 0;`)}>
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p
          style={s(
            `text-align: center; font-family: ${MONO}; font-size: 12.5px; color: #6b645c; margin: 28px 0 0;`,
          )}
        >
          The hosted platform is itself open source — every Pro and Team feature can run on your
          own Cloudflare account.
        </p>
      </section>

      <section style={s('max-width: 1100px; margin: 0 auto; padding: 64px 28px;')}>
        <h2
          style={s(
            'font-size: 30px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 32px; text-align: center;',
          )}
        >
          Compare plans
        </h2>
        <div style={s('border: 1px solid #2a2622;')} data-testid="compare-matrix">
          <div
            style={s(
              'display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; background: #161412; border-bottom: 1px solid #211e1b;',
            )}
          >
            <div
              style={s(
                `padding: 16px 20px; font-family: ${MONO}; font-size: 11px; color: #564f48; letter-spacing: 0.04em;`,
              )}
            >
              CAPABILITY
            </div>
            <div
              style={s(
                `padding: 16px 14px; text-align: center; font-family: ${MONO}; font-size: 12px; color: #8c847a;`,
              )}
            >
              Open Source
            </div>
            <div
              style={s(
                `padding: 16px 14px; text-align: center; font-family: ${MONO}; font-size: 12px; color: #e8862e; font-weight: 700;`,
              )}
            >
              Pro
            </div>
            <div
              style={s(
                `padding: 16px 14px; text-align: center; font-family: ${MONO}; font-size: 12px; color: #8c847a;`,
              )}
            >
              Team
            </div>
          </div>
          {matrix.map((row) => (
            <div
              key={row.cap}
              data-testid="matrix-row"
              style={s(
                'display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; border-bottom: 1px solid #211e1b;',
              )}
            >
              <div style={s('padding: 14px 20px; font-size: 13.5px; color: #d8d0c5;')}>
                {row.cap}
              </div>
              <div
                style={s(
                  `padding: 14px; text-align: center; font-family: ${MONO}; font-size: 13px; color: ${row.c1};`,
                )}
              >
                {row.v1}
              </div>
              <div
                style={s(
                  `padding: 14px; text-align: center; font-family: ${MONO}; font-size: 13px; color: ${row.c2};`,
                )}
              >
                {row.v2}
              </div>
              <div
                style={s(
                  `padding: 14px; text-align: center; font-family: ${MONO}; font-size: 13px; color: ${row.c3};`,
                )}
              >
                {row.v3}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={s('border-top: 1px solid #211e1b; background: #100f0e;')}>
        <div style={s('max-width: 900px; margin: 0 auto; padding: 72px 28px;')}>
          <h2
            style={s(
              'font-size: 30px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 32px; text-align: center;',
            )}
          >
            Questions
          </h2>
          <div style={s('display: grid; gap: 12px;')}>
            {faqs.map((item) => (
              <details
                key={item.q}
                className="fg-faq"
                style={s('border: 1px solid #2a2622; background: #131210; padding: 22px 24px;')}
              >
                <summary
                  style={s(
                    'font-size: 16px; color: #f5f1ea; font-weight: 600; margin-bottom: 8px; cursor: pointer;',
                  )}
                >
                  {item.q}
                </summary>
                <p style={s('margin: 8px 0 0; font-size: 14.5px; line-height: 1.6; color: #b8b0a6;')}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section style={s('border-top: 1px solid #211e1b;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 80px 28px; text-align: center;')}>
          <h2
            style={s(
              'font-size: 40px; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px;',
            )}
          >
            Start free. Upgrade if you outgrow it.
          </h2>
          <p
            style={s(
              'font-size: 17px; color: #b8b0a6; margin: 0 auto 32px; max-width: 460px; line-height: 1.55;',
            )}
          >
            Install the CLI and run your first visual check in two minutes — no account, no credit
            card.
          </p>
          <div
            style={s(
              'display: inline-flex; align-items: stretch; border: 1px solid #322d28; background: #161412; margin-bottom: 22px;',
            )}
          >
            <span style={s(`font-family: ${MONO}; font-size: 14px; color: #e6e0d6; padding: 14px 20px;`)}>
              <span style={s('color: #7c746b;')}>$ </span>npm install @frontguard/cli
            </span>
            <button
              type="button"
              onClick={copyInstall}
              aria-label="Copy command: npm install @frontguard/cli"
              className="fg-btn-ghost"
              style={s(
                `font-family: ${MONO}; font-size: 12px; color: #b8b0a6; background: #1f1c19; border: none; border-left: 1px solid #322d28; padding: 0 18px; cursor: pointer;`,
              )}
            >
              {copyLabel}
            </button>
          </div>
          <div style={s('display: flex; gap: 14px; justify-content: center;')}>
            <a
              href="/docs"
              className="fg-btn-primary"
              style={s(
                `background: #e8862e; color: #0d0c0b; font-family: ${MONO}; font-weight: 700; font-size: 14px; padding: 14px 26px; text-decoration: none;`,
              )}
            >
              Get started →
            </a>
            <Link
              to="/comparisons"
              className="fg-btn-ghost"
              style={s(
                `border: 1px solid #322d28; color: #f5f1ea; font-family: ${MONO}; font-weight: 500; font-size: 14px; padding: 14px 26px; text-decoration: none;`,
              )}
            >
              See how it compares
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}