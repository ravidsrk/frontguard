import { createFileRoute, Link } from '@tanstack/react-router'
import { s } from '../lib/style'
import { Nav } from '../components/Nav'

export const Route = createFileRoute('/changelog')({
  component: Changelog,
})

const MONO = "'JetBrains Mono', monospace"
const add = '#4fb477'
const chg = '#5b8def'
const sec = '#e8862e'
const test = '#c678dd'

type Item = { t: string; d: string }
type Group = { label: string; color: string; items: Item[] }
type Release = {
  version: string
  vColor: string
  date: string
  tag: string
  tagColor: string
  tagBorder: string
  tagBg: string
  title: string
  summary: string
  groups: Group[]
}

const releases: Release[] = [
  {
    version: 'Unreleased', vColor: '#e8862e', date: 'on main',
    tag: 'IN PROGRESS', tagColor: '#e8862e', tagBorder: '#3a2a18', tagBg: '#1a130b',
    title: 'Storybook, OpenTelemetry & a native Slack app',
    summary: 'The next release deepens integrations and observability — capture Storybook stories directly, export run metrics over OTLP, and post results to Slack.',
    groups: [
      { label: 'ADDED', color: add, items: [
        { t: 'Storybook integration', d: ' — a storybook config block enumerates stories from a running Storybook (8.x / 7.x) and renders each, with play()-aware capture and per-story overrides. frontguard init auto-detects .storybook.' },
        { t: 'OpenTelemetry export', d: ' — run completions emit OTLP/HTTP metrics (runs, comparisons, regressions, duration) to a configurable endpoint; runs on Cloudflare Workers.' },
        { t: 'Native Slack app', d: ' — a Hono handler with signing-secret verification, the /frontguard slash command, OAuth v2 install, and result posting.' },
        { t: 'Run-over-run perf regressions', d: ' — the perf-budgets plugin can persist each run’s metrics and flag any metric that degraded since the last run.' },
        { t: 'Accessibility-aware AI', d: ' — axe-core violations are fused into the AI prompt so the model can correlate a visual change with a known a11y issue.' },
      ] },
    ],
  },
  {
    version: '0.2.0', vColor: '#4fb477', date: '2026-06-03',
    tag: 'LATEST RELEASE', tagColor: '#4fb477', tagBorder: '#24472f', tagBg: '#0e1410',
    title: 'The "earn trust" release',
    summary: 'The core engine is joined by an AI auto-fix moat, a cloud platform, production monitoring, and a full integration surface.',
    groups: [
      { label: 'ADDED', color: add, items: [
        { t: 'frontguard doctor', d: ' — environment diagnostics for sources of non-determinism (Node, Playwright/Chromium, browsers, config, git state).' },
        { t: 'frontguard monitor', d: ' — live production URL monitoring with --once, --watch/--interval daemon polling, --history, and webhook alerts.' },
        { t: 'AI fix generation + sandbox verification', d: ' — generateFixes produces minimal CSS patches; verifyFixes applies them in a sandbox, re-renders, and re-compares against baseline.' },
        { t: 'Fix-pattern database', d: ' — a SQLite store with accept-fix / reject-fix / export-patterns; the pipeline reuses patterns accepted ≥3 times before calling the AI.' },
        { t: 'Accessibility & performance plugins', d: ' — axe-core WCAG audits and LCP/CLS/TTFB budgets, both correlated inline with the visual diff.' },
        { t: 'Cloud platform', d: ' — a Hono service with run submission, baseline approval and usage metering; Cloudflare D1 + R2 + GitHub OAuth.' },
        { t: 'Teams & billing', d: ' — multi-tenant teams with roles, invitations, approvals, an activity feed, and Stripe billing.' },
        { t: 'Integrations', d: ' — real Vercel OAuth app, Netlify Build Plugin, and a GitHub App with Check Runs.' },
      ] },
      { label: 'CHANGED', color: chg, items: [
        { t: 'Documentation site', d: ' migrated from VitePress to Fumadocs (Next.js + MDX).' },
        { t: 'Reporters', d: ' now render accessibility, performance and third-party-script sections alongside visual diffs.' },
      ] },
    ],
  },
  {
    version: '0.1.0', vColor: '#8c847a', date: '2026-01-01',
    tag: 'INITIAL RELEASE', tagColor: '#8c847a', tagBorder: '#2a2622', tagBg: '#131210',
    title: 'The core engine',
    summary: 'CLI, route discovery, multi-browser capture, pixel diffing, AI analysis, Git baselines and the plugin architecture — the foundation.',
    groups: [
      { label: 'ADDED', color: add, items: [
        { t: 'CLI', d: ' — frontguard init and run with proper flow control and exit codes.' },
        { t: 'Route discovery', d: ' — auto-crawl plus filesystem detection for Next.js, Nuxt, SvelteKit, Astro and Remix.' },
        { t: 'Multi-browser capture', d: ' — Chromium, Firefox and WebKit via Playwright.' },
        { t: 'Visual comparison', d: ' — pixel-level diffing via pixelmatch with a standardized 0–100 diff percentage.' },
        { t: 'AI analysis', d: ' — BYOK support for OpenAI and Anthropic vision models on a unified confidence scale.' },
        { t: 'Git baselines', d: ' — orphan-branch storage for baseline screenshots via worktrees.' },
        { t: 'Plugin architecture', d: ' — 6 lifecycle hooks with error isolation, plus Figma, perf-budgets and monitoring plugins.' },
      ] },
      { label: 'SECURITY', color: sec, items: [
        { t: 'Hardened by default', d: ' — shell-injection prevention, path-traversal guards, API-key redaction, and XSS-escaped HTML reports.' },
      ] },
      { label: 'TESTING', color: test, items: [
        { t: '395 tests', d: ' across 26 test files covering 27 source files — vision, crawler, Playwright, plugins, reporters, storage and E2E.' },
      ] },
    ],
  },
]

function Changelog() {
  return (
    <div style={s('background: #0d0c0b; color: #b8b0a6; min-height: 100vh;')}>
      <Nav active="changelog" />

      {/* header */}
      <header style={s('max-width: 860px; margin: 0 auto; padding: 72px 28px 36px;')}>
        <div style={s(`font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.08em; margin-bottom: 16px;`)}>// CHANGELOG</div>
        <h1 style={s('font-size: 48px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px;')}>What's new in Frontguard</h1>
        <p style={s('font-size: 17px; line-height: 1.55; color: #b8b0a6; margin: 0; max-width: 560px;')}>
          Following <a href="https://keepachangelog.com" className="fg-link" style={s('color: #e8862e; text-decoration: none;')}>Keep a Changelog</a> and semantic versioning. Every notable change, newest first.
        </p>
      </header>

      {/* timeline */}
      <section style={s('max-width: 860px; margin: 0 auto; padding: 16px 28px 100px;')}>
        {releases.map((r) => (
          <div key={r.version} style={s('display: grid; grid-template-columns: 168px 1fr; gap: 0; border-top: 1px solid #211e1b;')}>
            <div style={s('padding: 32px 24px 32px 0;')}>
              <div style={s('position: sticky; top: 88px;')}>
                <div style={s('display: inline-flex; align-items: center; gap: 8px; margin-bottom: 10px;')}>
                  <span style={s(`font-family: ${MONO}; font-size: 18px; font-weight: 700; color: ${r.vColor};`)}>{r.version}</span>
                </div>
                <span style={s(`display: inline-block; font-family: ${MONO}; font-size: 10.5px; color: ${r.tagColor}; border: 1px solid ${r.tagBorder}; background: ${r.tagBg}; padding: 3px 8px; margin-bottom: 12px;`)}>{r.tag}</span>
                <div style={s(`font-family: ${MONO}; font-size: 12px; color: #6b645c;`)}>{r.date}</div>
              </div>
            </div>
            <div style={s('padding: 32px 0 40px 32px; border-left: 1px solid #211e1b; position: relative;')}>
              <span style={s(`position: absolute; left: -5px; top: 40px; width: 9px; height: 9px; background: ${r.vColor}; border-radius: 50%;`)} />
              <h2 style={s('font-size: 24px; letter-spacing: -0.02em; font-weight: 600; color: #f5f1ea; margin: 0 0 10px;')}>{r.title}</h2>
              <p style={s('font-size: 15px; line-height: 1.6; color: #b8b0a6; margin: 0 0 24px;')}>{r.summary}</p>
              {r.groups.map((g) => (
                <div key={g.label} style={s('margin-bottom: 22px;')}>
                  <div style={s(`display: inline-flex; align-items: center; gap: 8px; font-family: ${MONO}; font-size: 11px; color: ${g.color}; letter-spacing: 0.06em; margin-bottom: 12px;`)}>
                    <span style={s(`width: 6px; height: 6px; background: ${g.color};`)} />{g.label}
                  </div>
                  <ul style={s('list-style: none; padding: 0; margin: 0; display: grid; gap: 10px;')}>
                    {g.items.map((it) => (
                      <li key={it.t} style={s('display: grid; grid-template-columns: 14px 1fr; gap: 10px; font-size: 14px; line-height: 1.55; color: #c8c0b6;')}>
                        <span style={s(`color: #564f48; font-family: ${MONO};`)}>·</span>
                        <span><strong style={s('color: #f5f1ea; font-weight: 600;')}>{it.t}</strong>{it.d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={s('border-top: 1px solid #211e1b; padding-top: 28px; text-align: center;')}>
          <a href="https://github.com/ravidsrk/frontguard/blob/main/CHANGELOG.md" className="fg-link" style={s(`font-family: ${MONO}; font-size: 13px; color: #8c847a; text-decoration: none;`)}>View full changelog on GitHub ↗</a>
        </div>
      </section>

      {/* footer */}
      <footer style={s('border-top: 1px solid #211e1b; background: #0d0c0b;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 32px 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;')}>
          <span style={s(`font-family: ${MONO}; font-size: 12px; color: #564f48;`)}>© 2026 Frontguard · MIT License</span>
          <div style={s(`display: flex; gap: 22px; font-family: ${MONO}; font-size: 12px;`)}>
            <Link to="/docs" className="fg-link" style={s('color: #6b645c; text-decoration: none;')}>Docs</Link>
            <Link to="/pricing" className="fg-link" style={s('color: #6b645c; text-decoration: none;')}>Pricing</Link>
            <a href="https://github.com/ravidsrk/frontguard" className="fg-link" style={s('color: #6b645c; text-decoration: none;')}>GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
