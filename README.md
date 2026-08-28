# 🛡️ Frontguard

[![CI](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml/badge.svg)](https://github.com/ravidsrk/frontguard/actions/workflows/ci.yml)
[![npm: @frontguard/cli](https://img.shields.io/npm/v/@frontguard/cli?label=%40frontguard%2Fcli)](https://www.npmjs.com/package/@frontguard/cli)
[![npm: @frontguard/playwright](https://img.shields.io/npm/v/@frontguard/playwright?label=%40frontguard%2Fplaywright)](https://www.npmjs.com/package/@frontguard/playwright)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-44_files-brightgreen)](./packages/cli/test)

**AI-powered frontend visual regression testing for web teams — detect, understand, and fix visual bugs before they ship to production.**

Backend has Datadog, Sentry, PagerDuty — a $20B+ monitoring ecosystem. Frontend gets... manual QA and hoping for the best. Frontguard changes that.

> **44 test files** · **multi-browser** · **AI vision analysis** · **self-hostable** · **MIT**
>
> _Numbers above are derived from source by [`scripts/stats.ts`](./scripts/stats.ts) (regenerated on every `npm run stats`). See [`scripts/stats.json`](./scripts/stats.json) for the canonical snapshot._

<p align="center">
  <img src="./demo/frontguard-demo.gif" alt="Frontguard demo: init, doctor, run, AI classification" width="720"/><br/>
  <em>📽️ Demo: <code>frontguard init</code> → <code>doctor</code> → <code>run</code> → AI classification.</em>
</p>

<!-- To re-render the demo GIF: `vhs demo/frontguard-demo.tape` (requires `brew install vhs`). -->

> ### 🚀 0.2.0 is live
>
> Five packages just shipped to npm: [`@frontguard/cli`](https://www.npmjs.com/package/@frontguard/cli), [`@frontguard/playwright`](https://www.npmjs.com/package/@frontguard/playwright), [`@frontguard/mcp`](https://www.npmjs.com/package/@frontguard/mcp), [`@frontguard/netlify-plugin`](https://www.npmjs.com/package/@frontguard/netlify-plugin), [`create-frontguard-plugin`](https://www.npmjs.com/package/create-frontguard-plugin). Full release notes in [CHANGELOG.md](./CHANGELOG.md#020---2026-06-17); go/no-go in [`docs/launch-readiness.md`](./docs/launch-readiness.md); first validation run results in [`validation/results-v0.2.md`](./validation/results-v0.2.md) (**0.0% pixel-only false positives** on 43 recheck routes).

## Built in the open

Every line of Frontguard is MIT-licensed and lives in this repo. The CLI, the AI vision pipeline, the cloud-api (Cloudflare Workers + D1 + R2), the four integrations (Slack / GitHub / Vercel / Netlify), the MCP server, the Dockerised cross-OS renderer, and the self-host docker-compose are all here. The 21 PRs that built v0.2.0 are all on `main` — you can read the [adversarial review](./docs/adversarial-review.md) we audited the prior state against, the [competitive research](./docs/research.md) that anchored the boundary, and the [product-completion plan](./docs/product-completion-plan.md) that defined what "complete" meant. Nothing is hidden behind a "request a demo."

If you'd rather not run your own AI keys, the cloud is opt-in. If you'd rather not use the cloud, the CLI is free forever. If you'd rather run the whole stack on your own machines, the [self-host guide](https://frontguard.dev/docs/self-host) is the recipe.

## Why Frontguard?

- **🧠 AI-powered analysis** — Doesn't just say "pixels differ." It classifies the change (regression vs intentional vs content update), explains *why*, and suggests a fix. This kills the #1 pain of visual testing: false positives.
- **🎯 Anti-flake rendering** — Multi-render consensus eliminates the flaky-screenshot noise that makes teams disable their visual suites.
- **🤖 In-IDE agents via MCP** — [`@frontguard/mcp`](https://www.npmjs.com/package/@frontguard/mcp) exposes "what regressed on this PR" and "give me the suggested fix for diff N" to Claude Code / Cursor / Copilot.
- **🐳 Cross-OS byte-equivalent baselines** — pinned Docker renderer so a fix that closes the diff on macOS closes it on Linux CI too. No more 428-day flake debugging.
- **🔓 Open-source & self-hostable** — CLI-first, free forever. No per-screenshot pricing cliff, no dashboard lock-in, BYO AI key. The [self-host guide](https://frontguard.dev/docs/self-host) is a one-command recipe.

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
npx -p @frontguard/cli frontguard init --ci

# Verify your environment is ready
npx -p @frontguard/cli frontguard doctor

# Run visual regression tests
npx -p @frontguard/cli frontguard run --url http://localhost:3000

# Accept current screenshots as new baselines
npx -p @frontguard/cli frontguard update-baselines
```

> **Full documentation:** [frontguard.dev/docs](https://frontguard.dev/docs) · internal notes in [`docs/`](./docs/)

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

| | Frontguard | Percy | Chromatic | BackstopJS | Lost Pixel | Argos |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Open source | ✅ MIT | ❌ | ◐ | ✅ | ◐ (read-only) | ✅ MIT |
| CLI-first | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **AI change classification** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| AI fix verification | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Anti-flake rendering | ✅ | ◐ | ◐ | ❌ | ❌ | ◐ |
| Self-hostable | ✅ | ❌ | ❌ | ✅ | ◐ | 🟡 |
| Free tier | Forever (CLI) | Trial → $399/mo | Storybook hobby | Free | Sunset | Hobby + unlimited Playwright traces |
| Pro entry | $29/mo (optional) | ~$399/mo | $179/mo | n/a | n/a | $100/mo |
| Actively maintained | ✅ | ✅ | ✅ | ❌ (low activity) | ❌ (Figma acqui-hire 2026-04-22) | ✅ |

> Migrating? See the [BackstopJS](https://frontguard.dev/docs/guides/migrate-from-backstopjs), [Lost Pixel](https://frontguard.dev/docs/guides/migrate-from-lost-pixel), and [Argos](https://frontguard.dev/docs/comparisons/frontguard-vs-argos) guides. Comparisons: [Percy](https://frontguard.dev/docs/comparisons/frontguard-vs-percy) · [Chromatic](https://frontguard.dev/docs/comparisons/frontguard-vs-chromatic) · [Argos](https://frontguard.dev/docs/comparisons/frontguard-vs-argos).

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
 frontguard

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
| **Figma** (`packages/cli/src/plugins/figma.ts`) | Design-to-code comparison | Figma API integration, design token extraction, component mapping |
| **Performance Budgets** (`packages/cli/src/plugins/perf-budgets.ts`) | Web Vitals & budgets | LCP/CLS/TTFB thresholds, violations correlated with the visual diff |
| **Accessibility** (`packages/cli/src/plugins/accessibility.ts`) | axe-core audits | WCAG checks (contrast, alt text, target size, focus, headings) in the same render pass |
| **Third-Party Scripts** (`packages/cli/src/plugins/third-party-scripts.ts`) | Script drift detection | Flags ad/analytics/widget origins that appear or disappear between runs |
| **Monitor** (`packages/cli/src/plugins/monitor.ts`) | Production visual monitoring (CLI + optional cloud scheduler) | Live-URL checks, threshold alerting, history tracking |

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
packages/
├── cli/src/          # @frontguard/cli — discover → render → diff → report
│   ├── cli/          # Commander entry
│   ├── core/         # Pipeline orchestrator, types, config, plugin system
│   ├── discovery/    # Route discovery (crawler + filesystem)
│   ├── render/       # Playwright rendering engine
│   ├── diff/         # Pixel diff + AI vision analysis
│   ├── storage/      # Git orphan branch baselines
│   ├── report/       # Console, JSON, HTML, GitHub PR reporters
│   ├── plugins/      # Figma, perf budgets, a11y, third-party, monitor
│   └── utils/        # Redaction, logging, retry
├── playwright/       # @frontguard/playwright
├── mcp/              # @frontguard/mcp
├── cloud-api/        # Cloudflare Workers + D1 + R2
└── create-frontguard-plugin/
apps/
├── web/              # docs site
└── demo/
integrations/
├── github-app/
├── vercel/
├── netlify/
└── slack-app/
```

Pipeline: `discover → filter → render → diff → analyze → report`

Each stage is independent with error boundaries — one page failing doesn't kill the run.

## Documentation

See [`docs/`](./docs/) for:
- [Product deep-dive](./docs/PRODUCT.md) — Architecture decisions and design rationale
- [Launch readiness (v0.2.0)](./docs/launch-readiness.md) — Go/no-go for the 2026-06-17 release, 20-PR punch list, residual risks
- [Adversarial review](./docs/adversarial-review.md) — The audit we held v0.2.0 to
- [Product-completion plan](./docs/product-completion-plan.md) — The frozen IN / ROADMAP / FIX boundary
- [Research](./docs/research.md) — Mid-2026 competitive landscape (16 competitors fetched live)
- [Validation results](./validation/results-v0.2.md) — Real harness run, real numbers

## Roadmap

See [ROADMAP.md](./docs/ROADMAP.md) for the full milestone history and upcoming plans.

## Releasing

The release flow is documented and reproducible — no hidden steps.

1. Tag a version: `git tag -a v0.X.Y -m "..."` and `git push origin v0.X.Y`.
2. [`.github/workflows/release.yml`](./.github/workflows/release.yml) runs on the tag push: `scripts/release.sh --dry-run` first as a sanity check, then real publish with `NPM_TOKEN` from repo secrets (provenance signing in CI). Marketplace submissions emit as a workflow summary.
3. [`scripts/release.sh`](./scripts/release.sh) is the single source of truth. Run it locally with `--dry-run` for any audit — `npm pack --dry-run` per package, manifest checks, no state mutated.

Idempotent: already-published versions are skipped automatically. Scoped packages are forced `public` after publish so org defaults can't silently restrict them.

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
