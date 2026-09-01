# 🛡️ Frontguard

[![CI](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml/badge.svg)](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@frontguard/cli)](https://www.npmjs.com/package/@frontguard/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Local visual regression testing with reviewed git baselines, inspectable reports, and optional model-assisted analysis.**

Frontguard runs without a hosted account and keeps the deterministic comparison path in your repository and CI environment.

> **multi-browser** · **optional AI analysis** · **local-first** · **MIT**
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

## Current CLI Scope

The supported path is the local CLI. Hosted cloud, MCP, GitHub App, and Docker Compose onboarding remain pre-release:

- **Experimental AI fixes** — `--generate-fixes` and `--verify-fixes` are separate opt-ins; unverified suggestions remain labeled for review.
- **Fix-pattern database** — `accept-fix` / `reject-fix` / `export-patterns` train and share a local pattern store that the pipeline reuses before calling the AI.
- **`frontguard doctor`** — environment diagnostics for sources of non-determinism (Node, Playwright/Chromium, browsers, config, git).
- **`frontguard monitor`** — live production-URL monitoring with daemon polling, history, and webhook alerts.
- **Accessibility + performance-budget plugins** — axe-core WCAG audits and LCP/CLS/TTFB budgets in the same render pass, correlated with the visual diff.
- **Inspectable artifacts** — HTML reports retain baseline/current/diff images; remote thumbnails require an explicit image-upload backend.

See the [full CHANGELOG](https://github.com/ravidsrk/frontguard/blob/main/CHANGELOG.md) and the [validation results](https://github.com/ravidsrk/frontguard/tree/main/validation). The published run used AI-disabled local comparisons and is not an AI-accuracy or cross-OS benchmark.

## What It Does

```
Developer runs Frontguard → Pages render → Pixels compare to reviewed baselines →
Console, JSON, and HTML evidence are written → Optional AI assists with changed screenshots
```

- **Detect** — Pixel comparison finds changes above the configured threshold
- **Understand** — Optional AI returns a confidence-scored explanation for human review
- **Fix** — Experimental CSS suggestions and sandbox verification are separate opt-ins

## Quick Start

```bash
# Frontguard terminal: initialize and check the environment
npx -p @frontguard/cli frontguard init --ci
npx -p @frontguard/cli frontguard doctor
```

**App terminal (leave this running):** use your project's dev-server command (for example, the command below) and wait for the `baseUrl` generated in `frontguard.config.ts` to respond.

```bash
npm run dev
```

**Frontguard terminal:** review the running app, then capture baselines and compare using the generated config.

```bash
npx -p @frontguard/cli frontguard update-baselines
git push origin frontguard-baselines
npx -p @frontguard/cli frontguard run
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
- **Experimental AI fix verification** — Suggested CSS patches are re-rendered only when `verifyFixes` is enabled; reports label the result verified or unverified
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
  threshold: 0.1, // changed-pixel ratio: 0.1 = 10%

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
ROUTE DISCOVERY → PLAYWRIGHT RENDER → PIXEL COMPARISON → CONSOLE / JSON / HTML
                                                └──────→ OPTIONAL BYOK AI ANALYSIS
```

## CLI Output

```
 frontguard v0.2.3

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
    AI: "At 375px, the current screenshot shows the sidebar overlapping
         the main content; the baseline keeps both regions separate."
    Guidance: Review responsive stacking for this viewport.
    Severity: 🔴 Critical (confidence: 94%)

  1 regression · 1 warning · 9 passed · 1 new
```

## Plugins

Frontguard ships with a plugin architecture (9 lifecycle hooks) and 5 built-in plugins:

| Plugin                                                         | Description                                                   | Key Features                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Figma** (`src/plugins/figma.ts`)                             | Design-to-code comparison                                     | Figma API integration, design token extraction, component mapping                      |
| **Performance Budgets** (`src/plugins/perf-budgets.ts`)        | Web Vitals & budgets                                          | LCP/CLS/TTFB thresholds, violations correlated with the visual diff                    |
| **Accessibility** (`src/plugins/accessibility.ts`)             | axe-core audits                                               | WCAG checks (contrast, alt text, target size, focus, headings) in the same render pass |
| **Third-Party Scripts** (`src/plugins/third-party-scripts.ts`) | Script drift detection                                        | Flags ad/analytics/widget origins that appear or disappear between runs                |
| **Monitor** (`src/plugins/monitor.ts`)                         | Production visual monitoring (CLI + optional cloud scheduler) | Live-URL checks, threshold alerting, history tracking                                  |

**Plugin lifecycle hooks:** `setup`, `beforeDiscover`, `afterDiscover`, `beforeRender`, `afterRender`, `afterCompare`, `afterRun`, `onError`, `teardown`

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

```

> AI keys are optional. Frontguard works without them using local pixel comparison. AI analysis activates only when configured and sends screenshot evidence directly to the selected provider.

## Documentation

Full documentation lives at [frontguard.dev/docs](https://frontguard.dev/docs). Source and issues: [github.com/ravidsrk/frontguard](https://github.com/ravidsrk/frontguard).

## License

MIT
