import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { s } from '../lib/style'
import { Nav } from '../components/Nav'

export const Route = createFileRoute('/pricing')({
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
  primary: boolean
  featuresLabel: string
  features: string[]
}

const tiers: Tier[] = [
  {
    name: 'OPEN SOURCE', accent: '#8c847a', border: '#2a2622', bg: '#131210',
    price: '$0', per: '/ forever', featured: false,
    tagline: 'The full CLI. Everything you need to catch visual bugs in CI.',
    cta: 'npm install @frontguard/cli', ctaHref: '/docs', primary: false,
    featuresLabel: 'INCLUDES',
    features: ['Unlimited screenshots & routes', 'Multi-browser & multi-viewport', 'AI analysis (bring your own key)', 'AI fix generation + sandbox verification', 'Git-native baselines', 'GitHub Action + PR comments', 'All 5 plugins, self-hostable'],
  },
  {
    name: 'PRO', accent: '#e8862e', border: '#3a2a18', bg: '#15110c', featured: true,
    price: '$29', per: '/ month',
    tagline: 'A hosted dashboard and managed baselines for solo devs and small teams.',
    cta: 'Start 14-day trial', ctaHref: 'https://github.com/ravidsrk/frontguard', primary: true,
    featuresLabel: 'EVERYTHING IN OPEN SOURCE, PLUS',
    features: ['Hosted dashboard & report history', 'Managed baseline storage (R2)', 'Production monitoring scheduler', 'Slack & PagerDuty alerts', 'Cross-OS reference rendering', 'Priority support'],
  },
  {
    name: 'TEAM', accent: '#5b8def', border: '#2a2622', bg: '#131210', featured: false,
    price: "Let's talk", per: '',
    tagline: 'Multi-tenant teams, roles, approvals and SSO for organizations.',
    cta: 'Contact us', ctaHref: 'https://github.com/ravidsrk/frontguard', primary: false,
    featuresLabel: 'EVERYTHING IN PRO, PLUS',
    features: ['Teams, roles & invitations', 'Baseline approval workflows', 'Activity feed & audit log', 'Usage metering & seat billing', 'OpenTelemetry metrics export', 'SSO & dedicated support'],
  },
]

const matrix = [
  { cap: 'CLI — render, diff, report', v1: '✓', c1: YES, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'AI analysis (BYOK)', v1: '✓', c1: YES, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'AI fix generation & verification', v1: '✓', c1: YES, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'Hosted dashboard & history', v1: '—', c1: NO, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'Managed baseline storage', v1: 'Git', c1: INK, v2: 'R2', c2: AMBER, v3: 'R2', c3: AMBER },
  { cap: 'Production monitoring scheduler', v1: 'CLI', c1: INK, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'Slack / PagerDuty alerts', v1: 'Webhook', c1: INK, v2: '✓', c2: YES, v3: '✓', c3: YES },
  { cap: 'Teams, roles & approvals', v1: '—', c1: NO, v2: '—', c2: NO, v3: '✓', c3: YES },
  { cap: 'SSO & audit log', v1: '—', c1: NO, v2: '—', c2: NO, v3: '✓', c3: YES },
]

const faqs = [
  { q: 'Is the CLI really free forever?', a: 'Yes. The entire command-line tool — rendering, pixel + DOM diff, AI analysis, fix generation and verification, all five plugins — is MIT licensed and free with no limits. Paid plans only add a hosted convenience layer.' },
  { q: 'What does "bring your own key" mean for AI?', a: 'AI analysis calls OpenAI or Anthropic directly with your own API key. Frontguard never stores, proxies or logs keys, so you pay the provider at cost and nothing to us on the free tier.' },
  { q: 'Do I need the cloud platform?', a: 'No. The CLI is fully self-contained — baselines live in a Git orphan branch and reports are local files. The hosted platform is for teams that want a dashboard, approvals and scheduled monitoring; it is itself open source and self-deployable.' },
  { q: 'How is this different from per-screenshot pricing?', a: 'Tools like Percy and Chromatic charge per snapshot, so cost scales with your test suite. Frontguard charges a flat fee for hosting — your screenshot count never changes the bill.' },
  { q: 'Can I self-host the Pro and Team features?', a: 'Yes. The cloud platform runs on Cloudflare Workers + D1 + R2 and the source is in the repo. The hosted plans simply save you from operating it yourself.' },
]

function TierCta({ tier }: { tier: Tier }) {
  const ghost = "border: 1px solid #322d28; color: #f5f1ea; font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 13px; padding: 12px; text-align: center; text-decoration: none; display: block;"
  const primary = "background: #e8862e; color: #0d0c0b; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 13px; padding: 12px; text-align: center; text-decoration: none; display: block;"
  const cls = tier.primary ? 'fg-btn-primary' : 'fg-btn-ghost'
  const st = s(tier.primary ? primary : ghost)
  if (tier.ctaHref.startsWith('http')) {
    return <a href={tier.ctaHref} className={cls} style={st}>{tier.cta}</a>
  }
  return <Link to={tier.ctaHref} className={cls} style={st}>{tier.cta}</Link>
}

function Pricing() {
  const [copyLabel, setCopyLabel] = useState('copy')
  const copyInstall = () => {
    try { navigator.clipboard?.writeText('npm install @frontguard/cli') } catch { /* noop */ }
    setCopyLabel('copied ✓')
    window.setTimeout(() => setCopyLabel('copy'), 1600)
  }

  return (
    <div style={s('background: #0d0c0b; color: #b8b0a6; min-height: 100vh;')}>
      <Nav active="pricing" />

      {/* header */}
      <header style={s('max-width: 1200px; margin: 0 auto; padding: 80px 28px 48px; text-align: center;')}>
        <div style={s(`display: inline-flex; align-items: center; gap: 10px; font-family: ${MONO}; font-size: 12px; color: #4fb477; border: 1px solid #24472f; background: #0e1410; padding: 6px 12px; margin-bottom: 26px; white-space: nowrap;`)}>
          <span style={s('display: inline-block; width: 6px; height: 6px; background: #4fb477;')} />
          THE CLI IS FREE FOREVER · MIT
        </div>
        <h1 style={s('font-size: 54px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 18px;')}>Pricing that respects<br />open source.</h1>
        <p style={s('font-size: 18px; line-height: 1.55; color: #b8b0a6; margin: 0 auto; max-width: 560px;')}>No per-screenshot pricing cliff. No dashboard lock-in. Run the full CLI for free, forever — and add a hosted layer only when your team needs one.</p>
      </header>

      {/* tiers */}
      <section style={s('max-width: 1200px; margin: 0 auto; padding: 8px 28px 40px;')}>
        <div style={s('display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; align-items: stretch;')}>
          {tiers.map((t) => (
            <div key={t.name} style={s(`border: 1px solid ${t.border}; background: ${t.bg}; padding: 32px 28px; display: flex; flex-direction: column; position: relative;`)}>
              {t.featured && (
                <span style={s(`position: absolute; top: -1px; right: 24px; background: #e8862e; color: #0d0c0b; font-family: ${MONO}; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; padding: 4px 10px; white-space: nowrap;`)}>MOST POPULAR</span>
              )}
              <div style={s(`font-family: ${MONO}; font-size: 13px; color: ${t.accent}; letter-spacing: 0.04em; margin-bottom: 14px;`)}>{t.name}</div>
              <div style={s('display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px;')}>
                <span style={s('font-size: 44px; font-weight: 700; color: #f5f1ea; letter-spacing: -0.03em;')}>{t.price}</span>
                <span style={s(`font-family: ${MONO}; font-size: 13px; color: #7c746b;`)}>{t.per}</span>
              </div>
              <p style={s('font-size: 14px; line-height: 1.5; color: #8c847a; margin: 0 0 22px; min-height: 42px;')}>{t.tagline}</p>
              <TierCta tier={t} />
              <div style={s('height: 1px; background: #211e1b; margin: 24px 0;')} />
              <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; letter-spacing: 0.06em; margin-bottom: 14px;`)}>{t.featuresLabel}</div>
              <ul style={s('list-style: none; padding: 0; margin: 0; display: grid; gap: 11px;')}>
                {t.features.map((f) => (
                  <li key={f} style={s('display: flex; gap: 11px; font-size: 14px; color: #c8c0b6; line-height: 1.45;')}>
                    <span style={s(`color: ${t.accent}; font-family: ${MONO}; flex-shrink: 0;`)}>✓</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p style={s(`text-align: center; font-family: ${MONO}; font-size: 12.5px; color: #6b645c; margin: 28px 0 0;`)}>The hosted platform is itself open source — every Pro and Team feature can run on your own Cloudflare account.</p>
      </section>

      {/* compare table */}
      <section style={s('max-width: 1100px; margin: 0 auto; padding: 64px 28px;')}>
        <h2 style={s('font-size: 30px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 32px; text-align: center;')}>Compare plans</h2>
        <div style={s('border: 1px solid #2a2622;')}>
          <div style={s('display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; background: #161412; border-bottom: 1px solid #211e1b;')}>
            <div style={s(`padding: 16px 20px; font-family: ${MONO}; font-size: 11px; color: #564f48; letter-spacing: 0.04em;`)}>CAPABILITY</div>
            <div style={s(`padding: 16px 14px; text-align: center; font-family: ${MONO}; font-size: 12px; color: #8c847a;`)}>Open Source</div>
            <div style={s(`padding: 16px 14px; text-align: center; font-family: ${MONO}; font-size: 12px; color: #e8862e; font-weight: 700;`)}>Pro</div>
            <div style={s(`padding: 16px 14px; text-align: center; font-family: ${MONO}; font-size: 12px; color: #8c847a;`)}>Team</div>
          </div>
          {matrix.map((row) => (
            <div key={row.cap} style={s('display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; border-bottom: 1px solid #211e1b;')}>
              <div style={s('padding: 14px 20px; font-size: 13.5px; color: #d8d0c5;')}>{row.cap}</div>
              <div style={s(`padding: 14px; text-align: center; font-family: ${MONO}; font-size: 13px; color: ${row.c1};`)}>{row.v1}</div>
              <div style={s(`padding: 14px; text-align: center; font-family: ${MONO}; font-size: 13px; color: ${row.c2};`)}>{row.v2}</div>
              <div style={s(`padding: 14px; text-align: center; font-family: ${MONO}; font-size: 13px; color: ${row.c3};`)}>{row.v3}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={s('border-top: 1px solid #211e1b; background: #100f0e;')}>
        <div style={s('max-width: 900px; margin: 0 auto; padding: 72px 28px;')}>
          <h2 style={s('font-size: 30px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 32px; text-align: center;')}>Questions</h2>
          <div style={s('display: grid; gap: 12px;')}>
            {faqs.map((q) => (
              <div key={q.q} className="fg-faq" style={s('border: 1px solid #2a2622; background: #131210; padding: 22px 24px;')}>
                <div style={s('font-size: 16px; color: #f5f1ea; font-weight: 600; margin-bottom: 8px;')}>{q.q}</div>
                <p style={s('margin: 0; font-size: 14.5px; line-height: 1.6; color: #b8b0a6;')}>{q.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={s('border-top: 1px solid #211e1b;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 80px 28px; text-align: center;')}>
          <h2 style={s('font-size: 40px; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px;')}>Start free. Upgrade if you outgrow it.</h2>
          <p style={s('font-size: 17px; color: #b8b0a6; margin: 0 auto 32px; max-width: 460px; line-height: 1.55;')}>Install the CLI and run your first visual check in two minutes — no account, no credit card.</p>
          <div style={s('display: inline-flex; align-items: stretch; border: 1px solid #322d28; background: #161412; margin-bottom: 22px;')}>
            <span style={s(`font-family: ${MONO}; font-size: 14px; color: #e6e0d6; padding: 14px 20px;`)}><span style={s('color: #7c746b;')}>$ </span>npm install @frontguard/cli</span>
            <button onClick={copyInstall} className="fg-btn-ghost" style={s(`font-family: ${MONO}; font-size: 12px; color: #b8b0a6; background: #1f1c19; border: none; border-left: 1px solid #322d28; padding: 0 18px; cursor: pointer;`)}>{copyLabel}</button>
          </div>
          <div style={s('display: flex; gap: 14px; justify-content: center;')}>
            <Link to="/docs" className="fg-btn-primary" style={s(`background: #e8862e; color: #0d0c0b; font-family: ${MONO}; font-weight: 700; font-size: 14px; padding: 14px 26px; text-decoration: none;`)}>Get started →</Link>
            <Link to="/comparisons" className="fg-btn-ghost" style={s(`border: 1px solid #322d28; color: #f5f1ea; font-family: ${MONO}; font-weight: 500; font-size: 14px; padding: 14px 26px; text-decoration: none;`)}>See how it compares</Link>
          </div>
        </div>
      </section>

      {/* compact footer */}
      <footer style={s('border-top: 1px solid #211e1b; background: #0d0c0b;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 32px 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;')}>
          <span style={s(`font-family: ${MONO}; font-size: 12px; color: #564f48;`)}>© 2026 Frontguard · MIT License</span>
          <div style={s(`display: flex; gap: 22px; font-family: ${MONO}; font-size: 12px;`)}>
            <Link to="/docs" className="fg-link" style={s('color: #6b645c; text-decoration: none;')}>Docs</Link>
            <Link to="/changelog" className="fg-link" style={s('color: #6b645c; text-decoration: none;')}>Changelog</Link>
            <a href="https://github.com/ravidsrk/frontguard" className="fg-link" style={s('color: #6b645c; text-decoration: none;')}>GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
