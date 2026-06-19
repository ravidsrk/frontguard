export type GroupKind = 'added' | 'changed' | 'security' | 'testing'

export interface ChangeEntry {
  term: string
  detail: string
}

export interface ChangeGroup {
  kind: GroupKind
  items: ChangeEntry[]
}

export interface Release {
  version: string
  statusLabel: string
  vColor: string
  tagColor: string
  tagBorder: string
  tagBg: string
  date: string
  isoDate?: string
  title: string
  summary: string
  groups: ChangeGroup[]
}

const add = '#4fb477'
const chg = '#5b8def'
const sec = '#e8862e'
const test = '#c678dd'

export const RELEASES: Release[] = [
  {
    version: 'Unreleased',
    vColor: '#e8862e',
    statusLabel: 'IN PROGRESS',
    tagColor: '#e8862e',
    tagBorder: '#3a2a18',
    tagBg: '#1a130b',
    date: 'on main',
    title: 'Storybook, OpenTelemetry & a native Slack app',
    summary:
      'The next release deepens integrations and observability — capture Storybook stories directly, export run metrics over OTLP, and post results to Slack.',
    groups: [
      {
        kind: 'added',
        items: [
          {
            term: 'Storybook integration',
            detail:
              ' — a storybook config block enumerates stories from a running Storybook (8.x / 7.x) and renders each, with play()-aware capture and per-story overrides. frontguard init auto-detects .storybook.',
          },
          {
            term: 'OpenTelemetry export',
            detail:
              ' — run completions emit OTLP/HTTP metrics (runs, comparisons, regressions, duration) to a configurable endpoint; runs on Cloudflare Workers.',
          },
          {
            term: 'Native Slack app',
            detail:
              ' — a Hono handler with signing-secret verification, the /frontguard slash command, OAuth v2 install, and result posting.',
          },
          {
            term: 'Run-over-run perf regressions',
            detail:
              ' — the perf-budgets plugin can persist each run’s metrics and flag any metric that degraded since the last run.',
          },
          {
            term: 'Accessibility-aware AI',
            detail:
              ' — axe-core violations are fused into the AI prompt so the model can correlate a visual change with a known a11y issue.',
          },
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    vColor: '#4fb477',
    statusLabel: 'LATEST RELEASE',
    tagColor: '#4fb477',
    tagBorder: '#24472f',
    tagBg: '#0e1410',
    date: '2026-06-03',
    isoDate: '2026-06-03',
    title: 'The "earn trust" release',
    summary:
      'The core engine is joined by an AI auto-fix moat, a cloud platform, production monitoring, and a full integration surface.',
    groups: [
      {
        kind: 'added',
        items: [
          {
            term: 'frontguard doctor',
            detail:
              ' — environment diagnostics for sources of non-determinism (Node, Playwright/Chromium, browsers, config, git state).',
          },
          {
            term: 'frontguard monitor',
            detail:
              ' — live production URL monitoring with --once, --watch/--interval daemon polling, --history, and webhook alerts.',
          },
          {
            term: 'AI fix generation + sandbox verification',
            detail:
              ' — generateFixes produces minimal CSS patches; verifyFixes applies them in a sandbox, re-renders, and re-compares against baseline.',
          },
          {
            term: 'Fix-pattern database',
            detail:
              ' — a SQLite store with accept-fix / reject-fix / export-patterns; the pipeline reuses patterns accepted ≥3 times before calling the AI.',
          },
          {
            term: 'Accessibility & performance plugins',
            detail:
              ' — axe-core WCAG audits and LCP/CLS/TTFB budgets, both correlated inline with the visual diff.',
          },
          {
            term: 'Cloud platform',
            detail:
              ' — a Hono service with run submission, baseline approval and usage metering; Cloudflare D1 + R2 + GitHub OAuth.',
          },
          {
            term: 'Teams & billing',
            detail:
              ' — multi-tenant teams with roles, invitations, approvals, an activity feed, and Stripe billing.',
          },
          {
            term: 'Integrations',
            detail: ' — real Vercel OAuth app, Netlify Build Plugin, and a GitHub App with Check Runs.',
          },
        ],
      },
      {
        kind: 'changed',
        items: [
          {
            term: 'Documentation site',
            detail: ' migrated from VitePress to Fumadocs (Next.js + MDX).',
          },
          {
            term: 'Reporters',
            detail:
              ' now render accessibility, performance and third-party-script sections alongside visual diffs.',
          },
        ],
      },
    ],
  },
  {
    version: '0.1.0',
    vColor: '#8c847a',
    statusLabel: 'INITIAL RELEASE',
    tagColor: '#8c847a',
    tagBorder: '#2a2622',
    tagBg: '#131210',
    date: '2026-01-01',
    isoDate: '2026-01-01',
    title: 'The core engine',
    summary:
      'CLI, route discovery, multi-browser capture, pixel diffing, AI analysis, Git baselines and the plugin architecture — the foundation.',
    groups: [
      {
        kind: 'added',
        items: [
          { term: 'CLI', detail: ' — frontguard init and run with proper flow control and exit codes.' },
          {
            term: 'Route discovery',
            detail:
              ' — auto-crawl plus filesystem detection for Next.js, Nuxt, SvelteKit, Astro and Remix.',
          },
          { term: 'Multi-browser capture', detail: ' — Chromium, Firefox and WebKit via Playwright.' },
          {
            term: 'Visual comparison',
            detail: ' — pixel-level diffing via pixelmatch with a standardized 0–100 diff percentage.',
          },
          {
            term: 'AI analysis',
            detail:
              ' — BYOK support for OpenAI and Anthropic vision models on a unified confidence scale.',
          },
          { term: 'Git baselines', detail: ' — orphan-branch storage for baseline screenshots via worktrees.' },
          {
            term: 'Plugin architecture',
            detail:
              ' — 6 lifecycle hooks with error isolation, plus Figma, perf-budgets and monitoring plugins.',
          },
        ],
      },
      {
        kind: 'security',
        items: [
          {
            term: 'Hardened by default',
            detail:
              ' — shell-injection prevention, path-traversal guards, API-key redaction, and XSS-escaped HTML reports.',
          },
        ],
      },
      {
        kind: 'testing',
        items: [
          {
            term: '395 tests',
            detail:
              ' across 26 test files covering 27 source files — vision, crawler, Playwright, plugins, reporters, storage and E2E.',
          },
        ],
      },
    ],
  },
]

export const GROUP_COLORS: Record<GroupKind, string> = {
  added: add,
  changed: chg,
  security: sec,
  testing: test,
}

export const GROUP_LABELS: Record<GroupKind, string> = {
  added: 'ADDED',
  changed: 'CHANGED',
  security: 'SECURITY',
  testing: 'TESTING',
}