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
    title: '0.2.3 (RC) — Fail-closed pipeline & production hardening',
    summary:
      'Release candidate 0.2.3 hardens the comparison pipeline to fail closed, enforces read-only baseline checks, keeps AI classifications advisory, and closes route-discovery, plugin, and Cloud API schema gaps.',
    groups: [
      {
        kind: 'changed',
        items: [
          {
            term: 'Fail-closed pipeline & read-only baselines',
            detail:
              ' — empty comparisons, render/storage/AI errors, rejected judge calls, and diverged CI baselines fail closed; baseline writes require explicit update mode.',
          },
          {
            term: 'Deterministic AI pass/fail contract',
            detail:
              ' — AI classifications and fix suggestions are advisory annotations and never silently downgrade failing pixel diffs.',
          },
          {
            term: 'Framework route discovery & Storybook 8 cache',
            detail:
              ' — Next.js App Router route groups/parallel slots, Remix _index routes, and Storybook 8 static parameter caches are resolved accurately.',
          },
          {
            term: 'Plugin, Git worktree & Cloud API hardening',
            detail:
              ' — Perf Budgets DOM script injection, Figma buffer cleanup, batch Git orphan baseline commits, D1 schema/migration sync, and webhook/SSRF guards.',
          },
        ],
      },
      {
        kind: 'security',
        items: [
          {
            term: 'HTTP security headers & supply-chain updates',
            detail:
              ' — strict CSP/HSTS/frame-ancestors headers on frontguard.dev, monitor SSRF validation, and updated transitive dependencies.',
          },
        ],
      },
    ],
  },
  {
    version: '0.2.2',
    vColor: '#4fb477',
    statusLabel: 'LATEST RELEASE',
    tagColor: '#4fb477',
    tagBorder: '#24472f',
    tagBg: '#0e1410',
    date: '2026-06-21',
    isoDate: '2026-06-21',
    title: 'Config loader & package metadata alignment',
    summary:
      'Preserves optional dependencies in the published CLI config loader and aligns README and release metadata across all five published npm packages.',
    groups: [
      {
        kind: 'changed',
        items: [
          {
            term: 'CLI config loader dependencies',
            detail:
              ' — keeps optional TypeScript/ESM config loader dependencies intact in the published @frontguard/cli tarball.',
          },
          {
            term: 'Workspace package READMEs & version sync',
            detail:
              ' — ships workspace-local READMEs and closes release metadata drift across @frontguard/cli, @frontguard/playwright, @frontguard/mcp, create-frontguard-plugin, and @frontguard/netlify-plugin.',
          },
        ],
      },
    ],
  },
  {
    version: '0.2.1',
    vColor: '#5b8def',
    statusLabel: 'PATCH RELEASE',
    tagColor: '#5b8def',
    tagBorder: '#1f3256',
    tagBg: '#0d1320',
    date: '2026-06-20',
    isoDate: '2026-06-20',
    title: 'Production-close remediation',
    summary:
      'Republishes the five public npm packages with config loader, MCP stdio, Storybook 8.6, supply-chain, SSRF, and documentation fixes.',
    groups: [
      {
        kind: 'changed',
        items: [
          {
            term: 'CLI config loader & telemetry opt-out precedence',
            detail:
              ' — resolves .ts/.js/.mjs/.cjs configs cleanly and ensures environment opt-outs override telemetry.enabled.',
          },
          {
            term: 'MCP server & Storybook 8.6 readiness',
            detail:
              ' — realpath-safe MCP entry guard with clean stdio JSON-RPC output, and Storybook 8.6 finished-phase parameter discovery.',
          },
          {
            term: 'Netlify plugin & canonical install docs',
            detail:
              ' — inspects real cloud-api status values and standardizes scoped @frontguard/cli commands across docs.',
          },
        ],
      },
      {
        kind: 'security',
        items: [
          {
            term: 'Supply-chain & Slack SSRF guards',
            detail:
              ' — migrated to @daytona/sdk, cleared high/critical audit findings, and added SSRF validation on Slack slash-command URLs.',
          },
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    vColor: '#8c847a',
    statusLabel: 'MINOR RELEASE',
    tagColor: '#8c847a',
    tagBorder: '#2a2622',
    tagBg: '#131210',
    date: '2026-06-17',
    isoDate: '2026-06-17',
    title: 'The "earn trust" release',
    summary:
      'The core engine is joined by an AI auto-fix moat, a cloud platform, production monitoring, and a full integration surface.',
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
            term: 'Fix-pattern database (reuse patterns accepted ≥3 times)',
            detail:
              ' — a SQLite store with accept-fix / reject-fix / export-patterns; the pipeline reuses patterns accepted ≥3 times before calling the AI.',
          },
          {
            term: 'Accessibility & performance plugins',
            detail:
              ' — axe-core WCAG audits and LCP/CLS/TTFB budgets, both correlated inline with the visual diff.',
          },
          {
            term: 'Cloud platform (Hono, D1+R2+GitHub OAuth)',
            detail:
              ' — a Hono service with run submission, baseline approval and usage metering; Cloudflare D1 + R2 + GitHub OAuth.',
          },
          {
            term: 'Teams & billing (Stripe)',
            detail:
              ' — multi-tenant teams with roles, invitations, approvals, an activity feed, and Stripe billing.',
          },
          {
            term: 'Integrations (Vercel OAuth, Netlify Build Plugin, GitHub App)',
            detail: ' — real Vercel OAuth app, Netlify Build Plugin, and a GitHub App with Check Runs.',
          },
        ],
      },
      {
        kind: 'changed',
        items: [
          {
            term: 'docs migrated VitePress → Fumadocs',
            detail: '',
          },
          {
            term: 'reporters render a11y/perf/3rd-party sections',
            detail: '',
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
            term: 'route discovery',
            detail:
              ' — auto-crawl plus filesystem detection for Next.js, Nuxt, SvelteKit, Astro and Remix.',
          },
          { term: 'multi-browser capture', detail: ' — Chromium, Firefox and WebKit via Playwright.' },
          {
            term: 'pixelmatch diffing (0–100%)',
            detail: ' — pixel-level diffing via pixelmatch with a standardized 0–100 diff percentage.',
          },
          {
            term: 'AI analysis (BYOK)',
            detail:
              ' — BYOK support for OpenAI and Anthropic vision models on a unified confidence scale.',
          },
          {
            term: 'Git baselines (orphan branch)',
            detail: ' — orphan-branch storage for baseline screenshots via worktrees.',
          },
          {
            term: 'plugin architecture (6 hooks + Figma/perf/monitor)',
            detail:
              ' — 6 lifecycle hooks with error isolation, plus Figma, perf-budgets and monitoring plugins.',
          },
        ],
      },
      {
        kind: 'security',
        items: [
          {
            term: 'hardened by default',
            detail:
              ' — shell-injection prevention, path-traversal guards, API-key redaction, and XSS-escaped HTML reports.',
          },
        ],
      },
      {
        kind: 'testing',
        items: [
          {
            term: '395 tests across 26 test files',
            detail:
              ' covering 27 source files — vision, crawler, Playwright, plugins, reporters, storage and E2E.',
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