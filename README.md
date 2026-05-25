# 🛡️ Frontguard

[![CI](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml/badge.svg)](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/frontguard)](https://www.npmjs.com/package/frontguard)
[![Tests](https://img.shields.io/badge/tests-400-brightgreen)]()
[![Bundle](https://img.shields.io/badge/bundle-102KB-blue)]()

**AI-powered frontend visual regression testing. Detect, understand, and fix visual bugs before production.**

Backend has Datadog, Sentry, PagerDuty — a $20B+ monitoring ecosystem. Frontend gets... manual QA and hoping for the best. Frontguard changes that.

> **400 tests** · **27 test files** · **27 source files** · **102KB bundle** · **3 built-in plugins**

## What It Does

```
Developer pushes code → Frontguard renders every page → Compares to baselines →
AI explains what changed and why → Suggests fixes → Posts PR comment
```

- **Detect** — Pixel diff + DOM diff catches what humans miss
- **Understand** — AI explains *why* something broke, not just "pixels differ"
- **Fix** — Verified code fixes, re-rendered to confirm they work (Phase 2)

## Quick Start

**Prerequisites:** [Node.js](https://nodejs.org/) 18+ and npm 9+

```bash
# Install
npm install frontguard

# Initialize config (auto-detects your framework)
npx frontguard init

# Run visual regression tests
npx frontguard run --url http://localhost:3000

# Accept current screenshots as new baselines
npx frontguard update-baselines
```

> **Full documentation:** [frontguard.dev](https://frontguard.dev) · [`docs/`](./docs/) folder

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
import { figmaPlugin } from 'frontguard/plugins';

export default {
  // ...base config
  plugins: [
    figmaPlugin({ fileKey: 'your-figma-file-key' }),
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
- [Product deep-dive](./docs/PRODUCT.md) — Architecture decisions and design rationale
- [Research](./docs/research/) — Market data, technical feasibility, competitive landscape

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full milestone history and upcoming plans.

## Environment Variables

```bash
# AI Analysis (optional, BYOK — bring your own key, pick one)
FRONTGUARD_OPENAI_KEY=sk-...
FRONTGUARD_ANTHROPIC_KEY=...

# GitHub PR comments
GITHUB_TOKEN=ghp_...
```

> **Note:** AI keys are optional. Frontguard works without them — pixel diff and DOM diff run locally. AI analysis (classification, explanations, fix suggestions) activates only when a key is provided.

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines, development setup, and how to submit PRs.

## License

MIT
