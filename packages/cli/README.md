# 🛡️ Frontguard

[![CI](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml/badge.svg)](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@frontguard/cli)](https://www.npmjs.com/package/@frontguard/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-44_files-brightgreen)](https://github.com/ravidsrk/frontguard/tree/main/packages/cli/test)

**AI-powered frontend visual regression testing. Detect, understand, and fix visual bugs before production.**

Backend has Datadog, Sentry, PagerDuty — a $20B+ monitoring ecosystem. Frontend gets... manual QA and hoping for the best. Frontguard changes that.

> **44 test files** · **multi-browser** · **AI vision analysis** · **self-hostable** · **MIT**
>
> _Numbers are derived from source by [`scripts/stats.ts`](https://github.com/ravidsrk/frontguard/blob/main/scripts/stats.ts); see [`scripts/stats.json`](https://github.com/ravidsrk/frontguard/blob/main/scripts/stats.json) for the canonical snapshot._

## Install

The npm package is **`@frontguard/cli`**; the command it installs is **`frontguard`**.

```bash
npm install -D @frontguard/cli
```

Or run it without installing — note `npx` needs the package name (`-p @frontguard/cli`) because the bin (`frontguard`) differs from the package:

```bash
npx -p @frontguard/cli frontguard run --url http://localhost:3000
```

## What's New in 0.2.0

The "earn trust" release. The core engine is joined by an AI auto-fix moat, a cloud platform, production monitoring, and a full integration surface:

- **AI fix generation + sandbox verification** — `--generate-fixes` produces minimal CSS patches; `--verify-fixes` applies them in a sandbox (local or Daytona), re-renders, and re-compares against baseline.
- **Fix-pattern database** — `accept-fix` / `reject-fix` / `export-patterns` train and share a local pattern store that the pipeline reuses before calling the AI.
- **`frontguard doctor`** — environment diagnostics for sources of non-determinism (Node, Playwright/Chromium, browsers, config, git).
- **`frontguard monitor`** — live production-URL monitoring with daemon polling, history, and webhook alerts.
- **Accessibility + performance-budget plugins** — axe-core WCAG audits and LCP/CLS/TTFB budgets in the same render pass, correlated with the visual diff.
- **PR thumbnail grid + cloud platform** — before/after/diff thumbnails backed by R2/S3/GitHub-artifact uploads, plus a self-hostable cloud API and integrations.

See the [full CHANGELOG](https://github.com/ravidsrk/frontguard/blob/main/CHANGELOG.md) and the [AI-accuracy validation results](https://github.com/ravidsrk/frontguard/tree/main/validation) for the complete picture.

## What It Does

```
Developer pushes code → Frontguard renders every page → Compares to baselines →
AI explains what changed and why → Suggests fixes → Posts PR comment
```

- **Detect** — Pixel diff + DOM diff catches what humans miss
- **Understand** — AI explains _why_ something broke, not just "pixels differ"
- **Fix** — Verified code fixes, re-rendered to confirm they actually work

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

Once `@frontguard/cli` is installed as a dependency, the `frontguard` bin is on your `PATH` and you can drop the `npx -p @frontguard/cli` prefix (e.g. `frontguard run`).

## Commands

| Command                              | Description                                                              |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `frontguard run`                     | Run visual regression tests (default command)                            |
| `frontguard init [--ci] [--yes]`     | Generate a starter config; `--ci` also writes a GitHub Actions workflow  |
| `frontguard doctor`                  | Diagnose environment readiness (Node, Playwright, browsers, config, git) |
| `frontguard update-baselines`        | Accept current screenshots as new baselines                              |
| `frontguard monitor`                 | Monitor live production URLs for visual regressions                      |
| `frontguard accept-fix <id>`         | Mark a suggested fix as accepted (improves future suggestions)           |
| `frontguard reject-fix <id>`         | Mark a suggested fix as rejected (negative training signal)              |
| `frontguard export-patterns`         | Export the local fix-pattern database as JSON                            |
| `frontguard plugin install <name>`   | Install a Frontguard plugin from npm                                     |
| `frontguard plugin uninstall <name>` | Uninstall a Frontguard plugin                                            |
| `frontguard plugin list`             | List installed plugins                                                   |

## Features

- **Zero-config route discovery** — Auto-crawls your app to find all pages
- **Multi-browser** — Chromium, Firefox, WebKit via Playwright
- **AI-powered analysis** — BYOK (OpenAI/Anthropic) classifies regressions vs intentional changes
- **AI fix-verify** — Generates CSS patches and re-renders to confirm they fix the diff
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
  baseUrl: "http://localhost:3000",

  // Auto-discover routes (zero config)
  discover: {
    startUrl: "/",
    maxDepth: 3,
    exclude: ["/admin/*", "/api/*"],
  },

  // Or explicit routes
  // routes: ['/', '/pricing', '/checkout'],

  viewports: [375, 768, 1440],
  browsers: ["chromium"],
  threshold: 0.1,

  // AI analysis (optional, BYOK)
  ai: {
    provider: "openai",
    model: "gpt-4o",
  },

  // Ignore dynamic content
  ignore: [{ selector: ".dynamic-timestamp" }],
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
 frontguard v0.2.2

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

| Plugin                                                         | Description                                                   | Key Features                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Figma** (`src/plugins/figma.ts`)                             | Design-to-code comparison                                     | Figma API integration, design token extraction, component mapping                      |
| **Performance Budgets** (`src/plugins/perf-budgets.ts`)        | Web Vitals & budgets                                          | LCP/CLS/TTFB thresholds, violations correlated with the visual diff                    |
| **Accessibility** (`src/plugins/accessibility.ts`)             | axe-core audits                                               | WCAG checks (contrast, alt text, target size, focus, headings) in the same render pass |
| **Third-Party Scripts** (`src/plugins/third-party-scripts.ts`) | Script drift detection                                        | Flags ad/analytics/widget origins that appear or disappear between runs                |
| **Monitor** (`src/plugins/monitor.ts`)                         | Production visual monitoring (CLI + optional cloud scheduler) | Live-URL checks, threshold alerting, history tracking                                  |

**Plugin lifecycle hooks:** `beforeDiscover`, `afterDiscover`, `afterRender`, `afterCompare`, `afterRun`, `onError`

```typescript
// frontguard.config.ts
import { createFigmaPlugin } from "@frontguard/cli/plugins";

export default {
  // ...base config
  plugins: [createFigmaPlugin({ fileKey: "your-figma-file-key" })],
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

## Environment Variables

```bash
# AI Analysis (optional, BYOK — pick one)
FRONTGUARD_OPENAI_KEY=sk-...
FRONTGUARD_ANTHROPIC_KEY=...

# GitHub PR comments
GITHUB_TOKEN=ghp_...
```

> AI keys are optional. Frontguard works without them — pixel diff and DOM diff run locally. AI analysis (classification, explanations, fix suggestions) activates only when a key is provided.

## Documentation

Full documentation lives at [frontguard.dev/docs](https://frontguard.dev/docs). Source and issues: [github.com/ravidsrk/frontguard](https://github.com/ravidsrk/frontguard).

## License

MIT
