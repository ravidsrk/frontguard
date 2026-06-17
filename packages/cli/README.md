# 🛡️ Frontguard

[![CI](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml/badge.svg)](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@frontguard/cli)](https://www.npmjs.com/package/@frontguard/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-395-brightgreen)]()

**AI-powered frontend visual regression testing. Detect, understand, and fix visual bugs before production.**

Backend has Datadog, Sentry, PagerDuty — a $20B+ monitoring ecosystem. Frontend gets... manual QA and hoping for the best. Frontguard changes that.

> **395 tests** · **26 test files** · **27 source files** · **142KB bundle** · **3 built-in plugins**

## What It Does

```
Developer pushes code → Frontguard renders every page → Compares to baselines →
AI explains what changed and why → Suggests fixes → Posts PR comment
```

- **Detect** — Pixel diff + DOM diff catches what humans miss
- **Understand** — AI explains *why* something broke, not just "pixels differ"
- **Fix** — Verified code fixes, re-rendered to confirm they work (Phase 2)

## Quick Start

```bash
# Initialize config (auto-detects your framework; --ci adds a GitHub Action)
npx -p @frontguard/cli frontguard init --ci

# Verify your environment (Node, Playwright, browsers, git, config)
npx -p @frontguard/cli frontguard doctor

# Run visual regression tests
npx -p @frontguard/cli frontguard run --url http://localhost:3000

# Accept current screenshots as new baselines
npx -p @frontguard/cli frontguard update-baselines
```

## Commands

| Command | Description |
|---------|-------------|
| `frontguard run` | Run visual regression tests (default command) |
| `frontguard init [--ci] [--yes]` | Generate config, optionally a GitHub Actions workflow |
| `frontguard doctor` | Diagnose environment readiness |
| `frontguard update-baselines` | Accept current screenshots as new baselines |

## Features

- **Zero-config route discovery** — Auto-crawls your app to find all pages
- **Multi-browser** — Chromium, Firefox, WebKit via Playwright
- **AI-powered analysis** — BYOK (OpenAI/Anthropic) classifies regressions vs intentional changes
- **Smart rendering** — Dependency graph renders only pages affected by your changes
- **Preview deployments** — Auto-detects Vercel/Netlify preview URLs
- **Git-native baselines** — Stored in orphan branch, zero main branch bloat
- **Framework detection** — Next.js, Remix, SvelteKit, Nuxt, Astro out of the box
- **Security hardened** — Shell injection prevention, path traversal guards, API key redaction
- **Memory managed** — Streaming buffers, temp file cleanup, bounded concurrency

## Configuration

```typescript
// frontguard.config.ts
export default {
  version: 1,
  baseUrl: 'http://localhost:3000',

  // Auto-discover routes (zero config)
  discover: {
    startUrl: '/',
    maxDepth: 3,
    exclude: ['/admin/*', '/api/*'],
  },

  // Or explicit routes
  // routes: ['/', '/pricing', '/checkout'],

  viewports: [375, 768, 1440],
  browsers: ['chromium'],
  threshold: 0.1,

  // AI analysis (optional, BYOK)
  ai: {
    provider: 'openai',
    model: 'gpt-4o',
  },

  // Ignore dynamic content
  ignore: [
    { selector: '.dynamic-timestamp' },
  ],
};
```

## How It Works

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  ROUTE DISCOVERY │───▶│  RENDER PAGES    │───▶│  PIXEL DIFF     │
│  Crawl / Config  │    │  Playwright ×    │    │  pixelmatch     │
│  / Filesystem    │    │  viewports ×     │    │  fast gate      │
│                  │    │  browsers        │    │  (90% pass here)│
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │ changed
                                                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  PR COMMENT     │◀───│  AI ANALYSIS     │◀───│  DOM DIFF       │
│  Visual diffs   │    │  GPT-4V / Claude │    │  Structural +   │
│  Explanation    │    │  Classify +      │    │  computed styles │
│  Fix suggestion │    │  explain + fix   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## CLI Output

```
 frontguard v0.1.0

 🔍 Discovering routes... found 47 routes
 📊 12/47 routes affected by changed files
 🖥  Rendering 12 routes × 3 viewports

 ───────────────────────────────────────────
  RESULTS                        12 routes
 ───────────────────────────────────────────
  ✓ /                375  768  1440   PASS
  ✓ /pricing         375  768  1440   PASS
  ⚠ /checkout        375  768  1440   WARNING
  ✘ /dashboard       375  768  1440   REGRESSION
  ★ /settings        375  768  1440   NEW
 ───────────────────────────────────────────

  ✘ /dashboard @ 375px
    AI: "Sidebar overlaps main content on mobile.
         flex-direction change in Dashboard.module.css:28"
    Severity: 🔴 Critical (confidence: 94%)

  1 regression · 1 warning · 9 passed · 1 new
```

## Plugins

Frontguard ships with a plugin architecture (6 lifecycle hooks) and 3 built-in plugins:

| Plugin | Description | Key Features |
|--------|-------------|--------------|
| **Figma** (`src/plugins/figma.ts`) | Design-to-code comparison | Figma API integration, design token extraction, component mapping |
| **Performance Budgets** (`src/plugins/perf-budgets.ts`) | Bundle size & Web Vitals | LCP/FID/CLS thresholds, budget violation reporting |
| **Monitor** (`src/plugins/monitor.ts`) | Production visual monitoring | Uptime checks, latency tracking, alerting thresholds |

**Plugin lifecycle hooks:** `beforeDiscover`, `afterDiscover`, `afterRender`, `afterCompare`, `afterRun`, `onError`

```typescript
// frontguard.config.ts
import { createFigmaPlugin } from '@frontguard/cli/plugins';

export default {
  // ...base config
  plugins: [
    createFigmaPlugin({ fileKey: 'your-figma-file-key' }),
  ],
};
```

## Architecture

```
src/
├── cli/              # CLI entry point (Commander.js)
├── core/             # Pipeline orchestrator, types, config, plugin system
├── discovery/        # Route discovery (crawler + filesystem)
├── render/           # Playwright rendering engine
├── diff/             # Pixel diff + AI vision analysis
├── storage/          # Git orphan branch baselines
├── report/           # Console, JSON, HTML, GitHub PR reporters
├── plugins/          # Figma, perf budgets, monitoring
└── utils/            # Redaction, logging, retry
```

Pipeline: `discover → filter → render → diff → analyze → report`

Each stage is independent with error boundaries — one page failing doesn't kill the run.

## Documentation

See [`docs/`](./docs/) for:
- [Product deep-dive](./docs/PRODUCT.md) — Architecture, business model, competitive analysis
- [Research](./docs/research/) — Market data, technical feasibility, competitive landscape
- [CEO Review](./docs/archive/reviews/) — Founder-mode review with 50+ failure modes mapped

## Validating AI Accuracy

Frontguard's value depends on AI vision models correctly classifying visual changes. Two validation scripts are included:

**Synthetic validation** (`scripts/validate-ai.ts`) — 10 programmatic before/after screenshot pairs with known ground truth:

```bash
export FRONTGUARD_OPENAI_KEY=sk-...
npx tsx scripts/validate-ai.ts
```

**Real-world validation** (`scripts/validate-ai-real.ts`) — validates against actual GitHub PRs with full rendering pipeline (clone → framework detect → install deps → dev server → Playwright capture → pixel diff → AI analysis):

```bash
npx tsx scripts/validate-ai-real.ts --repo shadcn-ui/ui --pr 1234
npx tsx scripts/validate-ai-real.ts --batch ground-truth/cases.json
```

Results are saved to `validation-results/` as JSON for tracking accuracy over time.

## Roadmap

- **M1** ✅ Core rendering + pixel diff + CLI
- **M2** ✅ Dependency graph for smart rendering
- **M3** ✅ GitHub Action + preview deployment integration
- **M4** ✅ AI analysis + validation framework
- **M5** ✅ Plugin system + documentation site + npm prep
- **Next** 🔲 Real-world AI validation, npm publish, beta testers

## Environment Variables

```bash
# AI Analysis (BYOK — pick one)
FRONTGUARD_OPENAI_KEY=sk-...
FRONTGUARD_ANTHROPIC_KEY=...

# GitHub PR comments
GITHUB_TOKEN=ghp_...
```

## License

MIT
