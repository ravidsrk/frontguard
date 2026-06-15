# 🛡️ Frontguard

[![CI](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml/badge.svg)](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml)
[![npm: @frontguard/cli](https://img.shields.io/npm/v/@frontguard/cli?label=%40frontguard%2Fcli)](https://www.npmjs.com/package/@frontguard/cli)
[![npm: @frontguard/playwright](https://img.shields.io/npm/v/@frontguard/playwright?label=%40frontguard%2Fplaywright)](https://www.npmjs.com/package/@frontguard/playwright)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-1000+-brightgreen)]()

**AI-powered frontend visual regression testing. Detect, understand, and fix visual bugs before production.**

Backend has Datadog, Sentry, PagerDuty — a $20B+ monitoring ecosystem. Frontend gets... manual QA and hoping for the best. Frontguard changes that.

> **1000+ tests** · **multi-browser** · **AI vision analysis** · **self-hostable** · **MIT**

<p align="center">
  <img src="./demo/frontguard-demo.gif" alt="Frontguard demo: init, doctor, run, AI classification" width="720"/><br/>
  <em>📽️ Demo: <code>frontguard init</code> → <code>doctor</code> → <code>run</code> → AI classification.</em>
</p>

<!-- To re-render the demo GIF: `vhs demo/frontguard-demo.tape` (requires `brew install vhs`). -->


## Why Frontguard?

- **🧠 AI-powered analysis** — Doesn't just say "pixels differ." It classifies the change (regression vs intentional vs content update), explains *why*, and suggests a fix. This kills the #1 pain of visual testing: false positives.
- **🎯 Anti-flake rendering** — Multi-render consensus eliminates the flaky-screenshot noise that makes teams disable their visual suites.
- **🔓 Open-source & self-hostable** — CLI-first, free forever. No per-screenshot pricing cliff, no dashboard lock-in, BYO AI key.

## What It Does

```
Developer pushes code → Frontguard renders every page → Compares to baselines →
AI explains what changed and why → Suggests fixes → Posts PR comment
```

- **Detect** — Pixel diff + DOM diff catches what humans miss
- **Understand** — AI explains *why* something broke, not just "pixels differ"
- **Fix** — Verified code fixes, re-rendered to confirm they work (Phase 2)

## Quick Start

**Prerequisites:** [Node.js](https://nodejs.org/) 20+ and npm 9+

```bash
# Install
npm install @frontguard/cli

# Initialize config (auto-detects your framework, --ci adds a GitHub Action)
npx frontguard init --ci

# Verify your environment is ready
npx frontguard doctor

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
- **PR thumbnails** — Baseline/current/diff images embedded in PR comments (R2/S3/GitHub artifacts)
- **Per-route thresholds** — Strict on `/checkout`, relaxed on `/blog` — all in one config

## How Frontguard Compares

| | Frontguard | Percy | Chromatic | BackstopJS | Lost Pixel |
|---|:---:|:---:|:---:|:---:|:---:|
| Open source | ✅ | ❌ | ◐ | ✅ | ◐ (archived) |
| CLI-first | ✅ | ❌ | ❌ | ✅ | ✅ |
| **AI change classification** | ✅ | ❌ | ❌ | ❌ | ❌ |
| Anti-flake rendering | ✅ | ◐ | ◐ | ❌ | ❌ |
| Self-hostable | ✅ | ❌ | ❌ | ✅ | ◐ |
| Free tier | Forever (CLI) | Trial → $399/mo | Storybook hobby | Free | Dead |
| Actively maintained | ✅ | ✅ | ✅ | ❌ (6yr) | ❌ |

> Migrating? See the [BackstopJS](https://frontguard.dev/docs/guides/migrate-from-backstopjs) and [Lost Pixel](https://frontguard.dev/docs/guides/migrate-from-lost-pixel) guides.

## AI Classification Example

```
  ✘ /dashboard @ 375px — 2.34% changed
    🔴 AI Analysis — Regression (94% confidence)
    "The sidebar overlaps the main content on mobile. A flex-direction
     change in Dashboard.module.css:28 removed the column stacking."
    Suggested fix: restore `flex-direction: column` at the < 768px breakpoint.

  ✓ /pricing @ 1440px — 0.8% changed
    🟢 AI Analysis — Intentional (91% confidence)
    "New 'Enterprise' pricing tier added. Layout intact, content expanded."
```

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

Frontguard ships with a plugin architecture (6 lifecycle hooks) and 5 built-in plugins:

| Plugin | Description | Key Features |
|--------|-------------|--------------|
| **Figma** (`src/plugins/figma.ts`) | Design-to-code comparison | Figma API integration, design token extraction, component mapping |
| **Performance Budgets** (`src/plugins/perf-budgets.ts`) | Web Vitals & budgets | LCP/CLS/TTFB thresholds, violations correlated with the visual diff |
| **Accessibility** (`src/plugins/accessibility.ts`) | axe-core audits | WCAG checks (contrast, alt text, target size, focus, headings) in the same render pass |
| **Third-Party Scripts** (`src/plugins/third-party-scripts.ts`) | Script drift detection | Flags ad/analytics/widget origins that appear or disappear between runs |
| **Monitor** (`src/plugins/monitor.ts`) | Production visual monitoring (CLI + optional cloud scheduler) | Live-URL checks, threshold alerting, history tracking |

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
├── plugins/          # Figma, perf budgets, accessibility, third-party scripts, monitoring
└── utils/            # Redaction, logging, retry
```

Pipeline: `discover → filter → render → diff → analyze → report`

Each stage is independent with error boundaries — one page failing doesn't kill the run.

## Documentation

See [`docs/`](./docs/) for:
- [Product deep-dive](./docs/PRODUCT.md) — Architecture decisions and design rationale
- [Research](./docs/research/) — Market data, technical feasibility, competitive landscape

## Roadmap

See [ROADMAP.md](./docs/ROADMAP.md) for the full milestone history and upcoming plans.

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
